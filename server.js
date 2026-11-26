// MADA MLALAO INTERNA - server.js - FENO - MIFANARAKA @ index.html
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

function notifyAdmin(type, message, data) {
  let n = { id: Date.now(), type, message, data: data || {}, date: new Date().toLocaleString('fr-MG'), lu: false };
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
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ message: "Token tsy mety" }); }
}
function isAdmin(req, res, next) {
  if (req.headers["x-admin-key"] === ADMIN_KEY) return next();
  return res.status(403).json({ message: "Admin ihany" });
}
function getUser(req) { return users.find(x => x.id === req.user.id); }

app.get("/", (req, res) => {
  if (fs.existsSync(path.join(__dirname, "public", "index.html"))) return res.sendFile(path.join(__dirname, "public", "index.html"));
  if (fs.existsSync(path.join(__dirname, "index.html"))) return res.sendFile(path.join(__dirname, "index.html"));
  res.send("Apetraho index.html eo akaikin'ny server.js na ao @ public/");
});
app.get("/api/status", (req, res) => res.json({ ok: true }));

// --- AUTH ---
app.post('/api/register', async (req, res) => {
  let { nom, pays, numero, password, confirmPassword, withdrawalPassword } = req.body;
  if (!nom || !numero || !password) return res.status(400).json({ message: "Fenoy Nom + Numero + Mot de passe" });
  if (password !== confirmPassword) return res.status(400).json({ message: "Mot de passe tsy mitovy" });
  if (users.find(u => u.numero === numero)) return res.status(400).json({ message: "Numero efa misy" });
  let hash = await bcrypt.hash(password, 10);
  let whash = await bcrypt.hash(withdrawalPassword || password, 10);
  let u = { id: nextId++, nom, pays, numero, password: hash, withdrawalPassword: whash, balance: 0, address: "" };
  users.push(u);
  notifyAdmin("inscription", "MPILALAO VAOVAO - " + nom + " - " + numero, { user: nom });
  res.json({ message: "CREATION SUCCE" });
});
app.post('/api/login', async (req, res) => {
  let { numero, password } = req.body;
  let u = users.find(x => x.numero === numero);
  if (!u) return res.status(400).json({ message: "Numero tsy hita" });
  let ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(400).json({ message: "Mot de passe diso" });
  let token = jwt.sign({ id: u.id, numero: u.numero }, JWT_SECRET);
  res.json({ token, user: { id: u.id, nom: u.nom, numero: u.numero, balance: u.balance } });
});
app.get('/api/me', auth, (req, res) => {
  let u = getUser(req);
  if (!u) return res.status(404).json({ message: "Tsy hita" });
  res.json({ user: { id: u.id, nom: u.nom, numero: u.numero, balance: u.balance } });
});
app.get('/api/wallets', (req, res) => res.json({ wallets }));
app.get('/api/my-address', auth, (req, res) => {
  let u = getUser(req);
  if (!u) return res.status(404).json({ message: "Tsy hita" });
  res.json({ address: u.address || "" });
});

// --- DEPOT / RETRAIT ---
app.post('/api/deposit', auth, (req, res) => {
  let u = getUser(req);
  let { method, amount, reference } = req.body;
  if (!method || !amount || !reference) return res.status(400).json({ message: "Fenoy daholo" });
  let d = { id: nextDepId++, userId: u.id, nom: u.nom, numero: u.numero, method, amount: parseFloat(amount), reference, status: "pending", date: new Date().toLocaleString('fr-MG') };
  deposits.push(d);
  notifyAdmin("deposit", `DEPOT - ${u.nom} - ${method} ${amount} - Ref ${reference}`, d);
  res.json({ message: "Demande depot voaray - Admin manamarina" });
});
app.post('/api/withdraw', auth, async (req, res) => {
  let u = getUser(req);
  let { method, address, amount, withdrawalPassword } = req.body;
  if (!method || !amount || !withdrawalPassword) return res.status(400).json({ message: "Fenoy daholo" });
  let ok = await bcrypt.compare(withdrawalPassword, u.withdrawalPassword);
  if (!ok) return res.status(400).json({ message: "Mot de passe retrait diso" });
  amount = parseFloat(amount);
  if (u.balance < amount) return res.status(400).json({ message: "Solde tsy ampy" });
  u.balance -= amount;
  if (address) u.address = address;
  let w = { id: nextWitId++, userId: u.id, nom: u.nom, numero: u.numero, method, address: address || "", amount, status: "pending", date: new Date().toLocaleString('fr-MG') };
  withdrawals.push(w);
  notifyAdmin("withdraw", `RETRAIT - ${u.nom} - ${method} ${amount} vers ${address}`, w);
  res.json({ message: "Demande retrait voaray - Admin manamarina" });
});
app.post('/api/change-withdraw-password', auth, async (req, res) => {
  let u = getUser(req);
  let { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ message: "Fenoy mot de passe vaovao" });
  u.withdrawalPassword = await bcrypt.hash(newPassword, 10);
  res.json({ message: "Mot de passe retrait voaova" });
});

