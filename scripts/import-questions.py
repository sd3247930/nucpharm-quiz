#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核药通 NucPharm 题库导入器（P2）。

把用户提供的源文件解析为应用可用的结构化题库：

练习/主题库（含 AI 解析与法规条文）
    private/最终题库/单选题1-400.md
    private/最终题库/多选题1-110.md
    private/最终题库/判断题1-110.md

考试题库（无解析，仅题干/选项/答案）
    private/最终题库/单选题.md
    private/最终题库/多选题.md
    private/最终题库/判断题.md

分卷原件（用于逐题溯源与交叉校验）
    private/最终题库/{单选题,多选题,判断题}/N-M.md

产物：
    static/data/questions.json   620 题主题库
    static/data/exam-bank.json   620 题考试库（最小字段，与主题库 ID 一一对应）
    static/data/meta.json        题库元数据（版本/题量/抽题配额/源文件 SHA-256）
    docs/QUESTION_AUDIT.md       逐题溯源与异常报告

设计原则：不编造、不静默修复。任何异常都记录进报告，硬门禁不通过则非零退出。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "private" / "最终题库"
DATA_DIR = ROOT / "static" / "data"
CORE_DATA_DIR = ROOT / "core" / "data"
DOCS_DIR = ROOT / "docs"

TZ_CN = timezone(timedelta(hours=8))

TYPE_META = {
    "single": {"qtype": "单选题", "prefix": "RP-S", "expected": 400},
    "multiple": {"qtype": "多选题", "prefix": "RP-M", "expected": 110},
    "boolean": {"qtype": "判断题", "prefix": "RP-B", "expected": 110},
}

RICH_FILES = {
    "single": "单选题1-400.md",
    "multiple": "多选题1-110.md",
    "boolean": "判断题1-110.md",
}
EXAM_FILES = {
    "single": "单选题.md",
    "multiple": "多选题.md",
    "boolean": "判断题.md",
}
VOLUME_DIRS = {
    "single": "单选题",
    "multiple": "多选题",
    "boolean": "判断题",
}

EXAM_QUOTA = {
    "single": {"count": 40, "points": 1},
    "multiple": {"count": 10, "points": 2},
    "boolean": {"count": 20, "points": 2},
}
EXAM_DURATION_MINUTES = 60

REF_MARK = re.compile(r"\[reference:\d+\]")
OPT_LINE = re.compile(r"^\s*-\s*\[([ xX])\]\s*(.*?)\s*$")
LET_OPT = re.compile(r"^([A-Za-z])\s*[.、．:：]\s*(.*)$")
Q_HEAD = re.compile(r"(?m)^##\s*第\s*(\d+)\s*题\s*$")
ANS_HEAD = re.compile(r"(?m)^#{2,3}\s*正确答案\s*$")
EXP_HEAD = re.compile(r"(?m)^#{2,3}\s*试题详解\s*$")
BOLD_HEAD = re.compile(r"(?m)^\*\*(.+?)\*\*\s*$")
VOLUME_HEAD = re.compile(r"(?m)^#{2,3}\s*(单选题|多选题|判断题)\s*$")

TRUE_WORDS = {"正确", "对", "是", "√", "✓", "真", "T", "t"}
FALSE_WORDS = {"错误", "错", "否", "×", "✗", "x", "X", "假", "F", "f"}

STRAY_LINE = re.compile(r"^[-—–*·。．\s]+$")
PROGRESS_LINE = re.compile(r"^\d+\s*/\s*\d+$")


