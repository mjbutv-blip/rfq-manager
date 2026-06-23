/**
 * 报价资料分析总览（统一入口）
 *
 * 只做汇总、跳转和待处理事项入口，不重复六个细分分析页面的完整表格，也不
 * 重新发明一套统计口径——所有数字都来自后端直接复用 Step 4-9 六个分析接口
 * 本体函数的返回结果。
 */

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Alert, Button, Card, Col, DatePicker, Input, Progress, Row, Select,
  Space, Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import type { Dayjs } from "dayjs"

import { fetchQuoteAnalysisOverview } from "@/api/analytics"
import CreateTaskButton from "@/components/CreateTaskButton"
import type {
  KeyGap, OverviewFilter, OverviewPriorityItem, PriorityLevel,
} from "@/types/analytics"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const YEAR_OPTIONS = [2026, 2025, 2024, 2023].map(y => ({ label: String(y), value: y }))

const LEVEL_COLOR: Record<PriorityLevel, string> = { high: "red", medium: "orange", low: "green" }
const LEVEL_LABEL: Record<PriorityLevel, string> = { high: "高", medium: "中", low: "低" }

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export default function QuoteAnalysisOverviewPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState<number | undefined>(undefined)
  const [groupName, setGroupName] = useState("")
  const [responsibleSales, setResponsibleSales] = useState("")
  const [customerCode, setCustomerCode] = useState("")
  const [productCategory, setProductCategory] = useState("")
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])

  const filter: OverviewFilter = {
    year,
    group_name: groupName || undefined,
    responsible_sales: responsibleSales || undefined,
    customer_code: customerCode || undefined,
    product_category: productCategory || undefined,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["quote-analysis-overview", filter],
    queryFn: () => fetchQuoteAnalysisOverview(filter),
  })

  const handleReset = () => {
    setYear(undefined); setGroupName(""); setResponsibleSales("")
    setCustomerCode(""); setProductCategory(""); setDateRange([null, null])
  }

  // 跳转细分页面时尽量保留当前筛选条件（字段名与各子分析页面一致）
  const goToModule = (targetModule: string) => {
    const params = new URLSearchParams()
    if (year) params.set("year", String(year))
    if (groupName) params.set("group_name", groupName)
    if (responsibleSales) params.set("responsible_sales", responsibleSales)
    if (customerCode) params.set("customer_code", customerCode)
    if (productCategory) params.set("product_category", productCategory)
    if (dateRange[0]) params.set("start_date", dateRange[0].format("YYYY-MM-DD"))
    if (dateRange[1]) params.set("end_date", dateRange[1].format("YYYY-MM-DD"))
    const qs = params.toString()
    navigate(qs ? `${targetModule}?${qs}` : targetModule)
  }

  const gapColumns: ColumnsType<KeyGap> = [
    { title: "字段", dataIndex: "field_label", width: 140 },
    { title: "覆盖率", dataIndex: "coverage_rate", width: 180,
      render: (v: number) => (
        <Space size={6}><Progress percent={Math.round(v * 1000) / 10} size="small" style={{ width: 100 }} showInfo={false} /><Text style={{ fontSize: 12 }}>{pct(v)}</Text></Space>
      ) },
    { title: "缺失数量", dataIndex: "missing_count", width: 90, align: "right" },
    { title: "优先级", dataIndex: "priority_level", width: 90,
      render: (v: PriorityLevel) => <Tag color={LEVEL_COLOR[v]}>{LEVEL_LABEL[v]}</Tag> },
    { title: "操作", key: "action", width: 110,
      render: (_: unknown, r: KeyGap) => (
        <Button size="small" onClick={() => goToModule(r.target_module)}>查看详情</Button>
      ) },
  ]

  const priorityColumns: ColumnsType<OverviewPriorityItem> = [
    { title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: OverviewPriorityItem) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a> },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 130, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "款号", dataIndex: "style_no", width: 90, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "缺失字段", dataIndex: "missing_fields", width: 220,
      render: (fields: string[]) => fields.length
        ? <Space size={4} wrap>{fields.map(f => <Tag key={f} color="orange">{f}</Tag>)}</Space>
        : <Text type="secondary">—</Text> },
    { title: "风险提示", dataIndex: "risk_hint", width: 240, render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v || "—"}</Text> },
    { title: "负责业务员", dataIndex: "responsible_sales", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "询单日期", dataIndex: "inquiry_date", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "操作", key: "action", width: 190, fixed: "right",
      render: (_: unknown, r: OverviewPriorityItem) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}?item_id=${r.item_id}`)}>去补录</Button>
          <CreateTaskButton itemId={r.item_id} sourceModule="quote-analysis-overview" />
        </Space>
      ) },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>报价资料分析总览</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="全部年份" allowClear options={YEAR_OPTIONS}
            value={year} onChange={setYear} style={{ width: 120 }} />
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
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>款式总数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.total_style_items ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>整体完整率</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{pct(data?.summary.overall_completeness_rate ?? 0)}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>待补录款式数</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#ff4d4f" }}>{data?.summary.items_needing_completion ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>客户数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.customer_count ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>品类数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.category_count ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>工艺标签种类</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.unique_process_tags ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>标准化尺码种类</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.unique_size_codes ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>已填写填报人</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#52c41a" }}>{data?.summary.items_with_quote_preparer ?? 0}</div>
        </Card></Col>
      </Row>

      <Card size="small" title="当前最需要补齐的资料" style={{ marginBottom: 16 }}>
        <Table<KeyGap>
          rowKey="field_key" size="small" columns={gapColumns}
          dataSource={data?.key_gaps ?? []} loading={isFetching}
          pagination={false}
        />
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="客户品类亮点" extra={<a onClick={() => goToModule("/customer-category-styles")}>查看完整分析</a>} style={{ marginBottom: 16 }}>
            {(data?.top_customer_categories ?? []).length === 0
              ? <Text type="secondary">暂无数据</Text>
              : (data?.top_customer_categories ?? []).map(c => (
                <div key={`${c.customer_code}-${c.customer_short_name}`} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <Text>{c.customer_short_name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    核心品类 {c.top_category ?? "—"}（{c.style_count} 款，{c.top_category_share != null ? pct(c.top_category_share) : "—"}）
                  </Text>
                </div>
              ))}
          </Card>
          <Card size="small" title="工艺亮点" extra={<a onClick={() => goToModule("/process-analysis")}>查看完整分析</a>} style={{ marginBottom: 16 }}>
            {(data?.top_processes ?? []).length === 0
              ? <Text type="secondary">暂无数据</Text>
              : (data?.top_processes ?? []).map(p => (
                <div key={p.process_tag} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <Space size={6}><Text>{p.process_tag}</Text><Tag color={p.is_special ? "red" : "default"}>{p.is_special ? "特殊" : "常规"}</Tag></Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>应用 {p.application_count} 次 · {p.customer_count} 个客户</Text>
                </div>
              ))}
          </Card>
          <Card size="small" title="尺码亮点" extra={<a onClick={() => goToModule("/size-analysis")}>查看完整分析</a>}>
            {(data?.top_sizes ?? []).length === 0
              ? <Text type="secondary">暂无数据</Text>
              : (data?.top_sizes ?? []).map(s => (
                <div key={s.size_code} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <Space size={6}><Text>{s.size_code}</Text><Tag color={s.is_special_size ? "red" : "default"}>{s.is_special_size ? "特殊" : "常规"}</Tag></Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>应用 {s.application_count} 次 · {s.customer_count} 个客户</Text>
                </div>
              ))}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="数量结构亮点" extra={<a onClick={() => goToModule("/quantity-analysis")}>查看完整分析</a>} style={{ marginBottom: 16 }}>
            {(data?.quantity_distribution_highlights ?? []).map((q, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <Text type="secondary">最常见数量区间</Text><Text>{q.top_quantity_bucket ?? "—"}</Text>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <Text type="secondary">小批量款式数</Text><Text>{q.small_batch_style_count}</Text>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <Text type="secondary">大批量款式数</Text><Text>{q.large_batch_style_count}</Text>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <Text type="secondary">缺数量款式数</Text><Text type="danger">{q.items_without_quantity}</Text>
                </div>
              </div>
            ))}
          </Card>
          <Card size="small" title="填报人亮点" extra={<a onClick={() => goToModule("/quote-preparer-analysis")}>查看完整分析</a>}>
            {(data?.preparer_highlights ?? []).map((p, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <Text type="secondary">已填写填报人款式数</Text><Text>{p.items_with_preparer}</Text>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <Text type="secondary">未填写填报人款式数</Text><Text type="danger">{p.items_without_preparer}</Text>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <Text type="secondary">填报人覆盖率</Text><Text>{pct(p.preparer_coverage_rate)}</Text>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <Text type="secondary">填报款式最多人员</Text>
                  <Text>{p.top_preparer ? `${p.top_preparer}（${p.top_preparer_style_count}）` : "—"}</Text>
                </div>
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      <Card size="small" title="优先处理款式">
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="已按已下单/已报价缺资料、同时缺多项关键资料、有工艺/尺码/数量风险提示、询单时间合并去重排序，仅展示最需要处理的款式"
        />
        <Table<OverviewPriorityItem>
          rowKey="item_id" size="small" columns={priorityColumns}
          dataSource={data?.priority_items ?? []} loading={isFetching}
          pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }} scroll={{ x: 1300 }}
        />
      </Card>
    </div>
  )
}
