#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
"""Bounded developer screenshot worker for one previously paired Apple TV."""
import argparse,asyncio,fcntl,json,os,re,sys
from pathlib import Path
async def read_command():
 loop=asyncio.get_running_loop();result=loop.create_future()
 def ready():
  if not result.done():result.set_result(sys.stdin.readline())
 loop.add_reader(sys.stdin.fileno(),ready)
 try:return await asyncio.wait_for(result,120)
 finally:loop.remove_reader(sys.stdin.fileno())
def reply(value):print(json.dumps(value),flush=True)
async def run(config,output):
 from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel
 from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
 from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot
 from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
 serial=config['developerDeviceId']
 if not re.fullmatch(r'[A-Fa-f0-9-]{16,64}',serial):raise ValueError('Invalid developer device')
 tunnel=NativeRemotedTunnel(serial=serial)
 try:
  rsd=await asyncio.wait_for(tunnel.aopen(),20)
  if rsd.udid!=serial:raise RuntimeError('Wrong device')
  async with DvtProvider(rsd) as dvt:
   reply({'ready':True})
   while True:
    raw=await read_command()
    if not raw:break
    command=json.loads(raw)
    if command.get('action')=='stop':break
    if command.get('action')=='launch-netflix':
     async with ProcessControl(dvt) as pc:pid=await asyncio.wait_for(pc.launch('com.netflix.Netflix',kill_existing=True),12)
     reply({'launched':isinstance(pid,int) and pid>0});continue
    name=command.get('name','')
    if command.get('action')!='capture' or not re.fullmatch(r'frame-[0-9]{1,2}\.png',name):raise ValueError('Invalid capture request')
    async with Screenshot(dvt) as shot:data=await asyncio.wait_for(shot.get_screenshot(),10)
    if not data or len(data)>32*1024*1024:raise RuntimeError('Screenshot unavailable')
    (output/name).write_bytes(data);reply({'captured':name})
 finally:await asyncio.wait_for(tunnel.aclose(),5)
if __name__=='__main__':
 os.umask(0o077);parser=argparse.ArgumentParser();parser.add_argument('--config',type=Path,required=True);parser.add_argument('--output-dir',type=Path,required=True);args=parser.parse_args()
 try:
  config=json.loads(args.config.read_text());args.output_dir.mkdir(parents=True,exist_ok=True)
  with Path(config['screenLock']).open('a') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);asyncio.run(run(config,args.output_dir))
 except Exception as error:reply({'error':type(error).__name__});sys.exit(1)
