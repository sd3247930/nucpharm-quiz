#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""逐题比对各题型「主题库（练习源）↔ 考试库源文件」的序列一致性。

用于发现两套源文件之间的插入 / 缺失 / 顺序差异（例如判断题源存在 1 题错位）。
输出可直接粘贴进 docs/QUESTION_AUDIT.md 的差异结论。
"""

from __future__ import annotations

import difflib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "private" / "最终题库"

PAIRS = {
    "单选题": ("单选题1-400.md", "单选题.md"),
    "多选题": ("多选题1-110.md", "多选题.md"),
    "判断题": ("判断题1-110.md", "判断题.md"),
}


def norm(value: str) -> str:
    out = value.replace("\u3000", " ")
    for a, b in (("（", "("), ("）", ")"), ("，", ","), ("。", "."), ("、", ","), ("；", ";"), ("：", ":")):
        out = out.replace(a, b)
    return re.sub(r"\s+", "", out)


def rich_stems(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8-sig")
    blocks = re.split(r"(?m)^##\s*第\s*\d+\s*题\s*$", text)[1:]
    stems = []
    for block in blocks:
        head = re.split(r"(?m)^#{2,3}\s*正确答案", block)[0]
        lines = []
        for line in head.splitlines():
            s = line.strip()
            if not s or re.fullmatch(r"\d+\s*题", s) or re.fullmatch(r"[-—–*·。．\s]+", s):
                continue
            if re.match(r"^\s*-\s*\[[ xX]\]", line):
                continue
            lines.append(s)
        stems.append("".join(lines))
    return stems


def exam_stems(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8-sig")
    stems: list[str] = []
    current: str | None = None
    for line in text.splitlines():
        if not line.strip():
            continue
        m = re.match(r"^\s*(\d+)\.\s*(.*)$", line)
        if m:
            if current is not None:
                stems.append(current)
            current = m.group(2).strip()
            continue
        if current is None:
            continue
        if re.match(r"^\s*答案：", line) or re.match(r"^\s*[A-E]\s*[.、．:：]", line):
            continue
        if re.match(r"^\s*#{1,6}\s*", line):
            continue
        if not re.match(r"^\s*[A-E]\s*[.、．:：]", line):
            current += line.strip()
    if current is not None:
        stems.append(current)
    return stems


def main() -> int:
    exit_code = 0
    for qtype, (rich_name, exam_name) in PAIRS.items():
        rich = rich_stems(SRC / rich_name)
        exam = exam_stems(SRC / exam_name)
        print(f"=== {qtype}：主题库 {len(rich)} 题 / 考试库 {len(exam)} 题 ===")
        sm = difflib.SequenceMatcher(a=[norm(s) for s in rich], b=[norm(s) for s in exam], autojunk=False)
        opcodes = [op for op in sm.get_opcodes() if op[0] != "equal"]
        if not opcodes:
            print("  序列完全一致（归一化后逐题相同）")
        for tag, i1, i2, j1, j2 in opcodes:
            exit_code = 1
            print(f"  [{tag}] 主题库 {i1 + 1}-{i2} ↔ 考试库 {j1 + 1}-{j2}")
            for i in range(i1, i2):
                print(f"    主题库 #{i + 1}: {rich[i][:60]}")
            for j in range(j1, j2):
                print(f"    考试库 #{j + 1}: {exam[j][:60]}")
        rich_set = {norm(s) for s in rich}
        exam_set = {norm(s) for s in exam}
        only_rich = [s for s in rich if norm(s) not in exam_set]
        only_exam = [s for s in exam if norm(s) not in rich_set]
        if only_rich or only_exam:
            print(f"  仅主题库有的题（{len(only_rich)}）：")
            for s in only_rich:
                print(f"    - {s[:70]}")
            print(f"  仅考试库有的题（{len(only_exam)}）：")
            for s in only_exam:
                print(f"    - {s[:70]}")
        print()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
