#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
"""Music-only developer screen worker; uses the existing pinned Apple TV pairing."""
import argparse,asyncio,base64,fcntl,json,os,re,sys
from pathlib import Path
APPS={'spotify':'com.spotify.client','apple':'com.apple.TVMusic'}
def reply(value):print(json.dumps(value,ensure_ascii=False),flush=True)
async def command():
 loop=asyncio.get_running_loop();future=loop.create_future()
 def ready():
  if not future.done():future.set_result(sys.stdin.readline())
 loop.add_reader(sys.stdin.fileno(),ready)
 try:return await asyncio.wait_for(future,180)
 finally:loop.remove_reader(sys.stdin.fileno())
async def run(cfg,directory,preview):
 from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel
 from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
 from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
 from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot
 serial=cfg['developerDeviceId']
 if not re.fullmatch(r'[A-Fa-f0-9-]{16,64}',serial):raise ValueError('Invalid device')
 tunnel=NativeRemotedTunnel(serial=serial)
 try:
  rsd=await asyncio.wait_for(tunnel.aopen(),20)
  if rsd.udid!=serial:raise RuntimeError('Wrong paired device')
  async with DvtProvider(rsd) as dvt:
   reply({'ok':True,'ready':True})
   while True:
    raw=await command()
    if not raw:break
    data=json.loads(raw);action=data.get('action')
    if action=='stop':break
    if action=='launch':
     if data.get('provider') not in APPS:raise ValueError('Invalid music application')
     async with ProcessControl(dvt) as control:pid=await asyncio.wait_for(control.launch(APPS[data['provider']],kill_existing=False),12)
     reply({'ok':isinstance(pid,int) and pid>0,'opened':True});continue
    if action!='capture':raise ValueError('Invalid action')
    async with Screenshot(dvt) as screenshot:image=await asyncio.wait_for(screenshot.get_screenshot(),10)
    if not image or len(image)>32*1024*1024:raise RuntimeError('Screen unavailable')
    png=directory/'screen.png';jpeg=directory/'screen.jpg'
    try:
     png.write_bytes(image)
     process=await asyncio.create_subprocess_exec(str(preview),str(png),str(jpeg),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
     try:output,_=await asyncio.wait_for(process.communicate(),8);code=process.returncode
     except BaseException:process.kill();await process.wait();raise
     if code or jpeg.stat().st_size>1048576:raise RuntimeError('Screen preview unavailable')
     reply({'ok':True,'blank':output.strip()==b'blank','image':'data:image/jpeg;base64,'+base64.b64encode(jpeg.read_bytes()).decode()})
    finally:png.unlink(missing_ok=True);jpeg.unlink(missing_ok=True)
 finally:await asyncio.wait_for(tunnel.aclose(),5)
if __name__=='__main__':
 os.umask(0o077);p=argparse.ArgumentParser();p.add_argument('--config',type=Path,required=True);p.add_argument('--directory',type=Path,required=True);p.add_argument('--preview',type=Path,required=True);args=p.parse_args()
 try:
  cfg=json.loads(args.config.read_text());args.directory.mkdir(parents=True,exist_ok=True,mode=0o700)
  with Path(cfg['screenLock']).open('a') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);asyncio.run(run(cfg,args.directory,args.preview))
 except Exception as error:reply({'ok':False,'message':'Apple TV 畫面連線未完成，請稍後重新開啟音樂服務。','errorType':type(error).__name__});sys.exit(1)
