# Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import importlib.util,subprocess,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('public_tree',Path(__file__).resolve().parents[1]/'check_public_tree.py');policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
class PublicationPolicy(unittest.TestCase):
 def check(self,name,text):return policy.inspect_bytes(name,text.encode())
 def test_untracked_source_is_part_of_candidate(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);subprocess.run(['git','init','-q',str(root)],check=True)
   (root/'new-file.js').write_text('safe');(root/'.gitignore').write_text('.local/\n');(root/'.local').mkdir();(root/'.local/private.json').write_text('private')
   paths,in_git=policy.candidate_files(root);self.assertTrue(in_git);self.assertIn(Path('new-file.js'),paths);self.assertNotIn(Path('.local/private.json'),paths)
 def test_local_state_and_binaries_are_refused_even_if_force_added(self):
  for name in ['devices.json','apple-tv-credentials.json','custom-credentials.json','pairing-state.json','x.p12','native/helper.node','.local/a.txt','x.app/data.txt']:
   self.assertTrue(self.check(name,'data'))
 def test_actual_private_address_personal_path_and_hardware_id_are_refused(self):
  for value in ['.'.join(['192','168','7','77']),'/'.join(['','Users','fixture','secret']),':'.join(['ab']*6),'-'.join(['a'*8,'b'*4,'c'*4,'d'*4,'e'*12])]:self.assertTrue(self.check('web/config.mjs',value))
 def test_private_key_and_provider_token_are_refused_without_echo(self):
  for value in ['-----BEGIN '+'PRIVATE KEY-----','ghp_'+'A'*40,'https://'+'user:password'+'@example.test']:
   reasons=self.check('web/config.mjs',value);self.assertTrue(reasons);self.assertNotIn(value,str(reasons))
 def test_examples_synthetic_addresses_and_safe_text_are_accepted(self):
  self.assertFalse(self.check('examples/devices.example.json','{"host":"10.0.0.123"}'))
  self.assertFalse(self.check('web/config.mjs','process.env.DEVICE_SECRET'))
 def test_unlisted_binary_and_symlink_candidate_are_refused(self):
  self.assertTrue(policy.inspect_bytes('debug.png',bytes([255,0,3])))
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);(root/'target.txt').write_text('safe');(root/'link.txt').symlink_to('target.txt');self.assertFalse(policy.scan(root)['passed'])
if __name__=='__main__':unittest.main()
