#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用权威原件（最终题库.docx）核对题库中 4 处待确认项的原始出处。

被核对项：
1. 4 组「不同 ID 相同题干」的重复题是否在原件中重复出现（跨题型 1 组 + 多选 3 组）
2. RP-M-0092「多选却单答案」在原件中的答案与题型
3. RP-M-0034 选项 E 的指数写法（上标 vs 普通数字）
4. RP-S-0055 / RP-M-0064 的正确答案（用于确认 .md 里的 [x] 勾选标记不可靠）
5. 判断题 2 组重复题：原件中是否为唯一题（决定导入器的替换是否正确）

产物：docs/reports/DOCX_SOURCE_CROSSCHECK.md

用法：python scripts/check-docx-source.py
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCX = ROOT / "private" / "最终题库" / "最终题库.docx"
DATA = ROOT / "static" / "data" / "questions.json"
REPORT = ROOT / "docs" / "reports" / "DOCX_SOURCE_CROSSCHECK.md"


def read_docx_paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml").decode("utf-8")
    paras = re.findall(r"<w:p[ >].*?</w:p>", xml, re.S)
    out = []
    for p in paras:
        text = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))
        text = (
            text.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", '"')
            .replace("&apos;", "'")
        )
        if text.strip():
            out.append(text.strip())
    return out


def norm(value: str) -> str:
    out = value.replace("\u3000", " ")
    for a, b in (("（", "("), ("）", ")"), ("，", ","), ("。", "."), ("、", ","), ("；", ";"), ("：", ":")):
        out = out.replace(a, b)
    return re.sub(r"\s+", "", out)


OPT_SPLIT = re.compile(r"(?<![A-Za-z0-9])(?=[A-E][.．])")
OPT_ITEM = re.compile(r"^([A-E])[.．]\s*(.*)$", re.S)
SECTION_RE = re.compile(r"^(?:[一二三四五六七八九十]+、)?\s*(单选题|多选题|判断题)")


def parse_docx_questions(paras: list[str]) -> list[dict]:
    """原件结构：'N. 题干' / 'A.… B.…' / '答案：X'（判断题可能没有选项行）。"""
    questions: list[dict] = []
    current: dict | None = None
    section = ""
    for line in paras:
        sec_m = SECTION_RE.match(line)
        if sec_m and re.search(r"（共计|道）|^[一二三四五六七八九十]+、", line):
            section = sec_m.group(1)
            continue
        if re.fullmatch(r"[一二三四五六七八九十]+、.*", line) or line in {"题库"}:
            continue
        q_m = re.match(r"^(\d+)[.、]\s*(.*)$", line)
        if q_m and not re.match(r"^[A-E][.．]", line):
            if current:
                questions.append(current)
            current = {
                "no": int(q_m.group(1)),
                "stem": q_m.group(2).strip(),
                "options": [],
                "answerRaw": None,
                "section": section,
            }
            continue
        if current is None:
            continue
        ans_m = re.match(r"^答案[:：]\s*(.*)$", line)
        if ans_m:
            current["answerRaw"] = ans_m.group(1).strip()
            questions.append(current)
            current = None
            continue
        opt_line_m = re.match(r"^([A-E])[.．]\s*(.*)$", line)
        if opt_line_m and current["answerRaw"] is None:
            chunks = [c for c in OPT_SPLIT.split(line) if c.strip()]
            parsed: list[tuple[str, str]] = []
            for chunk in chunks:
                m = OPT_ITEM.match(chunk.strip())
                if m:
                    parsed.append((m.group(1), m.group(2).strip()))
            if not parsed:
                parsed = [(opt_line_m.group(1), opt_line_m.group(2).strip())]
            for key, text in parsed:
                if key not in {o["key"] for o in current["options"]}:
                    current["options"].append({"key": key, "text": text})
            continue
        if current["answerRaw"] is None:
            current["stem"] = current["stem"] + line.strip()
    if current:
        questions.append(current)
    return questions


def parse_answer(raw: str | None) -> list[str]:
    if not raw:
        return []
    if raw in {"√", "✓", "对正确"} or raw.startswith("√"):
        return ["A"]
    if raw in {"×", "✗", "x", "X"} or raw.startswith("×"):
        return ["B"]
    return sorted({c.upper() for c in raw if c.upper() in "ABCDE"})


def find_by_stem(docx_questions: list[dict], stem: str) -> list[dict]:
    target = norm(stem)
    return [q for q in docx_questions if norm(q["stem"]) == target]


