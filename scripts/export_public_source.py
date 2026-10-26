#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
"""Export the checked public source and a SHA-256 manifest, never local Git/runtime state."""
from pathlib import Path
import argparse,hashlib,json,subprocess,sys,zipfile
from check_public_tree import scan,candidate_files

def main():
 root=Path(__file__).resolve().parents[1];version=json.loads((root/'web/package.json').read_text())['version']
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=root/'.local/public-export'/f'caruso-tv-bridge-public-source-{version}.zip');args=parser.parse_args()
 report=scan(root,history=True)
 if not report['passed']:
  for f in report['findings']:print(f"{f['path']}: {f['reason']}")
  raise SystemExit('Publication policy failed; no archive created')
 names,_=candidate_files(root);payload=[]
 for rel in names:
  p=root/rel
  if not p.is_file():continue
  data=p.read_bytes();payload.append((rel.as_posix(),data))
 manifest={'formatVersion':1,'project':'Caruso TV Bridge','version':version,'baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'gitHistoryIncluded':False,'runtimeStateIncluded':False,'files':[{'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}for name,data in payload]}
 payload.append(('PUBLIC_SOURCE_MANIFEST.json',(json.dumps(manifest,indent=2)+'\n').encode()))
 output=args.output.resolve();output.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED) as archive:
  for name,data in payload:
   info=zipfile.ZipInfo('caruso-tv-bridge/'+name,(2026,10,26,0,0,0));info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,data)
 print(json.dumps({'archive':str(output),'sourceFiles':len(payload)-1,'archiveBytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))
if __name__=='__main__':main()
