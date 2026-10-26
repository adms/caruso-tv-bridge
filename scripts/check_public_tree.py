#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung
# SPDX-License-Identifier: Apache-2.0
"""Inspect the complete Git publication candidate, or a clean source export, without printing secrets."""
from pathlib import Path
import argparse, ipaddress, json, re, struct, subprocess, sys

EXCLUDED={'.git','.local','node_modules','build','dist','__pycache__','.venv','venv','reports','research','outputs'}
ASSETS={'web/assets/caruso-512.png','web/assets/caruso-master.png','web/assets/caruso.icns'}
SYNTHETIC_IPS={'10.0.0.0','192.168.0.0','10.0.0.1','10.0.0.2','10.0.0.3','10.0.0.123','10.0.0.124','172.16.0.0','172.16.0.1','192.168.1.1'}
FORBIDDEN_EXT={'.apk','.aab','.jar','.class','.dex','.jks','.keystore','.p12','.pfx','.pem','.der','.key','.jsonl','.log','.zip','.node','.dmg','.pkg','.mobileprovision','.provisionprofile','.cer','.crt','.db','.sqlite','.sqlite3','.tmp'}
RUNTIME_NAMES={'devices.json','apple-tv-device.json','apple-tv-credentials.json','knob-mute.json','lyrics-cache.json','relay-config.json','local.properties'}
IPV4=re.compile(r'(?<![\w.])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![\w.])')
PATTERNS={
 'personal filesystem path':re.compile(r'/(?:Users|home)/[^\s/]+/'),
 'private key material':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
 'provider credential':re.compile(r'\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})\b'),
 'credentials embedded in URL':re.compile(r'https?://[^\s/:@\x22\x27<>]+:[^\s/@\x22\x27<>]+@'),
 'pairing credential payload':re.compile(r'(?i)(?<![a-f0-9])[a-f0-9]{32,}:[a-f0-9]{32,}:[a-f0-9]{32,}'),
 'literal unique device identifier':re.compile(r'(?i)\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b'),
 'literal signing identity':re.compile(r'(?i)(?:signingIdentity|certificateSHA1|signing_identity)\s*[:=]\s*[\"\x27][a-f0-9]{40}[\"\x27]'),
}
MAC=re.compile(r'(?i)(?<![\w:])(?:[a-f0-9]{2}:){5}[a-f0-9]{2}(?![\w:])')
SECRET_LITERAL=re.compile(r'''(?ix)["']?(?:password|client_secret|refresh_token|access_token|api_key|psk)["']?\s*[:=]\s*["']([^"'\s]{12,})["']''')

def candidate_files(root):
 result=subprocess.run(['git','rev-parse','--show-toplevel'],cwd=root,capture_output=True,text=True)
 if result.returncode==0 and Path(result.stdout.strip()).resolve()==root.resolve():
  names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root)
  return sorted({Path(n.decode()) for n in names.split(b'\0') if n}),True
 return sorted(p.relative_to(root) for p in root.rglob('*') if p.is_file() and not any(x in EXCLUDED for x in p.relative_to(root).parts)),False

def png_metadata(data):
 offset=8;bad=[]
 while offset+12<=len(data):
  length=int.from_bytes(data[offset:offset+4],'big');kind=data[offset+4:offset+8]
  if offset+12+length>len(data):return ['malformed PNG']
  if kind in (b'caBX',b'eXIf',b'tEXt',b'iTXt',b'zTXt'):bad.append('image contains nonvisual metadata')
  offset+=12+length
 return bad

def inspect_bytes(name,data):
 rel=Path(name);reasons=[]
 if any(x in EXCLUDED or x.endswith('.app') for x in rel.parts) or rel.suffix.lower() in FORBIDDEN_EXT or rel.name in RUNTIME_NAMES or rel.name.startswith(('adbkey','.env')) and rel.name!='.env.example':
  return ['runtime, credential or build artifact']
 if rel.is_absolute() or '..' in rel.parts:return ['unsafe archive path']
 if not rel.name.endswith('.example.json') and ('credentials' in rel.name.casefold() or rel.name.startswith('pairing') and rel.suffix=='.json'):return ['runtime credential artifact']
 if name in ASSETS:
  if data.startswith(b'\x89PNG\r\n\x1a\n'):return png_metadata(data)
  if data.startswith(b'icns'):
   offset=8
   while offset+8<=len(data):
    length=int.from_bytes(data[offset+4:offset+8],'big')
    if length<8 or offset+length>len(data):return ['malformed icon']
    body=data[offset+8:offset+length]
    if body.startswith(b'\x89PNG\r\n\x1a\n'):reasons+=png_metadata(body)
    offset+=length
   return sorted(set(reasons))
  return ['unexpected asset format']
 try:text=data.decode('utf-8')
 except UnicodeDecodeError:return ['non-allowlisted binary artifact']
 for reason,pattern in PATTERNS.items():
  if pattern.search(text):reasons.append(reason)
 for token in IPV4.findall(text):
  try:ip=ipaddress.ip_address(token)
  except ValueError:continue
  private=ip in ipaddress.ip_network('10.0.0.0/8') or ip in ipaddress.ip_network('172.16.0.0/12') or ip in ipaddress.ip_network('192.168.0.0/16')
  if private and token not in SYNTHETIC_IPS:reasons.append('unexpected private IPv4 literal')
 if any(m.group(0)!='00:00:00:00:00:00' for m in MAC.finditer(text)):reasons.append('literal hardware address')
 if SECRET_LITERAL.search(text):reasons.append('literal authentication secret')
 return sorted(set(reasons))

def scan(root,history=False):
 files,in_git=candidate_files(root);findings=[];count=0
 for rel in files:
  p=root/rel
  if p.is_symlink():findings.append({'path':str(rel),'reason':'symlink is not publishable'});continue
  if not p.exists():continue
  count+=1
  findings.extend({'path':str(rel),'reason':reason} for reason in inspect_bytes(rel.as_posix(),p.read_bytes()))
 report={'passed':not findings,'candidateFiles':count,'includesUntracked':in_git,'historyBlobs':0,'findings':findings}
 if history:
  if not in_git:raise ValueError('--history requires a repository root')
  objects=subprocess.check_output(['git','rev-list','--objects','--all'],cwd=root).splitlines()
  for entry in objects:
   pair=entry.split(b' ',1)
   if len(pair)!=2:continue
   oid,name=pair
   if subprocess.check_output(['git','cat-file','-t',oid.decode()],cwd=root).strip()!=b'blob':continue
   report['historyBlobs']+=1;data=subprocess.check_output(['git','cat-file','blob',oid.decode()],cwd=root)
   findings.extend({'path':name.decode(),'reason':reason,'historyObject':oid.decode()} for reason in inspect_bytes(name.decode(),data))
  report['passed']=not findings
 return report

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--history',action='store_true');parser.add_argument('--json',type=Path)
 args=parser.parse_args();report=scan(args.root.resolve(),args.history)
 if args.json:args.json.parent.mkdir(parents=True,exist_ok=True);args.json.write_text(json.dumps(report,indent=2)+'\n')
 for finding in report['findings']:print(f"{finding['path']}: {finding['reason']}"+(' [history]' if 'historyObject'in finding else ''))
 print(f"{'PASS' if report['passed'] else 'FAIL'}: {report['candidateFiles']} candidate files, {report['historyBlobs']} reachable history blobs; findings are value-redacted")
 return 0 if report['passed'] else 1
if __name__=='__main__':sys.exit(main())
