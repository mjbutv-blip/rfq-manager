import { useQuery } from "@tanstack/react-query"
import { Card, Col, Row, Select, Statistic, Table, Typography } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  fetchDashboard,
  fetchGroupsAnalysis,
  fetchSalesAnalysis,
} from "@/api/analytics"
import type { GroupStat, SalesStat } from "@/types/analytics"

const { Title, Text } = Typography

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(y => ({ label: String(y), value: y }))

function fmt(v: number, prefix = "", suffix = "", dec = 0) {
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
        width: Math.round(rate),
        height: 8,
        background: color,
        borderRadius: 4,
        minWidth: 2,
        maxWidth: 80,
      }} />
      <Text style={{ fontSize: 12, color, fontWeight: 600 }}>{rate}%</Text>
    </div>
  )
}

const salesColumns: ColumnsType<SalesStat> = [
  { title: "业务员", dataIndex: "responsible_sales", width: 90 },
  { title: "询单", dataIndex: "inquiry_count", width: 60, align: "right" },
  { title: "已报价", dataIndex: "quoted_count", width: 65, align: "right" },
  { title: "已下单", dataIndex: "ordered_count", width: 65, align: "right",
    render: v => <Text style={{ color: "#52c41a", fontWeight: 600 }}>{v}</Text> },
  {
    title: "转化率", dataIndex: "conversion_rate", width: 130,
    render: (v: number) => <ConvBar rate={v} />,
  },
  {
    title: "贸易额", dataIndex: "total_trade_amount", width: 110, align: "right",
    render: v => fmt(v, "$"),
  },
  {
    title: "平均毛利率", dataIndex: "avg_gross_profit_rate", width: 90, align: "right",
    render: (v: number | null) => v != null ? fmt(v, "", "%", 1) : "—",
  },
]

const groupColumns: ColumnsType<GroupStat> = [
  { title: "小组", dataIndex: "group_name", width: 90 },
  { title: "询单", dataIndex: "inquiry_count", width: 60, align: "right" },
  { title: "已下单", dataIndex: "ordered_count", width: 65, align: "right",
    render: v => <Text style={{ color: "#52c41a", fontWeight: 600 }}>{v}</Text> },
  {
    title: "转化率", dataIndex: "conversion_rate", width: 130,
    render: (v: number) => <ConvBar rate={v} />,
  },
  {
    title: "总贸易额", dataIndex: "total_trade_amount", width: 110, align: "right",
    render: v => fmt(v, "$"),
  },
  {
    title: "平均毛利率", dataIndex: "avg_gross_profit_rate", width: 90, align: "right",
    render: (v: number | null) => v != null ? fmt(v, "", "%", 1) : "—",
  },
]

export default function DashboardPage() {
  const [year, setYear] = useState<number | undefined>(undefined)
  const navigate = useNavigate()

  const { data: dash, isFetching: dashLoading } = useQuery({
    queryKey: ["dashboard", year],
    queryFn: () => fetchDashboard(year),
  })

  const { data: sales = [], isFetching: salesLoading } = useQuery({
    queryKey: ["analytics-sales", year],
    queryFn: () => fetchSalesAnalysis(year),
  })

  const { data: groups = [], isFetching: groupsLoading } = useQuery({
    queryKey: ["analytics-groups", year],
    queryFn: () => fetchGroupsAnalysis(year),
  })

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>数据总览 Dashboard</Title>
        <Select
          placeholder="全部年份"
          allowClear
          options={YEAR_OPTIONS}
          value={year}
          onChange={v => setYear(v)}
          style={{ width: 130 }}
        />
      </div>

      {/* 核心指标卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={4}>
          <Card loading={dashLoading}>
            <Statistic title="询单总数" value={dash?.total_inquiries ?? 0} suffix="条" />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card loading={dashLoading}>
            <Statistic title="已报价" value={dash?.total_quoted ?? 0} suffix="条"
              valueStyle={{ color: "#722ed1" }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card loading={dashLoading}>
            <Statistic title="已下单" value={dash?.total_ordered ?? 0} suffix="条"
              valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card loading={dashLoading}>
            <Statistic
              title="订单转化率"
              value={dash?.conversion_rate ?? 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: dash && dash.conversion_rate >= 30 ? "#52c41a" : "#faad14" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card loading={dashLoading}>
            <Statistic
              title="总贸易额"
              value={dash?.total_trade_amount ?? 0}
              prefix="$"
              precision={0}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card loading={dashLoading}>
            <Statistic
              title="平均毛利率"
              value={dash?.avg_gross_profit_rate ?? 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: "#fa8c16" }}
            />
          </Card>
        </Col>
      </Row>

      {/* 业务员排名 + 小组排名 */}
      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card
            title="业务员业绩排名"
            size="small"
            extra={
              <a onClick={() => navigate("/analytics?tab=sales")} style={{ fontSize: 12 }}>
                查看完整分析 →
              </a>
            }
          >
            <Table<SalesStat>
              rowKey="responsible_sales"
              columns={salesColumns}
              dataSource={sales.slice(0, 10)}
              loading={salesLoading}
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title="业务小组排名"
            size="small"
            extra={
              <a onClick={() => navigate("/analytics?tab=groups")} style={{ fontSize: 12 }}>
                查看完整分析 →
              </a>
            }
          >
            <Table<GroupStat>
              rowKey="group_name"
              columns={groupColumns}
              dataSource={groups}
              loading={groupsLoading}
              pagination={false}
              size="small"
              scroll={{ x: 500 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
