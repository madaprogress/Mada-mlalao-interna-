const express=require("express");const path=require("path");const {Pool}=require("pg");const bcrypt=require("bcryptjs");const jwt=require("jsonwebtoken");const helmet=require("helmet");const {rateLimit}=require("express-rate-limit");
const app=express();const PORT=process.env.PORT||10000;
const JWT_SECRET=process.env.JWT_SECRET||"MADA-MLALAO-2026-SECRET-XYZ-123";
const ADMIN_KEY=process.env.ADMIN_API_KEY||"ADMIN-MADA-2026-KEY-456";
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:"1mb"}));app.use(express.static(__dirname));app.use("/api/",rateLimit({windowMs:15*60*1000,limit:200}));
const networks=["T.BEP20 - USD","T.TRC20 - USD","BNB","TRX","S.BEP20 - USD","T.POLYGON - USD","T.ETH - USD","S.POLYGON - USD","S.ETH - USD","ETH","POLYGON","ETH - PYUSD","Yas - Paul","Airtel - Jean Romario","Orange - Jean Romario"];
async function initDatabase(){
await pool.query(`CREATE TABLE IF NOT EXISTS members (id SERIAL PRIMARY KEY,nom VARCHAR(150) NOT NULL,pays VARCHAR(80) DEFAULT 'Madagascar',numero VARCHAR(40) UNIQUE NOT NULL,password_hash TEXT NOT NULL,withdrawal_hash TEXT NOT NULL,balance NUMERIC(14,2) DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS deposits (id SERIAL PRIMARY KEY,member_id INTEGER REFERENCES members(id),method VARCHAR(100) NOT NULL,amount NUMERIC(14,2) NOT NULL,reference VARCHAR(200) NOT NULL,status VARCHAR(20) DEFAULT 'pending',commission NUMERIC(14,2) DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS withdrawals (id SERIAL PRIMARY KEY,member_id INTEGER REFERENCES members(id),method VARCHAR(100) NOT NULL,address VARCHAR(200) NOT NULL,amount NUMERIC(14,2) NOT NULL,status VARCHAR(20) DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS support_messages (id SERIAL PRIMARY KEY,member_id INTEGER REFERENCES members(id),message TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS admin_wallets (id SERIAL PRIMARY KEY,network VARCHAR(100) UNIQUE NOT NULL,address TEXT DEFAULT '',active BOOLEAN DEFAULT TRUE,updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS principal_wallet (id SERIAL PRIMARY KEY,total_commission NUMERIC(14,2) DEFAULT 0,total_deposits NUMERIC(14,2) DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS admin_notifications (id SERIAL PRIMARY KEY,member_id INTEGER, type VARCHAR(50), message TEXT, amount NUMERIC(14,2), is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());
INSERT INTO principal_wallet (id,total_commission,total_deposits) VALUES (1,0,0) ON CONFLICT (id) DO NOTHING;`);
for(const n of networks){await pool.query(`INSERT INTO admin_wallets (network) VALUES ($1) ON CONFLICT (network) DO NOTHING`,[n]);}
console.log("Database ready + Principal Wallet ready");
}
function makeToken(u){return jwt.sign({id:u.id},JWT_SECRET,{expiresIn:"7d"});}
async function auth(req,res,next){try{const h=req.headers.authorization||"";const t=h.startsWith("Bearer ")?h.slice(7):"";if(!t) return res.status(401).json({message:"Mila miditra"});const d=jwt.verify(t,JWT_SECRET);const r=await pool.query(`SELECT id,nom,pays,numero,balance FROM members WHERE id=$1`,[d.id]);if(!r.rowCount) return res.status(401).json({message:"Tsy hita"});req.user=r.rows[0];next();}catch{res.status(401).json({message:"Session diso"});}}
function adminAuth(req,res,next){if(req.headers["x-admin-key"]!==ADMIN_KEY) return res.status(403).json({message:"Admin refusé"});next();}
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.get("/api/status",async(req,res)=>{try{await pool.query("SELECT 1");res.json({ok:true,database:"connected"});}catch{res.status(500).json({ok:false});}});
// MEMBRE - REGISTER / LOGIN
app.post("/api/register",async(req,res)=>{try{const {nom,pays,numero,password,confirmPassword,withdrawalPassword}=req.body;if(!nom||!numero||!password||!confirmPassword||!withdrawalPassword) return res.status(400).json({message:"Fenoy daholo"});if(password!==confirmPassword) return res.status(400).json({message:"Tsy mitovy"});const h=await bcrypt.hash(password,10);const w=await bcrypt.hash(withdrawalPassword,10);const r=await pool.query(`INSERT INTO members (nom,pays,numero,password_hash,withdrawal_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id,nom,pays,numero,balance`,[nom.trim(),pays||"Madagascar",numero.trim(),h,w]);res.status(201).json({ok:true,message:"Vita",user:r.rows[0]});}catch(e){if(e.code==="23505") return res.status(409).json({message:"Efa misy"});res.status(500).json({message:"Erreur"});}});
app.post("/api/login",async(req,res)=>{try{const {numero,password}=req.body;const r=await pool.query(`SELECT * FROM members WHERE numero=$1`,[numero.trim()]);if(!r.rowCount) return res.status(401).json({message:"Diso"});const u=r.rows[0];if(!await bcrypt.compare(password,u.password_hash)) return res.status(401).json({message:"Diso"});res.json({ok:true,token:makeToken(u),user:{id:u.id,nom:u.nom,pays:u.pays,numero:u.numero,balance:u.balance}});}catch{res.status(500).json({message:"Erreur"});}});
app.get("/api/me",auth,async(req,res)=>res.json({ok:true,user:req.user}));
// WALLET PERSONNEL MEMBRE + ADRESSE PRINCIPAL AUTOMATIQUE
app.get("/api/my-wallet",auth,async(req,res)=>{try{const w=await pool.query(`SELECT network,address FROM admin_wallets ORDER BY id`);const p=await pool.query(`SELECT * FROM principal_wallet WHERE id=1`);res.json({ok:true,personal_balance:req.user.balance,member:req.user,deposit_addresses:w.rows,principal:p.rows[0]});}catch{res.status(500).json({message:"Erreur"});}});
// DEPOT - MANDEFA NOTIF AUTOMATIQUE AMIN'NY ADMIN
app.post("/api/deposit",auth,async(req,res)=>{try{const {method,amount,reference}=req.body;if(!method||!amount||!reference) return res.status(400).json({message:"Fenoy"});const comm=parseFloat(amount)*0.10;await pool.query(`INSERT INTO deposits (member_id,method,amount,reference,commission) VALUES ($1,$2,$3,$4,$5)`,[req.user.id,method,amount,reference,comm]);await pool.query(`INSERT INTO admin_notifications (member_id,type,message,amount) VALUES ($1,'depot',$2,$3)`,[req.user.id,`${req.user.nom} nanao DEPOT ${amount} USD via ${method} - Ref: ${reference} - Commission 10% = ${comm} USD`,amount]);res.json({ok:true,message:`Depot voaray - Commission 10% = ${comm} USD - Miandry validation Admin`});}catch{res.status(500).json({message:"Erreur"});}});
// RETRAIT - NOTIF AUTOMATIQUE
app.post("/api/withdraw",auth,async(req,res)=>{try{const {method,address,amount,withdrawalPassword}=req.body;if(!method||!address||!amount||!withdrawalPassword) return res.status(400).json({message:"Fenoy"});const r=await pool.query(`SELECT * FROM members WHERE id=$1`,[req.user.id]);if(!await bcrypt.compare(withdrawalPassword,r.rows[0].withdrawal_hash)) return res.status(401).json({message:"Mot de passe retrait diso"});if(parseFloat(req.user.balance)<parseFloat(amount)) return res.status(400).json({message:"Solde tsy ampy"});await pool.query(`INSERT INTO withdrawals (member_id,method,address,amount) VALUES ($1,$2,$3,$4)`,[req.user.id,method,address,amount]);await pool.query(`INSERT INTO admin_notifications (member_id,type,message,amount) VALUES ($1,'retrait',$2,$3)`,[req.user.id,`${req.user.nom} nanao RETRAIT ${amount} USD via ${method} vers ${address}`,amount]);res.json({ok:true,message:"Retrait voaray - Admin voampandrina"});}catch{res.status(500).json({message:"Erreur"});}});
// WALLET PRINCIPAL - HITAN'NY MEMBRE REHETRA
app.get("/api/wallets",async(req,res)=>{const r=await pool.query(`SELECT network,address,active FROM admin_wallets ORDER BY id`);res.json({ok:true,wallets:r.rows});});
app.get("/api/principal-wallet",async(req,res)=>{const r=await pool.query(`SELECT * FROM principal_wallet WHERE id=1`);res.json({ok:true,principal:r.rows[0]});});
// ADMIN - NOTIFS + VALIDATE + COMMISSION
app.get("/api/admin/notifications",adminAuth,async(req,res)=>{const r=await pool.query(`SELECT n.*,m.nom,m.numero FROM admin_notifications n JOIN members m ON m.id=n.member_id ORDER BY n.created_at DESC LIMIT 50`);res.json({ok:true,notifications:r.rows,unread: r.rows.filter(x=>!x.is_read).length});});
app.post("/api/admin/mark-read",adminAuth,async(req,res)=>{await pool.query(`UPDATE admin_notifications SET is_read=TRUE`);res.json({ok:true});});
app.get("/api/admin/deposits",adminAuth,async(req,res)=>{const r=await pool.query(`SELECT d.*,m.nom,m.numero FROM deposits d JOIN members m ON m.id=d.member_id ORDER BY d.created_at DESC LIMIT 100`);res.json({ok:true,deposits:r.rows});});
app.get("/api/admin/withdrawals",adminAuth,async(req,res)=>{const r=await pool.query(`SELECT w.*,m.nom,m.numero FROM withdrawals w JOIN members m ON m.id=w.member_id ORDER BY w.created_at DESC LIMIT 100`);res.json({ok:true,withdrawals:r.rows});});
app.get("/api/admin/members",adminAuth,async(req,res)=>{const r=await pool.query(`SELECT id,nom,pays,numero,balance,created_at FROM members ORDER BY created_at DESC LIMIT 100`);res.json({ok:true,members:r.rows});});
app.post("/api/admin/validate",adminAuth,async(req,res)=>{try{const {type,id,action}=req.body;const table=type==="deposit"?"deposits":"withdrawals";const status=action==="approve"?"approved":"rejected";const r=await pool.query(`UPDATE ${table} SET status=$1 WHERE id=$2 RETURNING *`,[status,id]);if(!r.rowCount) return res.status(404).json({message:"Tsy hita"});if(status==="approved"&&type==="deposit"){const net=parseFloat(r.rows[0].amount)-parseFloat(r.rows[0].commission||0);await pool.query(`UPDATE members SET balance=balance+$1 WHERE id=$2`,[net,r.rows[0].member_id]);await pool.query(`UPDATE principal_wallet SET total_commission=total_commission+$1,total_deposits=total_deposits+$2 WHERE id=1`,[r.rows[0].commission||0,r.rows[0].amount]);}
if(status==="approved"&&type==="withdraw"){await pool.query(`UPDATE members SET balance=balance-$1 WHERE id=$2`,[r.rows[0].amount,r.rows[0].member_id]);}res.json({ok:true,message:"Vita"});}catch{res.status(500).json({message:"Erreur"});}});
// JEUX - MILALAO TENA IZY
app.post("/api/play",auth,async(req,res)=>{try{
const {game,bet,choice}=req.body; bet=parseFloat(bet);
if(!bet||bet<=0) return res.status(400).json({message:"Bet diso"});
if(parseFloat(req.user.balance)<bet) return res.status(400).json({message:"Solde tsy ampy"});
let win=false; let multiplier=0; let result="";
if(game==="roulette"){const n=Math.floor(Math.random()*37); const isRed=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n); result=`Numero ${n} - ${n===0?'Vert':isRed?'Rouge':'Noir'}`; if((choice==="rouge"&&isRed)||(choice==="noir"&&!isRed&&n!==0)){win=true;multiplier=2;}}
if(game==="dice"){const d=Math.floor(Math.random()*6)+1; result=`Dice: ${d}`; if((choice==="plus"&&d>=4)||(choice==="moins"&&d<=3)){win=true;multiplier=1.9;}}
if(game==="crash"){const crash=(Math.random()*10+1).toFixed(2); result=`Crash a ${crash}x`; const cashout=parseFloat(choice)||2; if(parseFloat(crash)>=cashout){win=true;multiplier=cashout;}}
const gain=win?bet*multiplier:0; const net=win?gain-bet:-bet;
await pool.query(`UPDATE members SET balance=balance+$1 WHERE id=$2`,[net,req.user.id]);
const nb=await pool.query(`SELECT balance FROM members WHERE id=$1`,[req.user.id]);
res.json({ok:true,win,result,gain:win?gain:0,net,newBalance:nb.rows[0].balance,message:win?`🎉 GAGNE! ${result} - +${gain} USD`:`😢 PERDU - ${result} - -${bet} USD`});
}catch(e){res.status(500).json({message:"Erreur jeu"});}});
app.post("/api/support",auth,async(req,res)=>{await pool.query(`INSERT INTO support_messages (member_id,message) VALUES ($1,$2)`,[req.user.id,req.body.message]);await pool.query(`INSERT INTO admin_notifications (member_id,type,message) VALUES ($1,'support',$2)`,[req.user.id,`${req.user.nom} : ${req.body.message}`]);res.json({ok:true,message:"Voaray"});});
app.listen(PORT,()=>{console.log("ONLINE PORT "+PORT);initDatabase().then(()=>console.log("DB ready")).catch(e=>console.error("DB ERROR:",e.message));});
