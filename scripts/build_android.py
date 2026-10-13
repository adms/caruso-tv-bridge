#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung
# SPDX-License-Identifier: MIT
"""Build an unsigned APK using a caller-provided Android SDK; never installs it."""
from pathlib import Path
import argparse, os, re, shutil, subprocess, zipfile
root = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--sdk', default=os.environ.get('ANDROID_SDK_ROOT', os.environ.get('ANDROID_HOME', '')))
p.add_argument('--android-jar', default=os.environ.get('ANDROID_JAR'))
p.add_argument('--aapt2', default=os.environ.get('AAPT2'))
p.add_argument('--d8', default=os.environ.get('D8'))
a = p.parse_args()
sdk = Path(a.sdk) if a.sdk else None
platform = os.environ.get('ANDROID_COMPILE_SDK', '35')
tools_version = os.environ.get('ANDROID_BUILD_TOOLS', '35.0.0')
def tool(override, relative):
    result = Path(override) if override else sdk / relative if sdk else None
    if result is None or not result.is_file():
        p.error('Supply an Android SDK or explicit --android-jar, --aapt2 and --d8 paths')
    return str(result.resolve())
android = tool(a.android_jar, 'platforms/android-' + platform + '/android.jar')
aapt2 = tool(a.aapt2, 'build-tools/' + tools_version + '/aapt2')
d8 = tool(a.d8, 'build-tools/' + tools_version + '/d8')
build = root / 'build/android'
if build.exists(): shutil.rmtree(build)
for name in ('classes', 'dex'): (build / name).mkdir(parents=True)
def run(*args): subprocess.run([str(x) for x in args], check=True)
app = root / 'android/app'
run(aapt2, 'compile', '--dir', app / 'res', '-o', build / 'resources.zip')
run(aapt2, 'link', '-o', build / 'resources.apk', '--manifest', app / 'AndroidManifest.xml', '-I', android, build / 'resources.zip')
java = sorted((app / 'src').rglob('*.java')) + sorted((root / 'android/bridge/src').rglob('*.java'))
run('javac', '--release', '8', '-classpath', android, '-d', build / 'classes', *java)
run('jar', '--create', '--file', build / 'classes.jar', '-C', build / 'classes', '.')
run(d8, '--min-api', '26', '--lib', android, '--output', build / 'dex', build / 'classes.jar')
version = re.search(r'versionName="([^"]+)"', (app / 'AndroidManifest.xml').read_text())[1]
apk = build / ('Caruso-TV-Bridge-' + version + '-unsigned.apk')
shutil.copy2(build / 'resources.apk', apk)
with zipfile.ZipFile(apk, 'a', zipfile.ZIP_DEFLATED) as z:
    for dex in sorted((build / 'dex').glob('*.dex')): z.write(dex, dex.name)
    for f in (root / 'LICENSE', root / 'NOTICE', root / 'THIRD_PARTY_NOTICES.md'):
        z.write(f, 'assets/' + f.name)
    for f in (root / 'LICENSES').iterdir(): z.write(f, 'assets/licenses/' + f.name)
    z.writestr('assets/NOTICE.txt', '\n\n'.join((root / n).read_text() for n in ('NOTICE', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'LICENSES/AdbLib-BSD-3-Clause.txt')))
print('Built unsigned APK:', apk.relative_to(root))
