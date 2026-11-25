const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 10000;

const required = ["DATABASE_URL", "JWT_SECRET", "ADMIN_API_KEY"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(key + " tsy voapetraka ao amin'ny Render");
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100
}));

const networks = [
  "T.BEP20 - USD",
  "T.TRC20 - USD",
  "BNB",
  "TRX",
  "S.BEP20 - USD",
  "T.POLYGON - USD",
  "T.ETH - USD",
  "S.POLYGON - USD",
  "S.ETH - USD",
  "ETH",
  "POLYGON",
  "ETH - PYUSD"
];

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(150) NOT NULL,
      pays VARCHAR(80) NOT NULL,
      numero VARCHAR(40) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      withdrawal_hash TEXT NOT NULL,
      balance NUMERIC(14,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id SERIAL PRIMARY KEY,
      member_id INTEGER REFERENCES members(id),
      method VARCHAR(100) NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      reference VARCHAR(200) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      member_id INTEGER REFERENCES members(id),
      method VARCHAR(100) NOT NULL,
      address VARCHAR(200) NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id SERIAL PRIMARY KEY,
      member_id INTEGER REFERENCES members(id),
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_wallets (
      id SERIAL PRIMARY KEY,
      network VARCHAR(100) UNIQUE NOT NULL,
      address TEXT DEFAULT '',
      active BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      member_id INTEGER,
      action VARCHAR(100) NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS demo_games (
      id SERIAL PRIMARY KEY,
      member_id INTEGER REFERENCES members(id),
      game VARCHAR(100) NOT NULL,
      points NUMERIC(14,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  for (const network of networks) {
    await pool.query(
      `INSERT INTO admin_wallets (network)
       VALUES ($1)
       ON CONFLICT (network) DO NOTHING`,
      [network]
    );
  }

  console.log("Database ready");
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        message: "Mila miditra aloha ianao."
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      `SELECT id, nom, pays, numero, balance
       FROM members WHERE id = $1`,
      [decoded.id]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        message: "Kaonty tsy hita."
      });
    }

    req.user = result.rows[0];
    next();
  } catch {
    res.status(401).json({
      message: "Session tsy manan-kery."
    });
  }
}

function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];

  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      message: "Accès administrateur refusé."
    });
  }

  next();
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/status", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      platform: "MADA MLALAO INTERNA",
      database: "connected"
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Database connection failed"
    });
  }
});

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const {
      nom, pays, numero, password,
      confirmPassword, withdrawalPassword
    } = req.body;

    if (!nom || !pays || !numero || !password ||
        !confirmPassword || !withdrawalPassword) {
      return res.status(400).json({
        message: "Fenoy daholo ny saha rehetra."
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        message: "Tsy mitovy ny tenimiafina."
      });
    }

    if (password.length < 8 || withdrawalPassword.length < 8) {
      return res.status(400).json({
        message: "8 caractères farafahakeliny."
      });
    }

    const hash = await bcrypt.hash(password, 12);
    const withdrawalHash = await bcrypt.hash(withdrawalPassword, 12);

    const result = await pool.query(
      `INSERT INTO members
       (nom, pays, numero, password_hash, withdrawal_hash)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, nom, pays, numero, balance`,
      [nom.trim(), pays.trim(), numero.trim(), hash, withdrawalHash]
    );

    const user = result.rows[0];

    res.status(201).json({
      ok: true,
      message: "Vita ny inscription. Afaka miditra ianao.",
      user
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Efa misy kaonty amin'io numéro io."
      });
    }

    console.error(error);
    res.status(500).json({
      message: "Erreur inscription."
    });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { numero, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM members WHERE numero=$1",
      [String(numero || "").trim()]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        message: "Numéro na mot de passe diso."
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password || "",
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        message: "Numéro na mot de passe diso."
      });
    }

    const token = makeToken(user);

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        nom: user.nom,
        pays: user.pays,
        numero: user.numero,
        balance: user.balance
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Erreur connexion."
    });
  }
});

// MEMBER INFORMATION
app.get("/api/me", auth, async (req, res) => {
  res.json({
    ok: true,
    user: req.user,
    solde: req.user.balance,
    balance: req.user.balance
  });
});

