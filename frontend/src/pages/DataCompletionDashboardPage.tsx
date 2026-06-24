/**
 * 补录任务看板（报价资料分析 Step 11）
 *
 * 让管理员、组长、业务员快速看到：待补录任务有多少、哪些是高优先级、
 * 哪些已逾期/即将到期、每个负责人手里有多少任务、哪些任务长期没人处理。
 * 只做汇总和跳转，不做绩效评分——负责人分布表只用于工作量与处理进度
 * 管理，不是排名。
 */

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Button, Card, Col, DatePicker, Input, Row, Select, Space, Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import type { Dayjs } from "dayjs"

import { fetchDataCompletionDashboard } from "@/api/data_completion_tasks"
import type {
  AssigneeStat, DashboardFilter, DashboardTaskBrief, DueState, TaskPriority, TaskStatus,
} from "@/types/data_completion_task"
import {
  DUE_STATE_LABEL, TASK_PRIORITY_COLOR, TASK_PRIORITY_LABEL,
  TASK_STATUS_COLOR, TASK_STATUS_LABEL,
} from "@/types/data_completion_task"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const STATUS_OPTIONS = (Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map(v => ({ label: TASK_STATUS_LABEL[v], value: v }))
const PRIORITY_OPTIONS = (Object.keys(TASK_PRIORITY_LABEL) as TaskPriority[]).map(v => ({ label: TASK_PRIORITY_LABEL[v], value: v }))
const DUE_STATE_OPTIONS = (Object.keys(DUE_STATE_LABEL) as DueState[]).map(v => ({ label: DUE_STATE_LABEL[v], value: v }))

export default function DataCompletionDashboardPage() {
  const navigate = useNavigate()

  const [groupName, setGroupName] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [priority, setPriority] = useState<TaskPriority | undefined>(undefined)
  const [status, setStatus] = useState<TaskStatus | undefined>(undefined)
  const [dueState, setDueState] = useState<DueState | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])

  const filter: DashboardFilter = {
    group_name: groupName || undefined,
    assigned_to: assignedTo || undefined,
    priority, status, due_state: dueState,
    start_date: dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined,
    end_date: dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["data-completion-dashboard", filter],
    queryFn: () => fetchDataCompletionDashboard(filter),
  })

  const handleReset = () => {
    setGroupName(""); setAssignedTo(""); setPriority(undefined)
    setStatus(undefined); setDueState(undefined); setDateRange([null, null])
  }

  // 跳转到任务列表时尽量保留当前看板的筛选条件，再叠加具体要看的负责人
  const goToTasks = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    if (groupName) params.set("group_name", groupName)
    if (priority) params.set("priority", priority)
    if (status) params.set("status", status)
    if (dueState) params.set("due_state", dueState)
    if (dateRange[0]) params.set("created_start", dateRange[0].format("YYYY-MM-DD"))
    if (dateRange[1]) params.set("created_end", dateRange[1].format("YYYY-MM-DD"))
    Object.entries(extra).forEach(([k, v]) => { if (v) params.set(k, v) })
    navigate(`/data-completion-tasks?${params.toString()}`)
  }

  const goToTaskDetail = (taskId: string) => {
    navigate(`/data-completion-tasks?task_id=${taskId}`)
  }

  const assigneeColumns: ColumnsType<AssigneeStat> = [
    { title: "负责人", dataIndex: "assigned_to", width: 120 },
    { title: "待处理", dataIndex: "open_count", width: 80, align: "right" },
    { title: "处理中", dataIndex: "in_progress_count", width: 80, align: "right" },
    { title: "高优先级", dataIndex: "high_priority_count", width: 90, align: "right",
      render: (v: number) => v > 0 ? <Text type="danger">{v}</Text> : v },
    { title: "已逾期", dataIndex: "overdue_count", width: 80, align: "right",
      render: (v: number) => v > 0 ? <Text type="danger">{v}</Text> : v },
    { title: "即将到期", dataIndex: "due_soon_count", width: 90, align: "right",
      render: (v: number) => v > 0 ? <Text type="warning">{v}</Text> : v },
    { title: "已完成", dataIndex: "completed_count", width: 80, align: "right" },
    { title: "操作", key: "action", width: 100,
      render: (_: unknown, r: AssigneeStat) => (
        <Button size="small" onClick={() => goToTasks({ assigned_to: r.assigned_to === "未分配" ? undefined : r.assigned_to })}>
          查看任务
        </Button>
      ) },
  ]

  const overdueColumns: ColumnsType<DashboardTaskBrief> = [
    { title: "优先级", dataIndex: "priority", width: 80,
      render: (v: TaskPriority) => <Tag color={TASK_PRIORITY_COLOR[v]}>{TASK_PRIORITY_LABEL[v]}</Tag> },
    { title: "状态", dataIndex: "status", width: 90,
      render: (v: TaskStatus) => <Tag color={TASK_STATUS_COLOR[v]}>{TASK_STATUS_LABEL[v]}</Tag> },
    { title: "逾期天数", dataIndex: "overdue_days", width: 90, align: "right",
      render: (v: number | null) => v != null ? <Text type="danger">{v} 天</Text> : "—" },
    { title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: DashboardTaskBrief) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a> },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 130, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "款号", dataIndex: "style_no", width: 90, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "缺失字段", dataIndex: "missing_fields_json", width: 220,
      render: (fields: string[]) => <Space size={4} wrap>{fields.map(f => <Tag key={f} color="orange" style={{ marginRight: 0 }}>{f}</Tag>)}</Space> },
    { title: "负责人", dataIndex: "assigned_to", width: 100, render: v => v ?? <Text type="secondary">未指派</Text> },
    { title: "截止日期", dataIndex: "due_date", width: 100 },
    { title: "操作", key: "action", width: 90, fixed: "right",
      render: (_: unknown, r: DashboardTaskBrief) => (
        <Button size="small" type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}?item_id=${r.inquiry_item_id}`)}>去补录</Button>
      ) },
  ]

  const dueSoonColumns: ColumnsType<DashboardTaskBrief> = [
    { title: "剩余天数", dataIndex: "days_until_due", width: 90, align: "right",
      render: (v: number | null) => v != null ? <Text type="warning">{v} 天</Text> : "—" },
    { title: "优先级", dataIndex: "priority", width: 80,
      render: (v: TaskPriority) => <Tag color={TASK_PRIORITY_COLOR[v]}>{TASK_PRIORITY_LABEL[v]}</Tag> },
    { title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: DashboardTaskBrief) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a> },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 130, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "负责人", dataIndex: "assigned_to", width: 100, render: v => v ?? <Text type="secondary">未指派</Text> },
    { title: "截止日期", dataIndex: "due_date", width: 100 },
    { title: "操作", key: "action", width: 90, fixed: "right",
      render: (_: unknown, r: DashboardTaskBrief) => (
        <Button size="small" type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}?item_id=${r.inquiry_item_id}`)}>去补录</Button>
      ) },
  ]

  const unassignedColumns: ColumnsType<DashboardTaskBrief> = [
    { title: "优先级", dataIndex: "priority", width: 80,
      render: (v: TaskPriority) => <Tag color={TASK_PRIORITY_COLOR[v]}>{TASK_PRIORITY_LABEL[v]}</Tag> },
    { title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r: DashboardTaskBrief) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a> },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 130, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "缺失字段", dataIndex: "missing_fields_json", width: 200,
      render: (fields: string[]) => <Space size={4} wrap>{fields.map(f => <Tag key={f} color="orange" style={{ marginRight: 0 }}>{f}</Tag>)}</Space> },
    { title: "截止日期", dataIndex: "due_date", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "操作", key: "action", width: 110, fixed: "right",
      render: (_: unknown, r: DashboardTaskBrief) => (
        <Button size="small" onClick={() => goToTaskDetail(r.id)}>去分配</Button>
      ) },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>补录任务看板</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input placeholder="所属小组" allowClear value={groupName}
            onChange={e => setGroupName(e.target.value)} style={{ width: 120 }} />
          <Input placeholder="负责人" allowClear value={assignedTo}
            onChange={e => setAssignedTo(e.target.value)} style={{ width: 120 }} />
          <Select placeholder="优先级" allowClear options={PRIORITY_OPTIONS} value={priority}
            onChange={setPriority} style={{ width: 110 }} />
          <Select placeholder="状态" allowClear options={STATUS_OPTIONS} value={status}
            onChange={setStatus} style={{ width: 110 }} />
          <Select placeholder="到期状态" allowClear options={DUE_STATE_OPTIONS} value={dueState}
            onChange={setDueState} style={{ width: 120 }} />
          <RangePicker value={dateRange} placeholder={["创建日期起", "创建日期止"]}
            onChange={dates => setDateRange(dates ? [dates[0], dates[1]] : [null, null])} />
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>待处理</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.open_count ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>处理中</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.summary.in_progress_count ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>高优先级待处理</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#fa541c" }}>{data?.summary.high_priority_open_count ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>已逾期</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#ff4d4f" }}>{data?.summary.overdue_count ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>3天内到期</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#faad14" }}>{data?.summary.due_soon_count ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>未分配</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{data?.unassigned_tasks.length ?? 0}</div>
        </Card></Col>
        <Col span={3}><Card size="small" loading={isFetching}>
          <Text type="secondary" style={{ fontSize: 12 }}>已完成</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#52c41a" }}>{data?.summary.completed_count ?? 0}</div>
        </Card></Col>
      </Row>

      <Card size="small" title="负责人任务分布" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
          本表用于查看任务工作量与处理进度，不代表个人绩效评价。
        </Text>
        <Table<AssigneeStat>
          rowKey="assigned_to" size="small" columns={assigneeColumns}
          dataSource={data?.by_assignee ?? []} loading={isFetching}
          pagination={false}
        />
      </Card>

      <Card size="small" title="已逾期任务" style={{ marginBottom: 16 }}>
        <Table<DashboardTaskBrief>
          rowKey="id" size="small" columns={overdueColumns}
          dataSource={data?.overdue_tasks ?? []} loading={isFetching}
          pagination={{ pageSize: 10 }} scroll={{ x: 1300 }}
        />
      </Card>

      <Card size="small" title="3 天内到期任务" style={{ marginBottom: 16 }}>
        <Table<DashboardTaskBrief>
          rowKey="id" size="small" columns={dueSoonColumns}
          dataSource={data?.due_soon_tasks ?? []} loading={isFetching}
          pagination={{ pageSize: 10 }} scroll={{ x: 900 }}
        />
      </Card>

      <Card size="small" title="待分配任务">
        <Table<DashboardTaskBrief>
          rowKey="id" size="small" columns={unassignedColumns}
          dataSource={data?.unassigned_tasks ?? []} loading={isFetching}
          pagination={{ pageSize: 10 }} scroll={{ x: 900 }}
        />
      </Card>
    </div>
  )
}
