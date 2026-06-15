import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { SEED_USERS } from "@/types/user"
import { getStoredToken, setStoredToken, clearStoredToken, setCurrentUsername } from "@/api/client"
import { fetchUsers } from "@/api/users"
import { apiGetMe } from "@/api/auth"
import type { CurrentUser } from "@/types/user"

interface UserContextValue {
  user: CurrentUser
  users: CurrentUser[]
  isLoggedIn: boolean
  login: (token: string, user: CurrentUser) => void
  logout: () => void
  // legacy dev support
  switchUser: (username: string) => void
}

const UserContext = createContext<UserContextValue | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(getStoredToken)

  // If JWT token present, fetch /auth/me; otherwise fall back to X-Username flow
  const { data: jwtUser } = useQuery({
    queryKey: ["me", token],
    queryFn: apiGetMe,
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60_000,
  })

  // Active user list (for UserSwitcher in dev mode / admin impersonation)
  const { data: users = SEED_USERS } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    staleTime: 5 * 60_000,
    initialData: SEED_USERS,
  })

  // Dev-mode username (when no JWT)
  const [devUsername, setDevUsername] = useState<string>(() => {
    return localStorage.getItem("rfq_username") ?? "demo_admin"
  })

  const devUser: CurrentUser = useMemo(() => {
    return (
      users.find(u => u.username === devUsername) ??
      SEED_USERS.find(u => u.username === devUsername) ??
      users[0] ??
      SEED_USERS[0]
    )
  }, [users, devUsername])

  const user: CurrentUser = token && jwtUser ? jwtUser : devUser
  const isLoggedIn = !!token && !!jwtUser

  const login = useCallback((newToken: string, newUser: CurrentUser) => {
    setStoredToken(newToken)
    setToken(newToken)
    setCurrentUsername(newUser.username)
    queryClient.invalidateQueries({ queryKey: ["me"] })
    queryClient.removeQueries({ predicate: q => q.queryKey[0] !== "users" && q.queryKey[0] !== "me" })
  }, [queryClient])

  const logout = useCallback(() => {
    clearStoredToken()
    setToken(null)
    queryClient.clear()
  }, [queryClient])

  const switchUser = useCallback((newUsername: string) => {
    localStorage.setItem("rfq_username", newUsername)
    setCurrentUsername(newUsername)
    setDevUsername(newUsername)
    queryClient.removeQueries({ predicate: q => q.queryKey[0] !== "users" })
  }, [queryClient])

  const value = useMemo(
    () => ({ user, users, isLoggedIn, login, logout, switchUser }),
    [user, users, isLoggedIn, login, logout, switchUser]
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useCurrentUser(): CurrentUser {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useCurrentUser must be used inside UserProvider")
  return ctx.user
}

export function useUsers(): CurrentUser[] {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useUsers must be used inside UserProvider")
  return ctx.users
}

export function useSwitchUser(): (username: string) => void {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useSwitchUser must be used inside UserProvider")
  return ctx.switchUser
}

export function useAuth() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useAuth must be used inside UserProvider")
  return { isLoggedIn: ctx.isLoggedIn, login: ctx.login, logout: ctx.logout, user: ctx.user }
}
