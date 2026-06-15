#!/usr/bin/env bash
# 接口冒烟测试脚本
# 用法：bash scripts/test_api.sh [BASE_URL]
# 默认 BASE_URL=http://127.0.0.1:8000

set -euo pipefail

BASE="${1:-http://127.0.0.1:8000}"
API="$BASE/api/v1"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()     { echo -e "${GREEN}  ✓ $1${NC}"; }
info()   { echo -e "${YELLOW}  → $1${NC}"; }
fail()   { echo -e "${RED}  ✗ $1${NC}"; }
header() { echo -e "\n${CYAN}=== $1 ===${NC}"; }
py()     { python3 -c "$1"; }


# ── 1. 健康检查 ───────────────────────────────────────────────────────────────
header "健康检查"

info "GET /health"
RES=$(curl --noproxy "*" -sf "$BASE/health")
echo "  $RES"
ok "服务健康检查通过"

info "GET /health/db"
RES=$(curl --noproxy "*" -sf "$BASE/health/db")
echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
print(f'  db={d[\"db\"]}  migration={d[\"migration_version\"]}')
print(f'  行数: {d.get(\"row_counts\", {})}')
"
ok "数据库连接检查通过"


# ── 2. 询单总表查询 ───────────────────────────────────────────────────────────
header "询单总表查询"

info "查询全部询单（默认分页）"
RES=$(curl --noproxy "*" -sf "$API/inquiries?page=1&page_size=10")
echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
print(f'  total={d[\"total\"]}  本页={len(d[\"items\"])}')
"
ok "全量查询正常"

info "按小组筛选：group_name=A组"
RES=$(curl --noproxy "*" -sf "$API/inquiries?group_name=A%E7%BB%84&page_size=20")
echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
print(f'  A组询单 total={d[\"total\"]}')
for r in d['items'][:3]:
    print(f'    {r[\"inquiry_no\"]} | {r[\"product_name\"]} | {r[\"order_status\"]}')
"

info "按订单状态筛选：order_status=下单"
RES=$(curl --noproxy "*" -sf "$API/inquiries?order_status=%E4%B8%8B%E5%8D%95&page_size=20")
echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
print(f'  已下单 total={d[\"total\"]}')
for r in d['items'][:2]:
    print(f'    {r[\"inquiry_no\"]} | 贸易额={r[\"trade_amount\"]}')
"

info "按询单号模糊搜索：inquiry_no=BT"
RES=$(curl --noproxy "*" -sf "$API/inquiries?inquiry_no=BT")
echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
print(f'  BT 系询单 total={d[\"total\"]}')
"

info "按系列筛选 + 按 trade_amount 倒序排列"
RES=$(curl --noproxy "*" -sf \
  "$API/inquiries?series_name=SS2026%E6%B3%B3%E8%A3%85%E7%B3%BB%E5%88%97&sort_by=trade_amount&sort_order=desc")
echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
print(f'  SS2026泳装系列 total={d[\"total\"]}')
"

info "按品名模糊搜索：product_name=男童"
RES=$(curl --noproxy "*" -sf "$API/inquiries?product_name=%E7%94%B7%E7%AB%A5")
echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
print(f'  含\"男童\"品名询单 total={d[\"total\"]}')
"
ok "筛选查询全部正常"


# ── 3. 数据分析接口 ───────────────────────────────────────────────────────────
header "数据分析接口"

info "GET /analytics/dashboard"
RES=$(curl --noproxy "*" -sf "$API/analytics/dashboard")
echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
print(f'  总询单={d[\"total_inquiries\"]}  已报价={d[\"total_quoted\"]}  已下单={d[\"total_ordered\"]}')
print(f'  转化率={d[\"conversion_rate\"]}%  总贸易额=\${d[\"total_trade_amount\"]:,.0f}')
"
ok "Dashboard 正常"

info "GET /analytics/sales"
RES=$(curl --noproxy "*" -sf "$API/analytics/sales")
echo "$RES" | py "
import sys, json
rows = json.load(sys.stdin)
print(f'  业务员数量: {len(rows)}')
for r in rows[:3]:
    print(f'    {r[\"responsible_sales\"]}  询单={r[\"inquiry_count\"]}  转化率={r[\"conversion_rate\"]}%')
"