def main() -> int:
    if not DOCX.is_file():
        print(f"BLOCKED_EXTERNAL：找不到权威原件 {DOCX}", file=sys.stderr)
        return 2
    bank = json.loads(DATA.read_text(encoding="utf-8"))
    by_id = {q["id"]: q for q in bank}
    paras = read_docx_paragraphs(DOCX)
    docx_questions = parse_docx_questions(paras)
    print(f"原件段落 {len(paras)} 行，解析出题目 {len(docx_questions)} 道")

    lines: list[str] = []
    add = lines.append
    add("# DOCX_SOURCE_CROSSCHECK · 待确认项与权威原件交叉核对")
    add("")
    add(f"- 权威原件：`private/最终题库/最终题库.docx`（{DOCX.stat().st_size} 字节）")
    add(f"- 解析结果：{len(paras)} 行 → {len(docx_questions)} 道题")
    add(f"- 应用题库：`static/data/questions.json`（{len(bank)} 题）")
    add("")
    conclusions: list[tuple[str, str, str]] = []

    # ---- 0. 题量与题型分布 ----
    docx_counts: dict[str, int] = {}
    for q in docx_questions:
        key = q.get("section") or "未知"
        docx_counts[key] = docx_counts.get(key, 0) + 1
    app_counts = {"单选题": 400, "多选题": 110, "判断题": 110}
    add("## 0. 题量与题型分布（原件 vs 应用题库）")
    add("")
    add("| 题型 | 原件 | 应用题库 | 结论 |")
    add("|---|---:|---:|---|")
    for key, expected in app_counts.items():
        got = docx_counts.get(key, 0)
        add(f"| {key} | {got} | {expected} | {'一致' if got == expected else '不一致'} |")
    add(f"| 合计 | {sum(docx_counts.values())} | {len(bank)} | {'一致' if sum(docx_counts.values()) == len(bank) else '不一致'} |")
    add("")
    conclusions.append(
        (
            "题量与题型分布",
            f"原件 {'/'.join(str(docx_counts.get(k, 0)) for k in app_counts)}",
            "与应用题库 400/110/110 一致" if all(docx_counts.get(k, 0) == v for k, v in app_counts.items()) else "存在差异，需复核",
        )
    )

    # ---- 1. 重复题干 ----
    add("## 1. 重复题干在原件中的出现次数")
    add("")
    add("| 题干 | 应用题库 ID | 原件中出现次数 | 原件出处（题型 + 题号 + 答案） | 结论 |")
    add("|---|---|---:|---|---|")
    dup_check = [
        ("正电子类放射性药品的核心特征是（ ）", ["RP-S-0014", "RP-M-0108"]),
        ("放射性药品生产设备的要求包括（ ）", ["RP-M-0019", "RP-M-0088"]),
        ("放射性药品留样的要求包括（ ）", ["RP-M-0051", "RP-M-0082"]),
        ("放射性药品生产中“防止交叉污染”的措施包括（ ）", ["RP-M-0054", "RP-M-0110"]),
    ]
    for stem, ids in dup_check:
        hits = find_by_stem(docx_questions, stem)
        detail = (
            "；".join(
                f"{h.get('section') or '未知题型'} #{h['no']}（{'、'.join(parse_answer(h['answerRaw'])) or '—'}，{len(h['options'])} 选项）"
                for h in hits
            )
            or "—"
        )
        verdict = "原件同样重复" if len(hits) > 1 else ("原件仅 1 处" if len(hits) == 1 else "原件未找到")
        add(f"| {stem} | {'、'.join(ids)} | {len(hits)} | {detail} | {verdict} |")
        conclusions.append((f"重复题干 {stem[:12]}…", f"原件 {len(hits)} 处", verdict))
    add("")

    # ---- 2. RP-M-0092 ----
    add("## 2. RP-M-0092（标注多选但只有一个正确答案）")
    add("")
    q92 = by_id["RP-M-0092"]
    hits92 = find_by_stem(docx_questions, q92["stem"])
    add(f"- 题干：{q92['stem']}")
    add(f"- 应用题库答案：{'、'.join(q92['answer'])}")
    if hits92:
        for h in hits92:
            add(
                f"- 原件：{h.get('section') or '未知题型'} 第 {h['no']} 题，选项 {len(h['options'])} 个"
                f"（{'、'.join(o['key'] + '.' + o['text'][:10] for o in h['options'])}），答案 `{h['answerRaw']}`"
            )
        ok = all(parse_answer(h["answerRaw"]) == q92["answer"] for h in hits92)
        verdict = "原件答案与应用一致（属题型标注问题，非答案错误）" if ok else "原件答案与应用不一致，需修正"
    else:
        verdict = "原件未找到该题"
        add(f"- {verdict}")
    add(f"- 结论：{verdict}")
    add("")
    conclusions.append(("RP-M-0092 多选单答案", "原件为多选题型、" + (f"答案 {hits92[0]['answerRaw']}" if hits92 else "未找到"), verdict))

    # ---- 3. RP-M-0034 指数写法 ----
    add("## 3. RP-M-0034 选项指数写法（上标 vs 普通数字）")
    add("")
    q34 = by_id["RP-M-0034"]
    hits34 = find_by_stem(docx_questions, q34["stem"])
    app_opt = [o for o in q34["options"] if "Bq" in o["text"] or "3.7" in o["text"]]
    add(f"- 应用题库：{'；'.join(o['text'] for o in app_opt)}")
    verdict34 = "原件未找到该题"
    if hits34:
        docx_opts = [o["text"] for o in hits34[0]["options"] if "Bq" in o["text"] or "3.7" in o["text"]]
        add(f"- 原件：{'；'.join(docx_opts)}")
        sup = any("⁵" in t or "¹⁰" in t for t in docx_opts)
        plain = any(re.search(r"3\.7×10\s?\d", t) for t in docx_opts)
        if sup and not plain:
            verdict34 = "原件与应用的写法一致（均为上标）"
        elif plain and not sup:
            verdict34 = (
                "原件为扁平写法（3.7×105），应用为上标规范写法（3.7×10⁵）：含义相同、不影响答案与判分；"
                "上标写法更规范，建议保留应用写法（如需与原件逐字一致，改源文件后重跑导入器即可）"
            )
        else:
            verdict34 = "原件写法需人工确认"
        add(f"- 结论：{verdict34}")
    else:
        add(f"- 结论：{verdict34}")
    add("")
    conclusions.append(("RP-M-0034 指数写法", "原件写法见上", verdict34))

    # ---- 4. 勾选标记存疑题的正确答案 ----
    add("## 4. 勾选标记与答案冲突题的正确答案（原件无勾选标记）")
    add("")
    add("| ID | 题干 | 应用题库答案 | 原件答案 | 结论 |")
    add("|---|---|---|---|---|")
    for qid in ("RP-S-0055", "RP-M-0064"):
        q = by_id[qid]
        hits = find_by_stem(docx_questions, q["stem"])
        docx_ans = "、".join(parse_answer(hits[0]["answerRaw"])) if hits else "—"
        app_ans = "、".join(q["answer"])
        verdict = "原件答案与应用一致（.md 勾选标记不可信，应用答案正确）" if docx_ans == app_ans else "存在差异，需修正"
        add(f"| {qid} | {q['stem'][:34]} | {app_ans} | {docx_ans} | {verdict} |")
        conclusions.append((f"{qid} 答案核对", f"应用 {app_ans} / 原件 {docx_ans}", verdict))
    add("")

    # ---- 5. 判断题重复项与替换项 ----
    add("## 5. 判断题 2 组重复题与导入器替换项")
    add("")
    add("| 题号 | 应用题库 ID | 题干 | 原件出现次数 | 原件答案 |")
    add("|---|---|---|---:|---|")
    judge_probe = ["RP-B-0039", "RP-B-0040", "RP-B-0041", "RP-B-0042"]
    for qid in judge_probe:
        q = by_id[qid]
        hits = find_by_stem(docx_questions, q["stem"])
        docx_ans = "、".join(parse_answer(hits[0]["answerRaw"])) if hits else "—"
        add(f"| {qid} | {qid} | {q['stem'][:40]} | {len(hits)} | {docx_ans} |")
        if qid == "RP-B-0041":
            conclusions.append(
                (
                    "判断题重复项替换（RP-B-0041/0042）",
                    f"原件中出现 {len(hits)} 次",
                    "原件为唯一题 → 替换正确" if len(hits) == 1 else "需复核",
                )
            )
    add("")

    add("## 6. 核对结论汇总")
    add("")
    add("| 待确认项 | 核对依据 | 结论 |")
    add("|---|---|---|")
    for name, basis, verdict in conclusions:
        add(f"| {name} | {basis} | {verdict} |")
    add("")
    add("> 说明：本报告只做核对与建议，不自动修改题库。若需按原件调整，改源文件后重跑")
    add("> `python scripts/import-questions.py` 即可重建题库与审计报告。")
    add("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"报告已写入 {REPORT.relative_to(ROOT)}")
    for name, basis, verdict in conclusions:
        print(f"  • {name} → {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
