import { Alert, Button, Card, Descriptions, Space, Table, Tag, Typography } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useNavigate } from "react-router-dom"

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

const inquiries: OrderGroupInquiryAnalysis[] = [
  {
    inquiry_id: "demo-btku1005",
    inquiry_no: "BTKU1005",
    customer_order_no: "208250100+01",
    product_name: "女士固定杯文胸",
    quantity: 34849,
    order_status: "报价中",
    selected_factory: "工厂C",
    final_quote_usd: 5.2,
    selected_factory_price_cny: 27.2,
    gross_profit_cny: 23186,
    trade_amount_usd: 181214.8,
    lowest_factory: "工厂A",
    lowest_price: 26.8,
    highest_factory: "工厂B",
    highest_price: 29.5,
    second_lowest_factory: "工厂C",
    second_lowest_price: 27.2,
    spread_amount: 2.7,
    spread_pct: 0.101,
    quantity_share: 0.406,
    trade_amount_share: 0.417,
  },
  {
    inquiry_id: "demo-btku1010",
    inquiry_no: "BTKU1010",
    customer_order_no: "208251300-01",
    product_name: "女士三角裤",
    quantity: 51048,
    order_status: "报价中",
    selected_factory: "工厂C",
    final_quote_usd: 2.15,
    selected_factory_price_cny: 11.3,
    gross_profit_cny: 37163,
    trade_amount_usd: 109753.2,
    lowest_factory: "工厂B",
    lowest_price: 10.9,
    highest_factory: "工厂A",
    highest_price: 12.4,
    second_lowest_factory: "工厂C",
    second_lowest_price: 11.3,
    spread_amount: 1.5,
    spread_pct: 0.138,
    quantity_share: 0.594,
    trade_amount_share: 0.583,
  },
]

const scenarios: OrderGroupScenario[] = [
  {
    code: "A",
    label: "每个询单选择本询单最低价工厂",
    factory_count: 2,
    customer_amount_cny: 2094963,
    factory_cost_cny: 1490106.4,
    gross_profit_cny: 604856.6,
    gross_profit_rate: 0.289,
    missing_fields: [],
    management_note: "理论成本最低；但 BTKU1005 给工厂A、BTKU1010 给工厂B，沟通和交付管理更分散。",
    selections: [
      { inquiry_id: "demo-btku1005", inquiry_no: "BTKU1005", factory_name: "工厂A", factory_price: 26.8 },
      { inquiry_id: "demo-btku1010", inquiry_no: "BTKU1010", factory_name: "工厂B", factory_price: 10.9 },
    ],
  },
  {
    code: "B",
    label: "整组统一给工厂C",
    factory_count: 1,
    customer_amount_cny: 2094963,
    factory_cost_cny: 1524466.4,
    gross_profit_cny: 570496.6,
    gross_profit_rate: 0.272,
    missing_fields: [],
    management_note: "工厂集中度更高，沟通更简单；比最低价方案多花 34,360，需要人工确认是否因交期、质量、配合度值得接受。",
    unified_factory: "工厂C",
    extra_cost_vs_lowest: 34360,
    profit_gap_vs_lowest: -34360,
    selections: [
      { inquiry_id: "demo-btku1005", inquiry_no: "BTKU1005", factory_name: "工厂C", factory_price: 27.2 },
      { inquiry_id: "demo-btku1010", inquiry_no: "BTKU1010", factory_name: "工厂C", factory_price: 11.3 },
    ],
  },
  {
    code: "C",
    label: "当前系统选用工厂方案",
    factory_count: 1,
    customer_amount_cny: 2094963,
    factory_cost_cny: 1524466.4,
    gross_profit_cny: 570496.6,
    gross_profit_rate: 0.272,
    missing_fields: [],
    management_note: "反映当前选用工厂字段；这里只是分析提示，不代表系统推荐。",
    profit_gap_vs_lowest: -34360,
    profit_gap_vs_best_unified: 0,
    selections: [
      { inquiry_id: "demo-btku1005", inquiry_no: "BTKU1005", factory_name: "工厂C", factory_price: 27.2 },
      { inquiry_id: "demo-btku1010", inquiry_no: "BTKU1010", factory_name: "工厂C", factory_price: 11.3 },
    ],
  },
]