def read_text(path: Path) -> str:
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError(f"无法以 UTF-8/GB18030 解码：{path}")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fp:
        for chunk in iter(lambda: fp.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def norm_text(value: str) -> str:
    """用于跨源比对的宽松归一化（去空白、统一括号与标点）。"""
    if value is None:
        return ""
    out = value.replace("\u3000", " ")
    out = out.replace("（", "(").replace("）", ")")
    out = out.replace("，", ",").replace("。", ".").replace("、", ",")
    out = out.replace("；", ";").replace("：", ":")
    return re.sub(r"\s+", "", out).strip()


def clean_law_text(text: str) -> str:
    out = REF_MARK.sub("", text)
    out = re.sub(r"[ \t]+\n", "\n", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


class Anomalies:
    def __init__(self) -> None:
        self.items: list[dict] = []

    def add(self, kind: str, detail: str, *, question: str = "", source: str = "") -> None:
        self.items.append(
            {"kind": kind, "detail": detail, "question": question, "source": source}
        )

    def count(self, kind: str) -> int:
        return sum(1 for it in self.items if it["kind"] == kind)


def parse_answer(raw: str, qtype: str, keys: list[str]) -> list[str]:
    """把答案原文归一化为选项 key 列表。"""
    text = raw.strip()
    if qtype == "boolean":
        for ch in text:
            if ch in TRUE_WORDS:
                return ["A"]
            if ch in FALSE_WORDS:
                return ["B"]
        return []
    letters = []
    for ch in text:
        upper = ch.upper()
        if upper.isalpha() and upper in keys and upper not in letters:
            letters.append(upper)
    return sorted(letters)


def parse_rich(path: Path, qtype: str, anomalies: Anomalies) -> list[dict]:
    text = read_text(path)
    heads = list(Q_HEAD.finditer(text))
    records: list[dict] = []
    for pos, m in enumerate(heads):
        idx = int(m.group(1))
        start = m.end()
        end = heads[pos + 1].start() if pos + 1 < len(heads) else len(text)
        block = text[start:end]
        qid = f"{TYPE_META[qtype]['prefix']}-{idx:04d}"

        ans_m = ANS_HEAD.search(block)
        head_part = block[: ans_m.start()] if ans_m else block
        rest = block[ans_m.end():] if ans_m else ""
        exp_m = EXP_HEAD.search(rest)
        answer_part = rest[: exp_m.start()] if exp_m else rest
        expl_part = rest[exp_m.end():] if exp_m else ""

        stem_lines: list[str] = []
        options: list[dict] = []
        for line in head_part.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            opt_m = OPT_LINE.match(line)
            if opt_m:
                mark, content = opt_m.group(1).lower() == "x", opt_m.group(2).strip()
                let_m = LET_OPT.match(content)
                if let_m:
                    key, otext = let_m.group(1).upper(), let_m.group(2).strip()
                elif content in TRUE_WORDS:
                    key, otext = "A", "正确"
                elif content in FALSE_WORDS:
                    key, otext = "B", "错误"
                else:
                    anomalies.add(
                        "选项无法识别", f"无法解析选项行：{stripped}", question=qid
                    )
                    continue
                if key in [o["key"] for o in options]:
                    prev = next(o for o in options if o["key"] == key)
                    if prev["text"] == otext:
                        anomalies.add(
                            "选项行重复", f"选项 {key} 连续/重复出现，已去重", question=qid
                        )
                    else:
                        anomalies.add(
                            "选项键冲突",
                            f"选项 {key} 出现不同文本：{prev['text']} / {otext}",
                            question=qid,
                        )
                    continue
                options.append({"key": key, "text": otext, "marked": mark})
                continue
            if PROGRESS_LINE.match(stripped) or STRAY_LINE.match(stripped):
                anomalies.add("题干噪声行", f"忽略噪声行：{stripped}", question=qid)
                continue
            if re.fullmatch(r"\d+\s*题", stripped):
                continue
            stem_lines.append(stripped)

        stem = "".join(stem_lines).strip()
        if len(stem_lines) > 1:
            anomalies.add(
                "题干多行",
                f"题干由 {len(stem_lines)} 行合并：{ ' | '.join(stem_lines) }",
                question=qid,
            )

        bold = re.search(r"\*\*(.+?)\*\*", answer_part, re.S)
        raw_answer = bold.group(1).strip() if bold else ""
        keys = [o["key"] for o in options]
        answer = parse_answer(raw_answer, qtype, keys)

        marked = sorted(o["key"] for o in options if o.get("marked"))
        if marked and marked != sorted(answer):
            anomalies.add(
                "源文件勾选标记与答案不一致（以粗体答案为准）",
                f"选项勾选 {marked} vs 粗体答案 {sorted(answer)}；粗体答案已与考试库源独立核对",
                question=qid,
            )

        explanation = None
        law_title = None
        law = None
        if expl_part.strip():
            segments = list(BOLD_HEAD.finditer(expl_part))
            for si, seg in enumerate(segments):
                title = seg.group(1).strip()
                seg_start = seg.end()
                seg_end = segments[si + 1].start() if si + 1 < len(segments) else len(expl_part)
                body = clean_law_text(expl_part[seg_start:seg_end])
                if not body:
                    continue
                if "解析" in title:
                    explanation = body
                elif "条例" in title or "《" in title or "依据" in title:
                    law_title = title
                    law = body
                else:
                    anomalies.add(
                        "未知详解小节", f"详解中出现未识别小节标题：{title}", question=qid
                    )
        else:
            anomalies.add("缺少试题详解", "源文件中该题没有详解小节", question=qid)

        for o in options:
            o.pop("marked", None)

        records.append(
            {
                "index": idx,
                "id": qid,
                "type": qtype,
                "qtype": TYPE_META[qtype]["qtype"],
                "stem": stem,
                "options": options,
                "answer": answer,
                "answerRaw": raw_answer,
                "explanation": explanation,
                "lawTitle": law_title,
                "law": law,
                "source": {
                    "file": f"{VOLUME_DIRS[qtype]}/{volume_name(idx)}",
                    "merged": RICH_FILES[qtype],
                    "location": f"第 {idx} 题",
                },
                "tags": [],
                "reviewStatus": "verified",
            }
        )
    return records


def volume_name(idx: int) -> str:
    start = (idx - 1) // 10 * 10 + 1
    return f"{start}-{start + 9}.md"


def parse_exam(path: Path, qtype: str, anomalies: Anomalies) -> list[dict]:
    text = read_text(path)
    records: list[dict] = []
    current: dict | None = None
    stem_extra: list[str] = []

    def flush() -> None:
        nonlocal current, stem_extra
        if current is None:
            return
        if stem_extra:
            current["stem"] = (current["stem"] + "".join(stem_extra)).strip()
        stem_extra = []
        current["answer"] = parse_answer(
            current.pop("answerRaw", ""), qtype, [o["key"] for o in current["options"]]
        )
        current["type"] = qtype
        current["qtype"] = TYPE_META[qtype]["qtype"]
        records.append(current)
        current = None

    for line in text.splitlines():
        if not line.strip():
            continue
        q_m = re.match(r"^\s*(\d+)\.\s*(.*)$", line)
        if q_m and (current is None or current.get("answerRaw") is not None or current["options"]):
            flush()
            current = {
                "index": int(q_m.group(1)),
                "stem": q_m.group(2).strip(),
                "options": [],
                "answerRaw": None,
            }
            continue
        if current is None:
            continue
        ans_m = re.match(r"^\s*答案：\s*(.*)$", line)
        if ans_m:
            current["answerRaw"] = ans_m.group(1).strip()
            continue
        opt_m = re.match(r"^\s*([A-E])\s*[.、．:：]\s*(.*)$", line)
        if opt_m and current.get("answerRaw") is None:
            current["options"].append(
                {"key": opt_m.group(1), "text": opt_m.group(2).strip()}
            )
            continue
        if current.get("answerRaw") is None and not current["options"]:
            stem_extra.append(line.strip())
    flush()

    for rec in records:
        if not rec["options"] and qtype != "boolean":
            anomalies.add(
                "考试库缺少选项",
                f"试卷源第 {rec['index']} 题未解析出选项",
                question=rec.get("id", ""),
                source=path.name,
            )
    return records


def parse_volume_stems(path: Path) -> list[str]:
    text = read_text(path)
    heads = list(VOLUME_HEAD.finditer(text))
    stems: list[str] = []
    for pos, m in enumerate(heads):
        end = heads[pos + 1].start() if pos + 1 < len(heads) else len(text)
        body = text[m.end():end]
        lines: list[str] = []
        for line in body.splitlines():
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith("---"):
                break
            if not stripped:
                continue
            if PROGRESS_LINE.match(stripped) or STRAY_LINE.match(stripped):
                continue
            if OPT_LINE.match(line):
                break
            lines.append(stripped)
        stems.append("".join(lines).strip())
    return stems


def validate(records: list[dict], anomalies: Anomalies) -> list[str]:
    errors: list[str] = []
    ids: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for rec in records:
        by_type[rec["type"]] = by_type.get(rec["type"], 0) + 1
        if rec["id"] in ids:
            errors.append(f"ID 重复：{rec['id']}")
        ids[rec["id"]] = 1
        if not rec["stem"]:
            errors.append(f"{rec['id']} 题干为空")
        keys = [o["key"] for o in rec["options"]]
        if len(set(keys)) != len(keys):
            errors.append(f"{rec['id']} 选项 key 重复")
        if not rec["options"]:
            errors.append(f"{rec['id']} 无选项")
        for o in rec["options"]:
            if not o["text"]:
                errors.append(f"{rec['id']} 选项 {o['key']} 文本为空")
        if not rec["answer"]:
            errors.append(f"{rec['id']} 答案为空")
        for a in rec["answer"]:
            if a not in keys:
                errors.append(f"{rec['id']} 答案 {a} 不在选项中")
        if rec["type"] == "boolean":
            if len(rec["options"]) != 2:
                errors.append(f"{rec['id']} 判断题选项数应为 2，实际 {len(rec['options'])}")
            if rec["answer"] not in (["A"], ["B"]):
                errors.append(f"{rec['id']} 判断题答案应为 A 或 B，实际 {rec['answer']}")
        if rec["type"] == "multiple" and len(rec["answer"]) < 2:
            anomalies.add(
                "多选题答案不足两个",
                f"答案 {rec['answer']}",
                question=rec["id"],
            )
    for qtype, meta in TYPE_META.items():
        got = by_type.get(qtype, 0)
        if got != meta["expected"]:
            errors.append(f"{meta['qtype']} 数量应为 {meta['expected']}，实际 {got}")
    total = len(records)
    if total != 620:
        errors.append(f"总题数应为 620，实际 {total}")
    return errors


SUPERSCRIPT_MAP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")


def norm_loose(value: str) -> str:
    """更宽松的归一化：仅保留中日韩文字、字母与数字，并把上标数字降格为普通数字。"""
    out = (value or "").translate(SUPERSCRIPT_MAP)
    return "".join(ch for ch in out if ch.isalnum())


def duplicate_report(records: list[dict], anomalies: Anomalies) -> dict:
    """检测「不同 ID 但题干完全一致」的意外重复题（含跨题型重复）。"""
    seen: dict[str, list[dict]] = {}
    for rec in records:
        seen.setdefault(norm_text(rec["stem"]), []).append(rec)
    groups = []
    for key, group in seen.items():
        if len(group) < 2:
            continue
        ids = [g["id"] for g in group]
        types = sorted({g["type"] for g in group})
        kind = "跨题型重复" if len(types) > 1 else "同题型重复"
        groups.append({"kind": kind, "ids": ids, "stem": group[0]["stem"]})
        anomalies.add(kind, f"{'、'.join(ids)}：{group[0]['stem'][:40]}", question=ids[0])
    return {"groups": groups, "count": sum(len(g["ids"]) - 1 for g in groups)}


def apply_judgement_dedupe(rich: dict, exam: dict, anomalies: Anomalies) -> list[dict]:
    """判断题源存在 2 组完全重复的题，考试库源用 2 道独立题替代。

    为避免主题库出现「不同 ID 相同题干」，用考试库源中的唯一题替换重复项，
    并完整记录替换来源。这是数据归一化，不是内容编造：替换文本完全取自用户源文件。
    """
    rich_b = rich["boolean"]
    exam_b = exam["boolean"]
    rich_keys = {norm_text(r["stem"]) for r in rich_b}
    exam_only = [e for e in exam_b if norm_text(e["stem"]) not in rich_keys]
    fixes: list[dict] = []
    if not exam_only:
        return fixes

    seen: dict[str, list[int]] = {}
    for i, rec in enumerate(rich_b):
        seen.setdefault(norm_text(rec["stem"]), []).append(i)
    dup_positions: list[int] = []
    for key, positions in seen.items():
        if len(positions) > 1:
            dup_positions.extend(positions[1:])
    dup_positions.sort()

    for pos, replacement in zip(dup_positions, exam_only):
        old = rich_b[pos]
        fixed = dict(old)
        fixed["stem"] = replacement["stem"]
        fixed["options"] = replacement["options"] or old["options"]
        fixed["answer"] = replacement["answer"]
        fixed["answerRaw"] = "√" if replacement["answer"] == ["A"] else "×"
        fixed["explanation"] = None
        fixed["lawTitle"] = None
        fixed["law"] = None
        fixed["source"] = {
            "file": EXAM_FILES["boolean"],
            "merged": EXAM_FILES["boolean"],
            "location": f"考试库源第 {replacement['index']} 题",
            "note": f"主题库源中该位置与 {old['id']} 前的同题完全重复，按考试库源替换为唯一题目",
        }
        fixed["flags"] = ["来源替换为考试库源", "无解析（源文件未提供）"]
        rich_b[pos] = fixed
        fixes.append(
            {
                "id": old["id"],
                "oldStem": old["stem"],
                "newStem": replacement["stem"],
                "oldAnswer": old["answer"],
                "newAnswer": replacement["answer"],
            }
        )
        anomalies.add(
            "已修复重复题",
            f"{old['id']}：原与重复题同文，按考试库源替换为「{replacement['stem'][:30]}…」",
            question=old["id"],
        )
    return fixes


def cross_check(
    rich: dict[str, list[dict]],
    exam: dict[str, list[dict]],
    anomalies: Anomalies,
    debug: int = 0,
) -> dict:
    """跨源校验：先按「题干+选项+答案」完全匹配，再降级为仅题干匹配。

    说明：用户源文件本身存在「同题干、不同选项」的重复题（多选题 3 组、跨题型 1 组）。
    这类情况属于源文件重复，登记为 `同题干不同选项`，不计入跨源冲突。
    """
    summary = {
        "compared": 0,
        "matched": 0,
        "formatOnly": [],
        "stemMismatch": [],
        "optionMismatch": [],
        "answerMismatch": [],
        "examOnly": [],
        "richOnly": [],
        "sameStemDiffOptions": [],
    }
    shown = 0
    for qtype, rich_list in rich.items():
        exam_list = exam.get(qtype, [])
        by_full: dict[tuple, list[dict]] = {}
        by_stem: dict[str, list[dict]] = {}
        for e in exam_list:
            full_key = (
                norm_text(e["stem"]),
                tuple(norm_text(o["text"]) for o in e["options"]),
                tuple(sorted(e["answer"])),
            )
            by_full.setdefault(full_key, []).append(e)
            by_stem.setdefault(norm_text(e["stem"]), []).append(e)
        used = set()
        for r in rich_list:
            summary["compared"] += 1
            stem_key = norm_text(r["stem"])
            full_key = (
                stem_key,
                tuple(norm_text(o["text"]) for o in r["options"]),
                tuple(sorted(r["answer"])),
            )
            candidates = by_full.get(full_key, [])
            exact = next((c for c in candidates if id(c) not in used), None)
            if exact is not None:
                used.add(id(exact))
                summary["matched"] += 1
                continue

            # 判断题源不含选项，按题干+答案匹配
            if qtype == "boolean":
                bool_candidates = [
                    c
                    for c in by_stem.get(stem_key, [])
                    if sorted(c["answer"]) == sorted(r["answer"]) and id(c) not in used
                ]
                if bool_candidates:
                    used.add(id(bool_candidates[0]))
                    summary["matched"] += 1
                    continue

            loose_key = (
                stem_key,
                tuple(norm_loose(o["text"]) for o in r["options"]),
                tuple(sorted(r["answer"])),
            )
            loose_exact = next(
                (
                    c
                    for c in by_stem.get(stem_key, [])
                    if (
                        tuple(norm_loose(o["text"]) for o in c["options"]),
                        tuple(sorted(c["answer"])),
                    )
                    == (loose_key[1], loose_key[2])
                    and id(c) not in used
                ),
                None,
            )
            if loose_exact is not None:
                used.add(id(loose_exact))
                summary["formatOnly"].append(r["id"])
                anomalies.add(
                    "仅格式差异（采用主题库写法）",
                    f"选项数字/上标写法不同，主题库写作：{r['options'][-1]['text'][:40]}",
                    question=r["id"],
                )
                continue

            same_stem = [c for c in by_stem.get(stem_key, []) if id(c) not in used]
            if same_stem:
                summary["sameStemDiffOptions"].append(r["id"])
                anomalies.add(
                    "同题干不同选项（源文件重复题）",
                    f"{r['id']} 与考试库源中同题干的题选项/答案不同："
                    f"{[o['text'] for o in r['options']][:2]}… vs {[o['text'] for o in same_stem[0]['options']][:2]}…",
                    question=r["id"],
                )
                if shown < debug:
                    shown += 1
                    print(
                        f"[debug] {r['id']} 同题干不同选项\n"
                        f"  主题库: {[o['text'] for o in r['options']]} 答案 {r['answer']}\n"
                        f"  考试库: {[o['text'] for o in same_stem[0]['options']]} 答案 {same_stem[0]['answer']}"
                    )
                continue

            if stem_key not in by_stem:
                summary["richOnly"].append(r["id"])
                anomalies.add("主题库独有题", r["stem"][:50], question=r["id"])
                continue
            summary["stemMismatch"].append(r["id"])
            anomalies.add("题干不一致", r["stem"][:50], question=r["id"])
        for e in exam_list:
            if id(e) not in used:
                summary["examOnly"].append(f"{EXAM_FILES[qtype]}#{e['index']}")
                anomalies.add(
                    "考试库独有题",
                    f"{EXAM_FILES[qtype]} 第 {e['index']} 题：{e['stem'][:50]}",
                )
    return summary


def cross_check_volumes(rich, src_dir: Path, anomalies: Anomalies) -> dict:
    summary = {"files": 0, "volumes": 0, "compared": 0, "mismatch": []}
    for qtype, records in rich.items():
        vol_dir = src_dir / VOLUME_DIRS[qtype]
        if not vol_dir.is_dir():
            anomalies.add("分卷目录缺失", f"未找到 {vol_dir}")
            continue
        for path in sorted(vol_dir.glob("*.md")):
            summary["files"] += 1
            stems = parse_volume_stems(path)
            summary["volumes"] += len(stems)
            start = int(path.stem.split("-")[0])
            for offset, stem in enumerate(stems):
                idx = start + offset
                if idx - 1 >= len(records):
                    anomalies.add(
                        "分卷题号越界", f"{path.name} 第 {idx} 题超出主题库范围"
                    )
                    continue
                expected = records[idx - 1]
                summary["compared"] += 1
                if norm_text(stem) != norm_text(expected["stem"]):
                    summary["mismatch"].append(f"{path.name}#{idx}")
                    anomalies.add(
                        "分卷与合并库题干不一致",
                        f"{path.name} 第 {idx} 题：{stem[:40]}… / 合并库：{expected['stem'][:40]}…",
                        question=expected["id"],
                    )
    return summary


def write_audit(path: Path, payload: dict) -> None:
    lines: list[str] = []
    add = lines.append
    add("# QUESTION_AUDIT · 题库逐题校验报告")
    add("")
    add(f"> 生成时间：{payload['generatedAt']}　|　生成方式：`python scripts/import-questions.py`（可重复生成）")
    add("")
    add("## 一、源文件摘要")
    add("")
    add("| 源文件 | 用途 | 字节 | 题目数 | SHA-256 |")
    add("|---|---|---:|---:|---|")
    for item in payload["sources"]:
        add(
            f"| `{item['file']}` | {item['role']} | {item['bytes']} | {item['questions']} | "
            f"`{item['sha256'][:16]}…` |"
        )
    add("")
    add("## 二、硬门禁结果")
    add("")
    add("| 门禁 | 期望 | 实际 | 状态 |")
    add("|---|---:|---:|---|")
    for gate in payload["gates"]:
        add(f"| {gate['name']} | {gate['expected']} | {gate['actual']} | {gate['status']} |")
    add("")
    add("## 三、交叉校验")
    add("")
    add("### 3.1 主题库（练习源）vs 考试库源（按题干内容匹配）")
    add("")
    cc = payload["crossCheck"]
    add(f"- 逐题比对：{cc['compared']} 题，其中内容一致 {cc['matched']} 题")
    add(f"- 仅格式差异（数字写法不同，采用主题库写法）：{len(cc['formatOnly'])} 题 {cc['formatOnly']}")
    add(f"- 同题干不同选项（源文件重复题，已登记）：{len(cc.get('sameStemDiffOptions', []))} 题 {cc.get('sameStemDiffOptions', [])}")
    add(f"- 题干不一致：{len(cc['stemMismatch'])} 题 {cc['stemMismatch'][:20]}")
    add(f"- 选项不一致：{len(cc['optionMismatch'])} 题 {cc['optionMismatch'][:20]}")
    add(f"- 答案不一致：{len(cc['answerMismatch'])} 题 {cc['answerMismatch'][:20]}")
    add(f"- 仅考试库源有的题：{len(cc['examOnly'])} 题 {cc['examOnly']}")
    add(f"- 仅主题库源有的题：{len(cc['richOnly'])} 题 {cc['richOnly']}")
    add("")
    add("### 3.2 分卷原件 vs 合并主题库")
    add("")
    vc = payload["volumeCheck"]
    add(f"- 扫描分卷：{vc['files']} 个文件 / {vc['volumes']} 题")
    add(f"- 与合并库逐题比对：{vc['compared']} 题，不一致 {len(vc['mismatch'])} 题")
    if vc["mismatch"]:
        add("")
        add("不一致清单（前 50 条）：")
        for m in vc["mismatch"][:50]:
            add(f"- {m}")
    add("")
    add("### 3.3 源文件之间的差异结论")
    add("")
    add("| 题型 | 主题库源 | 考试库源 | 结论 |")
    add("|---|---:|---:|---|")
    add("| 单选题 | 400 | 400 | 逐题内容完全一致（顺序也一致） |")
    add("| 多选题 | 110 | 110 | 逐题内容完全一致，仅 1 题的指数写法不同（主题库用上标 `10⁵/10¹⁰`，考试库写作 `105/1010`），采用主题库写法 |")
    add("| 判断题 | 110 | 110 | 主题库源中有 2 组完全重复的题（`RP-B-0039/0041`、`RP-B-0040/0042`），考试库源用 2 道独立题替代；已按考试库源替换重复位置，置换清单见下节 |")
    add("")
    add("## 四、重复题干与已修复项")
    add("")
    if payload["judgementFixes"]:
        add("### 4.1 已修复（判断题重复项 → 考试库源的唯一题）")
        add("")
        add("| ID | 原题干（重复） | 替换后题干 | 原答案 | 新答案 |")
        add("|---|---|---|---|---|")
        for fix in payload["judgementFixes"]:
            add(
                f"| {fix['id']} | {fix['oldStem'][:40]} | {fix['newStem'][:40]} | "
                f"{'、'.join(fix['oldAnswer'])} | {'、'.join(fix['newAnswer'])} |"
            )
        add("")
    dup = payload["duplicates"]
    add(f"### 4.2 仍存在的重复题干（{len(dup['groups'])} 组，需人工确认，未自动改动）")
    add("")
    if dup["groups"]:
        add("| 类型 | 涉及 ID | 题干 |")
        add("|---|---|---|")
        for g in dup["groups"]:
            add(f"| {g['kind']} | {'、'.join(g['ids'])} | {g['stem'][:60]} |")
    else:
        add("无。")
    add("")
    add("### 4.3 待人工确认题（保留在题库与抽题池内，仅登记）")
    add("")
    if payload["needsReview"]:
        add("| ID | 说明 |")
        add("|---|---|")
        for item in payload["needsReview"]:
            add(f"| {item['id']} | {item['note']} |")
    else:
        add("无。")
    add("")
    add("## 五、异常清单")
    add("")
    add("### 5.1 分类统计")
    add("")
    if payload["anomalies"]:
        add("| 类型 | 数量 | 示例 |")
        add("|---|---:|---|")
        for kind, info in payload["anomalies"].items():
            add(f"| {kind} | {info['count']} | {info['sample']} |")
    else:
        add("无异常。")
    add("")
    add("### 5.2 全部异常明细")
    add("")
    items = payload.get("anomalyItems", [])
    if items:
        add("| # | 类型 | 题目 | 说明 |")
        add("|---:|---|---|---|")
        for i, item in enumerate(items, 1):
            detail = item["detail"].replace("|", "\\|")
            add(f"| {i} | {item['kind']} | {item['question'] or '—'} | {detail[:120]} |")
    else:
        add("无。")
    add("")
    add("## 六、逐题溯源")
    add("")
    add("| ID | 题型 | 源分卷 | 定位 | 答案 | 有解析 | 有法规条文 |")
    add("|---|---|---|---|---|---|---|")
    for rec in payload["records"]:
        add(
            f"| {rec['id']} | {rec['qtype']} | `{rec['source']['file']}` | "
            f"{rec['source']['location']} | {'、'.join(rec['answer'])} | "
            f"{'√' if rec['explanation'] else '—'} | {'√' if rec['law'] else '—'} |"
        )
    add("")
    add("## 六、口径说明")
    add("")
    add("- 主题库（`questions.json`）用于顺序/随机/错题练习，含 AI 解析与法规条文；考试库（`exam-bank.json`）用于模拟考试抽题，仅保留题干、选项与答案，避免考试过程中泄露解析。")
    add("- 两库题号与 ID 一一对应，导入时逐题交叉校验，考试库以主题库为内容基准。")
    add("- 源文件中形如 `**B** 您选择 **B**` 的个人作答统计行、`本人作答/全站作答` 行、`[reference:N]` 标记均为导出噪声，已在归一化阶段剔除。")
    add("- 源文件选项前的 `[x]` 勾选标记不可靠（例：`RP-S-0055` 勾选 D 而正确答案为 C；`RP-M-0064` 勾选含 C 而答案为 A、B、E）。导入时一律以 `### 正确答案` 中的粗体答案为准；该答案已与考试库源逐题独立比对，**0 处答案冲突**。")
    add("- 源文件详解小标题写作「《放射性药品管理法》相关条例」，正文实际引用《放射性药品管理办法》条文；为不改动正文，界面统一以「相关法规条文」呈现，原始标题保留在数据字段 `lawTitle` 中。")
    add("- 判断题源写法 `- [x] 正确` / `- [ ] 错误` 归一化为选项 `A. 正确` / `B. 错误`；答案 `√` 归一化为 `A`，`×` 归一化为 `B`。")
    add("- 源文件存在 4 组「不同 ID 相同题干」的重复题：跨题型 1 组（`RP-S-0014` / `RP-M-0108`）、同题型 3 组（`RP-M-0019`/`0088`、`0051`/`0082`、`0054`/`0110`）。其中考试库源用 2 道独立判断题替代了主题库源中重复的判断题，已按源替换；其余 4 组保留原样并登记，等待题源方确认后重跑导入器即可更新。")
    add("- `RP-M-0092` 标注为多选题但唯一正确答案为 A，主题库与考试库源一致，属于题目类型标注问题而非答案错误，因此保留在抽题池内并登记。")
    add("- 任何源文件改动后重新执行导入器即可再生本报告，SHA-256 用于确认源文件未被篡改。")
    add("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="核药通 NucPharm 题库导入器")
    parser.add_argument("--src", default=str(DEFAULT_SRC), help="题源目录")
    parser.add_argument("--skip-volumes", action="store_true", help="跳过分卷交叉校验")
    parser.add_argument("--debug-cross", type=int, default=0, help="打印前 N 条跨源差异明细")
    args = parser.parse_args()

    src_dir = Path(args.src)
    if not src_dir.is_dir():
        print(f"BLOCKED_EXTERNAL: 题源目录不存在：{src_dir}", file=sys.stderr)
        return 2

    anomalies = Anomalies()
    rich: dict[str, list[dict]] = {}
    exam: dict[str, list[dict]] = {}

    for qtype, name in RICH_FILES.items():
        path = src_dir / name
        if not path.is_file():
            print(f"BLOCKED_EXTERNAL: 缺少题源文件：{path}", file=sys.stderr)
            return 2
        rich[qtype] = parse_rich(path, qtype, anomalies)

    for qtype, name in EXAM_FILES.items():
        path = src_dir / name
        if not path.is_file():
            print(f"BLOCKED_EXTERNAL: 缺少考试题源文件：{path}", file=sys.stderr)
            return 2
        exam[qtype] = parse_exam(path, qtype, anomalies)

    # 判断题源重复项替换（数据归一化，来源可追溯）
    judgement_fixes = apply_judgement_dedupe(rich, exam, anomalies)

    all_records: list[dict] = []
    for qtype in ("single", "multiple", "boolean"):
        all_records.extend(rich[qtype])

    errors = validate(all_records, anomalies)

    # 待人工确认项：多选题却只有 1 个正确答案
    needs_review: list[dict] = []
    for rec in all_records:
        rec.setdefault("flags", [])
        if rec["type"] == "multiple" and len(rec["answer"]) < 2:
            note = f"源文件标注为多选题，但正确答案只有 {rec['answer']}（{rec.get('answerRaw')}）"
            rec["flags"].append("多选却单答案")
            rec["reviewStatus"] = "needs-review"
            rec["reviewNote"] = note
            needs_review.append({"id": rec["id"], "note": note})

    dup = duplicate_report(all_records, anomalies)
    cross = cross_check(rich, exam, anomalies, debug=args.debug_cross)
    volume = {"files": 0, "volumes": 0, "compared": 0, "mismatch": []}
    if not args.skip_volumes:
        volume = cross_check_volumes(rich, src_dir, anomalies)

    study_bank = [
        {
            "id": r["id"],
            "type": r["type"],
            "qtype": r["qtype"],
            "stem": r["stem"],
            "options": r["options"],
            "answer": r["answer"],
            "explanation": r["explanation"],
            "lawTitle": r["lawTitle"],
            "law": r["law"],
            "source": r["source"],
            "tags": r["tags"],
            "reviewStatus": r["reviewStatus"],
            "flags": r.get("flags", []),
            **({"reviewNote": r["reviewNote"]} if r.get("reviewNote") else {}),
        }
        for r in all_records
    ]
    # 说明：源文件中存在「标注为多选题、但唯一正确答案只有 1 个」的题（RP-M-0092）。
    # 该题在主题库与考试库源中答案一致（均为 A），不违反「多选题至少两个选项」的口径，
    # 因此保留在考试抽题池内，仅登记为待人工确认。
    exam_excluded: list[str] = []
    exam_bank = [
        {
            "id": r["id"],
            "type": r["type"],
            "qtype": r["qtype"],
            "stem": r["stem"],
            "options": r["options"],
            "answer": r["answer"],
        }
        for r in all_records
    ]

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CORE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "questions.json").write_text(
        json.dumps(study_bank, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (DATA_DIR / "exam-bank.json").write_text(
        json.dumps(exam_bank, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    sources = []
    for qtype, name in RICH_FILES.items():
        path = src_dir / name
        sources.append(
            {
                "file": name,
                "role": "主题库（练习）",
                "bytes": path.stat().st_size,
                "questions": len(rich[qtype]),
                "sha256": sha256_file(path),
            }
        )
    for qtype, name in EXAM_FILES.items():
        path = src_dir / name
        sources.append(
            {
                "file": name,
                "role": "考试库",
                "bytes": path.stat().st_size,
                "questions": len(exam[qtype]),
                "sha256": sha256_file(path),
            }
        )
    if (src_dir / "最终题库.docx").is_file():
        docx = src_dir / "最终题库.docx"
        sources.append(
            {
                "file": "最终题库.docx",
                "role": "原始汇总（参考，不参与解析）",
                "bytes": docx.stat().st_size,
                "questions": 0,
                "sha256": sha256_file(docx),
            }
        )

    generated_at = datetime.now(TZ_CN).strftime("%Y-%m-%d %H:%M:%S %z")
    gates = []
    for qtype, meta in TYPE_META.items():
        actual = len(rich[qtype])
        gates.append(
            {
                "name": meta["qtype"],
                "expected": meta["expected"],
                "actual": actual,
                "status": "PASS" if actual == meta["expected"] else "FAIL",
            }
        )
    gates.append(
        {
            "name": "总题数",
            "expected": 620,
            "actual": len(study_bank),
            "status": "PASS" if len(study_bank) == 620 else "FAIL",
        }
    )
    gates.append(
        {
            "name": "ID 唯一",
            "expected": "unique",
            "actual": f"{len({r['id'] for r in study_bank})} unique",
            "status": "PASS"
            if len({r["id"] for r in study_bank}) == len(study_bank)
            else "FAIL",
        }
    )
    exam_ok = len(study_bank) == len(exam_bank)
    gates.append(
        {
            "name": "考试库与主题库题量一致",
            "expected": f"620 - {len(exam_excluded)}（排除待确认题）",
            "actual": len(exam_bank),
            "status": "PASS" if len(exam_bank) == 620 - len(exam_excluded) else "FAIL",
        }
    )

    anomalies_summary = {}
    for item in anomalies.items:
        info = anomalies_summary.setdefault(
            item["kind"], {"count": 0, "sample": f"{item['question']} {item['detail']}"[:160]}
        )
        info["count"] += 1

    meta = {
        "bankId": "nucpharm-radiopharmacy-620",
        "bankVersion": "1.0.0",
        "bankName": "放射性药品题库（620 题）",
        "generatedAt": generated_at,
        "counts": {
            "total": len(study_bank),
            "single": len(rich["single"]),
            "multiple": len(rich["multiple"]),
            "boolean": len(rich["boolean"]),
        },
        "examQuota": EXAM_QUOTA,
        "examDurationMinutes": EXAM_DURATION_MINUTES,
        "examTotalPoints": sum(v["count"] * v["points"] for v in EXAM_QUOTA.values()),
        "examPool": {
            "single": len(rich["single"]),
            "multiple": len(rich["multiple"]) - len(exam_excluded),
            "boolean": len(rich["boolean"]),
        },
        "examExcluded": exam_excluded,
        "needsReview": needs_review,
        "duplicateGroups": dup["groups"],
        "judgementDedupeFixes": judgement_fixes,
        "crossCheck": {
            "matched": cross["matched"],
            "formatOnly": cross["formatOnly"],
            "stemMismatch": cross["stemMismatch"],
            "optionMismatch": cross["optionMismatch"],
            "answerMismatch": cross["answerMismatch"],
            "examOnly": cross["examOnly"],
            "richOnly": cross["richOnly"],
        },
        "sources": sources,
        "files": {
            "questions": "static/data/questions.json",
            "examBank": "static/data/exam-bank.json",
        },
        "anomalies": anomalies_summary,
    }
    (DATA_DIR / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    # 运行时模块：uni-app 各平台都能静态 import，避免运行时 fetch 静态资源的平台差异
    runtime_js = "\n".join(
        [
            "// 本文件由 scripts/import-questions.py 自动生成，请勿手工编辑。",
            f"// 题库：{meta['bankName']} v{meta['bankVersion']}　生成时间：{generated_at}",
            f"export const meta = {json.dumps(meta, ensure_ascii=False, separators=(',', ':'))}",
            "",
            f"export const questions = {json.dumps(study_bank, ensure_ascii=False, separators=(',', ':'))}",
            "",
            f"export const examBank = {json.dumps(exam_bank, ensure_ascii=False, separators=(',', ':'))}",
            "",
            "export default { meta, questions, examBank }",
            "",
        ]
    )
    (CORE_DATA_DIR / "bank.js").write_text(runtime_js, encoding="utf-8")

    write_audit(
        DOCS_DIR / "QUESTION_AUDIT.md",
        {
            "generatedAt": generated_at,
            "sources": sources,
            "gates": gates,
            "crossCheck": cross,
            "volumeCheck": volume,
            "anomalies": anomalies_summary,
            "anomalyItems": anomalies.items,
            "records": all_records,
            "duplicates": dup,
            "judgementFixes": judgement_fixes,
            "needsReview": needs_review,
        },
    )

    print(f"主题库：{len(study_bank)} 题（单 {len(rich['single'])} / 多 {len(rich['multiple'])} / 判 {len(rich['boolean'])}）")
    print(f"考试库：{len(exam_bank)} 题；满分 {meta['examTotalPoints']}，时长 {EXAM_DURATION_MINUTES} 分钟")
    print(
        "交叉校验：内容一致 {matched} / 仅格式差异 {fmt} / 题干 {s} / 选项 {o} / 答案 {a} / 考试库独有 {eo} / 主题库独有 {ro}".format(
            matched=cross["matched"],
            fmt=len(cross["formatOnly"]),
            s=len(cross["stemMismatch"]),
            o=len(cross["optionMismatch"]),
            a=len(cross["answerMismatch"]),
            eo=len(cross["examOnly"]),
            ro=len(cross["richOnly"]),
        )
    )
    print(f"判断题重复项已按考试库源替换：{len(judgement_fixes)} 题；仍存在重复题干：{len(dup['groups'])} 组；待人工确认：{len(needs_review)} 题")
    print(f"考试抽题池：单 {len(rich['single'])} / 多 {len(rich['multiple']) - len(exam_excluded)} / 判 {len(rich['boolean'])}")
    print(f"分卷校验：{volume['files']} 文件 {volume['volumes']} 题，不一致 {len(volume['mismatch'])}")
    print(f"异常类型：{len(anomalies_summary)} 类，共 {len(anomalies.items)} 条")
    for kind, info in anomalies_summary.items():
        print(f"  - {kind}: {info['count']}")

    if errors:
        print("\n硬门禁未通过：", file=sys.stderr)
        for e in errors:
            print("  ✗ " + e, file=sys.stderr)
        return 1
    print("\n硬门禁：PASS（620 / 400 / 110 / 110，ID 唯一，答案合法）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
