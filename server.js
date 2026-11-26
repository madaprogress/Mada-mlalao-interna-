// MADA MLALAO INTERNA - server.js - FENO - VITA
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const JWT_SECRET = "mada-mlalao-secret-2026";
const ADMIN_KEY = "admin123";

let wallets = [
  { network: "YAS MONEY", address: "0340262175 - Nom: Paul", type: "mobile", pays: "MG" },
  { network: "ORANGE MONEY", address: "0373569233 - Nom: Romario", type: "mobile", pays: "MG" },
  { network: "AIRTEL MONEY", address: "0352368915 - Nom: Romario", type: "mobile", pays: "MG" },
  { network: "T.BEP20 - USD", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: BNB Smart Chain", type: "crypto" },
  { network: "S.BEP20 - USD", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: BNB Smart Chain", type: "crypto" },
  { network: "BNB", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: BNB Smart Chain", type: "crypto" },
  { network: "T.POLYGON - USD", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: Polygon", type: "crypto" },
  { network: "T.ETH - USD", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: Ethereum", type: "crypto" },
  { network: "S.POLYGON - USD", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: Polygon", type: "crypto" },
  { network: "S.ETH - USD", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: Ethereum", type: "crypto" },
  { network: "ETH", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: Ethereum", type: "crypto" },
  { network: "POLYGON", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: Polygon", type: "crypto" },
  { network: "ETH-PYUSD", address: "0xbd4BE1af86833C6fbF5dDfB303591bb3797eBCBA - Reseau: Ethereum", type: "crypto" },
  { network: "T.TRC20 - USD", address: "TQ7VRTHV22XL2roo21UDQvneXzhE28dZB6 - Reseau: Tron", type: "crypto" },
  { network: "TRX", address: "TQ7VRTHV22XL2roo21UDQvneXzhE28dZB6 - Reseau: Tron", type: "crypto" },
  { network: "BTC", address: "bc1q0x59ej6z66p82fh93suuz4daljcjuthlfl08x5 - Reseau: Bitcoin", type: "crypto" },
];

let users = [];
let deposits = [];
let withdrawals = [];
let tables = [];
let games = [];
let supports = [];
let adminNotifications = [];
let nextId = 1;
let nextDepId = 1;
let nextWitId = 1;
let principal = { total_commission: 0, total_deposits: 0 };

function notifyAdmin(type, message, data) {
  let n = {
    id: Date.now(),
    type: type,
    message: message,
    data: data || {},
    date: new Date().toLocaleString('fr-MG'),
    lu: false,
    is_read: false
  };
  adminNotifications.unshift(n);
  if (adminNotifications.length > 100) adminNotifications.pop();
  io.emit('admin-notif', n);
  console.log("ADMIN:", message);
  return n;
}

function auth(req, res, next) {
  let h = req.headers.authorization || "";
  let token = h.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Tsy connecte" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ message: "Token tsy mety" });
  }
}

function isAdmin(req, res, next) {
  if (req.headers["x-admin-key"] === ADMIN_KEY) return next();
  return res.status(403).json({ message: "Admin ihany" });
}

app.get("/", (req, res) => {
  if (fs.existsSync(path.join(__dirname, "public", "index.html"))) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  if (fs.existsSync(path.join(__dirname, "index.html"))) {
    return res.sendFile(path.join(__dirname, "index.html"));
  }
  res.send("Apetraho index.html eo akaikin'ny server.js na ao @ public/");
});

app.get("/api/status", (req, res) => {
  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  let nom = req.body.nom;
  let pays = req.body.pays;
  let numero = req.body.numero;
  let password = req.body.password;
  let confirmPassword = req.body.confirmPassword;
  let withdrawalPassword = req.body.withdrawalPassword;
  if (!nom || !numero || !password) return res.status(400).json({ message: "Fenoy Nom + Numero + Mot de passe" });
  if (password !== confirmPassword) return res.status(400).json({ message: "Mot de passe tsy mitovy" });
  if (users.find(u => u.numero === numero)) return res.status(400).json({ message: "Numero efa misy" });
  let hash = await bcrypt.hash(password, 10);
  let whash = await bcrypt.hash(withdrawalPassword || password, 10);
  let u = { id: nextId++, nom: nom, pays: pays, numero: numero, password: hash, withdrawalPassword: whash, balance: 0, address: "" };
  users.push(u);
  notifyAdmin("inscription", "MPILALAO VAOVAO - " + nom + " - " + numero, { user: nom });
  res.json({ message: "CREATION SUCCE" });
});

app.post('/api/login', async (req, res) => {
  let numero = req.body.numero;
  let password = req.body.password;
  let u = users.find(x => x.numero === numero);
  if (!u) return res.status(400).json({ message: "Numero tsy hita" });
  let ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(400).json({ message: "Mot de passe diso" });
  let token = jwt.sign({ id: u.id, numero: u.numero }, JWT_SECRET);
  res.json({ token: token, user: { id: u.id, nom: u.nom, numero: u.numero, balance: u.balance } });
});

app.get('/api/me', auth, (req, res) => {
  let u = users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ message: "Tsy hita" });
  res.json({ user: { id: u.id, nom: u.nom, numero: u.numero, balance: u.balance } });
});

app.get('/api/wallets', (req, res) => {
  res.json({ wallets: wallets });
});

app.get('/api/my-address', auth, (req, res) => {
  let u = users.find(x => x.id === req