// --- TABLES / JEUX ---
app.post('/api/create-table', auth, (req, res) => {
  let u = getUser(req);
  let { game, type, mise } = req.body;
  mise = parseFloat(mise || 0);
  let min = (game === "loto" ? 10 : 5);
  if (mise < min) return res.status(400).json({ message: "Minimum rappel: " + min + "$" });
  if (u.balance < mise) return res.status(400).json({ message: "Solde tsy ampy" });
  u.balance -= mise;
  let commission = +(mise * 0.10).toFixed(2);
  let fond = +(mise - commission).toFixed(2);
  let code = String(Math.floor(1000 + Math.random() * 9000));
  let tb = { code, game, type, mise, commission, fond, players: [u.id], creator: u.id, creatorNom: u.nom, timer: "2min30s", date: new Date().toLocaleString('fr-MG') };
  tables.push(tb);
  res.json({ message: "Table cree", table: tb });
});
app.get('/api/tables', auth, (req, res) => {
  let list = tables.map(tb => ({ ...tb, players: tb.players.length }));
  res.json({ tables: list });
});
app.post('/api/join-table', auth, (req, res) => {
  let u = getUser(req);
  let { code } = req.body;
  let tb = tables.find(t => t.code === String(code));
  if (!tb) return res.status(404).json({ message: "Code table tsy hita" });
  if (!tb.players.includes(u.id)) tb.players.push(u.id);
  res.json({ message: "Tafiditra @ table " + tb.code });
});
function playGame(req, res, gameName, bet) {
  let u = getUser(req);
  bet = bet || 0;
  // Raha table no ampiasaina, bet = mise efa nalaina - raha tsy misy table, alaina @ solde
  // Eto: jeu simple - 40% chance mandresy, gain = bet * 1.8
  let win = Math.random() < 0.4;
  let net = 0, result = "Perdu";
  if (win) { let gain = +(bet * 1.8).toFixed(2); net = +(gain - bet).toFixed(2); u.balance += gain; result = "Gagne"; }
  else { net = -bet; result = "Perdu"; }
  games.push({ userId: u.id, game: gameName, bet, result, net, date: new Date().toLocaleString('fr-MG') });
  res.json({ message: win ? `🏆 GAGNE - Net +${net}$` : `Perdu - ${net}$`, newBalance: u.balance });
}
app.post('/api/play-loto', auth, (req, res) => {
  let u = getUser(req);
  let { ticket1, ticket2, code } = req.body;
  if (!ticket1 || !ticket2 || ticket1.length !== 5 || ticket2.length !== 5) return res.status(400).json({ message: "Choisissez 5 x2" });
  let tb = tables.find(t => t.code === String(code));
  let bet = tb ? tb.mise : 10;
  if (!tb && u.balance < bet) return res.status(400).json({ message: "Solde tsy ampy" });
  if (!tb) u.balance -= bet;
  // Tirage 1-30
  let tirage = [];
  while (tirage.length < 5) { let n = Math.floor(1 + Math.random() * 30); if (!tirage.includes(n)) tirage.push(n); }
  let t1 = ticket1.filter(n => tirage.slice(0, 3).includes(n)).length;
  let t2 = ticket2.filter(n => tirage.slice(0, 3).includes(n)).length;
  let full1 = ticket1.every(n => tirage.includes(n));
  let full2 = ticket2.every(n => tirage.includes(n));
  let fond = tb ? tb.fond : bet * 0.9;
  let gain = 0, result = "Perdu";
  if (full1 || full2) { gain = +(fond * 0.70).toFixed(2); result = "QUINTE"; }
  else if (t1 === 3 || t2 === 3) { gain = +(fond * 0.30).toFixed(2); result = "TIERCE"; }
  let net = gain ? +(gain - (tb ? 0 : bet)).toFixed(2) : -(tb ? 0 : bet);
  if (gain) u.balance += gain;
  games.push({ userId: u.id, game: "loto", bet, result: result + " - Tirage " + tirage.join("-"), net, date: new Date().toLocaleString('fr-MG') });
  res.json({ message: gain ? `🏆 ${result} - Tirage ${tirage.join("-")} - Gain ${gain}$` : `Perdu - Tirage ${tirage.join("-")}`, newBalance: u.balance });
});
app.post('/api/play-card', auth, (req, res) => {
  let u = getUser(req);
  let { code } = req.body;
  let tb = tables.find(t => t.code === String(code));
  let bet = tb ? tb.mise : 5;
  if (!tb && u.balance < bet) return res.status(400).json({ message: "Solde tsy ampy" });
  if (!tb) u.balance -= bet;
  playGame(req, res, "card", tb ? 0 : bet);
});
app.post('/api/play-rami', auth, (req, res) => {
  let u = getUser(req);
  let { type, code } = req.body;
  let tb = tables.find(t => t.code === String(code));
  let bet = tb ? tb.mise : 5;
  if (!tb && u.balance < bet) return res.status(400).json({ message: "Solde tsy ampy" });
  if (!tb) u.balance -= bet;
  playGame(req, res, "rami-" + (type || "bordel"), tb ? 0 : bet);
});
app.post('/api/play-ludo', auth, (req, res) => {
  let u = getUser(req);
  let { code } = req.body;
  let tb = tables.find(t => t.code === String(code));
  let bet = tb ? tb.mise : 5;
  if (!tb && u.balance < bet) return res.status(400).json({ message: "Solde tsy ampy" });
  if (!tb) u.balance -= bet;
  playGame(req, res, "ludo", tb ? 0 : bet);
});

