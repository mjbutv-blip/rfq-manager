import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Button, Card, Col, Input, Row, Select,
  Statistic, Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { ReloadOutlined, UserOutlined } from "@ant-design/icons"

import { fetchCustomers, fetchCustomerSummary } from "@/api/customers"
import type { CustomerListItem } from "@/types/customer"
import { CUSTOMER_LEVEL_COLOR, CUSTOMER_LEVEL_LABEL, CUSTOMER_LEVEL_OPTIONS } from "@/types/customer"

const { Text } = Typography

function money(v: number | null | undefined) {
  if (v == null) return <Text type="secondary">—</Text>
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function pct(v: number | null | undefined) {
  if (v == null) return <Text type="secondary">—</Text>
  const color = v >= 50 ? "#52c41a" : v >= 25 ? "#faad14" : "#ff4d4f"
  return <Text strong style={{ color }}>{v.toFixed(1)}%</Text>
}

export default function CustomerListPage() {
  const navigate = useNavigate()

  const [filterCode,     setFilterCode]     = useState("")
  const [filterName,     setFilterName]     = useState("")
  const [filterCountry,  setFilterCountry]  = useState("")
  const [filterGroup,    setFilterGroup]    = useState("")
  const [filterSales,    setFilterSales]    = useState("")
  const [filterLevel,    setFilterLevel]    = useState("")
  const [filterCategory, setFilterCategory] = useState("")
  const [page,           setPage]           = useState(1)

  const params = {
    customer_code:       filterCode     || undefined,
    customer_short_name: filterName     || undefined,
    country:             filterCountry  || undefined,
    group_name:          filterGroup    || undefined,
    responsible_sales:   filterSales    || undefined,
    customer_level:      filterLevel    || undefined,
    customer_category:   filterCategory || undefined,
    page,
    page_size: 50,
    sort_by: "total_inquiry_count",
    sort_order: "desc",
  }

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["customers", params],
    queryFn: () => fetchCustomers(params),
    placeholderData: prev => prev,
  })

  const { data: summary } = useQuery({
    queryKey: ["customer-summary"],
    queryFn: fetchCustomerSummary,
    refetchInterval: 120_000,
  })

  const handleReset = () => {
    setFilterCode(""); setFilterName(""); setFilterCountry("")
    setFilterGroup(""); setFilterSales(""); setFilterLevel("")
    setFilterCategory(""); setPage(1)
  }

  const columns: ColumnsType<CustomerListItem> = [
    {
      title: "客户简称",
      dataIndex: "customer_short_name",
      width: 110,
      render: (v: string | null, r: CustomerListItem) => (
        <a onClick={() => navigate(`/customers/${encodeURIComponent(r.customer_code)}`)}>
          {v || r.customer_code}
        </a>
      ),
    },
    {
      title: "代码",
      dataIndex: "customer_code",
      width: 75,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: "国家",
      dataIndex: "country",
      width: 70,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "地区",
      dataIndex: "region",
      width: 60,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "小组",
      dataIndex: "group_name",
      width: 65,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "负责业务员",
      dataIndex: "responsible_sales",
      width: 90,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "询单数",
      dataIndex: "total_inquiry_count",
      width: 65,
      align: "right" as const,
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: "下单数",
      dataIndex: "total_order_count",
      width: 65,
      align: "right" as const,
    },
    {
      title: "转化率",
      dataIndex: "conversion_rate",
      width: 75,
      align: "right" as const,
      render: pct,
    },
    {
      title: "总贸易额",
      dataIndex: "total_trade_amount",
      width: 100,
      align: "right" as const,
      render: money,
    },
    {
      title: "最近询单",
      dataIndex: "last_inquiry_date",
      width: 95,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "最近下单",
      dataIndex: "last_order_date",
      width: 95,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "等级",
      dataIndex: "customer_level",
      width: 65,
      render: (v: string | null) => v
        ? <Tag color={CUSTOMER_LEVEL_COLOR[v] ?? "default"}>{CUSTOMER_LEVEL_LABEL[v] ?? v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "标签",
      dataIndex: "customer_tags",
      width: 120,
      render: (tags: string[]) => tags?.length
        ? tags.slice(0, 3).map(t => <Tag key={t} style={{ marginBottom: 2 }}>{t}</Tag>)
        : <Text type="secondary">—</Text>,
    },
    {
      title: "活跃",
      dataIndex: "is_active",
      width: 55,
      render: (v: boolean) => (
        <Tag color={v ? "green" : "default"}>{v ? "活跃" : "沉默"}</Tag>
      ),
    },
    {
      title: "操作",
      key: "action",
      fixed: "right" as const,
      width: 70,
      render: (_: unknown, r: CustomerListItem) => (
        <Button
          size="small"
          type="link"
          icon={<UserOutlined />}
          onClick={() => navigate(`/customers/${encodeURIComponent(r.customer_code)}`)}
        >
          详情
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: 16 }}>

      {/* 标题 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>客户档案</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button>
      </div>

      {/* 统计卡片 */}
      {summary && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="客户总数" value={summary.total_customers} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="活跃客户（90天内）"
                value={summary.active_customers}
                valueStyle={{ color: "#52c41a" }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="有下单客户" value={summary.customers_with_orders} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="总贸易额 (USD)"
                value={summary.total_trade_amount}
                precision={0}
                prefix="$"
                formatter={v => Number(v).toLocaleString()}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[8, 8]}>
          <Col xs={12} sm={8} md={4}>
            <Input placeholder="客户简称" value={filterName}
              onChange={e => { setFilterName(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="客户代码" value={filterCode}
              onChange={e => { setFilterCode(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="国家/地区" value={filterCountry}
              onChange={e => { setFilterCountry(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="所属小组" value={filterGroup}
              onChange={e => { setFilterGroup(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="负责业务员" value={filterSales}
              onChange={e => { setFilterSales(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Select
              value={filterLevel} onChange={v => { setFilterLevel(v); setPage(1) }}
              options={[{ label: "全部等级", value: "" }, ...CUSTOMER_LEVEL_OPTIONS]}
              style={{ width: "100%" }} placeholder="客户等级"
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="客户类别" value={filterCategory}
              onChange={e => { setFilterCategory(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={2}>
            <Button icon={<ReloadOutlined />} onClick={handleReset} style={{ width: "100%" }}>
              重置
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 表格 */}
      <Table<CustomerListItem>
        rowKey="customer_code"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        size="small"
        bordered
        scroll={{ x: 1400, y: "calc(100vh - 380px)" }}
        pagination={{
          current: page,
          pageSize: 50,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: p => setPage(p),
          showTotal: total => `共 ${total} 位客户`,
        }}
      />

      <style>{`.ant-table-cell { font-size: 12px; } a { cursor: pointer; }`}</style>
    </div>
  )
}
