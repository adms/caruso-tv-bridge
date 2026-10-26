// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import {spawn} from 'node:child_process';
export function nowPlaying(value){
 if(!value||typeof value!=='object')throw Error('Invalid media data');
 if(value.connected!==true)return {connected:false,needsPairing:value.needsPairing===true};
 const track=value.track||{},bounded=n=>Number.isFinite(n)&&n>=0?Math.min(n,86400000)*1000:null;
 const safeText=v=>typeof v==='string'?v.slice(0,500):'';
 const artwork=typeof track.artwork==='string'&&track.artwork.length<1400000&&/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(track.artwork)?track.artwork:null;
 return {connected:true,observedAt:new Date().toISOString(),app:safeText(value.app),appId:safeText(value.appId),deviceState:['Playing','Paused','Stopped','Loading','Seeking','Idle'].includes(value.deviceState)?value.deviceState:'Unknown',track:{title:safeText(track.title),artist:safeText(track.artist),album:safeText(track.album),artwork,position:bounded(track.position),duration:bounded(track.duration)}};
}
export class NowPlaying {
 constructor({python,script,config,onUpdate,spawnWorker=spawn,retryMs=30000}){Object.assign(this,{python,script,config,onUpdate,spawnWorker,retryMs});}
 start(){if(this.running)return;this.running=true;this.connect();}
 connect(){if(!this.running)return;let child;try{child=this.spawnWorker(this.python,[this.script,'--config',this.config],{stdio:['pipe','pipe','ignore']});}catch{this.disconnected();return;}this.child=child;let buffer='',ended=false;
 const end=()=>{if(ended)return;ended=true;if(this.child===child)this.child=null;this.disconnected();};
 child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{buffer+=part;if(buffer.length>1500000){child.kill();return;}let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{this.onUpdate(nowPlaying(JSON.parse(line)));}catch{child.kill();}}});child.stdin.on('error',()=>{});child.on('error',end);child.on('close',end);
 }
 disconnected(){this.onUpdate({connected:false});if(this.running){clearTimeout(this.retry);this.retry=setTimeout(()=>this.connect(),this.retryMs);this.retry.unref?.();}}
 stop(){this.running=false;clearTimeout(this.retry);if(this.child){const child=this.child;child.stdin.end();const timer=setTimeout(()=>child.kill(),5000);timer.unref?.();child.once('close',()=>clearTimeout(timer));this.child=null;}}
}
