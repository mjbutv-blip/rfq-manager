import React, { useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, AutoComplete, Badge, Breadcrumb, Button, Card, Checkbox, Col, Collapse, DatePicker, Drawer,
  Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Row, Select,
  Space, Spin, Table, Tag, Tooltip, Typography, message,
} from "antd"
import { CheckOutlined, FileExcelOutlined, SendOutlined } from "@ant-design/icons"
import {
  ArrowLeftOutlined, DeleteOutlined, EditOutlined, HomeOutlined, PlusOutlined,
  SaveOutlined, CloseOutlined,
} from "@ant-design/icons"
import dayjs from "dayjs"

import { deleteInquiry, fetchInquiry, updateInquiry } from "@/api/inquiries"
import { fetchInquiryWarnings, resolveWarning } from "@/api/warnings"
import { createTransfer, fetchInquiryTransfers, getFactoryContractUrl, getFinanceTransferUrl } from "@/api/transfers"
import { fetchFactories } from "@/api/factories"
import {
  createFactoryQuote, deleteFactoryQuote, fetchInquiryFactoryQuotes, updateFactoryQuote,
} from "@/api/factory_quotes"
import { createSample, fetchInquirySamples } from "@/api/samples"
import { fetchInquiryProductions } from "@/api/productions"
import {
  createInquiryStyleItem, createInquiryStyleProcess, createInquiryStyleSize,
  deleteInquiryStyleItem, deleteInquiryStyleProcess, deleteInquiryStyleSize,
  fetchInquiryStyleItem, fetchInquiryStyleItems, updateInquiryStyleItem,
} from "@/api/inquiry_items"
import { PRODUCTION_STATUS_COLOR, PRODUCTION_STATUS_LABEL } from "@/types/production"
import { SAMPLE_STATUS_COLOR, SAMPLE_STATUS_LABEL, SAMPLE_TYPE_LABEL, SAMPLE_TYPE_OPTIONS, FEE_PAID_BY_OPTIONS } from "@/types/sample"
import { useCurrentUser } from "@/contexts/UserContext"
import type { InquiryItem } from "@/types/inquiry"
import { ORDER_STATUS_COLOR, ORDER_STATUS_OPTIONS, QUOTE_STATUS_OPTIONS } from "@/types/inquiry"
import type { InquiryWarning } from "@/types/warning"
import { WARNING_LEVEL_COLOR, WARNING_LEVEL_LABEL, WARNING_TYPE_LABEL } from "@/types/warning"
import type { TransferOrder, TransferResponse } from "@/types/transfer"
import { TRANSFER_STATUS_COLOR, TRANSFER_STATUS_LABEL } from "@/types/transfer"
import type { InquiryStyleItem } from "@/types/inquiry_style_item"
import { fetchActiveTaskForItem } from "@/api/data_completion_tasks"
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL } from "@/types/data_completion_task"
import type { FactoryQuote } from "@/types/factory_quote"
import { CURRENCY_OPTIONS, PRICE_UNIT_OPTIONS } from "@/types/factory_quote"

const { Title, Text } = Typography

// ── 格式化工具 ────────────────────────────────────────────────────────────────

function val(v: string | number | null | undefined, prefix = "", suffix = "") {
  if (v == null || v === "") return <Text type="secondary">—</Text>
  return `${prefix}${typeof v === "number" ? v.toLocaleString() : v}${suffix}`
}

