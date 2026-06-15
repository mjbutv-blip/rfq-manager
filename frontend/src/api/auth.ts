import api from "./client"
import type { CurrentUser } from "@/types/user"

export interface LoginResponse {
  access_token: string
  token_type: string
  user: CurrentUser & { is_active: boolean; is_pending: boolean }
}

export async function apiLogin(username: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/login", { username, password })
  return res.data
}

export async function apiRegister(data: {
  username: string
  display_name: string
  password: string
  confirm_password: string
  group_name?: string
}): Promise<{ message: string; username: string }> {
  const res = await api.post("/auth/register", data)
  return res.data
}

export async function apiGetMe(): Promise<CurrentUser> {
  const res = await api.get<CurrentUser>("/auth/me")
  return res.data
}

export async function apiChangePassword(old_password: string, new_password: string): Promise<void> {
  await api.post("/auth/change-password", { old_password, new_password })
}

export async function fetchAllUsers(): Promise<(CurrentUser & { is_active: boolean; is_pending: boolean })[]> {
  const res = await api.get("/users/all")
  return res.data
}

export async function updateUser(username: string, data: {
  role?: string
  group_name?: string
  display_name?: string
  is_active?: boolean
  is_pending?: boolean
}): Promise<CurrentUser> {
  const res = await api.patch<CurrentUser>(`/users/${username}`, data)
  return res.data
}

export async function deleteUser(username: string): Promise<void> {
  await api.delete(`/users/${username}`)
}

export async function createUser(data: {
  username: string
  display_name: string
  password: string
  role: string
  group_name?: string | null
  email?: string | null
}): Promise<CurrentUser> {
  const res = await api.post<CurrentUser>("/users", data)
  return res.data
}

export async function resetUserPassword(username: string, new_password: string): Promise<void> {
  await api.post(`/users/${username}/reset-password`, { new_password })
}
