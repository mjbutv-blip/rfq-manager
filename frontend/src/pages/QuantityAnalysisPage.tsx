/**
 * 报价数量 / 订单规模分析（报价资料分析 Step 8）
 *
 * 统计单位是款式明细（inquiry_items），数量字段统一使用
 * inquiry_items.quantity（不是询单主表的 quantity）。数量总和只是当前
 * 筛选范围内款式数量的合计，仅供报价规模分析参考，不代表实际最终订单
 * 数量或公司总销量。
 */

import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Alert, Button, Card, Col, DatePicker, Input, Progress, Row,
  Select, Space, Table, Tabs, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import dayjs, { type Dayjs } from "dayjs"

import { fetchQuantityAnalysis } from "@/api/analytics"
import CreateTaskButton from "@/components/CreateTaskButton"
import type {
  QuantityAnalysisFilter, QuantityByCategory, QuantityByCustomer,
  QuantityByOrderStatus, QuantityBySales, QuantityDistributionBucket,
  QuantityPriorityItem, QuantityRiskSignal,
} from "@/types/analytics"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(y => ({ label: String(y), value: y }))
const BUCKET_OPTIONS = [
  "未填写", "0", "1–99", "100–499", "500–999",
  "1,000–2,999", "3,000–4,999", "5,000–9,999", "10,000+",
].map(b => ({ label: b, value: b }))

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function refAvg(v: number | null): string {
  return v != null ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"
}

