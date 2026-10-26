// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import {EventEmitter} from 'node:events';
import {Caruso} from './protocol.mjs';
import {McuClient} from './mcu.mjs';
import {privateDeviceHost} from './discovery.mjs';
export const transportSources=new Set([0xc201,0xc202,0xc203,0xc204,0xc205,0xc206,0xc207,0xc209,0xc214,0xc215]);
export function capabilities(native){const source=native.sources?.find(s=>s.id===native.sourceId);const fresh=native.connected&&Date.now()-Date.parse(native.lastSeen)<16000;
 return {power:fresh?native.on:null,sourceId:native.sourceId,sourceName:source?.name||'尚未確認',sources:native.sources||[],nativeMuted:fresh&&typeof native.muted==='boolean'?native.muted:null,nativeVolume:native.volume,nativeVolumeSeenAt:Number.isFinite(native.volumeAt)?new Date(native.volumeAt).toISOString():null,nativeMaxVolume:native.maxVolume,nativeConnected:!!fresh,canTransport:!!(fresh&&native.on&&transportSources.has(native.sourceId)),transportReason:!fresh?'等待確認音響電源與音源':!native.on?'音響目前待機中':native.sourceId===0xc20c?'光纖輸入的播放／暫停請使用 Apple TV 遙控器':!transportSources.has(native.sourceId)?'目前音源的播放由來源裝置控制':''};}
export class DeviceController extends EventEmitter {
 constructor(host,{media=new Caruso(host),native=new McuClient(host)}={}){super();this.host=host;this.media=media;this.native=native;this.accessory={status:'尚未啟用 USB 旋鈕'};this.changed=()=>this.emit('state',this.snapshot());media.on('state',this.changed);native.on('state',this.changed);}
 snapshot(){const media=this.media.snapshot(),native=this.native.snapshot();return {...media,...capabilities(native),externalTransport:this.externalTransport,networkAccessHint:!native.connected&&/EHOSTUNREACH|EACCES|EPERM/.test((media.lastError||'')+' '+(native.lastError||'')),accessory:this.accessory,discovery:this.discovery};}
 start(){this.media.start();this.native.start();}
 stop(){this.media.stop();this.native.stop();}
 setDiscovery(value){this.discovery=value;this.changed();}
 setHost(host){if(!privateDeviceHost(host))throw Error('Private device address required');if(host===this.host)return;if(this.busy)throw Error('Device operation in progress');this.media.off('state',this.changed);this.native.off('state',this.changed);this.media.stop();this.native.stop();this.host=host;this.media=new Caruso(host);this.native=new McuClient(host);this.media.on('state',this.changed);this.native.on('state',this.changed);this.start();this.changed();}
 setExternalTransport(value){this.externalTransport=value;this.changed();}
 setAccessory(values){this.accessory={...this.accessory,...values};this.changed();}
 async command(action,value){if(this.busy)throw Error('請等待上一個操作完成');this.busy=true;
  try{
   if(action==='refresh')await this.native.refresh();
   else if(action==='source'){
    await this.native.refresh();const current=this.native.snapshot();
    if(!Number.isInteger(value)||!current.sources.some(s=>s.id===value))throw Error('未知音源，請重新讀取清單');
    if(current.on===false)await this.native.command('power',true);
    await this.native.command('source',value);
   }else if(['power','volumeStep','nativeVolume'].includes(action))await this.native.command(action,value);
   else {if(['PLAY','PAUSE','STOP','NEXT','PREV'].includes(action)){await this.native.refresh();if(!this.snapshot().canTransport)throw Error(this.snapshot().transportReason);}await this.media.command(action,value);}
   return this.snapshot();
  }finally{this.busy=false;}
 }
}
