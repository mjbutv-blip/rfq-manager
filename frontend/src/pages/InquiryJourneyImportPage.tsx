import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Radio,
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
import { FileExcelOutlined, ImportOutlined, InboxOutlined } from "@ant-design/icons"

import { confirmJourneyImport, previewJourneyImport } from "@/api/inquiry_journey_import"
import type {
  JourneyImportDecisions,
  JourneyImportFactoryQuote,
  JourneyImportField,
  JourneyImportPreview,
  JourneyImportRow,
} from "@/types/inquiry_journey_import"

const { Dragger } = Upload
const { Text, Title } = Typography

const STATUS_TAG: Record<string, React.ReactNode> = {
  matched: <Tag color="blue">已匹配系统询单</Tag>,
  not_found: <Tag color="red">系统未找到</Tag>,
  ambiguous: <Tag color="red">同编号多条</Tag>,
  ready_to_fill: <Tag color="green">可补充空字段</Tag>,
  conflict: <Tag color="gold">有冲突需确认</Tag>,
  failed: <Tag color="red">解析失败</Tag>,
}

function val(v: unknown): string {
  if (v == null || v === "") return "—"
  return String(v)
}

function quoteTypeName(v: string): string {
  return v === "overseas" ? "海外" : "国内"
}

export default function InquiryJourneyImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<JourneyImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [decisions, setDecisions] = useState<JourneyImportDecisions>({ fields: {}, factory_quotes: {} })
  const qc = useQueryClient()

  const conflictRows = useMemo(
    () => preview?.rows.filter(r => r.conflict_count > 0) ?? [],
    [preview],
  )

  const columns: ColumnsType<JourneyImportRow> = [
    { title: "询单号", dataIndex: "inquiry_no", fixed: "left", width: 120, render: val },
    { title: "系统 inquiry_id", dataIndex: "inquiry_id", width: 210, ellipsis: true, render: val },
    { title: "匹配状态", dataIndex: "status", width: 140, render: s => STATUS_TAG[s] ?? <Tag>{s}</Tag> },
    { title: "国内轮次", dataIndex: "domestic_quote_rounds", width: 90, align: "right" },
    { title: "海外轮次", dataIndex: "overseas_quote_rounds", width: 90, align: "right" },
    { title: "可补 inquiry 字段", dataIndex: "fillable_inquiry_fields", width: 130, align: "right" },
    { title: "可创建 quote_items", dataIndex: "quote_items_to_create", width: 140, align: "right" },
    { title: "可创建工厂报价", dataIndex: "factory_quotes_to_create", width: 140, align: "right" },
    { title: "冲突", dataIndex: "conflict_count", width: 80, align: "right", render: n => n ? <Text type="warning">{n}</Text> : "0" },
    { title: "未映射/待确认", dataIndex: "unmapped_count", width: 130, align: "right" },
    { title: "可确认", dataIndex: "can_confirm", width: 90, render: v => v ? <Tag color="success">是</Tag> : <Tag>否</Tag> },
  ]

  async function handlePreview() {
    if (!file) return
    setLoading(true)
    try {
      const data = await previewJourneyImport(file)
      setPreview(data)
      setDecisions({ fields: {}, factory_quotes: {} })
      message.success("预览完成")
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
      const result = await confirmJourneyImport(file, decisions)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["inquiries"] }),
        qc.invalidateQueries({ queryKey: ["inquiry-detail"] }),
        qc.invalidateQueries({ queryKey: ["inquiry-journey"] }),
        qc.invalidateQueries({ queryKey: ["factory-quotes"] }),
        qc.invalidateQueries({ queryKey: ["factory-detail"] }),
        qc.invalidateQueries({ queryKey: ["quote-items"] }),
        qc.invalidateQueries({ queryKey: ["operation-logs"] }),
        qc.invalidateQueries({ queryKey: ["quote-analysis-overview"] }),
      ])
      message.success(`导入完成：新增工厂报价 ${result.summary.created_factory_quotes ?? 0} 条，更新字段 ${result.summary.updated_fields ?? 0} 个`)
      await handlePreview()
    } catch (err) {
      message.error((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  function setFieldDecision(key: string, value: "keep_system" | "excel" | "skip") {
    setDecisions(prev => ({ ...prev, fields: { ...prev.fields, [key]: value } }))
  }

  function setFactoryDecision(key: string, value: "keep_system" | "use_excel" | "add_remark") {
    setDecisions(prev => ({ ...prev, factory_quotes: { ...prev.factory_quotes, [key]: value } }))
  }

  function renderFieldConflict(f: JourneyImportField) {
    return (
      <tr key={f.key}>
        <td>{f.field_name}</td>
        <td>{f.system_table}</td>
        <td>{val(f.system_value)}</td>
        <td>{val(f.excel_value)}</td>
        <td>{f.source_sheet}!{f.source_cell}</td>
        <td>
          <Radio.Group
            size="small"
            value={decisions.fields[f.key] ?? "keep_system"}
            onChange={e => setFieldDecision(f.key, e.target.value)}
            options={[
              { label: "保留系统", value: "keep_system" },
              { label: "使用 Excel", value: "excel" },
              { label: "跳过", value: "skip" },
            ]}
          />
        </td>
      </tr>
    )
  }

  function renderFactoryConflict(f: JourneyImportFactoryQuote) {
    return (
      <tr key={f.key}>
        <td>{quoteTypeName(f.quote_type)}第{f.quote_round}轮</td>
        <td>{f.factory_name}</td>
        <td>{val(f.system_price)}</td>
        <td>{f.factory_price} {f.currency}/{f.price_unit}</td>
        <td>{f.source_sheet}!{f.source_cell}</td>
        <td>
          <Radio.Group
            size="small"
            value={decisions.factory_quotes[f.key] ?? "keep_system"}
            onChange={e => setFactoryDecision(f.key, e.target.value)}
            options={[
              { label: "保留系统", value: "keep_system" },
              { label: "使用 Excel", value: "use_excel" },
              { label: "新增备注", value: "add_remark" },
            ]}
          />
        </td>
      </tr>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>来龙去脉表资料导入</Title>
      <Card style={{ marginBottom: 16 }}>
        <Dragger
          maxCount={1}
          accept=".xlsx,.xls"
          beforeUpload={f => {
            setFile(f)
            setPreview(null)
            return false
          }}
          onRemove={() => {
            setFile(null)
            setPreview(null)
          }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">上传 Excel</p>
          <p className="ant-upload-hint">解析总表、询单追踪详情汇总表、海外报价表-美金；预览阶段不写数据库。</p>
        </Dragger>
        <Space style={{ marginTop: 16 }}>
          <Button icon={<FileExcelOutlined />} type="primary" disabled={!file} loading={loading} onClick={handlePreview}>
            解析预览
          </Button>
          <Button icon={<ImportOutlined />} disabled={!preview || !preview.rows.some(r => r.can_confirm)} loading={importing} onClick={handleConfirm}>
            确认导入
          </Button>
        </Space>
      </Card>

      {preview && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}><Statistic title="识别询单" value={preview.summary.total_inquiries ?? 0} /></Col>
            <Col span={4}><Statistic title="已匹配" value={preview.summary.matched ?? 0} valueStyle={{ color: "#1677ff" }} /></Col>
            <Col span={4}><Statistic title="可补充" value={preview.summary.ready_to_fill ?? 0} valueStyle={{ color: "#52c41a" }} /></Col>
            <Col span={4}><Statistic title="冲突询单" value={preview.summary.conflict ?? 0} valueStyle={{ color: "#d48806" }} /></Col>
            <Col span={4}><Statistic title="未找到" value={preview.summary.not_found ?? 0} valueStyle={{ color: "#ff4d4f" }} /></Col>
            <Col span={4}><Statistic title="工厂价冲突" value={preview.summary.factory_quote_conflicts ?? 0} valueStyle={{ color: "#d48806" }} /></Col>
          </Row>

          <Card size="small" title="Sheet 识别结果" style={{ marginBottom: 16 }}>
            <Descriptions size="small" column={3}>
              {Object.entries(preview.sheet_stats).map(([sheet, stat]) => (
                <Descriptions.Item key={sheet} label={sheet}>
                  {stat.rows} 行，轮次 {stat.quote_rounds.join("、") || "—"}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>

          <Table<JourneyImportRow>
            rowKey={r => r.inquiry_no ?? r.excel_locations.join("|")}
            size="small"
            columns={columns}
            dataSource={preview.rows}
            scroll={{ x: 1300, y: 360 }}
            expandable={{
              expandedRowRender: r => (
                <Space direction="vertical" style={{ width: "100%" }}>
                  {r.errors.length > 0 && <Alert type="error" showIcon message={r.errors.join("；")} />}
                  {r.factory_quotes.some(f => f.message) && (
                    <Alert type="info" showIcon message="部分工厂未匹配工厂档案，将按名称保存报价记录。" />
                  )}
                  {r.needs_confirmation.length > 0 && (
                    <Collapse
                      size="small"
                      items={[{
                        key: "pending",
                        label: `未导入 / 待确认字段 ${r.needs_confirmation.length} 个`,
                        children: (
                          <Table
                            size="small"
                            pagination={false}
                            rowKey={(x: any) => `${x.source_sheet}-${x.source_cell}-${x.field_name}`}
                            dataSource={r.needs_confirmation}
                            columns={[
                              { title: "字段", dataIndex: "field_name" },
                              { title: "Excel 值", dataIndex: "excel_value", render: val },
                              { title: "位置", render: (_: unknown, x: any) => `${x.source_sheet}!${x.source_cell}` },
                              { title: "未导入原因", dataIndex: "reason" },
                              { title: "建议", dataIndex: "suggestion" },
                            ]}
                          />
                        ),
                      }]}
                    />
                  )}
                </Space>
              ),
            }}
          />

          {conflictRows.length > 0 && (
            <Card title="冲突处理" style={{ marginTop: 16 }}>
              <Collapse
                items={conflictRows.map(r => {
                  const fieldConflicts = [
                    ...r.inquiry_fields.filter(f => f.status === "conflict"),
                    ...r.quote_items.flatMap(q => q.fields.filter(f => f.status === "conflict")),
                  ]
                  const factoryConflicts = r.factory_quotes.filter(f => f.status === "factory_quote_conflict")
                  return {
                    key: r.inquiry_no ?? "",
                    label: `${r.inquiry_no}：字段冲突 ${fieldConflicts.length}，工厂报价冲突 ${factoryConflicts.length}`,
                    children: (
                      <Space direction="vertical" style={{ width: "100%" }}>
                        {fieldConflicts.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr><th>字段</th><th>表</th><th>系统当前值</th><th>Excel 值</th><th>位置</th><th>导入选择</th></tr></thead>
                            <tbody>{fieldConflicts.map(renderFieldConflict)}</tbody>
                          </table>
                        )}
                        {factoryConflicts.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr><th>轮次</th><th>工厂</th><th>系统价格</th><th>Excel 价格</th><th>位置</th><th>导入选择</th></tr></thead>
                            <tbody>{factoryConflicts.map(renderFactoryConflict)}</tbody>
                          </table>
                        )}
                      </Space>
                    ),
                  }
                })}
              />
            </Card>
          )}
        </>
      )}
    </div>
  )
}
