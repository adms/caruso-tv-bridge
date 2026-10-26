#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung
# SPDX-License-Identifier: Apache-2.0
from pathlib import Path
import os,shutil,subprocess
root=Path(__file__).resolve().parents[1]
candidates=[os.environ.get('NODE_INCLUDE_DIR',''),'/usr/local/include/node','/opt/homebrew/include/node',str(Path(shutil.which('node')).resolve().parents[1]/'include/node')]
headers=next((Path(p) for p in candidates if p and (Path(p)/'node_api.h').is_file()),None)
if headers is None:raise SystemExit('Set NODE_INCLUDE_DIR to a directory containing node_api.h')
subprocess.run(['xcrun','clang++','-std=c++17','-dynamiclib','-undefined','dynamic_lookup','-mmacosx-version-min=13.0','-arch','arm64','-I',str(headers),'-framework','IOKit','-framework','CoreFoundation',str(root/'web/native/caruso-hid.cc'),'-o',str(root/'web/native/caruso-hid.node')],check=True)

subprocess.run(['xcrun','clang++','-std=c++17','-dynamiclib','-undefined','dynamic_lookup','-mmacosx-version-min=13.0','-arch','arm64','-I',str(headers),str(root/'web/native/caruso-network.cc'),'-o',str(root/'web/native/caruso-network.node')],check=True)

subprocess.run(['xcrun','swiftc','-O',str(root/'scripts/apple_tv_ocr.swift'),'-o',str(root/'web/native/caruso-ocr')],check=True)

subprocess.run(["xcrun","swiftc","-O",str(root/"scripts/music_preview.swift"),"-o",str(root/"web/native/caruso-tv-image")],check=True)
