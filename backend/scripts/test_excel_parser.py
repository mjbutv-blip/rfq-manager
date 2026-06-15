"""
Excel 解析器测试脚本（纯解析，不访问数据库）

用法：
  # 使用内置测试文件
  cd backend && python scripts/test_excel_parser.py

  # 使用本地 Excel 文件
  cd backend && python scripts/test_excel_parser.py /path/to/inquiry.xlsx

  # 显示每行 parsed_data 详情
  cd backend && python scripts/test_excel_parser.py --verbose

  # 组合
  cd backend && python scripts/test_excel_parser.py /path/to/inquiry.xlsx --verbose
"""

from __future__ import annotations

import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.excel_parser import ParseResult, parse_excel_file

GREEN  = "\033[0;32m"
YELLOW = "\033[1;33m"
RED    = "\033[0;31m"
CYAN   = "\033[0;36m"
DIM    = "\033[2m"
BOLD   = "\033[1m"
NC     = "\033[0m"

def ok(msg: str)     -> None: print(f"{GREEN}  ✓ {msg}{NC}")
def warn(msg: str)   -> None: print(f"{YELLOW}  ⚠ {msg}{NC}")
def fail(msg: str)   -> None: print(f"{RED}  ✗ {msg}{NC}")
def header(msg: str) -> None: print(f"\n{CYAN}{BOLD}=== {msg} ==={NC}")
def dim(msg: str)    -> None: print(f"{DIM}{msg}{NC}")


def _get_test_excel_bytes() -> bytes:
    """生成内置测试 Excel（无需保存文件）。"""
    import openpyxl
    from datetime import date

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "询单总表"

    headers = [
        "询单号", "客户代码", "客户简称", "国家", "所属小组",
        "负责业务员", "产品大类", "品名", "系列",
        "数量", "询单日期", "订单状态", "最终报价", "毛利率", "备注",
    ]
    ws.append(headers)

    ws.append(["BT2026-001", "C001", "泰格体育", "美国", "A组",
               "张伟", "泳装", "男童泳裤", "SS2026泳装系列",
               500, date(2026, 1, 10), "下单", 12.5, "18.5%", "加急"])

    ws.append(["BT2026-002", "", "无代码客户", "英国", "B组",
               "王芳", "运动服", "女款运动套装", "2026运动系列",
               200, "2026/01/15", "跟进中", 45.0, 37.8, ""])

    # 缺 group_name → failed
    ws.append(["BT2026-003", "C003", "测试客户", "德国", "",
               "李明", "户外", "冲锋衣", "户外系列",
               100, date(2026, 1, 25), "", 0, "", ""])

    # 缺客户标识 → failed
    ws.append(["BT2026-004", "", "", "法国", "C组",
               "赵磊", "内衣", "女款内衣", "内衣系列",
               150, date(2026, 2, 1), "", 0, "", ""])

    # 重复 inquiry_no → duplicate
    ws.append(["BT2026-001", "C001", "泰格体育（重）", "美国", "A组",
               "张伟", "泳装", "男童泳裤", "SS2026泳装系列",
               100, date(2026, 1, 10), "", 0, "", "重复行"])

    # 全空行（应跳过）
    ws.append([None] * len(headers))

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def run(file_path: str | None, verbose: bool) -> None:
    # 加载文件
    if file_path:
        with open(file_path, "rb") as f:
            file_bytes = f.read()
        file_name = os.path.basename(file_path)
        print(f"测试文件：{file_path}")
    else:
        file_bytes = _get_test_excel_bytes()
        file_name = "test_inquiry.xlsx"
        print("测试文件：（内置生成）")

    # 解析
    print(f"文件大小：{len(file_bytes):,} bytes\n")

    try:
        result: ParseResult = parse_excel_file(file_bytes, file_name)
    except ValueError as e:
        fail(f"解析失败（列头无法识别）：{e}")
        sys.exit(1)
    except Exception as e:
        fail(f"解析异常：{type(e).__name__}: {e}")
        sys.exit(1)

    # ── 基本信息 ─────────────────────────────────────────────────────────────
    header("解析概览")
    print(f"  文件名     : {result.file_name}")
    print(f"  Sheet      : {result.sheet_name}")
    print(f"  总行数     : {result.total_rows}")
    print(f"  valid      : {result.valid_count}  （通过本地校验，待 DB 判断 new/existing）")
    print(f"  duplicate  : {result.duplicate_count}  （文件内询单号重复）")
    print(f"  failed     : {result.failed_count}  （必填缺失或格式错误）")

    # ── 列映射 ───────────────────────────────────────────────────────────────
    header("列映射（字段名 → Excel 列头）")
    for fn, raw_header in result.column_mapping.items():
        print(f"  {fn:<22} → {raw_header}")

    if result.missing_headers:
        warn("必填字段无对应列：" + ", ".join(result.missing_headers))
    else:
        ok("所有必填字段均有对应列")

    if result.unmapped_headers:
        warn("Excel 列头未匹配字段（共 %d 个）：%s"
             % (len(result.unmapped_headers), ", ".join(result.unmapped_headers)))
    else:
        ok("所有 Excel 列头均已映射")

    # ── 逐行摘要 ─────────────────────────────────────────────────────────────
    header("逐行解析结果")

    STATUS_COLOR = {
        "valid":     GREEN,
        "duplicate": YELLOW,
        "failed":    RED,
    }

    for row in result.rows:
        color = STATUS_COLOR.get(row.status, NC)
        print(
            f"  行 {row.row_number:>3}  "
            f"{color}[{row.status:<9}]{NC}  "
            f"inquiry_no={row.inquiry_no or '（无）':<20}"
            + (f"  ⚠ {row.error_message}" if row.error_message else "")
        )

        if verbose and row.parsed_data:
            for k, v in row.parsed_data.items():
                print(f"           {DIM}{k}: {v}{NC}")

    # ── 断言（自动校验）──────────────────────────────────────────────────────
    header("自动校验")

    assertions = [
        (result.total_rows > 0,
         "解析到 > 0 行数据"),
        (any(r.status == "valid" for r in result.rows),
         "至少 1 行 valid"),
        (result.column_mapping.get("inquiry_no") is not None,
         "column_mapping 包含 inquiry_no"),
        (all(r.inquiry_no for r in result.rows if r.status == "valid"),
         "所有 valid 行均有 inquiry_no"),
        (all(r.parsed_data.get("inquiry_year") for r in result.rows
             if r.status == "valid" and r.parsed_data.get("inquiry_date")),
         "有 inquiry_date 的行均派生出 inquiry_year"),
        (all(r.parsed_data.get("inquiry_month") for r in result.rows
             if r.status == "valid" and r.parsed_data.get("inquiry_date")),
         "有 inquiry_date 的行均派生出 inquiry_month（Jan/Feb 等）"),
    ]

    # 仅在内置测试时检查已知的 duplicate / failed 行
    if not file_path:
        assertions += [
            (result.duplicate_count >= 1,
             "至少 1 行 duplicate（inquiry_no 重复）"),
            (result.failed_count >= 1,
             "至少 1 行 failed（必填字段缺失）"),
        ]

    all_ok = True
    for condition, description in assertions:
        if condition:
            ok(description)
        else:
            fail(description)
            all_ok = False

    # ── 汇总 ─────────────────────────────────────────────────────────────────
    print()
    if all_ok:
        print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")
    else:
        print(f"{RED}{BOLD}部分校验失败，请检查上方错误{NC}")
        sys.exit(1)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]

    file_path = args[0] if args else None
    verbose = "--verbose" in flags or "-v" in flags

    run(file_path, verbose)
