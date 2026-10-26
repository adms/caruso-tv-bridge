// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
// Optical output uses the native amplifier level, independently of LUCI media volume.
export class KnobMute {
 constructor(controller,{saved=null,persist=()=>{}}={}){
  this.controller=controller;this.persist=persist;this.busy=false;
  this.saved=saved&&typeof saved.host==='string'&&Number.isInteger(saved.nativeVolume)&&saved.nativeVolume>0&&saved.nativeVolume<=63?{host:saved.host,nativeVolume:saved.nativeVolume}:null;
 }
 remember(value){this.persist(value);this.saved=value;}
 cancel(){if(this.saved)this.remember(null);this.controller.setAccessory({knobMuted:false});}
 async toggle(){
  if(this.busy)return;this.busy=true;
  const report=(status,knobMuted)=>this.controller.setAccessory({status,...(typeof knobMuted==='boolean'?{knobMuted}:{})});
  try{
   const initial=this.controller.snapshot();
   if(!initial.nativeConnected||initial.power!==true)throw Error('請等待音響連線及音量同步，再按旋鈕');
   const s=initial,age=Date.now()-Date.parse(s.nativeVolumeSeenAt);
   if(!Number.isFinite(age)||age<0||age>16000)throw Error('音量資料尚未同步，請稍後再試');
   if(!s.nativeConnected||s.power!==true||!Number.isInteger(s.nativeVolume)||s.nativeVolume<0||s.nativeVolume>63)throw Error('音量尚未確認，請稍後再試');
   if(this.saved&&(this.saved.host!==s.host||s.nativeVolume!==0))this.remember(null);
   const restoring=s.nativeVolume===0;
   if(restoring&&!this.saved){report('目前音量為零，請轉動旋鈕調整音量',false);return;}
   if(!restoring)this.remember({host:s.host,nativeVolume:s.nativeVolume});
   const target=restoring?this.saved.nativeVolume:0;
   await this.controller.command('nativeVolume',target);const actual=this.controller.snapshot();
   if(actual.host!==s.host||actual.power!==true||actual.sourceId!==s.sourceId||actual.nativeVolume!==target)throw Error('音量尚未確認，已停止操作，沒有自動重送');
   if(restoring)this.remember(null);
   report(restoring?'電視聲音已恢復原音量':'電視聲音已靜音 · 再按旋鈕恢復',!restoring);
  }catch(error){report(error.message,this.controller.snapshot().nativeVolume===0&&!!this.saved);}finally{this.busy=false;}
 }
}
