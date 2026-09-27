import { backendUrl } from '../lib/backendUrl'
const TOKEN_KEY = 'roomie_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // localStorage unavailable (private mode, etc.) — session just won't persist across reloads
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(backendUrl(path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.detail || `Request failed (${res.status})`)
  }

  if (res.status === 204) return null
  return res.json()
}

export function register(email, password, name) {
  return request('/api/auth/register', { method: 'POST', body: { email, password, name } })
}

export function login(email, password) {
  return request('/api/auth/login', { method: 'POST', body: { email, password } })
}

export function logout(token) {
  return request('/api/auth/logout', { method: 'POST', token })
}

export function me(token) {
  return request('/api/auth/me', { token })
}

/** Recovery step 1: does this email have an account? No email is sent. */
export function verifyEmail(email) {
  return request('/api/auth/verify-email', { method: 'POST', body: { email } })
}

/** Recovery step 2: set a new password directly for a verified email. */
export function setPasswordByEmail(email, newPassword) {
  return request('/api/auth/set-password', {
    method: 'POST',
    body: { email, new_password: newPassword },
  })
}