// --- HISTO / SUPPORT ---
app.get('/api/my-history', auth, (req, res) => {
  let u = getUser(req);
  res.json({
    deposits: deposits.filter(d => d.userId === u.id),
    withdrawals: withdrawals.filter(w => w.userId === u.id),
    games: games.filter(g => g.userId === u.id)
  });
});
app.post('/api/support', auth, (req, res) => {
  let u = getUser(req);
  let { message } = req.body;
  if (!message) return res.status(400).json({ message: "Soraty hafatra" });
  supports.push({ id: Date.now(), userId: u.id, nom: u.nom, numero: u.numero, message, date: new Date().toLocaleString('fr-MG') });
  notifyAdmin("support", `SUPPORT - ${u.nom}: ${message}`, { user: u.nom });
  res.json({ message: "Hafatra voaray - Admin hamaly" });
});

// --- ADMIN ---
app.get('/api/admin/members', isAdmin, (req, res) => {
  res.json({ members: users.map(u => ({ id: u.id, nom: u.nom, numero: u.numero, balance: u.balance, pays: u.pays })) });
});
app.get('/api/admin/deposits', isAdmin, (req, res) => res.json({ deposits }));
app.get('/api/admin/withdrawals', isAdmin, (req, res) => res.json({ withdrawals }));
app.get('/api/admin/support', isAdmin, (req, res) => res.json({ support: supports }));
app.post('/api/admin/validate', isAdmin, (req, res) => {
  let { type, id, action, convertedUSD } = req.body;
  if (type === "deposit") {
    let d = deposits.find(x => x.id === Number(id));
    if (!d) return res.status(404).json({ message: "Depot tsy hita" });
    if (action === "approve") {
      let u = users.find(x => x.id === d.userId);
      let amt = parseFloat(convertedUSD) || d.amount;
      if (u) u.balance += amt;
      d.status = "approved"; d.amount = amt;
    } else { d.status = "rejected"; }
    return res.json({ message: "Depot " + d.status });
  }
  if (type === "withdraw") {
    let w = withdrawals.find(x => x.id === Number(id));
    if (!w) return res.status(404).json({ message: "Retrait tsy hita" });
    if (action === "approve") { w.status = "approved"; }
    else {
      w.status = "rejected";
      let u = users.find(x => x.id === w.userId);
      if (u) u.balance += w.amount; // remboursement
    }
    return res.json({ message: "Retrait " + w.status });
  }
  return res.status(400).json({ message: "Type diso" });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log("MADA MLALAO - http://localhost:" + PORT));
