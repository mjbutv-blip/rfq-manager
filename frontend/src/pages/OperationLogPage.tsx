import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Input, Row,
  Select, Table, Tag, Tooltip, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { ReloadOutlined } from "@ant-design/icons"
import dayjs from "dayjs"

import { fetchOperationLogs } from "@/api/operation_logs"
import type { OperationLog } from "@/types/operation_log"
import {
  ACTION_TYPE_COLOR, ACTION_TYPE_LABEL, ROLE_LABEL, TARGET_TYPE_LABEL,
} from "@/types/operation_log"
import { useCurrentUser } from "@/contexts/UserContext"

const { Text } = Typography
const { RangePicker } = DatePicker

// ── 筛选选项 ──────────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  { label: "全部类型", value: "" },
  ...Object.entries(ACTION_TYPE_LABEL).map(([v, l]) => ({ label: l, value: v })),
]

const TARGET_OPTIONS = [
  { label: "全部对象", value: "" },
  ...Object.entries(TARGET_TYPE_LABEL).map(([v, l]) => ({ label: l, value: v })),
]

const STATUS_OPTIONS = [
  { label: "全部状态", value: "" },
  { label: "成功", value: "success" },
  { label: "失败", value: "failed" },
]

// ── 展开行：before / after JSON ───────────────────────────────────────────────

