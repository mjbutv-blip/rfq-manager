import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Button, Card, Col, Form, Input, Modal, Row, Select,
  Space, Statistic, Table, Tag, Tooltip, Typography, message,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import {
  CheckOutlined, EyeOutlined, ReloadOutlined, SyncOutlined,
} from "@ant-design/icons"

import {
  fetchWarnings, fetchWarningSummary, resolveWarning, runWarningCheck,
} from "@/api/warnings"
import type { InquiryWarningRich } from "@/types/warning"
import { WARNING_LEVEL_COLOR, WARNING_LEVEL_LABEL, WARNING_TYPE_LABEL } from "@/types/warning"
import { useCurrentUser } from "@/contexts/UserContext"

const { Text } = Typography
const { TextArea } = Input

// ── 标记已处理弹窗 ────────────────────────────────────────────────────────────

interface ResolveModalProps {
  warning: InquiryWarningRich | null
  onClose: () => void
  onResolved: () => void
}

function ResolveModal({ warning, onClose, onResolved }: ResolveModalProps) {
  const [note, setNote] = useState("")
  const [msgApi, ctx] = message.useMessage()

  const mutation = useMutation({
    mutationFn: () => resolveWarning(warning!.id, note || undefined),
    onSuccess: () => {
      msgApi.success("已标记为处理完成")
      setNote("")
      onResolved()
      onClose()
    },
    onError: (e: Error) => msgApi.error(`操作失败：${e.message}`),
  })

  return (
    <Modal
      title="标记为已处理"
      open={!!warning}
      onCancel={onClose}
      onOk={() => mutation.mutate()}
      okText="确认处理"
      cancelText="取消"
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      {ctx}
      {warning && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Tag color={WARNING_LEVEL_COLOR[warning.warning_level]}>
              {WARNING_LEVEL_LABEL[warning.warning_level]}
            </Tag>
            <Text style={{ marginLeft: 8 }}>{warning.warning_message}</Text>
          </div>
          {warning.suggested_action && (
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary">建议：{warning.suggested_action}</Text>
            </div>
          )}
          <Form.Item label="处理备注（可选）" style={{ marginBottom: 0 }}>
            <TextArea
              rows={3}
              placeholder="填写处理说明，如：已补充负责业务员"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </Form.Item>
        </>
      )}
    </Modal>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { label: "全部类型", value: "" },
  { label: "必填字段缺失", value: "missing_required_field" },
  { label: "跟进超时",    value: "follow_up_timeout" },
  { label: "价格异常",    value: "price_abnormal" },
  { label: "状态矛盾",    value: "status_conflict" },
  { label: "打样逾期",    value: "sample_overdue" },
  { label: "生产延期",    value: "production_delay" },
]

const LEVEL_OPTIONS = [
  { label: "全部级别", value: "" },
  { label: "高",       value: "high" },
  { label: "中",       value: "medium" },
  { label: "低",       value: "low" },
]

const RESOLVED_OPTIONS = [
  { label: "未处理", value: "false" },
  { label: "已处理", value: "true" },
]