function ScenarioCard({ scenario }: { scenario: OrderGroupScenario }) {
  return (
    <Card size="small" title={`${scenario.code}：${scenario.label}`} style={{ marginBottom: 12 }}>
      <Descriptions size="small" column={4}>
        <Descriptions.Item label="工厂数量">{scenario.factory_count}</Descriptions.Item>
        <Descriptions.Item label="整组客户报价总额">{money(scenario.customer_amount_cny)}</Descriptions.Item>
        <Descriptions.Item label="整组工厂成本">{money(scenario.factory_cost_cny)}</Descriptions.Item>
        <Descriptions.Item label="整组毛利润">{money(scenario.gross_profit_cny)}</Descriptions.Item>
        <Descriptions.Item label="整组毛利润率">{pct(scenario.gross_profit_rate)}</Descriptions.Item>
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

export default function OrderGroupDemoPage() {
  const navigate = useNavigate()
  const inquiryColumns: ColumnsType<OrderGroupInquiryAnalysis> = [
    { title: "询单号", dataIndex: "inquiry_no", fixed: "left", width: 120 },
    { title: "订单号", dataIndex: "customer_order_no", width: 140, render: val },
    { title: "品名", dataIndex: "product_name", width: 160, render: val },
    { title: "数量", dataIndex: "quantity", width: 100, align: "right", render: money },
    { title: "数量占比", dataIndex: "quantity_share", width: 100, align: "right", render: pct },
    { title: "选用工厂", dataIndex: "selected_factory", width: 120, render: val },
    { title: "给客人报价", dataIndex: "final_quote_usd", width: 120, align: "right", render: money },
    { title: "选用工厂价", dataIndex: "selected_factory_price_cny", width: 120, align: "right", render: money },
    { title: "最低工厂", dataIndex: "lowest_factory", width: 120, render: val },
    { title: "最低价", dataIndex: "lowest_price", width: 100, align: "right", render: money },
    { title: "最高价差%", dataIndex: "spread_pct", width: 110, align: "right", render: pct },
    { title: "毛利润额", dataIndex: "gross_profit_cny", width: 120, align: "right", render: money },
    { title: "贸易额", dataIndex: "trade_amount_usd", width: 120, align: "right", render: money },
    { title: "贸易额占比", dataIndex: "trade_amount_share", width: 110, align: "right", render: pct },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate("/order-groups")}>返回订单组列表</Button>
      </Space>
      <Title level={3}>订单组综合分析 - 示例</Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="这是静态演示数据，不读取数据库，也不会影响真实订单。"
      />

      <Card size="small" title="订单组基础信息" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="订单组编号">OG-DEMO-BTKU1005-1010</Descriptions.Item>
          <Descriptions.Item label="客户">TK</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color="green">demo</Tag></Descriptions.Item>
          <Descriptions.Item label="来源文件">订单组示例.xlsx</Descriptions.Item>
          <Descriptions.Item label="Sheet">总表</Descriptions.Item>
          <Descriptions.Item label="来源行">5-6</Descriptions.Item>
          <Descriptions.Item label="备注">识别依据：连续行 + 相同底色/视觉区域</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="组内询单列表" style={{ marginBottom: 16 }}>
        <Table rowKey="inquiry_id" size="small" columns={inquiryColumns} dataSource={inquiries} scroll={{ x: 1700 }} pagination={false} />
      </Card>

      <Card size="small" title="第一轮报价综合分析" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          {scenarios.map(s => <ScenarioCard key={s.code} scenario={s} />)}
          <Card size="small" title="D：自定义组合方案">
            <Text type="secondary">本阶段预留，后续可让业务员手动选择每个询单对应工厂后实时计算整组利润。</Text>
          </Card>
        </Space>
      </Card>

      <Card size="small" title="辅助决策指标" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="最低价方案工厂数量">2</Descriptions.Item>
          <Descriptions.Item label="当前方案工厂数量">1</Descriptions.Item>
          <Descriptions.Item label="可统一承接工厂数">1</Descriptions.Item>
          <Descriptions.Item label="缺有效报价询单">—</Descriptions.Item>
          <Descriptions.Item label="数量关键款">BTKU1010</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="风险与提醒">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Alert type="warning" showIcon message="BTKU1010 数量占比 59.4%，是整组利润关键款。" />
          <Alert type="warning" showIcon message="当前统一工厂方案不是最低成本方案，请确认是否因交期、质量、配合度或整组统筹考虑。" />
          <Alert type="info" showIcon message="所有结论均为分析提示，不自动推荐工厂，也不会修改选用工厂。" />
        </Space>
      </Card>
    </div>
  )
}
