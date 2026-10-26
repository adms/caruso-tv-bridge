// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import {randomUUID} from 'node:crypto';
const privateHost=h=>typeof h==='string'&&/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(h)&&h.split('.').every(n=>+n<=255);
export class TvMessages {
 constructor(config={},save=()=>{}, {port=43719,fetcher=fetch}={}){this.config=config;this.save=save;this.port=port;this.fetcher=fetcher;}
 async request(path,data={},token=this.config.tvMessageToken){if(!privateHost(this.config.tvHost))throw Error('請先設定 Sony 的私有網路位址');
  const response=await this.fetcher(`http://${this.config.tvHost}:${this.port}${path}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});
  let value;try{value=await response.json();}catch{throw Error('電視接收器回應格式不正確');}
  if(!response.ok)throw Error(typeof value.error==='string'?value.error.slice(0,180):'電視未接受訊息');return value;
 }
 async pair(pin){if(typeof pin!=='string'||!/^\d{6}$/.test(pin))throw Error('請輸入電視顯示的六位數配對碼');
  const result=await this.request('/pair',{pin},null);if(typeof result.token!=='string'||!/^[\w-]{43}=?$/.test(result.token))throw Error('電視配對憑證格式不正確');
  const previous=this.config.tvMessageToken;this.config.tvMessageToken=result.token;try{await this.save(this.config);}catch{this.config.tvMessageToken=previous;throw Error('無法保存本機配對，請重新配對');}return {paired:true};
 }
 async status(){if(!this.config.tvMessageToken)return {paired:false,connected:false,message:'請先在 Sony 開啟 Caruso TV Messages，允許疊字並取得配對碼。'};
  try{const s=await this.request('/status');return {paired:true,connected:true,overlayPermission:s.overlayPermission===true,speechReady:s.speechReady===true,speechState:['initializing','ready','unavailable','queued','speaking','done','error'].includes(s.speechState)?s.speechState:'unknown',lastError:typeof s.lastError==='string'?s.lastError.slice(0,180):'',displaying:s.displaying===true};}
  catch{return {paired:true,connected:false,message:'電視訊息接收器未連線，請確認電視及接收器已開啟。'};}
 }
 async send({text,display=true,speak=true,seconds=10,speechVolume=.6}={}){
  if(typeof text!=='string'||![display,speak].every(v=>typeof v==='boolean')||(!display&&!speak))throw Error('請選擇字幕、語音或兩者');
  text=text.trim();if(!text||Array.from(text).length>280||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))throw Error('文字需為 1–280 字');
  if(!Number.isInteger(seconds)||seconds<3||seconds>60||!Number.isFinite(speechVolume)||speechVolume<0||speechVolume>1)throw Error('顯示時間或語音音量不正確');
  if(!this.config.tvMessageToken)throw Error('請先配對電視訊息接收器');
  const r=await this.request('/message',{text,display,speak,seconds,speechVolume,requestId:randomUUID()});if(r.accepted!==true)throw Error('電視未確認接收');return {accepted:true,display:r.display===true,speechQueued:r.speechQueued===true};
 }
 async clear(){if(!this.config.tvMessageToken)throw Error('請先配對電視訊息接收器');const r=await this.request('/clear');if(r.cleared!==true)throw Error('電視尚未確認清除');return {cleared:true};}
}
