// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
const execute=promisify(execFile);
const stages={inventory:'確認音樂 App',screen:'連接電視畫面',wake:'喚醒 Apple TV',optical:'切換光纖輸入',launch:'開啟音樂 App',play:'繼續播放',capture:'讀取電視畫面',key:'傳送遙控按鍵',text:'輸入搜尋文字'};
function failed(error,stage){const message=error?.message||'操作未完成';const result=Error((stages[stage]||'音樂操作')+'：'+message);result.diagnostic={stage,type:/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error?.errorType||'')?error.errorType:'OperationError'};return result;}
function responseError(data,fallback){const error=Error(data.message||fallback);error.errorType=data.errorType;return error;}
export function musicInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['action','provider','key','query'].includes(k)))throw Error('無效的音樂操作');
 const {action,provider,key,query}=value;
 if(action==='transport'&&!['play','pause','next','previous'].includes(key))throw Error('不支援的播放器按鍵');
 if(!['resume','capture','key','text','close','account','transport'].includes(action)||!(action==='transport'?provider==='apple-tv':['spotify','apple'].includes(provider)))throw Error('不支援的 Apple TV 音樂操作');
 if(key!==undefined&&(!['key','transport'].includes(action)||!['up','down','left','right','select','menu','play','pause','next','previous'].includes(key)))throw Error('不支援的遙控按鍵');
 if(['key','transport'].includes(action)&&!key)throw Error('請指定按鍵');
 if(query!==undefined&&action!=='text')throw Error('不支援的搜尋參數');
 if(action==='text'&&(typeof query!=='string'||!query.trim()||query.length>120||/[\x00-\x1f\x7f]/.test(query)))throw Error('請輸入 1–120 字的歌名或歌手');
 return {action,provider,key,query};
}
class Screen {
 constructor({python,script,config,preview,directory}){Object.assign(this,{python,script,config,preview,directory});this.lines=[];this.buffer='';this.closed=true;}
 async start(){
  this.closed=false;this.process=spawn(this.python,[this.script,'--config',this.config,'--directory',this.directory,'--preview',this.preview],{stdio:['pipe','pipe','ignore']});
  this.process.stdout.setEncoding('utf8');this.process.stdout.on('data',chunk=>{this.buffer+=chunk;if(this.buffer.length>2000000){this.process.kill();return;}let i;while((i=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);if(this.pending){const p=this.pending;this.pending=null;p.resolve(line);}else if(this.lines.length<2)this.lines.push(line);else this.process.kill();}});
  const close=()=>{this.closed=true;if(this.pending){this.pending.reject(Error('Apple TV 畫面連線已結束，請重新開啟音樂服務'));this.pending=null;}};this.process.on('error',close);this.process.on('close',close);this.process.stdin.on('error',()=>{});
  const first=await this.next(30000);if(!first.ready)throw Error(first.message||'Apple TV 畫面服務尚未就緒');
 }
 async next(timeout=20000){const line=this.lines.length?this.lines.shift():await new Promise((resolve,reject)=>{if(this.closed)return reject(Error('Apple TV 畫面連線已結束'));const timer=setTimeout(()=>{this.pending=null;reject(Error('Apple TV 畫面等待逾時'));},timeout);this.pending={resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};});let data;try{data=JSON.parse(line);}catch{throw Error('Apple TV 畫面回應無效');}if(data.ok===false)throw responseError(data,'Apple TV 畫面未完成');return data;}
 async send(command){if(this.closed)throw Error('請重新開啟音樂服務');try{this.process.stdin.write(JSON.stringify(command)+'\n');return await this.next();}catch(error){await this.stop();throw error;}}
 async stop(){if(!this.process||this.closed)return;this.process.stdin.write('{"action":"stop"}\n');await new Promise(resolve=>{const t=setTimeout(()=>{this.process.kill();resolve();},5000);this.process.once('close',()=>{clearTimeout(t);resolve();});});}
}
export class MusicControl {
 constructor(controller,config,persist,{remoteScript,screenScript,preview,directory,run=execute,screenFactory=options=>new Screen(options),delay=ms=>new Promise(r=>setTimeout(r,ms))}){Object.assign(this,{controller,config,remoteScript,screenScript,preview,directory,run,screenFactory,delay});this.busy=false;this.active=null;}
 async remote(command){const tv=this.config.appleTV;if(!tv?.python||!tv.configFile)throw Error('Apple TV 控制尚未配對');let stdout;try{({stdout}=await this.run(tv.python,[this.remoteScript,'--config',tv.configFile,'--command',JSON.stringify(command)],{timeout:30000,maxBuffer:16384}));}catch(error){let result;try{result=JSON.parse(error.stdout?.trim());}catch{}if(result?.ok===false)throw responseError(result,'Apple TV 指令未完成');throw Error('Apple TV 連線未完成，沒有自動重送');}const result=JSON.parse(stdout.trim());if(!result.ok)throw responseError(result,'Apple TV 指令未完成');return result;}
 async step(stage,fn){try{return await fn();}catch(error){throw failed(error,stage);}}
 async frame(){return this.step('capture',async()=>{let frame=await this.screen.send({action:'capture'});for(let attempt=0;frame.blank&&attempt<2;attempt++){await this.delay(1000);frame=await this.screen.send({action:'capture'});}return frame;});}
 async previewFrame(){try{return await this.frame();}catch(error){return {frameUnavailable:true,diagnostic:error.diagnostic};}}
 matchesProvider(provider){const m=this.controller.snapshot().externalTransport?.metadata;if(!m?.connected||Date.now()-Date.parse(m.observedAt)>15000)return false;return m.appId?(m.appId===(provider==='apple'?'com.apple.TVMusic':'com.spotify.client')):(provider==='apple'?['音樂','Music','Apple Music'].includes(m.app):m.app==='Spotify');}
 async startScreen(){if(this.screen&&!this.screen.closed)return;await this.close();const cfg=JSON.parse(await readFile(this.config.appleTV.configFile,'utf8'));if(!cfg.diagnosticsPython||!cfg.developerDeviceId||!cfg.screenLock)throw Error('Apple TV 畫面連線尚未設定');this.temp=await mkdtemp(path.join(this.directory,'music-screen-'));this.screen=this.screenFactory({python:cfg.diagnosticsPython,script:this.screenScript,config:this.config.appleTV.configFile,preview:this.preview,directory:this.temp});await this.screen.start();}
 async close(){this.active=null;if(this.screen)await this.screen.stop();this.screen=null;if(this.temp)await rm(this.temp,{recursive:true,force:true});this.temp=null;}
 async optical(){const source=this.controller.snapshot().sources?.find(s=>s.name==='OPTICAL');if(!source)throw Error('尚未讀取到 Caruso 光纖輸入');const current=this.controller.snapshot();if(current.nativeConnected&&current.power===true&&current.sourceId===source.id)return;await this.controller.command('source',source.id);const state=this.controller.snapshot();if(!state.nativeConnected||state.power!==true||state.sourceId!==source.id)throw Error('尚未確認 Caruso 已開機並切到光纖，未送出播放鍵');}
 async handle(raw){const input=musicInput(raw);if(this.busy)throw Error('上一個 Apple TV 音樂操作尚未完成');this.busy=true;
  try{
   if(input.action==='account')return {ok:true,mode:'apple-tv',active:this.active};
   if(input.action==='close'){await this.close();return {ok:true,message:'已結束畫面遙控；Apple TV 音樂可繼續播放。'};}
   if(input.action==='transport'){
    const state=this.controller.snapshot();if(!state.nativeConnected||state.power!==true||state.sourceName!=='OPTICAL')throw Error('請先開啟 Caruso 並切到 Apple TV／光纖');
    const before=state.externalTransport?.metadata;await this.step('key',()=>this.remote({action:'key',key:input.key}));
    const expected=({play:'Playing',pause:'Paused'})[input.key];let confirmed=false;
    if(expected&&before?.connected)for(let n=0;n<25;n++){const current=this.controller.snapshot().externalTransport?.metadata;if(current?.connected&&current.observedAt>before.observedAt&&current.deviceState===expected){confirmed=true;break;}await this.delay(100);}
    const label=({play:'播放',pause:'暫停',next:'下一首',previous:'上一首'})[input.key];return {ok:true,requested:input.key,playbackConfirmed:confirmed,media:this.controller.snapshot().externalTransport?.metadata,message:confirmed?'Apple TV 已確認'+label:'已傳送 Apple TV '+label+'指令'};
   }
   const name=input.provider==='spotify'?'Spotify':'Apple Music';
   if(input.action==='resume'){
    const inventory=await this.step('inventory',()=>this.remote({action:'inventory'}));if(!inventory.apps?.[input.provider])throw Error('Apple TV 尚未安裝 '+name);
    try{
     await this.step('screen',()=>this.startScreen());await this.step('wake',()=>this.remote({action:'wake'}));await this.step('optical',()=>this.optical());await this.step('launch',()=>this.screen.send({action:'launch',provider:input.provider}));this.active=input.provider;await this.delay(2500);
     const frame=await this.previewFrame();return {ok:true,...frame,capturedAt:new Date().toISOString(),active:this.active,sourceConfirmed:true,playbackConfirmed:false,message:'已開啟 '+name+'，Caruso 已切到光纖。請在下方選歌；主畫面播放器可控制 Apple TV。'};
    }catch(e){await this.close();throw e;}
   }
   if(this.active!==input.provider)throw Error('請先開啟 Apple TV '+name);
   if(!this.screen||this.screen.closed){await this.step('screen',()=>this.startScreen());this.active=input.provider;}
   if(input.action==='capture'){const frame=await this.frame();return {ok:true,...frame,capturedAt:new Date().toISOString(),active:this.active,message:'已更新 Apple TV 畫面。'};}
   if(input.action==='key'){
    if(['play','pause','next','previous'].includes(input.key)&&!this.matchesProvider(input.provider))throw Error('請先在 '+name+' 內選歌開始播放；目前播放佇列尚未確認屬於此服務，不會繼續其他 App 的歌曲。');
    if(['play','next','previous','select'].includes(input.key))await this.optical();
    await this.step('key',()=>this.remote({action:'key',key:input.key}));await this.delay(350);
   }else if(input.action==='text')await this.step('text',()=>this.remote({action:'text',query:input.query}));
   const frame=await this.previewFrame();return {ok:true,...frame,capturedAt:new Date().toISOString(),active:this.active,playbackConfirmed:false,providerConfirmed:this.matchesProvider(input.provider),message:frame.frameUnavailable?'按鍵已送出；畫面暫時無法更新，請按「更新畫面」，歌曲資訊仍會同步。':input.action==='text'?'已輸入歌名，請在預覽選擇搜尋結果。':'已送出 Apple TV 按鍵並更新畫面。'};
  }finally{this.busy=false;}
 }
}
