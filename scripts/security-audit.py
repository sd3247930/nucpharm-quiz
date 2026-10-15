#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""项目纯净度与隐私自查（开工前 + 每次 Git 存档前执行）。

检查：
1. 是否存在密码 / Token / API Key / 私钥 等敏感串
2. 是否出现本机 Windows 绝对路径与设备串号
3. 是否存在密钥库文件（.keystore/.jks/.p12/.pfx/.pem）与 .env
4. 是否把 private/ 目录内容纳入了版本控制（依据 git status / .gitignore）
5. 是否有临时垃圾文件（*.log/*.tmp/*.bak/*.zip/渲染中间产物）
6. 是否引用了本机专属的调试路径

用法：
    python scripts/security-audit.py            # 全量检查
    python scripts/security-audit.py --quiet    # 仅在有问题时输出
退出码：0 = 通过；1 = 发现问题
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TEXT_EXT = {
    ".js",
    ".ts",
    ".json",
    ".vue",
    ".scss",
    ".css",
    ".html",
    ".md",
    ".py",
    ".yml",
    ".yaml",
    ".txt",
    ".editorconfig",
    ".gitignore",
    ".gitattributes",
    ".mjs",
}
SKIP_DIRS = {
    "node_modules",
    ".git",
    "unpackage",
    "dist",
    "build",
    ".render",
    "private",
    "private-archive",
    "docs",
    "screenshots",
}

# 本文件自身必然包含下面的模式字面量，扫描时排除，避免自指误报
SKIP_FILES = {"scripts/security-audit.py"}

SECRET_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9]{16,}"), "疑似 API Key（sk- 开头）"),
    (re.compile(r"ghp_[A-Za-z0-9]{20,}"), "疑似 GitHub Token"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{20,}"), "疑似 GitHub PAT"),
    (re.compile(r"gh[ousr]_[A-Za-z0-9_]{20,}"), "疑似 GitHub OAuth/应用 Token"),
    (re.compile(r"AKIA[0-9A-Z]{12,}"), "疑似 AWS AccessKey"),
    (re.compile(r"AIza[0-9A-Za-z\-_]{20,}"), "疑似 Google API Key"),
    (re.compile(r"DASHSCOPE_API_KEY\s*=\s*sk-\S+"), "DashScope Key 明文"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "私钥内容"),
    (re.compile(r"(?i)(password|passwd|pwd)\s*[:=]\s*['\"][^'\"]{6,}['\"]"), "明文口令赋值"),
    (re.compile(r"(?i)(secret|access[_-]?token|auth[_-]?token)\s*[:=]\s*['\"][^'\"]{8,}['\"]"), "明文 Token 赋值"),
]

LOCAL_PATH_PATTERNS = [
    (re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:\\{1,2}[^'\"\r\n]+"), "Windows 绝对路径"),
    # 仅提示「公网」IP：回环、私有网段与本地测试地址不构成隐私泄露
    (re.compile(r"\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?!10\.)(?!192\.168\.)(?!172\.(?:1[6-9]|2\d|3[01])\.)(?:\d{1,3}\.){3}\d{1,3}\b"), "疑似公网 IP 地址"),
    # 设备串号：同时含大写字母与数字、长度 ≥10（避免误伤普通常量名）
    (re.compile(r"\b(?=[A-Z0-9]{10,}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{10,}\b"), "疑似设备串号"),
    (re.compile(r"158\d{8}|13\d{9}|18\d{9}"), "疑似手机号"),
]

SENSITIVE_FILES = [".keystore", ".jks", ".p12", ".pfx", ".pem", ".key", ".env"]
JUNK_PATTERNS = ["*.log", "*.tmp", "*.bak", "*.orig", "*.rej", "*.zip", "*.apk", "*.wgt"]


def iter_files():
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        parts = set(path.relative_to(ROOT).parts)
        if parts & SKIP_DIRS:
            continue
        if str(path.relative_to(ROOT)).replace("\\", "/") in SKIP_FILES:
            continue
        yield path


def scan_text(path: Path) -> list[str]:
    findings: list[str] = []
    if path.suffix.lower() not in TEXT_EXT and path.name not in {"manifest.json", "pages.json"}:
        return findings
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return findings
    rel = str(path.relative_to(ROOT)).replace("\\", "/")
    for pattern, label in SECRET_PATTERNS:
        for m in pattern.finditer(text):
            line_no = text[: m.start()].count("\n") + 1
            findings.append(f"[敏感信息] {rel}:{line_no}: {label}（内容已隐藏）")
    for pattern, label in LOCAL_PATH_PATTERNS:
        for m in pattern.finditer(text):
            line_no = text[: m.start()].count("\n") + 1
            findings.append(f"[本地路径] {rel}:{line_no}: {label}（内容已隐藏）")
    return findings


def check_git_tracking() -> list[str]:
    findings: list[str] = []
    git_dir = ROOT / ".git"
    if not git_dir.is_dir():
        findings.append("[版本控制] 尚未 git init（建议初始化后再做存档前自查）")
        return findings
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "status", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=60,
        ).stdout
    except Exception as exc:  # noqa: BLE001
        findings.append(f"[版本控制] git status 执行失败：{exc}")
        return findings
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        path = line.split(maxsplit=1)[-1]
        if path.startswith("private/") or path.startswith('"private/'):
            findings.append(f"[版本控制] private/ 内容出现在 git 视野：{path}")
    try:
        tracked_private = subprocess.run(
            ["git", "-C", str(ROOT), "ls-files", "private", "docs"],
            capture_output=True,
            text=True,
            timeout=60,
        ).stdout.strip()
    except Exception:  # noqa: BLE001
        tracked_private = ""
    if tracked_private:
        findings.append("[版本控制] private/ 或 docs/ 已被 git 跟踪，必须从公开索引中排除")
    return findings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    findings: list[str] = []
    scanned = 0
    for path in iter_files():
        scanned += 1
        findings.extend(scan_text(path))
        if path.suffix.lower() in SENSITIVE_FILES:
            findings.append(f"[敏感文件] {path.relative_to(ROOT)}：不应提交密钥库/环境文件")

    for pattern in JUNK_PATTERNS:
        for path in ROOT.rglob(pattern):
            if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
                continue
            findings.append(f"[临时文件] {path.relative_to(ROOT)}")

    findings.extend(check_git_tracking())

    if not args.quiet:
        print(f"扫描公开候选文件：{scanned} 个（已排除 private/、docs/、构建产物与依赖）")
    if findings:
        print(f"\n发现 {len(findings)} 项需要处理：")
        for f in findings:
            print("  ✗ " + f)
        if args.quiet:
            print("\n（--quiet 模式：仅在有问题时输出）")
        return 1
    print("\n安全自查：PASS（公开范围未检出敏感信息；private/、docs/ 未进入索引）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
