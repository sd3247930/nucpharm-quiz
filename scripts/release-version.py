"""Bump small releases by 0.01 and large releases by 0.10 using integer arithmetic."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

from android_version import validate_version, version_code


ROOT = Path(__file__).resolve().parents[1]


def next_version(current, change):
    code = version_code(current) + {'small': 1, 'large': 10}[change]
    return f'{code // 100}.{code % 100:02d}', code


def npm_version(code):
    # npm requires SemVer; 1.01 => 1.0.1, 1.10 => 1.1.0, 1.11 => 1.1.1.
    return f'{code // 100}.{code % 100 // 10}.{code % 10}'


def check(root=ROOT, tag=None):
    manifest = json.loads(re.sub(r'/\*[\s\S]*?\*/', '', (root / 'manifest.json').read_text(encoding='utf-8')))
    name, code = manifest['versionName'], manifest['versionCode']
    validate_version({'name': name, 'code': code})
    info = {'version': name, 'versionCode': code, 'appid': manifest['appid']}
    source = (root / 'core/app-info.js').read_text(encoding='utf-8').split('export default ', 1)[1]
    if json.loads(source) != info or json.loads((root / 'static/app-version.json').read_text(encoding='utf-8')) != info:
        raise ValueError('Generated app version metadata is stale; run scripts/sync-app-info.py')
    expected = npm_version(int(code))
    package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    lock = json.loads((root / 'package-lock.json').read_text(encoding='utf-8'))
    if [package['version'], lock['version'], lock['packages']['']['version']] != [expected] * 3:
        raise ValueError('npm package versions do not match the release version')
    if tag and tag != f'v{name}':
        raise ValueError('Release tag does not match manifest.json versionName')
    return name, code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('change', nargs='?', choices=['small', 'large'])
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--tag')
    args = parser.parse_args()
    if args.change and (args.check or args.tag):
        parser.error('Choose either a version bump or a version check')
    if args.change:
        path = ROOT / 'manifest.json'
        source = path.read_text(encoding='utf-8')
        current = re.search(r'"versionName"\s*:\s*"([^"]+)"', source)[1]
        name, code = next_version(current, args.change)
        source = re.sub(r'("versionName"\s*:\s*)"[^"]+"', lambda m: m[1] + json.dumps(name), source, count=1)
        source = re.sub(r'("versionCode"\s*:\s*)"[^"]+"', lambda m: m[1] + json.dumps(str(code)), source, count=1)
        path.write_text(source, encoding='utf-8')
        for filename in ('package.json', 'package-lock.json'):
            path = ROOT / filename
            data = json.loads(path.read_text(encoding='utf-8'))
            data['version'] = npm_version(code)
            if filename == 'package-lock.json':
                data['packages']['']['version'] = npm_version(code)
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        subprocess.run([sys.executable, str(ROOT / 'scripts/sync-app-info.py')], check=True)
    name, code = check(tag=args.tag)
    print(f'Release version: {name}; Android versionCode: {code}; npm: {npm_version(int(code))}')


if __name__ == '__main__':
    main()
