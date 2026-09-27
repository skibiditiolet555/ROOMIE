import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { registerRoomsBridge } from '../lib/projects'
import * as roomsApi from '../services/roomsApi'

const RoomsContext = createContext(null)

// Postgres uses snake_case columns; the rest of the app uses camelCase.
// This mapping keeps that translation in one place.
function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    style: row.style,
    budget: row.budget,
    spent: row.spent,
    status: row.status,
    thumbnail: row.thumbnail,
    originalThumbnail: row.original_thumbnail,
    photos: row.photos || [],
    designImage: row.design_image,
    designImages: row.design_images || [],
    designPrompt: row.design_prompt,
    designCategories: row.design_categories || [],
    items: row.items || [],
    itemsSource: row.items_source,
    roomCondition: row.room_condition,
    renovationPlan: row.renovation_plan,
    styleOverrides: row.style_overrides || {},
    workflow: row.workflow || {},
    createdAt: row.created_at,
  }
}

const FIELD_TO_COLUMN = {
  id: 'id',
  name: 'name',
  category: 'category',
  style: 'style',
  budget: 'budget',
  spent: 'spent',
  status: 'status',
  thumbnail: 'thumbnail',
  originalThumbnail: 'original_thumbnail',
  photos: 'photos',
  designImage: 'design_image',
  designImages: 'design_images',
  designPrompt: 'design_prompt',
  designCategories: 'design_categories',
  items: 'items',
  itemsSource: 'items_source',
  roomCondition: 'room_condition',
  renovationPlan: 'renovation_plan',
  styleOverrides: 'style_overrides',
  workflow: 'workflow',
  createdAt: 'created_at',
}

function toRow(fields) {
  const row = {}
  for (const [key, value] of Object.entries(fields)) {
    const column = FIELD_TO_COLUMN[key]
    if (column) row[column] = value
  }
  return row
}

export function RoomsProvider({ children }) {
  const { user, token, loading: authLoading } = useAuth()
  const [rooms, setRooms] = useState([])
  const roomsRef = useRef(rooms)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    roomsRef.current = rooms
  }, [rooms])

  useEffect(() => {
    if (authLoading) return

    if (!user || !token) {
      setRooms([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    roomsApi
      .listRooms(token)
      .then((data) => {
        if (cancelled) return
        setRooms((data || []).map(fromRow))
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, token, authLoading])

  // Optimistic: update local state immediately (so navigation using the new
  // id works synchronously, like before), then sync to the backend in the
  // background. Errors are logged rather than thrown so a flaky network
  // request doesn't crash the UI mid-flow.
  const addRoom = (room) => {
    const newRoom = {
      id: crypto.randomUUID(),
      status: 'In Progress',
      spent: 0,
      items: [],
      photos: [],
      createdAt: new Date().toISOString(),
      ...room,
    }
    setRooms((current) => [newRoom, ...current])

    roomsApi.createRoom(token, toRow(newRoom)).catch((insertError) => setError(insertError.message))

    return newRoom
  }

  const updateRoom = (id, updates, { confirmed = false } = {}) => {
    const apply = () => {
      roomsRef.current = roomsRef.current.map((room) => room.id === id ? { ...room, ...updates } : room)
      setRooms((current) => current.map((room) => room.id === id ? { ...room, ...updates } : room))
    }
    if (!confirmed) apply()

    return roomsApi.updateRoomRow(token, id, toRow(updates)).then((result) => {
      if (confirmed) apply()
      return result
    }).catch((updateError) => {
      setError(updateError.message)
      if (confirmed) throw updateError
      return null
    })
  }

  const deleteRoom = (id) => {
    setRooms((current) => current.filter((room) => room.id !== id))

    roomsApi.deleteRoomRow(token, id).catch((deleteError) => setError(deleteError.message))
  }

  const duplicateRoom = (id) => {
    const source = rooms.find((room) => room.id === id)
    if (!source) return

    const copy = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} (Copy)`,
      createdAt: new Date().toISOString(),
    }
    setRooms((current) => [copy, ...current])

    roomsApi.createRoom(token, toRow(copy)).catch((insertError) => setError(insertError.message))
  }

  // The Decision / Products / Summary pages call plain async helpers
  // (lib/projects) rather than hooks; this hands those helpers the live rooms
  // state and updater. Re-registered every render so it never goes stale.
  useEffect(() => {
    registerRoomsBridge({
      getRooms: () => roomsRef.current,
      isLoaded: () => !loading && !authLoading,
      updateRoom: (id, updates) => updateRoom(id, updates, { confirmed: true }),
    })
  })

  return (
    <RoomsContext.Provider value={{ rooms, loading, error, addRoom, updateRoom, deleteRoom, duplicateRoom }}>
      {children}
    </RoomsContext.Provider>
  )
}

export function useRooms() {
  const ctx = useContext(RoomsContext)
  if (!ctx) throw new Error('useRooms must be used within a RoomsProvider')
  return ctx
}
