const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const configuredUrl = import.meta.env.VITE_API_URL?.trim()

export const API_BASE_URL = configuredUrl
  || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/roomie-api` : '')
  || (import.meta.env.DEV ? 'http://localhost:8000' : '')
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

export function backendHeaders(token, json = true) {
  const headers = {}
  if (json) headers['Content-Type'] = 'application/json'
  if (SUPABASE_PUBLISHABLE_KEY) headers.apikey = SUPABASE_PUBLISHABLE_KEY
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export function backendUrl(path) {
  if (!API_BASE_URL) throw new Error('Set VITE_SUPABASE_URL in the frontend environment.')
  return `${API_BASE_URL}${path}`
}
