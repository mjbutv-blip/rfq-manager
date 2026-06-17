import type { ReactNode } from "react"
import { useCallback, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  Alert, Badge, Button, Card, Col, Row, Space, Spin, Statistic, Table, Tag, Typography, Upload, message,
} from "antd"
import { CheckCircleOutlined, DeleteOutlined, EyeOutlined, FileExcelOutlined, ImportOutlined, InboxOutlined } from "@ant-design/icons"
import type { ColumnsType } from "antd/es/table"

import { confirmImport, previewImport } from "@/api/imports"
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
  new:       <Tag color="blue">新增</Tag>,
  existing:  <Tag color="default">已存在</Tag>,
  duplicate: <Tag color="orange">文件内重复</Tag>,
  failed:    <Tag color="red">校验失败</Tag>,
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
    title: "品名",
    key: "product_name",
    width: 160,
    ellipsis: true,
    render: (_: unknown, r: PreviewRow) => {
      const v = r.parsed_data.product_name
      return v != null
        ? <span title={String(v)}>{String(v)}</span>
        : <Text type="secondary">—</Text>
    },
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

function canConfirmEntry(preview?: ImportPreviewResponse): boolean {
  return !!preview && preview.new_rows > 0 && preview.missing_headers.length === 0
}

interface FileCardProps {
  entry: FileEntry
  onPreview: (uid: string) => void
  onConfirm: (uid: string) => void
  onRemove: (uid: string) => void
}

function FileCard({ entry, onPreview, onConfirm, onRemove }: FileCardProps) {
  const { uid, file, status, preview, batch, error } = entry

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
            <Col span={4}><Statistic title="总行数"      value={preview.total_rows}     /></Col>
            <Col span={4}><Statistic title="将新增"      value={preview.new_rows}       valueStyle={{ color: "#1677ff" }} /></Col>
            <Col span={4}><Statistic title="已存在"      value={preview.existing_rows}  valueStyle={{ color: "#8c8c8c" }} /></Col>
            <Col span={4}><Statistic title="文件内重复"  value={preview.duplicate_rows} valueStyle={{ color: "#fa8c16" }} /></Col>
            <Col span={4}><Statistic title="校验失败"    value={preview.failed_rows}    valueStyle={{ color: "#ff4d4f" }} /></Col>
            <Col span={4}><Statistic title="可导入"      value={preview.success_rows}   valueStyle={{ color: "#52c41a" }} /></Col>
          </Row>

          {preview.missing_headers.length > 0 && (
            <Alert
              type="error" showIcon style={{ marginBottom: 8 }}
              message={`缺少必填列：${preview.missing_headers.join("、")}，请检查 Excel 表头后重新上传`}
            />
          )}

          {(preview.failed_rows > 0 || preview.duplicate_rows > 0) && (
            <Alert
              type="warning" showIcon style={{ marginBottom: 8 }}
              message={`${preview.failed_rows} 行校验失败、${preview.duplicate_rows} 行文件内重复，确认导入时这些行将被跳过`}
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
            columns={COLUMNS}
            scroll={{ x: 1300, y: 340 }}
            pagination={{
              pageSize: 50,
              showTotal: t => `共 ${t} 行（最多显示 200 行预览）`,
            }}
            rowClassName={r =>
              r.status === "failed"
                ? "row-failed"
                : r.status === "duplicate"
                ? "row-duplicate"
                : ""
            }
          />
        </>
      )}

      {status === "done" && batch && (
        <Alert
          type="success"
          showIcon
          message={`成功导入 ${batch.new_rows ?? 0} 条询单`}
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
      const preview = await previewImport(entry.file, 200)
      updateEntry(uid, { status: "previewed", preview })
    } catch (err) {
      updateEntry(uid, { status: "error", error: (err as Error).message })
    }
  }, [entries, updateEntry])

  const handleConfirm = useCallback(async (uid: string) => {
    const entry = entries.find(e => e.uid === uid)
    if (!entry?.preview || !canConfirmEntry(entry.preview)) return
    updateEntry(uid, { status: "importing" })
    try {
      const batch = await confirmImport(entry.file)
      updateEntry(uid, { status: "done", batch })
      messageApi.success(`「${entry.file.name}」导入完成：新增 ${batch.new_rows ?? 0} 条`)
    } catch (err) {
      updateEntry(uid, { status: "error", error: (err as Error).message })
      messageApi.error(`导入失败：${(err as Error).message}`)
    }
  }, [entries, updateEntry, messageApi])

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
          />
        ))
      )}

      <style>{`
        .row-failed    td { background-color: #fff1f0 !important; }
        .row-duplicate td { background-color: #fff7e6 !important; }
      `}</style>
    </div>
  )
}
