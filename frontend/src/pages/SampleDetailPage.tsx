import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import {
  Button, Card, Col, DatePicker, Descriptions, Form, Input, InputNumber,
  message, Modal, Popconfirm, Row, Select, Spin, Tag, Typography,
} from "antd"
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons"
import dayjs from "dayjs"

import { deleteSample, fetchSample, updateSample } from "@/api/samples"
import type { SampleRecord } from "@/types/sample"
import {
  FINAL_RESULT_COLOR, FINAL_RESULT_LABEL, FINAL_RESULT_OPTIONS,
  FEE_PAID_BY_LABEL, FEE_PAID_BY_OPTIONS,
  FEE_PAYMENT_STATUS_LABEL, FEE_PAYMENT_STATUS_OPTIONS,
  SAMPLE_STATUS_COLOR, SAMPLE_STATUS_LABEL, SAMPLE_STATUS_OPTIONS,
  SAMPLE_TYPE_LABEL, SAMPLE_TYPE_OPTIONS,
} from "@/types/sample"
import { useCurrentUser } from "@/contexts/UserContext"

const { Title, Text } = Typography

function EditModal({
  sample,
  open,
  onClose,
}: {
  sample: SampleRecord
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form] = Form.useForm()

  const { mutate, isPending } = useMutation({
    mutationFn: (values: Record<string, unknown>) => updateSample(sample.id, values),
    onSuccess: updated => {
      qc.setQueryData(["sample", sample.id], updated)
      qc.invalidateQueries({ queryKey: ["samples"] })
      qc.invalidateQueries({ queryKey: ["sample-stats"] })
      message.success("保存成功")
      onClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(msg ?? "保存失败")
    },
  })

  const handleOk = () => {
    form.validateFields().then(values => {
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(values)) {
        if (v !== undefined && v !== null) {
          clean[k] = dayjs.isDayjs(v) ? v.format("YYYY-MM-DD") : v
        }
      }
      mutate(clean)
    })
  }

  return (
    <Modal
      title={`编辑打样记录 ${sample.sample_no}`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={isPending}
      width={680}
      destroyOnClose
      afterOpenChange={vis => {
        if (vis) {
          form.setFieldsValue({
            ...sample,
            assigned_to_factory_at: sample.assigned_to_factory_at ? dayjs(sample.assigned_to_factory_at) : null,
            factory_due_date:       sample.factory_due_date       ? dayjs(sample.factory_due_date)       : null,
            sample_sent_at:         sample.sample_sent_at         ? dayjs(sample.sample_sent_at)         : null,
            customer_received_at:   sample.customer_received_at   ? dayjs(sample.customer_received_at)   : null,
          })
        }
      }}
    >
      <Form form={form} layout="vertical" size="small">
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="sample_type" label="打样类型">
              <Select options={SAMPLE_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="sample_quantity" label="数量">
              <InputNumber style={{ width: "100%" }} min={1} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="sample_status" label="打样状态">
              <Select options={SAMPLE_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="assigned_to_factory_at" label="分配工厂日期">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="factory_due_date" label="工厂预计交期">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="sample_sent_at" label="实际寄样日期">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="courier_company" label="快递公司">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="tracking_no" label="快递单号">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="customer_received_at" label="客户收到日期">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="revision_count" label="修改次数">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="final_result" label="最终结果">
              <Select options={FINAL_RESULT_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="customer_feedback" label="客户反馈">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="sample_fee" label="打样费用">
              <InputNumber style={{ width: "100%" }} min={0} precision={2} prefix="¥" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="fee_paid_by" label="费用承担方">
              <Select options={FEE_PAID_BY_OPTIONS} allowClear />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="fee_payment_status" label="付款状态">
              <Select options={FEE_PAYMENT_STATUS_OPTIONS} allowClear />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="factory_name" label="工厂名称">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="responsible_sales" label="负责业务员">
              <Input />
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
  )
}

export default function SampleDetailPage() {
  const { sampleId } = useParams<{ sampleId: string }>()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const canEdit = user.role !== "viewer"
  const isAdmin = user.role === "admin"

  const { data: sample, isLoading, isError } = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => fetchSample(sampleId!),
    enabled: !!sampleId,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteSample(sampleId!),
    onSuccess: () => {
      message.success("打样记录已删除")
      qc.invalidateQueries({ queryKey: ["samples"] })
      navigate("/samples")
    },
  })

  if (isLoading) return <div style={{ padding: 40, textAlign: "center" }}><Spin size="large" /></div>
  if (isError || !sample) return <div style={{ padding: 24 }}>加载失败</div>

  const statusColor = SAMPLE_STATUS_COLOR[sample.sample_status] ?? "default"
  const statusLabel = SAMPLE_STATUS_LABEL[sample.sample_status] ?? sample.sample_status

  const isOverdue = sample.factory_due_date
    && dayjs(sample.factory_due_date).isBefore(dayjs(), "day")
    && !["approved", "rejected", "cancelled", "sent", "received"].includes(sample.sample_status)

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/samples")}>返回</Button>
          <Title level={4} style={{ margin: 0 }}>{sample.sample_no}</Title>
          <Tag color={statusColor}>{statusLabel}</Tag>
          {isOverdue && <Tag color="red">逾期</Tag>}
          {sample.final_result && sample.final_result !== "pending" && (
            <Tag color={FINAL_RESULT_COLOR[sample.final_result] ?? "default"}>
              {FINAL_RESULT_LABEL[sample.final_result] ?? sample.final_result}
            </Tag>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
              编辑
            </Button>
          )}
          {isAdmin && (
            <Popconfirm
              title="确认删除该打样记录？此操作不可恢复。"
              onConfirm={() => deleteMutation.mutate()}
              okText="删除" cancelText="取消" okType="danger"
            >
              <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending}>删除</Button>
            </Popconfirm>
          )}
        </div>
      </div>

      <Row gutter={16}>
        {/* 基础信息 */}
        <Col span={24} style={{ marginBottom: 16 }}>
          <Card title="基础信息" size="small">
            <Descriptions column={3} size="small">
              <Descriptions.Item label="打样编号">{sample.sample_no}</Descriptions.Item>
              <Descriptions.Item label="打样类型">
                {sample.sample_type ? SAMPLE_TYPE_LABEL[sample.sample_type] ?? sample.sample_type : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="打样数量">
                {sample.sample_quantity ?? <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="打样状态">
                <Tag color={statusColor}>{statusLabel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="修改次数">{sample.revision_count}</Descriptions.Item>
              <Descriptions.Item label="最终结果">
                {sample.final_result !== "pending"
                  ? <Tag color={FINAL_RESULT_COLOR[sample.final_result]}>{FINAL_RESULT_LABEL[sample.final_result]}</Tag>
                  : <Text type="secondary">待定</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="负责业务员">{sample.responsible_sales ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="所属小组">{sample.group_name ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="创建人">{sample.created_by ?? <Text type="secondary">—</Text>}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 关联信息 */}
        <Col span={12} style={{ marginBottom: 16 }}>
          <Card title="关联询单 / 客户" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="询单号">
                {sample.inquiry_no
                  ? <a onClick={() => navigate(`/inquiry/${sample.inquiry_id}`)}>{sample.inquiry_no}</a>
                  : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="客户简称">{sample.customer_short_name ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="产品大类">{sample.product_category ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="品名">{sample.product_name ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="系列">{sample.series_name ?? <Text type="secondary">—</Text>}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col span={12} style={{ marginBottom: 16 }}>
          <Card title="关联工厂" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="工厂名称">
                {sample.factory_id
                  ? <a onClick={() => navigate(`/factories/${sample.factory_id}`)}>{sample.factory_name}</a>
                  : (sample.factory_name ?? <Text type="secondary">—</Text>)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 进度 */}
        <Col span={12} style={{ marginBottom: 16 }}>
          <Card title="进度信息" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="分配工厂日期">
                {sample.assigned_to_factory_at ?? <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="工厂预计交期">
                {sample.factory_due_date
                  ? <Text style={{ color: isOverdue ? "#ff4d4f" : undefined }}>{sample.factory_due_date}</Text>
                  : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="实际寄样日期">
                {sample.sample_sent_at ?? <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="客户收到日期">
                {sample.customer_received_at ?? <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="快递公司">
                {sample.courier_company ?? <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="快递单号">
                {sample.tracking_no ?? <Text type="secondary">—</Text>}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 费用 */}
        <Col span={12} style={{ marginBottom: 16 }}>
          <Card title="费用信息" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="打样费用">
                {sample.sample_fee != null ? `¥${Number(sample.sample_fee).toFixed(2)}` : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="费用承担方">
                {sample.fee_paid_by ? FEE_PAID_BY_LABEL[sample.fee_paid_by] ?? sample.fee_paid_by : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="付款状态">
                {sample.fee_payment_status ? FEE_PAYMENT_STATUS_LABEL[sample.fee_payment_status] ?? sample.fee_payment_status : <Text type="secondary">—</Text>}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 客户反馈 */}
        <Col span={24} style={{ marginBottom: 16 }}>
          <Card title="客户反馈" size="small">
            {sample.customer_feedback
              ? <Text style={{ whiteSpace: "pre-wrap" }}>{sample.customer_feedback}</Text>
              : <Text type="secondary">暂无反馈</Text>}
          </Card>
        </Col>

        {/* 备注 */}
        {sample.remark && (
          <Col span={24} style={{ marginBottom: 16 }}>
            <Card title="备注" size="small">
              <Text style={{ whiteSpace: "pre-wrap" }}>{sample.remark}</Text>
            </Card>
          </Col>
        )}
      </Row>

      {/* 系统信息 */}
      <div style={{ color: "#999", fontSize: 12, marginTop: 8 }}>
        创建时间：{sample.created_at?.slice(0, 19).replace("T", " ")}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        更新时间：{sample.updated_at?.slice(0, 19).replace("T", " ")}
      </div>

      <EditModal sample={sample} open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  )
}
