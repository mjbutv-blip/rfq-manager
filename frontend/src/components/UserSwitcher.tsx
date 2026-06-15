import { useNavigate } from "react-router-dom"
import { UserOutlined, LogoutOutlined, SettingOutlined } from "@ant-design/icons"
import { Dropdown, Tag, Typography } from "antd"
import type { MenuProps } from "antd"

import { useCurrentUser, useSwitchUser, useUsers, useAuth } from "@/contexts/UserContext"
import { ROLE_LABEL } from "@/types/user"

const ROLE_COLOR: Record<string, string> = {
  admin:        "red",
  group_leader: "blue",
  sales:        "green",
  viewer:       "default",
}

export default function UserSwitcher() {
  const user = useCurrentUser()
  const users = useUsers()
  const switchUser = useSwitchUser()
  const { isLoggedIn, logout } = useAuth()
  const navigate = useNavigate()

  const switchItems: MenuProps["items"] = isLoggedIn ? [] : users.map(u => ({
    key: u.username,
    label: (
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
        <Tag color={ROLE_COLOR[u.role]} style={{ margin: 0, minWidth: 40, textAlign: "center" }}>
          {ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role}
        </Tag>
        <span>{u.display_name ?? u.username}</span>
        {u.group_name && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{u.group_name}</Typography.Text>
        )}
      </span>
    ),
  }))

  const actionItems: MenuProps["items"] = [
    ...(isLoggedIn && user.role === "admin" ? [{
      key: "user-manage",
      icon: <SettingOutlined />,
      label: "用户管理",
    }] : []),
    ...(isLoggedIn ? [{
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      danger: true,
    }] : [{
      key: "login",
      icon: <UserOutlined />,
      label: "登录账号",
    }]),
  ]

  const allItems: MenuProps["items"] = [
    ...switchItems,
    ...(switchItems.length > 0 ? [{ type: "divider" as const }] : []),
    ...actionItems,
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === "logout") {
      logout()
      navigate("/login", { replace: true })
    } else if (key === "login") {
      navigate("/login")
    } else if (key === "user-manage") {
      navigate("/user-manage")
    } else {
      switchUser(key)
    }
  }

  return (
    <Dropdown
      menu={{ items: allItems, selectedKeys: [user.username], onClick: handleMenuClick }}
      placement="bottomRight"
      trigger={["click"]}
    >
      <span
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "#fff",
          padding: "0 8px",
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.3)",
          height: 32,
          userSelect: "none",
        }}
      >
        <UserOutlined />
        <span style={{ fontSize: 13 }}>{user.display_name ?? user.username}</span>
        <Tag
          color={ROLE_COLOR[user.role]}
          style={{ margin: 0, fontSize: 11, lineHeight: "18px", padding: "0 5px" }}
        >
          {ROLE_LABEL[user.role as keyof typeof ROLE_LABEL] ?? user.role}
        </Tag>
        {isLoggedIn && <span style={{ fontSize: 11, opacity: 0.7 }}>●</span>}
      </span>
    </Dropdown>
  )
}
