import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import type { Dayjs } from "dayjs"

import { fetchFactorySupplyAnalysis } from "@/api/analytics"
import type {
  FactorySupplyFactoryRow,
  FactorySupplyFilter,
  FactorySupplySpreadRow,
} from "@/types/analytics"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(year => ({ label: String(year), value: year }))
const QUOTE_TYPE_OPTIONS = [
  { label: "国内报价", value: "domestic" },
  { label: "海外报价", value: "overseas" },
]
const ROUND_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8].map(round => ({ label: `第 ${round} 轮`, value: round }))

function pct(value: number | null | undefined): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`
}

function num(value: number | null | undefined, suffix = ""): string {
  return value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`
}

export default function FactorySupplyAnalysisPage() {
  const [year, setYear] = useState<number | undefined>(undefined)
  const [quoteType, setQuoteType] = useState("domestic")
  const [quoteRound, setQuoteRound] = useState<number | undefined>(undefined)
  const [factoryName, setFactoryName] = useState("")
  const [customerCode, setCustomerCode] = useState("")
  const [groupName, setGroupName] = useState("")
  const [responsibleSales, setResponsibleSales] = useState("")
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])

  const filter: FactorySupplyFilter = {
    year,
    quote_type: quoteType || undefined,
    quote_round: quoteRound,
    factory_name: factoryName || undefined,
    customer_code: customerCode || undefined,
    group_name: groupName || undefined,
    responsible_sales: responsibleSales || undefined,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["factory-supply-analysis", filter],
    queryFn: () => fetchFactorySupplyAnalysis(filter),
  })

  const handleReset = () => {
    setYear(undefined)
    setQuoteType("domestic")
    setQuoteRound(undefined)
    setFactoryName("")
    setCustomerCode("")
    setGroupName("")
    setResponsibleSales("")
    setDateRange([null, null])
  }

  const factoryColumns: ColumnsType<FactorySupplyFactoryRow> = [
    { title: "工厂", dataIndex: "factory_name", width: 180, fixed: "left" },
    { title: "报价次数", dataIndex: "quote_count", width: 100, align: "right" },
    { title: "参与询单数", dataIndex: "inquiry_count", width: 110, align: "right" },
    { title: "有效报价", dataIndex: "valid_quote_count", width: 100, align: "right" },
    { title: "最低价次数", dataIndex: "lowest_price_count", width: 110, align: "right" },
    { title: "最低价率", dataIndex: "lowest_rate", width: 100, align: "right", render: pct },
    { title: "被选用次数", dataIndex: "selected_count", width: 110, align: "right" },
    { title: "中标率", dataIndex: "selected_rate", width: 100, align: "right", render: pct },
    { title: "平均排名", dataIndex: "avg_rank", width: 100, align: "right", render: v => num(v) },
    { title: "平均报价", dataIndex: "avg_price", width: 120, align: "right", render: v => num(v) },
    {
      title: "币种/单位",
      dataIndex: "currency_unit",
      width: 160,
      render: (value, row) => (
        <Space size={4} wrap>
          <Text>{value || "—"}</Text>
          {!row.unit_consistent ? <Tag color="orange">不一致</Tag> : null}
        </Space>
      ),
    },
    { title: "最近报价", dataIndex: "latest_quote_date", width: 130, render: v => v ? String(v).slice(0, 10) : <Text type="secondary">—</Text> },
  ]

  const spreadColumns: ColumnsType<FactorySupplySpreadRow> = [
    { title: "询单", dataIndex: "inquiry_id", width: 220, ellipsis: true },
    { title: "轮次", dataIndex: "quote_round", width: 80, align: "right" },
    { title: "报价类型", dataIndex: "quote_type", width: 100, render: v => v === "overseas" ? "海外" : "国内" },
    { title: "最低价", dataIndex: "lowest_price", width: 100, align: "right", render: v => num(v) },
    { title: "最高价", dataIndex: "highest_price", width: 100, align: "right", render: v => num(v) },
    { title: "差额", dataIndex: "spread_amount", width: 100, align: "right", render: v => num(v) },
    { title: "差异百分比", dataIndex: "spread_pct", width: 120, align: "right", render: pct },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>工厂供应链管理分析</Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="当前页面只做工厂报价数据的计算、对比和风险提示，不自动推荐工厂，也不会修改选用工厂。国内和海外报价按 quote_type 分开分析。"
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="全部年份" allowClear options={YEAR_OPTIONS} value={year} onChange={setYear} style={{ width: 120 }} />
          <Select options={QUOTE_TYPE_OPTIONS} value={quoteType} onChange={setQuoteType} style={{ width: 120 }} />
          <Select placeholder="全部轮次" allowClear options={ROUND_OPTIONS} value={quoteRound} onChange={setQuoteRound} style={{ width: 120 }} />
          <Input placeholder="工厂名" allowClear value={factoryName} onChange={e => setFactoryName(e.target.value)} style={{ width: 140 }} />
          <Input placeholder="客户代码" allowClear value={customerCode} onChange={e => setCustomerCode(e.target.value)} style={{ width: 130 }} />
          <Input placeholder="所属小组" allowClear value={groupName} onChange={e => setGroupName(e.target.value)} style={{ width: 130 }} />
          <Input placeholder="负责业务员" allowClear value={responsibleSales} onChange={e => setResponsibleSales(e.target.value)} style={{ width: 130 }} />
          <RangePicker
            value={dateRange}
            onChange={dates => setDateRange(dates ? [dates[0], dates[1]] : [null, null])}
            placeholder={["询单日期起", "询单日期止"]}
          />
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>参与工厂数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.factory_count ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>报价记录数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.quote_count ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>有效报价数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.valid_quote_count ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>涉及询单数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.inquiry_count ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>可比较组数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.comparable_group_count ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>不可比较组数</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#fa8c16" }}>{data?.summary.incomparable_group_count ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>被选用次数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.selected_quote_count ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>平均价差比例</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{pct(data?.summary.avg_spread_pct)}</div></Card></Col>
      </Row>

      {(data?.risk_signals ?? []).length > 0 ? (
        <Space direction="vertical" style={{ width: "100%", marginBottom: 16 }}>
          {(data?.risk_signals ?? []).map(signal => (
            <Alert
              key={signal.title}
              type={signal.level === "error" ? "error" : signal.level === "warning" ? "warning" : "info"}
              showIcon
              message={signal.title}
              description={signal.description}
            />
          ))}
        </Space>
      ) : null}

      <Card size="small" title="工厂价格竞争力排行" style={{ marginBottom: 16 }}>
        <Table<FactorySupplyFactoryRow>
          rowKey="factory_name"
          size="small"
          columns={factoryColumns}
          dataSource={data?.by_factory ?? []}
          loading={isFetching}
          scroll={{ x: 1500 }}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Row gutter={16}>
        <Col span={14}>
          <Card size="small" title="询单报价差异较大的组">
            <Table<FactorySupplySpreadRow>
              rowKey={row => `${row.inquiry_id}-${row.quote_round}-${row.quote_type}`}
              size="small"
              columns={spreadColumns}
              dataSource={data?.price_spread_top ?? []}
              loading={isFetching}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card size="small" title="字段缺口与后续可做项">
            <Descriptions size="small" column={1} bordered>
              {(data?.field_gaps ?? []).map(gap => (
                <Descriptions.Item
                  key={gap.field}
                  label={<Space><Tag color={gap.status.includes("缺失") ? "orange" : "blue"}>{gap.status}</Tag>{gap.field}</Space>}
                >
                  {gap.note}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
