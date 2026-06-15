import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Badge, Button, Card, Form, Input, Modal, Popconfirm,
  Select, Table, Tag, Typography, message,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import {
  CheckOutlined, DeleteOutlined, EditOutlined,
  KeyOutlined, PlusOutlined, ReloadOutlined,
} from "@ant-design/icons"

import { fetchAllUsers, updateUser, deleteUser, createUser, resetUserPassword } from "@/api/auth"
import type { CurrentUser } from "@/types/user"
import { ROLE_LABEL } from "@/types/user"
import { useCurrentUser } from "@/contexts/UserContext"

const { Text } = Typography

type UserRow = CurrentUser & { is_active: boolean; is_pending: boolean }

const ROLE_OPTIONS = [
  { label: "管理员", value: "admin" },
  { label: "组长", value: "group_leader" },
  { label: "业务员", value: "sales" },
  { label: "只读", value: "viewer" },
]

const ROLE_COLOR: Record<string, string> = {
  admin: "red", group_leader: "blue", sales: "green", viewer: "default",
}

const GROUP_OPTIONS = [
  { label: "A组", value: "A组" },
  { label: "B组", value: "B组" },
]

// ── 编辑用户弹窗 ───────────────────────────────────────────────────────────────

function EditUserModal({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form] = Form.useForm()

  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => updateUser(user!.username, values),
    onSuccess: () => {
      message.success("已更新")
      qc.invalidateQueries({ queryKey: ["all-users"] })
      qc.invalidateQueries({ queryKey: ["users"] })
      onClose()
    },
    onError: (e: Error) => message.error(e.message ?? "更新失败"),
  })

  return (
    <Modal
      title={`编辑用户：${user?.display_name ?? user?.username}`}
      open={!!user}
      onCancel={onClose}
      onOk={() => form.validateFields().then(values => {
        const clean: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(values)) {
          if (v !== undefined) clean[k] = v === "" ? null : v
        }
        mutation.mutate(clean)
      })}
      confirmLoading={mutation.isPending}
      destroyOnClose
      afterOpenChange={vis => {
        if (vis && user) {
          form.setFieldsValue({
            display_name: user.display_name ?? "",
            role: user.role,
            group_name: user.group_name ?? "",
            is_active: user.is_active,
            is_pending: user.is_pending,
          })
        }
      }}
    >
      <Form form={form} layout="vertical" size="small">
        <Form.Item name="display_name" label="姓名">
          <Input placeholder="中文姓名" />
        </Form.Item>
        <Form.Item name="role" label="角色" rules={[{ required: true }]}>
          <Select options={ROLE_OPTIONS} />
        </Form.Item>
        <Form.Item name="group_name" label="所属小组">
          <Select options={GROUP_OPTIONS} allowClear placeholder="可清空" />
        </Form.Item>
        <Form.Item name="is_pending" label="账号状态">
          <Select options={[
            { label: "✅ 已激活（可登录）", value: false },
            { label: "⏳ 待审批", value: true },
          ]} />
        </Form.Item>
        <Form.Item name="is_active" label="是否启用">
          <Select options={[
            { label: "启用", value: true },
            { label: "停用", value: false },
          ]} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ── 创建用户弹窗 ───────────────────────────────────────────────────────────────

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form] = Form.useForm()

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      message.success("用户已创建")
      qc.invalidateQueries({ queryKey: ["all-users"] })
      qc.invalidateQueries({ queryKey: ["users"] })
      form.resetFields()
      onClose()
    },
    onError: (e: Error) => message.error(e.message ?? "创建失败"),
  })

  return (
    <Modal
      title="创建用户"
      open={open}
      onCancel={() => { form.resetFields(); onClose() }}
      onOk={() => form.validateFields().then(values => {
        mutation.mutate({
          ...values,
          group_name: values.group_name || null,
          email: values.email || null,
        })
      })}
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" size="small" initialValues={{ role: "sales" }}>
        <Form.Item name="username" label="用户名" rules={[{ required: true, min: 2, max: 32 }]}>
          <Input placeholder="登录用户名（英文/数字）" />
        </Form.Item>
        <Form.Item name="display_name" label="姓名" rules={[{ required: true }]}>
          <Input placeholder="中文姓名" />
        </Form.Item>
        <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6 }]}>
          <Input.Password placeholder="至少 6 位" />
        </Form.Item>
        <Form.Item name="role" label="角色" rules={[{ required: true }]}>
          <Select options={ROLE_OPTIONS} />
        </Form.Item>
        <Form.Item name="group_name" label="所属小组">
          <Select options={GROUP_OPTIONS} allowClear placeholder="可不选" />
        </Form.Item>
        <Form.Item name="email" label="邮箱（选填）">
          <Input placeholder="可为空" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ── 重置密码弹窗 ───────────────────────────────────────────────────────────────

