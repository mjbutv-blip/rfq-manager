import { useQuery } from "@tanstack/react-query"
import { Alert, Button, Card, Descriptions, Space, Table, Tag, Typography } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useNavigate, useParams } from "react-router-dom"

import { fetchOrderGroupDetail } from "@/api/order_groups"
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

function ScenarioCard({ scenario }: { scenario: OrderGroupScenario }) {
  return (
    <Card size="small" title={`${scenario.code}：${scenario.label}`} style={{ marginBottom: 12 }}>
      <Descriptions size="small" column={4}>
        <Descriptions.Item label="工厂数量">{scenario.factory_count}</Descriptions.Item>
        <Descriptions.Item label="整组客户报价总额">{money(scenario.customer_amount_cny)}</Descriptions.Item>
        <Descriptions.Item label="整组工厂成本">{money(scenario.factory_cost_cny)}</Descriptions.Item>
        <Descriptions.Item label="整组毛利润">{money(scenario.gross_profit_cny)}</Descriptions.Item>
        <Descriptions.Item label="整组毛利润率">{pct(scenario.gross_profit_rate)}</Descriptions.Item>
        <Descriptions.Item label="缺失字段">{scenario.missing_fields.length ? scenario.missing_fields.join("，") : "—"}</Descriptions.Item>
        {"extra_cost_vs_lowest" in scenario && <Descriptions.Item label="比最低价方案多花">{money(scenario.extra_cost_vs_lowest)}</Descriptions.Item>}
        {"profit_gap_vs_lowest" in scenario && <Descriptions.Item label="比最低价方案利润差">{money(scenario.profit_gap_vs_lowest)}</Descriptions.Item>}
        {"profit_gap_vs_best_unified" in scenario && <Descriptions.Item label="比最佳统一工厂利润差">{money(scenario.profit_gap_vs_best_unified)}</Descriptions.Item>}
      </Descriptions>
      <Text type="secondary">{scenario.management_note}</Text>
      <Table
        size="small"
        style={{ marginTop: 10 }}
        rowKey={r => `${scenario.code}-${r.inquiry_id}`}
        pagination={false}
        dataSource={scenario.selections}
        columns={[
          { title: "询单号", dataIndex: "inquiry_no" },
          { title: "工厂", dataIndex: "factory_name", render: val },
          { title: "工厂价", dataIndex: "factory_price", align: "right", render: money },
        ]}
      />
    </Card>
  )
}

