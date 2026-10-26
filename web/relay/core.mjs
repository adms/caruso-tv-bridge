// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
// Message-only authenticated relay. Transport/identity must be explicitly supplied; no permissive fallback.
import {randomBytes,timingSafeEqual} from 'node:crypto';
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
function shape(value,keys){if(!value||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Invalid message fields');}
export function validateMessage(value){
 shape(value,['requestId','issuedAt','text','display','speak','seconds','speechVolume']);
 const {requestId,issuedAt,text,display,speak,seconds,speechVolume}=value;
 if(typeof requestId!=='string'||!/^[-\da-f]{36}$/i.test(requestId)||!Number.isSafeInteger(issuedAt))throw Error('Invalid request envelope');
 if(typeof text!=='string'||!text.isWellFormed()||!text.trim()||Array.from(text.trim()).length>280||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(text))throw Error('Text must contain 1–280 plain characters');
 if(typeof display!=='boolean'||typeof speak!=='boolean'||(!display&&!speak)||!Number.isInteger(seconds)||seconds<3||seconds>60||!Number.isFinite(speechVolume)||speechVolume<0||speechVolume>.7)throw Error('Invalid message options');
 return {text:text.trim(),display,speak,seconds,speechVolume};
}
export function createMessageRelay({origin,authenticate,messages,allowedSubjects,clock=Date.now,sessionTtl=300000}={}){
 const url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('A fixed HTTPS public origin is required');
 if(typeof authenticate!=='function'||!messages||!Array.isArray(allowedSubjects)||!allowedSubjects.length)throw Error('Explicit identity verification, receiver and owner allowlist required');
 const canonical=url.origin,owners=new Set(allowedSubjects),sessions=new Map(),used=new Map(),rates=new Map();let sending=false;
 function prune(now){for(const [key,value]of sessions)if(value.until<now)sessions.delete(key);for(const [key,until]of used)if(until<now)used.delete(key);for(const [key,value]of rates)if(value.until<now)rates.delete(key);}
 function limit(key,max,now){let state=rates.get(key);if(!state||state.until<now){if(rates.size>=512)throw Error('Relay capacity reached');state={count:0,until:now+60000};rates.set(key,state);}state.count++;return state.count<=max;}
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  const json=(code,value)=>{if(res.writableEnded)return;res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const now=clock();prune(now);
  if(req.headers.host!==url.host)return json(403,{error:'Invalid host'});
  if(req.headers.origin&&req.headers.origin!==canonical)return json(403,{error:'Invalid origin'});
  if(req.headers['sec-fetch-site']==='cross-site')return json(403,{error:'Cross-site request forbidden'});
  let pathname;try{const target=new URL(req.url,canonical);if(target.origin!==canonical||target.search)throw Error();pathname=target.pathname;}catch{return json(400,{error:'Invalid route'});}
  // No pairing, audio controls, arbitrary proxying, URLs, settings, files or debug endpoints exist.
  if(!['/api/session','/api/status','/api/message','/api/clear'].includes(pathname))return json(404,{error:'Not found'});
  let identity;try{identity=await authenticate(req);if(!identity||typeof identity.subject!=='string'||!owners.has(identity.subject))throw Error();}catch{return json(401,{error:'Verified owner identity required'});}
  try{if(!limit('requests:'+identity.subject,60,now))return json(429,{error:'Too many requests'});}catch{return json(503,{error:'Relay capacity reached'});}
  if(pathname==='/api/session'&&req.method==='GET'){
   if(sessions.size>=128)return json(503,{error:'Relay capacity reached'});const id=randomBytes(16).toString('hex'),secret=randomBytes(32).toString('hex');sessions.set(id,{secret,subject:identity.subject,until:now+sessionTtl});return json(200,{csrf:id+'.'+secret,expiresAt:now+sessionTtl,capabilities:['message','clear']});
  }
  if(pathname==='/api/status'&&req.method==='GET'){
   try{const s=await messages.status();return json(200,{connected:s.connected===true,displayReady:s.overlayPermission===true,speechReady:s.speechReady===true});}catch{return json(503,{error:'Receiver unavailable'});}
  }
  if(!['/api/message','/api/clear'].includes(pathname)||req.method!=='POST')return json(405,{error:'Method not allowed'});
  if(req.headers.origin!==canonical)return json(403,{error:'Explicit matching origin required'});
  const csrf=req.headers['x-relay-csrf'],parts=typeof csrf==='string'?csrf.split('.'):[],session=parts.length===2?sessions.get(parts[0]):null;
  if(!session||session.subject!==identity.subject||session.until<now||!equal(session.secret,parts[1]))return json(403,{error:'Invalid session'});
  if(req.headers['content-type']!=='application/json')return json(415,{error:'JSON required'});
  if(req.headers['content-encoding']||req.headers['transfer-encoding']||!/^\d+$/.test(req.headers['content-length']||'')||Number(req.headers['content-length'])>4096)return json(413,{error:'Bounded uncompressed JSON required'});
  let body;try{let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>4096)throw Error();parts.push(part);}body=JSON.parse(Buffer.concat(parts));}catch{return json(400,{error:'Invalid bounded JSON'});}
  let options;try{
   if(pathname==='/api/message')options=validateMessage(body);
   else {shape(body,['requestId','issuedAt']);if(typeof body.requestId!=='string'||!/^[-\da-f]{36}$/i.test(body.requestId)||!Number.isSafeInteger(body.issuedAt))throw Error();}
  }catch(e){return json(400,{error:e.message});}
  if(Math.abs(now-body.issuedAt)>30000)return json(409,{error:'Expired request; not forwarded'});
  const key=identity.subject+':'+body.requestId;
  if(used.has(key))return json(409,{error:'Duplicate or uncertain request; not forwarded again'});
  if(sending)return json(409,{error:'Another message is in progress'});
  if(used.size>=1024)return json(503,{error:'Relay capacity reached'});
  try{if(!limit('messages:'+identity.subject,10,now)||!limit('messages:all',20,now))return json(429,{error:'Message rate limit reached'});}catch{return json(503,{error:'Relay capacity reached'});}
  used.set(key,now+120000);sending=true;
  try{
   if(pathname==='/api/message'){const r=await messages.send(options);if(r.accepted!==true)throw Error();return json(200,{accepted:true,display:r.display===true,speechQueued:r.speechQueued===true});}
   const r=await messages.clear();if(r.cleared!==true)throw Error();return json(200,{cleared:true});
  }catch{return json(502,{error:'Receiver outcome unknown; no automatic retry'});}finally{sending=false;}
 };
}
