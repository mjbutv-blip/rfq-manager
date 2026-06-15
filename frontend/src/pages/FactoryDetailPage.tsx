import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import {
  Alert, Button, Card, Col, DatePicker, Descriptions,
  Form, Input, InputNumber, message, Modal, Popconfirm,
  Row, Select, Statistic, Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import {
  ArrowLeftOutlined, DeleteOutlined, EditOutlined,
  PlusOutlined, SaveOutlined,
} from "@ant-design/icons"
import {
  createQuoteRecord, deleteQuoteRecord,
  fetchFactory, fetchFactoryQuoteRecords, updateFactory,
} from "@/api/factories"
import { fetchFactorySamples } from "@/api/samples"
import { fetchFactoryProductions } from "@/api/productions"
import { PRODUCTION_STATUS_COLOR, PRODUCTION_STATUS_LABEL } from "@/types/production"
import { FINAL_RESULT_COLOR, FINAL_RESULT_LABEL, SAMPLE_STATUS_COLOR, SAMPLE_STATUS_LABEL, SAMPLE_TYPE_LABEL } from "@/types/sample"
import type { FactoryDetail, FactoryQuoteRecord, FactoryUpdate } from "@/types/factory"
import {
  COOPERATION_STATUS_COLOR, COOPERATION_STATUS_LABEL, COOPERATION_STATUS_OPTIONS,
  PRICE_POSITION_LABEL, PRICE_POSITION_OPTIONS,
  RISK_LEVEL_COLOR, RISK_LEVEL_LABEL, RISK_LEVEL_OPTIONS,
} from "@/types/factory"
import { useCurrentUser } from "@/contexts/UserContext"
import { ORDER_STATUS_OPTIONS } from "@/types/inquiry"

const { Text, Title } = Typography
const { TextArea } = Input

function money(v: number | null | undefined) {
  if (v == null) return "—"
  return `¥${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

// ── 工厂信息编辑面板 ──────────────────────────────────────────────────────────

function FactoryEditor({ factory, canEdit }: { factory: FactoryDetail; canEdit: boolean }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form] = Form.useForm<FactoryUpdate>()

  const mutation = useMutation({
    mutationFn: (body: FactoryUpdate) => updateFactory(factory.id, body),
    onSuccess: () => {
      message.success("工厂信息已更新")
      qc.invalidateQueries({ queryKey: ["factory", factory.id] })
      qc.invalidateQueries({ queryKey: ["factories"] })
      setEditing(false)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(msg ?? "更新失败")
    },
  })

  const handleEdit = () => {
    form.setFieldsValue({
      factory_name:          factory.factory_name ?? undefined,
      factory_short_name:    factory.factory_short_name ?? undefined,
      country:               factory.country ?? undefined,
      region:                factory.region ?? undefined,
      contact_person:        factory.contact_person ?? undefined,
      contact_phone:         factory.contact_phone ?? undefined,
      contact_email:         factory.contact_email ?? undefined,
      address:               factory.address ?? undefined,
      main_categories:       factory.main_categories ?? [],
      capability_tags:       factory.capability_tags ?? [],
      certificate_tags:      factory.certificate_tags ?? [],
      price_position:        factory.price_position ?? undefined,
      moq:                   factory.moq ?? undefined,
      normal_lead_time_days: factory.normal_lead_time_days ?? undefined,
      payment_terms:         factory.payment_terms ?? undefined,
      cooperation_status:    factory.cooperation_status ?? undefined,
      risk_level:            factory.risk_level ?? undefined,
      risk_tags:             factory.risk_tags ?? [],
      remark:                factory.remark ?? undefined,
    })
    setEditing(true)
  }

  if (!editing) {
    return (
      <Card
        size="small"
        title="工厂信息"
        extra={canEdit && <Button size="small" icon={<EditOutlined />} onClick={handleEdit}>编辑</Button>}
        style={{ marginBottom: 12 }}
      >
        <Descriptions column={{ xs: 2, sm: 3, md: 4 }} size="small">
          <Descriptions.Item label="工厂代码">
            <Text code>{factory.factory_code}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="工厂全名">
            {factory.factory_name ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="国家">
            {factory.country ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="地区">
            {factory.region ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="联系人">
            {factory.contact_person ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="联系电话">
            {factory.contact_phone ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="邮箱">
            {factory.contact_email ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="付款方式">
            {factory.payment_terms ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="MOQ">
            {factory.moq ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="常规交期">
            {factory.normal_lead_time_days ? `${factory.normal_lead_time_days} 天` : <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="地址" span={2}>
            {factory.address ?? <Text type="secondary">—</Text>}
          </Descriptions.Item>
        </Descriptions>

        <Row gutter={16} style={{ marginTop: 12 }}>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>擅长品类</Text>
            <div style={{ marginTop: 4 }}>
              {factory.main_categories?.length
                ? factory.main_categories.map(t => <Tag key={t} style={{ marginBottom: 4 }}>{t}</Tag>)
                : <Text type="secondary">—</Text>}
            </div>
          </Col>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>能力标签</Text>
            <div style={{ marginTop: 4 }}>
              {factory.capability_tags?.length
                ? factory.capability_tags.map(t => <Tag key={t} color="blue" style={{ marginBottom: 4 }}>{t}</Tag>)
                : <Text type="secondary">—</Text>}
            </div>
          </Col>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>认证标签</Text>
            <div style={{ marginTop: 4 }}>
              {factory.certificate_tags?.length
                ? factory.certificate_tags.map(t => <Tag key={t} color="cyan" style={{ marginBottom: 4 }}>{t}</Tag>)
                : <Text type="secondary">—</Text>}
            </div>
          </Col>
          {factory.risk_tags?.length > 0 && (
            <Col span={24} style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>风险标签</Text>
              <div style={{ marginTop: 4 }}>
                {factory.risk_tags.map(t => <Tag key={t} color="red" style={{ marginBottom: 4 }}>{t}</Tag>)}
              </div>
            </Col>
          )}
          {factory.remark && (
            <Col span={24} style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>备注</Text>
              <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{factory.remark}</div>
            </Col>
          )}
        </Row>
      </Card>
    )
  }

  return (
    <Card
      size="small"
      title="编辑工厂信息"
      extra={
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="small" onClick={() => setEditing(false)}>取消</Button>
          <Button size="small" type="primary" icon={<SaveOutlined />}
            loading={mutation.isPending} onClick={() => form.submit()}>
            保存
          </Button>
        </div>
      }
      style={{ marginBottom: 12 }}
    >
      <Form form={form} layout="vertical" size="small" onFinish={values => mutation.mutate(values)}>
        <Row gutter={12}>
          <Col span={8}><Form.Item name="factory_name" label="工厂全名"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="factory_short_name" label="工厂简称"><Input /></Form.Item></Col>
          <Col span={4}><Form.Item name="country" label="国家"><Input /></Form.Item></Col>
          <Col span={4}><Form.Item name="region" label="地区"><Input /></Form.Item></Col>
          <Col span={6}><Form.Item name="contact_person" label="联系人"><Input /></Form.Item></Col>
          <Col span={6}><Form.Item name="contact_phone" label="联系电话"><Input /></Form.Item></Col>
          <Col span={6}><Form.Item name="contact_email" label="邮箱"><Input /></Form.Item></Col>
          <Col span={6}><Form.Item name="payment_terms" label="付款方式"><Input /></Form.Item></Col>
          <Col span={6}><Form.Item name="cooperation_status" label="合作状态">
            <Select options={COOPERATION_STATUS_OPTIONS} allowClear />
          </Form.Item></Col>
          <Col span={6}><Form.Item name="price_position" label="价格定位">
            <Select options={PRICE_POSITION_OPTIONS} allowClear />
          </Form.Item></Col>
          <Col span={6}><Form.Item name="risk_level" label="风险等级">
            <Select options={RISK_LEVEL_OPTIONS} allowClear />
          </Form.Item></Col>
          <Col span={3}><Form.Item name="moq" label="MOQ">
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item></Col>
          <Col span={3}><Form.Item name="normal_lead_time_days" label="交期(天)">
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item></Col>
          <Col span={24}><Form.Item name="address" label="地址"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="main_categories" label="擅长品类">
            <Select mode="tags" placeholder="输入后回车" options={[
              { label: "泳装", value: "泳装" }, { label: "内衣", value: "内衣" },
              { label: "内裤", value: "内裤" }, { label: "运动服", value: "运动服" },
            ]} />
          </Form.Item></Col>
          <Col span={8}><Form.Item name="capability_tags" label="能力标签">
            <Select mode="tags" placeholder="输入后回车" options={[
              { label: "无缝", value: "无缝" }, { label: "有缝", value: "有缝" },
              { label: "带杯文胸", value: "带杯文胸" }, { label: "快速打样", value: "快速打样" },
            ]} />
          </Form.Item></Col>
          <Col span={8}><Form.Item name="certificate_tags" label="认证标签">
            <Select mode="tags" placeholder="输入后回车" options={[
              { label: "BSCI", value: "BSCI" }, { label: "SEDEX", value: "SEDEX" },
              { label: "GRS", value: "GRS" }, { label: "OK100", value: "OK100" },
            ]} />
          </Form.Item></Col>
          <Col span={24}><Form.Item name="risk_tags" label="风险标签">
            <Select mode="tags" placeholder="如：交期不稳定、报价偏高" options={[
              { label: "交期不稳定", value: "交期不稳定" }, { label: "报价偏高", value: "报价偏高" },
              { label: "质量问题", value: "质量问题" }, { label: "配合度低", value: "配合度低" },
            ]} />
          </Form.Item></Col>
          <Col span={24}><Form.Item name="remark" label="备注">
            <TextArea rows={2} />
          </Form.Item></Col>
        </Row>
      </Form>
    </Card>
  )
}

// ── 报价记录表格 ──────────────────────────────────────────────────────────────

function QuoteRecordTable({
  factoryId,
  canEdit,
  canDelete,
}: {
  factoryId: string
  canEdit: boolean
  canDelete: boolean
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm] = Form.useForm()

  const { data, isFetching } = useQuery({
    queryKey: ["factory-qr", factoryId, page],
    queryFn: () => fetchFactoryQuoteRecords(factoryId, { page, page_size: 20 }),
    placeholderData: prev => prev,
  })

  const addMutation = useMutation({
    mutationFn: createQuoteRecord,
    onSuccess: () => {
      message.success("报价记录已添加")
      qc.invalidateQueries({ queryKey: ["factory-qr", factoryId] })
      qc.invalidateQueries({ queryKey: ["factory", factoryId] })
      setShowAdd(false)
      addForm.resetFields()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(msg ?? "创建失败")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteQuoteRecord,
    onSuccess: () => {
      message.success("已删除")
      qc.invalidateQueries({ queryKey: ["factory-qr", factoryId] })
      qc.invalidateQueries({ queryKey: ["factory", factoryId] })
    },
    onError: () => message.error("删除失败"),
  })

  const columns: ColumnsType<FactoryQuoteRecord> = [
    {
      title: "报价日期",
      dataIndex: "quote_date",
      width: 90,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "询单号",
      dataIndex: "inquiry_no",
      width: 120,
      render: (v: string | null, r: FactoryQuoteRecord) =>
        v && r.inquiry_id
          ? <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a>
          : v ?? <Text type="secondary">—</Text>,
    },
    { title: "产品大类", dataIndex: "product_category", width: 80, render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
    { title: "产品名称", dataIndex: "product_name", width: 120, ellipsis: true, render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
    { title: "系列", dataIndex: "series_name", width: 80, render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
    { title: "数量", dataIndex: "quantity", width: 60, align: "right" as const },
    {
      title: "工厂价(CNY)",
      dataIndex: "factory_price",
      width: 100,
      align: "right" as const,
      render: (v: number | null) => v != null ? money(v) : <Text type="secondary">—</Text>,
    },
    {
      title: "是否下单",
      dataIndex: "is_ordered",
      width: 70,
      render: (v: boolean) => <Tag color={v ? "green" : "default"}>{v ? "已下单" : "未下单"}</Tag>,
    },
    {
      title: "贸易额(USD)",
      dataIndex: "trade_amount",
      width: 100,
      align: "right" as const,
      render: (v: number | null) => v != null ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : <Text type="secondary">—</Text>,
    },
    { title: "备注", dataIndex: "remark", width: 100, ellipsis: true, render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
    ...(canDelete ? [{
      title: "操作",
      key: "action",
      width: 65,
      render: (_: unknown, r: FactoryQuoteRecord) => (
        <Popconfirm title="确认删除此记录？" onConfirm={() => deleteMutation.mutate(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    }] : []),
  ]

  return (
    <Card
      size="small"
      title={`报价记录（共 ${data?.total ?? "…"} 条）`}
      extra={canEdit && (
        <Button size="small" icon={<PlusOutlined />} type="primary" onClick={() => setShowAdd(true)}>
          新增记录
        </Button>
      )}
    >
      <Table<FactoryQuoteRecord>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        size="small"
        scroll={{ x: 900 }}
        pagination={{
          current: page, pageSize: 20, total: data?.total ?? 0,
          showSizeChanger: false, onChange: p => setPage(p),
        }}
      />
      <style>{`a { cursor: pointer; }`}</style>

      <Modal
        title="新增报价记录"
        open={showAdd}
        onCancel={() => { setShowAdd(false); addForm.resetFields() }}
        onOk={() => addForm.submit()}
        confirmLoading={addMutation.isPending}
        width={640}
      >
        <Form
          form={addForm}
          layout="vertical"
          size="small"
          onFinish={values => {
            const payload = { ...values, factory_id: factoryId }
            if (values.quote_date) payload.quote_date = values.quote_date.format("YYYY-MM-DD")
            addMutation.mutate(payload)
          }}
        >
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="quote_date" label="报价日期">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="inquiry_no" label="询单号">
                <Input placeholder="可选，关联询单" />
              </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="product_category" label="产品大类"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="product_name" label="产品名称"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="series_name" label="系列"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="quantity" label="数量">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item></Col>
            <Col span={6}><Form.Item name="factory_price" label="工厂价(CNY)">
              <InputNumber style={{ width: "100%" }} prefix="¥" precision={4} min={0} />
            </Form.Item></Col>
            <Col span={6}><Form.Item name="trade_amount" label="贸易额(USD)">
              <InputNumber style={{ width: "100%" }} prefix="$" precision={2} min={0} />
            </Form.Item></Col>
            <Col span={6}><Form.Item name="order_status" label="订单状态">
              <Select options={ORDER_STATUS_OPTIONS.filter(o => o.value)} allowClear />
            </Form.Item></Col>
            <Col span={12}><Form.Item name="is_ordered" label="是否下单" initialValue={false}>
              <Select options={[{ label: "未下单", value: false }, { label: "已下单", value: true }]} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="remark" label="备注"><TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function FactoryDetailPage() {
  const { factoryId } = useParams<{ factoryId: string }>()
  const navigate = useNavigate()
  const user = useCurrentUser()

  const canEdit   = user.role !== "viewer"
  const canDelete = user.role === "admin" || user.role === "group_leader"

  const { data: factory, isPending, isError } = useQuery<FactoryDetail>({
    queryKey: ["factory", factoryId],
    queryFn: () => fetchFactory(factoryId!),
    enabled: !!factoryId,
  })

  if (isPending) return <div style={{ padding: 32, textAlign: "center" }}>加载中…</div>
  if (isError || !factory) return (
    <div style={{ padding: 24 }}>
      <Alert type="error" message="工厂档案加载失败" showIcon />
      <Button icon={<ArrowLeftOutlined />} style={{ marginTop: 12 }} onClick={() => navigate("/factories")}>
        返回列表
      </Button>
    </div>
  )

  return (
    <div style={{ padding: 16 }}>

      {/* 标题行 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/factories")}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>
          {factory.factory_short_name || factory.factory_name || factory.factory_code}
        </Title>
        {factory.cooperation_status && (
          <Tag color={COOPERATION_STATUS_COLOR[factory.cooperation_status]}>
            {COOPERATION_STATUS_LABEL[factory.cooperation_status] ?? factory.cooperation_status}
          </Tag>
        )}
        {factory.risk_level && (
          <Tag color={RISK_LEVEL_COLOR[factory.risk_level]}>
            风险：{RISK_LEVEL_LABEL[factory.risk_level] ?? factory.risk_level}
          </Tag>
        )}
        {factory.price_position && (
          <Tag>{PRICE_POSITION_LABEL[factory.price_position] ?? factory.price_position}</Tag>
        )}
      </div>

      {/* KPI 卡片 */}
      <Row gutter={10} style={{ marginBottom: 12 }}>
        <Col span={5}>
          <Card size="small">
            <Statistic title="报价次数" value={factory.quote_count} suffix="次" />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="下单次数" value={factory.ordered_count} suffix="次" />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="订单转化率"
              value={factory.conversion_rate ?? 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: (factory.conversion_rate ?? 0) >= 50 ? "#52c41a" : "#faad14" }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="总贸易额(USD)"
              value={factory.total_trade_amount != null
                ? `$${factory.total_trade_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : "—"}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="平均工厂报价(CNY)"
              value={factory.avg_factory_price != null ? money(factory.avg_factory_price) : "—"}
            />
          </Card>
        </Col>
      </Row>

      {/* 分析区 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={6}>
          <Card size="small" style={{ height: "100%" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>常报价品类 (Top 3)</Text>
            {factory.top_categories?.length
              ? factory.top_categories.map((it, i) => (
                  <div key={it.name} style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <Text>{i + 1}. {it.name}</Text>
                    <Text type="secondary">{it.count} 次</Text>
                  </div>
                ))
              : <div style={{ marginTop: 6 }}><Text type="secondary">暂无数据</Text></div>}
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ height: "100%" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>常报价系列 (Top 3)</Text>
            {factory.top_series?.length
              ? factory.top_series.map((it, i) => (
                  <div key={it.name} style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <Text>{i + 1}. {it.name}</Text>
                    <Text type="secondary">{it.count} 次</Text>
                  </div>
                ))
              : <div style={{ marginTop: 6 }}><Text type="secondary">暂无数据</Text></div>}
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ height: "100%" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>最近报价日期</Text>
            <div style={{ marginTop: 6 }}><Text strong>{factory.last_quote_date ?? "—"}</Text></div>
            <Text type="secondary" style={{ fontSize: 12, marginTop: 12, display: "block" }}>最近下单日期</Text>
            <div style={{ marginTop: 6 }}><Text strong>{factory.last_order_date ?? "—"}</Text></div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ height: "100%" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>价格定位</Text>
            <div style={{ marginTop: 6 }}>
              {factory.price_position
                ? <Tag>{PRICE_POSITION_LABEL[factory.price_position]}</Tag>
                : <Text type="secondary">—</Text>}
            </div>
            <Text type="secondary" style={{ fontSize: 12, marginTop: 12, display: "block" }}>MOQ / 交期</Text>
            <div style={{ marginTop: 6 }}>
              <Text>{factory.moq ?? "—"}</Text>
              <Text type="secondary"> / </Text>
              <Text>{factory.normal_lead_time_days != null ? `${factory.normal_lead_time_days}天` : "—"}</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 工厂信息编辑 */}
      <FactoryEditor factory={factory} canEdit={canEdit} />

      {/* 报价记录表 */}
      <QuoteRecordTable
        factoryId={factory.id}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      {/* 打样记录 */}
      <FactorySampleSection factoryId={factory.id} />

      {/* 生产跟单 */}
      <FactoryProductionSection factoryId={factory.id} />

    </div>
  )
}