export default function OrderGroupDetailPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ["order-group-detail", groupId],
    queryFn: () => fetchOrderGroupDetail(groupId!),
    enabled: !!groupId,
  })

  if (isLoading) return <div style={{ padding: 24 }}>加载中...</div>
  if (error) return <div style={{ padding: 24 }}><Alert type="error" showIcon message="无法加载订单组" description={(error as Error).message} /></div>
  if (!data) return null

  const inquiryColumns: ColumnsType<OrderGroupInquiryAnalysis> = [
    { title: "询单号", dataIndex: "inquiry_no", fixed: "left", width: 120, render: (v, r) => <Button type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}/journey`)}>{v}</Button> },
    { title: "订单号", dataIndex: "customer_order_no", width: 130, render: val },
    { title: "品名", dataIndex: "product_name", width: 180, render: val },
    { title: "数量", dataIndex: "quantity", width: 100, align: "right", render: val },
    { title: "数量占比", dataIndex: "quantity_share", width: 100, align: "right", render: pct },
    { title: "订单状态", dataIndex: "order_status", width: 110, render: val },
    { title: "选用工厂", dataIndex: "selected_factory", width: 140, render: val },
    { title: "给客人报价", dataIndex: "final_quote_usd", width: 120, align: "right", render: money },
    { title: "选用工厂价", dataIndex: "selected_factory_price_cny", width: 120, align: "right", render: money },
    { title: "最低工厂", dataIndex: "lowest_factory", width: 140, render: val },
    { title: "最低价", dataIndex: "lowest_price", width: 110, align: "right", render: money },
    { title: "最高价差%", dataIndex: "spread_pct", width: 120, align: "right", render: pct },
    { title: "毛利润额", dataIndex: "gross_profit_cny", width: 120, align: "right", render: money },
    { title: "贸易额", dataIndex: "trade_amount_usd", width: 120, align: "right", render: money },
    { title: "贸易额占比", dataIndex: "trade_amount_share", width: 110, align: "right", render: pct },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate("/order-groups")}>返回订单组列表</Button>
      </Space>
      <Title level={3}>订单组综合分析</Title>

      <Card size="small" title="订单组基础信息" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="订单组编号">{data.group.group_code}</Descriptions.Item>
          <Descriptions.Item label="系列 / 组标记">{val(data.group.group_name)}</Descriptions.Item>
          <Descriptions.Item label="客户">{val(data.group.customer_code)}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={data.group.group_status === "active" ? "green" : "gold"}>{data.group.group_status}</Tag></Descriptions.Item>
          <Descriptions.Item label="来源文件">{val(data.group.source_file_name)}</Descriptions.Item>
          <Descriptions.Item label="Sheet">{val(data.group.source_sheet)}</Descriptions.Item>
          <Descriptions.Item label="来源行">{data.group.source_start_row ? `${data.group.source_start_row}-${data.group.source_end_row}` : "—"}</Descriptions.Item>
          <Descriptions.Item label="备注">{val(data.group.notes)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="组内询单列表" style={{ marginBottom: 16 }}>
        <Table rowKey="inquiry_id" size="small" columns={inquiryColumns} dataSource={data.analysis.inquiries} scroll={{ x: 1800 }} pagination={false} />
      </Card>

      <Card size="small" title="第一轮报价综合分析" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <ScenarioCard scenario={data.analysis.scenarios.lowest_each} />
          {data.analysis.scenarios.unified_factory.length ? (
            data.analysis.scenarios.unified_factory.map(s => <ScenarioCard key={s.unified_factory ?? s.label} scenario={s} />)
          ) : (
            <Alert type="info" showIcon message="没有工厂给组内所有询单都报过价，暂不能形成统一工厂方案 B。" />
          )}
          <ScenarioCard scenario={data.analysis.scenarios.current_selected} />
          <Card size="small" title="D：自定义组合方案">
            <Text type="secondary">本阶段预留，后续可让业务员手动选择每个询单对应工厂后实时计算整组利润。</Text>
          </Card>
        </Space>
      </Card>

      <Card size="small" title="辅助决策指标" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="最低价方案工厂数量">{data.analysis.auxiliary_metrics.factory_concentration.lowest_each_factory_count}</Descriptions.Item>
          <Descriptions.Item label="当前方案工厂数量">{data.analysis.auxiliary_metrics.factory_concentration.current_factory_count}</Descriptions.Item>
          <Descriptions.Item label="可统一承接工厂数">{data.analysis.auxiliary_metrics.factory_concentration.common_factory_count}</Descriptions.Item>
          <Descriptions.Item label="缺有效报价询单">{data.analysis.auxiliary_metrics.missing_quote_inquiries.length ? data.analysis.auxiliary_metrics.missing_quote_inquiries.join("，") : "—"}</Descriptions.Item>
          <Descriptions.Item label="数量关键款">{data.analysis.auxiliary_metrics.quantity_key_inquiries.map(i => i.inquiry_no).join("，") || "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="风险与提醒">
        {data.analysis.warnings.length ? (
          <Space direction="vertical">
            {data.analysis.warnings.map(w => <Alert key={w} type="warning" showIcon message={w} />)}
          </Space>
        ) : (
          <Text type="secondary">暂无风险提示。所有分析仅用于辅助决策，最终工厂选择仍需人工确认交期、质量、产能和客户要求。</Text>
        )}
      </Card>
    </div>
  )
}
