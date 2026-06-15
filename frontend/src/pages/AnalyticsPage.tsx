/**
 * 独立数据分析页面
 * 包含5个子标签：业务员 / 客户 / 小组 / 产品系列 / 季度分析
 */

import { useQuery } from "@tanstack/react-query"
import { Alert, Card, Col, Row, Select, Statistic, Table, Tabs, Tag, Typography } from "antd"
import type { ColumnsType } from "antd/es/table"
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons"
import { useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import {
  fetchCustomersAnalysis,
  fetchDashboard,
  fetchGroupsAnalysis,
  fetchProductsAnalysis,
  fetchQuartersAnalysis,
  fetchSalesAnalysis,
} from "@/api/analytics"
import type {
  CustomerStat,
  DashboardStats,
  GroupStat,
  ProductStat,
  QuarterStat,
  SalesStat,
} from "@/types/analytics"

const { Title, Text } = Typography

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(y => ({ label: String(y), value: y }))

// ── Dashboard KPI 卡片 ────────────────────────────────────────────────────────

function DashboardSection({ year }: { year?: number }) {
  const { data, isFetching, isError } = useQuery<DashboardStats>({
    queryKey: ["analytics-dashboard", year],
    queryFn: () => fetchDashboard(year),
  })

  if (isError) {
    return (
      <Alert type="error" showIcon style={{ marginBottom: 20 }}
        message="Dashboard 数据加载失败，请刷新重试" />
    )
  }

  const convColor = (data?.conversion_rate ?? 0) >= 40 ? "#52c41a" : "#faad14"

  return (
    <Row gutter={16} style={{ marginBottom: 20 }}>
      <Col xs={12} sm={6}>
        <Card size="small" loading={isFetching}>
          <Statistic title="总询单数" value={data?.total_inquiries ?? 0} suffix="条" />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small" loading={isFetching}>
          <Statistic
            title="已下单数"
            value={data?.total_ordered ?? 0}
            suffix="条"
            valueStyle={{ color: "#52c41a" }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small" loading={isFetching}>
          <Statistic
            title="订单转化率"
            value={data?.conversion_rate ?? 0}
            suffix="%"
            precision={1}
            valueStyle={{ color: convColor }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small" loading={isFetching}>
          <Statistic
            title="总贸易额"
            value={data?.total_trade_amount ?? 0}
            prefix="$"
            precision={0}
          />
        </Card>
      </Col>
    </Row>
  )
}

function fmt(v: number | null | undefined, prefix = "", suffix = "", dec = 0) {
  if (v == null) return "—"
  return `${prefix}${v.toLocaleString(undefined, {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}${suffix}`
}

function ConvBar({ rate }: { rate: number }) {
  const color = rate >= 60 ? "#52c41a" : rate >= 30 ? "#faad14" : "#ff4d4f"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: Math.min(Math.round(rate), 80),
        height: 8,
        background: color,
        borderRadius: 4,
        minWidth: 2,
      }} />
      <Text style={{ fontSize: 12, color, fontWeight: 600 }}>{rate}%</Text>
    </div>
  )
}

// ── 业务员分析 ─────────────────────────────────────────────────────────────────

