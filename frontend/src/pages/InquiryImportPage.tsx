import type { ReactNode } from "react"
import { useCallback, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  Alert, Badge, Button, Card, Col, Input, Row, Select, Space, Spin, Statistic, Table, Tag, Typography, Upload, message,
} from "antd"
import { CheckCircleOutlined, DeleteOutlined, EditOutlined, EyeOutlined, FileExcelOutlined, ImportOutlined, InboxOutlined } from "@ant-design/icons"
import type { ColumnsType } from "antd/es/table"

import { confirmImport, confirmImportRows, previewImport } from "@/api/imports"
import { useCurrentUser, useUsers } from "@/contexts/UserContext"
import type { ImportBatch, ImportPreviewResponse, PreviewRow } from "@/types/import"

const { Text, Title } = Typography
const { Dragger } = Upload

type FileStatus = "idle" | "previewing" | "previewed" | "importing" | "done" | "error"

interface FileEntry {
  uid: string
  file: File
  status: FileStatus
  preview?: ImportPreviewResponse
  batch?: ImportBatch
  error?: string
}

const STATUS_TAG: Record<string, ReactNode> = {
  new:                             <Tag color="blue">新询单</Tag>,
  existing_inquiry_new_item:      <Tag color="cyan">已有询单，新增款式</Tag>,
  duplicate_item:                 <Tag color="orange">重复款式</Tag>,
  existing_inquiry_item_uncertain:<Tag color="gold">已有询单，款式待确认</Tag>,
  failed:                          <Tag color="red">校验失败</Tag>,
}

const STATUS_BADGE: Record<FileStatus, ReactNode> = {
  idle:       <Badge status="default"    text="待预览" />,
  previewing: <Badge status="processing" text="解析中…" />,
  previewed:  <Badge status="warning"    text="待确认导入" />,
  importing:  <Badge status="processing" text="写入中…" />,
  done:       <Badge status="success"    text="已完成" />,
  error:      <Badge status="error"      text="出错" />,
}

const COLUMNS: ColumnsType<PreviewRow> = [
  {
    title: "行号",
    dataIndex: "row_number",
    width: 60,
    fixed: "left",
  },
  {
    title: "询单号",
    dataIndex: "inquiry_no",
    width: 130,
    fixed: "left",
    render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
  },
  {
    title: "客户简称",
    key: "customer_short_name",
    width: 100,
    render: (_: unknown, r: PreviewRow) =>
      String(r.parsed_data.customer_short_name ?? "—"),
  },
  {
    title: "所属小组",
    key: "group_name",
    width: 80,
    render: (_: unknown, r: PreviewRow) =>
      String(r.parsed_data.group_name ?? "—"),
  },
  {
    title: "负责业务员",
    key: "responsible_sales",
    width: 100,
    render: (_: unknown, r: PreviewRow) =>
      String(r.parsed_data.responsible_sales ?? "—"),
  },
  {
    title: "款号",
    key: "style_no",
    width: 90,
    render: (_: unknown, r: PreviewRow) =>
      String(r.parsed_data.style_no ?? "—"),
  },
  {
    title: "品名",
    key: "product_name",
    width: 140,
    ellipsis: true,
    render: (_: unknown, r: PreviewRow) => {
      const v = r.parsed_data.product_name
      return v != null
        ? <span title={String(v)}>{String(v)}</span>
        : <Text type="secondary">—</Text>
    },
  },
  {
    title: "系列",
    key: "series_name",
    width: 100,
    ellipsis: true,
    render: (_: unknown, r: PreviewRow) =>
      String(r.parsed_data.series_name ?? "—"),
  },
  {
    title: "数量",
    key: "quantity",
    width: 75,
    align: "right",
    render: (_: unknown, r: PreviewRow) => {
      const v = r.parsed_data.quantity
      return v != null ? String(v) : <Text type="secondary">—</Text>
    },
  },
  {
    title: "询单日期",
    key: "inquiry_date",
    width: 100,
    render: (_: unknown, r: PreviewRow) => {
      const v = r.parsed_data.inquiry_date
      return v != null ? String(v) : <Text type="secondary">—</Text>
    },
  },
  {
    title: "状态",
    dataIndex: "status",
    width: 110,
    fixed: "right",
    render: (s: string) => STATUS_TAG[s] ?? <Tag>{s}</Tag>,
  },
  {
    title: "错误原因",
    dataIndex: "error_message",
    width: 220,
    fixed: "right",
    ellipsis: true,
    render: (v: string | null) =>
      v
        ? <Typography.Text type="danger" title={v}>{v}</Typography.Text>
        : <Text type="secondary">—</Text>,
  },
]

