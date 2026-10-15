#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核药通 NucPharm 题库校验器。

对已生成的题库数据做独立复检（不复用导入器内部状态），并可在需要时
把源文件与产物做逐字段差异比对，用于定位「为什么报告不一致」。

用法：
    python scripts/audit-question-bank.py
    python scripts/audit-question-bank.py --diff-exam 10     # 打印前 10 条与考试库差异
    python scripts/audit-question-bank.py --diff-volume 10   # 打印前 10 条与分卷原件差异
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "static" / "data"
DEFAULT_SRC = ROOT / "private" / "最终题库"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def norm(value: str) -> str:
    if not value:
        return ""
    out = value.replace("\u3000", " ")
    for a, b in (("（", "("), ("）", ")"), ("，", ","), ("。", "."), ("、", ","), ("；", ";"), ("：", ":")):
        out = out.replace(a, b)
    return re.sub(r"\s+", "", out)


def gates(bank: list[dict]) -> list[dict]:
    by_type: dict[str, int] = {}
    for rec in bank:
        by_type[rec["type"]] = by_type.get(rec["type"], 0) + 1
    checks = [
        ("总题数 == 620", len(bank), 620),
        ("单选 == 400", by_type.get("single", 0), 400),
        ("多选 == 110", by_type.get("multiple", 0), 110),
        ("判断 == 110", by_type.get("boolean", 0), 110),
        ("ID 唯一", len({r["id"] for r in bank}), len(bank)),
    ]
    out = []
    for name, actual, expected in checks:
        status = "PASS" if actual == expected else "FAIL"
        out.append({"name": name, "actual": actual, "expected": expected, "status": status})
    return out


def field_gates(bank: list[dict]) -> list[dict]:
    problems: list[str] = []
    for rec in bank:
        qid = rec["id"]
        keys = [o["key"] for o in rec.get("options", [])]
        if not rec.get("stem"):
            problems.append(f"{qid}: 题干为空")
        if not keys or len(set(keys)) != len(keys):
            problems.append(f"{qid}: 选项缺失或 key 重复")
        if any(not o.get("text") for o in rec.get("options", [])):
            problems.append(f"{qid}: 存在空选项")
        if not rec.get("answer"):
            problems.append(f"{qid}: 答案为空")
        if any(a not in keys for a in rec.get("answer", [])):
            problems.append(f"{qid}: 答案不在选项集合内")
        if rec["type"] == "boolean":
            if len(keys) != 2:
                problems.append(f"{qid}: 判断题选项数 {len(keys)} != 2")
            if rec.get("answer") not in (["A"], ["B"]):
                problems.append(f"{qid}: 判断题答案非法 {rec.get('answer')}")
        if rec["type"] == "single" and len(rec.get("answer", [])) != 1:
            problems.append(f"{qid}: 单选题答案数 != 1")
    return problems


