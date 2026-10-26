// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {lookup} from 'node:dns/promises';
import {McuClient} from './mcu.mjs';
export const privateDeviceHost=host=>typeof host==='string'&&/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host)&&host.split('.').every(v=>Number(v)<=255);
export function selectDiscovered(devices,{host,identity}={}){
 const candidates=[...devices].filter(d=>privateDeviceHost(d.address));
 if(identity)return candidates.find(d=>d.identity?.toLowerCase()===identity.toLowerCase())||null;
 return candidates.find(d=>d.address===host)||(candidates.length===1?candidates[0]:null);
}
export async function verifyCaruso(host,{factory=h=>new McuClient(h),timeout=6000}={}){
 if(!privateDeviceHost(host))return false;
 const client=factory(host);let timer,listener;
 try{return await new Promise(resolve=>{listener=state=>{if(state.connected&&state.masterVerified&&state.opticalVerified&&state.maxVolume===63)resolve(true);};client.on('state',listener);timer=setTimeout(()=>resolve(false),timeout);client.start();});}
 finally{clearTimeout(timer);client.off('state',listener);client.stop();}
}
export class LanDiscovery extends EventEmitter {
 constructor(controller,config,save,{nativeModule,native,resolve=lookup,verify=verifyCaruso,interval=20000}={}){super();this.controller=controller;this.config=config;this.save=save;this.resolve=resolve;this.verify=verify;this.interval=interval;this.native=native;this.nativeModule=nativeModule;this.generation=0;this.state={phase:'idle',message:'尚未開始搜尋',devices:[]};}
 update(value){this.state={...this.state,...value};this.controller.setDiscovery?.(this.state);this.emit('state',this.state);}
 start(){this.closed=false;this.scan();this.timer=setInterval(()=>{if(!this.controller.snapshot().nativeConnected)this.scan();},this.interval);}
 scan(){if(this.closed||this.scanning)return;this.scanning=true;const generation=++this.generation;this.devices=new Map();this.tasks=[];
  try{this.native??=createRequire(import.meta.url)(this.nativeModule);}catch{this.scanning=false;this.update({phase:'unavailable',message:'裝置探索元件尚未就緒'});return;}
  this.update({phase:'searching',policyDenied:false,message:'正在搜尋區網中的 Caruso…',devices:[]});
  const finish=async()=>{if(generation!==this.generation||!this.scanning)return;this.scanning=false;await Promise.allSettled(this.tasks);if(this.closed||generation!==this.generation)return;
   const list=[...this.devices.values()];this.update({devices:list.map(({address,name})=>({address,name}))});
   const candidate=selectDiscovered(list,{host:this.controller.host,identity:this.config.carusoIdentity});
   if(!candidate){this.update({phase:list.length?'choose':'not-found',message:list.length?'找到多台 Caruso，請選擇要連線的裝置':'暫時沒找到 Caruso，稍後會自動重試'});return;}
   if(candidate.address===this.controller.host){
    if(candidate.identity&&!this.config.carusoIdentity&&this.controller.snapshot().nativeConnected){this.config.carusoIdentity=candidate.identity;await this.save(this.config);}
    this.update({phase:'found',message:'已找到 Caruso，正在確認實際連線'});return;
   }
   this.update({phase:'verifying',message:'已找到 Caruso 新位址，正在驗證音響身分…'});
   if(!await this.verify(candidate.address)||this.closed||generation!==this.generation){this.update({phase:'not-found',message:'尚未確認音響身分，稍後自動重試'});return;}
   if(this.controller.snapshot().nativeConnected||this.controller.busy){this.update({phase:'found',message:'音響已連線，保留目前裝置'});return;}
   const previous={host:this.config.host,identity:this.config.carusoIdentity};this.config.host=candidate.address;if(candidate.identity)this.config.carusoIdentity=candidate.identity;
   try{await this.save(this.config);this.controller.setHost(candidate.address);this.update({phase:'found',message:'已自動更新音響位址並重新連線'});}catch{this.config.host=previous.host;this.config.carusoIdentity=previous.identity;this.update({phase:'error',message:'無法保存裝置位址，保留原設定'});}
  };
  this.deadline=setTimeout(()=>finish().catch(()=>this.update({phase:'error',message:'搜尋未完成，稍後會自動重試'})),11000);
  this.native.start(event=>{
   if(this.closed||generation!==this.generation)return;
   if(event.type==='error'&&event.code===-65570){clearTimeout(this.deadline);this.scanning=false;this.update({phase:'permission',policyDenied:true,message:'macOS 尚未允許區域網路探索，請在系統提示中允許'});return;}
   if(event.type==='finished'){clearTimeout(this.deadline);finish().catch(()=>this.update({phase:'error',message:'搜尋未完成，稍後會自動重試'}));return;}
   if(event.type!=='service'||!this.scanning||this.tasks.length>=18||!/^.{1,253}\.local\.$/i.test(event.host)||!event.name?.toLowerCase().includes('caruso'))return;
   this.tasks.push((async()=>{try{const {address}=await this.resolve(event.host,{family:4});if(this.closed||generation!==this.generation||!privateDeviceHost(address))return;const known=this.devices.get(address);if(this.devices.size>=6&&!known)return;this.devices.set(address,{address,name:'Caruso',identity:event.identity||known?.identity||null});}catch{}})());
  });
 }
 stop(){this.closed=true;++this.generation;clearInterval(this.timer);clearTimeout(this.deadline);this.native?.stop();this.scanning=false;}
}