export default function WarningPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const [msgApi, ctx] = message.useMessage()

  const canResolve = currentUser.role !== "viewer"
  const canRunCheck = currentUser.role !== "viewer"

  // 筛选状态
  const [filterType,     setFilterType]     = useState("")
  const [filterLevel,    setFilterLevel]    = useState("")
  const [filterResolved, setFilterResolved] = useState("false")
  const [filterNo,       setFilterNo]       = useState("")
  const [filterGroup,    setFilterGroup]    = useState("")
  const [filterSales,    setFilterSales]    = useState("")
  const [filterCustomer, setFilterCustomer] = useState("")
  const [page,           setPage]           = useState(1)

  const [resolvingWarning, setResolvingWarning] = useState<InquiryWarningRich | null>(null)

  const isResolved = filterResolved === "true"

  const { data: summary } = useQuery({
    queryKey: ["warning-summary"],
    queryFn: fetchWarningSummary,
    refetchInterval: 60_000,
  })

  const { data, isFetching } = useQuery({
    queryKey: ["warnings", filterType, filterLevel, isResolved, filterNo,
               filterGroup, filterSales, filterCustomer, page],
    queryFn: () => fetchWarnings({
      warning_type:        filterType        || undefined,
      warning_level:       filterLevel       || undefined,
      is_resolved:         isResolved,
      inquiry_no:          filterNo          || undefined,
      group_name:          filterGroup       || undefined,
      responsible_sales:   filterSales       || undefined,
      customer_short_name: filterCustomer    || undefined,
      page,
      page_size: 50,
    }),
    placeholderData: prev => prev,
  })

  const runCheckMutation = useMutation({
    mutationFn: runWarningCheck,
    onSuccess: res => {
      msgApi.success(
        `预警检查完成：扫描 ${res.scanned} 条，新增 ${res.warnings_added} 条，清除 ${res.warnings_removed} 条`
      )
      queryClient.invalidateQueries({ queryKey: ["warnings"] })
      queryClient.invalidateQueries({ queryKey: ["warning-summary"] })
    },
    onError: (e: Error) => msgApi.error(`检查失败：${e.message}`),
  })

  const handleResolved = () => {
    queryClient.invalidateQueries({ queryKey: ["warnings"] })
    queryClient.invalidateQueries({ queryKey: ["warning-summary"] })
  }

  const handleReset = () => {
    setFilterType(""); setFilterLevel(""); setFilterNo("")
    setFilterGroup(""); setFilterSales(""); setFilterCustomer("")
    setFilterResolved("false"); setPage(1)
  }

  const columns: ColumnsType<InquiryWarningRich> = [
    {
      title: "级别",
      dataIndex: "warning_level",
      width: 58,
      render: (v: string) => (
        <Tag color={WARNING_LEVEL_COLOR[v]} style={{ marginRight: 0 }}>
          {WARNING_LEVEL_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: "类型",
      dataIndex: "warning_type",
      width: 100,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {WARNING_TYPE_LABEL[v] ?? v}
        </Text>
      ),
    },
    {
      title: "预警内容",
      dataIndex: "warning_message",
      ellipsis: { showTitle: false },
      render: (v: string) => <Tooltip title={v}><span>{v}</span></Tooltip>,
    },
    {
      title: "询单号",
      dataIndex: "inquiry_no",
      width: 120,
      render: (v: string, r) => (
        <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a>
      ),
    },
    {
      title: "客户",
      dataIndex: "customer_short_name",
      width: 90,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "小组",
      dataIndex: "group_name",
      width: 70,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "负责业务员",
      dataIndex: "responsible_sales",
      width: 90,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "品名",
      dataIndex: "product_name",
      width: 130,
      ellipsis: { showTitle: false },
      render: (v: string | null) => v
        ? <Tooltip title={v}><span>{v}</span></Tooltip>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "报价/订单",
      width: 110,
      render: (_: unknown, r: InquiryWarningRich) => (
        <Text style={{ fontSize: 11 }}>
          {r.quote_status ?? "—"} / {r.order_status ?? "—"}
        </Text>
      ),
    },
    {
      title: "发现时间",
      dataIndex: "created_at",
      width: 95,
      render: (v: string) => v.slice(0, 10),
    },
    {
      title: "状态",
      dataIndex: "is_resolved",
      width: 65,
      render: (v: boolean, r) =>
        v ? (
          <Tooltip title={`${r.resolved_by ?? ""} ${r.resolved_note ? `· ${r.resolved_note}` : ""}`}>
            <Tag color="green">已处理</Tag>
          </Tooltip>
        ) : (
          <Tag color="red">待处理</Tag>
        ),
    },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: canResolve ? 110 : 70,
      render: (_: unknown, r: InquiryWarningRich) => (
        <Space size={4}>
          <Tooltip title="查看询单">
            <Button
              size="small" type="text" icon={<EyeOutlined />}
              onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}
            />
          </Tooltip>
          {canResolve && !r.is_resolved && (
            <Tooltip title="标记已处理">
              <Button
                size="small" type="text" icon={<CheckOutlined />}
                style={{ color: "#52c41a" }}
                onClick={() => setResolvingWarning(r)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      {ctx}

      {/* 标题栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>预警中心</Typography.Title>
        {canRunCheck && (
          <Button
            icon={<SyncOutlined spin={runCheckMutation.isPending} />}
            loading={runCheckMutation.isPending}
            onClick={() => runCheckMutation.mutate()}
          >
            重新运行预警检查
          </Button>
        )}
      </div>

      {/* 统计卡片 */}
      {summary && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="未处理预警"
                value={summary.total_unresolved}
                valueStyle={{ color: summary.total_unresolved > 0 ? "#ff4d4f" : "#52c41a" }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="高风险" value={summary.high}
                valueStyle={{ color: summary.high > 0 ? "#ff4d4f" : undefined }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="中风险" value={summary.medium}
                valueStyle={{ color: summary.medium > 0 ? "#fa8c16" : undefined }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="按类型"
                formatter={() => (
                  <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                    <div>必填缺失 <strong>{summary.missing_required_field}</strong></div>
                    <div>跟进超时 <strong>{summary.follow_up_timeout}</strong></div>
                    <div>价格异常 <strong>{summary.price_abnormal}</strong></div>
                    <div>状态矛盾 <strong>{summary.status_conflict}</strong></div>
                    <div>打样逾期 <strong>{summary.sample_overdue ?? 0}</strong></div>
                    <div>生产延期 <strong>{summary.production_delay ?? 0}</strong></div>
                  </div>
                )}
                value=""
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[8, 8]}>
          <Col xs={12} sm={8} md={4}>
            <Select
              value={filterType} onChange={v => { setFilterType(v); setPage(1) }}
              options={TYPE_OPTIONS} style={{ width: "100%" }} placeholder="预警类型"
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Select
              value={filterLevel} onChange={v => { setFilterLevel(v); setPage(1) }}
              options={LEVEL_OPTIONS} style={{ width: "100%" }} placeholder="预警级别"
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Select
              value={filterResolved} onChange={v => { setFilterResolved(v); setPage(1) }}
              options={RESOLVED_OPTIONS} style={{ width: "100%" }}
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="询单号" value={filterNo}
              onChange={e => { setFilterNo(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="小组" value={filterGroup}
              onChange={e => { setFilterGroup(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="负责业务员" value={filterSales}
              onChange={e => { setFilterSales(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="客户简称" value={filterCustomer}
              onChange={e => { setFilterCustomer(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={8} md={2}>
            <Button icon={<ReloadOutlined />} onClick={handleReset} style={{ width: "100%" }}>
              重置
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 预警表格 */}
      <Table<InquiryWarningRich>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        size="small"
        bordered
        scroll={{ x: 1200, y: "calc(100vh - 400px)" }}
        rowClassName={r =>
          !r.is_resolved && r.warning_level === "high" ? "warning-row-high" : ""
        }
        pagination={{
          current: page,
          pageSize: 50,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: p => setPage(p),
          showTotal: total => `共 ${total} 条`,
        }}
      />

      {/* 标记已处理弹窗 */}
      <ResolveModal
        warning={resolvingWarning}
        onClose={() => setResolvingWarning(null)}
        onResolved={handleResolved}
      />

      <style>{`
        .warning-row-high td { background-color: #fff2f0 !important; }
        .ant-table-cell { font-size: 12px; }
        a { cursor: pointer; }
      `}</style>
    </div>
  )
}
