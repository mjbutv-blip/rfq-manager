/**
 * 客户 × 品类 × 款式分析（报价资料分析 Step 5）
 *
 * 统计单位是款式明细（inquiry_items），不是询单本身。用于回答：每个客户报过
 * 哪些品类、核心品类是什么、哪些客户/品类款式集中或分散、哪些款式可能是
 * 重复款、哪些数据缺失会影响本分析的准确性。
 */

import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Button, Card, Col, DatePicker, Input, InputNumber, Progress, Row, Select,
  Space, Table, Tabs, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import dayjs, { type Dayjs } from "dayjs"

import { fetchCustomerCategoryStyles } from "@/api/analytics"
import CreateTaskButton from "@/components/CreateTaskButton"
import type {
  CategoryRanking, CustomerCategoryMatrixEntry, CustomerCategoryPriorityItem,
  CustomerCategoryStylesFilter, CustomerPreferenceProfile, CustomerRanking,
  PotentialDuplicateStyle, PreferenceType,
} from "@/types/analytics"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(y => ({ label: String(y), value: y }))

const PREF_COLOR: Record<PreferenceType, string> = {
  "品类集中": "blue",
  "品类均衡": "green",
  "样本不足": "default",
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export default function CustomerCategoryStylesPage() {
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
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>(() => {
    const s = searchParams.get("start_date"), e = searchParams.get("end_date")
    return [s ? dayjs(s) : null, e ? dayjs(e) : null]
  })
  const [minStyleCount, setMinStyleCount] = useState<number | undefined>(undefined)

  const filter: CustomerCategoryStylesFilter = {
    year,
    group_name: groupName || undefined,
    responsible_sales: responsibleSales || undefined,
    customer_code: customerCode || undefined,
    product_category: productCategory || undefined,
    series_name: seriesName || undefined,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
    min_style_count: minStyleCount,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["customer-category-styles", filter],
    queryFn: () => fetchCustomerCategoryStyles(filter),
  })

  const handleReset = () => {
    setYear(undefined); setGroupName(""); setResponsibleSales("")
    setCustomerCode(""); setProductCategory(""); setSeriesName("")
    setDateRange([null, null]); setMinStyleCount(undefined)
  }

  const goToInquiries = (customerCode: string | null) => {
    // 客户档案页按 customer_code 查找；客户编码缺失时退化到询单总表 + 文本筛选
    if (customerCode) navigate(`/customers/${encodeURIComponent(customerCode)}`)
    else navigate("/")
  }

  const matrixColumns: ColumnsType<CustomerCategoryMatrixEntry> = [
    { title: "客户", dataIndex: "customer_short_name", width: 140 },
    { title: "品类", dataIndex: "product_category", width: 120 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "明细行数", dataIndex: "item_count", width: 90, align: "right" },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right",
      render: (v: number) => v.toLocaleString() },
    { title: "客户内占比", dataIndex: "style_share_in_customer", width: 160,
      render: (v: number) => (
        <Space size={6}>
          <Progress percent={Math.round(v * 1000) / 10} size="small" style={{ width: 80 }} showInfo={false} />
          <Text style={{ fontSize: 12 }}>{pct(v)}</Text>
        </Space>
      ) },
    { title: "最近询单日期", dataIndex: "latest_inquiry_date", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
    {
      title: "操作", key: "action", width: 90, fixed: "right",
      render: (_: unknown, r: CustomerCategoryMatrixEntry) => (
        <Button size="small" type="link" onClick={() => goToInquiries(r.customer_code)}>
          查看客户
        </Button>
      ),
    },
  ]

  const customerRankColumns: ColumnsType<CustomerRanking> = [
    { title: "客户编码", dataIndex: "customer_code", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "客户简称", dataIndex: "customer_short_name", width: 140 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "品类数", dataIndex: "category_count", width: 90, align: "right" },
    { title: "核心品类", dataIndex: "top_category", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "核心品类占比", dataIndex: "top_category_share", width: 110,
      render: (v: number | null) => v != null ? pct(v) : <Text type="secondary">—</Text> },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right",
      render: (v: number) => v.toLocaleString() },
    { title: "最近询单日期", dataIndex: "latest_inquiry_date", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
  ]

  const categoryRankColumns: ColumnsType<CategoryRanking> = [
    { title: "产品品类", dataIndex: "product_category", width: 140 },
    { title: "款式数", dataIndex: "style_count", width: 90, align: "right" },
    { title: "涉及客户数", dataIndex: "customer_count", width: 100, align: "right" },
    { title: "数量合计", dataIndex: "quantity_total", width: 100, align: "right",
      render: (v: number) => v.toLocaleString() },
    { title: "代表客户", dataIndex: "top_customer", width: 140, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "最近询单日期", dataIndex: "latest_inquiry_date", width: 110, render: v => v ?? <Text type="secondary">—</Text> },
  ]

  const duplicateColumns: ColumnsType<PotentialDuplicateStyle> = [
    { title: "客户编码", dataIndex: "customer_code", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "客户简称", dataIndex: "customer_short_name", width: 140 },
    { title: "款式标识", dataIndex: "style_key", width: 120 },
    { title: "品名", dataIndex: "product_name", width: 140, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "系列", dataIndex: "series_name", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "重复次数", dataIndex: "duplicate_count", width: 90, align: "right",
      render: (v: number) => <Text type="warning">{v}</Text> },
    { title: "涉及询单号", dataIndex: "inquiry_nos", width: 220,
      render: (nos: string[]) => (
        <Space size={4} wrap>{nos.map(n => <Tag key={n}>{n}</Tag>)}</Space>
      ) },
  ]

  const priorityColumns: ColumnsType<CustomerCategoryPriorityItem> = [
    {
      title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: CustomerCategoryPriorityItem) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a>,
    },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">未知客户</Text> },
    { title: "品名", dataIndex: "product_name", width: 140, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "款号", dataIndex: "style_no", width: 90, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "品类", dataIndex: "product_category", width: 100, render: v => v ?? <Text type="secondary">未填写</Text> },
    {
      title: "缺失字段", dataIndex: "missing_fields", width: 220,
      render: (fields: string[]) => (
        <Space size={4} wrap>{fields.map(f => <Tag key={f} color="orange" style={{ marginRight: 0 }}>{f}</Tag>)}</Space>
      ),
    },
    { title: "影响", dataIndex: "impact", width: 180, render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: "询单日期", dataIndex: "inquiry_date", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    {
      title: "操作", key: "action", width: 190, fixed: "right",
      render: (_: unknown, r: CustomerCategoryPriorityItem) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}?item_id=${r.item_id}`)}>
            去补录
          </Button>
          <CreateTaskButton itemId={r.item_id} sourceModule="customer-category-styles" />
        </Space>
      ),
    },
  ]

  const renderPreferenceProfile = (p: CustomerPreferenceProfile) => (
    <Card size="small" key={`${p.customer_code}-${p.customer_short_name}`} style={{ marginBottom: 8 }}>
      <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
        <Space direction="vertical" size={2}>
          <Space>
            <Text strong>{p.customer_short_name}</Text>
            {p.customer_code && <Text type="secondary" style={{ fontSize: 12 }}>{p.customer_code}</Text>}
            <Tag color={PREF_COLOR[p.preference_type]}>{p.preference_type}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>款式总数 {p.total_style_count}</Text>
          </Space>
          <Space size={8} wrap>
            {p.primary_categories.map(c => (
              <Tag key={c.product_category}>{c.product_category} {pct(c.share)}（{c.style_count}）</Tag>
            ))}
          </Space>
          {p.notes.map((n, i) => (
            <Text key={i} type="secondary" style={{ fontSize: 12, display: "block" }}>· {n}</Text>
          ))}
        </Space>
      </Space>
    </Card>
  )

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>客户品类款式分析</Title>

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
          <Input placeholder="系列" allowClear value={seriesName}
            onChange={e => setSeriesName(e.target.value)} style={{ width: 120 }} />
          <RangePicker
            value={dateRange}
            onChange={dates => setDateRange(dates ? [dates[0], dates[1]] : [null, null])}
            placeholder={["询单日期起", "询单日期止"]}
          />
          <InputNumber placeholder="最小款式数" min={1} value={minStyleCount}
            onChange={v => setMinStyleCount(v ?? undefined)} style={{ width: 120 }} />
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>客户数</Text>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{data?.summary.total_customers ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>品类数</Text>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{data?.summary.total_categories ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>款式明细数</Text>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{data?.summary.total_style_items ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>已识别款式数</Text>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#52c41a" }}>{data?.summary.known_style_count ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>未识别款式数</Text>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#ff4d4f" }}>{data?.summary.unknown_style_count ?? 0}</div>
        </Card></Col>
        <Col span={4}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>款式最多客户 / 品类</Text>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {data?.summary.top_customer_by_styles
              ? `${data.summary.top_customer_by_styles.customer_short_name ?? "—"}（${data.summary.top_customer_by_styles.style_count}）`
              : <Text type="secondary">—</Text>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {data?.summary.top_category_by_styles
              ? `${data.summary.top_category_by_styles.product_category}（${data.summary.top_category_by_styles.style_count}）`
              : <Text type="secondary">—</Text>}
          </div>
        </Card></Col>
      </Row>

      <Card size="small" title="客户 × 品类矩阵" style={{ marginBottom: 16 }}>
        <Table<CustomerCategoryMatrixEntry>
          rowKey={r => `${r.customer_code}-${r.product_category}`}
          size="small" columns={matrixColumns} dataSource={data?.customer_category_matrix ?? []}
          loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 1100 }}
        />
      </Card>

      <Card size="small">
        <Tabs
          items={[
            { key: "customer", label: "客户排名", children: (
              <Table<CustomerRanking> rowKey={r => `${r.customer_code}-${r.customer_short_name}`}
                size="small" columns={customerRankColumns} dataSource={data?.customer_rankings ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
            ) },
            { key: "category", label: "品类排名", children: (
              <Table<CategoryRanking> rowKey="product_category"
                size="small" columns={categoryRankColumns} dataSource={data?.category_rankings ?? []}
                loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 700 }} />
            ) },
            { key: "preference", label: "客户偏好画像", children: (
              <div>{(data?.customer_preference_profiles ?? []).map(renderPreferenceProfile)}</div>
            ) },
            { key: "duplicates", label: "潜在重复款", children: (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                  说明：仅作风险提示，不会自动合并或修改任何历史数据，请人工核实后再处理。
                </Text>
                <Table<PotentialDuplicateStyle> rowKey={(r, i) => `${r.customer_code}-${r.style_key}-${i}`}
                  size="small" columns={duplicateColumns} dataSource={data?.potential_duplicate_styles ?? []}
                  loading={isFetching} pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
              </>
            ) },
            { key: "priority", label: "影响分析准确性的缺失资料", children: (
              <Table<CustomerCategoryPriorityItem> rowKey="item_id"
                size="small" columns={priorityColumns} dataSource={data?.priority_items ?? []}
                loading={isFetching} pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }} scroll={{ x: 1200 }} />
            ) },
          ]}
        />
      </Card>
    </div>
  )
}
