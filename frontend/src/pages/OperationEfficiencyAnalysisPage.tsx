import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Alert,
  Card,
  Col,
  Input,
  InputNumber,
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
const OPEN_STATUSES = new Set(["跟进中", "报价中", "未报价", ""])

interface StatusRow {
  key: string
  status: string
  count: number
  share: number
}

interface OwnerRow {
  key: string
  name: string
  inquiry_count: number
  open_count: number
  overdue_count: number
  missing_quote_status_count: number
  missing_order_date_count: number
  avg_order_cycle_days: number | null
}

interface MonthRow {
  month: string
  inquiry_count: number
  ordered_count: number
  open_count: number
  overdue_count: number
  avg_order_cycle_days: number | null
}

function isOrdered(status: string | null): boolean {
  return !!status && ORDERED_STATUSES.has(status)
}

function isOpen(item: InquiryItem): boolean {
  if (isOrdered(item.order_status)) return false
  return OPEN_STATUSES.has(item.order_status || "") || !item.order_status
}

function daysBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000)
  return Number.isFinite(days) && days >= 0 ? days : null
}

function daysSince(date: string | null): number | null {
  if (!date) return null
  const start = new Date(`${date}T00:00:00`)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - start.getTime()) / 86_400_000)
  return Number.isFinite(days) && days >= 0 ? days : null
}

function avg(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null
}

function rate(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0
}

