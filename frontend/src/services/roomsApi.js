import { backendUrl } from '../lib/backendUrl'

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

export function listRooms(token) {
  return request('/api/rooms', { token })
}

export function createRoom(token, row) {
  return request('/api/rooms', { method: 'POST', body: row, token })
}

export function updateRoomRow(token, id, updates) {
  return request(`/api/rooms/${id}`, { method: 'PATCH', body: updates, token })
}

export function deleteRoomRow(token, id) {
  return request(`/api/rooms/${id}`, { method: 'DELETE', token })
}
