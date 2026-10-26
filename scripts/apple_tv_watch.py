#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
"""Bounded, visually guarded Community workflow; no recommendation Play fallback."""
import asyncio,json,re,tempfile
from pathlib import Path

TITLE='廢柴聯盟'
def norm(text):return re.sub(r'\s+','',text).casefold()
def title_row(row):return norm(row.get('text','')) in (norm(TITLE),'community')
def inside(row,box):
 x=row['x']+row['width']/2;y=row['y']+row['height']/2
 return box['x']<=x<=box['x']+box['width'] and box['y']<=y<=box['y']+box['height']
def focused_result(frame):
 # Exact title on the selected poster, not the query or unrelated page text.
 return any(title_row(r) and .25<r['x']<.95 and r['y']<.65 and inside(r,b)
  for b in frame.get('focusBoxes',[]) if .07<b['width']<.25 and .20<b['height']<.50 and b.get('whiteBorder',0)>.90
  for r in frame.get('rows',[]))
def resume_selected(frame):
 rows=frame.get('rows',[])
 detail=any(title_row(r) and r['x']<.15 and r['y']>.65 and r['height']>.06 for r in rows)
 resume=[r for r in rows if re.fullmatch(r'(接續播放|繼續觀看)第\d+季第\d+集',norm(r.get('text',''))) or re.fullmatch(r'resume(?:playing)?s\d+e\d+',norm(r.get('text','')))]
 return detail and any(r['x']<.35 and .15<r['y']<.60 and r.get('lightBackground',0)>.60 for r in resume)
def playback_confirmed(frame):
 rows=frame.get('rows',[])
 return any(title_row(r) and r['x']>.5 and r['y']>.65 and r['height']<.08 for r in rows) and any(re.search(r'第\d+季第\d+集|S\d+.*E\d+',r.get('text',''),re.I) and r['x']>.45 for r in rows) and any(re.fullmatch(r'\d{1,2}:\d{2}(?::\d{2})?',norm(r.get('text',''))) for r in rows)
def navigation(frame):
 text=' '.join(r['text'] for r in frame.get('rows',[]) if r['y']>.88)
 return '首頁' in text and ('節目' in text or '電影' in text)
def active_profile(frame,profile):
 rows=frame.get('rows',[])
 return any(norm(r['text'])==norm(profile) and r['x']<.3 and r['y']>.5 for r in rows) and any('切換使用者' in r['text'] or 'Switch Profile' in r['text'] for r in rows)
def profile_picker(frame):
 return any(any(t in r.get('text','') for t in ('誰在觀賞','誰要觀賞','選擇使用者',"Who's watching")) for r in frame.get('rows',[]))
def profile_editor(frame):
 return any(norm(r.get('text','')) in ('編輯使用者','editprofile') for r in frame.get('rows',[]))
def vertical_picker(frame,profile=None):
 if not profile_picker(frame):return False
 rows=[r for r in frame.get('rows',[]) if profile is None or norm(r.get('text',''))==norm(profile)]
 # New Netflix picker: a white focused avatar at left, its name immediately to its right.
 return any(.06<b['width']<.2 and .08<b['height']<.3 and b['x']<.25 and b.get('whiteBorder',0)>.9
  and 0<r['x']-(b['x']+b['width'])<.2 and b['y']<r['y']+r['height']/2<b['y']+b['height']
  for b in frame.get('focusBoxes',[]) for r in rows)
def selected_profile_label(frame,profile):
 # In the vertical picker only the focused avatar has this large label at its right.
 return profile_picker(frame) and any(norm(r.get('text',''))==norm(profile) and .20<r['x']<.45 and .15<r['y']<.85 and r['height']>.035 and r.get('confidence',0)>.8 for r in frame.get('rows',[]))
def picker_index(frame,profile):
 rows=frame.get('rows',[])
 if not profile_picker(frame) or vertical_picker(frame):return None
 target=next((r for r in rows if norm(r['text'])==norm(profile)),None)
 if not target:return None
 names=sorted([r for r in rows if abs(r['y']-target['y'])<.04 and r.get('confidence',0)>.4],key=lambda r:r['x'])
 if len(names)>6:return None
 return next((i for i,r in enumerate(names) if r is target),None)

