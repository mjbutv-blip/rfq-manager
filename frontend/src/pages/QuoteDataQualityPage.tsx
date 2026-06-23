/**
 * 报价资料数据完整度看板
 *
 * 用于判断"报价资料分析"所需的款式明细（inquiry_items）数据是否可靠，
 * 以及指导历史数据补录优先级。统计单位是款式明细，不是询单本身。
 */

import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Button, Card, Col, DatePicker, Input, Progress, Row, Select,
  Space, Table, Tabs, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import dayjs, { type Dayjs } from "dayjs"

import { fetchQuoteDataQuality } from "@/api/analytics"
import CreateTaskButton from "@/components/CreateTaskButton"
import type {
  CategoryQualityStat, CompletenessLevel, CustomerQualityStat,
  ImportBatchQualityStat, PriorityItem, QuoteDataQualityFilter, SalesQualityStat,
} from "@/types/analytics"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(y => ({ label: String(y), value: y }))

const LEVEL_LABEL: Record<CompletenessLevel, string> = {
  complete: "完整",
  partial: "部分完整",
  high_missing: "高缺失",
}
const LEVEL_COLOR: Record<CompletenessLevel, string> = {
  complete: "green",
  partial: "orange",
  high_missing: "red",
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function rateColor(rate: number): string {
  if (rate >= 0.8) return "#52c41a"
  if (rate >= 0.5) return "#faad14"
  return "#ff4d4f"
}

export default function QuoteDataQualityPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // 从总览页"查看详情"跳转过来时，带筛选条件初始化（仅用一次，不持续同步 URL）
  const [year, setYear] = useState<number | undefined>(() => {
    const v = searchParams.get("year"); return v ? Number(v) : undefined
  })
  const [groupName, setGroupName] = useState(() => searchParams.get("group_name") ?? "")
  const [responsibleSales, setResponsibleSales] = useState(() => searchParams.get("responsible_sales") ?? "")
  const [customerCode, setCustomerCode] = useState(() => searchParams.get("customer_code") ?? "")
  const [productCategory, setProductCategory] = useState(() => searchParams.get("product_category") ?? "")
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(() => {
    const s = searchParams.get("start_date"), e = searchParams.get("end_date")
    return [s ? dayjs(s) : null, e ? dayjs(e) : null]
  })

  const filter: QuoteDataQualityFilter = {
    year,
    group_name: groupName || undefined,
    responsible_sales: responsibleSales || undefined,
    customer_code: customerCode || undefined,
    product_category: productCategory || undefined,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["quote-data-quality", filter],
    queryFn: () => fetchQuoteDataQuality(filter),
  })

  const handleReset = () => {
    setYear(undefined); setGroupName(""); setResponsibleSales("")
    setCustomerCode(""); setProductCategory(""); setDateRange([null, null])
  }

  const worstField = data?.field_coverage.length
    ? [...data.field_coverage].sort((a, b) => a.coverage_rate - b.coverage_rate)[0]
    : null

  const customerColumns: ColumnsType<CustomerQualityStat> = [
    { title: "客户编码", dataIndex: "customer_code", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "客户简称", dataIndex: "customer_short_name", width: 140 },
    { title: "款式总数", dataIndex: "total_items", width: 90, align: "right" },
    { title: "完整率", dataIndex: "completeness_rate", width: 100,
      render: (v: number) => <Text style={{ color: rateColor(v) }}>{pct(v)}</Text> },
    { title: "缺款号数", dataIndex: "missing_style_no_count", width: 90, align: "right" },
    { title: "缺工艺数", dataIndex: "missing_process_count", width: 90, align: "right" },
    { title: "缺尺码数", dataIndex: "missing_size_count", width: 90, align: "right" },
    { title: "缺填报人数", dataIndex: "missing_preparer_count", width: 100, align: "right" },
    { title: "高缺失数", dataIndex: "high_missing_count", width: 90, align: "right",
      render: (v: number) => v > 0 ? <Text type="danger">{v}</Text> : v },
  ]

  const salesColumns: ColumnsType<SalesQualityStat> = [
    { title: "负责业务员", dataIndex: "responsible_sales", width: 120 },
    { title: "款式总数", dataIndex: "total_items", width: 90, align: "right" },
    { title: "完整率", dataIndex: "completeness_rate", width: 100,
      render: (v: number) => <Text style={{ color: rateColor(v) }}>{pct(v)}</Text> },
    { title: "缺失项数量", dataIndex: "missing_field_count", width: 100, align: "right" },
    { title: "高缺失款式数", dataIndex: "high_missing_count", width: 110, align: "right",
      render: (v: number) => v > 0 ? <Text type="danger">{v}</Text> : v },
  ]

  const categoryColumns: ColumnsType<CategoryQualityStat> = [
    { title: "产品品类", dataIndex: "product_category", width: 120 },
    { title: "款式总数", dataIndex: "total_items", width: 90, align: "right" },
    { title: "完整率", dataIndex: "completeness_rate", width: 100,
      render: (v: number) => <Text style={{ color: rateColor(v) }}>{pct(v)}</Text> },
    { title: "缺工艺数", dataIndex: "missing_process_count", width: 90, align: "right" },
    { title: "缺尺码数", dataIndex: "missing_size_count", width: 90, align: "right" },
    { title: "缺款号数", dataIndex: "missing_style_no_count", width: 90, align: "right" },
  ]

  const batchColumns: ColumnsType<ImportBatchQualityStat> = [
    { title: "导入批次", dataIndex: "import_batch_id", width: 220,
      render: (v: string | null) => v
        ? <Text code style={{ fontSize: 11 }}>{v.slice(0, 8)}…</Text>
        : <Text type="secondary">手工新增 / 无批次</Text> },
    { title: "文件名", dataIndex: "file_name", width: 200, ellipsis: true,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
    { title: "导入时间", dataIndex: "uploaded_at", width: 160,
      render: (v: string | null) => v ? new Date(v).toLocaleString("zh-CN") : <Text type="secondary">—</Text> },
    { title: "款式总数", dataIndex: "total_items", width: 90, align: "right" },
    { title: "完整率", dataIndex: "completeness_rate", width: 100,
      render: (v: number) => <Text style={{ color: rateColor(v) }}>{pct(v)}</Text> },
    { title: "缺失总数", dataIndex: "missing_field_count", width: 90, align: "right" },
  ]

  const priorityColumns: ColumnsType<PriorityItem> = [
    {
      title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: PriorityItem) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a>,
    },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 140, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "款号", dataIndex: "style_no", width: 90, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "负责业务员", dataIndex: "responsible_sales", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    {
      title: "缺失字段", dataIndex: "missing_fields", width: 220,
      render: (fields: string[]) => (
        <Space size={4} wrap>
          {fields.map(f => <Tag key={f} color="orange" style={{ marginRight: 0 }}>{f}</Tag>)}
        </Space>
      ),
    },
    { title: "缺失数量", dataIndex: "missing_field_count", width: 80, align: "right" },
    {
      title: "完整度等级", dataIndex: "completeness_level", width: 100,
      render: (v: CompletenessLevel) => <Tag color={LEVEL_COLOR[v]}>{LEVEL_LABEL[v]}</Tag>,
    },
    { title: "询单日期", dataIndex: "inquiry_date", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    {
      title: "操作", key: "action", width: 190, fixed: "right",
      render: (_: unknown, r: PriorityItem) => (
        <Space size={4}>
          <Button
            size="small" type="link"
            onClick={() => navigate(`/inquiry/${r.inquiry_id}?item_id=${r.item_id}`)}
          >
            去补录
          </Button>
          <CreateTaskButton itemId={r.item_id} sourceModule="quote-data-quality" />
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>报价资料数据完整度</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="全部年份" allowClear options={YEAR_OPTIONS}
            value={year} onChange={setYear} style={{ width: 120 }}
          />
          <Input placeholder="所属小组" allowClear value={groupName}
            onChange={e => setGroupName(e.target.value)} style={{ width: 120 }} />
          <Input placeholder="负责业务员" allowClear value={responsibleSales}
            onChange={e => setResponsibleSales(e.target.value)} style={{ width: 120 }} />
          <Input placeholder="客户编码" allowClear value={customerCode}
            onChange={e => setCustomerCode(e.target.value)} style={{ width: 120 }} />
          <Input placeholder="产品品类" allowClear value={productCategory}
            onChange={e => setProductCategory(e.target.value)} style={{ width: 120 }} />
          <RangePicker
            value={dateRange}
            onChange={dates => setDateRange(dates ? [dates[0], dates[1]] : [null, null])}
            placeholder={["询单日期起", "询单日期止"]}
          />
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>款式总数</Text>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{data?.summary.total_inquiry_items ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>整体完整率</Text>
          <div style={{ fontSize: 22, fontWeight: 600, color: rateColor(data?.summary.overall_completeness_rate ?? 0) }}>
            {pct(data?.summary.overall_completeness_rate ?? 0)}
          </div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>完整款式数</Text>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#52c41a" }}>{data?.summary.complete_items ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>部分完整款式数</Text>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#faad14" }}>{data?.summary.partially_complete_items ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>高缺失款式数</Text>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#ff4d4f" }}>{data?.summary.high_missing_items ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>缺失最多的字段</Text>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {worstField ? `${worstField.field_label}（${pct(worstField.coverage_rate)}）` : <Text type="secondary">—</Text>}
          </div>
        </Card></Col>
      </Row>

      <Card size="small" title="字段覆盖率" style={{ marginBottom: 16 }} loading={isFetching}>
        <Row gutter={[16, 12]}>
          {data?.field_coverage.map(f => (
            <Col span={12} key={f.field_key}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <Text>{f.field_label}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  已填写 {f.filled_count} / 缺失 {f.missing_count}（{pct(f.coverage_rate)}）
                </Text>
              </div>
              <Progress percent={Math.round(f.coverage_rate * 1000) / 10} strokeColor={rateColor(f.coverage_rate)} showInfo={false} />
            </Col>
          ))}
        </Row>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Tabs
          items={[
            { key: "customer", label: "按客户", children: (
              <Table<CustomerQualityStat> rowKey={r => `${r.customer_code}-${r.customer_short_name}`}
                size="small" columns={customerColumns} dataSource={data?.by_customer ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
            ) },
            { key: "sales", label: "按业务员", children: (
              <Table<SalesQualityStat> rowKey="responsible_sales"
                size="small" columns={salesColumns} dataSource={data?.by_sales ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 600 }} />
            ) },
            { key: "category", label: "按品类", children: (
              <Table<CategoryQualityStat> rowKey="product_category"
                size="small" columns={categoryColumns} dataSource={data?.by_category ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 600 }} />
            ) },
            { key: "batch", label: "按导入批次", children: (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                  说明：款式明细本身没有独立的导入批次记录，这里按"款式所属询单的导入批次"统计——
                  如果一个询单先被导入创建，之后又手工追加了新款式，新款式会归到该询单最初的导入批次下。
                </Text>
                <Table<ImportBatchQualityStat> rowKey={r => r.import_batch_id ?? "none"}
                  size="small" columns={batchColumns} dataSource={data?.by_import_batch ?? []}
                  loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
              </>
            ) },
          ]}
        />
      </Card>

      <Card size="small" title="优先补录款式">
        <Table<PriorityItem>
          rowKey="item_id"
          size="small"
          columns={priorityColumns}
          dataSource={data?.priority_items ?? []}
          loading={isFetching}
          pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条待补录` }}
          scroll={{ x: 1300 }}
        />
      </Card>
    </div>
  )
}
