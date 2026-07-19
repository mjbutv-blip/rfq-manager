import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Input,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import type { Dayjs } from "dayjs"

import { fetchCustomerConversionAnalysis } from "@/api/analytics"
import type {
  CustomerConversionByCustomer,
  CustomerConversionDetail,
  CustomerConversionFilter,
  CustomerConversionQuoteRound,
} from "@/types/analytics"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(year => ({ label: String(year), value: year }))

function pct(rate: number | null | undefined): string {
  return rate == null ? "—" : `${(rate * 100).toFixed(1)}%`
}

function money(value: number | null | undefined, prefix = "$"): string {
  if (value == null) return "—"
  return `${prefix}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function numberText(value: number | null | undefined, suffix = ""): string {
  if (value == null) return "—"
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`
}

export default function CustomerConversionAnalysisPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState<number | undefined>(undefined)
  const [customerCode, setCustomerCode] = useState("")
  const [groupName, setGroupName] = useState("")
  const [responsibleSales, setResponsibleSales] = useState("")
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])

  const filter: CustomerConversionFilter = {
    year,
    customer_code: customerCode || undefined,
    group_name: groupName || undefined,
    responsible_sales: responsibleSales || undefined,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["customer-conversion-analysis", filter],
    queryFn: () => fetchCustomerConversionAnalysis(filter),
  })

  const handleReset = () => {
    setYear(undefined)
    setCustomerCode("")
    setGroupName("")
    setResponsibleSales("")
    setDateRange([null, null])
  }

  const customerColumns: ColumnsType<CustomerConversionByCustomer> = [
    {
      title: "客户",
      dataIndex: "customer_short_name",
      width: 140,
      render: (value, row) => value || row.customer_code || <Text type="secondary">—</Text>,
    },
    { title: "客户代码", dataIndex: "customer_code", width: 110, render: v => v || <Text type="secondary">—</Text> },
    { title: "询单数", dataIndex: "inquiry_count", width: 90, align: "right" },
    { title: "已报价", dataIndex: "quoted_count", width: 90, align: "right" },
    { title: "报价率", dataIndex: "quote_rate", width: 110, align: "right", render: pct },
    { title: "已下单", dataIndex: "ordered_count", width: 90, align: "right" },
    { title: "转化率", dataIndex: "conversion_rate", width: 110, align: "right", render: pct },
    { title: "目标价达成率", dataIndex: "target_reached_rate", width: 130, align: "right", render: pct },
    { title: "平均报价周期", dataIndex: "avg_quote_cycle_days", width: 130, align: "right", render: v => numberText(v, " 天") },
    { title: "成交贸易额", dataIndex: "trade_amount", width: 130, align: "right", render: v => money(v) },
  ]

  const roundColumns: ColumnsType<CustomerConversionQuoteRound> = [
    { title: "报价轮次", dataIndex: "label", width: 120 },
    { title: "询单数", dataIndex: "inquiry_count", width: 100, align: "right" },
    { title: "已下单", dataIndex: "ordered_count", width: 100, align: "right" },
    { title: "转化率", dataIndex: "conversion_rate", width: 120, align: "right", render: pct },
  ]

  const detailColumns: ColumnsType<CustomerConversionDetail> = [
    {
      title: "询单号",
      dataIndex: "inquiry_no",
      width: 130,
      fixed: "left",
      render: (value: string, row) => <a onClick={() => navigate(`/inquiry/${row.inquiry_id}/journey`)}>{value}</a>,
    },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: (v, r) => v || r.customer_code || <Text type="secondary">—</Text> },
    { title: "报价状态", dataIndex: "quote_status", width: 100, render: v => v || <Text type="secondary">—</Text> },
    {
      title: "订单状态",
      dataIndex: "order_status",
      width: 100,
      render: v => v ? <Tag color={["下单", "已下单", "确认转单"].includes(v) ? "green" : "default"}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    { title: "询单日期", dataIndex: "inquiry_date", width: 110, render: v => v || <Text type="secondary">—</Text> },
    { title: "下单日期", dataIndex: "order_date", width: 110, render: v => v || <Text type="secondary">—</Text> },
    { title: "报价轮次数", dataIndex: "quote_round_count", width: 110, align: "right" },
    { title: "报价周期", dataIndex: "quote_cycle_days", width: 110, align: "right", render: v => numberText(v, " 天") },
    { title: "客户目标价", dataIndex: "customer_target_price_usd", width: 120, align: "right", render: v => money(v) },
    { title: "最终报价", dataIndex: "final_quote_usd", width: 120, align: "right", render: v => money(v) },
    {
      title: "目标价达成",
      dataIndex: "target_reached",
      width: 120,
      render: v => v == null ? <Text type="secondary">—</Text> : <Tag color={v ? "green" : "orange"}>{v ? "达成" : "未达成"}</Tag>,
    },
    { title: "贸易额", dataIndex: "trade_amount", width: 130, align: "right", render: v => money(v) },
  ]

  const cycle = data?.quote_cycle_distribution
  const cycleTotal = cycle ? cycle.within_3_days + cycle.within_7_days + cycle.over_7_days + cycle.unknown : 0

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>客户与订单转化分析</Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="当前页面直接读取真实询单与国内报价数据，先做转化、报价轮次、报价周期和目标价达成分析。未下单原因等字段未标准化前只提示字段缺口，不做猜测。"
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="全部年份" allowClear options={YEAR_OPTIONS} value={year} onChange={setYear} style={{ width: 120 }} />
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
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>总询单数</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.total_inquiries ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>已报价询单</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.quoted_inquiries ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>已下单询单</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.ordered_inquiries ?? 0}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>报价率</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{pct(data?.summary.quote_rate)}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>订单转化率</Text><div style={{ fontSize: 20, fontWeight: 600, color: "#1677ff" }}>{pct(data?.summary.conversion_rate)}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>平均报价周期</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{numberText(data?.summary.avg_quote_cycle_days, " 天")}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>目标价达成率</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{pct(data?.summary.target_reached_rate)}</div></Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}><Text type="secondary" style={{ fontSize: 12 }}>成交贸易额</Text><div style={{ fontSize: 20, fontWeight: 600 }}>{money(data?.summary.total_trade_amount)}</div></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card size="small" title="客户转化排行">
            <Table<CustomerConversionByCustomer>
              rowKey={row => `${row.customer_code || row.customer_short_name || "unknown"}`}
              size="small"
              columns={customerColumns}
              dataSource={data?.by_customer ?? []}
              loading={isFetching}
              scroll={{ x: 1200 }}
              pagination={{ pageSize: 8 }}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card size="small" title="报价次数与下单关系" style={{ marginBottom: 16 }}>
            <Table<CustomerConversionQuoteRound>
              rowKey="quote_round_count"
              size="small"
              columns={roundColumns}
              dataSource={data?.quote_round_relation ?? []}
              loading={isFetching}
              pagination={false}
            />
          </Card>
          <Card size="small" title="报价周期分布">
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="3 天内">{cycle?.within_3_days ?? 0}</Descriptions.Item>
              <Descriptions.Item label="4-7 天">{cycle?.within_7_days ?? 0}</Descriptions.Item>
              <Descriptions.Item label="超过 7 天">{cycle?.over_7_days ?? 0}</Descriptions.Item>
              <Descriptions.Item label="无法计算">{cycle?.unknown ?? 0}</Descriptions.Item>
            </Descriptions>
            <Progress
              style={{ marginTop: 12 }}
              percent={cycleTotal ? Math.round(((cycle?.within_3_days ?? 0) / cycleTotal) * 1000) / 10 : 0}
              size="small"
              format={value => `3天内 ${value}%`}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="客户目标价达成">
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="有目标价样本">{data?.target_price.sample_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="达成数量">{data?.target_price.reached_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="达成率">{pct(data?.target_price.reached_rate)}</Descriptions.Item>
              <Descriptions.Item label="平均目标价差">{money(data?.target_price.avg_target_gap_cny, "¥")}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="字段缺口">
            <Space direction="vertical" style={{ width: "100%" }}>
              {(data?.field_gaps ?? []).map(gap => (
                <Alert
                  key={gap.field}
                  type="warning"
                  showIcon
                  message={<Space><Tag color="orange">{gap.status}</Tag><Text>{gap.field}</Text></Space>}
                  description={gap.note}
                />
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="询单明细">
        <Table<CustomerConversionDetail>
          rowKey="inquiry_id"
          size="small"
          columns={detailColumns}
          dataSource={data?.details ?? []}
          loading={isFetching}
          scroll={{ x: 1500 }}
          pagination={{ pageSize: 20 }}
        />
      </Card>
    </div>
  )
}
