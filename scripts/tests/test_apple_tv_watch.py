# Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from apple_tv_watch import focused_result,resume_selected,playback_confirmed,active_profile,vertical_picker,picker_index,profile_editor,select_profile,GuardStop,watch

def row(text,x=.1,y=.4,width=.2,height=.03,**extra):return dict(text=text,x=x,y=y,width=width,height=height,confidence=1,**extra)
class Guards(unittest.TestCase):
 def test_query_and_home_recommendation_never_authorize_select(self):
  self.assertFalse(focused_result({'rows':[row('廢柴聯盟',y=.84)],'focusBoxes':[]}))
  self.assertFalse(resume_selected({'rows':[row('廢柴聯盟'),row('播放',lightBackground=.9)]}))
 def test_selected_poster_must_contain_exact_target(self):
  box=dict(x=.37,y=.33,width=.13,height=.32,whiteBorder=1)
  frame={'rows':[row('廢柴聯盟',x=.39,y=.36,width=.09)],'focusBoxes':[box]}
  self.assertTrue(focused_result(frame))
  frame['rows'][0]['text']='六人行';self.assertFalse(focused_result(frame))
  frame['rows']=[row('廢柴聯盟',x=.7,y=.36,width=.09)];self.assertFalse(focused_result(frame))
 def test_resume_requires_large_detail_title_and_selected_resume(self):
  title=row('廢柴聯盟',x=.04,y=.78,width=.32,height=.15)
  resume=row('接續播放第1季第1集',lightBackground=.69)
  self.assertTrue(resume_selected({'rows':[title,resume]}))
  resume['lightBackground']=0;self.assertFalse(resume_selected({'rows':[title,resume]}))
  resume['text']='從頭開始';resume['lightBackground']=.9;self.assertFalse(resume_selected({'rows':[title,resume]}))
  self.assertFalse(resume_selected({'rows':[resume]}))
 def test_profile_is_observed_and_playback_needs_title_episode_and_clock(self):
  self.assertTrue(active_profile({'rows':[row('Viewer',y=.8),row('切換使用者',y=.7)]},'viewer'))
  self.assertFalse(active_profile({'rows':[row('Other',y=.8),row('切換使用者',y=.7)]},'viewer'))
  rows=[row('廢柴聯盟',x=.8,y=.87),row('第1季第1集測試集數',x=.7,y=.83),row('04:53')]
  self.assertTrue(playback_confirmed({'rows':rows}))
  self.assertFalse(playback_confirmed({'rows':rows[:-1]}))
  rows[0]['text']='六人行';self.assertFalse(playback_confirmed({'rows':rows}))
class PickerGuards(unittest.TestCase):
 def test_vertical_picker_requires_focused_avatar_and_adjacent_exact_name(self):
  box=dict(x=.10,y=.51,width=.10,height=.18,whiteBorder=.96)
  frame={'rows':[row('選擇使用者',x=.1,y=.86),row('Viewer',x=.21,y=.58,width=.09,height=.04)],'focusBoxes':[box]}
  self.assertTrue(vertical_picker(frame,'viewer'));self.assertIsNone(picker_index(frame,'viewer'))
  frame['rows'][1]['text']='Other';self.assertFalse(vertical_picker(frame,'viewer'));self.assertTrue(vertical_picker(frame))
  box['whiteBorder']=.5;self.assertFalse(vertical_picker(frame))
 def test_editor_is_distinct_from_picker_and_horizontal_picker_is_retained(self):
  self.assertTrue(profile_editor({'rows':[row('編輯使用者')]}));self.assertFalse(vertical_picker({'rows':[row('編輯使用者'),row('Viewer')]}))
  frame={'rows':[row('誰在觀賞',x=.4,y=.8),row('Other',x=.2,y=.4,width=.1),row('Viewer',x=.45,y=.4,width=.1)]}
  self.assertEqual(picker_index(frame,'viewer'),1)
class PickerCalibration(unittest.IsolatedAsyncioTestCase):
 def frame(self,name):return {'rows':[row('選擇使用者',x=.1,y=.86),row(name,x=.21,y=.58,width=.09,height=.04)],'focusBoxes':[dict(x=.1,y=.51,width=.1,height=.18,whiteBorder=.96)]}
 async def test_even_restored_target_focus_calibrates_to_top_then_down_before_select(self):
  calls=[];frames=iter([self.frame('Other'),self.frame('Viewer'),{'rows':[row('首頁',y=.9),row('節目',y=.9)]}])
  async def keys(*names):calls.extend(names)
  async def capture(*args):return next(frames)
  await select_profile(self.frame('Viewer'),keys,capture,'viewer')
  self.assertEqual(calls,['up']*6+['down','select'])
 async def test_missing_target_stops_without_select_after_calibration(self):
  calls=[]
  async def keys(*names):calls.extend(names)
  async def capture(*args):return self.frame('Other')
  with self.assertRaises(GuardStop):await select_profile(self.frame('Other'),keys,capture,'viewer')
  self.assertEqual(calls[:6],['up']*6);self.assertNotIn('select',calls)
class PickerSettling(unittest.IsolatedAsyncioTestCase):
 async def test_target_label_without_border_waits_on_same_row_instead_of_skipping_it(self):
  helper=PickerCalibration();calls=[];target=helper.frame('Viewer');target['focusBoxes']=[]
  frames=iter([helper.frame('Other'),target,target,{'rows':[]}])
  async def keys(*names):calls.extend(names)
  async def capture(*args):return next(frames)
  await select_profile(helper.frame('Other'),keys,capture,'viewer')
  self.assertEqual(calls,['up']*6+['down','select'])


class ConfigurableProfile(unittest.IsolatedAsyncioTestCase):
 async def test_missing_profile_stops_before_any_device_action(self):
  result=await watch(None,None,{})
  self.assertFalse(result['playbackConfirmed'])
 async def test_different_profile_names_use_exact_target_in_picker(self):
  helper=PickerCalibration()
  for name in ['Viewer','Guest']:
   calls=[];frames=iter([helper.frame(name),{'rows':[]}])
   async def keys(*values):calls.extend(values)
   async def capture(*args):return next(frames)
   await select_profile(helper.frame('Other'),keys,capture,name)
   self.assertEqual(calls,['up']*6+['select'])

if __name__=='__main__':unittest.main()
