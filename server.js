const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 10000;

// --- ENV - RAHA TSY MISY DIA MANAO DEFAUT HO AZY - TSY MIBLOQUER ---
const JWT_SECRET = process.env.JWT_SECRET || "MADA-MLALAO-2026-SECRET-XYZ-123";
const ADMIN_KEY = process.env.ADMIN_API_KEY || "ADMIN-MADA-2026-KEY-456";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL tsy hita - jereo Render Env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

// --- MISOKATRA @ RACINE - TSY MILA public/ ---
app.use(express.static(__dirname));

app.use("/api/", rateLimit({ windowMs: 15*60*1000, limit: 200 }));

const networks = ["T.BEP20 - USD","T.TRC20 - USD","BNB","TRX","S.BEP20 - USD","T.POLYGON - USD","T.ETH - USD","S.POLYGON - USD","S.ETH - USD","ETH","POLYGON","ETH - PYUSD","🇲🇬 Yas - Paul","🇲🇬 Airtel - Jean Romario","🇲🇬 Orange - Jean Romario"];

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (id SERIAL PRIMARY KEY, nom VARCHAR(150) NOT NULL, pays VARCHAR(80) DEFAULT 'Madagascar', numero VARCHAR(40) UNIQUE NOT NULL, password_hash TEXT NOT NULL, withdrawal_hash TEXT NOT NULL, balance NUMERIC(14,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS deposits (id SERIAL PRIMARY KEY, member_id INTEGER REFERENCES members(id), method VARCHAR(100) NOT NULL, amount NUMERIC(14,2) NOT NULL, reference VARCHAR(200) NOT NULL, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS withdrawals (id SERIAL PRIMARY KEY, member_id INTEGER REFERENCES members(id), method VARCHAR(100) NOT NULL, address VARCHAR(200) NOT NULL, amount NUMERIC(14,2) NOT NULL, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS support_messages (id SERIAL PRIMARY KEY, member_id INTEGER REFERENCES members(id), message TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS admin_wallets (id SERIAL PRIMARY KEY, network VARCHAR(100) UNIQUE NOT NULL, address TEXT DEFAULT '', active BOOLEAN DEFAULT TRUE, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, member_id INTEGER, action VARCHAR(100) NOT NULL, details TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS wallet (id SERIAL PRIMARY KEY, jeu TEXT, fond NUMERIC, commission NUMERIC, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS demo_games (id SERIAL PRIMARY KEY, member_id INTEGER REFERENCES members(id), game VARCHAR(100) NOT NULL, points NUMERIC(14,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
  `);
  for (const n of networks) {
    await pool.query(`INSERT INTO admin_wallets (network) VALUES ($1) ON CONFLICT (network) DO NOTHING`, [n]);
  }
  console.log("Database ready");
}

function makeToken(user){ return jwt.sign({id:user.id}, JWT_SECRET, {expiresIn:"7d"}); }

async function auth(req,res,next){
  try{
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if(!token) return res.status(401).json({message:"Mila miditra aloha"});
    const d = jwt.verify(token, JWT_SECRET);
    const r = await pool.query(`SELECT id,nom,pays,numero,balance FROM members WHERE id=$1`, [d.id]);
    if(!r.rowCount) return res.status(401).json({message:"Kaonty tsy hita"});
    req.user = r.rows[0]; next();
  }catch{ res.status(401).json({message:"Session tsy manan-kery"}); }
}

function adminAuth(req,res,next){
  const key = req.headers["x-admin-key"];
  if(!key || key !== ADMIN_KEY) return res.status(403).json({message:"Accès admin refusé"});
  next();
}

app.get("/", (req,res)=> res.sendFile(path.join(__dirname,"index.html")));
app.get("/api/status", async (req,res)=>{
  try{ await pool.query("SELECT 1"); res.json({ok:true, platform:"MADA MLALAO INTERNA", database:"connected"}); }
  catch{ res.status(500).json({ok:false, message:"DB failed"}); }
});

// REGISTER
app.post("/api/register", async (req,res)=>{
  try{
    const {nom,pays,numero,password,confirmPassword,withdrawalPassword} = req.body;
    if(!nom||!numero||!password||!confirmPassword||!withdrawalPassword) return res.status(400).json({message:"Fenoy daholo"});
    if(password!==confirmPassword) return res.status(400).json({message:"Tsy mitovy ny tenimiafina"});
    if(password.length<4) return res.status(400).json({message:"4 caractères min"});
    const hash = await bcrypt.hash(password,10);
    const whash = await bcrypt.hash(withdrawalPassword,10);
    const r = await pool.query(`INSERT INTO members (nom,pays,numero,password_hash,withdrawal_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id,nom,pays,numero,balance`, [nom.trim(), (pays||"Madagascar").trim(), numero.trim(), hash, whash]);
    res.status(201).json({ok:true, message:"Vita inscription", user:r.rows[0]});
  }catch(e){
    if(e.code==="23505") return res.status(409).json({message:"Efa misy kaonty amin'io numero io"});
    res.status(500).json({message:"Erreur inscription"});
  }
});

// LOGIN
app.post("/api/login", async (req,res)=>{
  try{