function SalesTab({ year }: { year?: number }) {
  const { data = [], isFetching, isError, error } = useQuery({
    queryKey: ["analytics-sales", year],
    queryFn: () => fetchSalesAnalysis(year),
  })

  if (isError) return <Alert type="error" showIcon message={`加载失败：${(error as Error).message}`} />

  const cols: ColumnsType<SalesStat> = [
    { title: "业务员", dataIndex: "responsible_sales", fixed: "left", width: 100 },
    { title: "询单数", dataIndex: "inquiry_count", width: 70, align: "right",
      sorter: (a, b) => a.inquiry_count - b.inquiry_count },
    { title: "已报价", dataIndex: "quoted_count", width: 70, align: "right" },
    { title: "已下单", dataIndex: "ordered_count", width: 70, align: "right",
      render: v => <Text style={{ color: "#52c41a", fontWeight: 600 }}>{v}</Text> },
    { title: "订单转化率", dataIndex: "conversion_rate", width: 150,
      sorter: (a, b) => a.conversion_rate - b.conversion_rate,
      render: v => <ConvBar rate={v} /> },
    { title: "总贸易额", dataIndex: "total_trade_amount", width: 120, align: "right",
      sorter: (a, b) => a.total_trade_amount - b.total_trade_amount,
      render: v => fmt(v, "$") },
    { title: "平均贸易额", dataIndex: "avg_trade_amount", width: 110, align: "right",
      render: v => fmt(v, "$") },
    { title: "平均毛利率", dataIndex: "avg_gross_profit_rate", width: 100, align: "right",
      sorter: (a, b) => (a.avg_gross_profit_rate ?? 0) - (b.avg_gross_profit_rate ?? 0),
      render: v => fmt(v, "", "%", 1) },
  ]

  return (
    <Table<SalesStat>
      rowKey="responsible_sales"
      columns={cols}
      dataSource={data}
      loading={isFetching}
      size="small"
      scroll={{ x: 800 }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
    />
  )
}

// ── 客户分析 ──────────────────────────────────────────────────────────────────

function CustomersTab({ year }: { year?: number }) {
  const { data = [], isFetching, isError, error } = useQuery({
    queryKey: ["analytics-customers", year],
    queryFn: () => fetchCustomersAnalysis(year),
  })

  if (isError) return <Alert type="error" showIcon message={`加载失败：${(error as Error).message}`} />

  const cols: ColumnsType<CustomerStat> = [
    { title: "客户简称", dataIndex: "customer_short_name", fixed: "left", width: 110,
      render: (v, r) => v ?? r.customer_code ?? "—" },
    { title: "客户代码", dataIndex: "customer_code", width: 100,
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v ?? "—"}</Text> },
    { title: "询单数", dataIndex: "inquiry_count", width: 70, align: "right",
      sorter: (a, b) => a.inquiry_count - b.inquiry_count },
    { title: "下单次数", dataIndex: "ordered_count", width: 75, align: "right",
      render: v => <Text style={{ color: "#52c41a", fontWeight: 600 }}>{v}</Text> },
    { title: "转化率", dataIndex: "conversion_rate", width: 140,
      sorter: (a, b) => a.conversion_rate - b.conversion_rate,
      render: v => <ConvBar rate={v} /> },
    { title: "总贸易额", dataIndex: "total_trade_amount", width: 120, align: "right",
      sorter: (a, b) => a.total_trade_amount - b.total_trade_amount,
      render: v => fmt(v, "$") },
    { title: "平均单笔", dataIndex: "avg_order_amount", width: 110, align: "right",
      render: v => fmt(v, "$") },
    { title: "最近询单", dataIndex: "last_inquiry_date", width: 100,
      render: v => v ?? "—" },
    { title: "最近下单", dataIndex: "last_order_date", width: 100,
      render: v => v ?? "—" },
    { title: "常询产品大类", dataIndex: "top_product_category", width: 110,
      render: v => v ? <Tag color="blue">{v}</Tag> : "—" },
    { title: "常询系列", dataIndex: "top_series", width: 110,
      render: v => v ? <Tag color="purple">{v}</Tag> : "—" },
  ]

  return (
    <Table<CustomerStat>
      rowKey={r => r.customer_code ?? r.customer_short_name ?? ""}
      columns={cols}
      dataSource={data}
      loading={isFetching}
      size="small"
      scroll={{ x: 1100 }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
    />
  )
}

// ── 小组分析 ──────────────────────────────────────────────────────────────────

function GroupsTab({ year }: { year?: number }) {
  const { data = [], isFetching, isError, error } = useQuery({
    queryKey: ["analytics-groups", year],
    queryFn: () => fetchGroupsAnalysis(year),
  })

  if (isError) return <Alert type="error" showIcon message={`加载失败：${(error as Error).message}`} />

  const cols: ColumnsType<GroupStat> = [
    { title: "小组名称", dataIndex: "group_name", fixed: "left", width: 100 },
    { title: "询单数", dataIndex: "inquiry_count", width: 70, align: "right",
      sorter: (a, b) => a.inquiry_count - b.inquiry_count },
    { title: "已报价", dataIndex: "quoted_count", width: 70, align: "right" },
    { title: "已下单", dataIndex: "ordered_count", width: 70, align: "right",
      render: v => <Text style={{ color: "#52c41a", fontWeight: 600 }}>{v}</Text> },
    { title: "转化率", dataIndex: "conversion_rate", width: 150,
      sorter: (a, b) => a.conversion_rate - b.conversion_rate,
      render: v => <ConvBar rate={v} /> },
    { title: "总贸易额", dataIndex: "total_trade_amount", width: 120, align: "right",
      sorter: (a, b) => a.total_trade_amount - b.total_trade_amount,
      render: v => fmt(v, "$") },
    { title: "平均毛利率", dataIndex: "avg_gross_profit_rate", width: 100, align: "right",
      render: v => fmt(v, "", "%", 1) },
  ]

  return (
    <Table<GroupStat>
      rowKey="group_name"
      columns={cols}
      dataSource={data}
      loading={isFetching}
      size="small"
      scroll={{ x: 700 }}
      pagination={false}
    />
  )
}

// ── 产品/系列分析 ──────────────────────────────────────────────────────────────

function ProductsTab({ year }: { year?: number }) {
  const { data = [], isFetching, isError, error } = useQuery({
    queryKey: ["analytics-products", year],
    queryFn: () => fetchProductsAnalysis(year),
  })

  if (isError) return <Alert type="error" showIcon message={`加载失败：${(error as Error).message}`} />

  const cols: ColumnsType<ProductStat> = [
    { title: "产品大类", dataIndex: "product_category", fixed: "left", width: 100,
      render: v => <Tag color="blue">{v}</Tag> },
    { title: "系列", dataIndex: "series_name", width: 130,
      render: v => v ? <Tag color="cyan">{v}</Tag> : <Text type="secondary">—</Text> },
    { title: "询单数", dataIndex: "inquiry_count", width: 70, align: "right",
      sorter: (a, b) => a.inquiry_count - b.inquiry_count },
    { title: "已下单", dataIndex: "ordered_count", width: 70, align: "right",
      render: v => <Text style={{ color: "#52c41a", fontWeight: 600 }}>{v}</Text> },
    { title: "转化率", dataIndex: "conversion_rate", width: 150,
      sorter: (a, b) => a.conversion_rate - b.conversion_rate,
      render: v => <ConvBar rate={v} /> },
    { title: "总询单量", dataIndex: "total_quantity", width: 90, align: "right",
      render: v => v.toLocaleString() },
    { title: "总贸易额", dataIndex: "total_trade_amount", width: 120, align: "right",
      sorter: (a, b) => a.total_trade_amount - b.total_trade_amount,
      render: v => fmt(v, "$") },
    { title: "平均报价", dataIndex: "avg_final_quote", width: 100, align: "right",
      render: v => fmt(v, "$", "", 2) },
    { title: "平均毛利率", dataIndex: "avg_gross_profit_rate", width: 100, align: "right",
      render: v => fmt(v, "", "%", 1) },
  ]

  return (
    <Table<ProductStat>
      rowKey={r => `${r.product_category}__${r.series_name}`}
      columns={cols}
      dataSource={data}
      loading={isFetching}
      size="small"
      scroll={{ x: 900 }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
    />
  )
}

// ── 季度分析 ──────────────────────────────────────────────────────────────────

function QuartersTab() {
  const { data = [], isFetching, isError, error } = useQuery({
    queryKey: ["analytics-quarters"],
    queryFn: fetchQuartersAnalysis,
  })

  if (isError) return <Alert type="error" showIcon message={`加载失败：${(error as Error).message}`} />

  // SS vs SS, FW/AW vs FW/AW 对比（按 season_type 分组）
  const ssRows = useMemo(() => data.filter(r => r.season_type === "SS"), [data])
  const fwRows = useMemo(() => data.filter(r => r.season_type === "FW/AW"), [data])

  const cols: ColumnsType<QuarterStat> = [
    { title: "年份", dataIndex: "year", fixed: "left", width: 65 },
    { title: "季度", dataIndex: "quarter_label", fixed: "left", width: 90,
      render: (v, r) => (
        <span>
          {v} <Tag color={r.season_type === "SS" ? "blue" : "orange"} style={{ fontSize: 11 }}>
            {r.season_type}
          </Tag>
        </span>
      ) },
    { title: "询单数", dataIndex: "inquiry_count", width: 70, align: "right" },
    { title: "已报价", dataIndex: "quoted_count", width: 70, align: "right" },
    { title: "已下单", dataIndex: "ordered_count", width: 70, align: "right",
      render: v => <Text style={{ color: "#52c41a", fontWeight: 600 }}>{v}</Text> },
    { title: "转化率", dataIndex: "conversion_rate", width: 150,
      render: v => <ConvBar rate={v} /> },
    { title: "总贸易额", dataIndex: "total_trade_amount", width: 120, align: "right",
      render: v => fmt(v, "$") },
    { title: "上季度贸易额", dataIndex: "prev_quarter_trade", width: 120, align: "right",
      render: v => fmt(v, "$") },
    {
      title: "环比变化", dataIndex: "trade_change_pct", width: 100, align: "right",
      render: (v: number | null) => {
        if (v == null) return <Text type="secondary">—</Text>
        const color = v >= 0 ? "#52c41a" : "#ff4d4f"
        const Icon = v >= 0 ? ArrowUpOutlined : ArrowDownOutlined
        return <Text style={{ color, fontWeight: 600 }}><Icon /> {Math.abs(v).toFixed(1)}%</Text>
      },
    },
  ]

  return (
    <div>
      <Table<QuarterStat>
        rowKey="quarter_label"
        columns={cols}
        dataSource={data}
        loading={isFetching}
        size="small"
        scroll={{ x: 850 }}
        pagination={false}
      />

      {/* SS vs SS / FW vs FW 同比对比 */}
      {(ssRows.length > 1 || fwRows.length > 1) && (
        <Row gutter={16} style={{ marginTop: 16 }}>
          {ssRows.length > 1 && (
            <Col xs={24} md={12}>
              <Card size="small" title="SS 季同比（Spring/Summer）">
                <Table<QuarterStat>
                  rowKey="quarter_label"
                  columns={cols.filter(c => ["quarter_label", "inquiry_count", "ordered_count", "total_trade_amount"].includes((c as any).dataIndex))}
                  dataSource={ssRows}
                  size="small"
                  pagination={false}
                />
              </Card>
            </Col>
          )}
          {fwRows.length > 1 && (
            <Col xs={24} md={12}>
              <Card size="small" title="FW/AW 季同比（Fall/Autumn Winter）">
                <Table<QuarterStat>
                  rowKey="quarter_label"
                  columns={cols.filter(c => ["quarter_label", "inquiry_count", "ordered_count", "total_trade_amount"].includes((c as any).dataIndex))}
                  dataSource={fwRows}
                  size="small"
                  pagination={false}
                />
              </Card>
            </Col>
          )}
        </Row>
      )}
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

const TAB_KEYS = ["sales", "customers", "groups", "products", "quarters"] as const
type TabKey = typeof TAB_KEYS[number]

function useTabFromQuery(): [TabKey, (t: TabKey) => void] {
  const location = useLocation()
  const navigate = useNavigate()
  const raw = new URLSearchParams(location.search).get("tab")
  const tab: TabKey = TAB_KEYS.includes(raw as TabKey) ? (raw as TabKey) : "sales"
  const setTab = (t: TabKey) => navigate(`/analytics?tab=${t}`, { replace: true })
  return [tab, setTab]
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useTabFromQuery()
  const [year, setYear] = useState<number | undefined>(undefined)

  // 季度分析不用 year 筛选（展示全部）
  const showYearSelect = activeTab !== "quarters"

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>数据分析</Title>
        {showYearSelect && (
          <Select
            placeholder="全部年份"
            allowClear
            options={YEAR_OPTIONS}
            value={year}
            onChange={v => setYear(v)}
            style={{ width: 130 }}
          />
        )}
      </div>

      <DashboardSection year={year} />

      <Tabs
        activeKey={activeTab}
        onChange={k => setActiveTab(k as TabKey)}
        items={[
          {
            key: "sales",
            label: "业务员分析",
            children: <SalesTab year={year} />,
          },
          {
            key: "customers",
            label: "客户分析",
            children: <CustomersTab year={year} />,
          },
          {
            key: "groups",
            label: "小组分析",
            children: <GroupsTab year={year} />,
          },
          {
            key: "products",
            label: "产品/系列分析",
            children: <ProductsTab year={year} />,
          },
          {
            key: "quarters",
            label: "季度分析",
            children: <QuartersTab />,
          },
        ]}
      />
    </div>
  )
}
