import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Alert,
  Card,
  Col,
  Input,
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

interface MonthRow {
  month: string
  inquiry_count: number
  quoted_count: number
  ordered_count: number
  trade_amount: number
  conversion_rate: number
}

interface ContributionRow {
  key: string
  name: string
  inquiry_count: number
  ordered_count: number
  trade_amount: number
  conversion_rate: number
  share: number
}

function isOrdered(status: string | null): boolean {
  return !!status && ORDERED_STATUSES.has(status)
}

function isQuoted(status: string | null): boolean {
  return !!status && status !== "未报价"
}

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0
}

function money(value: number | null | undefined): string {
  return `$${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
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

function buildContribution(
  items: InquiryItem[],
  getName: (item: InquiryItem) => string,
): ContributionRow[] {
  const totalTrade = items.reduce((sum, item) => sum + (isOrdered(item.order_status) ? Number(item.trade_amount || 0) : 0), 0)
  const map = new Map<string, ContributionRow>()

  for (const item of items) {
    const name = getName(item)
    const row = map.get(name) ?? {
      key: name,
      name,
      inquiry_count: 0,
      ordered_count: 0,
      trade_amount: 0,
      conversion_rate: 0,
      share: 0,
    }
    row.inquiry_count += 1
    if (isOrdered(item.order_status)) {
      row.ordered_count += 1
      row.trade_amount += Number(item.trade_amount || 0)
    }
    map.set(name, row)
  }

  return Array.from(map.values())
    .map(row => ({
      ...row,
      conversion_rate: pct(row.ordered_count, row.inquiry_count),
      share: pct(row.trade_amount, totalTrade),
    }))
    .sort((a, b) => b.trade_amount - a.trade_amount || b.inquiry_count - a.inquiry_count)
}

export default function CompanyManagementAnalysisPage() {
  const [year, setYear] = useState<number | undefined>(undefined)
  const [keyword, setKeyword] = useState("")

  const { data: inquiries = [], isFetching } = useQuery({
    queryKey: ["company-management-analysis", year],
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
      item.product_category,
      item.product_name,
    ].some(value => (value || "").toLowerCase().includes(kw)))
  }, [inquiries, keyword])

  const summary = useMemo(() => {
    const total = filtered.length
    const quoted = filtered.filter(item => isQuoted(item.quote_status)).length
    const ordered = filtered.filter(item => isOrdered(item.order_status)).length
    const trade = filtered.reduce((sum, item) => sum + (isOrdered(item.order_status) ? Number(item.trade_amount || 0) : 0), 0)
    const customers = new Set(filtered.map(item => item.customer_short_name || item.customer_code).filter(Boolean)).size
    const sales = new Set(filtered.map(item => item.responsible_sales).filter(Boolean)).size
    return {
      total,
      quoted,
      ordered,
      trade,
      customers,
      sales,
      quote_rate: pct(quoted, total),
      conversion_rate: pct(ordered, total),
    }
  }, [filtered])

  const monthlyRows = useMemo<MonthRow[]>(() => {
    const map = new Map<string, MonthRow>()
    for (const item of filtered) {
      const key = monthKey(item.inquiry_date)
      const row = map.get(key) ?? {
        month: key,
        inquiry_count: 0,
        quoted_count: 0,
        ordered_count: 0,
        trade_amount: 0,
        conversion_rate: 0,
      }
      row.inquiry_count += 1
      if (isQuoted(item.quote_status)) row.quoted_count += 1
      if (isOrdered(item.order_status)) {
        row.ordered_count += 1
        row.trade_amount += Number(item.trade_amount || 0)
      }
      map.set(key, row)
    }
    return Array.from(map.values())
      .map(row => ({ ...row, conversion_rate: pct(row.ordered_count, row.inquiry_count) }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [filtered])

  const customerRows = useMemo(() => buildContribution(
    filtered,
    item => item.customer_short_name || item.customer_code || "未知客户",
  ), [filtered])

  const salesRows = useMemo(() => buildContribution(
    filtered,
    item => item.responsible_sales || "未知业务员",
  ), [filtered])

  const groupRows = useMemo(() => buildContribution(
    filtered,
    item => item.group_name || "未知小组",
  ), [filtered])

  const productRows = useMemo(() => buildContribution(
    filtered,
    item => item.product_category || "未知品类",
  ), [filtered])

  const trendColumns: ColumnsType<MonthRow> = [
    { title: "月份", dataIndex: "month", width: 110, fixed: "left" },
    { title: "询单数", dataIndex: "inquiry_count", width: 90, align: "right" },
    { title: "已报价", dataIndex: "quoted_count", width: 90, align: "right" },
    { title: "已下单", dataIndex: "ordered_count", width: 90, align: "right", render: value => <Text strong style={{ color: "#52c41a" }}>{value}</Text> },
    { title: "转化率", dataIndex: "conversion_rate", width: 100, align: "right", render: value => `${value}%` },
    { title: "成交额", dataIndex: "trade_amount", width: 120, align: "right", render: money },
  ]

  const contributionColumns: ColumnsType<ContributionRow> = [
    { title: "名称", dataIndex: "name", width: 150, fixed: "left" },
    { title: "询单数", dataIndex: "inquiry_count", width: 90, align: "right" },
    { title: "下单数", dataIndex: "ordered_count", width: 90, align: "right" },
    { title: "转化率", dataIndex: "conversion_rate", width: 100, align: "right", render: value => `${value}%` },
    { title: "成交额", dataIndex: "trade_amount", width: 120, align: "right", render: money },
    { title: "成交额占比", dataIndex: "share", width: 110, align: "right", render: value => `${value}%` },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>公司整体经营分析</Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="当前是基础版经营分析，直接读取询单总表做趋势和贡献统计。暂不做人效排名，也不做利润归因，避免在字段口径未确认前误导判断。"
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="全部年份" allowClear options={YEAR_OPTIONS} value={year} onChange={setYear} style={{ width: 120 }} />
          <Input.Search
            placeholder="搜索客户、业务员、小组、品类、询单号"
            allowClear
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            style={{ width: 320 }}
          />
          <Tag color="blue">基础版</Tag>
          <Text type="secondary">数据来源：inquiries</Text>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>询单总数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.total}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>已报价</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.quoted}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>已下单</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#52c41a" }}>{summary.ordered}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>报价率</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.quote_rate}%</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>转化率</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.conversion_rate}%</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>成交额</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{money(summary.trade)}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>客户数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.customers}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>业务员数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.sales}</div></Card></Col>
      </Row>

      <Card size="small" title="月度经营趋势" style={{ marginBottom: 16 }}>
        <Table<MonthRow>
          rowKey="month"
          size="small"
          columns={trendColumns}
          dataSource={monthlyRows}
          loading={isFetching}
          pagination={false}
          scroll={{ x: 700 }}
        />
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="客户贡献度排名">
            <Table<ContributionRow>
              rowKey="key"
              size="small"
              columns={contributionColumns}
              dataSource={customerRows.slice(0, 20)}
              loading={isFetching}
              pagination={false}
              scroll={{ x: 650 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="业务员基础产出">
            <Table<ContributionRow>
              rowKey="key"
              size="small"
              columns={contributionColumns}
              dataSource={salesRows.slice(0, 20)}
              loading={isFetching}
              pagination={false}
              scroll={{ x: 650 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card size="small" title="小组基础产出">
            <Table<ContributionRow>
              rowKey="key"
              size="small"
              columns={contributionColumns}
              dataSource={groupRows}
              loading={isFetching}
              pagination={false}
              scroll={{ x: 650 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="产品大类成交贡献">
            <Table<ContributionRow>
              rowKey="key"
              size="small"
              columns={contributionColumns}
              dataSource={productRows.slice(0, 20)}
              loading={isFetching}
              pagination={false}
              scroll={{ x: 650 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