// WALLET ADDRESSES AVAILABLE FOR MEMBERS
app.get("/api/wallets", auth, async (req, res) => {
  const result = await pool.query(
    `SELECT network, address
     FROM admin_wallets
     WHERE active=TRUE AND address <> ''
     ORDER BY id`
  );

  res.json({ wallets: result.rows });
});

// DEPOSIT REQUEST
app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { method, montant, reference } = req.body;
    const amount = Number(montant);

    if (!method || !reference ||
        !Number.isFinite(amount) || amount < 1) {
      return res.status(400).json({
        message: "Données dépôt invalides. Minimum 1 USD."
      });
    }

    const wallet = await pool.query(
      `SELECT id FROM admin_wallets
       WHERE network=$1 AND active=TRUE AND address <> ''`,
      [method]
    );

    if (!wallet.rowCount) {
      return res.status(400).json({
        message: "Wallet tsy mbola disponible."
      });
    }

    await pool.query(
      `INSERT INTO deposits
       (member_id, method, amount, reference)
       VALUES ($1,$2,$3,$4)`,
      [req.user.id, method, amount, reference]
    );

    res.json({
      ok: true,
      message: "Voaray ny fangatahana dépôt. Miandry validation Admin."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Erreur dépôt."
    });
  }
});

// WITHDRAW REQUEST
app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const {
      method, address, montant, withdrawalPassword
    } = req.body;

    const amount = Number(montant);

    if (!method || !address || !withdrawalPassword ||
        !Number.isFinite(amount) || amount < 5) {
      return res.status(400).json({
        message: "Minimum retrait 5 USD."
      });
    }

    const member = await pool.query(
      "SELECT withdrawal_hash, balance FROM members WHERE id=$1",
      [req.user.id]
    );

    const valid = await bcrypt.compare(
      withdrawalPassword,
      member.rows[0].withdrawal_hash
    );

    if (!valid) {
      return res.status(401).json({
        message: "Mot de passe retrait incorrect."
      });
    }

    if (Number(member.rows[0].balance) < amount) {
      return res.status(400).json({
        message: "Solde insuffisant."
      });
    }

    await pool.query(
      `INSERT INTO withdrawals
       (member_id, method, address, amount)
       VALUES ($1,$2,$3,$4)`,
      [req.user.id, method, address, amount]
    );

    res.json({
      ok: true,
      message: "Voaray ny demande retrait. Miandry Admin."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Erreur retrait."
    });
  }
});

// SUPPORT
app.post("/api/support", auth, async (req, res) => {
  const message = String(req.body.message || "").trim();

  if (!message || message.length > 2000) {
    return res.status(400).json({
      message: "Hafatra tsy mety."
    });
  }

  await pool.query(
    `INSERT INTO support_messages (member_id,message)
     VALUES ($1,$2)`,
    [req.user.id, message]
  );

  res.json({
    ok: true,
    message: "Voaray ny hafatra."
  });
});

// HISTORY
app.get("/api/history", auth, async (req, res) => {
  const result = await pool.query(
    `SELECT 'Dépôt' AS type, amount, status, created_at AS date
     FROM deposits WHERE member_id=$1

     UNION ALL

     SELECT 'Retrait' AS type, amount, status, created_at AS date
     FROM withdrawals WHERE member_id=$1

     ORDER BY date DESC LIMIT 100`,
    [req.user.id]
  );

  res.json({
    ok: true,
    history: result.rows
  });
});

// DEMO GAME ONLY
app.post("/api/games/open", auth, async (req, res) => {
  const { game } = req.body;

  const allowed = ["LUCKY LOTO", "CARD", "RAMI", "LUDO"];

  if (!allowed.includes(game)) {
    return res.status(400).json({
      message: "Jeu non reconnu."
    });
  }

  res.status(403).json({
    message: "Mode jeu avec argent réel désactivé. Démonstration uniquement."
  });
});

// ADMIN: MEMBERS
app.get("/api/admin/members", adminAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, nom, pays, numero, balance, created_at
     FROM members ORDER BY id DESC`
  );

  res.json({ members: result.rows });
});

// ADMIN: DEPOSITS
app.get("/api/admin/deposits", adminAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT d.*, m.nom, m.numero
     FROM deposits d
     JOIN members m ON m.id=d.member_id
     ORDER BY d.id DESC`
  );

  res.json({ deposits: result.rows });
});

