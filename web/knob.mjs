// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export class Knob {
 constructor(controller,pressAction,{nativeModule,api,vendor,product,pushUsage=0xe2}={}){this.controller=controller;this.pressAction=pressAction;this.config={nativeModule,api,vendor,product,pushUsage};this.pending=0;this.down=new Set();this.closed=false;}
 start(){const {nativeModule,api,vendor,product}=this.config;if((!nativeModule&&!api)||!Number.isInteger(vendor)||!Number.isInteger(product))return;
  this.closed=false;this.listenerReady=false;this.deviceConnected=false;this.openFailed=false;this.connectionStatus();
  try{this.api=api||require(nativeModule);this.api.start(vendor,product,event=>this.receive(event));this.check=setInterval(()=>this.syncPermission(),2000);this.syncPermission();}
  catch{this.controller.setAccessory({status:'無法啟動 USB 旋鈕模組'});}
 }
 syncPermission(){if(!this.api||this.closed)return;const granted=this.api.checkAccess();
  if(granted!==this.permissionGranted){const previous=this.permissionGranted;this.permissionGranted=granted;this.controller.setAccessory({permissionGranted:granted});if(granted&&previous===false&&!this.listenerReady){this.api.stop();this.api.start(this.config.vendor,this.config.product,event=>this.receive(event));}}
 }
 connectionStatus(){this.controller.setAccessory({listenerReady:!!this.listenerReady,knobConnected:!!this.deviceConnected,inputPermissionNeeded:!!this.openFailed,status:this.openFailed?'無法開啟旋鈕：請允許輸入監控後重新連接':!this.listenerReady?'正在連接 USB 旋鈕…':this.deviceConnected?'USB 旋鈕已連線':'找不到設定的 USB 旋鈕，插入後會自動連接'});}
 requestPermission(){if(!this.api)return;this.api.requestAccess();this.syncPermission();}
 restart(){this.stop();this.start();}

 receive(event){if(event.type==='ready'){this.permissionGranted=this.api?.checkAccess()??event.granted;this.controller.setAccessory({permissionGranted:this.permissionGranted});return;}
  if(event.type==='opened'){this.listenerReady=true;this.openFailed=false;this.connectionStatus();return;}
  if(event.type==='openError'){this.listenerReady=false;this.openFailed=true;this.connectionStatus();return;}
  if(event.type==='device'){this.deviceConnected=event.connected;if(!event.connected){this.pending=0;this.down.clear();}this.connectionStatus();return;}
  if(event.type!=='key')return;const {usage,down}=event;
  if(!down){this.down.delete(usage);return;}
  this.controller.setAccessory({lastSignal:usage,lastSignalAt:new Date().toISOString(),listenerReady:true,knobConnected:true,inputPermissionNeeded:false});
  if(usage===this.config.pushUsage){if(!this.down.has(usage)){this.down.add(usage);try{Promise.resolve(this.pressAction.toggle()).catch(()=>this.controller.setAccessory({status:'旋鈕按下操作未完成'}));}catch{this.controller.setAccessory({status:'旋鈕按下操作未完成'});}}return;}
  if(usage!==0xe9&&usage!==0xea)return;
  if(this.pressAction.busy)return;
  try{this.pressAction.cancel?.();}catch{this.controller.setAccessory({status:'無法更新靜音狀態，請稍後再試'});return;}
  this.pending=Math.max(-8,Math.min(8,this.pending+(usage===0xe9?1:-1)));this.drain();
 }
 async drain(){if(this.running)return;this.running=true;
  try{while(this.pending&&!this.closed){const delta=Math.sign(this.pending);this.pending-=delta;try{await this.controller.command('volumeStep',delta);this.controller.setAccessory({status:'USB 旋鈕音量已同步'});}catch(e){this.pending=0;this.controller.setAccessory({status:e.message});}}}finally{this.running=false;}}
 stop(){this.closed=true;this.pending=0;this.down.clear();clearInterval(this.check);this.api?.stop();}
}
