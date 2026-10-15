#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""渲染品牌资产；Android桌面图标使用独立的高清PNG母版。

渲染方式：用本机 Edge（Chromium 内核）无头模式把 SVG 按目标尺寸截图，
因此不需要任何第三方图形库，也不依赖网络。

产物：
    static/brand/logo-{48,72,96,144,192,512}.png   通用尺寸
    static/brand/logo-small.png                     旧版72px图标（当前页头用高清源图）
    static/brand/android/{ldpi,mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}.png 应用图标
    nativeResources/android/res                    原生打包legacy/adaptive资源
    static/brand/android/adaptive-foreground.png   自适应图标前景（108dp@xxxhdpi）
    static/brand/android/adaptive-background.png   自适应图标背景
    static/brand/android/notification.png          通知栏单色图标（24dp@xxxhdpi）
    static/brand/splash/splash.png                 启动图（1024×1024，透明底居中）
    static/brand/splash/android-{hdpi,xhdpi,xxhdpi,xxxhdpi}.png  Android 竖屏启动图
    static/tabbar/{home,study,exam,mistakes,me}{,-on}.png        底部导航图标（81×81）

用法：python scripts/render-brand-assets.py [--android-only|--tabbar-only]
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "static" / "brand"
SVG_PATH = BRAND / "logo.svg"
# 渲染中间产物放在工程根目录（不在 static/ 下），避免被打包进 App/H5 产物
RENDER_DIR = ROOT / ".render"

EDGE_CANDIDATES = [
    Path(os.environ[key]) / product / 'Application' / executable
    for key in ('ProgramFiles(x86)', 'ProgramFiles') if os.environ.get(key)
    for product, executable in [('Microsoft/Edge', 'msedge.exe'), ('Google/Chrome', 'chrome.exe')]

EDGE_CANDIDATES += [
    Path(os.environ.get('CHROME_PATH', 'missing-browser')),
    Path('/usr/bin/google-chrome'),
]


def find_browser() -> Path:
    for path in EDGE_CANDIDATES:
        if path.is_file():
            return path
    raise SystemExit("未找到 Edge/Chrome，无法渲染 PNG")


def svg_markup(size: int, padding_ratio: float = 0.0) -> str:
    """把 logo.svg 内联到 HTML 中，按目标尺寸铺满画布。"""
    svg = SVG_PATH.read_text(encoding="utf-8")
    svg = svg.replace('width="468" height="468"', f'width="{size}" height="{size}"', 1)
    pad = int(size * padding_ratio)
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<style>html,body{margin:0;padding:0;background:transparent;}"
        f"#wrap{{width:{size}px;height:{size}px;display:flex;align-items:center;justify-content:center;"
        f"padding:{pad}px;box-sizing:border-box;}}"
        "#wrap svg{width:100%;height:100%;display:block;}</style></head>"
        f"<body><div id='wrap'>{svg}</div></body></html>"
    )


def render(browser: Path, html: str, out_path: Path, width: int, height: int) -> None:
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    page = RENDER_DIR / (out_path.stem + f"-{width}x{height}.html")
    page.write_text(html, encoding="utf-8")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(browser),
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--default-background-color=00000000",
        f"--window-size={width},{height}",
        f"--screenshot={out_path}",
        page.resolve().as_uri(),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if not out_path.is_file():
        raise SystemExit(
            f"渲染失败：{out_path.name}\nstdout={proc.stdout[-400:]}\nstderr={proc.stderr[-400:]}"
        )
    print(f"  ✓ {out_path.relative_to(ROOT)}  ({width}×{height})")


def quantize_png(path: Path, colors: int = 128) -> None:
    """把启动图转成调色板 PNG，显著压缩体积（渐变区域差异小，肉眼基本无损）。"""
    before = path.stat().st_size
    with Image.open(path) as img:
        converted = img.convert("RGBA").convert("P", palette=Image.ADAPTIVE, colors=colors)
        converted.save(path, format="PNG", optimize=True)
    after = path.stat().st_size
    print(f"    ↳ 压缩 {before // 1024} KB → {after // 1024} KB")


