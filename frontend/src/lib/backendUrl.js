const configuredUrl = import.meta.env.VITE_API_URL?.trim()
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  || 'https://dtwvvcfqokatlaikhlnm.supabase.co'

// Production always uses the Supabase Edge Function. This prevents a stale
// Netlify VITE_API_URL setting from routing requests back to the old backend.
export const API_BASE_URL = import.meta.env.DEV
  ? configuredUrl || 'http://localhost:8000'
  : `${supabaseUrl.replace(/\/$/, '')}/functions/v1/roomie-api`
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_c2zRgC_Kz7nnVoPIT8ZPGg_QZJdJp0y'

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
