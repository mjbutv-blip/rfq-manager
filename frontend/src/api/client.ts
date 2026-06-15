import axios from "axios"

const TOKEN_KEY = "rfq_token"
const USERNAME_KEY = "rfq_username"

// ── Token storage ──────────────────────────────────────────────────────────────

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// ── Legacy X-Username support (dev fallback) ──────────────────────────────────

export function getSavedUsername(): string {
  return localStorage.getItem(USERNAME_KEY) ?? "demo_admin"
}

export function setCurrentUsername(username: string): void {
  localStorage.setItem(USERNAME_KEY, username)
}

// ── Axios client ──────────────────────────────────────────────────────────────

const client = axios.create({
  baseURL: "/api/v1",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
})

client.interceptors.request.use(config => {
  const token = getStoredToken()
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`
  } else {
    // Dev fallback: X-Username header
    config.headers["X-Username"] = getSavedUsername()
  }
  return config
})

client.interceptors.response.use(
  res => res,
  err => {
    const msg: string =
      err.response?.data?.detail ?? err.message ?? "请求失败"
    // If 401 and we have a token, clear it (token expired/invalid)
    if (err.response?.status === 401 && getStoredToken()) {
      clearStoredToken()
      window.location.href = "/login"
    }
    return Promise.reject(new Error(msg))
  }
)

export default client
