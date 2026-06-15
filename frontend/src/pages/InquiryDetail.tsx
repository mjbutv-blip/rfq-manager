import React, { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, Badge, Breadcrumb, Button, Card, Col, DatePicker,
  Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Row, Select,
  Space, Spin, Table, Tag, Tooltip, Typography, message,
} from "antd"
import { CheckOutlined, FileExcelOutlined, SendOutlined } from "@ant-design/icons"
import {
  ArrowLeftOutlined, DeleteOutlined, EditOutlined, HomeOutlined,
  SaveOutlined, CloseOutlined,
} from "@ant-design/icons"
import dayjs from "dayjs"

import { deleteInquiry, fetchInquiry, updateInquiry } from "@/api/inquiries"
import { fetchInquiryWarnings, resolveWarning } from "@/api/warnings"
import { createTransfer, fetchInquiryTransfers, getFactoryContractUrl, getFinanceTransferUrl } from "@/api/transfers"
import { createQuoteRecord, fetchInquiryFactoryQuoteRecords } from "@/api/factories"
import { createSample, fetchInquirySamples } from "@/api/samples"
import { fetchInquiryProductions } from "@/api/productions"
import { PRODUCTION_STATUS_COLOR, PRODUCTION_STATUS_LABEL } from "@/types/production"
import { SAMPLE_STATUS_COLOR, SAMPLE_STATUS_LABEL, SAMPLE_TYPE_LABEL, SAMPLE_TYPE_OPTIONS, FEE_PAID_BY_OPTIONS } from "@/types/sample"
import { useCurrentUser } from "@/contexts/UserContext"
import type { InquiryItem } from "@/types/inquiry"
import { ORDER_STATUS_COLOR, ORDER_STATUS_OPTIONS, QUOTE_STATUS_OPTIONS } from "@/types/inquiry"
import type { InquiryWarning } from "@/types/warning"
import { WARNING_LEVEL_COLOR, WARNING_LEVEL_LABEL, WARNING_TYPE_LABEL } from "@/types/warning"
import type { TransferOrder, TransferResponse } from "@/types/transfer"
import { TRANSFER_STATUS_COLOR, TRANSFER_STATUS_LABEL } from "@/types/transfer"

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

