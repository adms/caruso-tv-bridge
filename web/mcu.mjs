// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import net from 'node:net';
import {EventEmitter} from 'node:events';
export function frame(to, command, data=Buffer.alloc(0)) {
  const extended=command>255, body=Buffer.alloc((extended?2:1)+data.length);
  if(extended)body.writeUInt16LE(command);else body[0]=command;
  data.copy(body,extended?2:1);
  const header=body.length<256?Buffer.from([extended?0xa8:0xa9,to,0xee,body.length]):Buffer.from([extended?0xa8:0xa9,to,0xee,0,body.length>>8,body.length&255]);
  const result=Buffer.concat([header,body]);return Buffer.concat([result,Buffer.from([result.reduce((a,b)=>a+b,0)&255])]);
}
export class Decoder {
  buffer=Buffer.alloc(0);
  push(chunk){this.buffer=Buffer.concat([this.buffer,chunk]);const out=[];
    while(this.buffer.length){const b=this.buffer,type=b[0];if([0x99,0x96,0x95,0x69,0x66].includes(type)){out.push({type});this.buffer=b.subarray(1);continue;}
      if(![0xa8,0xa9].includes(type))throw Error('Unknown MCU frame');if(b.length<4)break;
      if(b[3]===0&&b.length<6)break;const h=b[3]?4:6,n=b[3]||b.readUInt16BE(4),c=type===0xa8?2:1;
      if(n<c||n>8192)throw Error('Invalid MCU length');if(b.length<h+n+1)break;
      const body=b.subarray(h,h+n),sum=type+b[1]+b[2]+(n&255)+(n>>8)+body.reduce((a,v)=>a+v,0);
      if((sum&255)!==b[h+n])throw Error('MCU checksum mismatch');
      out.push({type,to:b[1],from:b[2],command:c===2?body.readUInt16LE(0):body[0],data:body.subarray(c)});this.buffer=b.subarray(h+n+1);
    }return out;
  }
}
export function accept(state,p,now=Date.now()){
 if(p.to!==0xee||p.from!==0xc2||p.command!==0x3f||p.data.length<3)return;
 const id=p.data.readUInt16BE(0),info=p.data[2],d=p.data.subarray(3);
 if((info===1&&d.length>=1)||(info===0x81&&d.length>=2)){
  const extended=info===0x81,command=extended?d.readUInt16LE(0):d[0]^128;
  const name=d.subarray(extended?2:1).toString('utf8').replace(/\0/g,'').trim();
  if(name&&id!==0xc200)state.sources[id]={id,name,command};
  if(id===0xc20c)state.opticalVerified=name==='OPTICAL'&&command===0xde;
 }
 if(id===0xc200&&info===5&&d.length>=3){state.volume=d[0];state.maxVolume=d[2];state.masterVerified=d[2]===63&&d[0]<=63;state.volumeAt=now;}
 if(id===0xc200&&info===2&&d.length){let bits=d[0];if(d.length===2)bits=d.readUInt16BE();else if(d.length>=3)bits=d.readUIntLE(0,3);state.on=!!(bits&128);state.muted=!!(bits&4);state.comfortStandby=!!(bits&(1<<17));state.powerAt=now;}
 if(info===8){state.sourceId=id;state.sourceAt=now;}
}
export class McuClient extends EventEmitter {
 constructor(host,{port=50001}={}){super();this.host=host;this.port=port;this.state={sources:{},on:null,volume:null,sourceId:null};this.closed=false;this.waiters=new Set();this.lastQuery=0;this.queryVersion=0;this.published={connected:false,on:null,sources:[]};}
 snapshot(){return structuredClone(this.published);}
 publish(){if(this.socket?.destroyed||!this.ready())return;this.published={...this.state,sources:Object.values(this.state.sources),connected:true,lastSeen:new Date(Math.max(this.state.powerAt||0,this.state.volumeAt||0,this.state.sourceAt||0)).toISOString()};if(JSON.stringify(this.published)===this.lastPublished)return;this.lastPublished=JSON.stringify(this.published);this.emit('state',this.snapshot());}
 ready(){const s=this.state;return s.masterVerified&&s.opticalVerified&&s.powerAt>=this.lastQuery&&s.sourceAt>=this.lastQuery&&s.volumeAt>=this.lastQuery&&Date.now()-this.lastQuery>=1800&&Date.now()-s.powerAt>=750;}
 start(){this.connect();}
 connect(){if(this.closed)return;this.state={sources:{},on:null,volume:null,sourceId:null};const decoder=new Decoder();const socket=this.socket=net.createConnection({host:this.host,port:this.port});socket.setNoDelay(true);socket.setTimeout(16000,()=>socket.destroy(Error('MCU did not respond')));
  const timer=setTimeout(()=>socket.destroy(Error('MCU connection timeout')),3000);
  socket.on('connect',()=>{clearTimeout(timer);try{this.query();}catch(e){socket.destroy(e);return;}this.poll=setInterval(()=>{if(!this.action&&!this.refreshing)try{this.query();}catch(e){socket.destroy(e);}},8000);this.tick=setInterval(()=>{this.publish();this.notify();},100);});
  socket.on('data',chunk=>{try{for(const p of decoder.push(chunk)){if([0x95,0x69,0x96].includes(p.type))throw Error('MCU busy or rejected request');if(p.data){socket.write(Buffer.from([0x99]));accept(this.state,p);}this.notify();}}catch(e){socket.destroy(e);}});
  socket.on('error',e=>{this.lastError=e.message;});
  socket.on('close',()=>{clearTimeout(timer);clearInterval(this.poll);clearInterval(this.tick);this.published={...this.published,connected:false,lastError:this.lastError||'MCU disconnected'};this.emit('state',this.snapshot());this.notify(Error(this.published.lastError));if(!this.closed)this.retry=setTimeout(()=>this.connect(),3000);});
 }
 notify(error){for(const w of [...this.waiters])w(error);}
 wait(condition,ms=6000){return new Promise((resolve,reject)=>{const finish=error=>{if(error||condition()){clearTimeout(timer);this.waiters.delete(finish);error?reject(error):resolve();}};const timer=setTimeout(()=>{this.waiters.delete(finish);reject(Error('No actual device confirmation; outcome unknown'));},ms);this.waiters.add(finish);finish();});}
 query(){if(!this.socket||this.socket.destroyed||!this.socket.writable)throw Error('MCU unavailable');this.lastQuery=Date.now();this.queryVersion++;this.socket.write(frame(0,0x3f));}
 async refresh(){if(this.refreshing)return this.refreshing;this.refreshing=(async()=>{this.query();await this.wait(()=>this.ready());this.publish();return this.snapshot();})();try{return await this.refreshing;}finally{this.refreshing=null;}}
 async command(action,value){if(this.action)throw Error('Another device operation is in progress');this.action=true;
  try{await this.wait(()=>this.ready());if(!['volumeStep','nativeVolume'].includes(action))await this.refresh();
   const s=this.state;if(!s.masterVerified||!s.opticalVerified)throw Error('Device identity is not verified');
   let command,to=0xc2,confirmed,version;
   if(action==='power'){
    if(typeof value!=='boolean')throw Error('Boolean power state required');if(s.on===value)return this.snapshot();
    if(!value&&!s.comfortStandby)throw Error('Comfort standby is not available');
    command=value?0xd7:0x81;version=s.powerAt;confirmed=()=>s.powerAt>version&&s.on===value;
   }else if(action==='source'){
    const source=s.sources[value];if(!source||!Number.isInteger(value))throw Error('Unknown source; refresh the source list');
    if(!s.on)throw Error('Turn on Caruso before changing source');if(s.sourceId===value)return this.snapshot();
    command=source.command;to=source.id>>8;version=s.sourceAt;confirmed=()=>s.sourceAt>version&&s.sourceId===value;
   }else if(action==='nativeVolume'){
    if(!Number.isInteger(value)||value<0||value>s.maxVolume)throw Error('Native volume must be an integer within the confirmed range');
    if(!s.on)throw Error('Caruso is in standby');if(s.volume===value)return this.snapshot();
    command=0xa0;version=s.volumeAt;confirmed=()=>s.volumeAt>version&&s.volume===value;
   }else if(action==='volumeStep'){
    if(value!==1&&value!==-1)throw Error('Unit volume step required');if(!s.on)throw Error('Caruso is in standby');
    const target=s.volume+value;if(target<0||target>s.maxVolume)return this.snapshot();
    command=value===1?0x80:0xa0;version=s.volumeAt;confirmed=()=>s.volumeAt>version&&s.volume===target;
   }else throw Error('Unsupported native operation');
   this.socket.write(frame(to,command,action==='nativeVolume'?Buffer.from([value]):Buffer.alloc(0)));if(action==='nativeVolume')await this.refresh();await this.wait(confirmed,8000);this.publish();return this.snapshot();
  }finally{this.action=false;}
 }
 stop(){this.closed=true;clearTimeout(this.retry);clearInterval(this.poll);clearInterval(this.tick);this.notify(Error('Controller stopped'));this.socket?.destroy();}
}
