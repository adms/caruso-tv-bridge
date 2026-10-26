// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import dgram from 'node:dgram';
const exec=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
export class Sony {
 constructor({tvHost,tvMac,adbPath='/usr/local/bin/adb',tvPsk,tvCookie,adbServerPort=5037}={}){this.host=tvHost;this.mac=tvMac;this.adbPath=adbPath;this.adbServerPort=Number.isInteger(adbServerPort)&&adbServerPort>1023&&adbServerPort<65536?adbServerPort:5037;this.psk=tvPsk;this.cookie=tvCookie;}
 async rpc(method,params=[]){if(!this.host)throw Error('尚未設定電視位址');const r=await fetch(`http://${this.host}/sony/system`,{method:'POST',headers:{'Content-Type':'application/json',...(this.psk?{'X-Auth-PSK':this.psk}:{}),...(this.cookie?{'Cookie':this.cookie}:{})},body:JSON.stringify({method,params,id:1,version:'1.0'}),signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error(`Sony 電源介面：${r.status}`);const data=await r.json();if(data.error)throw Error('Sony 電源介面需要授權');return data.result;}
 async adb(...args){if(!this.host)throw Error('尚未設定電視位址');return (await exec(this.adbPath,['-P',String(this.adbServerPort),'-s',`${this.host}:5555`,...args],{timeout:4000,maxBuffer:262144})).stdout;}
 async connect(){await exec(this.adbPath,['-P',String(this.adbServerPort),'connect',`${this.host}:5555`],{timeout:4000,maxBuffer:4096});}
 async status(){try{const data=await this.rpc('getPowerStatus');const status=data?.[0]?.status;if(!['active','standby'].includes(status))throw Error('電視未回傳電源狀態');return {on:status==='active',method:'sony'};}catch{}
  try{await this.connect();const text=await this.adb('shell','dumpsys','power');const m=text.match(/mWakefulness=(Awake|Asleep|Dozing|Dreaming)\b/);if(!m)throw Error('電視未回傳電源狀態');return {on:['Awake','Dreaming'].includes(m[1]),method:'adb'};}catch{throw Error('無法確認電視狀態：請確認電視網路及既有偵錯授權');}}
 async setPower(on,method){if(method==='sony')await this.rpc('setPowerStatus',[{status:on}]);else await this.adb('shell','input','keyevent',on?'224':'223');}
 async wake(){if(!/^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(this.mac||''))throw Error('尚未設定電視網路喚醒位址');const mac=Buffer.from(this.mac.replaceAll(':',''),'hex'),packet=Buffer.concat([Buffer.alloc(6,255),...Array(16).fill(mac)]);const socket=dgram.createSocket('udp4');try{await new Promise((r,j)=>{socket.once('error',j);socket.bind(()=>{socket.setBroadcast(true);r();});});await new Promise((r,j)=>socket.send(packet,9,this.host.replace(/\.\d+$/,'.255'),e=>e?j(e):r()));}finally{socket.close();}}
}
export class GroupPower {
 constructor(sony,controller,{delayFn=delay,bridgeWait=9000}={}){this.sony=sony;this.controller=controller;this.delay=delayFn;this.bridgeWait=bridgeWait;this.busy=false;this.lastPress=0;this.confirmedOff=false;}
 async toggle(){const now=Date.now();if(this.busy||now-this.lastPress<1200)return;this.lastPress=now;this.busy=true;
  const report=status=>this.controller.setAccessory({status});
  try{let before;try{before=await this.sony.status();}catch(e){if(!this.sony.mac)throw e;report('嘗試喚醒電視…');await this.sony.wake();for(let n=0;n<4;n++){await this.delay(2500);try{before=await this.sony.status();if(before.on)break;}catch{}}if(!before?.on)throw Error('電視尚未回應網路喚醒；未操作音響');await this.align(true);this.confirmedOff=false;report('電視＋音響已開機');return;}
   const target=!before.on;report(target?'正在開啟電視＋音響…':'正在關閉電視＋音響…');await this.sony.setPower(target,before.method);
   let confirmed=false;for(let n=0;n<5;n++){await this.delay(1200);try{if((await this.sony.status()).on===target){confirmed=true;break;}}catch{}}
   if(!confirmed)throw Error('尚未收到電視電源狀態確認，不重送開關指令');
   this.confirmedOff=!target;await this.align(target);report(target?'電視＋音響已開機':'電視＋音響已待機');
  }catch(e){report(e.message);}finally{this.busy=false;}
 }
 async align(target){await this.delay(this.bridgeWait);await this.controller.command('refresh');if(this.controller.snapshot().power!==target)await this.controller.command('power',target);}
}