function money(v: number | null | undefined, symbol = "$") {
  if (v == null) return <Text type="secondary">—</Text>
  return `${symbol}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(v: number | null | undefined) {
  if (v == null) return <Text type="secondary">—</Text>
  const color = v >= 20 ? "#52c41a" : v >= 15 ? "#faad14" : "#ff4d4f"
  return <Text strong style={{ color }}>{v.toFixed(1)}%</Text>
}

// ── 状态徽章 ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Text type="secondary">—</Text>
  const color = ORDER_STATUS_COLOR[status] ?? "default"
  return <Badge status={color as any} text={<Text strong>{status}</Text>} />
}

// ── 编辑表单（可修改字段） ─────────────────────────────────────────────────────

interface EditFormProps {
  inquiry: InquiryItem
  onSave: (values: Partial<InquiryItem>) => void
  onCancel: () => void
  saving: boolean
}

function EditForm({ inquiry, onSave, onCancel, saving }: EditFormProps) {
  const [form] = Form.useForm()

  const { data: factoryList } = useQuery({
    queryKey: ["factories-for-quote-select"],
    queryFn: () => fetchFactories({ page_size: 200 }),
  })
  const factoryOptions = (factoryList?.items ?? []).map(f => ({
    label: f.factory_short_name || f.factory_name, value: f.id,
  }))

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        quote_status:    inquiry.quote_status,
        order_status:    inquiry.order_status,
        final_quote:     inquiry.final_quote,
        factory_price:   inquiry.factory_price,
        gross_profit_rate: inquiry.gross_profit_rate,
        order_unit_price: inquiry.order_unit_price,
        order_quantity:  inquiry.order_quantity,
        trade_amount:    inquiry.trade_amount,
        order_date:      inquiry.order_date ? dayjs(inquiry.order_date) : null,
        remark:          inquiry.remark,
        applicable_factory_id: inquiry.applicable_factory_id,
      }}
      onFinish={values => {
        const payload = { ...values }
        if (values.order_date) payload.order_date = values.order_date.format("YYYY-MM-DD")
        else payload.order_date = null
        onSave(payload)
      }}
    >
      <Row gutter={16}>
        <Col span={6}>
          <Form.Item label="报价情况" name="quote_status">
            <Select allowClear options={QUOTE_STATUS_OPTIONS.filter(o => o.value)} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="订单状态" name="order_status">
            <Select allowClear options={ORDER_STATUS_OPTIONS.filter(o => o.value)} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="最终报价 (USD)" name="final_quote">
            <InputNumber prefix="$" style={{ width: "100%" }} precision={4} min={0} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="工厂价格 (CNY)" name="factory_price">
            <InputNumber prefix="¥" style={{ width: "100%" }} precision={4} min={0} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="毛利率 (%)" name="gross_profit_rate">
            <InputNumber suffix="%" style={{ width: "100%" }} precision={2} min={0} max={100} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="下单单价 (USD)" name="order_unit_price">
            <InputNumber prefix="$" style={{ width: "100%" }} precision={4} min={0} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="下单数量" name="order_quantity">
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="贸易额 (USD)" name="trade_amount">
            <InputNumber prefix="$" style={{ width: "100%" }} precision={2} min={0} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="下单日期" name="order_date">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="适用工厂" name="applicable_factory_id">
            <Select allowClear showSearch optionFilterProp="label" placeholder="未选择" options={factoryOptions} />
          </Form.Item>
        </Col>
        <Col span={18}>
          <Form.Item label="备注" name="remark">
            <input
              style={{ width: "100%", border: "1px solid #d9d9d9", borderRadius: 6, padding: "4px 11px", fontSize: 14 }}
              placeholder="备注信息"
              defaultValue={inquiry.remark ?? ""}
              onChange={e => form.setFieldValue("remark", e.target.value)}
            />
          </Form.Item>
        </Col>
      </Row>
      <Space>
        <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>
          保存
        </Button>
        <Button icon={<CloseOutlined />} onClick={onCancel}>取消</Button>
      </Space>
    </Form>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

// ── 预警卡片 ──────────────────────────────────────────────────────────────────

function WarningsCard({ inquiryId, canResolve }: { inquiryId: string; canResolve: boolean }) {
  const queryClient = useQueryClient()
  const [msgApi, ctx] = message.useMessage()
  const [resolving, setResolving] = useState<InquiryWarning | null>(null)
  const [note, setNote] = useState("")

  const { data: warnings = [], refetch } = useQuery({
    queryKey: ["inquiry-warnings", inquiryId],
    queryFn: () => fetchInquiryWarnings(inquiryId),
  })

  const mutation = useMutation({
    mutationFn: () => resolveWarning(resolving!.id, note || undefined),
    onSuccess: () => {
      msgApi.success("已处理")
      setResolving(null)
      setNote("")
      refetch()
      queryClient.invalidateQueries({ queryKey: ["warning-summary"] })
      queryClient.invalidateQueries({ queryKey: ["warnings"] })
    },
    onError: (e: Error) => msgApi.error(`操作失败：${e.message}`),
  })

  const unresolved = warnings.filter(w => !w.is_resolved)
  const resolved   = warnings.filter(w => w.is_resolved)

  if (warnings.length === 0) {
    return (
      <Card size="small" title="预警信息">
        <Alert message="暂无预警" type="success" showIcon />
      </Card>
    )
  }

  return (
    <Card size="small" title={
      <span>
        预警信息
        {unresolved.length > 0 && (
          <Tag color="red" style={{ marginLeft: 8 }}>{unresolved.length} 条待处理</Tag>
        )}
      </span>
    }>
      {ctx}
      {unresolved.map(w => (
        <Alert
          key={w.id}
          type={w.warning_level === "high" ? "error" : w.warning_level === "medium" ? "warning" : "info"}
          style={{ marginBottom: 8 }}
          message={
            <Space>
              <Tag color={WARNING_LEVEL_COLOR[w.warning_level]} style={{ marginRight: 0 }}>
                {WARNING_LEVEL_LABEL[w.warning_level]}
              </Tag>
              <Tag style={{ marginRight: 0 }}>{WARNING_TYPE_LABEL[w.warning_type]}</Tag>
              <span>{w.warning_message}</span>
            </Space>
          }
          description={w.suggested_action ? `建议：${w.suggested_action}` : undefined}
          action={
            canResolve ? (
              <Tooltip title="标记已处理">
                <Button
                  size="small" icon={<CheckOutlined />}
                  onClick={() => { setResolving(w); setNote("") }}
                >
                  处理
                </Button>
              </Tooltip>
            ) : undefined
          }
        />
      ))}

      {resolved.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            已处理 {resolved.length} 条
          </Typography.Text>
        </div>
      )}

      <Modal
        title="标记为已处理"
        open={!!resolving}
        onCancel={() => setResolving(null)}
        onOk={() => mutation.mutate()}
        okText="确认"
        cancelText="取消"
        confirmLoading={mutation.isPending}
        destroyOnClose
      >
        {resolving && (
          <>
            <p>{resolving.warning_message}</p>
            <Form.Item label="处理备注（可选）">
              <textarea
                rows={2}
                value={note}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
                placeholder="填写处理说明"
                style={{ width: "100%", border: "1px solid #d9d9d9", borderRadius: 6, padding: "4px 11px" }}
              />
            </Form.Item>
          </>
        )}
      </Modal>
    </Card>
  )
}

// ── 一键转单卡片 ───────────────────────────────────────────────────────────────

const TRANSFER_ALLOWED_STATUSES = new Set(["下单", "已下单", "确认转单"])

interface TransferCardProps {
  inquiryId: string
  orderStatus: string | null
  canTransfer: boolean
}

function TransferCard({ inquiryId, orderStatus, canTransfer }: TransferCardProps) {
  const queryClient = useQueryClient()
  const [msgApi, ctx] = message.useMessage()
  const [lastResult, setLastResult] = useState<TransferResponse | null>(null)

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["inquiry-transfers", inquiryId],
    queryFn: () => fetchInquiryTransfers(inquiryId),
  })

  const mutation = useMutation({
    mutationFn: () => createTransfer(inquiryId),
    onSuccess: res => {
      setLastResult(res)
      if (res.missing_fields.length > 0) {
        msgApi.warning(res.message)
      } else {
        msgApi.success(res.message)
      }
      refetchHistory()
      queryClient.invalidateQueries({ queryKey: ["inquiry-transfers", inquiryId] })
    },
    onError: (e: Error) => msgApi.error(`转单失败：${e.message}`),
  })

  const canGenerate = canTransfer && !!orderStatus && TRANSFER_ALLOWED_STATUSES.has(orderStatus)

  const historyColumns = [
    {
      title: "生成时间",
      dataIndex: "generated_at",
      width: 160,
      render: (v: string) => new Date(v).toLocaleString("zh-CN"),
    },
    {
      title: "生成人",
      dataIndex: "generated_by",
      width: 90,
    },
    {
      title: "状态",
      dataIndex: "transfer_status",
      width: 80,
      render: (v: string) => (
        <Tag color={TRANSFER_STATUS_COLOR[v] ?? "default"}>
          {TRANSFER_STATUS_LABEL[v] ?? v}
        </Tag>
      ),
    },
    {
      title: "下载",
      key: "download",
      render: (_: unknown, r: TransferOrder) =>
        r.transfer_status !== "failed" ? (
          <Space size={4}>
            <Tooltip title="工厂购销合同">
              <Button
                size="small"
                icon={<FileExcelOutlined />}
                href={getFactoryContractUrl(r.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                合同
              </Button>
            </Tooltip>
            <Tooltip title="财务转单统计表">
              <Button
                size="small"
                icon={<FileExcelOutlined />}
                href={getFinanceTransferUrl(r.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                财务表
              </Button>
            </Tooltip>
          </Space>
        ) : (
          <Tag color="red">生成失败</Tag>
        ),
    },
  ]

  return (
    <Card
      size="small"
      title={
        <Space>
          <SendOutlined />
          一键转单
          {history.length > 0 && (
            <Tag color="blue">{history.length} 次历史</Tag>
          )}
        </Space>
      }
    >
      {ctx}

      {!canGenerate && (
        <Alert
          type="info"
          showIcon
          message={
            canTransfer
              ? "订单状态为已下单或确认转单后，可生成转单文件"
              : "您没有权限执行转单操作"
          }
          style={{ marginBottom: history.length > 0 ? 12 : 0 }}
        />
      )}

      {canGenerate && (
        <div style={{ marginBottom: 12 }}>
          <Space wrap>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {history.length > 0 ? "重新生成转单文件" : "一键转单"}
            </Button>

            {lastResult && (
              <>
                <Button
                  icon={<FileExcelOutlined />}
                  href={getFactoryContractUrl(lastResult.transfer_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  下载工厂购销合同
                </Button>
                <Button
                  icon={<FileExcelOutlined />}
                  href={getFinanceTransferUrl(lastResult.transfer_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  下载财务转单表
                </Button>
              </>
            )}
          </Space>

          {lastResult && lastResult.missing_fields.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 8 }}
              message={lastResult.message}
            />
          )}
        </div>
      )}

      {history.length > 0 && (
        <Table<TransferOrder>
          rowKey="id"
          columns={historyColumns}
          dataSource={history}
          size="small"
          pagination={false}
          bordered
        />
      )}
    </Card>
  )
}

// ── 工厂报价记录卡片 ──────────────────────────────────────────────────────────

interface QuoteCardForm {
  factory_id: string | null
  factory_name: string
  quote_round: number
  factory_price: number | null
  currency: string
  price_unit: string
  remark: string
}

function emptyQuoteCardForm(defaultRound: number): QuoteCardForm {
  return { factory_id: null, factory_name: "", quote_round: defaultRound, factory_price: null, currency: "USD", price_unit: "件", remark: "" }
}

function quoteCardFormFromRecord(r: FactoryQuote): QuoteCardForm {
  return {
    factory_id: r.factory_id, factory_name: r.factory_name ?? "", quote_round: r.quote_round,
    factory_price: r.factory_price, currency: r.currency, price_unit: r.price_unit, remark: r.remark ?? "",
  }
}

function QuoteRoundCard({
  form, onFormChange, factoryOptions, hasFactoryProfile, canEdit, comparison,
  isDraft, saving, deleting, onSave, onDelete, quotedBy, quotedAt,
}: {
  form: QuoteCardForm
  onFormChange: (f: QuoteCardForm) => void
  factoryOptions: { value: string; id: string }[]
  hasFactoryProfile: boolean
  canEdit: boolean
  comparison: FactoryQuote["round_comparison"]
  isDraft: boolean
  saving: boolean
  deleting: boolean
  onSave: () => void
  onDelete: () => void
  quotedBy?: string | null
  quotedAt?: string | null
}) {
  return (
    <Card size="small" style={{ marginBottom: 12, background: isDraft ? "#fafafa" : undefined }}>
      <Space direction="vertical" style={{ width: "100%" }} size={10}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text strong>第 {form.quote_round || 1} 轮工厂报价</Text>
          <Space size={6}>
            {comparison === "lowest" && <Tag color="green">本轮最低</Tag>}
            {comparison === "mismatch" && <Text type="secondary" style={{ fontSize: 12 }}>币种或单位不一致，暂不比较</Text>}
          </Space>
        </div>

        <Row gutter={12}>
          <Col span={5}>
            <Text type="secondary" style={{ fontSize: 12 }}>轮次</Text>
            <InputNumber
              min={1} value={form.quote_round} disabled={!canEdit} style={{ width: "100%" }}
              onChange={v => onFormChange({ ...form, quote_round: v || 1 })}
            />
          </Col>
          <Col span={11}>
            <Text type="secondary" style={{ fontSize: 12 }}>工厂</Text>
            <AutoComplete
              disabled={!canEdit}
              value={form.factory_name}
              options={factoryOptions}
              filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
              onSelect={(value, option) => onFormChange({ ...form, factory_name: value, factory_id: (option as { id: string }).id })}
              onChange={value => onFormChange({ ...form, factory_name: value, factory_id: null })}
              style={{ width: "100%" }}
              placeholder="选择已有工厂或输入新工厂名称"
            />
            {form.factory_name && !hasFactoryProfile && !form.factory_id && (
              <Text type="warning" style={{ fontSize: 11 }}>该工厂尚未建立工厂档案，仍可保存</Text>
            )}
          </Col>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>工厂报价</Text>
            <InputNumber
              min={0} precision={4} disabled={!canEdit} style={{ width: "100%" }}
              value={form.factory_price} onChange={v => onFormChange({ ...form, factory_price: v })}
            />
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={5}>
            <Text type="secondary" style={{ fontSize: 12 }}>币种</Text>
            <Select
              disabled={!canEdit} value={form.currency} style={{ width: "100%" }}
              options={CURRENCY_OPTIONS.map(c => ({ label: c, value: c }))}
              onChange={v => onFormChange({ ...form, currency: v })}
            />
          </Col>
          <Col span={5}>
            <Text type="secondary" style={{ fontSize: 12 }}>单位</Text>
            <Select
              disabled={!canEdit} value={form.price_unit} style={{ width: "100%" }}
              options={PRICE_UNIT_OPTIONS.map(u => ({ label: u, value: u }))}
              onChange={v => onFormChange({ ...form, price_unit: v })}
            />
          </Col>
          <Col span={14}>
            <Text type="secondary" style={{ fontSize: 12 }}>备注</Text>
            <Input
              disabled={!canEdit} value={form.remark} placeholder="如：含包装 / 未含运费 / MOQ 3000 / 二次议价后"
              onChange={e => onFormChange({ ...form, remark: e.target.value })}
            />
          </Col>
        </Row>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {!isDraft && (quotedBy ? `报价人 ${quotedBy}` : "")}
            {!isDraft && quotedAt ? ` · ${new Date(quotedAt).toLocaleString("zh-CN")}` : ""}
          </Text>
          {canEdit && (
            <Space>
              <Popconfirm title={isDraft ? "取消新增该卡片？" : "删除该工厂报价？"} onConfirm={onDelete}>
                <Button size="small" danger loading={deleting}>{isDraft ? "取消" : "删除"}</Button>
              </Popconfirm>
              <Button size="small" type="primary" loading={saving} onClick={onSave}>保存</Button>
            </Space>
          )}
        </div>
      </Space>
    </Card>
  )
}

function FactoryQuoteCard({ inquiryId, canEdit }: {
  inquiryId: string
  canEdit: boolean
}) {
  const [msgApi, ctx] = message.useMessage()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ["factory-quotes", inquiryId],
    queryFn: () => fetchInquiryFactoryQuotes(inquiryId),
  })
  const records = data?.items ?? []
  const effectiveCanEdit = canEdit && (data?.can_edit ?? true)

  const { data: factoryList } = useQuery({
    queryKey: ["factories-for-quote-select"],
    queryFn: () => fetchFactories({ page_size: 200 }),
  })
  const factoryOptions = (factoryList?.items ?? []).map(f => ({
    value: f.factory_short_name || f.factory_name || "", id: f.id,
  }))

  const [edits, setEdits] = useState<Record<string, QuoteCardForm>>({})
  const [drafts, setDrafts] = useState<{ localId: string; form: QuoteCardForm }[]>([])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["factory-quotes", inquiryId] })
    queryClient.invalidateQueries({ queryKey: ["inquiry-journey", inquiryId] })
    queryClient.invalidateQueries({ queryKey: ["factories-for-quote-select"] })
    queryClient.invalidateQueries({ queryKey: ["factory"] })
    queryClient.invalidateQueries({ queryKey: ["factory-qr"] })
    queryClient.invalidateQueries({ queryKey: ["operation-logs"] })
  }

  const formFor = (r: FactoryQuote): QuoteCardForm => edits[r.id] ?? quoteCardFormFromRecord(r)

  const nextRoundDefault = () => {
    const rounds = [...records.map(r => r.quote_round), ...drafts.map(d => d.form.quote_round)]
    return (rounds.length ? Math.max(...rounds) : 0) + 1
  }

  const addDraft = () => {
    const localId = `draft-${Date.now()}`
    setDrafts(prev => [...prev, { localId, form: emptyQuoteCardForm(nextRoundDefault()) }])
  }

  const validateForm = (form: QuoteCardForm): string | null => {
    if (!form.factory_id && !form.factory_name.trim()) return "请选择工厂或填写工厂名称"
    if (form.factory_price == null || form.factory_price < 0) return "请填写工厂报价（不能为负数）"
    return null
  }

  const toBody = (form: QuoteCardForm) => ({
    factory_id: form.factory_id,
    factory_name: form.factory_name.trim() || undefined,
    quote_round: form.quote_round || 1,
    factory_price: form.factory_price ?? 0,
    currency: form.currency,
    price_unit: form.price_unit,
    remark: form.remark.trim() || undefined,
  })

  const createMutation = useMutation({
    mutationFn: ({ form }: { localId: string; form: QuoteCardForm }) => createFactoryQuote(inquiryId, toBody(form)),
    onSuccess: (_res, vars) => {
      msgApi.success("工厂报价已保存")
      setDrafts(prev => prev.filter(d => d.localId !== vars.localId))
      invalidate()
    },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "保存失败")),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: QuoteCardForm }) => updateFactoryQuote(id, toBody(form)),
    onSuccess: (_res, vars) => {
      msgApi.success("工厂报价已更新")
      setEdits(prev => { const next = { ...prev }; delete next[vars.id]; return next })
      invalidate()
    },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "保存失败")),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFactoryQuote(id),
    onSuccess: () => { msgApi.success("已删除"); invalidate() },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "删除失败")),
  })

  const handleSaveDraft = (localId: string, form: QuoteCardForm) => {
    const err = validateForm(form)
    if (err) { msgApi.warning(err); return }
    createMutation.mutate({ localId, form })
  }

  const handleSaveExisting = (id: string, form: QuoteCardForm) => {
    const err = validateForm(form)
    if (err) { msgApi.warning(err); return }
    updateMutation.mutate({ id, form })
  }

  return (
    <>
      {ctx}
      <Card
        size="small"
        title="工厂报价录入"
        extra={effectiveCanEdit && (
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={addDraft}>新增工厂报价</Button>
        )}
      >
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
          记录同一询单在不同报价轮次中，各工厂的报价、币种、单位和备注。
        </Text>
        {records.length === 0 && drafts.length === 0 ? (
          <Text type="secondary">暂无工厂报价{effectiveCanEdit ? "，点击右上角「新增工厂报价」开始记录" : ""}</Text>
        ) : (
          <>
            {records.map(r => (
              <QuoteRoundCard
                key={r.id}
                form={formFor(r)}
                onFormChange={f => setEdits(prev => ({ ...prev, [r.id]: f }))}
                factoryOptions={factoryOptions}
                hasFactoryProfile={r.has_factory_profile}
                canEdit={effectiveCanEdit}
                comparison={r.round_comparison}
                isDraft={false}
                saving={updateMutation.isPending && updateMutation.variables?.id === r.id}
                deleting={deleteMutation.isPending && deleteMutation.variables === r.id}
                onSave={() => handleSaveExisting(r.id, formFor(r))}
                onDelete={() => deleteMutation.mutate(r.id)}
                quotedBy={r.quoted_by}
                quotedAt={r.quoted_at}
              />
            ))}
            {drafts.map(d => (
              <QuoteRoundCard
                key={d.localId}
                form={d.form}
                onFormChange={f => setDrafts(prev => prev.map(x => x.localId === d.localId ? { ...x, form: f } : x))}
                factoryOptions={factoryOptions}
                hasFactoryProfile={false}
                canEdit={effectiveCanEdit}
                comparison={null}
                isDraft={true}
                saving={createMutation.isPending && createMutation.variables?.localId === d.localId}
                deleting={false}
                onSave={() => handleSaveDraft(d.localId, d.form)}
                onDelete={() => setDrafts(prev => prev.filter(x => x.localId !== d.localId))}
              />
            ))}
          </>
        )}
      </Card>
    </>
  )
}

// ── 打样记录卡片 ──────────────────────────────────────────────────────────────

function SampleCard({ inquiryId, inquiry, canEdit }: {
  inquiryId: string
  inquiry: { inquiry_no?: string | null; customer_code?: string | null; customer_short_name?: string | null; product_category?: string | null; product_name?: string | null; series_name?: string | null; responsible_sales?: string | null; group_name?: string | null }
  canEdit: boolean
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [form] = Form.useForm()

  const { data: samples = [], isFetching } = useQuery({
    queryKey: ["inquiry-samples", inquiryId],
    queryFn: () => fetchInquirySamples(inquiryId),
  })

  const { mutate: addSample, isPending } = useMutation({
    mutationFn: (data: Record<string, unknown>) => createSample(data),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["inquiry-samples", inquiryId] })
      setShowAdd(false)
      form.resetFields()
      navigate(`/samples/${s.id}`)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(msg ?? "创建失败")
    },
  })

  const columns = [
    { title: "打样编号", dataIndex: "sample_no", width: 90, render: (v: string, r: { id: string }) => <a onClick={() => navigate(`/samples/${r.id}`)}>{v}</a> },
    { title: "打样类型", dataIndex: "sample_type", width: 70, render: (v: string | null) => v ? SAMPLE_TYPE_LABEL[v] ?? v : "—" },
    { title: "打样状态", dataIndex: "sample_status", width: 90, render: (v: string) => <Tag color={SAMPLE_STATUS_COLOR[v] ?? "default"}>{SAMPLE_STATUS_LABEL[v] ?? v}</Tag> },
    { title: "工厂", dataIndex: "factory_name", width: 120, ellipsis: true, render: (v: string | null) => v ?? "—" },
    { title: "工厂交期", dataIndex: "factory_due_date", width: 90, render: (v: string | null) => v ?? "—" },
    { title: "寄样日期", dataIndex: "sample_sent_at", width: 90, render: (v: string | null) => v ?? "—" },
    { title: "修改次数", dataIndex: "revision_count", width: 65, align: "right" as const },
    { title: "操作", key: "action", width: 60, render: (_: unknown, r: { id: string }) => <Button size="small" type="link" onClick={() => navigate(`/samples/${r.id}`)}>详情</Button> },
  ]

  return (
    <Card
      size="small"
      title={`打样记录（${samples.length}）`}
      extra={canEdit && <Button size="small" type="primary" onClick={() => setShowAdd(true)}>新增打样</Button>}
      loading={isFetching}
    >
      {samples.length === 0
        ? <div style={{ textAlign: "center", padding: "16px 0", color: "#999" }}>暂无打样记录</div>
        : <Table rowKey="id" columns={columns} dataSource={samples} size="small" pagination={false} scroll={{ x: 700 }} />
      }

      <Modal
        title="新增打样记录"
        open={showAdd}
        onCancel={() => { setShowAdd(false); form.resetFields() }}
        onOk={() => form.submit()}
        confirmLoading={isPending}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small" onFinish={values => {
          const clean: Record<string, unknown> = { inquiry_id: inquiryId, ...inquiry }
          for (const [k, v] of Object.entries(values)) {
            if (v !== undefined && v !== null && v !== "") {
              clean[k] = dayjs.isDayjs(v) ? v.format("YYYY-MM-DD") : v
            }
          }
          addSample(clean)
        }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="sample_type" label="打样类型" rules={[{ required: true, message: "请选择打样类型" }]}>
                <Select options={SAMPLE_TYPE_OPTIONS} placeholder="请选择" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="factory_name" label="工厂名称">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sample_quantity" label="打样数量">
                <InputNumber style={{ width: "100%" }} min={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="factory_due_date" label="工厂预计交期">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fee_paid_by" label="费用承担方">
                <Select options={FEE_PAID_BY_OPTIONS} allowClear placeholder="请选择" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sample_fee" label="打样费用">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  )
}

// ── 生产跟单卡片 ──────────────────────────────────────────────────────────────

function ProductionCard({ inquiryId }: { inquiryId: string }) {
  const navigate = useNavigate()
  const { data: records = [], isFetching } = useQuery({
    queryKey: ["inquiry-productions", inquiryId],
    queryFn: () => fetchInquiryProductions(inquiryId),
  })

  const columns = [
    { title: "跟单编号", dataIndex: "production_no", width: 90, render: (v: string, r: { id: string }) => <a onClick={() => navigate(`/productions/${r.id}`)}>{v}</a> },
    { title: "生产状态", dataIndex: "production_status", width: 100, render: (v: string) => <Tag color={PRODUCTION_STATUS_COLOR[v] ?? "default"}>{PRODUCTION_STATUS_LABEL[v] ?? v}</Tag> },
    { title: "工厂", dataIndex: "factory_name", width: 120, ellipsis: true, render: (v: string | null) => v ?? "—" },
    { title: "订单数量", dataIndex: "order_quantity", width: 75, align: "right" as const },
    { title: "预计交期", dataIndex: "delivery_date", width: 90 },
    { title: "跟单员", dataIndex: "merchandiser", width: 70, render: (v: string | null) => v ?? "—" },
    { title: "操作", key: "action", width: 60, render: (_: unknown, r: { id: string }) => <Button size="small" type="link" onClick={() => navigate(`/productions/${r.id}`)}>详情</Button> },
  ]

  return (
    <Card size="small" title={`生产跟单（${records.length}）`} loading={isFetching}
      extra={<Button size="small" onClick={() => navigate(`/productions?inquiry_no=${records[0]?.inquiry_no ?? ""}`)}>前往生产跟单</Button>}>
      {records.length === 0
        ? <div style={{ textAlign: "center", padding: "16px 0", color: "#999" }}>暂无生产跟单</div>
        : <Table rowKey="id" columns={columns} dataSource={records} size="small" pagination={false} scroll={{ x: 600 }} />
      }
    </Card>
  )
}

// ── 款式明细 / 报价资料 ────────────────────────────────────────────────────────

function apiErrorDetail(e: unknown, fallback: string): string {
  // client.ts 的响应拦截器已经把 axios 错误统一转成了 Error(detail)，
  // 这里不会再有 e.response.data.detail 这层结构。
  return (e as Error)?.message || fallback
}

function StyleSizeRangeCell({ item }: { item: InquiryStyleItem }) {
  if (item.sizes.length > 0) {
    const shown = item.sizes.slice(0, 3)
    const rest = item.sizes.length - shown.length
    return (
      <Space size={4} wrap>
        {shown.map(s => (
          <Tag key={s.id} color={s.is_special_size ? "gold" : "default"} style={{ marginRight: 0 }}>
            {s.size_code}
          </Tag>
        ))}
        {rest > 0 && <Tag style={{ marginRight: 0 }}>+{rest}</Tag>}
      </Space>
    )
  }
  if (item.size_range) return <span>{item.size_range}</span>
  return <Text type="secondary">未填写</Text>
}

function StyleTaskCell({ itemId }: { itemId: string }) {
  const navigate = useNavigate()
  const { data: task } = useQuery({
    queryKey: ["active-completion-task", itemId],
    queryFn: () => fetchActiveTaskForItem(itemId),
  })
  if (!task) return <Text type="secondary">—</Text>
  return (
    <Tag
      color={TASK_STATUS_COLOR[task.status]}
      style={{ cursor: "pointer", marginRight: 0 }}
      onClick={() => navigate("/data-completion-tasks")}
    >
      {TASK_STATUS_LABEL[task.status]}
    </Tag>
  )
}

function StyleProcessCell({ item }: { item: InquiryStyleItem }) {
  if (item.processes.length === 0) return <Text type="secondary">未填写</Text>
  const shown = item.processes.slice(0, 3)
  const rest = item.processes.length - shown.length
  return (
    <Space size={4} wrap>
      {shown.map(p => (
        <Tag key={p.id} color={p.is_special ? "purple" : "blue"} style={{ marginRight: 0 }}>
          {p.process_tag}
        </Tag>
      ))}
      {rest > 0 && <Tag style={{ marginRight: 0 }}>+{rest}</Tag>}
    </Space>
  )
}

const STYLE_ITEM_EXTRA_HIGHLIGHT_KEYS = ["quantity_unit", "regular_process_text", "special_process_text"]
const STYLE_ITEM_EXTRA_LABELS: Record<string, string> = {
  quantity_unit: "数量单位",
  regular_process_text: "常规工艺原文",
  special_process_text: "特殊工艺原文",
}

function StyleItemExtraData({ extraData }: { extraData: Record<string, unknown> | null }) {
  if (!extraData || Object.keys(extraData).length === 0) return null
  const highlightEntries = STYLE_ITEM_EXTRA_HIGHLIGHT_KEYS
    .filter(k => extraData[k] != null && extraData[k] !== "")
    .map(k => [k, extraData[k]] as const)
  const otherEntries = Object.entries(extraData).filter(
    ([k, v]) => !STYLE_ITEM_EXTRA_HIGHLIGHT_KEYS.includes(k) && v != null && v !== "",
  )

  return (
    <Collapse
      size="small"
      style={{ marginTop: 12 }}
      items={[{
        key: "extra",
        label: "其他导入资料",
        children: (
          <div>
            {highlightEntries.length > 0 && (
              <Descriptions size="small" column={1} bordered style={{ marginBottom: otherEntries.length > 0 ? 8 : 0 }}>
                {highlightEntries.map(([k, v]) => (
                  <Descriptions.Item key={k} label={STYLE_ITEM_EXTRA_LABELS[k] ?? k}>
                    {String(v)}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            )}
            {otherEntries.length > 0 && (
              <pre style={{
                background: "#f5f5f5", borderRadius: 4, padding: "6px 10px",
                fontSize: 11, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {JSON.stringify(Object.fromEntries(otherEntries), null, 2)}
              </pre>
            )}
          </div>
        ),
      }]}
    />
  )
}

interface StyleItemDrawerProps {
  inquiryId: string
  item: InquiryStyleItem | null   // null = 新增模式
  open: boolean
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}

function StyleItemDrawer({ inquiryId, item, open, canEdit, onClose, onChanged }: StyleItemDrawerProps) {
  const [form] = Form.useForm()
  const [msgApi, ctx] = message.useMessage()
  const [currentItem, setCurrentItem] = useState<InquiryStyleItem | null>(item)
  const [newProcessTag, setNewProcessTag] = useState("")
  const [newProcessSpecial, setNewProcessSpecial] = useState(false)
  const [newSizeCode, setNewSizeCode] = useState("")
  const [newSizeSpecial, setNewSizeSpecial] = useState(false)
  const isCreate = item === null

  React.useEffect(() => {
    if (!open) return
    setCurrentItem(item)
    form.setFieldsValue({
      product_name: item?.product_name ?? "",
      style_no: item?.style_no ?? "",
      product_category: item?.product_category ?? "",
      series_name: item?.series_name ?? "",
      quantity: item?.quantity ?? undefined,
      size_range: item?.size_range ?? "",
      quote_prepared_by: item?.quote_prepared_by ?? "",
      process_description: item?.process_description ?? "",
      remark: item?.remark ?? "",
    })
    setNewProcessTag(""); setNewProcessSpecial(false)
    setNewSizeCode(""); setNewSizeSpecial(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item])

  const refreshCurrentItem = async (itemId: string) => {
    const fresh = await fetchInquiryStyleItem(itemId)
    setCurrentItem(fresh)
  }

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      isCreate
        ? createInquiryStyleItem(inquiryId, values as never)
        : updateInquiryStyleItem(currentItem!.id, values as never),
    onSuccess: async saved => {
      msgApi.success(isCreate ? "新增成功" : "保存成功")
      onChanged()
      if (isCreate) {
        onClose()
      } else {
        setCurrentItem(saved)
      }
    },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, isCreate ? "新增失败" : "保存失败")),
  })

  const addProcessMutation = useMutation({
    mutationFn: () => createInquiryStyleProcess(currentItem!.id, {
      process_tag: newProcessTag.trim(), is_special: newProcessSpecial,
    }),
    onSuccess: async () => {
      msgApi.success("已添加工艺标签")
      setNewProcessTag(""); setNewProcessSpecial(false)
      await refreshCurrentItem(currentItem!.id)
      onChanged()
    },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "添加失败")),
  })

  const deleteProcessMutation = useMutation({
    mutationFn: (processId: string) => deleteInquiryStyleProcess(currentItem!.id, processId),
    onSuccess: async () => {
      msgApi.success("已删除工艺标签")
      await refreshCurrentItem(currentItem!.id)
      onChanged()
    },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "删除失败")),
  })

  const addSizeMutation = useMutation({
    mutationFn: () => createInquiryStyleSize(currentItem!.id, {
      size_code: newSizeCode.trim(), is_special_size: newSizeSpecial,
    }),
    onSuccess: async () => {
      msgApi.success("已添加尺码")
      setNewSizeCode(""); setNewSizeSpecial(false)
      await refreshCurrentItem(currentItem!.id)
      onChanged()
    },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "添加失败")),
  })

  const deleteSizeMutation = useMutation({
    mutationFn: (sizeId: string) => deleteInquiryStyleSize(currentItem!.id, sizeId),
    onSuccess: async () => {
      msgApi.success("已删除尺码")
      await refreshCurrentItem(currentItem!.id)
      onChanged()
    },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "删除失败")),
  })

  return (
    <Drawer
      title={isCreate ? "新增款式" : "编辑款式"}
      open={open}
      onClose={onClose}
      width={560}
      destroyOnClose
      extra={canEdit && (
        <Button type="primary" icon={<SaveOutlined />} loading={saveMutation.isPending} onClick={() => form.submit()}>
          保存
        </Button>
      )}
    >
      {ctx}
      <Form
        form={form}
        layout="vertical"
        disabled={!canEdit}
        onFinish={values => {
          const payload = { ...values }
          if (payload.quantity === undefined) payload.quantity = null
          saveMutation.mutate(payload)
        }}
      >
        <Form.Item
          label="品名" name="product_name"
          rules={[{ required: true, message: "品名不能为空" }]}
        >
          <Input placeholder="例如：男童泳裤" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="款号" name="style_no">
              <Input placeholder="例如：A001" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="产品品类" name="product_category">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="系列" name="series_name">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="数量" name="quantity">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="报价单填报人" name="quote_prepared_by">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="原始尺码范围" name="size_range">
              <Input placeholder="例如：XS-XL" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="原始工艺说明" name="process_description">
          <Input.TextArea rows={2} placeholder="例如：环保面料，UV50+，热压无缝，内置胸垫" />
        </Form.Item>
        <Form.Item label="备注" name="remark">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>

      {!isCreate && currentItem && (
        <>
          <Typography.Title level={5} style={{ marginTop: 8 }}>工艺标签</Typography.Title>
          <Space wrap style={{ marginBottom: 8 }}>
            {currentItem.processes.length === 0 && <Text type="secondary">尚未添加工艺标签</Text>}
            {currentItem.processes.map(p => (
              <Tag
                key={p.id}
                color={p.is_special ? "purple" : "blue"}
                closable={canEdit}
                onClose={e => {
                  e.preventDefault()
                  Modal.confirm({
                    title: "删除工艺标签",
                    content: `确认删除工艺标签「${p.process_tag}」？`,
                    okText: "确认删除", okButtonProps: { danger: true }, cancelText: "取消",
                    onOk: () => deleteProcessMutation.mutate(p.id),
                  })
                }}
              >
                {p.process_tag}（{p.is_special ? "特殊工艺" : "常规工艺"}）
              </Tag>
            ))}
          </Space>
          {canEdit && (
            <Space style={{ marginBottom: 16 }}>
              <Input
                placeholder="工艺标签，如 UV50+"
                value={newProcessTag}
                onChange={e => setNewProcessTag(e.target.value)}
                style={{ width: 160 }}
                onPressEnter={() => newProcessTag.trim() && addProcessMutation.mutate()}
              />
              <Checkbox checked={newProcessSpecial} onChange={e => setNewProcessSpecial(e.target.checked)}>
                特殊工艺
              </Checkbox>
              <Button
                size="small" icon={<PlusOutlined />}
                disabled={!newProcessTag.trim()}
                loading={addProcessMutation.isPending}
                onClick={() => addProcessMutation.mutate()}
              >
                添加
              </Button>
            </Space>
          )}

          <Typography.Title level={5}>尺码信息</Typography.Title>
          <Space wrap style={{ marginBottom: 8 }}>
            {currentItem.sizes.length === 0 && <Text type="secondary">尚未添加标准化尺码</Text>}
            {currentItem.sizes.map(s => (
              <Tag
                key={s.id}
                color={s.is_special_size ? "gold" : "default"}
                closable={canEdit}
                onClose={e => {
                  e.preventDefault()
                  Modal.confirm({
                    title: "删除尺码",
                    content: `确认删除尺码「${s.size_code}」？`,
                    okText: "确认删除", okButtonProps: { danger: true }, cancelText: "取消",
                    onOk: () => deleteSizeMutation.mutate(s.id),
                  })
                }}
              >
                {s.size_code}{s.is_special_size ? "（特殊）" : ""}
              </Tag>
            ))}
          </Space>
          {canEdit && (
            <Space style={{ marginBottom: 16 }}>
              <Input
                placeholder="尺码，如 M / XXL"
                value={newSizeCode}
                onChange={e => setNewSizeCode(e.target.value)}
                style={{ width: 160 }}
                onPressEnter={() => newSizeCode.trim() && addSizeMutation.mutate()}
              />
              <Checkbox checked={newSizeSpecial} onChange={e => setNewSizeSpecial(e.target.checked)}>
                特殊尺码
              </Checkbox>
              <Button
                size="small" icon={<PlusOutlined />}
                disabled={!newSizeCode.trim()}
                loading={addSizeMutation.isPending}
                onClick={() => addSizeMutation.mutate()}
              >
                添加
              </Button>
            </Space>
          )}

          <StyleItemExtraData extraData={currentItem.extra_data} />
        </>
      )}
    </Drawer>
  )
}

function StyleItemsCard({
  inquiryId, canEdit, highlightItemId,
}: { inquiryId: string; canEdit: boolean; highlightItemId?: string }) {
  const queryClient = useQueryClient()
  const [msgApi, ctx] = message.useMessage()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InquiryStyleItem | null>(null)
  const cardRef = React.useRef<HTMLDivElement>(null)

  const { data: items = [], isFetching } = useQuery({
    queryKey: ["inquiry-style-items", inquiryId],
    queryFn: () => fetchInquiryStyleItems(inquiryId),
    enabled: !!inquiryId,
  })

  // 从数据完整度页面"去补录"跳转过来时，带 item_id 自动滚动到对应区域
  // 并高亮该行；不自动打开编辑抽屉，由用户自行点击编辑。
  React.useEffect(() => {
    if (!highlightItemId || items.length === 0) return
    const exists = items.some(it => it.id === highlightItemId)
    if (exists) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightItemId, items.length])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["inquiry-style-items", inquiryId] })
    queryClient.invalidateQueries({ queryKey: ["inquiry", inquiryId] })
    queryClient.invalidateQueries({ queryKey: ["inquiry-warnings", inquiryId] })
    queryClient.invalidateQueries({ queryKey: ["operation-logs"] })
    queryClient.invalidateQueries({ queryKey: ["quote-data-quality"] })
    queryClient.invalidateQueries({ queryKey: ["customer-category-styles"] })
    queryClient.invalidateQueries({ queryKey: ["process-analysis"] })
    queryClient.invalidateQueries({ queryKey: ["size-analysis"] })
    queryClient.invalidateQueries({ queryKey: ["quantity-analysis"] })
    queryClient.invalidateQueries({ queryKey: ["quote-preparer-analysis"] })
    queryClient.invalidateQueries({ queryKey: ["quote-analysis-overview"] })
    queryClient.invalidateQueries({ queryKey: ["data-completion-tasks"] })
    queryClient.invalidateQueries({ queryKey: ["data-completion-dashboard"] })
    queryClient.invalidateQueries({ queryKey: ["active-completion-task"] })
    queryClient.invalidateQueries({ queryKey: ["inquiry-journey", inquiryId] })
  }

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => deleteInquiryStyleItem(itemId),
    onSuccess: () => { msgApi.success("已删除该款式明细"); invalidateAll() },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "删除失败")),
  })

  const openCreate = () => { setEditingItem(null); setDrawerOpen(true) }
  const openEdit = (it: InquiryStyleItem) => { setEditingItem(it); setDrawerOpen(true) }

  const columns = [
    {
      title: "款号", dataIndex: "style_no", width: 90,
      render: (v: string | null) => v || <Text type="secondary">未填写</Text>,
    },
    { title: "品名", dataIndex: "product_name", width: 140, ellipsis: true,
      render: (v: string | null) => v || <Text type="secondary">未填写</Text> },
    { title: "产品品类", dataIndex: "product_category", width: 90,
      render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: "系列", dataIndex: "series_name", width: 100, ellipsis: true,
      render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: "数量", dataIndex: "quantity", width: 70, align: "right" as const,
      render: (v: number | null) => v ?? <Text type="secondary">—</Text> },
    { title: "尺码范围", key: "size_range", width: 150,
      render: (_: unknown, r: InquiryStyleItem) => <StyleSizeRangeCell item={r} /> },
    { title: "报价单填报人", dataIndex: "quote_prepared_by", width: 100,
      render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: "工艺标签", key: "processes", width: 160,
      render: (_: unknown, r: InquiryStyleItem) => <StyleProcessCell item={r} /> },
    { title: "尺码数量", key: "size_count", width: 75, align: "right" as const,
      render: (_: unknown, r: InquiryStyleItem) => r.sizes.length || <Text type="secondary">—</Text> },
    { title: "更新时间", dataIndex: "updated_at", width: 150,
      render: (v: string) => new Date(v).toLocaleString("zh-CN") },
    { title: "补录任务", key: "task", width: 90,
      render: (_: unknown, r: InquiryStyleItem) => <StyleTaskCell itemId={r.id} /> },
    {
      title: "操作", key: "action", width: 110, fixed: "right" as const,
      render: (_: unknown, r: InquiryStyleItem) => canEdit ? (
        <Space size={4}>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm
            title="删除该款式明细？"
            description="将同时删除其工艺标签和尺码记录，不可恢复"
            okText="确认删除" okButtonProps={{ danger: true }} cancelText="取消"
            onConfirm={() => deleteMutation.mutate(r.id)}
          >
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ) : <Text type="secondary">—</Text>,
    },
  ]

  // 注意：Card 的 loading 属性会用 Skeleton 整体替换 children（即卸载/重建
  // 子树），如果把 Drawer 放在受 loading 控制的 children 里，每次列表查询
  // 刷新（新增/编辑/删除任何明细后都会触发）都会把正在编辑中的 Drawer 卸载
  // 重建，导致刚保存的工艺/尺码标签在 Drawer 里又"消失"。所以这里不使用
  // Card.loading，改用 Table 自带的 loading，并把 Drawer 放在 Card 外部。
  return (
    <>
      <div ref={cardRef}>
        <Card
          size="small"
          title="款式明细 / 报价资料"
          extra={canEdit && (
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增款式</Button>
          )}
        >
          {ctx}
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
            用于维护一个询单下各款式的款号、尺码、工艺、数量及报价资料。后续报价资料分析将以这些明细数据为基础。
          </Text>
          {items.length === 0 && !isFetching ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <Text type="secondary">当前询单尚未添加款式明细</Text>
              {canEdit && (
                <div style={{ marginTop: 12 }}>
                  <Button icon={<PlusOutlined />} onClick={openCreate}>新增款式</Button>
                </div>
              )}
            </div>
          ) : (
            <Table<InquiryStyleItem>
              rowKey="id"
              size="small"
              loading={isFetching}
              dataSource={items}
              columns={columns}
              pagination={false}
              scroll={{ x: 1200 }}
              rowClassName={r => r.id === highlightItemId ? "style-item-row-highlight" : ""}
            />
          )}
        </Card>
      </div>

      <StyleItemDrawer
        inquiryId={inquiryId}
        item={editingItem}
        open={drawerOpen}
        canEdit={canEdit}
        onClose={() => setDrawerOpen(false)}
        onChanged={invalidateAll}
      />

      <style>{`
        .style-item-row-highlight td { background-color: #fffbe6 !important; }
      `}</style>
    </>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const [editing, setEditing] = useState(false)
  const [msgApi, ctx] = message.useMessage()
  const [searchParams] = useSearchParams()
  const highlightItemId = searchParams.get("item_id") || undefined

  const canEdit     = currentUser.role !== "viewer"
  const canDelete   = currentUser.role === "admin"
  const canTransfer = currentUser.role !== "viewer"

  const { data: inq, isLoading, isError } = useQuery({
    queryKey: ["inquiry", id],
    queryFn: () => fetchInquiry(id!),
    enabled: !!id,
  })

  // 询单级字段（含 quote_status / order_status）编辑或删除后，除了走"analytics-*"
  // 前缀的旧分析页面，还要顺带失效报价资料分析 Step 4-8 用到的独立 query key——
  // 这些 key 不带 "analytics" 前缀，靠上面的 predicate 捞不到。
  const invalidateReportAnalysisQueries = () => {
    for (const key of [
      "quote-data-quality", "customer-category-styles",
      "process-analysis", "size-analysis", "quantity-analysis",
      "quote-preparer-analysis", "quote-analysis-overview",
      "data-completion-tasks", "data-completion-dashboard", "operation-logs",
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
    queryClient.invalidateQueries({ queryKey: ["inquiry-journey", id] })
  }

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: (body: Partial<InquiryItem>) => updateInquiry(id!, body),
    onSuccess: updated => {
      queryClient.setQueryData(["inquiry", id], updated)
      queryClient.invalidateQueries({ queryKey: ["inquiries"] })
      queryClient.invalidateQueries({
        predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("analytics"),
      })
      invalidateReportAnalysisQueries()
      setEditing(false)
      msgApi.success("保存成功")
    },
    onError: (e: Error) => msgApi.error(`保存失败：${e.message}`),
  })

  const { mutate: doDelete, isPending: deleting } = useMutation({
    mutationFn: () => deleteInquiry(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inquiries"] })
      queryClient.invalidateQueries({
        predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("analytics"),
      })
      invalidateReportAnalysisQueries()
      msgApi.success("删除成功")
      setTimeout(() => navigate("/"), 800)
    },
    onError: (e: Error) => msgApi.error(`删除失败：${e.message}`),
  })

  if (isLoading) return <div style={{ padding: 40, textAlign: "center" }}><Spin size="large" /></div>
  if (isError || !inq) return (
    <div style={{ padding: 40 }}>
      <Text type="danger">加载失败，</Text>
      <a onClick={() => navigate(-1)}>返回</a>
    </div>
  )

  const statusColor = ORDER_STATUS_COLOR[inq.order_status ?? ""] ?? "default"

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      {ctx}

      {/* 面包屑 */}
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <span style={{ cursor: "pointer" }} onClick={() => navigate("/")}><HomeOutlined /> 全公司</span> },
          inq.group_name ? { title: <span style={{ cursor: "pointer" }} onClick={() => navigate(`/group/${encodeURIComponent(inq.group_name!)}`) }>{inq.group_name}</span> } : null,
          inq.responsible_sales && inq.group_name ? { title: <span style={{ cursor: "pointer" }} onClick={() => navigate(`/group/${encodeURIComponent(inq.group_name!)}/sales/${encodeURIComponent(inq.responsible_sales!)}`)}>{inq.responsible_sales}</span> } : null,
          { title: inq.inquiry_no },
        ].filter(Boolean) as any[]}
      />

      {/* 标题栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>{inq.inquiry_no}</Title>
        {inq.order_status && (
          <Badge status={statusColor as any} text={<Text strong style={{ fontSize: 14 }}>{inq.order_status}</Text>} />
        )}
        {inq.customer_short_name && (
          <Tag
            color="blue"
            style={{ cursor: "pointer", fontSize: 13 }}
            onClick={() => inq.customer_code && navigate(`/customer/${encodeURIComponent(inq.customer_code)}`)}
          >
            {inq.customer_short_name}
          </Tag>
        )}
        <div style={{ flex: 1 }} />
        <Button onClick={() => navigate(`/inquiry/${id}/journey`)}>查看来龙去脉表</Button>
        {!editing && canEdit && (
          <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>编辑</Button>
        )}
        {canDelete && (
          <Popconfirm
            title="确认删除该询单？"
            description="删除后不可恢复"
            okText="确认删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => doDelete()}
          >
            <Button danger icon={<DeleteOutlined />} loading={deleting}>删除</Button>
          </Popconfirm>
        )}
      </div>

      {/* 编辑区 */}
      {editing && (
        <Card size="small" style={{ marginBottom: 16, borderColor: "#1677ff" }}>
          <EditForm
            inquiry={inq}
            onSave={save}
            onCancel={() => setEditing(false)}
            saving={saving}
          />
        </Card>
      )}

      {/* ── 信息分区 ── */}
      <Row gutter={[16, 16]}>

        {/* 客户信息 */}
        <Col span={24}>
          <Card size="small" title="客户信息">
            <Descriptions size="small" column={4} bordered>
              <Descriptions.Item label="客户代码">{val(inq.customer_code)}</Descriptions.Item>
              <Descriptions.Item label="客户简称">{val(inq.customer_short_name)}</Descriptions.Item>
              <Descriptions.Item label="客户全称">{val(inq.customer_name)}</Descriptions.Item>
              <Descriptions.Item label="客户类别">{val(inq.customer_category)}</Descriptions.Item>
              <Descriptions.Item label="国家">{val(inq.country)}</Descriptions.Item>
              <Descriptions.Item label="地区">{val(inq.region)}</Descriptions.Item>
              <Descriptions.Item label="客户订单号">{val(inq.customer_order_no)}</Descriptions.Item>
              <Descriptions.Item label="询单年/月">
                {inq.inquiry_year ? `${inq.inquiry_year} / ${inq.inquiry_month ?? "—"}` : <Text type="secondary">—</Text>}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 产品 & 询单 */}
        <Col span={24}>
          <Card size="small" title="产品 & 询单信息">
            <Descriptions size="small" column={4} bordered>
              <Descriptions.Item label="产品大类">{val(inq.product_category)}</Descriptions.Item>
              <Descriptions.Item label="品名" span={2}>{val(inq.product_name)}</Descriptions.Item>
              <Descriptions.Item label="季节">{val(inq.season)}</Descriptions.Item>
              <Descriptions.Item label="系列" span={2}>{val(inq.series_name)}</Descriptions.Item>
              <Descriptions.Item label="询单数量">{val(inq.quantity, "", " 件")}</Descriptions.Item>
              <Descriptions.Item label="询单日期">{val(inq.inquiry_date)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 归属 */}
        <Col span={12}>
          <Card size="small" title="归属信息" style={{ height: "100%" }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="所属小组">
                {inq.group_name
                  ? <a onClick={() => navigate(`/group/${encodeURIComponent(inq.group_name!)}`)}>{inq.group_name}</a>
                  : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="负责业务员">
                {inq.responsible_sales && inq.group_name
                  ? <a onClick={() => navigate(`/group/${encodeURIComponent(inq.group_name!)}/sales/${encodeURIComponent(inq.responsible_sales!)}`) }>{inq.responsible_sales}</a>
                  : val(inq.responsible_sales)}
              </Descriptions.Item>
              <Descriptions.Item label="协助业务员">{val(inq.assisting_sales)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 报价信息 */}
        <Col span={12}>
          <Card size="small" title="报价信息" style={{ height: "100%" }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="报价情况">{val(inq.quote_status)}</Descriptions.Item>
              <Descriptions.Item label="最终报价">{money(inq.final_quote)}</Descriptions.Item>
              <Descriptions.Item label="工厂价格">{money(inq.factory_price, "¥")}</Descriptions.Item>
              <Descriptions.Item label="毛利率">{pct(inq.gross_profit_rate)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 订单信息 */}
        <Col span={24}>
          <Card size="small" title="订单信息">
            <Descriptions size="small" column={5} bordered>
              <Descriptions.Item label="订单状态">
                <StatusBadge status={inq.order_status} />
              </Descriptions.Item>
              <Descriptions.Item label="下单单价">{money(inq.order_unit_price)}</Descriptions.Item>
              <Descriptions.Item label="下单数量">{val(inq.order_quantity, "", " 件")}</Descriptions.Item>
              <Descriptions.Item label="贸易额">{money(inq.trade_amount)}</Descriptions.Item>
              <Descriptions.Item label="下单日期">{val(inq.order_date)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 备注 */}
        {(inq.remark || editing) && (
          <Col span={24}>
            <Card size="small" title="备注">
              <Text>{inq.remark ?? <Text type="secondary">暂无备注</Text>}</Text>
            </Card>
          </Col>
        )}

        {/* 预警信息 */}
        <Col span={24}>
          <WarningsCard inquiryId={id!} canResolve={canEdit} />
        </Col>

        {/* 一键转单 */}
        <Col span={24}>
          <TransferCard
            inquiryId={id!}
            orderStatus={inq.order_status}
            canTransfer={canTransfer}
          />
        </Col>

        {/* 工厂报价录入 */}
        <Col span={24} id="factory-quote">
          <FactoryQuoteCard inquiryId={id!} canEdit={canEdit} />
        </Col>

        {/* 打样记录 */}
        <Col span={24}>
          <SampleCard inquiryId={id!} inquiry={inq} canEdit={canEdit} />
        </Col>

        {/* 生产跟单 */}
        <Col span={24}>
          <ProductionCard inquiryId={id!} />
        </Col>

        {/* 款式明细 / 报价资料 */}
        <Col span={24}>
          <StyleItemsCard inquiryId={id!} canEdit={canEdit} highlightItemId={highlightItemId} />
        </Col>

        {/* 系统信息 */}
        <Col span={24}>
          <Card size="small" title="系统信息">
            <Descriptions size="small" column={4} bordered>
              <Descriptions.Item label="询单 ID">
                <Text code style={{ fontSize: 11 }}>{inq.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="导入批次 ID">
                {inq.import_batch_id
                  ? <Text code style={{ fontSize: 11 }}>{String(inq.import_batch_id).slice(0, 8)}…</Text>
                  : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {inq.created_at ? new Date(inq.created_at).toLocaleString("zh-CN") : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="最后更新">
                {inq.updated_at ? new Date(inq.updated_at).toLocaleString("zh-CN") : "—"}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

      </Row>
    </div>
  )
}
