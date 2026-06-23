/**
 * 资料补录任务（报价资料分析 Step 10）
 *
 * 把各分析页面发现的缺失资料转成可分配、可跟踪、可完成的任务。一个任务
 * 对应一条款式明细；款式资料补齐后任务会自动完成，不需要手动刷新。
 */

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import {
  Button, Card, DatePicker, Drawer, Input, message, Popconfirm, Select,
  Space, Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import type { Dayjs } from "dayjs"

import {
  cancelDataCompletionTask, completeDataCompletionTask,
  fetchDataCompletionTasks, updateDataCompletionTask,
} from "@/api/data_completion_tasks"
import { useCurrentUser } from "@/contexts/UserContext"
import type {
  DataCompletionTask, DataCompletionTaskFilter, TaskPriority, TaskStatus,
} from "@/types/data_completion_task"
import {
  SOURCE_MODULE_LABEL, TASK_PRIORITY_COLOR, TASK_PRIORITY_LABEL,
  TASK_STATUS_COLOR, TASK_STATUS_LABEL,
} from "@/types/data_completion_task"

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const STATUS_OPTIONS = (Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map(v => ({ label: TASK_STATUS_LABEL[v], value: v }))
const PRIORITY_OPTIONS = (Object.keys(TASK_PRIORITY_LABEL) as TaskPriority[]).map(v => ({ label: TASK_PRIORITY_LABEL[v], value: v }))

function apiErrorDetail(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { detail?: string } } }
  return err?.response?.data?.detail ?? fallback
}