// 最小行内编辑入口：仅用于"缺少品名"的 failed 行——补上品名后单独调用
// confirm_import_rows 重新提交这一行，不做完整的批量可编辑表格。
function FixProductNameCell({ row, onSubmit }: { row: PreviewRow; onSubmit: (value: string) => Promise<void> }) {
  const [value, setValue] = useState("")
  const [submitting, setSubmitting] = useState(false)
  if (row.status !== "failed" || !(row.error_message ?? "").includes("品名")) {
    return <Text type="secondary">—</Text>
  }
  return (
    <Space.Compact>
      <Input
        size="small"
        placeholder="补充品名"
        value={value}
        onChange={e => setValue(e.target.value)}
        style={{ width: 100 }}
      />
      <Button
        size="small"
        icon={<EditOutlined />}
        loading={submitting}
        disabled={!value.trim()}
        onClick={async () => {
          setSubmitting(true)
          try {
            await onSubmit(value.trim())
          } finally {
            setSubmitting(false)
          }
        }}
      >
        提交
      </Button>
    </Space.Compact>
  )
}

function buildColumns(onFixRow: (row: PreviewRow, productName: string) => Promise<void>): ColumnsType<PreviewRow> {
  return [
    ...COLUMNS,
    {
      title: "操作",
      key: "fix_action",
      width: 160,
      fixed: "right",
      render: (_: unknown, r: PreviewRow) => (
        <FixProductNameCell row={r} onSubmit={value => onFixRow(r, value)} />
      ),
    },
  ]
}

function canConfirmEntry(preview?: ImportPreviewResponse): boolean {
  return !!preview && preview.importable_rows > 0 && preview.missing_headers.length === 0
}

function formatImportDoneMessage(batch: ImportBatch): string {
  const newCount = batch.new_rows ?? 0
  const appendCount = batch.existing_rows ?? 0
  const skipped = (batch.duplicate_rows ?? 0) + (batch.uncertain_rows ?? 0) + (batch.validation_failed_rows ?? 0)
  const writeFailed = batch.write_failed_rows ?? 0
  const base = `导入完成：新增 ${newCount} 个询单，向已有询单追加 ${appendCount} 个款式，跳过 ${skipped} 行`
  return writeFailed > 0 ? `${base}，写入失败 ${writeFailed} 行` : base
}

interface FileCardProps {
  entry: FileEntry
  onPreview: (uid: string) => void
  onConfirm: (uid: string) => void
  onRemove: (uid: string) => void
  onFixRow: (uid: string, row: PreviewRow, productName: string) => Promise<void>
}

