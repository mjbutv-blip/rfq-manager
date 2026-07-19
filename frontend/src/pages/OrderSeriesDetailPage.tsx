import { useQuery } from "@tanstack/react-query"
import { Alert, Button, Card, Descriptions, Space, Table, Tag, Typography } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useNavigate, useParams } from "react-router-dom"

import { fetchOrderSeriesDetail } from "@/api/order_series"
import type { OrderSeriesGroup } from "@/types/order_series"
import type { OrderGroupInquiryAnalysis, OrderGroupScenario } from "@/types/order_group"

const { Title, Text } = Typography

function val(v: unknown) {
  return v == null || v === "" ? "—" : String(v)
}

function money(v: number | null | undefined) {
  return v == null || Number.isNaN(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function pct(v: number | null | undefined) {
  return v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(1)}%`
}

function ScenarioCard({ scenario, titlePrefix }: { scenario: OrderGroupScenario; titlePrefix: string }) {
  return (
    <Card size="small" title={`${titlePrefix}${scenario.code}：${scenario.label}`} style={{ marginBottom: 12 }}>
      <Descriptions size="small" column={4}>
        <Descriptions.Item label="工厂数量">{scenario.factory_count}</Descriptions.Item>
        <Descriptions.Item label="系列客户报价总额">{money(scenario.customer_amount_cny)}</Descriptions.Item>
        <Descriptions.Item label="系列工厂成本">{money(scenario.factory_cost_cny)}</Descriptions.Item>
        <Descriptions.Item label="系列毛利润">{money(scenario.gross_profit_cny)}</Descriptions.Item>
        <Descriptions.Item label="系列毛利润率">{pct(scenario.gross_profit_rate)}</Descriptions.Item>
        <Descriptions.Item label="缺失字段">{scenario.missing_fields.length ? scenario.missing_fields.join("，") : "—"}</Descriptions.Item>
      </Descriptions>
      <Text type="secondary">{scenario.management_note}</Text>
    </Card>
  )
}

export default function OrderSeriesDetailPage() {
  const { seriesId } = useParams()
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ["order-series-detail", seriesId],
    queryFn: () => fetchOrderSeriesDetail(seriesId!),
    enabled: !!seriesId,
  })

  if (isLoading) return <div style={{ padding: 24 }}>加载中...</div>
  if (error) return <div style={{ padding: 24 }}><Alert type="error" showIcon message="无法加载报价单系列" description={(error as Error).message} /></div>
  if (!data) return null

  const summary = data.analysis.series_summary
  const inquiryColumns: ColumnsType<OrderGroupInquiryAnalysis> = [
    { title: "询单号", dataIndex: "inquiry_no", fixed: "left", width: 120, render: (v, r) => <Button type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}/journey`)}>{v}</Button> },
    { title: "订单号", dataIndex: "customer_order_no", width: 130, render: val },
    { title: "品名", dataIndex: "product_name", width: 180, render: val },
    { title: "数量", dataIndex: "quantity", width: 100, align: "right", render: val },
    { title: "数量占比", dataIndex: "quantity_share", width: 100, align: "right", render: pct },
    { title: "选用工厂", dataIndex: "selected_factory", width: 140, render: val },
    { title: "客户报价", dataIndex: "final_quote_usd", width: 110, align: "right", render: money },
    { title: "最低工厂", dataIndex: "lowest_factory", width: 140, render: val },
    { title: "最低价", dataIndex: "lowest_price", width: 100, align: "right", render: money },
    { title: "最高价差%", dataIndex: "spread_pct", width: 110, align: "right", render: pct },
    { title: "毛利润额", dataIndex: "gross_profit_cny", width: 120, align: "right", render: money },
    { title: "贸易额", dataIndex: "trade_amount_usd", width: 120, align: "right", render: money },
    { title: "贸易额占比", dataIndex: "trade_amount_share", width: 110, align: "right", render: pct },
  ]

  const groupColumns: ColumnsType<OrderSeriesGroup> = [
    { title: "订单组编号", dataIndex: "group_code", width: 160 },
    { title: "系列 / 组标记", dataIndex: "group_name", width: 220, render: val },
    { title: "询单号", dataIndex: "inquiry_nos", render: v => v.join("，") },
    { title: "来源行", width: 100, render: (_, r) => r.source_start_row ? `${r.source_start_row}-${r.source_end_row}` : "—" },
    { title: "状态", dataIndex: "group_status", width: 90, render: s => <Tag color={s === "active" ? "green" : "gold"}>{s}</Tag> },
    { title: "操作", width: 110, render: (_, r) => <Button size="small" onClick={() => navigate(`/order-groups/${r.id}`)}>查看订单组</Button> },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate("/order-series")}>返回系列列表</Button>
      </Space>
      <Title level={3}>报价单系列综合分析</Title>

      <Card size="small" title="系列基础信息" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="系列编号">{data.series.series_code}</Descriptions.Item>
          <Descriptions.Item label="报价单系列">{val(data.series.series_name)}</Descriptions.Item>
          <Descriptions.Item label="客户">{val(data.series.customer_code)}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={data.series.series_status === "active" ? "green" : "gold"}>{data.series.series_status}</Tag></Descriptions.Item>
          <Descriptions.Item label="来源文件">{val(data.series.source_file_name)}</Descriptions.Item>
          <Descriptions.Item label="来源行">{data.series.source_start_row ? `${data.series.source_start_row}-${data.series.source_end_row}` : "—"}</Descriptions.Item>
          <Descriptions.Item label="备注">{val(data.series.notes)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="系列整体指标" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={4}>
          <Descriptions.Item label="系列询单数">{data.analysis.inquiries.length}</Descriptions.Item>
          <Descriptions.Item label="系列总数量">{summary.total_quantity.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="系列贸易额">{money(summary.trade_amount_usd)}</Descriptions.Item>
          <Descriptions.Item label="系列毛利润">{money(summary.gross_profit_cny)}</Descriptions.Item>
          <Descriptions.Item label="订单组数">{summary.order_group_count}</Descriptions.Item>
          <Descriptions.Item label="选用工厂数">{summary.selected_factory_count}</Descriptions.Item>
          <Descriptions.Item label="未分组询单">{summary.ungrouped_inquiry_nos.length ? summary.ungrouped_inquiry_nos.join("，") : "—"}</Descriptions.Item>
          <Descriptions.Item label="缺报价询单">{summary.missing_quote_inquiries.length ? summary.missing_quote_inquiries.join("，") : "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="系列内询单列表" style={{ marginBottom: 16 }}>
        <Table rowKey="inquiry_id" size="small" columns={inquiryColumns} dataSource={data.analysis.inquiries} scroll={{ x: 1600 }} pagination={false} />
      </Card>

      <Card size="small" title="系列内订单组" style={{ marginBottom: 16 }}>
        {data.order_groups.length ? (
          <Table rowKey="id" size="small" columns={groupColumns} dataSource={data.order_groups} pagination={false} />
        ) : (
          <Text type="secondary">该系列内暂未创建订单组。</Text>
        )}
      </Card>

      <Card size="small" title="系列第一轮国内报价整体分析" style={{ marginBottom: 16 }}>
        <ScenarioCard scenario={data.analysis.scenarios.lowest_each} titlePrefix="系列" />
        {data.analysis.scenarios.unified_factory.length ? (
          data.analysis.scenarios.unified_factory.slice(0, 3).map(s => <ScenarioCard key={s.unified_factory ?? s.label} scenario={s} titlePrefix="系列" />)
        ) : (
          <Alert type="info" showIcon message="没有工厂给系列内所有询单都报过价，暂不能形成全系列统一工厂方案。" />
        )}
        <ScenarioCard scenario={data.analysis.scenarios.current_selected} titlePrefix="系列" />
      </Card>

      <Card size="small" title="风险与提醒">
        {data.analysis.warnings.length ? (
          <Space direction="vertical" style={{ width: "100%" }}>
            {data.analysis.warnings.map(w => <Alert key={w} type="warning" showIcon message={w} />)}
          </Space>
        ) : (
          <Text type="secondary">暂无风险提示。系列分析只用于辅助决策，最终工厂选择仍需人工确认。</Text>
        )}
      </Card>
    </div>
  )
}
