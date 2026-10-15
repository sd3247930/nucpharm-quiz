"""真机测试隔离：只备份/恢复核药通前缀数据，保留基座中其他应用数据。

用法：python scripts/device-storage.py isolate|restore
原始记录只存 private/ui-v2-before/device/sqlite-rows-before.json，不覆盖首次备份。
"""
import json
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'private/ui-v2-before/device'
PKG = 'io.dcloud.HBuilder'
DEVICE_DB = 'databases/DCStorage'
TEMP_DEVICE = '/data/local/tmp/nucpharm-ui-v2-storage.db'


def adb(*args, check=True):
    return subprocess.run(['adb', *args], capture_output=True, check=check).stdout


def main(mode):
    if mode not in ('isolate', 'restore'):
        raise SystemExit('Expected isolate or restore')
    OUT.mkdir(parents=True, exist_ok=True)
    archive = OUT / 'sqlite-rows-before.json'
    if mode == 'restore' and not archive.exists():
        raise SystemExit('No original rows backup; refusing to restore')
    adb('shell', 'am', 'force-stop', PKG)
    local = OUT / 'DCStorage-working'
    local.write_bytes(adb('exec-out', 'run-as', PKG, 'cat', DEVICE_DB))
    journal = adb('exec-out', 'run-as', PKG, 'cat', DEVICE_DB + '-journal', check=False)
    if journal:
        Path(str(local) + '-journal').write_bytes(journal)
    con = sqlite3.connect(local)
    names = [row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'") if re.fullmatch(r'[A-Za-z0-9_]+_storage', row[0])]
    current = {name: con.execute(f'SELECT key,value,timestamp FROM "{name}" WHERE key LIKE ?', ('nucpharm:%',)).fetchall() for name in names}
    if mode == 'isolate':
        if archive.exists():
            # 复测前保留上轮原始归档，绝不覆盖唯一副本。
            archive.with_name('sqlite-rows-before-' + str(time.time_ns()) + '.json').write_bytes(archive.read_bytes())
        archive.write_text(json.dumps(current, ensure_ascii=False), encoding='utf-8')
        original = {}
    else:
        original = json.loads(archive.read_text(encoding='utf-8'))
    with con:
        for name in names:
            con.execute(f'DELETE FROM "{name}" WHERE key LIKE ?', ('nucpharm:%',))
            for row in original.get(name, []):
                con.execute(f'INSERT INTO "{name}" (key,value,timestamp) VALUES (?,?,?)', row)
    con.close()
    adb('push', str(local), TEMP_DEVICE)
    adb('shell', 'run-as', PKG, 'cp', TEMP_DEVICE, DEVICE_DB)
    adb('shell', 'run-as', PKG, 'rm', '-f', DEVICE_DB + '-journal')
    # 核对设备实际数据库字节，不能仅凭 cp 返回成功宣称恢复。
    if adb('exec-out', 'run-as', PKG, 'cat', DEVICE_DB) != local.read_bytes():
        raise SystemExit('Device storage copy mismatch')
    print(f'{mode}: verified; original NucPharm rows = {sum(len(v) for v in (current if mode == "isolate" else original).values())}; other app rows retained')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '')
