import type { ReactNode } from "react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  Alert, Button, Card, Col, Row, Space, Statistic, Table, Tag, Typography, Upload, message,
} from "antd"
import { InboxOutlined } from "@ant-design/icons"
import type { ColumnsType } from "antd/es/table"

import { confirmImport, previewImport } from "@/api/imports"
import type { ImportPreviewResponse, PreviewRow } from "@/types/import"

const { Text, Title } = Typography
const { Dragger } = Upload

type PageState = "idle" | "previewing" | "previewed" | "importing"

const STATUS_TAG: Record<string, ReactNode> = {
  new:       <Tag color="blue">新增</Tag>,
  existing:  <Tag color="default">已存在</Tag>,
  duplicate: <Tag color="orange">文件内重复</Tag>,
  failed:    <Tag color="red">校验失败</Tag>,
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

export default function InquiryImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [messageApi, contextHolder] = message.useMessage()

  const [file, setFile] = useState<File | null>(null)
  const [pageState, setPageState] = useState<PageState>("idle")
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  function handleFileSelect(f: File) {
    setFile(f)
    setPreview(null)
    setImportError(null)
    setPageState("idle")
  }

  async function handlePreview() {
    if (!file) return
    setPageState("previewing")
    setPreview(null)
    setImportError(null)
    try {
      const result = await previewImport(file, 200)
      setPreview(result)
      setPageState("previewed")
    } catch (err) {
      setPageState("idle")
      setImportError((err as Error).message)
    }
  }

  async function handleConfirm() {
    if (!file) return
    setPageState("importing")
    try {
      const batch = await confirmImport(file)
      // 导入成功后刷新询单列表和所有分析数据
      queryClient.invalidateQueries({ queryKey: ["inquiries"] })
      queryClient.invalidateQueries({
        predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("analytics"),
      })
      messageApi.success(`导入完成！新增 ${batch.new_rows ?? 0} 条询单`)
      setTimeout(() => navigate("/"), 1000)
    } catch (err) {
      setPageState("previewed")
      setImportError((err as Error).message)
    }
  }

  const canConfirm =
    preview !== null &&
    preview.new_rows > 0 &&
    preview.missing_headers.length === 0

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {contextHolder}
      <Title level={4} style={{ marginBottom: 20 }}>导入询单表</Title>

      {/* ① 选择文件 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Dragger
          accept=".xlsx,.xls"
          multiple={false}
          showUploadList={false}
          beforeUpload={f => { handleFileSelect(f as File); return false }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 40, color: "#1677ff" }} />
          </p>
          <p className="ant-upload-text">点击或拖拽询单表 Excel 文件到此区域</p>
          <p className="ant-upload-hint">支持 .xlsx / .xls 格式</p>
        </Dragger>

        {file && (
          <Space style={{ marginTop: 12 }}>
            <Text strong>{file.name}</Text>
            <Text type="secondary">({(file.size / 1024 / 1024).toFixed(2)} MB)</Text>
            <Button
              type="primary"
              loading={pageState === "previewing"}
              disabled={pageState === "importing"}
              onClick={handlePreview}
            >
              上传并预览
            </Button>
          </Space>
        )}
      </Card>

      {/* 错误提示 */}
      {importError && (
        <Alert
          type="error"
          message={importError}
          showIcon
          closable
          style={{ marginBottom: 16 }}
          onClose={() => setImportError(null)}
        />
      )}

      {/* ② 预览结果 */}
      {preview && (
        <Card
          size="small"
          title={`预览结果 — ${preview.file_name}（Sheet: ${preview.sheet_name}）`}
          extra={
            <Space>
              <Button
                loading={pageState === "previewing"}
                disabled={pageState === "importing"}
                onClick={handlePreview}
              >
                重新预览
              </Button>
              <Button
                type="primary"
                loading={pageState === "importing"}
                disabled={!canConfirm}
                onClick={handleConfirm}
              >
                确认导入
              </Button>
            </Space>
          }
        >
          {/* 统计卡片 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Statistic title="总行数" value={preview.total_rows} />
            </Col>
            <Col span={4}>
              <Statistic title="将新增" value={preview.new_rows} valueStyle={{ color: "#1677ff" }} />
            </Col>
            <Col span={4}>
              <Statistic title="已存在" value={preview.existing_rows} valueStyle={{ color: "#8c8c8c" }} />
            </Col>
            <Col span={4}>
              <Statistic title="文件内重复" value={preview.duplicate_rows} valueStyle={{ color: "#fa8c16" }} />
            </Col>
            <Col span={4}>
              <Statistic title="校验失败" value={preview.failed_rows} valueStyle={{ color: "#ff4d4f" }} />
            </Col>
            <Col span={4}>
              <Statistic title="可导入" value={preview.success_rows} valueStyle={{ color: "#52c41a" }} />
            </Col>
          </Row>

          {/* 缺少必填列 → 阻断导入 */}
          {preview.missing_headers.length > 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 8 }}
              message={`缺少必填列：${preview.missing_headers.join("、")}，请检查 Excel 表头后重新上传`}
            />
          )}

          {/* 有失败或重复行 → 提示但不阻断 */}
          {(preview.failed_rows > 0 || preview.duplicate_rows > 0) && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 8 }}
              message={`${preview.failed_rows} 行校验失败、${preview.duplicate_rows} 行文件内重复，确认导入时这些行将被跳过`}
            />
          )}

          {/* 未识别列 → 仅提示 */}
          {preview.unmapped_headers.length > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 8 }}
              message={`以下列头未被识别，已忽略：${preview.unmapped_headers.join("、")}`}
            />
          )}

          {/* 逐行明细 */}
          <Table<PreviewRow>
            rowKey="row_number"
            size="small"
            dataSource={preview.rows}
            columns={COLUMNS}
            scroll={{ x: 1300, y: 400 }}
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
        </Card>
      )}

      <style>{`
        .row-failed    td { background-color: #fff1f0 !important; }
        .row-duplicate td { background-color: #fff7e6 !important; }
      `}</style>
    </div>
  )
}