info "GET /analytics/customers"
RES=$(curl --noproxy "*" -sf "$API/analytics/customers")
echo "$RES" | py "
import sys, json
rows = json.load(sys.stdin)
print(f'  客户数量: {len(rows)}')
for r in rows[:2]:
    print(f'    {r[\"customer_short_name\"]}  询单={r[\"inquiry_count\"]}  常询={r[\"top_product_category\"]}')
"

info "GET /analytics/groups"
RES=$(curl --noproxy "*" -sf "$API/analytics/groups")
echo "$RES" | py "
import sys, json
rows = json.load(sys.stdin)
print(f'  小组数量: {len(rows)}')
for r in rows:
    print(f'    {r[\"group_name\"]}  询单={r[\"inquiry_count\"]}  转化率={r[\"conversion_rate\"]}%')
"

info "GET /analytics/products"
RES=$(curl --noproxy "*" -sf "$API/analytics/products")
echo "$RES" | py "
import sys, json
rows = json.load(sys.stdin)
print(f'  产品/系列组合数: {len(rows)}')
for r in rows[:2]:
    print(f'    [{r[\"product_category\"]}] {r[\"series_name\"]}  询单={r[\"inquiry_count\"]}')
"

info "GET /analytics/quarters"
RES=$(curl --noproxy "*" -sf "$API/analytics/quarters")
echo "$RES" | py "
import sys, json
rows = json.load(sys.stdin)
print(f'  季度数: {len(rows)}')
for r in rows:
    print(f'    {r[\"quarter_label\"]} ({r[\"season_type\"]})  询单={r[\"inquiry_count\"]}  贸易额=\${r[\"total_trade_amount\"]:,.0f}')
"
ok "所有分析接口正常"


# ── 4. 导入接口测试（需要 Excel 文件）────────────────────────────────────────
header "导入接口测试"

EXCEL="${2:-}"   # 可以通过第二个参数传入 Excel 文件路径

if [ -z "$EXCEL" ] || [ ! -f "$EXCEL" ]; then
  echo -e "${YELLOW}  ⚠ 未提供有效的 Excel 文件路径，跳过导入测试${NC}"
  echo "    用法：bash scripts/test_api.sh http://127.0.0.1:8000 /path/to/inquiry.xlsx"
else
  info "POST /api/v1/imports/preview（预览，不写库）"
  RES=$(curl --noproxy "*" -sf -X POST "$API/imports/preview" \
    -F "file=@$EXCEL" \
    -F "preview_limit=5")
  echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
print(f'  sheet={d[\"sheet_name\"]}')
print(f'  total={d[\"total_rows\"]}  new={d[\"new_rows\"]}  existing={d[\"existing_rows\"]}  failed={d[\"failed_rows\"]}  duplicate={d[\"duplicate_rows\"]}')
print(f'  success={d[\"success_rows\"]}  missing_headers={d[\"missing_headers\"]}')
print(f'  识别列: {list(d[\"column_mapping\"].values())[:5]}')
for r in d['rows'][:3]:
    print(f'    [{r[\"status\"]}] 行{r[\"row_number\"]}  {r[\"inquiry_no\"]}  err={r[\"error_message\"]}')
" && ok "预览接口正常" || fail "预览接口失败"

  info "POST /api/v1/imports/confirm（确认导入，写库）"
  RES=$(curl --noproxy "*" -sf -X POST "$API/imports/confirm" \
    -F "file=@$EXCEL" \
    -F "uploaded_by=test_script")
  echo "$RES" | py "
import sys, json
d = json.load(sys.stdin)
bid = d['id']
print(f'  batch_id={str(bid)[:8]}...')
print(f'  status={d[\"status\"]}  new={d[\"new_rows\"]}  existing={d[\"existing_rows\"]}  failed={d[\"failed_rows\"]}  dup={d[\"duplicate_rows\"]}')
" && ok "确认导入接口正常" || fail "确认导入接口失败"
fi


# ── 5. 导入历史 ───────────────────────────────────────────────────────────────
header "导入历史"

info "GET /api/v1/imports"
RES=$(curl --noproxy "*" -sf "$API/imports?limit=5")
echo "$RES" | py "
import sys, json
batches = json.load(sys.stdin)
print(f'  最近 {len(batches)} 条导入记录')
for b in batches:
    print(f'    [{b[\"status\"]}] {b[\"file_name\"]}  success={b[\"success_rows\"]}')
"
ok "导入历史正常"


echo ""
echo -e "${GREEN}=== 全部测试通过 ===${NC}"