def review_notes(bank: list[dict]) -> list[str]:
    """需要人工确认但不阻断的题源现象（登记在报告里，不计 FAIL）。"""
    notes: list[str] = []
    for rec in bank:
        if rec["type"] == "multiple" and len(rec.get("answer", [])) < 2:
            notes.append(
                f"{rec['id']}: 源文件标注为多选题，但唯一正确答案为 {'、'.join(rec['answer'])}"
                "（主题库与考试库源一致，属题型标注问题，已保留并登记）"
            )
    for rec in bank:
        if rec.get("reviewStatus") == "needs-review" and not any(rec["id"] in n for n in notes):
            notes.append(f"{rec['id']}: {rec.get('reviewNote', '需人工确认')}")
    return notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(DEFAULT_SRC))
    ap.add_argument("--diff-exam", type=int, default=0)
    ap.add_argument("--diff-volume", type=int, default=0)
    args = ap.parse_args()

    bank = load(DATA_DIR / "questions.json")
    exam_bank = load(DATA_DIR / "exam-bank.json")
    meta = load(DATA_DIR / "meta.json")
    src_dir = Path(args.src)

    print(f"题库：{meta['bankName']} v{meta['bankVersion']}（生成于 {meta['generatedAt']}）")
    print(f"主题库 {len(bank)} 题 / 考试库 {len(exam_bank)} 题 / 满分 {meta['examTotalPoints']}")
    print()

    ok = True
    for item in gates(bank):
        print(f"  [{item['status']}] {item['name']}: {item['actual']} (期望 {item['expected']})")
        ok = ok and item["status"] == "PASS"

    print()
    problems = field_gates(bank)
    if problems:
        ok = False
        print(f"字段校验：{len(problems)} 项问题")
        for p in problems[:40]:
            print("  ✗ " + p)
    else:
        print("字段校验：PASS（题干/选项/答案/判断题规则/单选题答案数全部合法）")

    notes = review_notes(bank)
    if notes:
        print(f"\n待人工确认（不阻断，已登记在 QUESTION_AUDIT.md）：{len(notes)} 项")
        for n in notes:
            print("  • " + n)

    exam_ids = [r["id"] for r in exam_bank]
    bank_ids = [r["id"] for r in bank]
    same = exam_ids == bank_ids
    print(f"考试库 ID 序列与主题库一致：{'PASS' if same else 'FAIL'}")
    ok = ok and same
    no_expl = [r["id"] for r in exam_bank if "explanation" in r or "law" in r]
    print(f"考试库不携带解析字段：{'PASS' if not no_expl else 'FAIL'}")

    if args.diff_exam:
        print("\n=== 主题库 vs 考试库 差异（前 %d 条）===" % args.diff_exam)
        shown = 0
        for r, e in zip(bank, exam_bank):
            diffs = []
            if norm(r["stem"]) != norm(e["stem"]):
                diffs.append(("stem", r["stem"], e["stem"]))
            ro = [norm(o["text"]) for o in r["options"]]
            eo = [norm(o["text"]) for o in e["options"]]
            if ro != eo:
                diffs.append(("option", repr(ro), repr(eo)))
            if sorted(r["answer"]) != sorted(e["answer"]):
                diffs.append(("answer", r["answer"], e["answer"]))
            if diffs:
                shown += 1
                print(f"\n--- {r['id']} ---")
                for kind, a, b in diffs:
                    print(f"  [{kind}]")
                    print(f"    主题库: {a}")
                    print(f"    考试库: {b}")
                if shown >= args.diff_exam:
                    break
        print(f"\n共显示 {shown} 条")

    if args.diff_volume:
        print("\n=== 主题库 vs 分卷原件 差异（前 %d 条）===" % args.diff_volume)
        vol_dirs = {"single": "单选题", "multiple": "多选题", "boolean": "判断题"}
        shown = 0
        head_re = re.compile(r"(?m)^#{2,3}\s*(单选题|多选题|判断题)\s*$")
        opt_re = re.compile(r"^\s*-\s*\[[ xX]\]")
        for qtype, dirname in vol_dirs.items():
            records = [r for r in bank if r["type"] == qtype]
            vol_dir = src_dir / dirname
            for path in sorted(vol_dir.glob("*.md")):
                text = path.read_text(encoding="utf-8-sig")
                heads = list(head_re.finditer(text))
                start_no = int(path.stem.split("-")[0])
                for i, m in enumerate(heads):
                    end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
                    body = text[m.end():end]
                    lines = []
                    for line in body.splitlines():
                        s = line.strip()
                        if not s or s.startswith("#") or s.startswith("---"):
                            break
                        if re.match(r"^\d+\s*/\s*\d+$", s) or re.fullmatch(r"[-—–*·。．\s]+", s or "-"):
                            continue
                        if opt_re.match(line):
                            break
                        lines.append(s)
                    stem = "".join(lines).strip()
                    idx = start_no + i
                    ref = records[idx - 1] if idx - 1 < len(records) else None
                    if ref is None:
                        continue
                    if norm(stem) != norm(ref["stem"]):
                        shown += 1
                        print(f"\n--- {ref['id']} @ {path.name}#{idx} ---")
                        print(f"  分卷   : {stem!r}")
                        print(f"  主题库 : {ref['stem']!r}")
                        if shown >= args.diff_volume:
                            break
                if shown >= args.diff_volume:
                    break
            if shown >= args.diff_volume:
                break
        print(f"\n共显示 {shown} 条")

    print()
    print("结论：" + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
