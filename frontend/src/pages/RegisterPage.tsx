import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Button, Card, Form, Input, Select, Typography, message, Alert } from "antd"
import { LockOutlined, UserOutlined } from "@ant-design/icons"

import { apiRegister } from "@/api/auth"

const { Title, Text } = Typography

const GROUP_OPTIONS = [
  { label: "A组", value: "A组" },
  { label: "B组", value: "B组" },
]

export default function RegisterPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form] = Form.useForm()

  const handleRegister = async (values: {
    username: string
    display_name: string
    group_name?: string
    password: string
    confirm_password: string
  }) => {
    setLoading(true)
    try {
      await apiRegister(values)
      setSuccess(true)
    } catch (e: unknown) {
      message.error((e as Error).message ?? "注册失败")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
        <Card style={{ width: 440, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          <Alert
            type="success"
            showIcon
            message="注册申请已提交"
            description="您的账号已创建，请联系管理员审批激活后方可登录。"
            style={{ marginBottom: 20 }}
          />
          <Button type="primary" block onClick={() => navigate("/login")}>
            返回登录
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
      <Card style={{ width: 440, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Title level={3} style={{ margin: 0 }}>注册账号</Title>
          <Text type="secondary">注册后需管理员审批方可登录</Text>
        </div>

        <Form form={form} layout="vertical" onFinish={handleRegister} size="large">
          <Form.Item
            name="username"
            label="用户名（登录用，2-32位英文/数字）"
            rules={[
              { required: true, message: "请输入用户名" },
              { min: 2, message: "至少 2 个字符" },
              { max: 32, message: "不超过 32 个字符" },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="如：zhang_wei" autoComplete="username" />
          </Form.Item>

          <Form.Item
            name="display_name"
            label="姓名（显示名称）"
            rules={[{ required: true, message: "请输入姓名" }]}
          >
            <Input placeholder="如：张伟" />
          </Form.Item>

          <Form.Item name="group_name" label="所属小组（可不填，待管理员分配）">
            <Select options={GROUP_OPTIONS} allowClear placeholder="请选择（可选）" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码（至少 6 位）"
            rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "至少 6 位" }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label="确认密码"
            dependencies={["password"]}
            rules={[
              { required: true, message: "请确认密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) return Promise.resolve()
                  return Promise.reject(new Error("两次密码不一致"))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="再次输入密码" autoComplete="new-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              提交注册
            </Button>
          </Form.Item>

          <div style={{ textAlign: "center" }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              已有账号？<Link to="/login">立即登录</Link>
            </Text>
          </div>
        </Form>
      </Card>
    </div>
  )
}