function pct(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

function monthKey(date: string | null): string {
  return date ? date.slice(0, 7) : "未知月份"
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

function buildStatusRows(items: InquiryItem[], getStatus: (item: InquiryItem) => string | null): StatusRow[] {
  const map = new Map<string, number>()
  for (const item of items) {
    const status = getStatus(item) || "未填写"
    map.set(status, (map.get(status) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([status, count]) => ({ key: status, status, count, share: rate(count, items.length) }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
}

function buildOwnerRows(items: InquiryItem[], getName: (item: InquiryItem) => string, overdueDays: number): OwnerRow[] {
  const map = new Map<string, {
    name: string
    inquiry_count: number
    open_count: number
    overdue_count: number
    missing_quote_status_count: number
    missing_order_date_count: number
    cycles: number[]
  }>()

  for (const item of items) {
    const name = getName(item)
    const row = map.get(name) ?? {
      name,
      inquiry_count: 0,
      open_count: 0,
      overdue_count: 0,
      missing_quote_status_count: 0,
      missing_order_date_count: 0,
      cycles: [],
    }
    row.inquiry_count += 1
    const open = isOpen(item)
    if (open) row.open_count += 1
    if (open && (daysSince(item.inquiry_date) ?? 0) > overdueDays) row.overdue_count += 1
    if (!item.quote_status) row.missing_quote_status_count += 1
    if (isOrdered(item.order_status) && !item.order_date) row.missing_order_date_count += 1
    const cycle = daysBetween(item.inquiry_date, item.order_date)
    if (cycle != null && isOrdered(item.order_status)) row.cycles.push(cycle)
    map.set(name, row)
  }

  return Array.from(map.values())
    .map(row => ({
      key: row.name,
      name: row.name,
      inquiry_count: row.inquiry_count,
      open_count: row.open_count,
      overdue_count: row.overdue_count,
      missing_quote_status_count: row.missing_quote_status_count,
      missing_order_date_count: row.missing_order_date_count,
      avg_order_cycle_days: avg(row.cycles),
    }))
    .sort((a, b) => b.overdue_count - a.overdue_count || b.open_count - a.open_count)
}

function buildMonthRows(items: InquiryItem[], overdueDays: number): MonthRow[] {
  const map = new Map<string, {
    month: string
    inquiry_count: number
    ordered_count: number
    open_count: number
    overdue_count: number
    cycles: number[]
  }>()

  for (const item of items) {
    const key = monthKey(item.inquiry_date)
    const row = map.get(key) ?? {
      month: key,
      inquiry_count: 0,
      ordered_count: 0,
      open_count: 0,
      overdue_count: 0,
      cycles: [],
    }
    row.inquiry_count += 1
    if (isOrdered(item.order_status)) row.ordered_count += 1
    const open = isOpen(item)
    if (open) row.open_count += 1
    if (open && (daysSince(item.inquiry_date) ?? 0) > overdueDays) row.overdue_count += 1
    const cycle = daysBetween(item.inquiry_date, item.order_date)
    if (cycle != null && isOrdered(item.order_status)) row.cycles.push(cycle)
    map.set(key, row)
  }

  return Array.from(map.values())
    .map(row => ({ ...row, avg_order_cycle_days: avg(row.cycles) }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export default function OperationEfficiencyAnalysisPage() {
  const [year, setYear] = useState<number | undefined>(undefined)
  const [keyword, setKeyword] = useState("")
  const [overdueDays, setOverdueDays] = useState(30)

  const { data: inquiries = [], isFetching } = useQuery({
    queryKey: ["operation-efficiency-analysis", year],
    queryFn: () => fetchAllInquiries(year),
  })

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return inquiries
    return inquiries.filter(item => [
      item.inquiry_no,
      item.customer_short_name,
      item.customer_code,
      item.responsible_sales,
      item.group_name,
      item.quote_status,
      item.order_status,
      item.product_name,
    ].some(value => (value || "").toLowerCase().includes(kw)))
  }, [inquiries, keyword])

  const ordered = useMemo(() => filtered.filter(item => isOrdered(item.order_status)), [filtered])
  const openRows = useMemo(() => filtered
    .filter(item => isOpen(item))
    .map(item => ({ ...item, pending_days: daysSince(item.inquiry_date) }))
    .filter(item => (item.pending_days ?? 0) > overdueDays)
    .sort((a, b) => (b.pending_days ?? 0) - (a.pending_days ?? 0))
    .slice(0, 100), [filtered, overdueDays])

  const missingOrderDateRows = useMemo(() => filtered
    .filter(item => isOrdered(item.order_status) && !item.order_date)
    .slice(0, 100), [filtered])

  const missingQuoteStatusRows = useMemo(() => filtered
    .filter(item => item.inquiry_date && !item.quote_status)
    .slice(0, 100), [filtered])

  const orderCycles = useMemo(() => ordered
    .map(item => daysBetween(item.inquiry_date, item.order_date))
    .filter((value): value is number => value != null), [ordered])

  const summary = useMemo(() => ({
    total: filtered.length,
    ordered: ordered.length,
    open: filtered.filter(item => isOpen(item)).length,
    overdue: openRows.length,
    missing_order_date: missingOrderDateRows.length,
    missing_quote_status: missingQuoteStatusRows.length,
    avg_order_cycle_days: avg(orderCycles),
  }), [filtered, ordered, openRows, missingOrderDateRows, missingQuoteStatusRows, orderCycles])

  const quoteStatusRows = useMemo(() => buildStatusRows(filtered, item => item.quote_status), [filtered])
  const orderStatusRows = useMemo(() => buildStatusRows(filtered, item => item.order_status), [filtered])
  const salesRows = useMemo(() => buildOwnerRows(filtered, item => item.responsible_sales || "未知业务员", overdueDays), [filtered, overdueDays])
  const groupRows = useMemo(() => buildOwnerRows(filtered, item => item.group_name || "未知小组", overdueDays), [filtered, overdueDays])
  const monthRows = useMemo(() => buildMonthRows(filtered, overdueDays), [filtered, overdueDays])

  const statusColumns: ColumnsType<StatusRow> = [
    { title: "状态", dataIndex: "status", width: 120 },
    { title: "数量", dataIndex: "count", width: 80, align: "right" },
    {
      title: "占比",
      dataIndex: "share",
      width: 180,
      render: value => <Space><Progress percent={value} size="small" style={{ width: 100 }} /><Text>{pct(value)}</Text></Space>,
    },
  ]

  const ownerColumns: ColumnsType<OwnerRow> = [
    { title: "名称", dataIndex: "name", width: 130, fixed: "left" },
    { title: "询单数", dataIndex: "inquiry_count", width: 80, align: "right" },
    { title: "待处理", dataIndex: "open_count", width: 80, align: "right" },
    { title: "超期跟进", dataIndex: "overdue_count", width: 90, align: "right", render: value => value ? <Text type="danger">{value}</Text> : 0 },
    { title: "缺报价状态", dataIndex: "missing_quote_status_count", width: 100, align: "right" },
    { title: "下单缺日期", dataIndex: "missing_order_date_count", width: 100, align: "right" },
    { title: "平均下单周期", dataIndex: "avg_order_cycle_days", width: 120, align: "right", render: value => value == null ? "—" : `${value} 天` },
  ]

  const monthColumns: ColumnsType<MonthRow> = [
    { title: "月份", dataIndex: "month", width: 110, fixed: "left" },
    { title: "询单数", dataIndex: "inquiry_count", width: 80, align: "right" },
    { title: "下单数", dataIndex: "ordered_count", width: 80, align: "right" },
    { title: "待处理", dataIndex: "open_count", width: 80, align: "right" },
    { title: "超期跟进", dataIndex: "overdue_count", width: 90, align: "right" },
    { title: "平均下单周期", dataIndex: "avg_order_cycle_days", width: 120, align: "right", render: value => value == null ? "—" : `${value} 天` },
  ]

  const inquiryColumns: ColumnsType<InquiryItem & { pending_days?: number | null }> = [
    { title: "询单号", dataIndex: "inquiry_no", width: 120, fixed: "left" },
    { title: "客户", dataIndex: "customer_short_name", width: 110, render: (value, row) => value || row.customer_code || "—" },
    { title: "业务员", dataIndex: "responsible_sales", width: 100, render: value => value || "—" },
    { title: "小组", dataIndex: "group_name", width: 100, render: value => value || "—" },
    { title: "询单日期", dataIndex: "inquiry_date", width: 110, render: value => value || "—" },
    { title: "报价状态", dataIndex: "quote_status", width: 100, render: value => value || <Tag color="orange">缺失</Tag> },
    { title: "订单状态", dataIndex: "order_status", width: 100, render: value => value || <Tag color="orange">缺失</Tag> },
    { title: "待处理天数", dataIndex: "pending_days", width: 110, align: "right", render: value => value == null ? "—" : `${value} 天` },
    { title: "下单日期", dataIndex: "order_date", width: 110, render: value => value || "—" },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>运营效率与流程管理</Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="当前是基础版流程分析，使用询单日期、下单日期、报价状态和订单状态计算。合同回签、打样次数、转单问题追踪待字段口径明确后再做。"
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="全部年份" allowClear options={YEAR_OPTIONS} value={year} onChange={setYear} style={{ width: 120 }} />
          <Input.Search
            placeholder="搜索客户、业务员、小组、状态、询单号"
            allowClear
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            style={{ width: 320 }}
          />
          <Text>超期阈值</Text>
          <InputNumber min={1} max={365} value={overdueDays} onChange={value => setOverdueDays(Number(value ?? 30))} addonAfter="天" style={{ width: 130 }} />
          <Tag color="blue">基础版</Tag>
          <Text type="secondary">数据来源：inquiries</Text>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>询单总数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.total}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>已下单</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#52c41a" }}>{summary.ordered}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>待处理</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.open}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>超期跟进</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#ff4d4f" }}>{summary.overdue}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>平均下单周期</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.avg_order_cycle_days == null ? "—" : `${summary.avg_order_cycle_days} 天`}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>下单缺日期</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#fa8c16" }}>{summary.missing_order_date}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>缺报价状态</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#fa8c16" }}>{summary.missing_quote_status}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>下单率</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{pct(rate(summary.ordered, summary.total))}</div></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="报价状态分布">
            <Table<StatusRow> rowKey="key" size="small" columns={statusColumns} dataSource={quoteStatusRows} loading={isFetching} pagination={false} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="订单状态分布">
            <Table<StatusRow> rowKey="key" size="small" columns={statusColumns} dataSource={orderStatusRows} loading={isFetching} pagination={false} />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="月度处理量趋势" style={{ marginBottom: 16 }}>
        <Table<MonthRow> rowKey="month" size="small" columns={monthColumns} dataSource={monthRows} loading={isFetching} pagination={false} scroll={{ x: 700 }} />
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="按业务员看待处理与异常">
            <Table<OwnerRow> rowKey="key" size="small" columns={ownerColumns} dataSource={salesRows} loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 760 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="按小组看待处理与异常">
            <Table<OwnerRow> rowKey="key" size="small" columns={ownerColumns} dataSource={groupRows} loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 760 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card size="small" title={`超过 ${overdueDays} 天仍未下单的跟进中询单`}>
            <Table<InquiryItem & { pending_days?: number | null }> rowKey="id" size="small" columns={inquiryColumns} dataSource={openRows} loading={isFetching} pagination={{ pageSize: 8 }} scroll={{ x: 860 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="流程数据异常">
            <Space direction="vertical" style={{ width: "100%" }}>
              <Alert type="warning" showIcon message={`已下单但缺下单日期：${missingOrderDateRows.length} 条`} />
              <Table<InquiryItem & { pending_days?: number | null }> rowKey="id" size="small" columns={inquiryColumns} dataSource={missingOrderDateRows} loading={isFetching} pagination={{ pageSize: 5 }} scroll={{ x: 860 }} />
              <Alert type="warning" showIcon message={`有询单日期但无报价状态：${missingQuoteStatusRows.length} 条`} />
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
