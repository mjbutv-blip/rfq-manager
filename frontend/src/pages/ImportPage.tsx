import dayjs from "dayjs"
import { useCallback, useRef, useState } from "react"
import {
  Alert, Badge, Button, Card, Col, DatePicker, Divider, Input,
  Row, Select, Space, Spin, Statistic, Table, Tag, Typography, Upload, message,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import {
  CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined,
  EditOutlined, EyeOutlined, FileExcelOutlined, ImportOutlined, InboxOutlined,
} from "@ant-design/icons"

import { confirmImportRows, previewImport } from "@/api/imports"
import type { ConfirmRowItem, ImportBatch, ImportPreviewResponse, PreviewRow } from "@/types/import"

const { Dragger } = Upload
const { Text, Title } = Typography

// ── 占位符检测 ─────────────────────────────────────────────────────────────────
const PLACEHOLDER_RE = /^[-—]+$/

function isMeaningless(val: unknown): boolean {
  if (val == null) return true
  const s = String(val).trim()
  return s === "" || PLACEHOLDER_RE.test(s)
}

// ── 状态 tag ──────────────────────────────────────────────────────────────────
const ROW_STATUS_TAG: Record<string, React.ReactNode> = {
  new:       <Tag color="blue">新增</Tag>,
  existing:  <Tag color="default">已存在</Tag>,
  duplicate: <Tag color="orange">文件内重复</Tag>,
  failed:    <Tag color="red">校验失败</Tag>,
}

// ── 可编辑字段定义 ─────────────────────────────────────────────────────────────
type FieldType = "date" | "text" | "quote_status" | "order_status"

interface FieldDef {
  key: string
  label: string
  type: FieldType
  width: number
}

const EDITABLE_FIELDS: FieldDef[] = [
  { key: "inquiry_date",       label: "询单日期", type: "date",         width: 145 },
  { key: "customer_short_name",label: "客户简称", type: "text",         width: 110 },
  { key: "customer_code",      label: "客户代码", type: "text",         width: 100 },
  { key: "series_name",        label: "系列名",   type: "text",         width: 100 },
  { key: "season",             label: "季节",     type: "text",         width: 80  },
  { key: "quote_status",       label: "报价情况", type: "quote_status", width: 115 },
  { key: "order_status",       label: "订单状态", type: "order_status", width: 115 },
  { key: "remark",             label: "备注",     type: "text",         width: 160 },
]

const READONLY_FIELDS = [
  { key: "product_name", label: "品名",     width: 130 },
  { key: "quantity",     label: "数量",     width: 80  },
  { key: "final_quote",  label: "最终报价", width: 90  },
]

// ── 可编辑单元格 ───────────────────────────────────────────────────────────────
interface CellProps {
  fieldDef: FieldDef
  value: unknown
  rowNumber: number
  onEdit: (rowNumber: number, key: string, value: unknown) => void
}

function EditableCell({ fieldDef, value, rowNumber, onEdit }: CellProps) {
  const { key, type } = fieldDef
  const strVal = isMeaningless(value) ? "" : String(value)

  if (type === "date") {
    const dayjsVal = strVal ? dayjs(strVal) : null
    return (
      <DatePicker
        size="small"
        style={{ width: "100%" }}
        value={dayjsVal?.isValid() ? dayjsVal : null}
        onChange={(d) => onEdit(rowNumber, key, d ? d.format("YYYY-MM-DD") : null)}
      />
    )
  }

  if (type === "quote_status") {
    return (
      <Select
        size="small"
        style={{ width: "100%" }}
        allowClear
        placeholder="请选择"
        value={strVal || undefined}
        options={[
          { value: "已报价", label: "已报价" },
          { value: "报价中", label: "报价中" },
          { value: "未报价", label: "未报价" },
        ]}
        onChange={(v) => onEdit(rowNumber, key, v ?? null)}
      />
    )
  }

  if (type === "order_status") {
    return (
      <Select
        size="small"
        style={{ width: "100%" }}
        allowClear
        placeholder="请选择"
        value={strVal || undefined}
        options={[
          { value: "跟进中", label: "跟进中" },
          { value: "下单",   label: "下单"   },
          { value: "流失",   label: "流失"   },
          { value: "取消",   label: "取消"   },
        ]}
        onChange={(v) => onEdit(rowNumber, key, v ?? null)}
      />
    )
  }

  return (
    <Input
      size="small"
      value={strVal}
      onChange={(e) => onEdit(rowNumber, key, e.target.value || null)}
    />
  )
}

// ── 列定义 ─────────────────────────────────────────────────────────────────────
function getMerged(
  record: PreviewRow,
  field: string,
  edits: Record<number, Record<string, unknown>>,
): unknown {
  const override = edits[record.row_number]?.[field]
  if (override !== undefined) return override
  const v = record.parsed_data[field]
  return isMeaningless(v) ? null : v
}

function buildColumns(
  edits: Record<number, Record<string, unknown>>,
  onEdit: (rowNumber: number, key: string, value: unknown) => void,
): ColumnsType<PreviewRow> {
  const readonlyCols: ColumnsType<PreviewRow> = READONLY_FIELDS.map(({ key, label, width }) => ({
    title: label,
    key,
    width,
    ellipsis: true,
    render: (_: unknown, r: PreviewRow) => {
      const v = getMerged(r, key, edits)
      return v != null ? String(v) : <Text type="secondary">—</Text>
    },
  }))

  const editableCols: ColumnsType<PreviewRow> = EDITABLE_FIELDS.map((fieldDef) => ({
    title: (
      <Space size={3}>
        {fieldDef.label}
        <EditOutlined style={{ color: "#1677ff", fontSize: 10 }} />
      </Space>
    ),
    key: fieldDef.key,
    width: fieldDef.width,
    render: (_: unknown, r: PreviewRow) => {
      const isReadonly = r.status === "existing" || r.status === "duplicate"
      const val = getMerged(r, fieldDef.key, edits)
      if (isReadonly) {
        return val != null
          ? <Text type="secondary">{String(val)}</Text>
          : <Text type="secondary">—</Text>
      }
      return (
        <EditableCell
          fieldDef={fieldDef}
          value={val}
          rowNumber={r.row_number}
          onEdit={onEdit}
        />
      )
    },
  }))

  return [
    { title: "行号", dataIndex: "row_number", width: 55, fixed: "left" },
    {
      title: "状态",
      dataIndex: "status",
      width: 80,
      fixed: "left",
      render: (s: string) => ROW_STATUS_TAG[s] ?? <Tag>{s}</Tag>,
    },
    {
      title: "询单号",
      dataIndex: "inquiry_no",
      width: 105,
      fixed: "left",
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    ...readonlyCols,
    ...editableCols,
    {
      title: "错误信息",
      key: "error",
      fixed: "right",
      width: 170,
      render: (_: unknown, r: PreviewRow) =>
        r.error_message
          ? <Text type="danger" style={{ fontSize: 12 }}>{r.error_message}</Text>
          : null,
    },
  ]
}

// ── FileEntry & FileCard ───────────────────────────────────────────────────────
type FileStatus = "idle" | "previewing" | "previewed" | "importing" | "done" | "error"

interface FileEntry {
  uid: string
  file: File
  status: FileStatus
  preview?: ImportPreviewResponse
  editedData: Record<number, Record<string, unknown>>
  batch?: ImportBatch
  error?: string
}

const STATUS_BADGE: Record<FileStatus, React.ReactNode> = {
  idle:       <Badge status="default"     text="待预览" />,
  previewing: <Badge status="processing" text="解析中…" />,
  previewed:  <Badge status="warning"    text="待确认导入" />,
  importing:  <Badge status="processing" text="写入中…" />,
  done:       <Badge status="success"    text="已完成" />,
  error:      <Badge status="error"      text="出错" />,
}

interface FileCardProps {
  entry: FileEntry
  onPreview: (uid: string) => void
  onConfirm: (uid: string) => void
  onRemove:  (uid: string) => void
  onEditRow: (uid: string, rowNumber: number, field: string, value: unknown) => void
}

function FileCard({ entry, onPreview, onConfirm, onRemove, onEditRow }: FileCardProps) {
  const { uid, file, status, preview, batch, error, editedData } = entry

  const handleEdit = useCallback(
    (rowNumber: number, field: string, value: unknown) => onEditRow(uid, rowNumber, field, value),
    [uid, onEditRow],
  )

  const columns = buildColumns(editedData, handleEdit)

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <Space>
          <FileExcelOutlined style={{ color: "#52c41a" }} />
          <Text strong>{file.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </Text>
          {STATUS_BADGE[status]}
        </Space>
      }
      extra={
        <Space>
          {(status === "idle" || status === "previewed") && (
            <Button size="small" icon={<EyeOutlined />} onClick={() => onPreview(uid)}>
              {status === "previewed" ? "重新预览" : "预览"}
            </Button>
          )}
          {status === "previewed" && (
            <Button size="small" type="primary" icon={<ImportOutlined />} onClick={() => onConfirm(uid)}>
              确认导入
            </Button>
          )}
          {(status === "idle" || status === "error") && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onRemove(uid)} />
          )}
        </Space>
      }
    >
      {(status === "previewing" || status === "importing") && (
        <Spin tip={status === "previewing" ? "解析 Excel…" : "写入数据库…"}>
          <div style={{ height: 40 }} />
        </Spin>
      )}

      {status === "error" && error && <Alert type="error" message={error} showIcon />}

      {status === "previewed" && preview && (
        <>
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col span={4}><Statistic title="解析总行数"    value={preview.total_rows}     /></Col>
            <Col span={5}><Statistic title="将新增"        value={preview.new_rows}       valueStyle={{ color: "#1677ff" }} /></Col>
            <Col span={5}><Statistic title="已存在(跳过)"  value={preview.existing_rows}  valueStyle={{ color: "#8c8c8c" }} /></Col>
            <Col span={5}><Statistic title="文件内重复"    value={preview.duplicate_rows} valueStyle={{ color: "#fa8c16" }} /></Col>
            <Col span={5}><Statistic title="校验失败"      value={preview.failed_rows}    valueStyle={{ color: "#ff4d4f" }} /></Col>
          </Row>

          {preview.failed_rows > 0 && (
            <Alert
              type="info" showIcon style={{ marginBottom: 8 }}
              message="校验失败的行可在下方表格中补全字段后导入（蓝色铅笔图标列为可编辑字段）"
            />
          )}

          <Alert
            type="info" showIcon style={{ marginBottom: 8 }} banner
            message={
              <Text style={{ fontSize: 12 }}>
                蓝色 <EditOutlined style={{ color: "#1677ff" }} /> 列可直接编辑，填写完成后点击「确认导入」
              </Text>
            }
          />

          <Table<PreviewRow>
            rowKey="row_number"
            size="small"
            dataSource={preview.rows}
            columns={columns}
            scroll={{ x: 1600, y: 340 }}
            pagination={false}
            rowClassName={(r) =>
              r.status === "failed"
                ? "row-error"
                : r.status === "existing" || r.status === "duplicate"
                ? "row-muted"
                : ""
            }
          />
        </>
      )}

      {status === "done" && batch && (
        <Alert
          type={batch.status === "success" ? "success" : "warning"}
          showIcon
          message={
            <Space split={<Divider type="vertical" />}>
              <Text>成功写入 <Text strong>{batch.success_rows}</Text> 条</Text>
              {(batch.failed_rows ?? 0) > 0 && (
                <Text type="danger">跳过/失败 <Text strong>{batch.failed_rows}</Text> 条</Text>
              )}
              <Text type="secondary">批次 ID: {batch.id.slice(0, 8)}…</Text>
            </Space>
          }
        />
      )}
    </Card>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────
export default function ImportPage() {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [messageApi, contextHolder] = message.useMessage()
  const uidRef = useRef(0)

  const updateEntry = useCallback((uid: string, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.uid === uid ? { ...e, ...patch } : e))
  }, [])

  const addFiles = useCallback((files: File[]) => {
    setEntries(prev => {
      const existing = new Set(prev.map(e => e.file.name))
      const newEntries: FileEntry[] = files
        .filter(f => !existing.has(f.name))
        .map(f => ({ uid: String(++uidRef.current), file: f, status: "idle", editedData: {} }))
      return [...prev, ...newEntries]
    })
  }, [])

  const handleEditRow = useCallback(
    (uid: string, rowNumber: number, field: string, value: unknown) => {
      setEntries(prev => prev.map(e => {
        if (e.uid !== uid) return e
        return {
          ...e,
          editedData: {
            ...e.editedData,
            [rowNumber]: { ...(e.editedData[rowNumber] ?? {}), [field]: value },
          },
        }
      }))
    },
    [],
  )

  const handlePreview = useCallback(async (uid: string) => {
    const entry = entries.find(e => e.uid === uid)
    if (!entry) return
    updateEntry(uid, { status: "previewing", error: undefined, editedData: {} })
    try {
      const preview = await previewImport(entry.file)
      updateEntry(uid, { status: "previewed", preview })
    } catch (err) {
      updateEntry(uid, { status: "error", error: (err as Error).message })
    }
  }, [entries, updateEntry])

  const handleConfirm = useCallback(async (uid: string) => {
    const entry = entries.find(e => e.uid === uid)
    if (!entry?.preview) return
    updateEntry(uid, { status: "importing" })

    // 新增行 + 校验失败行（可能已被用户修复）都纳入导入
    // 已存在和文件内重复的行跳过
    const rows: ConfirmRowItem[] = entry.preview.rows
      .filter(r => r.status !== "existing" && r.status !== "duplicate")
      .map(r => ({
        row_number: r.row_number,
        inquiry_no: r.inquiry_no,
        parsed_data: {
          ...r.parsed_data,
          ...(entry.editedData[r.row_number] ?? {}),
        },
      }))

    try {
      const batch = await confirmImportRows({ file_name: entry.preview.file_name, rows })
      updateEntry(uid, { status: "done", batch })
      messageApi.success(`「${entry.file.name}」导入完成：新增 ${batch.success_rows} 条`)
    } catch (err) {
      updateEntry(uid, { status: "error", error: (err as Error).message })
      messageApi.error(`导入失败：${(err as Error).message}`)
    }
  }, [entries, updateEntry, messageApi])

  const idleCount  = entries.filter(e => e.status === "idle").length
  const doneCount  = entries.filter(e => e.status === "done").length

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {contextHolder}

      <Title level={4} style={{ marginBottom: 20 }}>导入询单表</Title>

      <Dragger
        multiple
        accept=".xlsx,.xls"
        showUploadList={false}
        beforeUpload={(_, fileList) => { addFiles(fileList as File[]); return false }}
        style={{ marginBottom: 20 }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ fontSize: 48, color: "#1677ff" }} />
        </p>
        <p className="ant-upload-text">点击或拖拽询单表 Excel 文件到此区域</p>
        <p className="ant-upload-hint">
          支持 .xlsx / .xls，可同时选择多个文件。系统自动识别表头；正式报价单模板自动填充组别和业务员。
        </p>
      </Dragger>

      {entries.length > 0 && (
        <Space style={{ marginBottom: 16 }}>
          {idleCount > 0 && (
            <Button icon={<EyeOutlined />} onClick={async () => {
              for (const e of entries.filter(e => e.status === "idle")) {
                await handlePreview(e.uid)
              }
            }}>
              全部预览（{idleCount} 个）
            </Button>
          )}
          {doneCount > 0 && (
            <Tag icon={<CheckCircleOutlined />} color="success">已完成 {doneCount} 个</Tag>
          )}
          <Button
            icon={<CloseCircleOutlined />}
            onClick={() => setEntries(prev => prev.filter(e => e.status !== "idle" && e.status !== "error"))}
          >
            清除待处理
          </Button>
        </Space>
      )}

      {entries.length === 0 ? (
        <div style={{ textAlign: "center", color: "#bbb", padding: "40px 0" }}>
          暂无文件，请先选择 Excel 文件
        </div>
      ) : (
        entries.map(entry => (
          <FileCard
            key={entry.uid}
            entry={entry}
            onPreview={handlePreview}
            onConfirm={handleConfirm}
            onRemove={uid => setEntries(prev => prev.filter(e => e.uid !== uid))}
            onEditRow={handleEditRow}
          />
        ))
      )}

      <style>{`
        .row-error td { background-color: #fff1f0 !important; }
        .row-muted td { background-color: #f9f9f9 !important; color: #aaa; }
        .ant-table-cell .ant-input,
        .ant-table-cell .ant-select,
        .ant-table-cell .ant-picker { font-size: 12px; }
      `}</style>
    </div>
  )
}
