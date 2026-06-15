export type UserRole = "admin" | "group_leader" | "sales" | "viewer"

export interface CurrentUser {
  username: string
  display_name: string | null
  role: UserRole
  group_name: string | null
  is_active?: boolean
  is_pending?: boolean
}

// 与后端 seed_users.py 保持同步
export const SEED_USERS: CurrentUser[] = [
  { username: "demo_admin", display_name: "公司管理员",  role: "admin",        group_name: null  },
  { username: "a_leader",   display_name: "A组组长",     role: "group_leader", group_name: "A组" },
  { username: "b_leader",   display_name: "B组组长",     role: "group_leader", group_name: "B组" },
  { username: "sales_a1",   display_name: "王芳",        role: "sales",        group_name: "A组" },
  { username: "sales_a2",   display_name: "张伟",        role: "sales",        group_name: "A组" },
  { username: "sales_b1",   display_name: "李梅",        role: "sales",        group_name: "B组" },
  { username: "sales_b2",   display_name: "赵磊",        role: "sales",        group_name: "B组" },
  { username: "viewer_a",   display_name: "A组只读",     role: "viewer",       group_name: "A组" },
]

export const ROLE_LABEL: Record<UserRole, string> = {
  admin:        "管理员",
  group_leader: "组长",
  sales:        "业务员",
  viewer:       "只读",
}

const LS_KEY = "rfq_username"

export function getSavedUsername(): string {
  return localStorage.getItem(LS_KEY) ?? "demo_admin"
}

export function saveUsername(username: string): void {
  localStorage.setItem(LS_KEY, username)
}

export function findUser(username: string): CurrentUser {
  return SEED_USERS.find(u => u.username === username) ?? SEED_USERS[0]
}
