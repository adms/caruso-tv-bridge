#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung
# SPDX-License-Identifier: MIT
"""Check tracked source for personal paths, unexpected private IPs and secret artifacts."""
from pathlib import Path
import ipaddress, re, subprocess, sys
root = Path(__file__).resolve().parents[1]
listing = subprocess.run(['git', 'ls-files', '-z'], cwd=root, capture_output=True)
if listing.returncode == 0:
    files = [root / name.decode() for name in listing.stdout.split(b'\0') if name]
else:
    files = [p for p in root.rglob('*') if p.is_file() and not any(x in p.relative_to(root).parts for x in ('.git', '.local', 'node_modules', 'build', 'dist', '__pycache__', 'reports'))]
# Synthetic test/documentation addresses, never an automatically selected target.
allowed_private = {'10.0.0.123', '10.0.0.1', '172.16.0.0', '172.16.0.1', '192.168.1.1'}
forbidden_ext = {'.apk', '.aab', '.jar', '.class', '.dex', '.jks', '.keystore', '.p12', '.pfx', '.pem', '.der', '.key', '.jsonl', '.log', '.png', '.jpg', '.zip'}
errors = []
for p in files:
    rel = p.relative_to(root)
    if p.is_symlink(): errors.append((str(rel), 'symlink is not publishable')); continue
    if p.suffix.lower() in forbidden_ext or p.name.startswith('adbkey') or p.name in ('.env', 'local.properties'):
        errors.append((str(rel), 'runtime/secret/binary artifact')); continue
    try: text = p.read_text()
    except UnicodeDecodeError: errors.append((str(rel), 'non-text artifact')); continue
    if re.search(r'/(?:Users|home)/[^\s/]+/', text): errors.append((str(rel), 'personal filesystem path'))
    if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text): errors.append((str(rel), 'private key material'))
    for token in re.findall(r'(?<![\w.])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![\w.])', text):
        try: ip = ipaddress.ip_address(token)
        except ValueError: continue  # Invalid-address regression fixtures.
        if (str(ip).startswith(('10.', '192.168.')) or ip in ipaddress.ip_network('172.16.0.0/12')) and token not in allowed_private:
            errors.append((str(rel), 'unexpected private IPv4 literal'))
if errors:
    for path, reason in sorted(set(errors)): print(f'{path}: {reason}')
    sys.exit(1)
print(f'PASS: public source policy checked {len(files)} text files (synthetic addresses allowlisted)')