function ResetPasswordModal({
  username,
  onClose,
}: { username: string | null; onClose: () => void }) {
  const [form] = Form.useForm()

  const mutation = useMutation({
    mutationFn: ({ pwd }: { pwd: string }) => resetUserPassword(username!, pwd),
    onSuccess: () => {
      message.success("密码已重置")
      form.resetFields()
      onClose()
    },
    onError: (e: Error) => message.error(e.message ?? "重置失败"),
  })

  return (
    <Modal
      title={`重置密码：${username}`}
      open={!!username}
      onCancel={() => { form.resetFields(); onClose() }}
      onOk={() => form.validateFields().then(values => mutation.mutate({ pwd: values.new_password }))}
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" size="small">
        <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6, message: "至少 6 位" }]}>
          <Input.Password placeholder="至少 6 位" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认密码"
          dependencies={["new_password"]}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator(_, v) {
                return !v || getFieldValue("new_password") === v
                  ? Promise.resolve()
                  : Promise.reject(new Error("两次密码不一致"))
              },
            }),
          ]}
        >
          <Input.Password placeholder="再次输入" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────

export default function UserManagePage() {
  const currentUser = useCurrentUser()
  const qc = useQueryClient()
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<string | null>(null)

  const { data: users = [], isFetching } = useQuery({
    queryKey: ["all-users"],
    queryFn: fetchAllUsers,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      message.success("已删除")
      qc.invalidateQueries({ queryKey: ["all-users"] })
      qc.invalidateQueries({ queryKey: ["users"] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const approveMutation = useMutation({
    mutationFn: (username: string) => updateUser(username, { is_pending: false }),
    onSuccess: () => {
      message.success("已审批激活")
      qc.invalidateQueries({ queryKey: ["all-users"] })
      qc.invalidateQueries({ queryKey: ["users"] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  if (currentUser.role !== "admin") {
    return <div style={{ padding: 40, textAlign: "center" }}><Text type="danger">无权限访问</Text></div>
  }

  const pending = users.filter(u => u.is_pending).length

  const columns: ColumnsType<UserRow> = [
    {
      title: "用户名", dataIndex: "username", width: 120,
      render: (v: string, r) => (
        <span>
          {v}
          {r.username === currentUser.username && <Tag color="gold" style={{ marginLeft: 6, fontSize: 11 }}>我</Tag>}
        </span>
      ),
    },
    {
      title: "姓名", dataIndex: "display_name", width: 90,
      render: v => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "角色", dataIndex: "role", width: 80,
      render: (v: string) => <Tag color={ROLE_COLOR[v]}>{ROLE_LABEL[v as keyof typeof ROLE_LABEL] ?? v}</Tag>,
    },
    {
      title: "小组", dataIndex: "group_name", width: 70,
      render: v => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "状态", width: 90,
      render: (_: unknown, r: UserRow) => {
        if (r.is_pending) return <Badge status="warning" text="待审批" />
        if (!r.is_active) return <Badge status="error" text="已停用" />
        return <Badge status="success" text="正常" />
      },
    },
    {
      title: "操作", key: "action", width: 200,
      render: (_: unknown, r: UserRow) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {r.is_pending && (
            <Button size="small" type="primary" icon={<CheckOutlined />}
              loading={approveMutation.isPending}
              onClick={() => approveMutation.mutate(r.username)}>
              审批
            </Button>
          )}
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditTarget(r)}>编辑</Button>
          <Button size="small" icon={<KeyOutlined />} onClick={() => setResetTarget(r.username)}>重置密码</Button>
          {r.username !== currentUser.username && (
            <Popconfirm
              title={`确认删除用户 ${r.display_name ?? r.username}？`}
              onConfirm={() => deleteMutation.mutate(r.username)}
              okText="确认" cancelText="取消" okType="danger"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          用户管理
          {pending > 0 && <Badge count={pending} style={{ marginLeft: 8 }} />}
        </Typography.Title>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => setCreateOpen(true)}>新建用户</Button>
          <Button icon={<ReloadOutlined />} onClick={() => qc.invalidateQueries({ queryKey: ["all-users"] })}>刷新</Button>
        </div>
      </div>

      {pending > 0 && (
        <div style={{ marginBottom: 12, padding: "8px 16px", background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: 6 }}>
          <Text style={{ color: "#d48806" }}>⏳ 有 {pending} 个账号待审批，请点击"审批"按钮激活。</Text>
        </div>
      )}

      <Card size="small">
        <Table<UserRow>
          rowKey="username"
          columns={columns}
          dataSource={users}
          loading={isFetching}
          size="small"
          pagination={false}
          rowClassName={r => r.is_pending ? "user-row-pending" : ""}
        />
      </Card>

      <EditUserModal user={editTarget} onClose={() => setEditTarget(null)} />
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ResetPasswordModal username={resetTarget} onClose={() => setResetTarget(null)} />

      <style>{`
        .user-row-pending td { background-color: #fffbe6 !important; }
        .ant-table-cell { font-size: 12px; }
      `}</style>
    </div>
  )
}
