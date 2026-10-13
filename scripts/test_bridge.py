#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung
# SPDX-License-Identifier: Apache-2.0
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
build = root / 'build' / 'jvm-tests'
build.mkdir(parents=True, exist_ok=True)
source = root / 'android/bridge/src/tw/local/carusobridge'
files = sorted(p for p in source.glob('*.java') if p.name not in ('NativeBridge.java', 'TvDiagnostics.java'))
files += sorted((root / 'android/bridge/tests').glob('*.java'))
subprocess.run(['javac', '--release', '8', '-d', str(build), *map(str, files)], check=True)
for suite in ('BridgeTest', 'ConfigTest'):
    subprocess.run(['java', '-cp', str(build), suite], check=True)
