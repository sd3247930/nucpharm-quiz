#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""品牌资产与题库数据产物校验（P5 / P8）。

检查项：
1. manifest.json / pages.json 里引用的每个静态资源都真实存在
2. 图标 PNG 的像素尺寸符合 Android 各密度与 tabBar 规格
3. PNG 不是空白图（有不透明像素），也不是纯色图
4. 题库产物（questions.json / exam-bank.json / meta.json / core/data/bank.js）存在且题量一致
5. 第三方字体/图片目录里没有多余的大文件

用法：python scripts/verify-assets.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PIL import Image
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

EXPECTED_PNG = {
    "static/brand/logo-48.png": (48, 48),
    "static/brand/logo-72.png": (72, 72),
    "static/brand/logo-96.png": (96, 96),
    "static/brand/logo-144.png": (144, 144),
    "static/brand/logo-192.png": (192, 192),
    "static/brand/logo-512.png": (512, 512),
    "static/brand/logo-small.png": (72, 72),
    "static/brand/logo-header-hd.png": (512, 512),
    "static/brand/android/hdpi.png": (72, 72),
    "static/brand/android/ldpi.png": (48, 48),
    "static/brand/android/mdpi.png": (48, 48),
    "static/brand/android/launcher-source-512.png": (512, 512),
    "static/brand/android/xhdpi.png": (96, 96),
    "static/brand/android/xxhdpi.png": (144, 144),
    "static/brand/android/xxxhdpi.png": (192, 192),
    "static/brand/android/adaptive-foreground.png": (432, 432),
    "static/brand/android/adaptive-background.png": (432, 432),
    "static/brand/android/notification.png": (96, 96),
    "static/brand/splash/splash.png": (1024, 1024),
    "static/brand/splash/android-hdpi.png": (480, 762),
    "static/brand/splash/android-xhdpi.png": (720, 1242),
    "static/brand/splash/android-xxhdpi.png": (1080, 1863),
    "static/brand/splash/android-xxxhdpi.png": (1440, 2484),
}
for density, size in (("ldpi",48),("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)):
    for resource_type in ("drawable", "mipmap"):
        EXPECTED_PNG[f"nativeResources/android/res/{resource_type}-{density}/icon.png"] = (size,size)
EXPECTED_PNG["nativeResources/android/res/drawable-nodpi/nucpharm_launcher_foreground.png"] = (432,432)
TABBAR = [
    "home",
    "study",
    "exam",
    "mistakes",
    "settings",
]

# 单色图标（通知栏图标按 Android 规范必须是单色剪影）与启动图允许的体积上限（KB）
MONOCHROME_OK = {"static/brand/android/notification.png", "static/brand/android/adaptive-background.png"}
SIZE_LIMIT_KB = 400
SIZE_LIMIT_OVERRIDE = {
    "static/brand/splash/splash.png": 200,
    "static/brand/splash/android-hdpi.png": 120,
    "static/brand/splash/android-xhdpi.png": 120,
    "static/brand/splash/android-xxhdpi.png": 120,
    "static/brand/splash/android-xxxhdpi.png": 120,
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def check_png(path: Path, expected: tuple[int, int] | None) -> list[str]:
    problems: list[str] = []
    if not path.is_file():
        return [f"缺少文件：{rel(path)}"]
    with Image.open(path) as img:
        if expected and img.size != expected:
            problems.append(f"{rel(path)} 尺寸 {img.size} ≠ 期望 {expected}")
        img = img.convert("RGBA")
        pixels = list(img.getdata())
        opaque = sum(1 for p in pixels if p[3] > 12)
        ratio = opaque / len(pixels)
        if ratio < 0.01:
            problems.append(f"{rel(path)} 近乎空白（不透明像素仅 {ratio:.2%}）")
        colors = {p[:3] for p in pixels if p[3] > 12}
        key = rel(path)
        if len(colors) < 3 and key not in MONOCHROME_OK:
            problems.append(f"{rel(path)} 颜色过于单一（{len(colors)} 种）")
        size_kb = path.stat().st_size / 1024
        limit = SIZE_LIMIT_OVERRIDE.get(key, SIZE_LIMIT_KB)
        if size_kb > limit:
            problems.append(f"{rel(path)} 体积偏大（{size_kb:.0f} KB）")
    return problems


def referenced_assets() -> list[str]:
    """从 manifest.json / pages.json / 页面代码里收集引用的 /static 路径。"""
    refs: set[str] = set()
    for name in ("manifest.json", "pages.json"):
        text = (ROOT / name).read_text(encoding="utf-8")
        for m in re.finditer(r'"(static/[^"]+)"', text):
            refs.add(m.group(1))
    for path in list((ROOT / "pages").rglob("*.vue")) + list((ROOT / "components").rglob("*.vue")):
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"['\"](/static/[^'\"]+)['\"]", text):
            refs.add(m.group(1).lstrip("/"))
    return sorted(refs)


def main() -> int:
    problems: list[str] = []

    print("1) 品牌位图")
    for name, size in EXPECTED_PNG.items():
        found = check_png(ROOT / name, size)
        problems.extend(found)
        if not found:
            print(f"  ✓ {name} {size[0]}×{size[1]}")

    print("2) 底部导航图标")
    for kind in TABBAR:
        for suffix in ("", "-on", "-dark-idle", "-dark"):
            name = f"static/tabbar/soft-gradient/{kind}{suffix}.png"
            found = check_png(ROOT / name, (144, 144))
            problems.extend(found)
            if not found:
                print(f"  ✓ {name}")

    print("3) 清单与页面引用的静态资源")
    for ref in referenced_assets():
        target = ROOT / ref
        if not target.is_file():
            problems.append(f"清单/页面引用了不存在的资源：{ref}")
        else:
            print(f"  ✓ {ref}")

    print("4) 题库产物")
    data_dir = ROOT / "static" / "data"
    try:
        meta = json.loads((data_dir / "meta.json").read_text(encoding="utf-8"))
        questions = json.loads((data_dir / "questions.json").read_text(encoding="utf-8"))
        exam = json.loads((data_dir / "exam-bank.json").read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        problems.append(f"题库产物读取失败：{exc}")
    else:
        counts = meta["counts"]
        checks = [
            (len(questions), 620, "questions.json 题数"),
            (counts["single"], 400, "meta 单选"),
            (counts["multiple"], 110, "meta 多选"),
            (counts["boolean"], 110, "meta 判断"),
            (len(exam), len(questions), "exam-bank 与主题库题数一致"),
        ]
        for actual, expected, label in checks:
            if actual != expected:
                problems.append(f"{label}：{actual} ≠ {expected}")
            else:
                print(f"  ✓ {label} = {actual}")
        bank_js = ROOT / "core" / "data" / "bank.js"
        if not bank_js.is_file():
            problems.append("缺少运行时题库模块 core/data/bank.js")
        else:
            text = bank_js.read_text(encoding="utf-8")
            if '"total":620' not in text.replace(" ", "") and '"total": 620' not in text:
                if ":620" not in text.replace(" ", ""):
                    problems.append("core/data/bank.js 中的总题数不是 620")
            print(f"  ✓ core/data/bank.js（{bank_js.stat().st_size / 1024:.0f} KB）")

    print("5) 目录洁净度")
    leftovers = []
    for pattern in ("*.zip", "*.log", "*.tmp", "*.bak"):
        leftovers.extend(p for p in ROOT.rglob(pattern) if not any(part in {"node_modules", "private", ".git", "unpackage"} for part in p.relative_to(ROOT).parts))
    if leftovers:
        for p in leftovers:
            problems.append(f"疑似临时文件：{rel(p)}")
    else:
        print("  ✓ 无临时文件残留")

    print("6) Android自适应图标引用")
    for resource_type in ("drawable", "mipmap"):
        path = ROOT / f"nativeResources/android/res/{resource_type}-anydpi-v26/icon.xml"
        try:
            icon = ET.parse(path).getroot()
            namespace = "{http://schemas.android.com/apk/res/android}drawable"
            if icon.tag != "adaptive-icon" or icon.find("foreground").get(namespace) != "@drawable/nucpharm_launcher_foreground" or icon.find("background").get(namespace) != "@color/nucpharm_launcher_background":
                problems.append(f"{rel(path)} 前景/背景引用不正确")
            else:
                print(f"  ✓ {resource_type} adaptive foreground/background")
        except (OSError,ET.ParseError,AttributeError) as exc:
            problems.append(f"{rel(path)} 无法解析：{exc}")
    color_path = ROOT / "nativeResources/android/res/values/nucpharm_launcher_colors.xml"
    try:
        if ET.parse(color_path).getroot().find("color[@name='nucpharm_launcher_background']").text != "#EDF5F3":
            problems.append("Android图标背景色错误")
    except (OSError,ET.ParseError,AttributeError) as exc:
        problems.append(f"Android图标背景资源无法解析：{exc}")

    print()
    if problems:
        print(f"发现 {len(problems)} 项问题：")
        for p in problems:
            print("  ✗ " + p)
        return 1
    print("资产校验：PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
