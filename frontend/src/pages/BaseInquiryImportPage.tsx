import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Input,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { FileExcelOutlined, ImportOutlined, InboxOutlined, SwapRightOutlined } from "@ant-design/icons"

import { confirmBaseInquiryImport, previewBaseInquiryImport } from "@/api/base_inquiry_import"
import type {
  BaseInquiryImportConfirmResult,
  BaseInquiryImportPreview,
  BaseInquiryImportRow,
  BaseInquiryImportStatus,
} from "@/types/base_inquiry_import"

const { Dragger } = Upload
const { Text, Title } = Typography

const STATUS_TAG: Record<string, React.ReactNode> = {
  new_inquiry: <Tag color="green">新询单</Tag>,
  existing_inquiry: <Tag color="blue">已有询单</Tag>,
  new_item_for_existing_inquiry: <Tag color="cyan">已有询单新增款式</Tag>,
  duplicate_item: <Tag>重复款式</Tag>,
  customer_unmatched: <Tag color="gold">客户未匹配</Tag>,
  item_identity_uncertain: <Tag color="orange">款式识别待确认</Tag>,
  failed: <Tag color="red">校验失败</Tag>,
}

function val(v: unknown): string {
  if (v == null || v === "") return "—"
  return String(v)
}

function flagTags(flags: BaseInquiryImportStatus[]) {
  return flags.map(flag => <span key={flag}>{STATUS_TAG[flag] ?? <Tag>{flag}</Tag>}</span>)
}

