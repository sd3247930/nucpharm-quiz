"""兼容旧Python真机命令，转交统一的UI v2验证器。"""
import argparse
import subprocess
import sys
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--keep-online', action='store_true', help='跳过飞行模式与断网验证')
args = parser.parse_args()
command = ['node', 'tests/e2e/device-ui-v2.mjs']
if args.keep_online:
    command.append('--keep-online')
sys.exit(subprocess.call(command, cwd=Path(__file__).resolve().parents[1]))
