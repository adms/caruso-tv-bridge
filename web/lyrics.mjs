// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import {readFile,stat,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {trackSignature,freshMedia,selectLyrics} from './public/lyrics-sync.mjs';
const PROVIDER='https://lrclib.net',DAY=86400000,MAX_BODY=1024*1024;
export class LyricsService {
 constructor({fetchImpl=globalThis.fetch,cacheFile,now=Date.now,requestTimeout=8000}={}) {
  this.fetch=fetchImpl;this.cacheFile=cacheFile;this.now=now;this.requestTimeout=requestTimeout;this.cache=new Map();this.current={key:null,status:'idle',lines:[]};this.generation=0;this.retryAt=0;this.backoffUntil=0;this.nextRequest=0;this.closed=false;this.initialized=this.load();
 }
 async load(){if(!this.cacheFile)return;try{if((await stat(this.cacheFile)).size>4*MAX_BODY)return;const saved=JSON.parse(await readFile(this.cacheFile,'utf8'));if(saved.version!==1||!Array.isArray(saved.entries))return;for(const e of saved.entries.slice(-128)){if(typeof e.key!=='string'||e.key.length>2200||!['ready','unavailable','instrumental'].includes(e.status)||!Number.isFinite(e.expires)||e.expires<=this.now())continue;if(e.status==='ready'&&(!Array.isArray(e.lines)||e.lines.length>2000||!e.lines.length||e.lines.some((l,i)=>!Number.isFinite(l.time)||l.time<0||l.time>7202||typeof l.text!=='string'||l.text.length>500||(i&&e.lines[i-1].time>=l.time))))continue;this.cache.set(e.key,{key:e.key,status:e.status,lines:e.status==='ready'?e.lines:[],expires:e.expires,recordId:Number.isSafeInteger(e.recordId)?e.recordId:null});}}catch{}}
 async persist(){if(!this.cacheFile||this.closed)return;try{await mkdir(path.dirname(this.cacheFile),{recursive:true});const temporary=this.cacheFile+'.tmp';const body=JSON.stringify({version:1,entries:[...this.cache.values()].slice(-128)});if(Buffer.byteLength(body)>4*MAX_BODY)return;await writeFile(temporary,body,{mode:0o600});await rename(temporary,this.cacheFile);}catch{}}
 snapshot(){return {...this.current,provider:'LRCLIB'};}
 update(media){
  const sig=freshMedia(media,this.now())?trackSignature(media):null;
  if(!sig){if(this.current.key){this.generation++;this.abort?.abort();this.current={key:null,status:'idle',lines:[]};}return this.snapshot();}
  if(this.current.key===sig.key&&(this.current.status!=='error'||this.now()<this.retryAt))return this.snapshot();
  this.generation++;this.abort?.abort();this.current={key:sig.key,status:'loading',lines:[]};const generation=this.generation;this.pending=this.lookup(sig,generation).catch(()=>{});return this.snapshot();
 }
 async request(endpoint,params,signal){
  const wait=Math.max(0,this.nextRequest-this.now());if(wait)await new Promise(resolve=>setTimeout(resolve,Math.min(wait,500)));if(signal.aborted)throw Error('aborted');this.nextRequest=this.now()+300;
  const url=new URL(endpoint,PROVIDER);url.search=new URLSearchParams(params).toString();const timeout=AbortSignal.timeout(this.requestTimeout);const combined=AbortSignal.any([signal,timeout]);
  const response=await this.fetch(url.href,{headers:{'User-Agent':'CarusoRemote/0.5.31 (https://github.com/adms/caruso-tv-bridge)','Accept':'application/json'},redirect:'error',signal:combined});
  if(response.status===404){await response.body?.cancel?.().catch(()=>{});return null;}
  if(!response.ok){let seconds=Number(response.headers.get('retry-after'));if(!Number.isFinite(seconds)||seconds<=0){const date=Date.parse(response.headers.get('retry-after'));seconds=Number.isFinite(date)?Math.ceil((date-this.now())/1000):60;}if(response.status===429||response.status>=500)this.backoffUntil=this.now()+Math.max(60,Math.min(86400,seconds))*1000;await response.body?.cancel?.().catch(()=>{});throw Error('provider unavailable');}
  const length=Number(response.headers.get('content-length'));if(length>MAX_BODY){await response.body?.cancel?.().catch(()=>{});throw Error('response too large');}const chunks=[];let size=0;
  try{for await(const chunk of response.body){size+=chunk.length;if(size>MAX_BODY)throw Error('response too large');chunks.push(Buffer.from(chunk));}}catch(error){await response.body?.cancel?.().catch(()=>{});throw error;}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 async lookup(sig,generation){
  const controller=new AbortController();this.abort=controller;
  try{
   await this.initialized;if(this.closed||generation!==this.generation)return;
   const cached=this.cache.get(sig.key);if(cached&&cached.expires>this.now()){this.current={...cached,cached:true};return;}
   if(this.now()<this.backoffUntil)throw Error('backoff');
   // Search is an inexpensive database lookup. Fetch external-provider fallback only on an empty match.
   const records=await this.request('/api/search',{track_name:sig.title,artist_name:sig.artist},controller.signal);let match=selectLyrics(records,sig);
   if(!match){const exact=await this.request('/api/get',{track_name:sig.title,artist_name:sig.artist,album_name:sig.album,duration:String(Math.round(sig.duration))},controller.signal);match=selectLyrics(exact?[exact]:[],sig);}
   if(this.closed||generation!==this.generation)return;
   const entry={key:sig.key,status:match?.kind||'unavailable',lines:match?.lines||[],recordId:match?.recordId||null,expires:this.now()+(match?.kind==='ready'?7*DAY:6*3600000)};
   this.cache.delete(sig.key);this.cache.set(sig.key,entry);while(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);this.current={...entry,cached:false};await this.persist();
  }catch{if(!this.closed&&generation===this.generation){this.retryAt=Math.max(this.now()+60000,this.backoffUntil);this.current={key:sig.key,status:'error',lines:[],retryAt:this.retryAt};}}
 }
 close(){this.closed=true;this.generation++;this.abort?.abort();}
}
