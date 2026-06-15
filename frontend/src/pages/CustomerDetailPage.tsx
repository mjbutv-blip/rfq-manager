import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import {
  Alert, Badge, Button, Card, Col, Descriptions, Form, Input, message,
  Row, Select, Statistic, Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { ArrowLeftOutlined, EditOutlined, SaveOutlined } from "@ant-design/icons"

import { fetchCustomer, fetchCustomerInquiries, updateCustomer } from "@/api/customers"
import { fetchCustomerSamples } from "@/api/samples"
import { fetchCustomerProductions } from "@/api/productions"
import { PRODUCTION_STATUS_COLOR, PRODUCTION_STATUS_LABEL } from "@/types/production"
import { FINAL_RESULT_COLOR, FINAL_RESULT_LABEL, SAMPLE_STATUS_COLOR, SAMPLE_STATUS_LABEL, SAMPLE_TYPE_LABEL } from "@/types/sample"
import type { CustomerDetail, CustomerUpdate } from "@/types/customer"
import { CUSTOMER_LEVEL_COLOR, CUSTOMER_LEVEL_LABEL, CUSTOMER_LEVEL_OPTIONS } from "@/types/customer"
import type { InquiryItem } from "@/types/inquiry"
import { ORDER_STATUS_COLOR, ORDER_STATUS_OPTIONS, QUOTE_STATUS_OPTIONS } from "@/types/inquiry"
import { useCurrentUser } from "@/contexts/UserContext"

const { Text, Title } = Typography
const { TextArea } = Input

function money(v: number | null | undefined) {
  if (v == null) return "—"
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

// ── 分析小卡片 ────────────────────────────────────────────────────────────────

function TopList({ title, items }: { title: string; items: { name: string; count: number }[] }) {
  if (!items?.length) return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
      <div style={{ marginTop: 4 }}><Text type="secondary">暂无数据</Text></div>
    </div>
  )
  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
      {items.map((it, i) => (
        <div key={it.name} style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <Text>{i + 1}. {it.name}</Text>
          <Text type="secondary">{it.count} 单</Text>
        </div>
      ))}
    </div>
  )
}

function MonthPattern({
  inquiryMonths,
  orderMonths,
}: {
  inquiryMonths: { month: string; count: number }[]
  orderMonths: { month: string; count: number }[]
}) {
  const allMonths = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"]
  const iqMap = Object.fromEntries(inquiryMonths.map(m => [m.month, m.count]))
  const odMap = Object.fromEntries(orderMonths.map(m => [m.month, m.count]))
  const maxIq = Math.max(1, ...inquiryMonths.map(m => m.count))
  const maxOd = Math.max(1, ...orderMonths.map(m => m.count))

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>询单 / 下单月份分布</Text>
      <div style={{ display: "flex", gap: 2, marginTop: 6, alignItems: "flex-end" }}>
        {allMonths.map((label, idx) => {
          const monthKey = `${idx + 1}`
          const iq = iqMap[monthKey] ?? 0
          const od = odMap[monthKey] ?? 0
          return (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "center" }}>
                {iq > 0 && (
                  <div
                    title={`询单 ${iq}`}
                    style={{
                      width: "100%", height: Math.max(4, (iq / maxIq) * 40),
                      background: "#1677ff", borderRadius: 2, opacity: 0.7,
                    }}
                  />
                )}
                {od > 0 && (
                  <div
                    title={`下单 ${od}`}
                    style={{
                      width: "100%", height: Math.max(4, (od / maxOd) * 24),
                      background: "#52c41a", borderRadius: 2, opacity: 0.8,
                    }}
                  />
                )}
                {iq === 0 && od === 0 && (
                  <div style={{ height: 4, width: "100%", background: "#f0f0f0", borderRadius: 2 }} />
                )}
              </div>
              <div style={{ fontSize: 9, color: "#999", marginTop: 2 }}>{label.replace("月","")}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "#1677ff" }}>■ 询单</span>
        <span style={{ fontSize: 11, color: "#52c41a" }}>■ 下单</span>
      </div>
    </div>
  )
}

// ── 标签/备注编辑面板 ──────────────────────────────────────────────────────────