export default function BaseInquiryImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uniformCustomerCode, setUniformCustomerCode] = useState("")
  const [preview, setPreview] = useState<BaseInquiryImportPreview | null>(null)
  const [result, setResult] = useState<BaseInquiryImportConfirmResult | null>(null)
  const [confirmedGroupKeys, setConfirmedGroupKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const columns: ColumnsType<BaseInquiryImportRow> = [
    { title: "位置", width: 130, render: (_, r) => `${r.source_sheet}!${r.row_number}` },
    { title: "询单号", dataIndex: "inquiry_no", width: 120, fixed: "left", render: val },
    { title: "状态", dataIndex: "status", width: 150, render: s => STATUS_TAG[s] ?? <Tag>{s}</Tag> },
    { title: "标记", dataIndex: "flags", width: 190, render: flagTags },
    { title: "客户代码", dataIndex: "customer_code", width: 110, render: val },
    {
      title: "客户处理",
      width: 120,
      render: (_, r) => r.customer_matched ? <Tag color="success">已匹配</Tag> : (r.customer_will_create ? <Tag color="blue">将创建</Tag> : <Tag>无客户</Tag>),
    },
    { title: "客户订单号", dataIndex: "customer_order_no", width: 150, render: val },
    { title: "季节", dataIndex: "season", width: 90, render: val },
    { title: "订单状态", dataIndex: "order_status", width: 120, render: val },
    { title: "品名", dataIndex: "product_name", width: 180, ellipsis: true, render: val },
    { title: "报价单系列", dataIndex: "document_series_name", width: 160, render: val },
    { title: "组标记", dataIndex: "order_group_marker", width: 160, render: v => v ? <Tag color="purple">{String(v)}</Tag> : "—" },
    { title: "系列字段", dataIndex: "series_name", width: 150, render: val },
    { title: "款号/身份", dataIndex: "item_identity_key", width: 160, ellipsis: true, render: val },
    { title: "询单数量", dataIndex: "quantity", width: 100, align: "right", render: val },
    { title: "可补主表字段", dataIndex: "fillable_inquiry_fields", width: 150, render: fields => fields?.length ? fields.join(", ") : "—" },
    { title: "可导入", dataIndex: "can_confirm", width: 90, render: v => v ? <Tag color="success">是</Tag> : <Tag>否</Tag> },
  ]

  async function handlePreview() {
    if (!file) return
    setLoading(true)
    setResult(null)
    try {
      const data = await previewBaseInquiryImport(file, uniformCustomerCode)
      setPreview(data)
      setConfirmedGroupKeys(data.order_group_candidates.filter(g => g.default_confirmed).map(g => g.key))
      message.success("客户总表基础预览完成")
    } catch (err) {
      message.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!file || !preview) return
    setImporting(true)
    try {
      const data = await confirmBaseInquiryImport(file, uniformCustomerCode, confirmedGroupKeys)
      setResult(data)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["inquiries"] }),
        qc.invalidateQueries({ queryKey: ["inquiry-detail"] }),
        qc.invalidateQueries({ queryKey: ["operation-logs"] }),
        qc.invalidateQueries({ queryKey: ["customers"] }),
        qc.invalidateQueries({ queryKey: ["order-series"] }),
        qc.invalidateQueries({ queryKey: ["order-groups"] }),
      ])
      message.success(`客户总表基础导入完成：询单 ${data.summary.created_inquiries} 条，款式 ${data.summary.created_items} 条`)
      await handlePreview()
    } catch (err) {
      message.error((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>客户总表基础导入</Title>
      <Card style={{ marginBottom: 16 }}>
        <Dragger
          maxCount={1}
          accept=".xlsx,.xls"
          beforeUpload={f => {
            setFile(f)
            setPreview(null)
            setResult(null)
            setConfirmedGroupKeys([])
            return false
          }}
          onRemove={() => {
            setFile(null)
            setPreview(null)
            setResult(null)
            setConfirmedGroupKeys([])
          }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">上传 Excel</p>
          <p className="ant-upload-hint">解析总表、总表海外、海外报价表-美金；只创建客户总表里的基础询单和必要款式。</p>
        </Dragger>
        <Space style={{ marginTop: 16 }} wrap>
          <Input
            style={{ width: 240 }}
            placeholder="本文件统一客户代码（可选）"
            value={uniformCustomerCode}
            onChange={e => {
              setUniformCustomerCode(e.target.value)
              setPreview(null)
              setResult(null)
              setConfirmedGroupKeys([])
            }}
          />
          <Button icon={<FileExcelOutlined />} type="primary" disabled={!file} loading={loading} onClick={handlePreview}>
            解析预览
          </Button>
          <Button icon={<ImportOutlined />} disabled={!preview || preview.summary.importable_rows === 0} loading={importing} onClick={handleConfirm}>
            确认基础导入
          </Button>
        </Space>
      </Card>

      {result && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={result.next_step.message}
          action={
            <Button type="primary" icon={<SwapRightOutlined />} onClick={() => navigate(result.next_step.path)}>
              去导入报价与工厂资料
            </Button>
          }
        />
      )}

      {preview && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={3}><Statistic title="新询单" value={preview.summary.new_inquiries} valueStyle={{ color: "#52c41a" }} /></Col>
            <Col span={3}><Statistic title="新增款式" value={preview.summary.new_items} valueStyle={{ color: "#1677ff" }} /></Col>
            <Col span={3}><Statistic title="已有询单" value={preview.summary.existing_inquiries} /></Col>
            <Col span={3}><Statistic title="重复款式" value={preview.summary.duplicate_items} /></Col>
            <Col span={3}><Statistic title="客户未匹配" value={preview.summary.customer_unmatched} valueStyle={{ color: "#d48806" }} /></Col>
            <Col span={3}><Statistic title="待确认款式" value={preview.summary.item_identity_uncertain} valueStyle={{ color: "#d46b08" }} /></Col>
            <Col span={3}><Statistic title="可补主表字段" value={preview.summary.fillable_inquiry_fields} valueStyle={{ color: "#1677ff" }} /></Col>
            <Col span={3}><Statistic title="失败" value={preview.summary.failed} valueStyle={{ color: "#ff4d4f" }} /></Col>
            <Col span={3}><Statistic title="可导入" value={preview.summary.importable_rows} valueStyle={{ color: "#52c41a" }} /></Col>
            <Col span={3}><Statistic title="候选订单组" value={preview.summary.order_group_candidates} valueStyle={{ color: "#1677ff" }} /></Col>
          </Row>

          <Card size="small" title="Sheet 识别结果" style={{ marginBottom: 16 }}>
            <Descriptions size="small" column={3}>
              {Object.entries(preview.sheet_stats).map(([sheet, stat]) => (
                <Descriptions.Item key={sheet} label={sheet}>
                  {stat.present ? `${stat.rows} 行，${stat.layout ?? "已识别"}` : "未找到"}
                  {stat.has_customer_code_column ? "，含客户代码列" : ""}
                  {stat.document_series_name ? `，报价单系列：${stat.document_series_name}` : ""}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>

          <Card size="small" title="报价单系列识别" style={{ marginBottom: 16 }}>
            {preview.document_series.length === 0 ? (
              <Text type="secondary">未识别到文件级报价单系列。</Text>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }}>
                {preview.document_series.map(series => (
                  <div key={`${series.source_sheet}-${series.series_name ?? "unknown"}`} style={{ border: "1px solid #e5e7eb", padding: 10, borderRadius: 6, background: "#fafafa" }}>
                    <Text strong>{series.series_name || "未命名系列"}</Text>
                    <Text type="secondary">　{series.source_sheet}，共 {series.inquiry_count} 个询单</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text strong>询单号：</Text>{series.inquiry_nos.join("，")}
                    </div>
                    <div>
                      <Text strong>识别依据：</Text>{series.basis.join(" + ")}
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>

          <Card size="small" title="订单组候选识别" style={{ marginBottom: 16 }}>
            {preview.order_group_candidates.length === 0 ? (
              <Text type="secondary">未识别到明确订单组。当前可靠规则是“系列名列明确标注一套/一组并覆盖多个询单”。</Text>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }}>
                {preview.order_group_candidates.map(group => (
                  <div key={group.key} style={{ border: "1px solid #d9d9d9", padding: 10, borderRadius: 6, background: "#fff" }}>
                    <Checkbox
                      checked={confirmedGroupKeys.includes(group.key)}
                      onChange={e => {
                        setConfirmedGroupKeys(keys => e.target.checked
                          ? Array.from(new Set([...keys, group.key]))
                          : keys.filter(k => k !== group.key))
                      }}
                    >
                      创建订单组：{group.source_sheet} 第 {group.source_start_row}-{group.source_end_row} 行
                    </Checkbox>
                    <div style={{ marginTop: 6, paddingLeft: 24 }}>
                      <Text strong>所在报价单系列：</Text>{val(group.document_series_name)}
                      <br />
                      <Text strong>组标记：</Text>{val(group.group_marker)}
                      <br />
                      <Text strong>询单号：</Text>{group.inquiry_nos.join("，")}
                      <br />
                      <Text strong>识别依据：</Text>{group.basis.join(" + ")}
                      <br />
                      <Text strong>置信度：</Text>{Math.round(group.confidence * 100)}%
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>

          <Card size="small" title="客户总表基础询单与款式预览">
            <Table
              rowKey={r => `${r.source_sheet}-${r.row_number}-${r.inquiry_no ?? "empty"}`}
              size="small"
              columns={columns}
              dataSource={preview.rows}
              scroll={{ x: 1600 }}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              expandable={{
                expandedRowRender: r => (
                  <div>
                    <Text strong>错误：</Text> {r.errors.length ? r.errors.join("；") : "—"}
                    <br />
                    <Text strong>备注：</Text> {val(r.notes)}
                  </div>
                ),
              }}
            />
          </Card>
        </>
      )}
    </div>
  )
}
