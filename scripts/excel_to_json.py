#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Excel题库转JavaScript数据文件
读取装饰工程网上学习题库.xlsx，输出 questions.js
"""

import json
import re
from openpyxl import load_workbook

EXCEL_PATH = r"F:/XJ/claude/工程师题库/装饰工程网上学习题库.xlsx"
OUTPUT_PATH = r"F:/XJ/claude/工程师题库/questions.js"

def parse_options(question_type, options_text):
    """解析选项文本为结构化列表"""
    if not options_text:
        return []

    options_text = str(options_text).strip()

    if question_type == "判断题":
        return [
            {"key": "正确", "text": "正确"},
            {"key": "错误", "text": "错误"}
        ]

    # 单选题 / 多选题: 按 "|" 分割
    parts = [p.strip() for p in options_text.split("|") if p.strip()]
    options = []
    for part in parts:
        # 匹配 "A. xxx" 或 "A、xxx" 等格式
        match = re.match(r'^([A-Z])[\.．、]\s*(.+)$', part)
        if match:
            key = match.group(1)
            text = match.group(2).strip()
            options.append({"key": key, "text": text})
        else:
            # 兜底: 如果格式不匹配，整个作为text
            options.append({"key": part[0] if part else "", "text": part})
    return options


def main():
    wb = load_workbook(EXCEL_PATH, data_only=True)
    ws = wb.worksheets[0]

    questions = []
    # 数据从第3行开始（第1行标题，第2行表头）
    for row in ws.iter_rows(min_row=3, values_only=True):
        # 5列: 总序号, 题型, 题目, 选项, 正确答案
        if len(row) < 5:
            continue
        seq, q_type, title, options_text, answer = row[:5]

        # 跳过空行
        if not title or not q_type:
            continue

        q_type = str(q_type).strip()
        title = str(title).strip()
        answer = str(answer).strip() if answer else ""

        options = parse_options(q_type, options_text)

        questions.append({
            "id": int(seq) if isinstance(seq, (int, float)) else len(questions) + 1,
            "type": q_type,
            "title": title,
            "options": options,
            "answer": answer
        })

    # 输出为JS文件
    js_content = "const QUESTIONS = " + json.dumps(
        questions,
        ensure_ascii=False,
        indent=2
    ) + ";\n"

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(js_content)

    # 统计信息
    type_counts = {}
    for q in questions:
        type_counts[q["type"]] = type_counts.get(q["type"], 0) + 1

    print(f"转换完成！共 {len(questions)} 题")
    for t, c in type_counts.items():
        print(f"  {t}: {c} 题")
    print(f"输出文件: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