function ProfileEditor({ detail, canEdit }: { detail: CustomerDetail; canEdit: boolean }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form] = Form.useForm<CustomerUpdate>()

  const mutation = useMutation({
    mutationFn: (body: CustomerUpdate) => updateCustomer(detail.customer_code, body),
    onSuccess: () => {
      message.success("客户档案已更新")
      qc.invalidateQueries({ queryKey: ["customer", detail.customer_code] })
      qc.invalidateQueries({ queryKey: ["customers"] })
      setEditing(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(msg ?? "更新失败")
    },
  })

  const handleEdit = () => {
    form.setFieldsValue({
      customer_level:   detail.customer_level ?? undefined,
      customer_tags:    detail.customer_tags ?? [],
      payment_terms:    detail.payment_terms ?? undefined,
      price_preference: detail.price_preference ?? undefined,
      follow_up_note:   detail.follow_up_note ?? undefined,
    })
    setEditing(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    mutation.mutate(values)
  }

  if (!editing) {
    return (
      <Card
        size="small"
        title="档案信息"
        extra={canEdit && (
          <Button size="small" icon={<EditOutlined />} onClick={handleEdit}>编辑</Button>
        )}
      >
        <Row gutter={16}>
          <Col span={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>客户等级</Text>
            <div style={{ marginTop: 2 }}>
              {detail.customer_level
                ? <Tag color={CUSTOMER_LEVEL_COLOR[detail.customer_level]}>{CUSTOMER_LEVEL_LABEL[detail.customer_level] ?? detail.customer_level}</Tag>
                : <Text type="secondary">—</Text>}
            </div>
          </Col>
          <Col span={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>付款方式</Text>
            <div style={{ marginTop: 2 }}>{detail.payment_terms ?? <Text type="secondary">—</Text>}</div>
          </Col>
          <Col span={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>价格偏好</Text>
            <div style={{ marginTop: 2 }}>{detail.price_preference ?? <Text type="secondary">—</Text>}</div>
          </Col>
          <Col span={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>标签</Text>
            <div style={{ marginTop: 2 }}>
              {detail.customer_tags?.length
                ? detail.customer_tags.map(t => <Tag key={t}>{t}</Tag>)
                : <Text type="secondary">—</Text>}
            </div>
          </Col>
          {detail.follow_up_note && (
            <Col span={24} style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>跟进备注</Text>
              <div style={{ marginTop: 2, whiteSpace: "pre-wrap" }}>{detail.follow_up_note}</div>
            </Col>
          )}
        </Row>
      </Card>
    )
  }

  return (
    <Card
      size="small"
      title="编辑档案信息"
      extra={
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="small" onClick={() => setEditing(false)}>取消</Button>
          <Button
            size="small" type="primary" icon={<SaveOutlined />}
            onClick={handleSave} loading={mutation.isPending}
          >
            保存
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" size="small">
        <Row gutter={12}>
          <Col span={6}>
            <Form.Item name="customer_level" label="客户等级">
              <Select
                options={[{ label: "—", value: null }, ...CUSTOMER_LEVEL_OPTIONS]}
                placeholder="选择等级"
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="payment_terms" label="付款方式">
              <Input placeholder="如 NET30" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="price_preference" label="价格偏好">
              <Input placeholder="如 低价优先" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="customer_tags" label="标签（可多选）">
              <Select
                mode="tags"
                placeholder="输入后按回车添加"
                style={{ width: "100%" }}
                options={[
                  { label: "优质客户", value: "优质客户" },
                  { label: "新客户",   value: "新客户" },
                  { label: "老客户",   value: "老客户" },
                  { label: "大客户",   value: "大客户" },
                  { label: "潜力客户", value: "潜力客户" },
                  { label: "高风险",   value: "高风险" },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="follow_up_note" label="跟进备注">
              <TextArea rows={3} placeholder="填写客户跟进记录、特殊要求等备注信息" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  )
}

// ── 询单历史表格 ───────────────────────────────────────────────────────────────

function InquiryHistory({ customerCode }: { customerCode: string }) {
  const navigate = useNavigate()
  const [page, setPage]               = useState(1)
  const [filterOrderStatus, setOS]    = useState("")
  const [filterQuoteStatus, setQS]    = useState("")
  const [filterYear, setYear]         = useState<number | undefined>()
  const [filterCategory, setCat]      = useState("")

  const params = {
    order_status:     filterOrderStatus || undefined,
    quote_status:     filterQuoteStatus || undefined,
    year:             filterYear,
    product_category: filterCategory || undefined,
    page,
    page_size: 20,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["customer-inquiries", customerCode, params],
    queryFn: () => fetchCustomerInquiries(customerCode, params),
    placeholderData: prev => prev,
  })

  const columns: ColumnsType<InquiryItem> = [
    {
      title: "询单号",
      dataIndex: "inquiry_no",
      width: 130,
      render: (v: string, r: InquiryItem) => (
        <a onClick={() => navigate(`/inquiry/${r.id}`)}>{v}</a>
      ),
    },
    { title: "询单日期", dataIndex: "inquiry_date", width: 90 },
    {
      title: "报价状态",
      dataIndex: "quote_status",
      width: 75,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "下单状态",
      dataIndex: "order_status",
      width: 80,
      render: (v: string | null) => v
        ? <Tag color={ORDER_STATUS_COLOR[v] ?? "default"}>{v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "产品大类",
      dataIndex: "product_category",
      width: 80,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "系列",
      dataIndex: "series_name",
      width: 80,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "数量",
      dataIndex: "order_quantity",
      width: 65,
      align: "right" as const,
      render: (v: number | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "贸易额",
      dataIndex: "trade_amount",
      width: 95,
      align: "right" as const,
      render: (v: number | null) => v != null
        ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : <Text type="secondary">—</Text>,
    },
    {
      title: "负责业务员",
      dataIndex: "responsible_sales",
      width: 90,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "下单日期",
      dataIndex: "order_date",
      width: 90,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
  ]

  const years = [2022, 2023, 2024, 2025, 2026]

  return (
    <Card size="small" title={`询单历史（共 ${data?.total ?? "…"} 条）`} style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Select
          value={filterOrderStatus} onChange={v => { setOS(v); setPage(1) }}
          options={ORDER_STATUS_OPTIONS} style={{ width: 110 }} placeholder="下单状态"
        />
        <Select
          value={filterQuoteStatus} onChange={v => { setQS(v); setPage(1) }}
          options={QUOTE_STATUS_OPTIONS} style={{ width: 110 }} placeholder="报价状态"
        />
        <Select
          value={filterYear} onChange={v => { setYear(v); setPage(1) }}
          allowClear placeholder="年份" style={{ width: 80 }}
          options={years.map(y => ({ label: String(y), value: y }))}
        />
        <Input
          value={filterCategory} onChange={e => { setCat(e.target.value); setPage(1) }}
          placeholder="产品大类" allowClear style={{ width: 110 }}
        />
        <Button size="small" onClick={() => { setOS(""); setQS(""); setYear(undefined); setCat(""); setPage(1) }}>
          重置
        </Button>
      </div>
      <Table<InquiryItem>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        size="small"
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: p => setPage(p),
        }}
      />
      <style>{`a { cursor: pointer; }`}</style>
    </Card>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const { customerCode } = useParams<{ customerCode: string }>()
  const navigate = useNavigate()
  const user = useCurrentUser()

  const code = customerCode ? decodeURIComponent(customerCode) : ""

  const { data: detail, isPending, isError } = useQuery<CustomerDetail>({
    queryKey: ["customer", code],
    queryFn: () => fetchCustomer(code),
    enabled: !!code,
  })

  if (isPending) return <div style={{ padding: 32, textAlign: "center" }}>加载中…</div>
  if (isError || !detail) return (
    <div style={{ padding: 24 }}>
      <Alert type="error" message="客户档案加载失败" showIcon />
      <Button icon={<ArrowLeftOutlined />} style={{ marginTop: 12 }} onClick={() => navigate("/customers")}>
        返回列表
      </Button>
    </div>
  )

  const s = detail.stats
  const canEdit = user.role !== "viewer"

  return (
    <div style={{ padding: 16 }}>

      {/* 返回 + 标题 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/customers")}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>
          {detail.customer_short_name ?? detail.customer_code}
        </Title>
        {detail.customer_level && (
          <Tag color={CUSTOMER_LEVEL_COLOR[detail.customer_level]}>
            {CUSTOMER_LEVEL_LABEL[detail.customer_level] ?? detail.customer_level}
          </Tag>
        )}
        <Badge
          status={s.is_active ? "success" : "default"}
          text={s.is_active ? "活跃" : "沉默"}
        />
      </div>

      {/* 客户基础信息 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Descriptions column={{ xs: 2, sm: 3, md: 6 }} size="small">
          <Descriptions.Item label="客户代码">
            <Text code>{detail.customer_code}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="客户全名">
            {detail.customer_name ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="国家">
            {detail.country ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="地区">
            {detail.region ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="客户类别">
            {detail.customer_category ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="所属小组">
            {detail.group_name ? <Tag>{detail.group_name}</Tag> : <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="负责业务员">
            {detail.responsible_sales ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* KPI 数据卡 */}
      <Row gutter={10} style={{ marginBottom: 12 }}>
        <Col span={5}>
          <Card size="small">
            <Statistic title="总询单数" value={s.total_inquiry_count} suffix="单" />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="总下单数" value={s.total_order_count} suffix="单" />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="转化率"
              value={s.conversion_rate ?? 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: (s.conversion_rate ?? 0) >= 50 ? "#52c41a" : "#faad14" }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="总贸易额 (USD)" value={money(s.total_trade_amount)} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="平均客单价 (USD)" value={money(s.avg_order_amount)} />
          </Card>
        </Col>
      </Row>

      {/* 分析区 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={5}>
          <Card size="small" style={{ height: "100%" }}>
            <TopList title="主要产品大类 (Top 3)" items={s.top_categories} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ height: "100%" }}>
            <TopList title="主要产品系列 (Top 3)" items={s.top_series} />
          </Card>
        </Col>
        <Col span={10}>
          <Card size="small" style={{ height: "100%" }}>
            <MonthPattern inquiryMonths={s.primary_inquiry_months} orderMonths={s.primary_order_months} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ height: "100%" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>主要季节</Text>
            <div style={{ marginTop: 4 }}>
              {s.primary_seasons?.length
                ? s.primary_seasons.map(ps => (
                    <div key={ps.season} style={{ display: "flex", justifyContent: "space-between" }}>
                      <Text>{ps.season}</Text>
                      <Text type="secondary">{ps.count}</Text>
                    </div>
                  ))
                : <Text type="secondary">—</Text>}
            </div>
            {s.avg_days_to_order != null && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>平均下单周期</Text>
                <div>
                  <Text strong>{s.avg_days_to_order.toFixed(0)}</Text>
                  <Text type="secondary"> 天</Text>
                </div>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>最近询单</Text>
              <div><Text>{s.last_inquiry_date ?? "—"}</Text></div>
            </div>
            <div style={{ marginTop: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>最近下单</Text>
              <div><Text>{s.last_order_date ?? "—"}</Text></div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 档案编辑区 */}
      <ProfileEditor detail={detail} canEdit={canEdit} />

      {/* 询单历史 */}
      <InquiryHistory customerCode={code} />

      {/* 打样记录 */}
      <CustomerSampleSection customerCode={code} />

      {/* 生产跟单 */}
      <CustomerProductionSection customerCode={code} />

    </div>
  )
}

function CustomerSampleSection({ customerCode }: { customerCode: string }) {
  const navigate = useNavigate()
  const { data: samples = [], isFetching } = useQuery({
    queryKey: ["customer-samples", customerCode],
    queryFn: () => fetchCustomerSamples(customerCode),
  })

  const approved = samples.filter(s => s.final_result === "approved" || s.final_result === "converted_to_order").length
  const terminal = samples.filter(s => ["approved", "rejected", "cancelled", "converted_to_order"].includes(s.final_result)).length
  const successRate = terminal > 0 ? ((approved / terminal) * 100).toFixed(1) : null
  const companyFee = samples.reduce((sum, s) => sum + (s.fee_paid_by === "company" && s.sample_fee ? Number(s.sample_fee) : 0), 0)

  const columns = [
    { title: "打样编号", dataIndex: "sample_no", width: 90, render: (v: string, r: { id: string }) => <a onClick={() => navigate(`/samples/${r.id}`)}>{v}</a> },
    { title: "打样类型", dataIndex: "sample_type", width: 70, render: (v: string | null) => v ? SAMPLE_TYPE_LABEL[v] ?? v : "—" },
    { title: "打样状态", dataIndex: "sample_status", width: 90, render: (v: string) => <Tag color={SAMPLE_STATUS_COLOR[v] ?? "default"}>{SAMPLE_STATUS_LABEL[v] ?? v}</Tag> },
    { title: "工厂", dataIndex: "factory_name", width: 120, ellipsis: true },
    { title: "询单号", dataIndex: "inquiry_no", width: 110, ellipsis: true },
    { title: "品名", dataIndex: "product_name", width: 110, ellipsis: true },
    { title: "工厂交期", dataIndex: "factory_due_date", width: 90 },
    { title: "最终结果", dataIndex: "final_result", width: 80, render: (v: string) => v && v !== "pending" ? <Tag color={FINAL_RESULT_COLOR[v] ?? "default"}>{FINAL_RESULT_LABEL[v] ?? v}</Tag> : <Text type="secondary">待定</Text> },
    { title: "操作", key: "action", width: 60, render: (_: unknown, r: { id: string }) => <Button size="small" type="link" onClick={() => navigate(`/samples/${r.id}`)}>详情</Button> },
  ]

  return (
    <Card
      size="small"
      title={`打样记录（${samples.length}）`}
      style={{ marginTop: 16 }}
      loading={isFetching}
      extra={
        <span style={{ fontSize: 12, color: "#666" }}>
          成功率：{successRate != null ? `${successRate}%` : "—"}
          &nbsp;&nbsp;公司垫付：¥{companyFee.toFixed(2)}
        </span>
      }
    >
      {samples.length === 0
        ? <div style={{ textAlign: "center", padding: "16px 0", color: "#999" }}>暂无打样记录</div>
        : <Table rowKey="id" columns={columns} dataSource={samples} size="small" pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 800 }} />
      }
    </Card>
  )
}

function CustomerProductionSection({ customerCode }: { customerCode: string }) {
  const navigate = useNavigate()
  const { data: records = [], isFetching } = useQuery({
    queryKey: ["customer-productions", customerCode],
    queryFn: () => fetchCustomerProductions(customerCode),
  })

  const today = new Date().toISOString().split("T")[0]
  const overdue = records.filter(r =>
    r.delivery_date && r.delivery_date < today &&
    !["completed", "shipped", "cancelled"].includes(r.production_status)
  ).length

  const columns = [
    { title: "跟单编号", dataIndex: "production_no", width: 90, render: (v: string, r: { id: string }) => <a onClick={() => navigate(`/productions/${r.id}`)}>{v}</a> },
    { title: "生产状态", dataIndex: "production_status", width: 100, render: (v: string) => <Tag color={PRODUCTION_STATUS_COLOR[v] ?? "default"}>{PRODUCTION_STATUS_LABEL[v] ?? v}</Tag> },
    { title: "品名", dataIndex: "product_name", width: 120, ellipsis: true },
    { title: "工厂", dataIndex: "factory_name", width: 110, ellipsis: true },
    { title: "订单数量", dataIndex: "order_quantity", width: 75, align: "right" as const },
    { title: "交期", dataIndex: "delivery_date", width: 90 },
    { title: "操作", key: "action", width: 60, render: (_: unknown, r: { id: string }) => <Button size="small" type="link" onClick={() => navigate(`/productions/${r.id}`)}>详情</Button> },
  ]

  return (
    <Card size="small" title={`生产跟单（${records.length}）`} style={{ marginTop: 16 }} loading={isFetching}
      extra={<span style={{ fontSize: 12, color: "#666" }}>逾期：<Text style={{ color: overdue > 0 ? "#ff4d4f" : undefined }}>{overdue}</Text></span>}>
      {records.length === 0
        ? <div style={{ textAlign: "center", padding: "16px 0", color: "#999" }}>暂无生产跟单</div>
        : <Table rowKey="id" columns={columns} dataSource={records} size="small" pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 700 }} />
      }
    </Card>
  )
}
