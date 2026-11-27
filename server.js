// MADA MLALAO INTERNA - server.js - POSTGRESQL - TENA MISA - TSY LOCALSTORAGE
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
const JWT_SECRET = process.env.JWT_SECRET || "mada-mlalao-secret-2026";
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";
const DATABASE_URL = process.env.DATABASE_URL;
console.log("DATABASE_URL:", DATABASE_URL ? "MISY ✅" : "TSY MISY ❌ - Apetraho @ Render Environment");
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
function normalizeNumero(raw,pays){ if(!raw) return raw; let p=String(raw).replace(/[\s\-\.]/g,""); if(p.startsWith("+")) p=p.slice(1); let c=String(pays||"261"); if(p.startsWith(c)) p=p.slice(c.length); if(p.startsWith("0")) p=p.slice(1); if(p.length===9) return "+261"+p; return "+"+c+p; }
function numeroVariants(numero){ let n=normalizeNumero(numero,"261"); let s=n.replace("+",""); let sc=s.startsWith("261")?s.slice(3):s; return [n,s,"0"+sc,sc]; }
async function initDB(){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, nom TEXT, pays TEXT, numero TEXT UNIQUE, password TEXT, withdrawal_password TEXT, balance NUMERIC DEFAULT 0, address TEXT DEFAULT '')`);
  await pool.query(`CREATE TABLE IF NOT EXISTS deposits(id SERIAL PRIMARY KEY, user_id INT, nom TEXT, numero TEXT, method TEXT, amount NUMERIC, reference TEXT, status TEXT DEFAULT 'pending', date TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS withdrawals(id SERIAL PRIMARY KEY, user_id INT, nom TEXT, numero TEXT, method TEXT, address TEXT, amount NUMERIC, status TEXT DEFAULT 'pending', date TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tables_tbl(code TEXT PRIMARY KEY, game TEXT, type TEXT, mise NUMERIC, commission NUMERIC, fond NUMERIC, players JSONB DEFAULT '[]', creator INT, creator_nom TEXT, timer TEXT, date TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS games(id SERIAL PRIMARY KEY, user_id INT, game TEXT, bet NUMERIC, result TEXT, net NUMERIC, date TEXT, detail TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS supports(id SERIAL PRIMARY KEY, user_id INT, nom TEXT, numero TEXT, message TEXT, date TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_notifs(id SERIAL PRIMARY KEY, type TEXT, message TEXT, date TEXT)`);
  console.log("DB OK - Tables pretes");
}
function notifyAdmin(type,message){ pool.query(`INSERT INTO admin_notifs(type,message,date) VALUES($1,$2,$3)`,[type,message,new Date().toLocaleString('fr-MG')]).catch(()=>{}); io.emit('admin-notif',{type,message}); console.log("ADMIN:",message); }
function auth(req,res,next){ let h=req.headers.authorization||""; let token=h.replace("Bearer ",""); if(!token) return res.status(401).json({message:"Tsy connecte - Midira indray"}); try{ req.user=jwt.verify(token,JWT_SECRET); next(); }catch(e){ return res.status(401).json({message:"Session tapitra - Midira indray"}); } }
function isAdmin(req,res,next){ if(req.headers["x-admin-key"]===ADMIN_KEY) return next(); return res.status(403).json({message:"Admin ihany"}); }
async function getUser(req){ let r=await pool.query(`SELECT * FROM users WHERE id=$1`,[req.user.id]); return r.rows[0]; }
async function findUserByNumero(numero){ let vars=numeroVariants(numero); let r=await pool.query(`SELECT * FROM users WHERE numero = ANY($1)`,[vars]); return r.rows[0]; }
const now=()=>new Date().toLocaleString('fr-MG');
app.get("/",(req,res)=>{ if(fs.existsSync(path.join(__dirname,"public","index.html"))) return res.sendFile(path.join(__dirname,"public","index.html")); if(fs.existsSync(path.join(__dirname,"index.html"))) return res.sendFile(path.join(__dirname,"index.html")); res.send("Apetraho index.html"); });
app.get("/api/status",async(req,res)=>{ try{ await pool.query("SELECT 1"); res.json({ok:true,db:"OK",database_url:!!DATABASE_URL}); }catch(e){ res.status(500).json({ok:false,db:"ERROR - "+e.message}); } });
// --- AUTH - TENA @ DB ---
app.post('/api/register',async(req,res)=>{ try{ let {nom,pays,numero,password,confirmPassword,withdrawalPassword}=req.body; if(!nom||!numero||!password) return res.status(400).json({message:"Fenoy Nom + Numero + Mot de passe"}); if(password!==confirmPassword) return res.status(400).json({message:"Mot de passe tsy mitovy"}); numero=normalizeNumero(numero,pays||"261"); let ex=await findUserByNumero(numero); if(ex) return res.status(400).json({message:"Numero efa misy - Tsindrio HIDITRA"}); let hash=await bcrypt.hash(password,10); let whash=await bcrypt.hash(withdrawalPassword||password,10); let ins=await pool.query(`INSERT INTO users(nom,pays,numero,password,withdrawal_password) VALUES($1,$2,$3,$4,$5) RETURNING id,nom,numero,balance`,[nom,pays,numero,hash,whash]); notifyAdmin("inscription","MPILALAO VAOVAO - "+nom+" - "+numero); res.json({message:"CREATION SUCCE",user:{id:ins.rows[0].id,nom:ins.rows[0].nom,numero:ins.rows[0].numero,balance:0}}); }catch(e){ console.error("REGISTER",e); res.status(500).json({message:"Erreur serveur: "+e.message}); } });
app.post('/api/login',async(req,res)=>{ try{ let {numero,password}=req.body; if(!numero||!password) return res.status(400).json({message:"Fenoy Numero + Mot de passe"}); let u=await findUserByNumero(numero); if(!u) return res.status(400).json({message:"Numero tsy hita - Manaova FAMORONANA aloha"}); let ok=await bcrypt.compare(password,u.password); if(!ok) return res.status(400).json({message:"Mot de passe diso"}); let token=jwt.sign({id:u.id,numero:u.numero},JWT_SECRET,{expiresIn:"7d"}); res.json({token,user:{id:u.id,nom:u.nom,numero:u.numero,balance:parseFloat(u.balance)}}); }catch(e){ console.error("LOGIN",e); res.status(500).json({message:"Erreur serveur: "+e.message}); } });
app.get('/api/me',auth,async(req,res)=>{ try{ let u=await getUser(req); if(!u) return res.status(404).json({message:"Tsy hita"}); res.json({user:{id:u.id,nom:u.nom,numero:u.numero,balance:parseFloat(u.balance)}}); }catch(e){ res.status(500).json({message:e.message}); } });
app.get('/api/wallets',(req,res)=>res.json({wallets}));
app.get('/api/my-address',auth,async(req,res)=>{ try{ let u=await getUser(req); res.json({address:u.address||""}); }catch(e){ res.status(500).json({message:e.message}); } });
// --- DEPOT / RETRAIT - TENA @ DB ---
app.post('/api/deposit',auth,async(req,res)=>{ try{ let u=await getUser(req); let {method,amount,reference}=req.body; if(!method||!amount||!reference) return res.status(400).json({message:"Fenoy daholo"}); await pool.query(`INSERT INTO deposits(user_id,nom,numero,method,amount,reference,status,date) VALUES($1,$2,$3,$4,$5,$6,'pending',$7)`,[u.id,u.nom,u.numero,method,parseFloat(amount),reference,now()]); notifyAdmin("deposit",`DEPOT - ${u.nom} - ${method} ${amount} - Ref ${reference}`); res.json({message:"Demande depot voaray - Admin manamarina"}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/withdraw',auth,async(req,res)=>{ try{ let u=await getUser(req); let {method,address,amount,withdrawalPassword}=req.body; if(!method||!amount||!withdrawalPassword) return res.status(400).json({message:"Fenoy daholo"}); let ok=await bcrypt.compare(withdrawalPassword,u.withdrawal_password); if(!ok) return res.status(400).json({message:"Mot de passe retrait diso"}); amount=parseFloat(amount); if(parseFloat(u.balance)<amount) return res.status(400).json({message:"Solde tsy ampy"}); await pool.query(`UPDATE users SET balance=balance-$1, address=$2 WHERE id=$3`,[amount,address||u.address,u.id]); await pool.query(`INSERT INTO withdrawals(user_id,nom,numero,method,address,amount,status,date) VALUES($1,$2,$3,$4,$5,$6,'pending',$7)`,[u.id,u.nom,u.numero,method,address||"",amount,now()]); notifyAdmin("withdraw",`RETRAIT - ${u.nom} - ${method} ${amount} vers ${address}`); res.json({message:"Demande retrait voaray - Admin manamarina"}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/change-withdraw-password',auth,async(req,res)=>{ try{ let u=await getUser(req); let {newPassword}=req.body; if(!newPassword) return res.status(400).json({message:"Fenoy mot de passe vaovao"}); let h=await bcrypt.hash(newPassword,10); await pool.query(`UPDATE users SET withdrawal_password=$1 WHERE id=$2`,[h,u.id]); res.json({message:"Mot de passe retrait voaova"}); }catch(e){ res.status(500).json({message:e.message}); } });
// --- TABLES ---
app.post('/api/create-table',auth,async(req,res)=>{ try{ let u=await getUser(req); let {game,type,mise}=req.body; mise=parseFloat(mise||0); let min=(game==="loto"?10:5); if(mise<min) return res.status(400).json({message:"Minimum: "+min+"$"}); if(parseFloat(u.balance)<mise) return res.status(400).json({message:"Solde tsy ampy"}); await pool.query(`UPDATE users SET balance=balance-$1 WHERE id=$2`,[mise,u.id]); let commission=+(mise*0.10).toFixed(2); let fond=+(mise-commission).toFixed(2); let code=String(Math.floor(1000+Math.random()*9000)); await pool.query(`INSERT INTO tables_tbl(code,game,type,mise,commission,fond,players,creator,creator_nom,timer,date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'2min30s',$10)`,[code,game,type,mise,commission,fond,JSON.stringify([u.id]),u.id,u.nom,now()]); res.json({message:"Table cree",table:{code,game,type,mise,commission,fond}}); }catch(e){ res.status(500).json({message:e.message}); } });
app.get('/api/tables',auth,async(req,res)=>{ try{ let r=await pool.query(`SELECT * FROM tables_tbl ORDER BY code DESC`); let list=r.rows.map(tb=>({code:tb.code,game:tb.game,type:tb.type,mise:parseFloat(tb.mise),commission:parseFloat(tb.commission),fond:parseFloat(tb.fond),players:(tb.players||[]).length,creatorNom:tb.creator_nom,timer:tb.timer})); res.json({tables:list}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/join-table',auth,async(req,res)=>{ try{ let u=await getUser(req); let {code}=req.body; let r=await pool.query(`SELECT * FROM tables_tbl WHERE code=$1`,[String(code)]); let tb=r.rows[0]; if(!tb) return res.status(404).json({message:"Code table tsy hita"}); let players=tb.players||[]; if(!players.includes(u.id)) players.push(u.id); await pool.query(`UPDATE tables_tbl SET players=$1 WHERE code=$2`,[JSON.stringify(players),String(code)]); res.json({message:"Tafiditra @ table "+code}); }catch(e){ res.status(500).json({message:e.message}); } });
async function saveGame(userId,game,bet,result,net,detail){ await pool.query(`INSERT INTO games(user_id,game,bet,result,net,date,detail) VALUES($1,$2,$3,$4,$5,$6,$7)`,[userId,game,bet,result,net,now(),detail||""]); }
// --- JEUX TENA MISA ---
function newDeck(){ let suits=["♥︎","✦","Δ","☆"]; let ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"]; let d=[]; for(let s of suits) for(let r of ranks) d.push({suit:s,rank:r,label:r+s}); for(let i=d.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; } return d; }
function rankVal(r){ if(r==="A") return 1; if(r==="J") return 11; if(r==="Q") return 12; if(r==="K") return 13; return parseInt(r); }
function checkCardTri(cards){ // 12 karatra - Tri marika x4 - Izany hoe karatra 4 mitovy rank, marika 4 samihafa
  let byRank={}; cards.forEach(c=>{ byRank[c.rank]=byRank[c.rank]||[]; byRank[c.rank].push(c); });
  for(let rank in byRank){ let suits=new Set(byRank[rank].map(c=>c.suit)); if(byRank[rank].length>=4 && suits.size===4) return true; }
  return false;
}
function checkRami(cards,type){
  // 13 karatra - Tadiavo quadri + escalier + tri
  let byRank={}; cards.forEach(c=>{ byRank[c.rank]=byRank[c.rank]||[]; byRank[c.rank].push(c); });
  let quadri=false;
  for(let rank in byRank){
    let g=byRank[rank];
    if(type==="bordel"){
      if(g.length>=4 && new Set(g.map(c=>c.suit)).size===4) quadri=true;
      // Quadri chiffre iray - marika 4 samihafa - Efa io ihany
    } else {
      // NATUREL : Quadri escalier marika mitovy - Ohatra 5-6-7-8 ♥︎
      let suits={}; g.forEach(c=>{ suits[c.suit]=suits[c.suit]||[]; suits[c.suit].push(rankVal(c.rank)); });
      for(let s in suits){ let vals=[...new Set(suits[s])].sort((a,b)=>a-b); for(let i=0;i<=vals.length-4;i++){ if(vals[i+3]-vals[i]===3) quadri=true; } }
    }
  }
  // Escalier : 3 karatra mifandimby marika mitovy
  let bySuit={}; cards.forEach(c=>{ bySuit[c.suit]=bySuit[c.suit]||[]; bySuit[c.suit].push(rankVal(c.rank)); });
  let escalier=false; for(let s in bySuit){ let v=[...new Set(bySuit[s])].sort((a,b)=>a-b); for(let i=0;i<=v.length-3;i++){ if(v[i+2]-v[i]===2) escalier=true; } }
  // Tri : 3 karatra mitovy rank
  let tri=false; for(let rank in byRank){ if(byRank[rank].length>=3) tri=true; }
  return {quadri,escalier,tri,win: quadri && (escalier || tri)};
}
app.post('/api/play-loto',auth,async(req,res)=>{ try{ let u=await getUser(req); let {ticket1,ticket2,code}=req.body; if(!ticket1||!ticket2||ticket1.length!==5||ticket2.length!==5) return res.status(400).json({message:"Choisissez 5 x2"}); let tbR=await pool.query(`SELECT * FROM tables_tbl WHERE code=$1`,[String(code||"")]); let tb=tbR.rows[0]; let bet=tb?parseFloat(tb.mise):10; if(!tb){ if(parseFloat(u.balance)<bet) return res.status(400).json({message:"Solde tsy ampy"}); await pool.query(`UPDATE users SET balance=balance-$1 WHERE id=$2`,[bet,u.id]); } let tirage=[]; while(tirage.length<5){ let n=Math.floor(1+Math.random()*30); if(!tirage.includes(n)) tirage.push(n); } let t1=ticket1.filter(n=>tirage.slice(0,3).includes(n)).length; let t2=ticket2.filter(n=>tirage.slice(0,3).includes(n)).length; let full1=ticket1.every(n=>tirage.includes(n)); let full2=ticket2.every(n=>tirage.includes(n)); let fond=tb?parseFloat(tb.fond):bet*0.9; let gain=0,result="Perdu"; if(full1||full2){ gain=+(fond*0.70).toFixed(2); result="QUINTE"; } else if(t1===3||t2===3){ gain=+(fond*0.30).toFixed(2); result="TIERCE"; } let net=gain?+(gain-(tb?0:bet)).toFixed(2):-(tb?0:bet); if(gain) await pool.query(`UPDATE users SET balance=balance+$1 WHERE id=$2`,[gain,u.id]); await saveGame(u.id,"loto",bet,result+" - Tirage "+tirage.join("-"),net,"T1:"+ticket1.join("-")+" T2:"+ticket2.join("-")); let nb=await getUser(req); res.json({message:gain?`🏆 ${result} - Tirage ${tirage.join("-")} - Gain ${gain}$`:`Perdu - Tirage ${tirage.join("-")}`,newBalance:parseFloat(nb.balance),tirage}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/play-card',auth,async(req,res)=>{ try{ let u=await getUser(req); let {code}=req.body; let tbR=await pool.query(`SELECT * FROM tables_tbl WHERE code=$1`,[String(code||"")]); let tb=tbR.rows[0]; let bet=tb?parseFloat(tb.mise):5; if(!tb){ if(parseFloat(u.balance)<bet) return res.status(400).json({message:"Solde tsy ampy"}); await pool.query(`UPDATE users SET balance=balance-$1 WHERE id=$2`,[bet,u.id]); } let deck=newDeck(); let hand=deck.slice(0,12); let win=checkCardTri(hand); let fond=tb?parseFloat(tb.fond):bet*0.9; let gain=win?fond:0; let net=win?+(gain-(tb?0:bet)).toFixed(2):-(tb?0:bet); if(gain) await pool.query(`UPDATE users SET balance=balance+$1 WHERE id=$2`,[gain,u.id]); await saveGame(u.id,"card",bet,win?"Gagne - Tri":"Perdu",net,"Karatra: "+hand.map(c=>c.label).join(" ")); let nb=await getUser(req); res.json({message:win?`🏆 GAGNE - Tri - ${hand.map(c=>c.label).join(" ")} - Gain ${gain}$`:`Perdu - ${hand.map(c=>c.label).join(" ")}`,newBalance:parseFloat(nb.balance),cards:hand}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/play-rami',auth,async(req,res)=>{ try{ let u=await getUser(req); let {type,code}=req.body; let tbR=await pool.query(`SELECT * FROM tables_tbl WHERE code=$1`,[String(code||"")]); let tb=tbR.rows[0]; let bet=tb?parseFloat(tb.mise):5; if(!tb){ if(parseFloat(u.balance)<bet) return res.status(400).json({message:"Solde tsy ampy"}); await pool.query(`UPDATE users SET balance=balance-$1 WHERE id=$2`,[bet,u.id]); } let deck=newDeck(); let hand=deck.slice(0,13); let ev=checkRami(hand,type||"bordel"); let fond=tb?parseFloat(tb.fond):bet*0.9; let gain=ev.win?fond:0; let net=ev.win?+(gain-(tb?0:bet)).toFixed(2):-(tb?0:bet); if(gain) await pool.query(`UPDATE users SET balance=balance+$1 WHERE id=$2`,[gain,u.id]); await saveGame(u.id,"rami",bet,ev.win?"Gagne - Rami":"Perdu",net,"Karatra: "+hand.map(c=>c.label).join(" ")+" | Quadri:"+ev.quadri+" Escalier:"+ev.escalier+" Tri:"+ev.tri); let nb=await getUser(req); res.json({message:ev.win?`🏆 GAGNE RAMI - ${hand.map(c=>c.label).join(" ")} - Gain ${gain}$`:`Perdu - ${hand.map(c=>c.label).join(" ")}`,newBalance:parseFloat(nb.balance),cards:hand,eval:ev}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/play-ludo',auth,async(req,res)=>{ try{ let u=await getUser(req); let {code}=req.body; let tbR=await pool.query(`SELECT * FROM tables_tbl WHERE code=$1`,[String(code||"")]); let tb=tbR.rows[0]; let bet=tb?parseFloat(tb.mise):5; if(!tb){ if(parseFloat(u.balance)<bet) return res.status(400).json({message:"Solde tsy ampy"}); await pool.query(`UPDATE users SET balance=balance-$1 WHERE id=$2`,[bet,u.id]); }
  // LUDO TENA MISA - Dice 1-6 - Baolina 4 - Board 56 cases - Izay baolina 2 tonga @ trano (56) no mandresy
  let pos=[0,0,0,0], posAdv=[0,0,0,0], log=[]; let tour=0; let win=false;
  while(tour<80){
    tour++;
    let d1=1+Math.floor(Math.random()*6); let d2=1+Math.floor(Math.random()*6);
    // Mpillalao - Mifidy baolina mbola tsy tonga - Mampandroso @ dice lehibe indrindra
    let idx=pos.findIndex(p=>p<56); if(idx===-1){ win=true; break; }
    pos[idx]+=Math.max(d1,d2); if(pos[idx]>=56) pos[idx]=56;
    log.push(`Tour ${tour} - Ianao dice ${d1}+${d2} - Baolina ${idx+1} -> ${pos[idx]}`);
    if(pos.filter(p=>p>=56).length>=2){ win=true; break; }
    let da=1+Math.floor(Math.random()*6); let idxA=posAdv.findIndex(p=>p<56); if(idxA!==-1){ posAdv[idxA]+=da; if(posAdv[idxA]>=56) posAdv[idxA]=56; }
    if(posAdv.filter(p=>p>=56).length>=2){ win=false; break; }
  }
  let fond=tb?parseFloat(tb.fond):bet*0.9; let gain=win?fond:0; let net=win?+(gain-(tb?0:bet)).toFixed(2):-(tb?0:bet); if(gain) await pool.query(`UPDATE users SET balance=balance+$1 WHERE id=$2`,[gain,u.id]); await saveGame(u.id,"ludo",bet,win?"Gagne - Ludo":"Perdu",net,log.join(" | ")); let nb=await getUser(req); res.json({message:win?`🏆 GAGNE LUDO - Baolina 2 tonga - Gain ${gain}$`:`Perdu LUDO - Baolina: ${pos.join(",")} - Adversaire: ${posAdv.join(",")}`,newBalance:parseFloat(nb.balance),pos,log}); }catch(e){ res.status(500).json({message:e.message}); } });
// --- HISTO / SUPPORT ---
app.get('/api/my-history',auth,async(req,res)=>{ try{ let u=await getUser(req); let d=await pool.query(`SELECT * FROM deposits WHERE user_id=$1 ORDER BY id DESC`,[u.id]); let w=await pool.query(`SELECT * FROM withdrawals WHERE user_id=$1 ORDER BY id DESC`,[u.id]); let g=await pool.query(`SELECT * FROM games WHERE user_id=$1 ORDER BY id DESC`,[u.id]); res.json({deposits:d.rows,withdrawals:w.rows,games:g.rows}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/support',auth,async(req,res)=>{ try{ let u=await getUser(req); let {message}=req.body; if(!message) return res.status(400).json({message:"Soraty hafatra"}); await pool.query(`INSERT INTO supports(user_id,nom,numero,message,date) VALUES($1,$2,$3,$4,$5)`,[u.id,u.nom,u.numero,message,now()]); notifyAdmin("support",`SUPPORT - ${u.nom}: ${message}`); res.json({message:"Hafatra voaray - Admin hamaly"}); }catch(e){ res.status(500).json({message:e.message}); } });
// --- ADMIN ---
app.get('/api/admin/members',isAdmin,async(req,res)=>{ try{ let r=await pool.query(`SELECT id,nom,numero,balance,pays FROM users ORDER BY id DESC`); res.json({members:r.rows}); }catch(e){ res.status(500).json({message:e.message}); } });
app.get('/api/admin/deposits',isAdmin,async(req,res)=>{ try{ let r=await pool.query(`SELECT * FROM deposits ORDER BY id DESC`); res.json({deposits:r.rows}); }catch(e){ res.status(500).json({message:e.message}); } });
app.get('/api/admin/withdrawals',isAdmin,async(req,res)=>{ try{ let r=await pool.query(`SELECT * FROM withdrawals ORDER BY id DESC`); res.json({withdrawals:r.rows}); }catch(e){ res.status(500).json({message:e.message}); } });
app.get('/api/admin/support',isAdmin,async(req,res)=>{ try{ let r=await pool.query(`SELECT * FROM supports ORDER BY id DESC`); res.json({support:r.rows}); }catch(e){ res.status(500).json({message:e.message}); } });
app.post('/api/admin/validate',isAdmin,async(req,res)=>{ try{ let {type,id,action,convertedUSD}=req.body; if(type==="deposit"){ let r=await pool.query(`SELECT * FROM deposits WHERE id=$1`,[Number(id)]); let d=r.rows[0]; if(!d) return res.status(404).json({message:"Depot tsy hita"}); if(action==="approve"){ let amt=parseFloat(convertedUSD)||parseFloat(d.amount); await pool.query(`UPDATE users SET balance=balance+$1 WHERE id=$2`,[amt,d.user_id]); await pool.query(`UPDATE deposits SET status='approved', amount=$1 WHERE id=$2`,[amt,d.id]); } else { await pool.query(`UPDATE deposits SET status='rejected' WHERE id=$1`,[d.id]); } return res.json({message:"Depot "+(action==="approve"?"approved":"rejected")}); } if(type==="withdraw"){ let r=await pool.query(`SELECT * FROM withdrawals WHERE id=$1`,[Number(id)]); let w=r.rows[0]; if(!w) return res.status(404).json({message:"Retrait tsy hita"}); if(action==="approve"){ await pool.query(`UPDATE withdrawals SET status='approved' WHERE id=$1`,[w.id]); } else { await pool.query(`UPDATE withdrawals SET status='rejected' WHERE id=$1`,[w.id]); await pool.query(`UPDATE users SET balance=balance+$1 WHERE id=$2`,[parseFloat(w.amount),w.user_id]); } return res.json({message:"Retrait "+(action==="approve"?"approved":"rejected")}); } return res.status(400).json({message:"Type diso"}); }catch(e){ res.status(500).json({message:e.message}); } });
const PORT=process.env.PORT||3000;
initDB().then(()=>{ http.listen(PORT,()=>console.log("MADA MLALAO POSTGRES - http://localhost:"+PORT)); }).catch(e=>{ console.error("DB ERROR",e); http.listen(PORT,()=>console.log("Serveur mandeha fa DB diso - Jereo DATABASE_URL")); });
