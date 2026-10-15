#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""对 adb logcat 输出做隐私脱敏（设备序列号、长十六进制标识、用户目录、IP）。

用法：
    python scripts/sanitize-logcat.py docs/android-logcat.txt

说明：`tests/e2e/device-flow.mjs` 在落盘时已做同样处理；本脚本用于手工采集日志后的补救。
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


def device_serial() -> str:
    try:
        out = subprocess.run(
            ["adb", "shell", "getprop", "ro.serialno"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return out.stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def sanitize(text: str, serial: str) -> str:
    out = text
    if serial:
        out = out.replace(serial, "<device-serial>")
    out = re.sub(r"\b[0-9a-fA-F]{16,}\b", "<hex-id>", out)
    out = re.sub(r"[A-Za-z]:\\Users\\[^\\\s:\"']+", "<user-home>", out)
    out = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "<ip>", out)
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print("用法：python scripts/sanitize-logcat.py <日志文件>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"文件不存在：{path}", file=sys.stderr)
        return 2
    raw = path.read_text(encoding="utf-8", errors="ignore")
    cleaned = sanitize(raw, device_serial())
    path.write_text(cleaned, encoding="utf-8")
    print(f"已脱敏：{path}（{len(raw)} → {len(cleaned)} 字符，{'有修改' if raw != cleaned else '无需修改'}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
