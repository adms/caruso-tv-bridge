#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
"""Bounded Companion controls for the already-paired music Apple TV."""
import argparse,asyncio,ipaddress,json,os,sys
from pathlib import Path
APPS={'spotify':'com.spotify.client','apple':'com.apple.TVMusic'}
async def run(config_path,command):
 import pyatv
 from pyatv.const import Protocol,KeyboardFocusState
 from pyatv.storage.file_storage import FileStorage
 cfg=json.loads(config_path.read_text());host=str(ipaddress.IPv4Address(cfg['host']))
 if not ipaddress.ip_address(host).is_private:raise ValueError('Invalid host')
 loop=asyncio.get_running_loop();storage=FileStorage(str(config_path.with_name('apple-tv-credentials.json')),loop);await storage.load()
 found=await pyatv.scan(loop,hosts=[host],protocol=Protocol.Companion,timeout=4,storage=storage)
 matches=[d for d in found if d.name==cfg['name'] and d.get_service(Protocol.Companion).credentials]
 if len(matches)!=1:raise RuntimeError('Paired TV unavailable')
 tv=await pyatv.connect(matches[0],loop,storage=storage)
 try:
  action=command.get('action')
  if action=='inventory':
   apps=await tv.apps.app_list();ids={a.identifier for a in apps};return {'ok':True,'apps':{p:i in ids for p,i in APPS.items()}}
  if action=='wake':await tv.power.turn_on();return {'ok':True,'requested':'wake'}
  if action=='key':
   key=command.get('key')
   if key not in ['up','down','left','right','select','menu','play','pause','next','previous']:raise ValueError('Invalid key')
   await getattr(tv.remote_control,key)();await asyncio.sleep(.25);return {'ok':True,'requested':key}
  if action=='text':
   text=command.get('query')
   if not isinstance(text,str) or not 1<=len(text.strip())<=120 or any(ord(c)<32 or ord(c)==127 for c in text):raise ValueError('Invalid text')
   # No typing into an unverified field or automatic blind navigation.
   if tv.keyboard.text_focus_state!=KeyboardFocusState.Focused:
    await tv.keyboard.text_get()
   if tv.keyboard.text_focus_state!=KeyboardFocusState.Focused:return {'ok':False,'message':'請先用方向鍵在 Apple TV 音樂 App 選到搜尋輸入欄，再輸入歌名。'}
   await tv.keyboard.text_set(text)
   actual=await tv.keyboard.text_get()
   return {'ok':actual==text,'message':'歌名已輸入 Apple TV 搜尋欄。' if actual==text else '未確認搜尋欄收到文字，沒有自動重送。'}
  raise ValueError('Invalid action')
 finally:await asyncio.gather(*tv.close(),return_exceptions=True)
if __name__=='__main__':
 os.umask(0o077);parser=argparse.ArgumentParser();parser.add_argument('--config',type=Path,required=True);parser.add_argument('--command',required=True);args=parser.parse_args()
 try:print(json.dumps(asyncio.run(asyncio.wait_for(run(args.config,json.loads(args.command)),25)),ensure_ascii=False))
 except Exception as error:print(json.dumps({'ok':False,'message':'Apple TV 連線或指令未完成，沒有自動重送。','errorType':type(error).__name__},ensure_ascii=False));sys.exit(1)