function FileCard({ entry, onPreview, onConfirm, onRemove, onFixRow }: FileCardProps) {
  const { uid, file, status, preview, batch, error } = entry
  const columns = buildColumns((row, productName) => onFixRow(uid, row, productName))
  const navigate = useNavigate()

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
            <Button
              size="small"
              type="primary"
              icon={<ImportOutlined />}
              disabled={!canConfirmEntry(preview)}
              onClick={() => onConfirm(uid)}
            >
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
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}><Statistic title="总行数"        value={preview.total_rows}                    /></Col>
            <Col span={4}><Statistic title="新询单"        value={preview.new_inquiry_rows}              valueStyle={{ color: "#1677ff" }} /></Col>
            <Col span={4}><Statistic title="已有询单新增款式" value={preview.existing_inquiry_new_item_rows} valueStyle={{ color: "#13c2c2" }} /></Col>
            <Col span={4}><Statistic title="重复款式"      value={preview.duplicate_item_rows}           valueStyle={{ color: "#fa8c16" }} /></Col>
            <Col span={4}><Statistic title="待确认款式"    value={preview.uncertain_existing_item_rows}  valueStyle={{ color: "#d4b106" }} /></Col>
            <Col span={4}><Statistic title="校验失败"      value={preview.failed_rows}                   valueStyle={{ color: "#ff4d4f" }} /></Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}><Statistic title="可导入"        value={preview.importable_rows}               valueStyle={{ color: "#52c41a" }} /></Col>
          </Row>

          {preview.missing_headers.length > 0 && (
            <Alert
              type="error" showIcon style={{ marginBottom: 8 }}
              message={`缺少必填列：${preview.missing_headers.join("、")}，请检查 Excel 表头后重新上传`}
            />
          )}

          {preview.skipped_rows > 0 && (
            <Alert
              type="warning" showIcon style={{ marginBottom: 8 }}
              message={`${preview.failed_rows} 行校验失败、${preview.duplicate_item_rows} 行重复款式、${preview.uncertain_existing_item_rows} 行已有询单但无法确认款式新旧，确认导入时这些行将被跳过`}
            />
          )}

          {preview.unmapped_headers.length > 0 && (
            <Alert
              type="info" showIcon style={{ marginBottom: 8 }}
              message={`以下列头未被识别，已忽略：${preview.unmapped_headers.join("、")}`}
            />
          )}

          <Table<PreviewRow>
            rowKey="row_number"
            size="small"
            dataSource={preview.rows}
            columns={columns}
            scroll={{ x: 1460, y: 340 }}
            pagination={{
              pageSize: 50,
              showTotal: t => `共 ${t} 行（最多显示 200 行预览）`,
            }}
            rowClassName={r =>
              r.status === "failed"
                ? "row-failed"
                : r.status === "duplicate_item"
                ? "row-duplicate"
                : r.status === "existing_inquiry_item_uncertain"
                ? "row-uncertain"
                : r.status === "existing_inquiry_new_item"
                ? "row-append"
                : ""
            }
          />
        </>
      )}

      {status === "done" && batch && (
        <Alert
          type={(batch.write_failed_rows ?? 0) > 0 ? "warning" : "success"}
          showIcon
          message={formatImportDoneMessage(batch)}
          action={
            (batch.write_failed_rows ?? 0) > 0 ? (
              <Button
                size="small"
                onClick={() => navigate(
                  `/operation-logs?import_batch_id=${batch.id}&action_type=import_row_write_failed`
                )}
              >
                查看失败行
              </Button>
            ) : undefined
          }
          description={
            (batch.write_failed_rows ?? 0) > 0
              ? "部分行写入数据库时失败（不影响其他行已成功导入），可在「操作日志」中查看具体失败原因。"
              : undefined
          }
        />
      )}
    </Card>
  )
}

