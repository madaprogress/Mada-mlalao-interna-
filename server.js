// MADA MLALAO INTERNA - SERVER COMPLET FARANY
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);
app.use(express.json());
app.use(express.static(path.join(__dirname)));
const JWT_SECRET = process.env.JWT_SECRET || "mada-mlalao-secret-2026";
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";
const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL && DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false });
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

// ===== APINA - 1. PLATEFORME MAMORONA ADRESS WALLET UNIQUE + ID - TSY MEMBRE =====
function genMemberId(numero){
  let digits = String(numero||"").replace(/\D/g,"").slice(-4);
  let rand = String(Math.floor(1000+Math.random()*9000));
  return "3834"+digits+rand; // Ex: 383421759876 - Arakaraka ny numero
}
function genWalletUnique(){
  // Wallet Unique - 0x + 40 caracteres - Samy manana ny azy - Ex: 0x...fQd
  let chars="0123456789abcdefABCDEF"; let s="0x";
  for(let i=0;i<40;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
async function ensureWalletUnique(u){
  // Raha compte taloha - Tsy manana wallet - Na address = numero - Mamorona ho azy
  if(!u.address || u.address===u.numero || u.address===""){
    let w = genWalletUnique();
    await pool.query("UPDATE users SET address=$1 WHERE id=$2",[w,u.id]);
    u.address = w;
  }
  return u.address;
}
// ===== FARAN'NY APINA - 1 =====

function normalizeNumero(raw,pays){ if(!raw) return raw; let p=String(raw).replace(/[\s\-\.]/g,""); if(p.startsWith("+")) p=p.slice(1); let c=String(pays||"261"); if(p.startsWith(c)) p=p.slice(c.length); if(p.startsWith("0")) p=p.slice(1); if(p.length===9) return "+261"+p; return "+"+c+p; }
function numeroVariants(numero){ let n=normalizeNumero(numero,"261"); let s=n.replace("+",""); let sc=s.startsWith("261")?s.slice(3):s; return [n,s,"0"+sc,sc]; }
async function initDB(){
  await pool.query("CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, nom TEXT, pays TEXT, numero TEXT UNIQUE, password TEXT, withdrawal_password TEXT, balance NUMERIC DEFAULT 0, address TEXT DEFAULT '')");
  await pool.query("CREATE TABLE IF NOT EXISTS deposits(id SERIAL PRIMARY KEY, user_id INT, nom TEXT, numero TEXT, method TEXT, amount NUMERIC, reference TEXT, status TEXT DEFAULT 'pending', date TEXT)");
  await pool.query("CREATE TABLE IF NOT EXISTS withdrawals(id SERIAL PRIMARY KEY, user_id INT, nom TEXT, numero TEXT, method TEXT, address TEXT, amount NUMERIC, status TEXT DEFAULT 'pending', date TEXT)");
  await pool.query("CREATE TABLE IF NOT EXISTS tables_tbl(code TEXT PRIMARY KEY, game TEXT, type TEXT, mise NUMERIC, commission NUMERIC, fond NUMERIC, players JSONB DEFAULT '[]', creator INT, creator_nom TEXT, timer TEXT, date TEXT)");
  await pool.query("CREATE TABLE IF NOT EXISTS games(id SERIAL PRIMARY KEY, user_id INT, game TEXT, bet NUMERIC, result TEXT, net NUMERIC, date TEXT, detail TEXT)");
  await pool.query("CREATE TABLE IF NOT EXISTS supports(id SERIAL PRIMARY KEY, user_id INT, nom TEXT, numero TEXT, message TEXT, date TEXT)");
  await pool.query("CREATE TABLE IF NOT EXISTS admin_notifs(id SERIAL PRIMARY KEY, type TEXT, message TEXT, date TEXT)");
  console.log("DB OK");
}
function notifyAdmin(type,message){ pool.query("INSERT INTO admin_notifs(type,message,date) VALUES($1,$2,$3)",[type,message,new Date().toLocaleString('fr-MG')]).catch(()=>{}); io.emit('admin-notif',{type,message}); }
function auth(req,res,next){ let h=req.headers.authorization||""; let token=h.replace("Bearer ",""); if(!token) return res.status(401).json({message:"Tsy connecte - Midira indray"}); try{ req.user=jwt.verify(token,JWT_SECRET); next(); }catch(e){ return res.status(401).json({message:"Session tapitra - Midira indray"}); } }
function isAdmin(req,res,next){ if(req.headers["x-admin-key"]===ADMIN_KEY) return next(); return res.status(403).json({message:"Admin ihany"}); }
async function getUser(req){ let r=await pool.query("SELECT * FROM users WHERE id=$1",[req.user.id]); return r.rows[0]; }
async function findUserByNumero(numero){ let vars=numeroVariants(numero); let r=await pool.query("SELECT * FROM users WHERE numero = ANY($1)",[vars]); return r.rows[0]; }
const now=()=>new Date().toLocaleString('fr-MG');
app.get("/api/status",async(req,res)=>{ try{ await pool.query("SELECT 1"); res.json({ok:true,db:"OK"}); }catch(e){ res.status(500).json({ok:false,db:"ERROR - "+e.message}); } });

// ===== APINA - 2. REGISTER - PLATEFORME MAMORONA WALLET UNIQUE - TSY MEMBRE INTSONY =====
app.post('/api/register',async(req,res)=>{ try{ let {nom,pays,numero,password,confirmPassword,withdrawalPassword}=req.body; if(!nom||!numero||!password) return res.status(400).json({message:"Fenoy Nom + Numero + Mot de passe"}); if(password!==confirmPassword) return res.status(400).json({message:"Mot de passe tsy mitovy"}); numero=normalizeNumero(numero,pays||"261"); let ex=await findUserByNumero(numero); if(ex) return res.status(400).json({message:"Numero efa misy - Tsindrio HIDITRA"}); let hash=await bcrypt.hash(password,10); let whash=await bcrypt.hash(withdrawalPassword||password,10); let memberId=genMemberId(numero); let walletUnique=genWalletUnique(); await pool.query("INSERT INTO users(nom,pays,numero,password,withdrawal_password,address) VALUES($1,$2,$3,$4,$5,$6)",[nom,pays,numero,hash,whash,walletUnique]); notifyAdmin("inscription","MPILALAO VAOVAO - "+nom+" - "+numero+" - ID: "+memberId+" - Wallet Unique: "+walletUnique); res.json({message:"CREATION SUCCE - ID: "+memberId+" - Wallet Unique: "+walletUnique, memberId:memberId, wallet:walletUnique}); }catch(e){ res.status(500).json({message:"Erreur serveur: "+e.message}); } });
// ===== FARAN'NY APINA - 2 =====

app.post('/api/login',async(req,res)=>{ try{ let {numero,password}=req.body; if(!numero||!password) return res.status(400).json({message:"Fenoy Numero + Mot de passe"}); let u=await findUserByNumero(numero); if(!u) return res.status(400).json({message:"Numero tsy hita - Manaova FAMORONANA aloha"}); let ok=await bcrypt.compare(password,u.password); if(!ok) return res.status(400).json({message:"Mot de passe diso"}); await ensureWalletUnique(u); let memberId="3834"+String(u.numero||"").replace(/\D/g,"").slice(-4)+String(u.id).padStart(4,"0"); let token=jwt.sign({id:u.id,numero:u.numero},JWT_SECRET,{expiresIn:"7d"}); res.json({token,user:{id:u.id,memberId:memberId,nom:u.nom,numero:u.numero,balance:parseFloat(u.balance),address:u.address||u.numero,wallet:u.address}}); }catch(e){ res.status(500).json({message:"Erreur serveur: "+e.message}); } });
app.get('/api/me',auth,async(req,res)=>{ try{ let u=await getUser(req); if(!u) return res.status(404).json({message:"Tsy hita"}); await ensureWalletUnique(u); let memberId="3834"+String(u.numero||"").replace(/\D/g,"").slice(-4)+String(u.id).padStart(4,"0"); res.json({user:{id:u.id,memberId:memberId,nom:u.nom,numero:u.numero,balance:parseFloat(u.balance),address:u.address||u.numero,wallet:u.address}}); }catch(e){ res.status(500).json({message:e.message}); } });
app.get('/api/wallets',(req,res)=>res.json({wallets}));
app.post('/api/deposit',auth,async(req,res)=>{ try{ let u=await getUser(req); let {method,amount,reference}=req.body; if(!method||!amount||!reference) return res.status(400).json({message:"Fenoy daholo"}); await pool.query("INSERT INTO deposits(user_id,nom,numero,method,amount,reference,status,date) VALUES($1,$2,$3,$4,$5,$6,'pending',$7)",[u.id,u.nom,u.numero,method,parseFloat(amount),reference,now()]); notifyAdmin("deposit","DEPOT - "+u.nom+" - "+method+" "+amount+" - Ref "+reference); res.json({message:"Demande depot voaray - Admin manamarina"}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/withdraw',auth,async(req,res)=>{ try{ let u=await getUser(req); let {amount,withdrawalPassword,method}=req.body; if(!amount||!withdrawalPassword) return res.status(400).json({message:"Fenoy Vola + Teny miafina fanalana"}); let ok=await bcrypt.compare(withdrawalPassword,u.withdrawal_password); if(!ok) return res.status(400).json({message:"Mot de passe retrait diso"}); amount=parseFloat(amount); if(parseFloat(u.balance)<amount) return res.status(400).json({message:"Solde tsy ampy"}); await ensureWalletUnique(u); let adressUSD=u.address; let methode=method||"USD - Adress compte"; await pool.query("UPDATE users SET balance=balance-$1 WHERE id=$2",[amount,u.id]); await pool.query("INSERT INTO withdrawals(user_id,nom,numero,method,address,amount,status,date) VALUES($1,$2,$3,$4,$5,$6,'pending',$7)",[u.id,u.nom,u.numero,methode,adressUSD,amount,now()]); notifyAdmin("withdraw","RETRAIT AUTOMATIQUE - "+u.nom+" - "+amount+" USD - Adress: "+adressUSD); res.json({message:"Demande retrait "+amount+" USD voaray - Halefa @ Adress-nao : "+adressUSD+" - Admin manao Action"}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/update-address',auth,async(req,res)=>{ try{ let u=await getUser(req); let {address}=req.body; if(!address) return res.status(400).json({message:"Fenoy Adress fandraisana USD"}); await pool.query("UPDATE users SET address=$1 WHERE id=$2",[address,u.id]); res.json({message:"Adress fandraisana USD voaova - "+address}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/change-withdraw-password',auth,async(req,res)=>{ try{ let u=await getUser(req); let {newPassword}=req.body; if(!newPassword) return res.status(400).json({message:"Fenoy mot de passe vaovao"}); let h=await bcrypt.hash(newPassword,10); await pool.query("UPDATE users SET withdrawal_password=$1 WHERE id=$2",[h,u.id]); res.json({message:"Mot de passe retrait voaova"}); }catch(e){ res.status(500).json({message:e.message}); } });
// CREATE TABLE - LOTO PETIT/MOYEN/VIP + MODE / CARD-RAMI-LUDO 5$
app.post('/api/create-table',auth,async(req,res)=>{ try{ let u=await getUser(req); let {game,type,mode}=req.body; let miseFinal=0,minSolde=0; if(game==="loto"){ if(type==="petit") miseFinal=0.5; else if(type==="moyen") miseFinal=2.5; else if(type==="vip") miseFinal=5; else return res.status(400).json({message:"Safidio PETIT / MOYEN / VIP @ LOTO"}); minSolde=10; } else { miseFinal=5; minSolde=5; } if(parseFloat(u.balance)<minSolde) return res.status(400).json({message:"Solde tsy ampy - Minimum creer "+game+" : "+minSolde+"$ - Solde : "+parseFloat(u.balance)+"$"}); if(parseFloat(u.balance)<miseFinal) return res.status(400).json({message:"Solde tsy ampy - Mise : "+miseFinal+"$"}); if(!["1vs1","3","4","illimite"].includes(mode)) return res.status(400).json({message:"Safidio Mode : 1 VS 1 / 3 / 4 / ILLIMITE"}); if(mode==="illimite" && game!=="loto") return res.status(400).json({message:"ILLIMITE - LOTO ihany"}); await pool.query("UPDATE users SET balance=balance-$1 WHERE id=$2",[miseFinal,u.id]); let commission
