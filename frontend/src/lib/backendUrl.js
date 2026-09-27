const configuredUrl = import.meta.env.VITE_API_URL?.trim()

export const API_BASE_URL = configuredUrl || (import.meta.env.DEV ? 'http://localhost:8000' : '')

export function backendUrl(path) {
  return `${API_BASE_URL}${path}`
}
