require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const OpenAI = require('openai');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'salespilot.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, company TEXT, product TEXT, stage TEXT DEFAULT 'New', notes TEXT, last_message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id));
`);

app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET||'dev-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:false,maxAge:1000*60*60*24*7}}));
app.use(express.static(path.join(__dirname,'public')));

function hashPassword(password){return crypto.createHash('sha256').update(password).digest('hex');}
function requireAuth(req,res,next){if(!req.session.userId)return res.status(401).json({error:'Please sign in first.'});next();}
function user(req){return db.prepare('SELECT id,email FROM users WHERE id=?').get(req.session.userId);}

app.get('/api/me',(req,res)=>{if(!req.session.userId)return res.json({user:null});res.json({user:user(req)});});
app.post('/api/register',(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');
  if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8)return res.status(400).json({error:'Use a valid email and a password of at least 8 characters.'});
  try{const info=db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(email,hashPassword(password));req.session.userId=info.lastInsertRowid;res.json({ok:true,user:{id:Number(info.lastInsertRowid),email}});}catch(e){res.status(409).json({error:'An account with that email already exists.'});}
});
app.post('/api/login',(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!u||u.password_hash!==hashPassword(password))return res.status(401).json({error:'Invalid email or password.'});req.session.userId=u.id;res.json({ok:true,user:{id:u.id,email:u.email}});});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get('/api/leads',requireAuth,(req,res)=>res.json({leads:db.prepare('SELECT * FROM leads WHERE user_id=? ORDER BY id DESC').all(req.session.userId)}));
app.post('/api/leads',requireAuth,(req,res)=>{const b=req.body; if(!String(b.name||'').trim())return res.status(400).json({error:'Lead name is required.'}); const info=db.prepare('INSERT INTO leads(user_id,name,company,product,stage,notes) VALUES(?,?,?,?,?,?)').run(req.session.userId,String(b.name).trim(),String(b.company||''),String(b.product||''),String(b.stage||'New'),String(b.notes||''));res.json({lead:db.prepare('SELECT * FROM leads WHERE id=?').get(info.lastInsertRowid)});});
app.patch('/api/leads/:id',requireAuth,(req,res)=>{const id=Number(req.params.id);const existing=db.prepare('SELECT * FROM leads WHERE id=? AND user_id=?').get(id,req.session.userId);if(!existing)return res.status(404).json({error:'Lead not found.'});const b=req.body;db.prepare('UPDATE leads SET name=?,company=?,product=?,stage=?,notes=?,last_message=? WHERE id=? AND user_id=?').run(String(b.name??existing.name),String(b.company??existing.company),String(b.product??existing.product),String(b.stage??existing.stage),String(b.notes??existing.notes),String(b.last_message??existing.last_message),id,req.session.userId);res.json({lead:db.prepare('SELECT * FROM leads WHERE id=?').get(id)});});
app.delete('/api/leads/:id',requireAuth,(req,res)=>{db.prepare('DELETE FROM leads WHERE id=? AND user_id=?').run(Number(req.params.id),req.session.userId);res.json({ok:true});});

app.post('/api/generate',requireAuth,async(req,res)=>{
  const {leadName,company,product,conversation,goal,tone}=req.body;
  if(!leadName||!product)return res.status(400).json({error:'Lead name and product are required.'});
  if(!process.env.OPENAI_API_KEY)return res.json({mode:'demo',message:`Hi ${leadName}, just following up on ${product}. ${goal||'Would you be open to a quick conversation this week?'}${company?` I would be happy to tailor this for ${company}.`:''}`});
  try{
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const prompt=`You are SalesPilot AI, a concise B2B sales assistant. Write one natural follow-up message.
Lead: ${leadName}
Company: ${company||'Unknown'}
Product/service: ${product}
Previous conversation: ${conversation||'None'}
Goal: ${goal||'Get a reply'}
Tone: ${tone||'professional and friendly'}
Rules: no fake claims, no spammy pressure, no emojis unless useful, 80-120 words maximum. Return only the message.`;
    const response=await client.responses.create({model:process.env.OPENAI_MODEL||'gpt-5.6-luna',input:prompt});
    const message=response.output_text.trim();
    res.json({mode:'ai',message});
  }catch(e){console.error(e);res.status(500).json({error:'AI generation failed. Check your API configuration.'});}
});

app.post('/api/checkout',requireAuth,async(req,res)=>{
  if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_PRICE_ID)return res.status(503).json({error:'Payments are not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to .env.'});
  try{const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);const origin=process.env.APP_URL||`${req.protocol}://${req.get('host')}`;const checkout=await stripe.checkout.sessions.create({mode:'subscription',line_items:[{price:process.env.STRIPE_PRICE_ID,quantity:1}],success_url:`${origin}/?paid=1`,cancel_url:`${origin}/?cancelled=1`,customer_email:user(req).email});res.json({url:checkout.url});}catch(e){console.error(e);res.status(500).json({error:'Could not start checkout.'});}
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`SalesPilot running at http://localhost:${PORT}`));