class GuardStop(Exception):pass
class Screen:
 def __init__(self,config_path,options,directory):self.config=config_path;self.options=options;self.directory=Path(directory);self.process=None;self.number=0
 async def start(self):
  self.process=await asyncio.create_subprocess_exec(self.options['diagnosticsPython'],str(Path(__file__).with_name('apple_tv_screen.py')),'--config',str(self.config),'--output-dir',str(self.directory),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
  if not (await self.response()).get('ready'):raise GuardStop('畫面驗證連線未就緒，未操作 Netflix')
 async def response(self):
  line=await asyncio.wait_for(self.process.stdout.readline(),30)
  if not line or len(line)>4096:raise GuardStop('畫面驗證連線中斷，已停止操作')
  value=json.loads(line)
  if value.get('error'):raise GuardStop('無法取得 Apple TV 畫面，已停止操作')
  return value
 async def command(self,action,**fields):
  self.process.stdin.write((json.dumps({'action':action,**fields})+'\n').encode());await self.process.stdin.drain();return await self.response()
 async def capture(self):
  self.number+=1;name=f'frame-{self.number}.png';await self.command('capture',name=name)
  executable=Path(__file__).with_name('caruso-ocr')
  if not executable.exists():executable=Path(__file__).resolve().parents[1]/'web/native/caruso-ocr'
  process=await asyncio.create_subprocess_exec(str(executable),str(self.directory/name),str(self.options.get('profileName','')),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
  try:out,_=await asyncio.wait_for(process.communicate(),20)
  except BaseException:process.kill();await process.wait();raise
  finally:(self.directory/name).unlink(missing_ok=True)
  if process.returncode or len(out)>256*1024:raise GuardStop('畫面文字辨識失敗，已停止操作')
  return json.loads(out)
 async def close(self):
  if not self.process:return
  try:
   if self.process.returncode is None:
    self.process.stdin.write(b'{"action":"stop"}\n');await self.process.stdin.drain();await asyncio.wait_for(self.process.wait(),8)
  except (Exception,asyncio.CancelledError):
   if self.process.returncode is None:self.process.kill();await self.process.wait()

async def select_profile(frame,keys,capture,profile):
 if vertical_picker(frame):
  # Always establish the top anchor; never assume the restored focus is the first profile.
  await keys(*(['up']*6));frame=await capture()
  for _ in range(6):
   if vertical_picker(frame,profile):break
   if selected_profile_label(frame,profile):
    # Focus animation can temporarily hide its detectable border: wait at the same row.
    settled=await capture(.9)
    if vertical_picker(settled,profile) or selected_profile_label(settled,profile):
     frame=settled;break
    raise GuardStop('使用者焦點尚未穩定，沒有繼續往下或選取')
   await keys('down');frame=await capture(.9)
  if not (vertical_picker(frame,profile) or selected_profile_label(frame,profile)):raise GuardStop('未確認直排選單選中設定的使用者，沒有選擇使用者')
  await keys('select');return await capture(2)
 index=picker_index(frame,profile)
 if index is not None:
  await keys(*(['left']*6+['right']*index+['select']));return await capture(2)
 return frame

async def watch(atv,config_path,options,reconnect=None):
 stage='啟動驗證';selected=False
 profile=options.get('profileName')
 if not isinstance(profile,str) or not profile.strip() or len(profile)>80 or any(ord(c)<32 for c in profile):return {'playbackConfirmed':False,'message':'尚未設定有效的 Netflix 使用者，未操作 Netflix'}
 try:
  with tempfile.TemporaryDirectory(prefix='caruso-netflix-') as directory:
   screen=Screen(config_path,options,directory)
   try:
    await screen.start()
    async def keys(*names):
     for name in names:await asyncio.wait_for(getattr(atv.remote_control,name)(),5);await asyncio.sleep(.15)
    async def capture(delay=.6):await asyncio.sleep(delay);return await screen.capture()
    await asyncio.wait_for(atv.power.turn_on(),12)
    await screen.command('launch-netflix')
    if reconnect is not None:atv=await reconnect()
    frame=await capture(4)
    stage='確認 Netflix 入口'
    # Wait for startup and normalize only a positively recognized profile editor.
    for _ in range(3):
     if navigation(frame) or profile_picker(frame):break
     if profile_editor(frame):await keys('menu');frame=await capture(.8)
     else:frame=await capture(1)
    frame=await select_profile(frame,keys,capture,profile)
    if not navigation(frame):raise GuardStop('無法確認 Netflix 導覽畫面，沒有按下播放')
    stage='確認設定的 Netflix 使用者'
    await keys(*(['up']*5+['left']*6));frame=await capture()
    if not active_profile(frame,profile):raise GuardStop('目前使用者無法確認為設定的使用者，沒有按下播放')
    stage='搜尋廢柴聯盟'
    await keys('right');await asyncio.sleep(1);await keys('down');await asyncio.sleep(.8)
    await asyncio.wait_for(atv.keyboard.text_set(TITLE),8)
    if norm((await asyncio.wait_for(atv.keyboard.text_get(),5)) or '')!=norm(TITLE):raise GuardStop('搜尋欄未收到正確片名，沒有選取影片')
    await asyncio.sleep(1.5)
    for _ in range(4):
     await keys('down');frame=await capture(.7)
     if focused_result(frame):break
     if any(.07<b['width']<.25 and .20<b['height']<.50 and b.get('whiteBorder',0)>.9 for b in frame.get('focusBoxes',[])):
      await keys(*(['left']*6));frame=await capture(.7);break
    if not focused_result(frame):raise GuardStop('沒有確認選中《廢柴聯盟》搜尋結果，沒有選取影片')
    stage='確認廢柴聯盟與接續播放'
    await keys('select');frame=await capture(1.5)
    if not resume_selected(frame):raise GuardStop('無法確認《廢柴聯盟》的接續播放按鈕，沒有播放')
    stage='核對實際播放';selected=True;await keys('select');await asyncio.sleep(3);await keys('down');frame=await capture(.8)
    confirmed=playback_confirmed(frame)
    for _ in range(2):
     if confirmed:break
     frame=await capture(.6);confirmed=playback_confirmed(frame)
    if not confirmed:raise GuardStop('已選取正確影集的接續播放，但尚無法確認播放畫面；不會自動重試')
    return {'requested':'community','profileConfirmed':True,'titleConfirmed':True,'playbackConfirmed':True,'message':'已確認設定的使用者，正在接續播放《廢柴聯盟》。'}
   finally:await screen.close()
 except GuardStop as error:return {'playbackConfirmed':False,'stage':stage,'resumeSelected':selected,'message':str(error)}
 except Exception:return {'playbackConfirmed':False,'stage':stage,'resumeSelected':selected,'message':f'{stage}未完成，已停止操作，沒有自動重送。'}
