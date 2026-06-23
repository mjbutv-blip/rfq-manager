/**
 * 尺码范围与尺码偏好分析（报价资料分析 Step 7）
 *
 * 款式相关统计单位是款式明细（inquiry_items），标准化尺码统计单位是
 * inquiry_item_sizes。尺码跨度只是"标准化尺码记录数量"，不做任何尺码体系
 * 换算；工艺/尺码风险信号只是数据关联提示，不做风险预测。
 */

import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Alert, Button, Card, Col, DatePicker, Input, InputNumber, Progress, Row,
  Select, Space, Table, Tabs, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import dayjs, { type Dayjs } from "dayjs"

import { fetchSizeAnalysis } from "@/api/analytics"
import CreateTaskButton from "@/components/CreateTaskButton"
import type {
  SizeAnalysisFilter, SizeByCategory, SizeByCustomer, SizePriorityItem,
  SizeRanking, SizeRiskSignal, SizeSpanBucket,
} from "@/types/analytics"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(y => ({ label: String(y), value: y }))
const SPECIAL_OPTIONS = [
  { label: "全部", value: undefined },
  { label: "仅特殊尺码", value: true },
  { label: "仅常规尺码", value: false },
]

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function refAvg(v: number | null): string {
  return v != null ? v.toFixed(2) : "—"
}

