/**
 * 产品工艺分析（报价资料分析 Step 6）
 *
 * 款式相关统计单位是款式明细（inquiry_items），工艺标签统计单位是
 * inquiry_item_processes。关联平均报价/毛利率只是参考数据，不构成因果结论；
 * 工艺风险信号只是数据关联提示，不做风险预测。
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

import { fetchProcessAnalysis } from "@/api/analytics"
import CreateTaskButton from "@/components/CreateTaskButton"
import type {
  ProcessAnalysisFilter, ProcessByCategory, ProcessByCustomer,
  ProcessPriorityItem, ProcessRanking, ProcessRiskSignal,
} from "@/types/analytics"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(y => ({ label: String(y), value: y }))
const SPECIAL_OPTIONS = [
  { label: "全部", value: undefined },
  { label: "仅特殊工艺", value: true },
  { label: "仅常规工艺", value: false },
]

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function refRate(v: number | null): string {
  return v != null ? pct(v) : "—"
}

function refNum(v: number | null): string {
  return v != null ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"
}

export default function ProcessAnalysisPage() {
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
  const [processTag, setProcessTag] = useState("")
  const [isSpecial, setIsSpecial] = useState<boolean | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(() => {
    const s = searchParams.get("start_date"), e = searchParams.get("end_date")
    return [s ? dayjs(s) : null, e ? dayjs(e) : null]
  })
  const [minUsageCount, setMinUsageCount] = useState<number | undefined>(undefined)

  const filter: ProcessAnalysisFilter = {
    year,
    group_name: groupName || undefined,
    responsible_sales: responsibleSales || undefined,
    customer_code: customerCode || undefined,
    product_category: productCategory || undefined,
    series_name: seriesName || undefined,
    process_tag: processTag || undefined,
    is_special: isSpecial,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
    min_usage_count: minUsageCount,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["process-analysis", filter],
    queryFn: () => fetchProcessAnalysis(filter),
  })

  const handleReset = () => {
    setYear(undefined); setGroupName(""); setResponsibleSales("")
    setCustomerCode(""); setProductCategory(""); setSeriesName("")
    setProcessTag(""); setIsSpecial(undefined)
    setDateRange([null, null]); setMinUsageCount(undefined)
  }

  const rankingColumns: ColumnsType<ProcessRanking> = [
    { title: "工艺标签", dataIndex: "process_tag", width: 140 },
    { title: "类型", dataIndex: "is_special", width: 90,
      render: (v: boolean) => <Tag color={v ? "red" : "default"}>{v ? "特殊工艺" : "常规工艺"}</Tag> },
    { title: "应用次数", dataIndex: "application_count", width: 90, align: "right" },
    { title: "涉及款式数", dataIndex: "style_count", width: 100, align: "right" },
    { title: "客户数", dataIndex: "customer_count", width: 80, align: "right" },
    { title: "品类数", dataIndex: "category_count", width: 80, align: "right" },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right",
      render: (v: number) => v.toLocaleString() },
    { title: "关联平均报价", dataIndex: "average_final_quote", width: 110, align: "right", render: refNum },
    { title: "关联平均毛利率", dataIndex: "average_gross_profit_rate", width: 120, align: "right", render: refRate },
    { title: "最近询单日期", dataIndex: "latest_inquiry_date", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
  ]

  const categoryColumns: ColumnsType<ProcessByCategory> = [
    { title: "产品品类", dataIndex: "product_category", width: 120 },
    { title: "款式总数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "有标签款式数", dataIndex: "items_with_process_tags", width: 110, align: "right" },
    { title: "工艺覆盖率", dataIndex: "process_coverage_rate", width: 160,
      render: (v: number) => (
        <Space size={6}><Progress percent={Math.round(v * 1000) / 10} size="small" style={{ width: 80 }} showInfo={false} /><Text style={{ fontSize: 12 }}>{pct(v)}</Text></Space>
      ) },
    { title: "特殊工艺款式数", dataIndex: "special_process_style_count", width: 110, align: "right" },
    { title: "特殊工艺占比", dataIndex: "special_process_share", width: 100, render: (v: number) => pct(v) },
    { title: "常用工艺", dataIndex: "top_processes", width: 260,
      render: (tops: ProcessByCategory["top_processes"]) => (
        <Space size={4} wrap>{tops.map(t => <Tag key={t.process_tag}>{t.process_tag}（{t.application_count}）</Tag>)}</Space>
      ) },
  ]

  const customerColumns: ColumnsType<ProcessByCustomer> = [
    { title: "客户编码", dataIndex: "customer_code", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "客户简称", dataIndex: "customer_short_name", width: 140 },
    { title: "款式总数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "工艺覆盖率", dataIndex: "process_coverage_rate", width: 160,
      render: (v: number) => (
        <Space size={6}><Progress percent={Math.round(v * 1000) / 10} size="small" style={{ width: 80 }} showInfo={false} /><Text style={{ fontSize: 12 }}>{pct(v)}</Text></Space>
      ) },
    { title: "特殊工艺款式数", dataIndex: "special_process_style_count", width: 110, align: "right" },
    { title: "特殊工艺占比", dataIndex: "special_process_share", width: 100, render: (v: number) => pct(v) },
    { title: "常用工艺", dataIndex: "top_processes", width: 260,
      render: (tops: ProcessByCustomer["top_processes"]) => (
        <Space size={4} wrap>{tops.map(t => <Tag key={t.process_tag}>{t.process_tag}（{t.application_count}）</Tag>)}</Space>
      ) },
  ]

  const riskColumns: ColumnsType<ProcessRiskSignal> = [
    { title: "信号", dataIndex: "label", width: 260 },
    { title: "涉及款式数", dataIndex: "style_count", width: 100, align: "right",
      render: (v: number) => v > 0 ? <Text type="warning">{v}</Text> : v },
    { title: "说明（仅数据关联提示，非因果结论）", dataIndex: "hint", render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
  ]

  const priorityColumns: ColumnsType<ProcessPriorityItem> = [
    { title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: ProcessPriorityItem) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a> },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 130, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "款号", dataIndex: "style_no", width: 90, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "品类", dataIndex: "product_category", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "原始工艺说明", dataIndex: "process_description", width: 140, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "工艺标签", dataIndex: "process_tags", width: 160,
      render: (tags: string[]) => tags.length
        ? <Space size={4} wrap>{tags.map(t => <Tag key={t}>{t}</Tag>)}</Space>
        : <Text type="secondary">无</Text> },
    { title: "缺失字段", dataIndex: "missing_fields", width: 180,
      render: (fields: string[]) => <Space size={4} wrap>{fields.map(f => <Tag key={f} color="orange">{f}</Tag>)}</Space> },
    { title: "风险提示", dataIndex: "risk_hint", width: 220, render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: "询单日期", dataIndex: "inquiry_date", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "操作", key: "action", width: 190, fixed: "right",
      render: (_: unknown, r: ProcessPriorityItem) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}?item_id=${r.item_id}`)}>去补录</Button>
          <CreateTaskButton itemId={r.item_id} sourceModule="process-analysis" />
        </Space>
      ) },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>产品工艺分析</Title>

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
          <Input placeholder="工艺标签" allowClear value={processTag}
            onChange={e => setProcessTag(e.target.value)} style={{ width: 120 }} />
          <Select placeholder="是否特殊工艺" options={SPECIAL_OPTIONS}
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
          <Text type="secondary" style={{ fontSize: 12 }}>有原始说明</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.items_with_process_description ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>有标准化标签</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#52c41a" }}>{data?.summary.items_with_process_tags ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>缺工艺标签</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#ff4d4f" }}>{data?.summary.items_without_process_tags ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>工艺应用总次数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.total_process_applications ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>工艺标签种类数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.unique_process_tags ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>特殊工艺应用次数</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#fa541c" }}>{data?.summary.special_process_applications ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>特殊工艺占比</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{pct(data?.summary.special_process_share ?? 0)}</div>
        </Card></Col>
      </Row>

      <Card size="small" title="工艺排名" style={{ marginBottom: 16 }}>
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="关联平均报价/工厂价/毛利率仅为参考数据，不代表因果关系，缺失数据时显示为「—」"
        />
        <Table<ProcessRanking>
          rowKey="process_tag" size="small" columns={rankingColumns}
          dataSource={data?.process_rankings ?? []} loading={isFetching}
          pagination={{ pageSize: 10 }} scroll={{ x: 1100 }}
        />
      </Card>

      <Card size="small">
        <Tabs
          items={[
            { key: "category", label: "按品类", children: (
              <Table<ProcessByCategory> rowKey="product_category"
                size="small" columns={categoryColumns} dataSource={data?.by_category ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
            ) },
            { key: "customer", label: "按客户", children: (
              <Table<ProcessByCustomer> rowKey={r => `${r.customer_code}-${r.customer_short_name}`}
                size="small" columns={customerColumns} dataSource={data?.by_customer ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
            ) },
            { key: "special", label: "特殊工艺", children: (
              <Table<ProcessRanking> rowKey="process_tag"
                size="small" columns={rankingColumns} dataSource={data?.special_process_rankings ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 1100 }} />
            ) },
            { key: "risk", label: "工艺风险提示", children: (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                  说明：以下信号仅是数据关联提示，不代表因果判断；其中"打样逾期"/"生产延期"两类
                  按询单关联（询单可能包含多个款式），不是该款式独有的打样/生产记录。
                </Text>
                <Table<ProcessRiskSignal> rowKey="signal_type"
                  size="small" columns={riskColumns} dataSource={data?.process_risk_signals ?? []}
                  loading={isFetching} pagination={false} />
              </>
            ) },
            { key: "priority", label: "优先补录款式", children: (
              <Table<ProcessPriorityItem> rowKey="item_id"
                size="small" columns={priorityColumns} dataSource={data?.priority_items ?? []}
                loading={isFetching} pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }} scroll={{ x: 1500 }} />
            ) },
          ]}
        />
      </Card>
    </div>
  )
}
