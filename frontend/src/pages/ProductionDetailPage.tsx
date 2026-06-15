import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import {
  Button, Card, Col, DatePicker, Descriptions, Form, Input, InputNumber,
  message, Modal, Popconfirm, Row, Select, Spin, Tag, Typography,
} from "antd"
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons"
import dayjs from "dayjs"

import { deleteProduction, fetchProduction, updateProduction } from "@/api/productions"
import type { ProductionRecord } from "@/types/production"
import {
  DELAY_RISK_COLOR, DELAY_RISK_LABEL, DELAY_RISK_OPTIONS,
  INSPECTION_STATUS_COLOR, INSPECTION_STATUS_LABEL, INSPECTION_STATUS_OPTIONS,
  MATERIAL_STATUS_COLOR, MATERIAL_STATUS_LABEL, MATERIAL_STATUS_OPTIONS,
  PRODUCTION_STATUS_COLOR, PRODUCTION_STATUS_LABEL, PRODUCTION_STATUS_OPTIONS,
  SCHEDULE_STATUS_COLOR, SCHEDULE_STATUS_LABEL, SCHEDULE_STATUS_OPTIONS,
} from "@/types/production"
import { useCurrentUser } from "@/contexts/UserContext"

const { Title, Text } = Typography

function EditModal({ rec, open, onClose }: { rec: ProductionRecord; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form] = Form.useForm()

  const { mutate, isPending } = useMutation({
    mutationFn: (values: Record<string, unknown>) => updateProduction(rec.id, values),
    onSuccess: updated => {
      qc.setQueryData(["production", rec.id], updated)
      qc.invalidateQueries({ queryKey: ["productions"] })
      qc.invalidateQueries({ queryKey: ["production-stats"] })
      message.success("保存成功")
      onClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(msg ?? "保存失败")
    },
  })

  return (
    <Modal
      title={`编辑生产跟单 ${rec.production_no}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.validateFields().then(values => {
        const clean: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(values)) {
          if (v !== undefined && v !== null) {
            clean[k] = dayjs.isDayjs(v) ? v.format("YYYY-MM-DD") : v
          }
        }
        mutate(clean)
      })}
      confirmLoading={isPending}
      width={720}
      destroyOnClose
      afterOpenChange={vis => {
        if (vis) {
          form.setFieldsValue({
            ...rec,
            order_date:         rec.order_date         ? dayjs(rec.order_date)         : null,
            delivery_date:      rec.delivery_date      ? dayjs(rec.delivery_date)      : null,
            actual_finish_date: rec.actual_finish_date ? dayjs(rec.actual_finish_date) : null,
          })
        }
      }}
    >
      <Form form={form} layout="vertical" size="small">
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="production_status" label="生产状态">
              <Select options={PRODUCTION_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="delay_risk_level" label="延期风险">
              <Select options={DELAY_RISK_OPTIONS} allowClear />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="delivery_date" label="预计交期">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item name="fabric_status" label="面料进度">
              <Select options={MATERIAL_STATUS_OPTIONS} allowClear />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="accessory_status" label="辅料进度">
              <Select options={MATERIAL_STATUS_OPTIONS} allowClear />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="production_schedule_status" label="排产进度">
              <Select options={SCHEDULE_STATUS_OPTIONS} allowClear />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item name="first_inspection_status" label="头查状态">
              <Select options={INSPECTION_STATUS_OPTIONS} allowClear />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="mid_inspection_status" label="中查状态">
              <Select options={INSPECTION_STATUS_OPTIONS} allowClear />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="final_inspection_status" label="尾查状态">
              <Select options={INSPECTION_STATUS_OPTIONS} allowClear />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item name="order_quantity" label="订单数量">
              <InputNumber style={{ width: "100%" }} min={1} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="order_unit_price" label="下单单价">
              <InputNumber style={{ width: "100%" }} min={0} precision={4} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="actual_finish_date" label="实际完成日期">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item name="factory_name" label="工厂名称">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="merchandiser" label="跟单员">
              <Input />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item name="delay_reason" label="延期原因">
              <Input.TextArea rows={2} />
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

function StatusTag({ value, labelMap, colorMap }: { value: string | null; labelMap: Record<string, string>; colorMap: Record<string, string> }) {
  if (!value) return <Text type="secondary">—</Text>
  return <Tag color={colorMap[value] ?? "default"}>{labelMap[value] ?? value}</Tag>
}

export default function ProductionDetailPage() {
  const { productionId } = useParams<{ productionId: string }>()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const canEdit = user.role !== "viewer"
  const isAdmin = user.role === "admin"

  const { data: rec, isLoading, isError } = useQuery({
    queryKey: ["production", productionId],
    queryFn: () => fetchProduction(productionId!),
    enabled: !!productionId,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteProduction(productionId!),
    onSuccess: () => {
      message.success("生产跟单已删除")
      qc.invalidateQueries({ queryKey: ["productions"] })
      navigate("/productions")
    },
  })

  if (isLoading) return <div style={{ padding: 40, textAlign: "center" }}><Spin size="large" /></div>
  if (isError || !rec) return <div style={{ padding: 24 }}>加载失败</div>

  const isOverdue = rec.delivery_date
    && dayjs(rec.delivery_date).isBefore(dayjs(), "day")
    && !["completed", "shipped", "cancelled"].includes(rec.production_status)

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/productions")}>返回</Button>
          <Title level={4} style={{ margin: 0 }}>{rec.production_no}</Title>
          <Tag color={PRODUCTION_STATUS_COLOR[rec.production_status] ?? "default"}>
            {PRODUCTION_STATUS_LABEL[rec.production_status] ?? rec.production_status}
          </Tag>
          {isOverdue && <Tag color="red">已逾期</Tag>}
          {rec.delay_risk_level && rec.delay_risk_level !== "none" && (
            <Tag color={DELAY_RISK_COLOR[rec.delay_risk_level]}>{DELAY_RISK_LABEL[rec.delay_risk_level]}</Tag>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>编辑</Button>
          )}
          {isAdmin && (
            <Popconfirm
              title="确认删除该生产跟单？此操作不可恢复。"
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
            <Descriptions column={4} size="small">
              <Descriptions.Item label="跟单编号">{rec.production_no}</Descriptions.Item>
              <Descriptions.Item label="询单号">
                {rec.inquiry_id
                  ? <a onClick={() => navigate(`/inquiry/${rec.inquiry_id}`)}>{rec.inquiry_no}</a>
                  : (rec.inquiry_no ?? <Text type="secondary">—</Text>)}
              </Descriptions.Item>
              <Descriptions.Item label="客户">{rec.customer_short_name ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="品名">{rec.product_name ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="系列">{rec.series_name ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="产品大类">{rec.product_category ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="负责业务员">{rec.responsible_sales ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="跟单员">{rec.merchandiser ?? <Text type="secondary">—</Text>}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 订单 & 工厂 */}
        <Col span={12} style={{ marginBottom: 16 }}>
          <Card title="订单信息" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="工厂">
                {rec.factory_id
                  ? <a onClick={() => navigate(`/factories/${rec.factory_id}`)}>{rec.factory_name}</a>
                  : (rec.factory_name ?? <Text type="secondary">—</Text>)}
              </Descriptions.Item>
              <Descriptions.Item label="订单数量">{rec.order_quantity ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="下单单价">
                {rec.order_unit_price != null ? `$${Number(rec.order_unit_price).toFixed(4)}` : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="贸易金额">
                {rec.trade_amount != null ? `$${Number(rec.trade_amount).toFixed(2)}` : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="下单日期">{rec.order_date ?? <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="预计交期">
                {rec.delivery_date
                  ? <Text style={{ color: isOverdue ? "#ff4d4f" : undefined, fontWeight: isOverdue ? 600 : undefined }}>
                      {rec.delivery_date}
                    </Text>
                  : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="实际完成日期">{rec.actual_finish_date ?? <Text type="secondary">—</Text>}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 延期风险 */}
        <Col span={12} style={{ marginBottom: 16 }}>
          <Card title="延期风险" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="延期风险等级">
                <StatusTag value={rec.delay_risk_level} labelMap={DELAY_RISK_LABEL} colorMap={DELAY_RISK_COLOR} />
              </Descriptions.Item>
              <Descriptions.Item label="延期原因" span={2}>
                {rec.delay_reason ? <Text>{rec.delay_reason}</Text> : <Text type="secondary">—</Text>}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 生产进度 */}
        <Col span={24} style={{ marginBottom: 16 }}>
          <Card title="生产进度" size="small">
            <Descriptions column={3} size="small">
              <Descriptions.Item label="面料进度">
                <StatusTag value={rec.fabric_status} labelMap={MATERIAL_STATUS_LABEL} colorMap={MATERIAL_STATUS_COLOR} />
              </Descriptions.Item>
              <Descriptions.Item label="辅料进度">
                <StatusTag value={rec.accessory_status} labelMap={MATERIAL_STATUS_LABEL} colorMap={MATERIAL_STATUS_COLOR} />
              </Descriptions.Item>
              <Descriptions.Item label="排产进度">
                <StatusTag value={rec.production_schedule_status} labelMap={SCHEDULE_STATUS_LABEL} colorMap={SCHEDULE_STATUS_COLOR} />
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 质检节点 */}
        <Col span={24} style={{ marginBottom: 16 }}>
          <Card title="质检节点" size="small">
            <Descriptions column={3} size="small">
              <Descriptions.Item label="头查">
                <StatusTag value={rec.first_inspection_status} labelMap={INSPECTION_STATUS_LABEL} colorMap={INSPECTION_STATUS_COLOR} />
              </Descriptions.Item>
              <Descriptions.Item label="中查">
                <StatusTag value={rec.mid_inspection_status} labelMap={INSPECTION_STATUS_LABEL} colorMap={INSPECTION_STATUS_COLOR} />
              </Descriptions.Item>
              <Descriptions.Item label="尾查">
                <StatusTag value={rec.final_inspection_status} labelMap={INSPECTION_STATUS_LABEL} colorMap={INSPECTION_STATUS_COLOR} />
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {rec.remark && (
          <Col span={24} style={{ marginBottom: 16 }}>
            <Card title="备注" size="small">
              <Text style={{ whiteSpace: "pre-wrap" }}>{rec.remark}</Text>
            </Card>
          </Col>
        )}
      </Row>

      <div style={{ color: "#999", fontSize: 12, marginTop: 8 }}>
        创建时间：{rec.created_at?.slice(0, 19).replace("T", " ")}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        更新时间：{rec.updated_at?.slice(0, 19).replace("T", " ")}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        创建人：{rec.created_by ?? "—"}
      </div>

      <EditModal rec={rec} open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  )
}
