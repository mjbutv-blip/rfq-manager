import { useState, useRef } from "react"
import {
  Button, Card, Col, Descriptions, message, Modal, Row,
  Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import {
  CloudDownloadOutlined,
  DatabaseOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"

import { useCurrentUser } from "@/contexts/UserContext"
import {
  generateBackup,
  listBackups,
  downloadBackup,
  restorePreview,
} from "@/api/backups"
import type { BackupRecord, SheetInfo } from "@/api/backups"

const { Title, Text } = Typography

function formatSize(bytes: number | null): string {
  if (!bytes) return "-"
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function BackupPage() {
  const user = useCurrentUser()
  const qc   = useQueryClient()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<{
    file_name: string
    sheets: SheetInfo[]
    can_restore: boolean
    message: string
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── 列表 ────────────────────────────────────────────────────────────────────
  const { data: records = [], isFetching } = useQuery({
    queryKey: ["backups"],
    queryFn: () => listBackups(),
    enabled: user.role === "admin",
  })

  // ── 生成备份 ─────────────────────────────────────────────────────────────────
  const generateMut = useMutation({
    mutationFn: generateBackup,
    onSuccess: (result) => {
      message.success(`备份成功：${result.file_name}`)
      qc.invalidateQueries({ queryKey: ["backups"] })
    },
    onError: (err: Error) => message.error(`备份失败：${err.message}`),
  })

  // ── 下载 ─────────────────────────────────────────────────────────────────────
  const downloadMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => downloadBackup(id, name),
    onError: (err: Error) => message.error(`下载失败：${err.message}`),
  })

  // ── 恢复预览 ─────────────────────────────────────────────────────────────────
  const previewMut = useMutation({
    mutationFn: restorePreview,
    onSuccess: (data) => {
      setPreviewData(data)
      setPreviewOpen(true)
    },
    onError: (err: Error) => message.error(`预览失败：${err.message}`),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) previewMut.mutate(file)
    e.target.value = ""
  }

  if (user.role !== "admin") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <SafetyCertificateOutlined style={{ fontSize: 48, color: "#d9d9d9" }} />
        <p style={{ marginTop: 16, color: "#999" }}>仅管理员可访问备份功能</p>
      </div>
    )
  }

  const columns: ColumnsType<BackupRecord> = [
    {
      title: "备份名称",
      dataIndex: "backup_name",
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (s: string) =>
        s === "generated" ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>,
    },
    {
      title: "文件大小",
      dataIndex: "file_size",
      width: 110,
      render: formatSize,
    },
    {
      title: "生成人",
      dataIndex: "generated_by",
      width: 120,
    },
    {
      title: "生成时间",
      dataIndex: "generated_at",
      width: 175,
      render: (v: string | null) => v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-",
    },
    {
      title: "操作",
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<CloudDownloadOutlined />}
          disabled={record.status !== "generated" || !record.file_name}
          loading={downloadMut.isPending}
          onClick={() => downloadMut.mutate({
            id: record.backup_id,
            name: record.file_name ?? "backup.xlsx",
          })}
        >
          下载
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 20 }}>
        <DatabaseOutlined style={{ marginRight: 8 }} />
        数据备份与恢复
      </Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {/* 生成备份卡 */}
        <Col xs={24} md={12}>
          <Card
            title="生成系统备份"
            extra={
              <Button
                type="primary"
                icon={<DatabaseOutlined />}
                loading={generateMut.isPending}
                onClick={() => generateMut.mutate()}
              >
                立即生成备份
              </Button>
            }
          >
            <ul style={{ paddingLeft: 20, color: "#555", margin: 0 }}>
              <li>将所有业务表导出为 Excel（每表一个 Sheet）</li>
              <li>用户表不包含密码字段</li>
              <li>备份文件保存在服务器，通过认证接口下载</li>
              <li>建议每周手动备份一次</li>
            </ul>
          </Card>
        </Col>

        {/* 恢复预览卡 */}
        <Col xs={24} md={12}>
          <Card
            title="恢复预览"
            extra={
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <Button
                  icon={<EyeOutlined />}
                  loading={previewMut.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  上传并预览
                </Button>
              </>
            }
          >
            <ul style={{ paddingLeft: 20, color: "#555", margin: 0 }}>
              <li>上传备份文件，查看包含的数据表和行数</li>
              <li>校验必填字段是否完整</li>
              <li>预览不会修改数据库</li>
              <li>当前版本仅支持预览，恢复写入功能后续开放</li>
            </ul>
          </Card>
        </Col>
      </Row>

      {/* 备份历史表 */}
      <Card title="备份历史">
        <Table<BackupRecord>
          rowKey="backup_id"
          dataSource={records}
          columns={columns}
          loading={isFetching}
          pagination={{ pageSize: 20, showTotal: total => `共 ${total} 条` }}
          size="small"
          expandable={{
            expandedRowRender: (record) => (
              <Descriptions size="small" column={2} style={{ padding: "8px 16px" }}>
                <Descriptions.Item label="包含表（共）">
                  {record.included_tables.length} 张
                </Descriptions.Item>
                {Object.entries(record.row_counts).map(([t, n]) => (
                  <Descriptions.Item key={t} label={t}>
                    {n} 行
                  </Descriptions.Item>
                ))}
                {record.error_message && (
                  <Descriptions.Item label="错误" span={2}>
                    <Text type="danger">{record.error_message}</Text>
                  </Descriptions.Item>
                )}
              </Descriptions>
            ),
            rowExpandable: (r) =>
              r.included_tables.length > 0 || !!r.error_message,
          }}
        />
      </Card>

      {/* 恢复预览弹窗 */}
      <Modal
        title={<><EyeOutlined style={{ marginRight: 6 }} />恢复预览：{previewData?.file_name}</>}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={
          <Button onClick={() => setPreviewOpen(false)}>关闭</Button>
        }
        width={680}
      >
        {previewData && (
          <>
            <div style={{ marginBottom: 12 }}>
              {previewData.can_restore ? (
                <Tag color="success">文件结构完整</Tag>
              ) : (
                <Tag color="warning">部分字段缺失，请检查</Tag>
              )}
              <Text type="secondary" style={{ marginLeft: 8 }}>{previewData.message}</Text>
            </div>

            <Table<SheetInfo>
              rowKey="sheet_name"
              dataSource={previewData.sheets}
              size="small"
              pagination={false}
              columns={[
                { title: "Sheet 名称", dataIndex: "sheet_name" },
                {
                  title: "行数",
                  dataIndex: "row_count",
                  width: 80,
                  render: (n: number) => n.toLocaleString(),
                },
                {
                  title: "状态",
                  dataIndex: "status",
                  width: 80,
                  render: (s: string) =>
                    s === "ok" ? <Tag color="success">正常</Tag> : <Tag color="warning">警告</Tag>,
                },
                {
                  title: "缺失字段",
                  dataIndex: "missing_columns",
                  render: (cols: string[]) =>
                    cols.length ? cols.map(c => <Tag key={c} color="orange">{c}</Tag>) : "-",
                },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  )
}
