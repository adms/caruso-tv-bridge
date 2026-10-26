// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { encodeFrame, FrameDecoder, crc16, Caruso } from '../protocol.mjs';
const reply = (mid, body='', status=1, type=1) => {
  const b=Buffer.from(body),f=Buffer.alloc(10+b.length);f[2]=type;f.writeUInt16BE(mid,3);f[5]=status;f.writeUInt16BE(b.length,8);b.copy(f,10);f.writeUInt16BE(crc16(f),6);return f;
};
test('captured Caruso volume frame survives fragmentation and coalesced frames', () => {
  const raw=Buffer.from('000001004001f19a00023638','hex');const d=new FrameDecoder();
  assert.deepEqual(d.push(raw.subarray(0,7)),[]);
  const result=d.push(Buffer.concat([raw.subarray(7),raw]));
  assert.equal(result.length,2);assert.equal(result[0].mid,64);assert.equal(result[0].payload,'68');
});
test('request uses observed little-endian wire bytes', () => {
  assert.equal(encodeFrame(64,'68',2).toString('hex'),'000002400000000002003638');
});
test('metadata longer than 255 bytes and command IDs above 255 are preserved', () => {
  const d=new FrameDecoder();const payload='x'.repeat(522);const frames=d.push(reply(494,payload));
  assert.equal(frames[0].mid,494);assert.equal(frames[0].payload.length,522);
});
test('corrupted checksum and oversized frame fail closed', () => {
  const f=Buffer.from('000001004001f19a00023638','hex');f[11]=57;
  assert.throws(()=>new FrameDecoder().push(f),/checksum/);
  const bad=Buffer.alloc(10);bad.writeUInt16BE(6000,8);assert.throws(()=>new FrameDecoder().push(bad),/length/);
});
test('live TCP client confirms a volume response and rejects unsupported commands',async t=>{
  let volume=23,closing=false;
  const server=net.createServer(socket=>{
    socket.on('error',error=>{if(!closing||error.code!=='ECONNRESET')throw error;});
    let buf=Buffer.alloc(0);
    socket.on('data',chunk=>{
      buf=Buffer.concat([buf,chunk]);
      while(buf.length>=10){
        const n=buf.readUInt16LE(8);if(buf.length<10+n)break;
        const f=buf.subarray(0,10+n);buf=buf.subarray(10+n);const mid=f.readUInt16LE(3),body=f.subarray(10).toString();
        if(mid===3)socket.write(reply(3,'',1,2));
        else if(mid===64){if(f[2]===2)volume=Number(body);socket.write(reply(64,String(volume)));}
        else if(mid===51)socket.write(reply(51,'1'));
      }
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const c=new Caruso('127.0.0.1',{port:server.address().port});
  t.after(async()=>{closing=true;c.stop();await new Promise(r=>server.close(r));});
  const connected=new Promise(r=>c.on('state',s=>{if(s.connected)r();}));c.start();await connected;
  await assert.rejects(c.command('RESET'),/Unsupported/);
  await assert.rejects(c.command('volume',101),/integer/);
  assert.equal((await c.command('volume',22)).volume,22);
});
test('refused/empty response never becomes a zero volume',()=>{
  const c=new Caruso('127.0.0.1');c.state.volume=37;
  c.receive({mid:64,status:2,payload:''});assert.equal(c.state.volume,37);
  c.receive({mid:64,status:1,payload:''});assert.equal(c.state.volume,37);
});
test('unexpected disconnect reconnects and registers without sending a control command',async t=>{
 let connections=0;const commands=[];
 const server=net.createServer(socket=>{
  connections++;let registered=false;let buf=Buffer.alloc(0);
  socket.on('data',chunk=>{
   buf=Buffer.concat([buf,chunk]);
   while(buf.length>=10){const n=buf.readUInt16LE(8);if(buf.length<10+n)break;const f=buf.subarray(0,10+n);buf=buf.subarray(10+n);const mid=f.readUInt16LE(3);
    if(f[2]===2&&mid!==3)commands.push(mid);
    if(mid===3&&!registered){registered=true;socket.write(reply(3,'',1,2));if(connections===1)setTimeout(()=>socket.destroy(),50);}
   }
  });
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const c=new Caruso('127.0.0.1',{port:server.address().port});
 t.after(async()=>{c.stop();await new Promise(r=>server.close(r));});
 const recovered=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Reconnect failed')),4000);c.on('state',s=>{if(s.connected&&connections>=2){clearTimeout(timer);resolve();}});});
 c.start();await recovered;assert.equal(connections,2);assert.deepEqual(commands,[]);
});
test('timer refresh tolerates a destroyed or unwritable socket before close is delivered',()=>{
 const c=new Caruso('127.0.0.1');c.registered=true;c.socket={destroyed:true,writable:false};assert.doesNotThrow(()=>c.refresh());assert.equal(c.refresh(),false);
 c.socket={destroyed:false,writable:false};assert.equal(c.refresh(),false);
});
test('poll write failure closes the connection instead of escaping the timer callback',()=>{
 const c=new Caruso('127.0.0.1');let destroyed;const socket={destroyed:false,writable:true,destroy(e){destroyed=e;}};c.socket=socket;c.registered=true;c.send=()=>{throw Error('Device unavailable');};assert.doesNotThrow(()=>c.refresh(socket));assert.equal(c.registered,false);assert.match(destroyed.message,/unavailable/);
});
test('stale scheduled refresh cannot query a replacement connection',()=>{
 const c=new Caruso('127.0.0.1');const previous={destroyed:false,writable:true};c.socket={destroyed:false,writable:true};c.registered=true;let sent=0;c.send=()=>sent++;assert.equal(c.refresh(previous),false);assert.equal(sent,0);
});