def icon_svg(kind: str, active: bool, dark: bool = False) -> str:
    """底部导航图标：24×24 线性图标，未选中灰蓝、选中品牌青绿（同时用填充区分）。"""
    color = ("#4FB99F" if dark else "#1A6B5A") if active else "#64748B"
    fill = "none"
    paths = {
        "home": "<path d='M3 10.6 12 3l9 7.6'/><path d='M5.5 9.6V20h13V9.6'/><path d='M9.8 20v-5.2h4.4V20'/>",
        "study": (
            "<path d='M4 5.2A2.2 2.2 0 0 1 6.2 3H12v16H6.2A2.2 2.2 0 0 0 4 21.2Z'/>"
            "<path d='M20 5.2A2.2 2.2 0 0 0 17.8 3H12v16h5.8A2.2 2.2 0 0 1 20 21.2Z'/>"
        ),
        "exam": (
            "<path d='M6 3.5h9.5L19 7v13.5H6Z'/><path d='M15 3.5V7h4'/>"
            "<path d='M9 11.5h7M9 15h5'/>"
        ),
        "mistakes": (
            "<path d='M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3Z'/>"
            "<path d='M8.5 9.5l2 2 4-4'/>"
        ),
        "settings": "<path d='M9 3h6l.7 3 2.6 1.5 2.9-.9 3 5.2-2.2 2.1v3l2.2 2.1-3 5.2-2.9-.9L15.7 25l-.7 3H9l-.7-3-2.6-1.5-2.9.9-3-5.2L2 17.1v-3L-.2 12l3-5.2 2.9.9L8.3 6Z' transform='translate(3 0) scale(.75)'/><circle cx='12' cy='12' r='3.3'/>",
        "me": "<circle cx='12' cy='8.4' r='3.7'/><path d='M4.6 20c1.2-3.6 4-5.4 7.4-5.4S18.2 16.4 19.4 20'/>",
    }
    active_extra = "" if active else ""
    return (
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='81' height='81' "
        f"fill='{fill}' stroke='{color}' stroke-width='1.7' stroke-linecap='round' "
        f"stroke-linejoin='round'>{paths[kind]}{active_extra}</svg>"
    )


def render_tabbar(browser: Path) -> None:
    out_dir = ROOT / "static" / "tabbar"
    out_dir.mkdir(parents=True, exist_ok=True)
    for kind in ("home", "study", "exam", "mistakes", "settings"):
        for active, dark in ((False,False),(True,False),(True,True)):
            name = f"{kind}-on.png" if active else f"{kind}.png"
            if dark: name = f"{kind}-dark.png"
            svg = icon_svg(kind, active, dark)
            html = (
                "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                "<style>html,body{margin:0;padding:0;background:transparent;}"
                "#wrap{width:81px;height:81px;display:flex;align-items:center;justify-content:center;}"
                "#wrap svg{width:60px;height:60px;display:block;}</style></head>"
                f"<body><div id='wrap'>{svg}</div></body></html>"
            )
            render(browser, html, out_dir / name, 81, 81)


def main() -> int:
    if "--android-only" in sys.argv:
        subprocess.run(["node", str(ROOT / "scripts" / "render-android-icons.mjs")], check=True)
        return 0
    if not SVG_PATH.is_file():
        raise SystemExit(f"缺少矢量源文件：{SVG_PATH}")
    browser = find_browser()
    print(f"使用浏览器：{browser}")

    if "--tabbar-only" in sys.argv:
        render_tabbar(browser)
        return 0

    print("通用尺寸：")
    for size in (48, 72, 96, 144, 192, 512):
        render(browser, svg_markup(size), BRAND / f"logo-{size}.png", size, size)
    shutil.copyfile(BRAND / "logo-72.png", BRAND / "logo-small.png")
    print("  ✓ static/brand/logo-small.png（复制自 72px 版本）")

    print("Android 图标：")
    android_dir = BRAND / "android"
    subprocess.run(["node", str(ROOT / "scripts" / "render-android-icons.mjs")], check=True)

    # 通知栏单色图标：白色剪影 + 透明底
    notif_svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' width='96' height='96'>"
        "<g fill='#FFFFFF'>"
        "<path d='M20 6h8v12h12v8H28v16h-8V26H8v-8h12z'/>"
        "<circle cx='9' cy='9' r='4'/><circle cx='39' cy='39' r='3.4'/>"
        "</g></svg>"
    )
    notif_html = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<style>html,body{margin:0;padding:0;background:transparent;}"
        "#w{width:96px;height:96px;display:flex;align-items:center;justify-content:center;}"
        "#w svg{width:72px;height:72px;}</style></head>"
        f"<body><div id='w'>{notif_svg}</div></body></html>"
    )
    render(browser, notif_html, android_dir / "notification.png", 96, 96)

    print("启动图：")
    splash_dir = BRAND / "splash"
    render(browser, svg_markup(1024, padding_ratio=0.22), splash_dir / "splash.png", 1024, 1024)
    splash_bg = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<style>html,body{margin:0;padding:0;}"
        "body{background:linear-gradient(165deg,#0B3D38 0%,#14554A 55%,#1A6B5A 100%);"
        "display:flex;align-items:center;justify-content:center;}"
        "#box{width:38%;}</style></head>"
        f"<body><div id='box'>{svg_markup(400).split('<body>')[1].split('</body>')[0]}</div></body></html>"
    )
    for name, (w, h) in {
        "android-hdpi": (480, 762),
        "android-xhdpi": (720, 1242),
        "android-xxhdpi": (1080, 1863),
        "android-xxxhdpi": (1440, 2484),
    }.items():
        target = splash_dir / f"{name}.png"
        render(browser, splash_bg, target, w, h)
        quantize_png(target)

    print("底部导航图标：")
    render_tabbar(browser)

    print("\n全部品牌资产渲染完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
