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

interface ProfitContributionRow {
  key: string
  name: string
  inquiry_count: number
  ordered_count: number
  trade_amount: number
  estimated_gross_profit: number
  avg_gross_profit_rate: number | null
  profit_share: number
}

interface FieldCoverageRow {
  field: string
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

function money(value: number | null | undefined): string {
  return `$${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function pct(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

function estimatedGrossProfit(item: InquiryItem): number | null {
  if (!isOrdered(item.order_status)) return null
  if (!hasNumber(item.trade_amount) || !hasNumber(item.gross_profit_rate)) return null
  return Number(item.trade_amount) * Number(item.gross_profit_rate) / 100
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
): ProfitContributionRow[] {
  const map = new Map<string, {
    key: string
    name: string
    inquiry_count: number
    ordered_count: number
    trade_amount: number
    estimated_gross_profit: number
    rates: number[]
  }>()

  for (const item of items) {
    const name = getName(item)
    const row = map.get(name) ?? {
      key: name,
      name,
      inquiry_count: 0,
      ordered_count: 0,
      trade_amount: 0,
      estimated_gross_profit: 0,
      rates: [],
    }
    row.inquiry_count += 1
    if (isOrdered(item.order_status)) {
      row.ordered_count += 1
      row.trade_amount += Number(item.trade_amount || 0)
      const profit = estimatedGrossProfit(item)
      if (profit != null) row.estimated_gross_profit += profit
      if (hasNumber(item.gross_profit_rate)) row.rates.push(Number(item.gross_profit_rate))
    }
    map.set(name, row)
  }

  const totalProfit = Array.from(map.values()).reduce((sum, row) => sum + row.estimated_gross_profit, 0)
  return Array.from(map.values())
    .map(row => ({
      ...row,
      avg_gross_profit_rate: row.rates.length
        ? Math.round((row.rates.reduce((sum, v) => sum + v, 0) / row.rates.length) * 10) / 10
        : null,
      profit_share: totalProfit ? Math.round((row.estimated_gross_profit / totalProfit) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.estimated_gross_profit - a.estimated_gross_profit || b.trade_amount - a.trade_amount)
}

function fieldCoverage(items: InquiryItem[]): FieldCoverageRow[] {
  const fields: Array<{ field: keyof InquiryItem; label: string; note: string }> = [
    { field: "final_quote", label: "对客报价", note: "询单总表字段，可用于基础利润口径校验。" },
    { field: "factory_price", label: "工厂价", note: "询单总表字段，非工厂报价明细。" },
    { field: "gross_profit_rate", label: "毛利率", note: "当前基础版利润分析核心字段。" },
    { field: "trade_amount", label: "贸易额", note: "成交金额统计核心字段。" },
    { field: "order_unit_price", label: "订单单价", note: "用于成交价格口径校验。" },
    { field: "order_quantity", label: "下单数量", note: "用于规模和利润影响分析。" },
  ]
  return fields.map(field => {
    const filled = items.filter(item => item[field.field] != null).length
    return {
      field: String(field.field),
      label: field.label,
      filled_count: filled,
      missing_count: items.length - filled,
      coverage_rate: items.length ? Math.round((filled / items.length) * 1000) / 10 : 0,
      note: field.note,
    }
  })
}

export default function ProfitCostAnalysisPage() {
  const [year, setYear] = useState<number | undefined>(undefined)
  const [keyword, setKeyword] = useState("")
  const [lowMarginThreshold, setLowMarginThreshold] = useState<number>(10)

  const { data: inquiries = [], isFetching } = useQuery({
    queryKey: ["profit-cost-analysis", year],
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

  const ordered = useMemo(() => filtered.filter(item => isOrdered(item.order_status)), [filtered])
  const withProfitRate = useMemo(() => ordered.filter(item => hasNumber(item.gross_profit_rate)), [ordered])

  const summary = useMemo(() => {
    const totalTrade = ordered.reduce((sum, item) => sum + Number(item.trade_amount || 0), 0)
    const estimatedProfit = ordered.reduce((sum, item) => sum + (estimatedGrossProfit(item) || 0), 0)
    const rates = withProfitRate.map(item => Number(item.gross_profit_rate))
    const avgRate = rates.length ? Math.round((rates.reduce((sum, v) => sum + v, 0) / rates.length) * 10) / 10 : null
    return {
      ordered_count: ordered.length,
      profit_sample_count: withProfitRate.length,
      missing_profit_count: ordered.length - withProfitRate.length,
      total_trade_amount: totalTrade,
      estimated_gross_profit: estimatedProfit,
      avg_gross_profit_rate: avgRate,
      low_profit_count: withProfitRate.filter(item => Number(item.gross_profit_rate) < lowMarginThreshold).length,
    }
  }, [ordered, withProfitRate, lowMarginThreshold])

  const customerRows = useMemo(() => buildContribution(
    ordered,
    item => item.customer_short_name || item.customer_code || "未知客户",
  ), [ordered])

  const categoryRows = useMemo(() => buildContribution(
    ordered,
    item => item.product_category || "未知品类",
  ), [ordered])

  const salesRows = useMemo(() => buildContribution(
    ordered,
    item => item.responsible_sales || "未知业务员",
  ), [ordered])

  const groupRows = useMemo(() => buildContribution(
    ordered,
    item => item.group_name || "未知小组",
  ), [ordered])

  const coverageRows = useMemo(() => fieldCoverage(filtered), [filtered])

  const lowProfitRows = useMemo(() => withProfitRate
    .filter(item => Number(item.gross_profit_rate) < lowMarginThreshold)
    .sort((a, b) => Number(a.gross_profit_rate || 0) - Number(b.gross_profit_rate || 0))
    .slice(0, 100), [withProfitRate, lowMarginThreshold])

  const missingProfitRows = useMemo(() => ordered
    .filter(item => !hasNumber(item.gross_profit_rate))
    .sort((a, b) => Number(b.trade_amount || 0) - Number(a.trade_amount || 0))
    .slice(0, 100), [ordered])

  const contributionColumns: ColumnsType<ProfitContributionRow> = [
    { title: "名称", dataIndex: "name", width: 150, fixed: "left" },
    { title: "询单数", dataIndex: "inquiry_count", width: 80, align: "right" },
    { title: "下单数", dataIndex: "ordered_count", width: 80, align: "right" },
    { title: "成交额", dataIndex: "trade_amount", width: 110, align: "right", render: money },
    { title: "估算毛利润", dataIndex: "estimated_gross_profit", width: 120, align: "right", render: money },
    { title: "平均毛利率", dataIndex: "avg_gross_profit_rate", width: 110, align: "right", render: pct },
    { title: "利润占比", dataIndex: "profit_share", width: 90, align: "right", render: value => `${value}%` },
  ]

  const riskColumns: ColumnsType<InquiryItem> = [
    { title: "询单号", dataIndex: "inquiry_no", width: 120, fixed: "left" },
    { title: "客户", dataIndex: "customer_short_name", width: 110, render: (value, row) => value || row.customer_code || "—" },
    { title: "品名", dataIndex: "product_name", width: 140, ellipsis: true, render: value => value || "—" },
    { title: "业务员", dataIndex: "responsible_sales", width: 100, render: value => value || "—" },
    { title: "成交额", dataIndex: "trade_amount", width: 110, align: "right", render: money },
    { title: "工厂价", dataIndex: "factory_price", width: 100, align: "right", render: value => value == null ? "—" : value },
    { title: "对客报价", dataIndex: "final_quote", width: 100, align: "right", render: value => value == null ? "—" : value },
    { title: "毛利率", dataIndex: "gross_profit_rate", width: 90, align: "right", render: value => value == null ? <Tag color="orange">缺失</Tag> : pct(Number(value)) },
  ]

  const coverageColumns: ColumnsType<FieldCoverageRow> = [
    { title: "字段", dataIndex: "label", width: 120, fixed: "left" },
    { title: "覆盖率", dataIndex: "coverage_rate", width: 180, render: value => <Space><Progress percent={value} size="small" style={{ width: 100 }} /><Text>{value}%</Text></Space> },
    { title: "已填写", dataIndex: "filled_count", width: 90, align: "right" },
    { title: "缺失", dataIndex: "missing_count", width: 90, align: "right" },
    { title: "说明", dataIndex: "note", render: value => <Text type="secondary">{value}</Text> },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>利润与成本结构分析</Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="当前是基础版：只使用询单总表已有字段做利润风险和字段完整度分析。估算毛利润 = 成交额 × 毛利率，不等同于已拆解后的净利润。"
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
          <Text>低毛利阈值</Text>
          <InputNumber min={0} max={100} value={lowMarginThreshold} onChange={value => setLowMarginThreshold(Number(value ?? 0))} addonAfter="%" style={{ width: 120 }} />
          <Tag color="blue">基础版</Tag>
          <Text type="secondary">数据来源：inquiries</Text>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>成交询单数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.ordered_count}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>有毛利率样本</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.profit_sample_count}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>缺毛利字段</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#fa8c16" }}>{summary.missing_profit_count}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>成交贸易额</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{money(summary.total_trade_amount)}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>估算毛利润</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{money(summary.estimated_gross_profit)}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>平均毛利率</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{pct(summary.avg_gross_profit_rate)}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>低毛利订单</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#ff4d4f" }}>{summary.low_profit_count}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>样本覆盖率</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{summary.ordered_count ? Math.round((summary.profit_sample_count / summary.ordered_count) * 1000) / 10 : 0}%</div></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="客户利润贡献">
            <Table<ProfitContributionRow> rowKey="key" size="small" columns={contributionColumns} dataSource={customerRows.slice(0, 20)} loading={isFetching} pagination={false} scroll={{ x: 760 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="产品大类利润贡献">
            <Table<ProfitContributionRow> rowKey="key" size="small" columns={contributionColumns} dataSource={categoryRows.slice(0, 20)} loading={isFetching} pagination={false} scroll={{ x: 760 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="业务员利润贡献">
            <Table<ProfitContributionRow> rowKey="key" size="small" columns={contributionColumns} dataSource={salesRows.slice(0, 20)} loading={isFetching} pagination={false} scroll={{ x: 760 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="小组利润贡献">
            <Table<ProfitContributionRow> rowKey="key" size="small" columns={contributionColumns} dataSource={groupRows} loading={isFetching} pagination={false} scroll={{ x: 760 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title={`低毛利风险（低于 ${lowMarginThreshold}%）`}>
            <Table<InquiryItem> rowKey="id" size="small" columns={riskColumns} dataSource={lowProfitRows} loading={isFetching} pagination={{ pageSize: 8 }} scroll={{ x: 780 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="已下单但毛利字段缺失">
            <Table<InquiryItem> rowKey="id" size="small" columns={riskColumns} dataSource={missingProfitRows} loading={isFetching} pagination={{ pageSize: 8 }} scroll={{ x: 780 }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="成本与利润字段完整度" style={{ marginBottom: 16 }}>
        <Table<FieldCoverageRow> rowKey="field" size="small" columns={coverageColumns} dataSource={coverageRows} loading={isFetching} pagination={false} scroll={{ x: 800 }} />
      </Card>

      <Alert
        type="warning"
        showIcon
        message="暂不计算的成本项"
        description="测试费、杂费、分批走货、面辅料成本、印花成本、港杂费和佣金的完整拆解需要 quote_items 或后续结构化字段。当前页面不会用空字段硬算净利润。"
      />
    </div>
  )
}
