import { createContext, useContext, useEffect, useState } from 'react'
import * as authApi from '../services/authApi'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setTokenState] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const existing = authApi.getToken()

    if (!existing) {
      setLoading(false)
      return
    }

    authApi
      .me(existing)
      .then((profile) => {
        if (cancelled) return
        setUser(profile)
        setTokenState(existing)
      })
      .catch(() => {
        if (cancelled) return
        authApi.setToken(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const applySession = ({ token: newToken, user: newUser }) => {
    authApi.setToken(newToken)
    setTokenState(newToken)
    setUser(newUser)
    return newUser
  }

  const login = async (email, password) => applySession(await authApi.login(email, password))

  const register = async (email, password, name) =>
    applySession(await authApi.register(email, password, name))

  // Recovery step 1: does this email match an account? No email is sent —
  // the caller (ForgotPasswordPage) shows the "set a new password" form
  // directly once this comes back true.
  const verifyEmail = (email) => authApi.verifyEmail(email)

  // Recovery step 2: set a new password for a verified email. The backend
  // hands back a session too, but we deliberately don't apply it here —
  // the user should land on the login page and sign in with the new
  // password themselves, not get silently logged in.
  const setNewPassword = async (email, newPassword) => {
    await authApi.setPasswordByEmail(email, newPassword)
  }

  const logout = async () => {
    const current = token
    authApi.setToken(null)
    setTokenState(null)
    setUser(null)
    if (current) {
      try {
        await authApi.logout(current)
      } catch {
        // best effort — the local session is already cleared either way
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, verifyEmail, setNewPassword, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