export default function InquiryImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [messageApi, contextHolder] = message.useMessage()
  const [entries, setEntries] = useState<FileEntry[]>([])
  const uidRef = useRef(0)

  const currentUser = useCurrentUser()
  const allUsers = useUsers()
  const canPickSales = currentUser.role === "admin" || currentUser.role === "group_leader"
  const salesOptions = allUsers
    .filter(u => u.role === "sales" && u.display_name)
    .map(u => ({ value: u.display_name as string, label: u.display_name as string }))
  const [overrideSales, setOverrideSales] = useState<string | undefined>(undefined)

  const updateEntry = useCallback((uid: string, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.uid === uid ? { ...e, ...patch } : e))
  }, [])

  const addFiles = useCallback((files: File[]) => {
    setEntries(prev => {
      const existing = new Set(prev.map(e => e.file.name))
      const newEntries: FileEntry[] = files
        .filter(f => !existing.has(f.name))
        .map(f => ({ uid: String(++uidRef.current), file: f, status: "idle" as FileStatus }))
      return [...prev, ...newEntries]
    })
  }, [])

  const handlePreview = useCallback(async (uid: string) => {
    const entry = entries.find(e => e.uid === uid)
    if (!entry) return
    updateEntry(uid, { status: "previewing", error: undefined })
    try {
      const preview = await previewImport(entry.file, 200, overrideSales)
      updateEntry(uid, { status: "previewed", preview })
    } catch (err) {
      updateEntry(uid, { status: "error", error: (err as Error).message })
    }
  }, [entries, updateEntry, overrideSales])

  const handleConfirm = useCallback(async (uid: string) => {
    const entry = entries.find(e => e.uid === uid)
    if (!entry?.preview || !canConfirmEntry(entry.preview)) return
    updateEntry(uid, { status: "importing" })
    try {
      const batch = await confirmImport(entry.file, undefined, overrideSales)
      updateEntry(uid, { status: "done", batch })
      const notify = (batch.write_failed_rows ?? 0) > 0 ? messageApi.warning : messageApi.success
      notify(`「${entry.file.name}」${formatImportDoneMessage(batch)}`)
    } catch (err) {
      updateEntry(uid, { status: "error", error: (err as Error).message })
      messageApi.error(`导入失败：${(err as Error).message}`)
    }
  }, [entries, updateEntry, messageApi, overrideSales])

  const handleFixRow = useCallback(async (uid: string, row: PreviewRow, productName: string) => {
    const entry = entries.find(e => e.uid === uid)
    if (!entry) return
    try {
      const batch = await confirmImportRows({
        file_name: entry.file.name,
        rows: [{
          row_number: row.row_number,
          inquiry_no: row.inquiry_no,
          parsed_data: { ...row.parsed_data, product_name: productName },
        }],
        override_sales: overrideSales,
      })
      const notify = (batch.write_failed_rows ?? 0) > 0 ? messageApi.warning : messageApi.success
      notify(`第 ${row.row_number} 行已补充品名并提交：${formatImportDoneMessage(batch)}`)
      queryClient.invalidateQueries({ queryKey: ["inquiries"] })
    } catch (err) {
      messageApi.error(`提交失败：${(err as Error).message}`)
    }
  }, [entries, messageApi, overrideSales, queryClient])

  const idleCount      = entries.filter(e => e.status === "idle").length
  const previewedCount = entries.filter(e => e.status === "previewed" && canConfirmEntry(e.preview)).length
  const doneCount      = entries.filter(e => e.status === "done").length

  async function handleConfirmAll() {
    for (const e of entries.filter(e => e.status === "previewed" && canConfirmEntry(e.preview))) {
      await handleConfirm(e.uid)
    }
    queryClient.invalidateQueries({ queryKey: ["inquiries"] })
    queryClient.invalidateQueries({
      predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("analytics"),
    })
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {contextHolder}
      <Title level={4} style={{ marginBottom: 20 }}>导入询单表</Title>

      {canPickSales && (
        <Space style={{ marginBottom: 16 }}>
          <Text>归属业务员：</Text>
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="— 保持默认（Excel/文件名/本人） —"
            value={overrideSales}
            onChange={setOverrideSales}
            options={salesOptions}
          />
        </Space>
      )}

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
        <p className="ant-upload-hint">支持 .xlsx / .xls，可同时选择多个文件</p>
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
          {previewedCount > 0 && (
            <Button type="primary" icon={<ImportOutlined />} onClick={handleConfirmAll}>
              全部确认导入（{previewedCount} 个）
            </Button>
          )}
          {doneCount > 0 && (
            <Tag icon={<CheckCircleOutlined />} color="success">已完成 {doneCount} 个</Tag>
          )}
          <Button
            icon={<DeleteOutlined />}
            onClick={() => setEntries(prev => prev.filter(e => e.status !== "idle" && e.status !== "error"))}
          >
            清除待处理
          </Button>
          {doneCount > 0 && doneCount === entries.length && (
            <Button onClick={() => navigate("/")}>返回询单总表</Button>
          )}
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
            onFixRow={handleFixRow}
          />
        ))
      )}

      <style>{`
        .row-failed    td { background-color: #fff1f0 !important; }
        .row-duplicate td { background-color: #fff7e6 !important; }
        .row-uncertain td { background-color: #feffe6 !important; }
        .row-append    td { background-color: #e6fffb !important; }
      `}</style>
    </div>
  )
}
