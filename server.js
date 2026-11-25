const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 10000;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL tsy voapetraka ao amin'ny Render");
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET tsy voapetraka ao amin'ny Render");
}

if (!process.env.ADMIN_API_KEY) {
  throw new Error("ADMIN_API_KEY tsy voapetraka ao amin'ny Render");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100
});

app.use("/api/", limiter);

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
      : null;

    if (!token) {
      return res.status(401).json({
        ok: false,
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
        ok: false,
        message: "Kaonty tsy hita."
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: "Session tsy manan-kery."
    });
  }
}

function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];

  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      ok: false,
      message: "Tsy nahazo alalana."
    });
  }

  next();
}

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(150) NOT NULL,
      pays VARCHAR(80) NOT NULL,
      numero VARCHAR(40) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      withdrawal_hash TEXT NOT NULL,
      balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id SERIAL PRIMARY KEY,
      member_id INTEGER REFERENCES members(id),
      method VARCHAR(100) NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      reference VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      member_id INTEGER REFERENCES members(id),
      method VARCHAR(100) NOT NULL,
      address VARCHAR(200) NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id SERIAL PRIMARY KEY,
      member_id INTEGER REFERENCES members(id),
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      member_id INTEGER,
      action VARCHAR(100) NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
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

// INSCRIPTION
app.post("/api/register", async (req, res) => {
  try {
    const {
      nom, pays, numero, password,
      confirmPassword, withdrawalPassword
    } = req.body;

    if (!nom || !pays || !numero || !password ||
        !confirmPassword || !withdrawalPassword) {
      return res.status(400).json({
        ok: false,
        message: "Fenoy daholo ny saha rehetra."
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        ok: false,
        message: "Tsy mitovy ny mot de passe."
      });
    }

    if (password.length < 8 || withdrawalPassword.length < 6) {
      return res.status(400).json({
        ok: false,
        message: "Mot de passe: 8 caractères farafahakeliny; retrait: 6."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const withdrawalHash = await bcrypt.hash(withdrawalPassword, 12);

    const result = await pool.query(
      `INSERT INTO members
       (nom, pays, numero, password_hash, withdrawal_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nom, pays, numero, balance`,
      [
        nom.trim(),
        pays.trim(),
        numero.trim(),
        passwordHash,
        withdrawalHash
      ]
    );

    const user = result.rows[0];

    res.status(201).json({
      ok: true,
      message: "Vita ny inscription.",
      token: makeToken(user),
      user
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "Efa misy kaonty mampiasa io numéro io."
      });
    }

    console.error(error);
    res.status(500).json({
      ok: false,
      message: "Tsy tontosa ny inscription."
    });
  }
});

// CONNEXION
app.post("/api/login", async (req, res) => {
  try {
    const { numero, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM members WHERE numero = $1",
      [String(numero || "").trim()]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        ok: false,
        message: "Numéro na mot de passe diso."
      });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(
      password ||
