import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Button, Card, Form, Input, Typography, message } from "antd"
import { LockOutlined, UserOutlined } from "@ant-design/icons"

import { apiLogin } from "@/api/auth"
import { useAuth } from "@/contexts/UserContext"

const { Title, Text } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const res = await apiLogin(values.username, values.password)
      login(res.access_token, res.user)
      message.success(`欢迎回来，${res.user.display_name ?? res.user.username}`)
      navigate("/dashboard", { replace: true })
    } catch (e: unknown) {
      message.error((e as Error).message ?? "登录失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f0f2f5",
    }}>
      <Card style={{ width: 400, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0 }}>询单管理系统</Title>
          <Text type="secondary">登录您的账号</Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleLogin}
          size="large"
        >
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>

          <div style={{ textAlign: "center" }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              还没有账号？<Link to="/register">立即注册</Link>
            </Text>
          </div>
        </Form>

        <div style={{ marginTop: 20, padding: "12px 16px", background: "#f6f8fa", borderRadius: 6, fontSize: 12, color: "#666" }}>
          <div><strong>开发模式默认账号：</strong></div>
          <div>管理员：demo_admin / admin123</div>
          <div>种子用户也可直接用 admin123 登录</div>
        </div>
      </Card>
    </div>
  )
}
