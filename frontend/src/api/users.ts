import api from "./client"
import type { CurrentUser } from "@/types/user"

export async function fetchUsers(): Promise<CurrentUser[]> {
  const res = await api.get<CurrentUser[]>("/users")
  return res.data
}
