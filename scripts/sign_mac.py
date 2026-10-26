#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung
# SPDX-License-Identifier: Apache-2.0
"""Sign nested runtime components inside-out with a caller-selected Developer ID."""
from pathlib import Path
import argparse, os, struct, subprocess
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('app',type=Path)
p.add_argument('--identity',default=os.environ.get('CARUSO_MAC_SIGN_IDENTITY'))
a=p.parse_args()
if not a.identity:p.error('Set CARUSO_MAC_SIGN_IDENTITY to your Developer ID identity or certificate SHA-1')
app=a.app.resolve();entitlements=Path(__file__).resolve().parents[1]/'web/assets/mac-entitlements.plist'
if not (app/'Contents/Info.plist').is_file():p.error('An existing macOS app bundle is required')
magics={b'\xcf\xfa\xed\xfe',b'\xce\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xfe\xed\xfa\xce',b'\xca\xfe\xba\xbe',b'\xca\xfe\xba\xbf'}
def run(*args):subprocess.run(list(map(str,args)),check=True)
def sign(path,jit=False):
 cmd=['codesign','--force','--sign',a.identity,'--options','runtime','--timestamp']
 if jit:cmd+=['--entitlements',str(entitlements)]
 run(*cmd,path)
# Individual files first: framework libraries, crash handler, app executables and HID helper.
files=[]
for file in app.rglob('*'):
 if file.is_file() and not file.is_symlink():
  with file.open('rb') as f:magic=f.read(4)
  if magic in magics:files.append(file)
for file in sorted(files,key=lambda f:len(f.parts),reverse=True):sign(file,'/Contents/MacOS/' in str(file) and file.name!='CarusoKnob')
# Then seal each enclosing bundle from the deepest one to the outer application.
bundles=[d for d in app.rglob('*') if d.is_dir() and not d.is_symlink() and d.suffix in ('.app','.framework','.xpc')]
for bundle in sorted(bundles,key=lambda b:len(b.parts),reverse=True):sign(bundle,bundle.suffix=='.app')
sign(app,True)
run('codesign','--verify','--deep','--strict','--verbose=2',app)
print('Developer ID signing and strict nested verification completed')