export default function DataCompletionTasksPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const canManage = currentUser.role !== "viewer"
  const [msgApi, msgCtx] = message.useMessage()

  const [status, setStatus] = useState<TaskStatus | undefined>(undefined)
  const [priority, setPriority] = useState<TaskPriority | undefined>(undefined)
  const [assignedTo, setAssignedTo] = useState("")
  const [groupName, setGroupName] = useState("")
  const [customerCode, setCustomerCode] = useState("")
  const [responsibleSales, setResponsibleSales] = useState("")
  const [createdRange, setCreatedRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])
  const [dueRange, setDueRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])
  const [detailTask, setDetailTask] = useState<DataCompletionTask | null>(null)

  const filter: DataCompletionTaskFilter = {
    status, priority,
    assigned_to: assignedTo || undefined,
    group_name: groupName || undefined,
    customer_code: customerCode || undefined,
    responsible_sales: responsibleSales || undefined,
    created_start: createdRange[0] ? createdRange[0].format("YYYY-MM-DD") : undefined,
    created_end: createdRange[1] ? createdRange[1].format("YYYY-MM-DD") : undefined,
    due_start: dueRange[0] ? dueRange[0].format("YYYY-MM-DD") : undefined,
    due_end: dueRange[1] ? dueRange[1].format("YYYY-MM-DD") : undefined,
    page_size: 200,
  }

  const { data, isFetching } = useQuery({
    queryKey: ["data-completion-tasks", filter],
    queryFn: () => fetchDataCompletionTasks(filter),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["data-completion-tasks"] })
    queryClient.invalidateQueries({ queryKey: ["active-completion-task"] })
    queryClient.invalidateQueries({ queryKey: ["quote-analysis-overview"] })
    queryClient.invalidateQueries({ queryKey: ["quote-data-quality"] })
    queryClient.invalidateQueries({ queryKey: ["customer-category-styles"] })
    queryClient.invalidateQueries({ queryKey: ["process-analysis"] })
    queryClient.invalidateQueries({ queryKey: ["size-analysis"] })
    queryClient.invalidateQueries({ queryKey: ["quantity-analysis"] })
    queryClient.invalidateQueries({ queryKey: ["quote-preparer-analysis"] })
    queryClient.invalidateQueries({ queryKey: ["operation-logs"] })
  }

  const startMutation = useMutation({
    mutationFn: (taskId: string) => updateDataCompletionTask(taskId, { status: "in_progress" }),
    onSuccess: () => { msgApi.success("已开始处理"); invalidateAll() },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "操作失败")),
  })
  const completeMutation = useMutation({
    mutationFn: (taskId: string) => completeDataCompletionTask(taskId),
    onSuccess: () => { msgApi.success("任务已完成"); invalidateAll(); setDetailTask(null) },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "操作失败")),
  })
  const cancelMutation = useMutation({
    mutationFn: (taskId: string) => cancelDataCompletionTask(taskId),
    onSuccess: () => { msgApi.success("任务已取消"); invalidateAll(); setDetailTask(null) },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "操作失败")),
  })

  const handleReset = () => {
    setStatus(undefined); setPriority(undefined); setAssignedTo("")
    setGroupName(""); setCustomerCode(""); setResponsibleSales("")
    setCreatedRange([null, null]); setDueRange([null, null])
  }

  const goToInquiry = (task: DataCompletionTask) => {
    navigate(`/inquiry/${task.inquiry_id}?item_id=${task.inquiry_item_id}`)
  }

  const columns: ColumnsType<DataCompletionTask> = [
    { title: "优先级", dataIndex: "priority", width: 80,
      render: (v: TaskPriority) => <Tag color={TASK_PRIORITY_COLOR[v]}>{TASK_PRIORITY_LABEL[v]}</Tag> },
    { title: "状态", dataIndex: "status", width: 90,
      render: (v: TaskStatus) => <Tag color={TASK_STATUS_COLOR[v]}>{TASK_STATUS_LABEL[v]}</Tag> },
    { title: "询单号", dataIndex: "inquiry_no", width: 130,
      render: (v: string, r) => <a onClick={() => navigate(`/inquiry/${r.inquiry_id}`)}>{v}</a> },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: v => v ?? <Text type="secondary">—</Text> },
    { title: "品名", dataIndex: "product_name", width: 130, ellipsis: true, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "款号", dataIndex: "style_no", width: 90, render: v => v ?? <Text type="secondary">未填写</Text> },
    { title: "缺失字段", dataIndex: "missing_fields_json", width: 240,
      render: (fields: string[]) => <Space size={4} wrap>{fields.map(f => <Tag key={f} color="orange" style={{ marginRight: 0 }}>{f}</Tag>)}</Space> },
    { title: "负责人", dataIndex: "assigned_to", width: 100, render: v => v ?? <Text type="secondary">未指派</Text> },
    { title: "来源页面", dataIndex: "source_module", width: 140, render: v => SOURCE_MODULE_LABEL[v] ?? v },
    { title: "创建时间", dataIndex: "created_at", width: 150, render: v => new Date(v).toLocaleString("zh-CN") },
    { title: "截止日期", dataIndex: "due_date", width: 100, render: v => v ?? <Text type="secondary">—</Text> },
    {
      title: "操作", key: "action", width: 220, fixed: "right",
      render: (_: unknown, r: DataCompletionTask) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => setDetailTask(r)}>查看</Button>
          <Button size="small" type="link" onClick={() => goToInquiry(r)}>去补录</Button>
          {canManage && r.status === "open" && (
            <Button size="small" onClick={() => startMutation.mutate(r.id)}>开始处理</Button>
          )}
          {canManage && (r.status === "open" || r.status === "in_progress") && (
            <Popconfirm title="确认任务已补录完成？" onConfirm={() => completeMutation.mutate(r.id)}>
              <Button size="small" type="primary">完成任务</Button>
            </Popconfirm>
          )}
          {canManage && (r.status === "open" || r.status === "in_progress") && (
            <Popconfirm title="确认取消该补录任务？" onConfirm={() => cancelMutation.mutate(r.id)}>
              <Button size="small" danger>取消任务</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {msgCtx}
      <Title level={4} style={{ marginBottom: 16 }}>资料补录任务</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="状态" allowClear options={STATUS_OPTIONS} value={status}
            onChange={setStatus} style={{ width: 120 }} />
          <Select placeholder="优先级" allowClear options={PRIORITY_OPTIONS} value={priority}
            onChange={setPriority} style={{ width: 120 }} />
          <Input placeholder="负责人" allowClear value={assignedTo}
            onChange={e => setAssignedTo(e.target.value)} style={{ width: 120 }} />
          <Input placeholder="所属小组" allowClear value={groupName}
            onChange={e => setGroupName(e.target.value)} style={{ width: 120 }} />
          <Input placeholder="客户编码" allowClear value={customerCode}
            onChange={e => setCustomerCode(e.target.value)} style={{ width: 120 }} />
          <Input placeholder="负责业务员" allowClear value={responsibleSales}
            onChange={e => setResponsibleSales(e.target.value)} style={{ width: 120 }} />
          <RangePicker value={createdRange} placeholder={["创建日期起", "创建日期止"]}
            onChange={dates => setCreatedRange(dates ? [dates[0], dates[1]] : [null, null])} />
          <RangePicker value={dueRange} placeholder={["截止日期起", "截止日期止"]}
            onChange={dates => setDueRange(dates ? [dates[0], dates[1]] : [null, null])} />
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Card>

      <Card size="small">
        <Table<DataCompletionTask>
          rowKey="id" size="small" columns={columns}
          dataSource={data?.items ?? []} loading={isFetching}
          pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }}
          scroll={{ x: 1600 }}
        />
      </Card>

      <Drawer
        title="任务详情" open={!!detailTask} onClose={() => setDetailTask(null)} width={480}
      >
        {detailTask && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div>
              <Text type="secondary">询单号</Text>
              <div><a onClick={() => navigate(`/inquiry/${detailTask.inquiry_id}`)}>{detailTask.inquiry_no}</a></div>
            </div>
            <div><Text type="secondary">客户</Text><div>{detailTask.customer_short_name ?? "—"}</div></div>
            <div><Text type="secondary">品名 / 款号</Text><div>{detailTask.product_name ?? "未填写"} / {detailTask.style_no ?? "未填写"}</div></div>
            <div>
              <Text type="secondary">当前缺失字段</Text>
              <div><Space size={4} wrap>{detailTask.missing_fields_json.map(f => <Tag key={f} color="orange">{f}</Tag>)}</Space></div>
            </div>
            <div><Text type="secondary">来源页面</Text><div>{SOURCE_MODULE_LABEL[detailTask.source_module] ?? detailTask.source_module}</div></div>
            <div><Text type="secondary">负责人</Text><div>{detailTask.assigned_to ?? "未指派"}</div></div>
            <div>
              <Text type="secondary">状态</Text>
              <div><Tag color={TASK_STATUS_COLOR[detailTask.status]}>{TASK_STATUS_LABEL[detailTask.status]}</Tag></div>
            </div>
            <div><Text type="secondary">备注</Text><div>{detailTask.remark ?? "—"}</div></div>
            {detailTask.closed_reason && (
              <div><Text type="secondary">关闭原因</Text><div>{detailTask.closed_reason}</div></div>
            )}
            <Button type="primary" block onClick={() => goToInquiry(detailTask)}>去补录</Button>
            {canManage && (detailTask.status === "open" || detailTask.status === "in_progress") && (
              <Space style={{ width: "100%" }}>
                <Popconfirm title="确认任务已补录完成？" onConfirm={() => completeMutation.mutate(detailTask.id)}>
                  <Button style={{ flex: 1 }}>完成任务</Button>
                </Popconfirm>
                <Popconfirm title="确认取消该补录任务？" onConfirm={() => cancelMutation.mutate(detailTask.id)}>
                  <Button style={{ flex: 1 }} danger>取消任务</Button>
                </Popconfirm>
              </Space>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  )
}