function JsonBlock({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  if (!data || Object.keys(data).length === 0) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <Text strong style={{ fontSize: 12 }}>{label}：</Text>
      <pre
        style={{
          background: "#f5f5f5", borderRadius: 4, padding: "6px 10px",
          fontSize: 11, margin: "4px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function ExpandedRow({ record }: { record: OperationLog }) {
  const hasBefore = !!record.before_data_json && Object.keys(record.before_data_json).length > 0
  const hasAfter  = !!record.after_data_json  && Object.keys(record.after_data_json).length > 0

  return (
    <div style={{ padding: "8px 16px" }}>
      <Descriptions size="small" column={3} style={{ marginBottom: 8 }}>
        {record.request_path && (
          <Descriptions.Item label="请求路径">
            <Text code style={{ fontSize: 11 }}>{record.request_method} {record.request_path}</Text>
          </Descriptions.Item>
        )}
        {record.ip_address && (
          <Descriptions.Item label="IP 地址">
            <Text code style={{ fontSize: 11 }}>{record.ip_address}</Text>
          </Descriptions.Item>
        )}
        {record.target_id && (
          <Descriptions.Item label="目标 ID">
            <Text code style={{ fontSize: 11 }}>{record.target_id.slice(0, 8)}…</Text>
          </Descriptions.Item>
        )}
      </Descriptions>
      {hasBefore && <JsonBlock label="修改前" data={record.before_data_json} />}
      {hasAfter  && <JsonBlock label="修改后" data={record.after_data_json} />}
      {!hasBefore && !hasAfter && (
        <Text type="secondary" style={{ fontSize: 12 }}>无快照数据</Text>
      )}
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function OperationLogPage() {
  const navigate = useNavigate()
  const currentUser = useCurrentUser()
  const [searchParams, setSearchParams] = useSearchParams()

  // 支持从其他页面带参数跳转过来（例如导入页"查看失败行" -> 按
  // import_batch_id + action_type=import_row_write_failed 预筛选）。
  const initialBatchId = searchParams.get("import_batch_id") || ""
  const initialAction  = searchParams.get("action_type") || ""

  const [filterActor,    setFilterActor]    = useState("")
  const [filterAction,   setFilterAction]   = useState(initialAction)
  const [filterTarget,   setFilterTarget]   = useState("")
  const [filterInqNo,    setFilterInqNo]    = useState("")
  const [filterStatus,   setFilterStatus]   = useState("")
  const [filterBatchId,  setFilterBatchId]  = useState(initialBatchId)
  const [filterDates,    setFilterDates]    = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null])
  const [page, setPage]                     = useState(1)

  const params = {
    actor_username: filterActor    || undefined,
    action_type:    filterAction   || undefined,
    target_type:    filterTarget   || undefined,
    inquiry_no:     filterInqNo    || undefined,
    status:         filterStatus   || undefined,
    import_batch_id: filterBatchId || undefined,
    start_date:     filterDates[0] ? filterDates[0].format("YYYY-MM-DD") : undefined,
    end_date:       filterDates[1] ? filterDates[1].format("YYYY-MM-DD") : undefined,
    page,
    page_size: 50,
  }

  const clearBatchFilter = () => {
    setFilterBatchId("")
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete("import_batch_id")
      return next
    })
  }

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["operation-logs", params],
    queryFn: () => fetchOperationLogs(params),
    placeholderData: prev => prev,
  })

  const handleReset = () => {
    setFilterActor(""); setFilterAction(""); setFilterTarget("")
    setFilterInqNo(""); setFilterStatus(""); setFilterDates([null, null])
    clearBatchFilter()
    setPage(1)
  }

  const columns: ColumnsType<OperationLog> = [
    {
      title: "操作时间",
      dataIndex: "created_at",
      width: 155,
      render: (v: string) => new Date(v).toLocaleString("zh-CN"),
    },
    {
      title: "操作人",
      width: 90,
      render: (_: unknown, r: OperationLog) => (
        <Tooltip title={r.actor_username}>
          <span>{r.actor_display_name ?? r.actor_username}</span>
        </Tooltip>
      ),
    },
    {
      title: "角色",
      dataIndex: "actor_role",
      width: 68,
      render: (v: string | null) => v ? (
        <Tag style={{ marginRight: 0 }}>{ROLE_LABEL[v] ?? v}</Tag>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: "操作类型",
      dataIndex: "action_type",
      width: 105,
      render: (v: string) => (
        <Tag color={ACTION_TYPE_COLOR[v] ?? "default"} style={{ marginRight: 0 }}>
          {ACTION_TYPE_LABEL[v] ?? v}
        </Tag>
      ),
    },
    {
      title: "目标",
      dataIndex: "target_type",
      width: 68,
      render: (v: string | null) => v
        ? <Text type="secondary" style={{ fontSize: 11 }}>{TARGET_TYPE_LABEL[v] ?? v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "询单号",
      dataIndex: "inquiry_no",
      width: 120,
      render: (v: string | null, r: OperationLog) =>
        v && r.inquiry_id ? (
          <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a>
        ) : (
          <Text type="secondary">{v ?? "—"}</Text>
        ),
    },
    {
      title: "Excel 行号",
      width: 80,
      render: (_: unknown, r: OperationLog) => {
        const v = r.after_data_json?.row_number
        return v != null ? String(v) : <Text type="secondary">—</Text>
      },
    },
    {
      title: "款号",
      width: 90,
      render: (_: unknown, r: OperationLog) => {
        const v = r.after_data_json?.style_no
        return v ? String(v) : <Text type="secondary">—</Text>
      },
    },
    {
      title: "描述",
      dataIndex: "description",
      ellipsis: { showTitle: false },
      render: (v: string | null) => v
        ? <Tooltip title={v}><span>{v}</span></Tooltip>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 65,
      render: (v: string) => (
        <Tag color={v === "success" ? "green" : "red"} style={{ marginRight: 0 }}>
          {v === "success" ? "成功" : "失败"}
        </Tag>
      ),
    },
    {
      title: "错误信息",
      dataIndex: "error_message",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v
        ? <Tooltip title={v}><Text type="danger" style={{ fontSize: 11 }}>{v}</Text></Tooltip>
        : null,
    },
  ]

  const isSales  = currentUser.role === "sales"
  const pageTitle = isSales ? "我的操作日志" : "操作日志"

  return (
    <div style={{ padding: 16 }}>

      {/* 标题 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{pageTitle}</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button>
      </div>

      {filterBatchId && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message={`已按导入批次筛选（batch_id: ${filterBatchId}）`}
          action={<Button size="small" onClick={clearBatchFilter}>清除筛选</Button>}
        />
      )}

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[8, 8]}>
          <Col xs={12} sm={8} md={4}>
            <Input
              placeholder="操作人用户名"
              value={filterActor}
              onChange={e => { setFilterActor(e.target.value); setPage(1) }}
              allowClear
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select
              value={filterAction} onChange={v => { setFilterAction(v); setPage(1) }}
              options={ACTION_OPTIONS} style={{ width: "100%" }} placeholder="操作类型"
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Select
              value={filterTarget} onChange={v => { setFilterTarget(v); setPage(1) }}
              options={TARGET_OPTIONS} style={{ width: "100%" }} placeholder="目标类型"
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input
              placeholder="询单号"
              value={filterInqNo}
              onChange={e => { setFilterInqNo(e.target.value); setPage(1) }}
              allowClear
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Select
              value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1) }}
              options={STATUS_OPTIONS} style={{ width: "100%" }} placeholder="状态"
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <RangePicker
              value={filterDates}
              onChange={dates => { setFilterDates(dates ? [dates[0], dates[1]] : [null, null]); setPage(1) }}
              style={{ width: "100%" }}
              placeholder={["开始日期", "结束日期"]}
            />
          </Col>
          <Col xs={12} sm={8} md={2}>
            <Button icon={<ReloadOutlined />} onClick={handleReset} style={{ width: "100%" }}>
              重置
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 日志表格 */}
      <Table<OperationLog>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        size="small"
        bordered
        scroll={{ x: 1100, y: "calc(100vh - 360px)" }}
        expandable={{
          expandedRowRender: record => <ExpandedRow record={record} />,
          rowExpandable: record =>
            !!(record.before_data_json || record.after_data_json ||
               record.request_path   || record.target_id),
        }}
        pagination={{
          current: page,
          pageSize: 50,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: p => setPage(p),
          showTotal: total => `共 ${total} 条`,
        }}
      />

      <style>{`
        .ant-table-cell { font-size: 12px; }
        a { cursor: pointer; }
      `}</style>
    </div>
  )
}