function FactoryQuoteCard({ inquiryId, inquiry, canEdit }: {
  inquiryId: string
  inquiry: InquiryItem
  canEdit: boolean
}) {
  const [msgApi, ctx] = message.useMessage()
  const [showAdd, setShowAdd] = useState(false)
  const [addForm] = Form.useForm()

  const { data: records = [], refetch } = useQuery({
    queryKey: ["inquiry-factory-qr", inquiryId],
    queryFn: () => fetchInquiryFactoryQuoteRecords(inquiryId),
  })

  const addMutation = useMutation({
    mutationFn: createQuoteRecord,
    onSuccess: () => {
      msgApi.success("工厂报价记录已保存")
      setShowAdd(false)
      addForm.resetFields()
      refetch()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      msgApi.error(msg ?? "保存失败")
    },
  })

  const columns = [
    { title: "工厂", dataIndex: "factory_name", width: 120, render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
    { title: "报价日期", dataIndex: "quote_date", width: 90 },
    { title: "产品大类", dataIndex: "product_category", width: 80, render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
    { title: "工厂价(CNY)", dataIndex: "factory_price", width: 100, align: "right" as const,
      render: (v: number | null) => v != null ? `¥${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : <Text type="secondary">—</Text> },
    { title: "是否下单", dataIndex: "is_ordered", width: 75,
      render: (v: boolean) => <Tag color={v ? "green" : "default"}>{v ? "已下单" : "未下单"}</Tag> },
    { title: "备注", dataIndex: "remark", width: 100, ellipsis: true, render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
  ]

  return (
    <>
      {ctx}
      <Card
        size="small"
        title="工厂报价记录"
        extra={canEdit && (
          <Button size="small" icon={<CheckOutlined />} onClick={() => {
            addForm.setFieldsValue({
              product_category: inquiry.product_category,
              product_name: inquiry.product_name,
              series_name: inquiry.series_name,
              quantity: inquiry.order_quantity,
              factory_price: inquiry.factory_price,
              order_status: inquiry.order_status,
              is_ordered: ["下单","已下单","确认转单"].includes(inquiry.order_status ?? ""),
            })
            setShowAdd(true)
          }}>
            新增工厂报价
          </Button>
        )}
      >
        {records.length === 0
          ? <Text type="secondary">暂无工厂报价记录</Text>
          : <Table
              rowKey="id"
              columns={columns}
              dataSource={records}
              size="small"
              pagination={false}
              scroll={{ x: 600 }}
            />}
      </Card>

      <Modal
        title="新增工厂报价记录"
        open={showAdd}
        onCancel={() => { setShowAdd(false); addForm.resetFields() }}
        onOk={() => addForm.submit()}
        confirmLoading={addMutation.isPending}
        width={600}
      >
        <Form
          form={addForm}
          layout="vertical"
          size="small"
          onFinish={values => {
            const payload = {
              ...values,
              inquiry_id: inquiryId,
              inquiry_no: inquiry.inquiry_no,
            }
            if (values.quote_date) payload.quote_date = values.quote_date.format("YYYY-MM-DD")
            addMutation.mutate(payload)
          }}
        >
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="factory_id" label="选择工厂 (ID)" rules={[{ required: true, message: "请输入工厂 ID" }]}>
                <Input placeholder="从工厂档案页复制工厂 ID" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="quote_date" label="报价日期">
                <DatePicker style={{ width: "100%" }} defaultValue={dayjs()} />
              </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="product_category" label="产品大类"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="product_name" label="产品名称"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="series_name" label="系列"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="quantity" label="数量"><InputNumber style={{ width: "100%" }} min={0} /></Form.Item></Col>
            <Col span={6}><Form.Item name="factory_price" label="工厂价(CNY)"><InputNumber style={{ width: "100%" }} prefix="¥" precision={4} min={0} /></Form.Item></Col>
            <Col span={6}><Form.Item name="is_ordered" label="是否下单" initialValue={false}>
              <Select options={[{ label: "未下单", value: false }, { label: "已下单", value: true }]} />
            </Form.Item></Col>
            <Col span={6}><Form.Item name="trade_amount" label="贸易额(USD)"><InputNumber style={{ width: "100%" }} prefix="$" precision={2} min={0} /></Form.Item></Col>
            <Col span={24}><Form.Item name="remark" label="备注"><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
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

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const [editing, setEditing] = useState(false)
  const [msgApi, ctx] = message.useMessage()

  const canEdit     = currentUser.role !== "viewer"
  const canDelete   = currentUser.role === "admin"
  const canTransfer = currentUser.role !== "viewer"

  const { data: inq, isLoading, isError } = useQuery({
    queryKey: ["inquiry", id],
    queryFn: () => fetchInquiry(id!),
    enabled: !!id,
  })

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: (body: Partial<InquiryItem>) => updateInquiry(id!, body),
    onSuccess: updated => {
      queryClient.setQueryData(["inquiry", id], updated)
      queryClient.invalidateQueries({ queryKey: ["inquiries"] })
      queryClient.invalidateQueries({
        predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("analytics"),
      })
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

        {/* 工厂报价记录 */}
        <Col span={24}>
          <FactoryQuoteCard inquiryId={id!} inquiry={inq} canEdit={canEdit} />
        </Col>

        {/* 打样记录 */}
        <Col span={24}>
          <SampleCard inquiryId={id!} inquiry={inq} canEdit={canEdit} />
        </Col>

        {/* 生产跟单 */}
        <Col span={24}>
          <ProductionCard inquiryId={id!} />
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
