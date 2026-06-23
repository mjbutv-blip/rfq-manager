/**
 * 报价单填报人 / 人员维度分析（报价资料分析 Step 9）
 *
 * 统计单位是款式明细（inquiry_items）。quote_prepared_by（实际填报人）与
 * responsible_sales（负责业务员）是两个独立字段，本页面不会用后者推断
 * 或填充前者。本页面用于查看报价资料的填报分布与数据完整度，不代表
 * 个人绩效评价、不打分、不做薪资/奖金计算。
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

import { fetchPreparerAnalysis } from "@/api/analytics"
import CreateTaskButton from "@/components/CreateTaskButton"
import type {
  PreparerAnalysisFilter, PreparerByCategory, PreparerByCustomer,
  PreparerByQuantityBucket, PreparerByResponsibleSales, PreparerDataQualitySignal,
  PreparerPriorityItem, PreparerRanking,
} from "@/types/analytics"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(y => ({ label: String(y), value: y }))

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function refAvg(v: number | null): string {
  return v != null ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"
}

export default function PreparerAnalysisPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // 从总览页"查看完整分析"跳转过来时，带筛选条件初始化（仅用一次，不持续同步 URL）
  const [year, setYear] = useState<number | undefined>(() => {
    const v = searchParams.get("year"); return v ? Number(v) : undefined
  })
  const [groupName, setGroupName] = useState(() => searchParams.get("group_name") ?? "")
  const [responsibleSales, setResponsibleSales] = useState(() => searchParams.get("responsible_sales") ?? "")
  const [quotePreparedBy, setQuotePreparedBy] = useState("")
  const [customerCode, setCustomerCode] = useState(() => searchParams.get("customer_code") ?? "")
  const [productCategory, setProductCategory] = useState(() => searchParams.get("product_category") ?? "")
  const [seriesName, setSeriesName] = useState("")
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(() => {
    const s = searchParams.get("start_date"), e = searchParams.get("end_date")
    return [s ? dayjs(s) : null, e ? dayjs(e) : null]
  })
  const [minItemCount, setMinItemCount] = useState<number | undefined>(undefined)

  const filter: PreparerAnalysisFilter = {
    year,
    group_name: groupName || undefined,
    responsible_sales: responsibleSales || undefined,
    quote_prepared_by: quotePreparedBy || undefined,
    customer_code: customerCode || undefined,
    product_category: productCategory || undefined,
    series_name: seriesName || undefined,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
    min_item_count: minItemCount,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["quote-preparer-analysis", filter],
    queryFn: () => fetchPreparerAnalysis(filter),
  })

  const handleReset = () => {
    setYear(undefined); setGroupName(""); setResponsibleSales("")
    setQuotePreparedBy(""); setCustomerCode(""); setProductCategory("")
    setSeriesName(""); setDateRange([null, null]); setMinItemCount(undefined)
  }

  const rankingColumns: ColumnsType<PreparerRanking> = [
    { title: "报价填报人", dataIndex: "quote_prepared_by", width: 140 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "询单数", dataIndex: "inquiry_count", width: 90, align: "right" },
    { title: "客户数", dataIndex: "customer_count", width: 80, align: "right" },
    { title: "品类数", dataIndex: "category_count", width: 80, align: "right" },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right", render: (v: number) => v.toLocaleString() },
    { title: "平均数量", dataIndex: "average_quantity", width: 100, align: "right", render: refAvg },
    { title: "数据完整率", dataIndex: "data_completeness_rate", width: 160,
      render: (v: number) => (
        <Space size={6}><Progress percent={Math.round(v * 1000) / 10} size="small" style={{ width: 90 }} showInfo={false} /><Text style={{ fontSize: 12 }}>{pct(v)}</Text></Space>
      ) },
    { title: "最近询单日期", dataIndex: "latest_inquiry_date", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
  ]

  const customerColumns: ColumnsType<PreparerByCustomer> = [
    { title: "报价填报人", dataIndex: "quote_prepared_by", width: 120 },
    { title: "客户编码", dataIndex: "customer_code", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "客户简称", dataIndex: "customer_short_name", width: 140 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "品类数", dataIndex: "category_count", width: 80, align: "right" },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right", render: (v: number) => v.toLocaleString() },
    { title: "最近询单日期", dataIndex: "latest_inquiry_date", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
  ]

  const categoryColumns: ColumnsType<PreparerByCategory> = [
    { title: "报价填报人", dataIndex: "quote_prepared_by", width: 120 },
    { title: "产品品类", dataIndex: "product_category", width: 120 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "填报人内占比", dataIndex: "style_share_in_preparer", width: 110, render: (v: number) => pct(v) },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right", render: (v: number) => v.toLocaleString() },
    { title: "平均数量", dataIndex: "average_quantity", width: 100, align: "right", render: refAvg },
  ]

  const bucketColumns: ColumnsType<PreparerByQuantityBucket> = [
    { title: "报价填报人", dataIndex: "quote_prepared_by", width: 120 },
    { title: "数量区间", dataIndex: "quantity_bucket", width: 130 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "填报人内占比", dataIndex: "style_share", width: 110, render: (v: number) => pct(v) },
  ]

  const respColumns: ColumnsType<PreparerByResponsibleSales> = [
    { title: "负责业务员", dataIndex: "responsible_sales", width: 120 },
    { title: "报价填报人", dataIndex: "quote_prepared_by", width: 120 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "询单数", dataIndex: "inquiry_count", width: 90, align: "right" },
    { title: "是否同一人", dataIndex: "same_person", width: 100,
      render: (v: boolean) => <Tag color={v ? "green" : "blue"}>{v ? "同一人" : "协作填报"}</Tag> },
  ]

  const signalColumns: ColumnsType<PreparerDataQualitySignal> = [
    { title: "信号", dataIndex: "label", width: 260 },
    { title: "涉及款式数", dataIndex: "style_count", width: 100, align: "right",
      render: (v: number) => v > 0 ? <Text type="warning">{v}</Text> : v },
    { title: "说明（仅数据提示，非人员评价）", dataIndex: "hint", render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
  ]

  const priorityColumns: ColumnsType<PreparerPriorityItem> = [
    { title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: PreparerPriorityItem) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a> },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "负责业务员", dataIndex: "responsible_sales", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 130, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "款号", dataIndex: "style_no", width: 90, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "品类", dataIndex: "product_category", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "数量", dataIndex: "quantity", width: 90, align: "right", render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "缺失字段", dataIndex: "missing_fields", width: 150,
      render: (fields: string[]) => <Space size={4} wrap>{fields.map(f => <Tag key={f} color="orange">{f}</Tag>)}</Space> },
    { title: "风险提示", dataIndex: "risk_hint", width: 240, render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: "询单日期", dataIndex: "inquiry_date", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "操作", key: "action", width: 190, fixed: "right",
      render: (_: unknown, r: PreparerPriorityItem) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}?item_id=${r.item_id}`)}>去补录</Button>
          <CreateTaskButton itemId={r.item_id} sourceModule="quote-preparer-analysis" />
        </Space>
      ) },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>报价填报人分析</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="全部年份" allowClear options={YEAR_OPTIONS}
            value={year} onChange={setYear} style={{ width: 110 }} />
          <Input placeholder="所属小组" allowClear value={groupName}
            onChange={e => setGroupName(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="负责业务员" allowClear value={responsibleSales}
            onChange={e => setResponsibleSales(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="报价填报人" allowClear value={quotePreparedBy}
            onChange={e => setQuotePreparedBy(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="客户编码" allowClear value={customerCode}
            onChange={e => setCustomerCode(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="产品品类" allowClear value={productCategory}
            onChange={e => setProductCategory(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="系列" allowClear value={seriesName}
            onChange={e => setSeriesName(e.target.value)} style={{ width: 100 }} />
          <RangePicker
            value={dateRange}
            onChange={dates => setDateRange(dates ? [dates[0], dates[1]] : [null, null])}
            placeholder={["询单日期起", "询单日期止"]}
          />
          <InputNumber placeholder="最小款式数" min={1} value={minItemCount}
            onChange={v => setMinItemCount(v ?? undefined)} style={{ width: 120 }} />
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Card>

      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message="本页面用于查看报价资料的填报分布与数据完整度，不代表个人绩效评价；部分统计基于已填写填报人资料"
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>款式总数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.total_style_items ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>已填写填报人</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#52c41a" }}>{data?.summary.items_with_preparer ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>未填写填报人</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#ff4d4f" }}>{data?.summary.items_without_preparer ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>填报人覆盖率</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{pct(data?.summary.preparer_coverage_rate ?? 0)}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>填报人数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.unique_preparer_count ?? 0}</div>
        </Card></Col>
        <Col span={5}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>填报款式最多人员</Text>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {data?.summary.top_preparer
              ? `${data.summary.top_preparer.quote_prepared_by}（${data.summary.top_preparer.style_count}）`
              : <Text type="secondary">—</Text>}
          </div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>填报人与负责业务员不同</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.items_where_preparer_differs_from_responsible_sales ?? 0}</div>
        </Card></Col>
      </Row>

      <Card size="small" title="填报人排名" style={{ marginBottom: 16 }}>
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message="本表用于查看报价资料的填报分布与数据完整度，不代表个人绩效评价"
        />
        <Table<PreparerRanking>
          rowKey="quote_prepared_by" size="small" columns={rankingColumns}
          dataSource={data?.preparer_rankings ?? []} loading={isFetching}
          pagination={{ pageSize: 10 }} scroll={{ x: 1000 }}
        />
      </Card>

      <Card size="small">
        <Tabs
          items={[
            { key: "customer", label: "按客户", children: (
              <Table<PreparerByCustomer> rowKey={r => `${r.quote_prepared_by}-${r.customer_code}-${r.customer_short_name}`}
                size="small" columns={customerColumns} dataSource={data?.by_customer ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
            ) },
            { key: "category", label: "按品类", children: (
              <Table<PreparerByCategory> rowKey={r => `${r.quote_prepared_by}-${r.product_category}`}
                size="small" columns={categoryColumns} dataSource={data?.by_category ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
            ) },
            { key: "bucket", label: "按数量区间", children: (
              <Table<PreparerByQuantityBucket> rowKey={r => `${r.quote_prepared_by}-${r.quantity_bucket}`}
                size="small" columns={bucketColumns} dataSource={data?.by_quantity_bucket ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 600 }} />
            ) },
            { key: "resp", label: "按负责业务员", children: (
              <Table<PreparerByResponsibleSales> rowKey={r => `${r.responsible_sales}-${r.quote_prepared_by}`}
                size="small" columns={respColumns} dataSource={data?.by_responsible_sales ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 700 }} />
            ) },
            { key: "quality", label: "资料质量提示", children: (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                  说明：以下信号仅是资料完整度与协作分布的客观提示，不是人员评价，不会自动升级为预警。
                </Text>
                <Table<PreparerDataQualitySignal> rowKey="signal_type"
                  size="small" columns={signalColumns} dataSource={data?.data_quality_signals ?? []}
                  loading={isFetching} pagination={false} />
              </>
            ) },
            { key: "priority", label: "优先补录款式", children: (
              <Table<PreparerPriorityItem> rowKey="item_id"
                size="small" columns={priorityColumns} dataSource={data?.priority_items ?? []}
                loading={isFetching} pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }} scroll={{ x: 1500 }} />
            ) },
          ]}
        />
      </Card>
    </div>
  )
}