function FactorySampleSection({ factoryId }: { factoryId: string }) {
  const navigate = useNavigate()
  const { data: samples = [], isFetching } = useQuery({
    queryKey: ["factory-samples", factoryId],
    queryFn: () => fetchFactorySamples(factoryId),
  })

  const approved = samples.filter(s => s.final_result === "approved" || s.final_result === "converted_to_order").length
  const terminal = samples.filter(s => ["approved", "rejected", "cancelled", "converted_to_order"].includes(s.final_result)).length
  const successRate = terminal > 0 ? ((approved / terminal) * 100).toFixed(1) : null

  const cycleSamples = samples.filter(s => s.assigned_to_factory_at && s.sample_sent_at)
  const avgCycle = cycleSamples.length > 0
    ? (cycleSamples.reduce((sum, s) => {
        const diff = (new Date(s.sample_sent_at!).getTime() - new Date(s.assigned_to_factory_at!).getTime()) / 86400000
        return sum + diff
      }, 0) / cycleSamples.length).toFixed(1)
    : null

  const today = new Date().toISOString().split("T")[0]
  const overdueCount = samples.filter(s =>
    s.factory_due_date && s.factory_due_date < today &&
    !["approved", "rejected", "cancelled", "sent", "received"].includes(s.sample_status)
  ).length

  const columns = [
    { title: "打样编号", dataIndex: "sample_no", width: 90, render: (v: string, r: { id: string }) => <a onClick={() => navigate(`/samples/${r.id}`)}>{v}</a> },
    { title: "打样类型", dataIndex: "sample_type", width: 70, render: (v: string | null) => v ? SAMPLE_TYPE_LABEL[v] ?? v : "—" },
    { title: "打样状态", dataIndex: "sample_status", width: 90, render: (v: string) => <Tag color={SAMPLE_STATUS_COLOR[v] ?? "default"}>{SAMPLE_STATUS_LABEL[v] ?? v}</Tag> },
    { title: "客户", dataIndex: "customer_short_name", width: 80, ellipsis: true },
    { title: "询单号", dataIndex: "inquiry_no", width: 110, ellipsis: true },
    { title: "品名", dataIndex: "product_name", width: 110, ellipsis: true },
    { title: "工厂交期", dataIndex: "factory_due_date", width: 90 },
    { title: "寄样日期", dataIndex: "sample_sent_at", width: 90 },
    { title: "最终结果", dataIndex: "final_result", width: 80, render: (v: string) => v && v !== "pending" ? <Tag color={FINAL_RESULT_COLOR[v] ?? "default"}>{FINAL_RESULT_LABEL[v] ?? v}</Tag> : <Typography.Text type="secondary">待定</Typography.Text> },
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
          &nbsp;&nbsp;平均周期：{avgCycle != null ? `${avgCycle}天` : "—"}
          &nbsp;&nbsp;逾期次数：{overdueCount}
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

function FactoryProductionSection({ factoryId }: { factoryId: string }) {
  const navigate = useNavigate()
  const { data: records = [], isFetching } = useQuery({
    queryKey: ["factory-productions", factoryId],
    queryFn: () => fetchFactoryProductions(factoryId),
  })

  const today = new Date().toISOString().split("T")[0]
  const overdue = records.filter(r =>
    r.delivery_date && r.delivery_date < today &&
    !["completed", "shipped", "cancelled"].includes(r.production_status)
  ).length
  const inProd = records.filter(r => r.production_status === "in_production").length

  const columns = [
    { title: "跟单编号", dataIndex: "production_no", width: 90, render: (v: string, r: { id: string }) => <a onClick={() => navigate(`/productions/${r.id}`)}>{v}</a> },
    { title: "生产状态", dataIndex: "production_status", width: 100, render: (v: string) => <Tag color={PRODUCTION_STATUS_COLOR[v] ?? "default"}>{PRODUCTION_STATUS_LABEL[v] ?? v}</Tag> },
    { title: "客户", dataIndex: "customer_short_name", width: 80, ellipsis: true },
    { title: "品名", dataIndex: "product_name", width: 120, ellipsis: true },
    { title: "订单数量", dataIndex: "order_quantity", width: 75, align: "right" as const },
    { title: "交期", dataIndex: "delivery_date", width: 90 },
    { title: "跟单员", dataIndex: "merchandiser", width: 70, ellipsis: true },
    { title: "操作", key: "action", width: 60, render: (_: unknown, r: { id: string }) => <Button size="small" type="link" onClick={() => navigate(`/productions/${r.id}`)}>详情</Button> },
  ]

  return (
    <Card size="small" title={`生产跟单（${records.length}）`} style={{ marginTop: 16 }} loading={isFetching}
      extra={
        <span style={{ fontSize: 12, color: "#666" }}>
          生产中：{inProd}&nbsp;&nbsp;
          逾期：<Typography.Text style={{ color: overdue > 0 ? "#ff4d4f" : undefined }}>{overdue}</Typography.Text>
        </span>
      }>
      {records.length === 0
        ? <div style={{ textAlign: "center", padding: "16px 0", color: "#999" }}>暂无生产跟单</div>
        : <Table rowKey="id" columns={columns} dataSource={records} size="small" pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 700 }} />
      }
    </Card>
  )
}