// ADMIN: WITHDRAWALS
app.get("/api/admin/withdrawals", adminAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT w.*, m.nom, m.numero
     FROM withdrawals w
     JOIN members m ON m.id=w.member_id
     ORDER BY w.id DESC`
  );

  res.json({ withdrawals: result.rows });
});

// ADMIN: WALLETS
app.get("/api/admin/wallets", adminAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM admin_wallets ORDER BY id"
  );

  res.json({ wallets: result.rows });
});

// ADMIN: UPDATE WALLET
app.put("/api/admin/wallets/:id", adminAuth, async (req, res) => {
  const { address, active } = req.body;

  const result = await pool.query(
    `UPDATE admin_wallets
     SET address=$1, active=$2, updated_at=NOW()
     WHERE id=$3 RETURNING *`,
    [String(address || "").trim(), Boolean(active), req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      message: "Wallet tsy hita."
    });
  }

  res.json({
    ok: true,
    wallet: result.rows[0]
  });
});

// ADMIN: APPROVE OR REJECT DEPOSIT
app.post("/api/admin/deposits/:id/review", adminAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { decision } = req.body;

    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({
        message: "Décision invalide."
      });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `SELECT * FROM deposits
       WHERE id=$1 FOR UPDATE`,
      [req.params.id]
    );

    if (!result.rowCount || result.rows[0].status !== "pending") {
      throw new Error("Dépôt introuvable ou déjà traité.");
    }

    const deposit = result.rows[0];

    if (decision === "approve") {
      await client.query(
        `UPDATE members
         SET balance=balance+$1 WHERE id=$2`,
        [deposit.amount, deposit.member_id]
      );
    }

    await client.query(
      `UPDATE deposits SET status=$1 WHERE id=$2`,
      [decision === "approve" ? "approved" : "rejected", deposit.id]
    );

    await client.query(
      `INSERT INTO audit_logs (member_id,action,details)
       VALUES ($1,$2,$3)`,
      [deposit.member_id, "deposit_review", decision]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      message: "Dépôt traité."
    });

  } catch (error) {
    await client.query("ROLLBACK");
    res.status(400).json({
      message: error.message
    });
  } finally {
    client.release();
  }
});

// ADMIN: APPROVE OR REJECT WITHDRAWAL
app.post("/api/admin/withdrawals/:id/review", adminAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { decision } = req.body;

    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({
        message: "Décision invalide."
      });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `SELECT * FROM withdrawals
       WHERE id=$1 FOR UPDATE`,
      [req.params.id]
    );

    if (!result.rowCount || result.rows[0].status !== "pending") {
      throw new Error("Retrait introuvable ou déjà traité.");
    }

    const withdrawal = result.rows[0];

    if (decision === "approve") {
      const debit = await client.query(
        `UPDATE members
         SET balance=balance-$1
         WHERE id=$2 AND balance >= $1`,
        [withdrawal.amount, withdrawal.member_id]
      );

      if (!debit.rowCount) {
        throw new Error("Solde insuffisant.");
      }
    }

    await client.query(
      `UPDATE withdrawals SET status=$1 WHERE id=$2`,
      [decision === "approve" ? "approved" : "rejected", withdrawal.id]
    );

    await client.query(
      `INSERT INTO audit_logs (member_id,action,details)
       VALUES ($1,$2,$3)`,
      [withdrawal.member_id, "withdrawal_review", decision]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      message: "Retrait traité. Vérifier le paiement manuel."
    });

  } catch (error) {
    await client.query("ROLLBACK");
    res.status(400).json({
      message: error.message
    });
  } finally {
    client.release();
  }
});

// ADMIN: SUPPORT MESSAGES
app.get("/api/admin/support", adminAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT s.*, m.nom, m.numero
     FROM support_messages s
     JOIN members m ON m.id=s.member_id
     ORDER BY s.id DESC`
  );

  res.json({ messages: result.rows });
});

// START SERVER
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log("MADA MLALAO INTERNA ONLINE - PORT " + PORT);
    });
  })
  .catch(error => {
    console.error("DATABASE ERROR:", error);
    process.exit(1);
  });
