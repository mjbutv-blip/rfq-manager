import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Alert,
  Card,
  Col,
  Input,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"

import { fetchInquiries } from "@/api/inquiries"
import type { InquiryItem } from "@/types/inquiry"

const { Title, Text } = Typography

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(year => ({ label: String(year), value: year }))
const ORDERED_STATUSES = new Set(["下单", "已下单", "确认转单"])

interface CategoryRow {
  key: string
  product_category: string
  inquiry_count: number
  ordered_count: number
  conversion_rate: number
  total_quantity: number
  avg_quantity: number | null
  trade_amount: number
  avg_trade_amount: number | null
  avg_gross_profit_rate: number | null
  customer_count: number
  series_count: number
  top_customer: string | null
  top_series: string | null
}

interface MatrixRow {
  key: string
  customer: string
  product_category: string
  inquiry_count: number
  ordered_count: number
  conversion_rate: number
  trade_amount: number
  share_in_customer: number
}

interface SeriesRow {
  key: string
  series_name: string
  product_category: string
  inquiry_count: number
  ordered_count: number
  conversion_rate: number
  trade_amount: number
  avg_gross_profit_rate: number | null
}

interface CoverageRow {
  field: keyof InquiryItem
  label: string
  filled_count: number
  missing_count: number
  coverage_rate: number
  note: string
}

function isOrdered(status: string | null): boolean {
  return !!status && ORDERED_STATUSES.has(status)
}

function hasNumber(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(Number(value))
}

function rate(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0
}

