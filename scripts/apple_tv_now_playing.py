#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
"""Read-only current media and artwork over the already-paired AirPlay/MRP tunnel."""
import argparse,asyncio,base64,contextlib,ipaddress,json,os,signal,sys,time
from pathlib import Path
def reply(value):print(json.dumps(value,ensure_ascii=False),flush=True)
def text(value):return str(value or '')[:500]
def artwork_mime(data):
 if data.startswith(b'\xff\xd8\xff'):return 'image/jpeg'
 if data.startswith(b'\x89PNG\r\n\x1a\n'):return 'image/png'
 if data[:6] in [b'GIF87a',b'GIF89a']:return 'image/gif'
 if data[:4]==b'RIFF' and data[8:12]==b'WEBP':return 'image/webp'
 return None
async def run(config_path,once=False):
 import pyatv
 from pyatv.const import Protocol
 from pyatv.storage.file_storage import FileStorage
 cfg=json.loads(config_path.read_text());host=str(ipaddress.IPv4Address(cfg['host']))
 if not ipaddress.ip_address(host).is_private:raise ValueError('Invalid host')
 loop=asyncio.get_running_loop();storage=FileStorage(str(config_path.with_name('apple-tv-credentials.json')),loop);await storage.load()
 found=await pyatv.scan(loop,hosts=[host],protocol=Protocol.AirPlay,timeout=4,storage=storage)
 matches=[d for d in found if d.name==cfg['name']]
 if len(matches)!=1:raise RuntimeError('Paired TV unavailable')
 if not matches[0].get_service(Protocol.AirPlay).credentials:
  reply({'connected':False,'needsPairing':True});return
 tv=await asyncio.wait_for(pyatv.connect(matches[0],loop,storage=storage),15);stop=asyncio.Event();loop.add_signal_handler(signal.SIGTERM,stop.set)
 if not once:loop.add_reader(sys.stdin.fileno(),lambda:stop.set() if not sys.stdin.readline() else None)
 try:
  previous=None;artwork=None;last_art=0
  while not stop.is_set():
   playing=await asyncio.wait_for(tv.metadata.playing(),8)
   key=(playing.hash,playing.title,playing.artist,playing.album)
   if key!=previous or (artwork is None and time.monotonic()-last_art>15):
    artwork=None;last_art=time.monotonic()
    with contextlib.suppress(Exception):
     image=await asyncio.wait_for(tv.metadata.artwork(width=512,height=None),8)
     if image and len(image.bytes)<=1048576:
      mime=artwork_mime(image.bytes)
      if mime:artwork='data:'+mime+';base64,'+base64.b64encode(image.bytes).decode()
    previous=key
   app_name='';app_id=''
   with contextlib.suppress(Exception):
    current_app=tv.metadata.app
    if current_app:app_name=text(current_app.name);app_id=text(current_app.identifier)
   reply({'connected':True,'deviceState':playing.device_state.name,'app':app_name,'appId':app_id,'track':{'title':text(playing.title),'artist':text(playing.artist),'album':text(playing.album),'position':playing.position,'duration':playing.total_time,'artwork':artwork}})
   if once:break
   with contextlib.suppress(asyncio.TimeoutError):await asyncio.wait_for(stop.wait(),2)
 finally:
  if not once:loop.remove_reader(sys.stdin.fileno())
  loop.remove_signal_handler(signal.SIGTERM)
  await asyncio.gather(*tv.close(),return_exceptions=True)
if __name__=='__main__':
 os.umask(0o077);parser=argparse.ArgumentParser();parser.add_argument('--config',type=Path,required=True);parser.add_argument('--once',action='store_true');args=parser.parse_args()
 try:asyncio.run(run(args.config,args.once))
 except Exception as error:reply({'connected':False,'errorType':type(error).__name__});sys.exit(1)