export default function QuantityAnalysisPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // 从总览页"查看完整分析"跳转过来时，带筛选条件初始化（仅用一次，不持续同步 URL）
  const [year, setYear] = useState<number | undefined>(() => {
    const v = searchParams.get("year"); return v ? Number(v) : undefined
  })
  const [groupName, setGroupName] = useState(() => searchParams.get("group_name") ?? "")
  const [responsibleSales, setResponsibleSales] = useState(() => searchParams.get("responsible_sales") ?? "")
  const [customerCode, setCustomerCode] = useState(() => searchParams.get("customer_code") ?? "")
  const [productCategory, setProductCategory] = useState(() => searchParams.get("product_category") ?? "")
  const [seriesName, setSeriesName] = useState("")
  const [quoteStatus, setQuoteStatus] = useState("")
  const [orderStatus, setOrderStatus] = useState("")
  const [quantityBucket, setQuantityBucket] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(() => {
    const s = searchParams.get("start_date"), e = searchParams.get("end_date")
    return [s ? dayjs(s) : null, e ? dayjs(e) : null]
  })

  const filter: QuantityAnalysisFilter = {
    year,
    group_name: groupName || undefined,
    responsible_sales: responsibleSales || undefined,
    customer_code: customerCode || undefined,
    product_category: productCategory || undefined,
    series_name: seriesName || undefined,
    quote_status: quoteStatus || undefined,
    order_status: orderStatus || undefined,
    quantity_bucket: quantityBucket,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["quantity-analysis", filter],
    queryFn: () => fetchQuantityAnalysis(filter),
  })

  const handleReset = () => {
    setYear(undefined); setGroupName(""); setResponsibleSales("")
    setCustomerCode(""); setProductCategory(""); setSeriesName("")
    setQuoteStatus(""); setOrderStatus(""); setQuantityBucket(undefined)
    setDateRange([null, null])
  }

  const distColumns: ColumnsType<QuantityDistributionBucket> = [
    { title: "数量区间", dataIndex: "quantity_bucket", width: 130 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "款式占比", dataIndex: "style_share", width: 180,
      render: (v: number) => (
        <Space size={6}><Progress percent={Math.round(v * 1000) / 10} size="small" style={{ width: 100 }} showInfo={false} /><Text style={{ fontSize: 12 }}>{pct(v)}</Text></Space>
      ) },
    { title: "数量合计", dataIndex: "quantity_total", width: 110, align: "right",
      render: (v: number) => v.toLocaleString() },
    { title: "客户数", dataIndex: "customer_count", width: 80, align: "right" },
    { title: "品类数", dataIndex: "category_count", width: 80, align: "right" },
  ]

  const customerColumns: ColumnsType<QuantityByCustomer> = [
    { title: "客户编码", dataIndex: "customer_code", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "客户简称", dataIndex: "customer_short_name", width: 140 },
    { title: "款式总数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "数量覆盖率", dataIndex: "quantity_coverage_rate", width: 100, render: (v: number) => pct(v) },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right", render: (v: number) => v.toLocaleString() },
    { title: "平均数量", dataIndex: "average_quantity", width: 100, align: "right", render: refAvg },
    { title: "中位数", dataIndex: "median_quantity", width: 90, align: "right", render: refAvg },
    { title: "主要区间", dataIndex: "top_quantity_bucket", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "小批量占比", dataIndex: "small_batch_share", width: 100, render: (v: number) => pct(v) },
    { title: "大批量占比", dataIndex: "large_batch_share", width: 100, render: (v: number) => pct(v) },
  ]

  const categoryColumns: ColumnsType<QuantityByCategory> = [
    { title: "产品品类", dataIndex: "product_category", width: 120 },
    { title: "款式总数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "数量覆盖率", dataIndex: "quantity_coverage_rate", width: 100, render: (v: number) => pct(v) },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right", render: (v: number) => v.toLocaleString() },
    { title: "平均数量", dataIndex: "average_quantity", width: 100, align: "right", render: refAvg },
    { title: "中位数", dataIndex: "median_quantity", width: 90, align: "right", render: refAvg },
    { title: "主要区间", dataIndex: "top_quantity_bucket", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "小批量占比", dataIndex: "small_batch_share", width: 100, render: (v: number) => pct(v) },
    { title: "大批量占比", dataIndex: "large_batch_share", width: 100, render: (v: number) => pct(v) },
  ]

  const salesColumns: ColumnsType<QuantityBySales> = [
    { title: "负责业务员", dataIndex: "responsible_sales", width: 120 },
    { title: "款式总数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "数量覆盖率", dataIndex: "quantity_coverage_rate", width: 100, render: (v: number) => pct(v) },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right", render: (v: number) => v.toLocaleString() },
    { title: "平均数量", dataIndex: "average_quantity", width: 100, align: "right", render: refAvg },
    { title: "中位数", dataIndex: "median_quantity", width: 90, align: "right", render: refAvg },
    { title: "主要区间", dataIndex: "top_quantity_bucket", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
  ]

  const statusColumns: ColumnsType<QuantityByOrderStatus> = [
    { title: "报价状态", dataIndex: "quote_status", width: 110 },
    { title: "订单状态", dataIndex: "order_status", width: 110 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right", render: (v: number) => v.toLocaleString() },
    { title: "平均数量", dataIndex: "average_quantity", width: 100, align: "right", render: refAvg },
    { title: "中位数", dataIndex: "median_quantity", width: 90, align: "right", render: refAvg },
  ]

  const riskColumns: ColumnsType<QuantityRiskSignal> = [
    { title: "信号", dataIndex: "label", width: 300 },
    { title: "涉及款式数", dataIndex: "style_count", width: 100, align: "right",
      render: (v: number) => v > 0 ? <Text type="warning">{v}</Text> : v },
    { title: "说明（仅数据关联提示，非因果结论）", dataIndex: "hint", render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
  ]

  const priorityColumns: ColumnsType<QuantityPriorityItem> = [
    { title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: QuantityPriorityItem) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a> },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 130, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "款号", dataIndex: "style_no", width: 90, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "品类", dataIndex: "product_category", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "数量", dataIndex: "quantity", width: 90, align: "right", render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "数量区间", dataIndex: "quantity_bucket", width: 100 },
    { title: "风险提示", dataIndex: "risk_hint", width: 240, render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: "询单日期", dataIndex: "inquiry_date", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "订单状态", dataIndex: "order_status", width: 90, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "报价状态", dataIndex: "quote_status", width: 90, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "操作", key: "action", width: 190, fixed: "right",
      render: (_: unknown, r: QuantityPriorityItem) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}?item_id=${r.item_id}`)}>去补录</Button>
          <CreateTaskButton itemId={r.item_id} sourceModule="quantity-analysis" />
        </Space>
      ) },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>报价数量分析</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="全部年份" allowClear options={YEAR_OPTIONS}
            value={year} onChange={setYear} style={{ width: 110 }} />
          <Input placeholder="所属小组" allowClear value={groupName}
            onChange={e => setGroupName(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="负责业务员" allowClear value={responsibleSales}
            onChange={e => setResponsibleSales(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="客户编码" allowClear value={customerCode}
            onChange={e => setCustomerCode(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="产品品类" allowClear value={productCategory}
            onChange={e => setProductCategory(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="系列" allowClear value={seriesName}
            onChange={e => setSeriesName(e.target.value)} style={{ width: 100 }} />
          <Input placeholder="报价状态" allowClear value={quoteStatus}
            onChange={e => setQuoteStatus(e.target.value)} style={{ width: 100 }} />
          <Input placeholder="订单状态" allowClear value={orderStatus}
            onChange={e => setOrderStatus(e.target.value)} style={{ width: 100 }} />
          <Select placeholder="数量区间" options={BUCKET_OPTIONS} allowClear
            value={quantityBucket} onChange={setQuantityBucket} style={{ width: 130 }} />
          <RangePicker
            value={dateRange}
            onChange={dates => setDateRange(dates ? [dates[0], dates[1]] : [null, null])}
            placeholder={["询单日期起", "询单日期止"]}
          />
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Card>

      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message="本页数据基于当前款式明细数量（inquiry_items.quantity），仅供报价规模分析参考，不代表实际最终订单数量或公司总销量"
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>款式总数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.total_style_items ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>有数量资料</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#52c41a" }}>{data?.summary.items_with_quantity ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>缺数量</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#ff4d4f" }}>{data?.summary.items_without_quantity ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>数量合计</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{(data?.summary.quantity_total ?? 0).toLocaleString()}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>平均数量</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{refAvg(data?.summary.average_quantity ?? null)}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>中位数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{refAvg(data?.summary.median_quantity ?? null)}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>最大数量</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.max_quantity ?? <Text type="secondary">—</Text>}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>小批量款式数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.small_batch_style_count ?? 0}</div>
        </Card></Col>
      </Row>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>大批量款式数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.large_batch_style_count ?? 0}</div>
        </Card></Col>
      </Row>

      <Card size="small" title="数量区间分布" style={{ marginBottom: 16 }}>
        <Table<QuantityDistributionBucket>
          rowKey="quantity_bucket" size="small" columns={distColumns}
          dataSource={data?.quantity_distribution ?? []} loading={isFetching}
          pagination={false}
        />
      </Card>

      <Card size="small">
        <Tabs
          items={[
            { key: "customer", label: "按客户", children: (
              <Table<QuantityByCustomer> rowKey={r => `${r.customer_code}-${r.customer_short_name}`}
                size="small" columns={customerColumns} dataSource={data?.by_customer ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 1100 }} />
            ) },
            { key: "category", label: "按品类", children: (
              <Table<QuantityByCategory> rowKey="product_category"
                size="small" columns={categoryColumns} dataSource={data?.by_category ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 1100 }} />
            ) },
            { key: "sales", label: "按业务员", children: (
              <Table<QuantityBySales> rowKey="responsible_sales"
                size="small" columns={salesColumns} dataSource={data?.by_sales ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 700 }} />
            ) },
            { key: "status", label: "按报价/订单状态", children: (
              <Table<QuantityByOrderStatus> rowKey={r => `${r.quote_status}-${r.order_status}`}
                size="small" columns={statusColumns} dataSource={data?.by_order_status ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 700 }} />
            ) },
            { key: "risk", label: "数量风险提示", children: (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                  说明：以下信号仅是数据关联提示，不代表因果判断，不会自动判定数量异常或修改数据。
                </Text>
                <Table<QuantityRiskSignal> rowKey="signal_type"
                  size="small" columns={riskColumns} dataSource={data?.quantity_risk_signals ?? []}
                  loading={isFetching} pagination={false} />
              </>
            ) },
            { key: "priority", label: "优先补录款式", children: (
              <Table<QuantityPriorityItem> rowKey="item_id"
                size="small" columns={priorityColumns} dataSource={data?.priority_items ?? []}
                loading={isFetching} pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }} scroll={{ x: 1500 }} />
            ) },
          ]}
        />
      </Card>
    </div>
  )
}