function money(value: number | null | undefined): string {
  return `$${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function num(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function pct(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

async function fetchAllInquiries(year?: number): Promise<InquiryItem[]> {
  const pageSize = 200
  const first = await fetchInquiries({
    year,
    page: 1,
    page_size: pageSize,
    sort_by: "inquiry_date",
    sort_order: "asc",
  })
  const items = [...first.items]
  const pages = Math.ceil(first.total / pageSize)
  for (let page = 2; page <= pages; page += 1) {
    const data = await fetchInquiries({
      year,
      page,
      page_size: pageSize,
      sort_by: "inquiry_date",
      sort_order: "asc",
    })
    items.push(...data.items)
  }
  return items
}

function topEntry(counter: Map<string, number>): string | null {
  const rows = Array.from(counter.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return rows[0]?.[0] ?? null
}

function avg(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null
}

function buildCategoryRows(items: InquiryItem[]): CategoryRow[] {
  const map = new Map<string, {
    product_category: string
    inquiry_count: number
    ordered_count: number
    total_quantity: number
    quantity_values: number[]
    trade_amount: number
    order_trade_values: number[]
    gp_values: number[]
    customers: Set<string>
    series: Set<string>
    customer_counter: Map<string, number>
    series_counter: Map<string, number>
  }>()

  for (const item of items) {
    const category = item.product_category || "未知品类"
    const customer = item.customer_short_name || item.customer_code || "未知客户"
    const series = item.series_name || "未知系列"
    const row = map.get(category) ?? {
      product_category: category,
      inquiry_count: 0,
      ordered_count: 0,
      total_quantity: 0,
      quantity_values: [],
      trade_amount: 0,
      order_trade_values: [],
      gp_values: [],
      customers: new Set<string>(),
      series: new Set<string>(),
      customer_counter: new Map<string, number>(),
      series_counter: new Map<string, number>(),
    }
    row.inquiry_count += 1
    if (hasNumber(item.quantity)) {
      row.total_quantity += Number(item.quantity)
      row.quantity_values.push(Number(item.quantity))
    }
    row.customers.add(customer)
    row.series.add(series)
    row.customer_counter.set(customer, (row.customer_counter.get(customer) ?? 0) + 1)
    row.series_counter.set(series, (row.series_counter.get(series) ?? 0) + 1)
    if (isOrdered(item.order_status)) {
      row.ordered_count += 1
      row.trade_amount += Number(item.trade_amount || 0)
      if (hasNumber(item.trade_amount)) row.order_trade_values.push(Number(item.trade_amount))
      if (hasNumber(item.gross_profit_rate)) row.gp_values.push(Number(item.gross_profit_rate))
    }
    map.set(category, row)
  }

  return Array.from(map.values())
    .map(row => ({
      key: row.product_category,
      product_category: row.product_category,
      inquiry_count: row.inquiry_count,
      ordered_count: row.ordered_count,
      conversion_rate: rate(row.ordered_count, row.inquiry_count),
      total_quantity: row.total_quantity,
      avg_quantity: avg(row.quantity_values),
      trade_amount: row.trade_amount,
      avg_trade_amount: avg(row.order_trade_values),
      avg_gross_profit_rate: avg(row.gp_values),
      customer_count: row.customers.size,
      series_count: row.series.size,
      top_customer: topEntry(row.customer_counter),
      top_series: topEntry(row.series_counter),
    }))
    .sort((a, b) => b.inquiry_count - a.inquiry_count || b.trade_amount - a.trade_amount)
}

function buildMatrixRows(items: InquiryItem[]): MatrixRow[] {
  const customerTotals = new Map<string, number>()
  const map = new Map<string, MatrixRow>()

  for (const item of items) {
    const customer = item.customer_short_name || item.customer_code || "未知客户"
    customerTotals.set(customer, (customerTotals.get(customer) ?? 0) + 1)
    const category = item.product_category || "未知品类"
    const key = `${customer}|${category}`
    const row = map.get(key) ?? {
      key,
      customer,
      product_category: category,
      inquiry_count: 0,
      ordered_count: 0,
      conversion_rate: 0,
      trade_amount: 0,
      share_in_customer: 0,
    }
    row.inquiry_count += 1
    if (isOrdered(item.order_status)) {
      row.ordered_count += 1
      row.trade_amount += Number(item.trade_amount || 0)
    }
    map.set(key, row)
  }

  return Array.from(map.values())
    .map(row => ({
      ...row,
      conversion_rate: rate(row.ordered_count, row.inquiry_count),
      share_in_customer: rate(row.inquiry_count, customerTotals.get(row.customer) ?? 0),
    }))
    .sort((a, b) => b.inquiry_count - a.inquiry_count || b.trade_amount - a.trade_amount)
}

function buildSeriesRows(items: InquiryItem[]): SeriesRow[] {
  const map = new Map<string, {
    series_name: string
    product_category: string
    inquiry_count: number
    ordered_count: number
    trade_amount: number
    gp_values: number[]
  }>()

  for (const item of items) {
    const series = item.series_name || "未知系列"
    const category = item.product_category || "未知品类"
    const key = `${series}|${category}`
    const row = map.get(key) ?? {
      series_name: series,
      product_category: category,
      inquiry_count: 0,
      ordered_count: 0,
      trade_amount: 0,
      gp_values: [],
    }
    row.inquiry_count += 1
    if (isOrdered(item.order_status)) {
      row.ordered_count += 1
      row.trade_amount += Number(item.trade_amount || 0)
      if (hasNumber(item.gross_profit_rate)) row.gp_values.push(Number(item.gross_profit_rate))
    }
    map.set(key, row)
  }

  return Array.from(map.values())
    .map(row => ({
      key: `${row.series_name}|${row.product_category}`,
      series_name: row.series_name,
      product_category: row.product_category,
      inquiry_count: row.inquiry_count,
      ordered_count: row.ordered_count,
      conversion_rate: rate(row.ordered_count, row.inquiry_count),
      trade_amount: row.trade_amount,
      avg_gross_profit_rate: avg(row.gp_values),
    }))
    .sort((a, b) => b.inquiry_count - a.inquiry_count || b.trade_amount - a.trade_amount)
}

function coverageRows(items: InquiryItem[]): CoverageRow[] {
  const fields: Array<{ field: keyof InquiryItem; label: string; note: string }> = [
    { field: "product_category", label: "产品大类", note: "品类分析核心字段。" },
    { field: "series_name", label: "系列", note: "系列排名和客户偏好分析字段。" },
    { field: "product_name", label: "品名", note: "款式和品类识别的基础字段。" },
    { field: "quantity", label: "询单数量", note: "订单规模和品类数量分析字段。" },
    { field: "trade_amount", label: "成交额", note: "成交贡献统计字段。" },
    { field: "gross_profit_rate", label: "毛利率", note: "品类利润质量分析字段。" },
  ]

  return fields.map(row => {
    const filled = items.filter(item => item[row.field] != null).length
    return {
      field: row.field,
      label: row.label,
      filled_count: filled,
      missing_count: items.length - filled,
      coverage_rate: items.length ? Math.round((filled / items.length) * 1000) / 10 : 0,
      note: row.note,
    }
  })
}

export default function ProductCategoryAnalysisPage() {
  const [year, setYear] = useState<number | undefined>(undefined)
  const [keyword, setKeyword] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined)

  const { data: inquiries = [], isFetching } = useQuery({
    queryKey: ["product-category-analysis", year],
    queryFn: () => fetchAllInquiries(year),
  })

  const categoryOptions = useMemo(() => {
    const categories = Array.from(new Set(inquiries.map(item => item.product_category).filter(Boolean) as string[])).sort()
    return categories.map(category => ({ label: category, value: category }))
  }, [inquiries])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return inquiries.filter(item => {
      if (categoryFilter && item.product_category !== categoryFilter) return false
      if (!kw) return true
      return [
        item.inquiry_no,
        item.customer_short_name,
        item.customer_code,
        item.product_category,
        item.product_name,
        item.series_name,
        item.responsible_sales,
      ].some(value => (value || "").toLowerCase().includes(kw))
    })
  }, [inquiries, keyword, categoryFilter])

  const categoryRows = useMemo(() => buildCategoryRows(filtered), [filtered])
  const matrixRows = useMemo(() => buildMatrixRows(filtered), [filtered])
  const seriesRows = useMemo(() => buildSeriesRows(filtered), [filtered])
  const fieldRows = useMemo(() => coverageRows(filtered), [filtered])

  const summary = useMemo(() => {
    const ordered = filtered.filter(item => isOrdered(item.order_status))
    const trade = ordered.reduce((sum, item) => sum + Number(item.trade_amount || 0), 0)
    const quantity = filtered.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const gpValues = ordered.filter(item => hasNumber(item.gross_profit_rate)).map(item => Number(item.gross_profit_rate))
    return {
      inquiry_count: filtered.length,
      ordered_count: ordered.length,
      category_count: new Set(filtered.map(item => item.product_category || "未知品类")).size,
      series_count: new Set(filtered.map(item => item.series_name || "未知系列")).size,
      customer_count: new Set(filtered.map(item => item.customer_short_name || item.customer_code || "未知客户")).size,
      conversion_rate: rate(ordered.length, filtered.length),
      trade_amount: trade,
      total_quantity: quantity,
      avg_gross_profit_rate: avg(gpValues),
    }
  }, [filtered])

  const categoryColumns: ColumnsType<CategoryRow> = [
    { title: "产品大类", dataIndex: "product_category", width: 130, fixed: "left" },
    { title: "询单数", dataIndex: "inquiry_count", width: 80, align: "right" },
    { title: "下单数", dataIndex: "ordered_count", width: 80, align: "right" },
    { title: "转化率", dataIndex: "conversion_rate", width: 90, align: "right", render: pct },
    { title: "成交额", dataIndex: "trade_amount", width: 110, align: "right", render: money },
    { title: "平均毛利率", dataIndex: "avg_gross_profit_rate", width: 110, align: "right", render: pct },
    { title: "总数量", dataIndex: "total_quantity", width: 100, align: "right", render: num },
    { title: "平均数量", dataIndex: "avg_quantity", width: 100, align: "right", render: num },
    { title: "客户数", dataIndex: "customer_count", width: 80, align: "right" },
    { title: "系列数", dataIndex: "series_count", width: 80, align: "right" },
    { title: "代表客户", dataIndex: "top_customer", width: 130, render: value => value || <Text type="secondary">—</Text> },
    { title: "代表系列", dataIndex: "top_series", width: 130, render: value => value || <Text type="secondary">—</Text> },
  ]

  const matrixColumns: ColumnsType<MatrixRow> = [
    { title: "客户", dataIndex: "customer", width: 140, fixed: "left" },
    { title: "品类", dataIndex: "product_category", width: 120 },
    { title: "询单数", dataIndex: "inquiry_count", width: 80, align: "right" },
    { title: "下单数", dataIndex: "ordered_count", width: 80, align: "right" },
    { title: "转化率", dataIndex: "conversion_rate", width: 90, align: "right", render: pct },
    { title: "成交额", dataIndex: "trade_amount", width: 110, align: "right", render: money },
    {
      title: "客户内占比",
      dataIndex: "share_in_customer",
      width: 170,
      render: value => <Space><Progress percent={value} size="small" style={{ width: 90 }} /><Text>{pct(value)}</Text></Space>,
    },
  ]

  const seriesColumns: ColumnsType<SeriesRow> = [
    { title: "系列", dataIndex: "series_name", width: 140, fixed: "left" },
    { title: "产品大类", dataIndex: "product_category", width: 120 },
    { title: "询单数", dataIndex: "inquiry_count", width: 80, align: "right" },
    { title: "下单数", dataIndex: "ordered_count", width: 80, align: "right" },
    { title: "转化率", dataIndex: "conversion_rate", width: 90, align: "right", render: pct },
    { title: "成交额", dataIndex: "trade_amount", width: 110, align: "right", render: money },
    { title: "平均毛利率", dataIndex: "avg_gross_profit_rate", width: 110, align: "right", render: pct },
  ]

  const coverageColumns: ColumnsType<CoverageRow> = [
    { title: "字段", dataIndex: "label", width: 120, fixed: "left" },
    { title: "覆盖率", dataIndex: "coverage_rate", width: 180, render: value => <Space><Progress percent={value} size="small" style={{ width: 100 }} /><Text>{pct(value)}</Text></Space> },
    { title: "已填写", dataIndex: "filled_count", width: 80, align: "right" },
    { title: "缺失", dataIndex: "missing_count", width: 80, align: "right" },
    { title: "说明", dataIndex: "note", render: value => <Text type="secondary">{value}</Text> },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>产品与品类分析</Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="当前页面按询单/订单口径分析产品大类、系列和客户偏好。工艺复杂度、面料成本、印花成本、辅料成本暂不硬算，等结构化字段补齐后再做进阶成本分析。"
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="全部年份" allowClear options={YEAR_OPTIONS} value={year} onChange={setYear} style={{ width: 120 }} />
          <Select placeholder="全部品类" allowClear showSearch options={categoryOptions} value={categoryFilter} onChange={setCategoryFilter} style={{ width: 160 }} />
          <Input.Search
            placeholder="搜索客户、品类、系列、品名、询单号"
            allowClear
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            style={{ width: 320 }}
          />
          <Tag color="blue">询单口径</Tag>
          <Text type="secondary">数据来源：inquiries</Text>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>询单数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.inquiry_count}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>下单数</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#52c41a" }}>{summary.ordered_count}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>转化率</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{pct(summary.conversion_rate)}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>品类数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.category_count}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>系列数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.series_count}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>客户数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.customer_count}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>成交额</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{money(summary.trade_amount)}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>平均毛利率</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{pct(summary.avg_gross_profit_rate)}</div></Card></Col>
      </Row>

      <Card size="small" title="品类表现排行" style={{ marginBottom: 16 }}>
        <Table<CategoryRow>
          rowKey="key"
          size="small"
          columns={categoryColumns}
          dataSource={categoryRows}
          loading={isFetching}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1300 }}
        />
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="客户 × 品类矩阵">
            <Table<MatrixRow>
              rowKey="key"
              size="small"
              columns={matrixColumns}
              dataSource={matrixRows.slice(0, 100)}
              loading={isFetching}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 760 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="产品系列排名">
            <Table<SeriesRow>
              rowKey="key"
              size="small"
              columns={seriesColumns}
              dataSource={seriesRows.slice(0, 100)}
              loading={isFetching}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 760 }}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="品类分析字段完整度" style={{ marginBottom: 16 }}>
        <Table<CoverageRow>
          rowKey="field"
          size="small"
          columns={coverageColumns}
          dataSource={fieldRows}
          loading={isFetching}
          pagination={false}
          scroll={{ x: 780 }}
        />
      </Card>

      <Alert
        type="warning"
        showIcon
        message="后续进阶项"
        description="工艺复杂度与价格关系、面料成本占比、印花成本测算、辅料成本占比，需要工艺、面料、印花、辅料成本字段结构化后再计算。当前页面先做品类、系列和客户偏好，不做成本猜测。"
      />
    </div>
  )
}