export default function SizeAnalysisPage() {
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
  const [sizeCode, setSizeCode] = useState("")
  const [isSpecial, setIsSpecial] = useState<boolean | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(() => {
    const s = searchParams.get("start_date"), e = searchParams.get("end_date")
    return [s ? dayjs(s) : null, e ? dayjs(e) : null]
  })
  const [minUsageCount, setMinUsageCount] = useState<number | undefined>(undefined)

  const filter: SizeAnalysisFilter = {
    year,
    group_name: groupName || undefined,
    responsible_sales: responsibleSales || undefined,
    customer_code: customerCode || undefined,
    product_category: productCategory || undefined,
    series_name: seriesName || undefined,
    size_code: sizeCode || undefined,
    is_special_size: isSpecial,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
    min_usage_count: minUsageCount,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["size-analysis", filter],
    queryFn: () => fetchSizeAnalysis(filter),
  })

  const handleReset = () => {
    setYear(undefined); setGroupName(""); setResponsibleSales("")
    setCustomerCode(""); setProductCategory(""); setSeriesName("")
    setSizeCode(""); setIsSpecial(undefined)
    setDateRange([null, null]); setMinUsageCount(undefined)
  }

  const rankingColumns: ColumnsType<SizeRanking> = [
    { title: "尺码", dataIndex: "size_code", width: 100 },
    { title: "类型", dataIndex: "is_special_size", width: 90,
      render: (v: boolean) => <Tag color={v ? "red" : "default"}>{v ? "特殊尺码" : "常规尺码"}</Tag> },
    { title: "应用次数", dataIndex: "application_count", width: 90, align: "right" },
    { title: "涉及款式数", dataIndex: "style_count", width: 100, align: "right" },
    { title: "客户数", dataIndex: "customer_count", width: 80, align: "right" },
    { title: "品类数", dataIndex: "category_count", width: 80, align: "right" },
    { title: "关联款式数量合计", dataIndex: "quantity_total", width: 130, align: "right",
      render: (v: number) => v.toLocaleString() },
    { title: "最近询单日期", dataIndex: "latest_inquiry_date", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
  ]

  const categoryColumns: ColumnsType<SizeByCategory> = [
    { title: "产品品类", dataIndex: "product_category", width: 120 },
    { title: "款式总数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "尺码覆盖率", dataIndex: "size_coverage_rate", width: 160,
      render: (v: number) => (
        <Space size={6}><Progress percent={Math.round(v * 1000) / 10} size="small" style={{ width: 80 }} showInfo={false} /><Text style={{ fontSize: 12 }}>{pct(v)}</Text></Space>
      ) },
    { title: "特殊尺码款式数", dataIndex: "special_size_style_count", width: 110, align: "right" },
    { title: "特殊尺码占比", dataIndex: "special_size_share", width: 100, render: (v: number) => pct(v) },
    { title: "平均尺码跨度", dataIndex: "average_size_span_count", width: 100, align: "right", render: refAvg },
    { title: "常用尺码", dataIndex: "top_sizes", width: 240,
      render: (tops: SizeByCategory["top_sizes"]) => (
        <Space size={4} wrap>{tops.map(t => <Tag key={t.size_code}>{t.size_code}（{t.application_count}）</Tag>)}</Space>
      ) },
  ]

  const customerColumns: ColumnsType<SizeByCustomer> = [
    { title: "客户编码", dataIndex: "customer_code", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "客户简称", dataIndex: "customer_short_name", width: 140 },
    { title: "款式总数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "尺码覆盖率", dataIndex: "size_coverage_rate", width: 160,
      render: (v: number) => (
        <Space size={6}><Progress percent={Math.round(v * 1000) / 10} size="small" style={{ width: 80 }} showInfo={false} /><Text style={{ fontSize: 12 }}>{pct(v)}</Text></Space>
      ) },
    { title: "特殊尺码款式数", dataIndex: "special_size_style_count", width: 110, align: "right" },
    { title: "特殊尺码占比", dataIndex: "special_size_share", width: 100, render: (v: number) => pct(v) },
    { title: "平均尺码跨度", dataIndex: "average_size_span_count", width: 100, align: "right", render: refAvg },
    { title: "常用尺码", dataIndex: "top_sizes", width: 240,
      render: (tops: SizeByCustomer["top_sizes"]) => (
        <Space size={4} wrap>{tops.map(t => <Tag key={t.size_code}>{t.size_code}（{t.application_count}）</Tag>)}</Space>
      ) },
  ]

  const spanColumns: ColumnsType<SizeSpanBucket> = [
    { title: "跨度分组", dataIndex: "span_bucket", width: 160 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "占比", dataIndex: "share", width: 220,
      render: (v: number) => (
        <Space size={6}><Progress percent={Math.round(v * 1000) / 10} size="small" style={{ width: 120 }} showInfo={false} /><Text style={{ fontSize: 12 }}>{pct(v)}</Text></Space>
      ) },
  ]

  const riskColumns: ColumnsType<SizeRiskSignal> = [
    { title: "信号", dataIndex: "label", width: 280 },
    { title: "涉及款式数", dataIndex: "style_count", width: 100, align: "right",
      render: (v: number) => v > 0 ? <Text type="warning">{v}</Text> : v },
    { title: "说明（仅数据关联提示，非因果结论）", dataIndex: "hint", render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
  ]

  const priorityColumns: ColumnsType<SizePriorityItem> = [
    { title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: SizePriorityItem) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a> },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 130, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "款号", dataIndex: "style_no", width: 90, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "品类", dataIndex: "product_category", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "原始尺码范围", dataIndex: "size_range", width: 140, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "标准化尺码", dataIndex: "size_codes", width: 160,
      render: (codes: string[]) => codes.length
        ? <Space size={4} wrap>{codes.map(c => <Tag key={c}>{c}</Tag>)}</Space>
        : <Text type="secondary">无</Text> },
    { title: "缺失字段", dataIndex: "missing_fields", width: 180,
      render: (fields: string[]) => <Space size={4} wrap>{fields.map(f => <Tag key={f} color="orange">{f}</Tag>)}</Space> },
    { title: "风险提示", dataIndex: "risk_hint", width: 220, render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: "询单日期", dataIndex: "inquiry_date", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "操作", key: "action", width: 190, fixed: "right",
      render: (_: unknown, r: SizePriorityItem) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}?item_id=${r.item_id}`)}>去补录</Button>
          <CreateTaskButton itemId={r.item_id} sourceModule="size-analysis" />
        </Space>
      ) },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>尺码范围分析</Title>

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
          <Input placeholder="尺码" allowClear value={sizeCode}
            onChange={e => setSizeCode(e.target.value)} style={{ width: 100 }} />
          <Select placeholder="是否特殊尺码" options={SPECIAL_OPTIONS}
            value={isSpecial} onChange={setIsSpecial} style={{ width: 130 }} allowClear />
          <RangePicker
            value={dateRange}
            onChange={dates => setDateRange(dates ? [dates[0], dates[1]] : [null, null])}
            placeholder={["询单日期起", "询单日期止"]}
          />
          <InputNumber placeholder="最小应用次数" min={1} value={minUsageCount}
            onChange={v => setMinUsageCount(v ?? undefined)} style={{ width: 120 }} />
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>款式总数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.total_style_items ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>有原始范围</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.items_with_size_range ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>有标准化尺码</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#52c41a" }}>{data?.summary.items_with_standard_sizes ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>缺尺码资料</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#ff4d4f" }}>{data?.summary.items_without_size_data ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>有范围未标准化</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#faad14" }}>{data?.summary.items_with_size_range_but_no_standard_sizes ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>尺码应用总次数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.total_size_applications ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>尺码种类数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.unique_size_codes ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>特殊尺码占比</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{pct(data?.summary.special_size_share ?? 0)}</div>
        </Card></Col>
      </Row>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>特殊尺码应用次数</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#fa541c" }}>{data?.summary.special_size_applications ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>宽跨度款式数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.wide_span_style_count ?? 0}</div>
        </Card></Col>
      </Row>

      <Card size="small" title="尺码排名" style={{ marginBottom: 16 }}>
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="关联款式数量合计仅供参考，不代表该尺码的实际订购件数（系统当前没有按尺码拆分的数量数据）"
        />
        <Table<SizeRanking>
          rowKey="size_code" size="small" columns={rankingColumns}
          dataSource={data?.size_rankings ?? []} loading={isFetching}
          pagination={{ pageSize: 10 }} scroll={{ x: 1000 }}
        />
      </Card>

      <Card size="small">
        <Tabs
          items={[
            { key: "category", label: "按品类", children: (
              <Table<SizeByCategory> rowKey="product_category"
                size="small" columns={categoryColumns} dataSource={data?.by_category ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
            ) },
            { key: "customer", label: "按客户", children: (
              <Table<SizeByCustomer> rowKey={r => `${r.customer_code}-${r.customer_short_name}`}
                size="small" columns={customerColumns} dataSource={data?.by_customer ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
            ) },
            { key: "special", label: "特殊尺码", children: (
              <Table<SizeRanking> rowKey="size_code"
                size="small" columns={rankingColumns} dataSource={data?.special_size_rankings ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 1000 }} />
            ) },
            { key: "span", label: "尺码跨度", children: (
              <Table<SizeSpanBucket> rowKey="span_bucket"
                size="small" columns={spanColumns} dataSource={data?.size_span_distribution ?? []}
                loading={isFetching} pagination={false} />
            ) },
            { key: "risk", label: "尺码风险提示", children: (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                  说明：以下信号仅是数据关联提示，不代表因果判断；打样与生产记录目前按询单级关联
                  （询单可能包含多个款式），仅作参考，不是该款式独有的打样/生产记录。
                </Text>
                <Table<SizeRiskSignal> rowKey="signal_type"
                  size="small" columns={riskColumns} dataSource={data?.size_risk_signals ?? []}
                  loading={isFetching} pagination={false} />
              </>
            ) },
            { key: "priority", label: "优先补录款式", children: (
              <Table<SizePriorityItem> rowKey="item_id"
                size="small" columns={priorityColumns} dataSource={data?.priority_items ?? []}
                loading={isFetching} pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }} scroll={{ x: 1500 }} />
            ) },
          ]}
        />
      </Card>
    </div>
  )
}
