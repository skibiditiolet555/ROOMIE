import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, ImageIcon, MoreVertical, Pencil, Copy, Trash2, Sparkles } from 'lucide-react'
import AppHeader from '../../components/AppHeader/AppHeader'
import { useRooms } from '../../context/RoomsContext'
import homeBg from '../../assets/home-bg.jpg'
import { formatTHB } from '../../lib/currency'
import { usePrefs } from '../../lib/prefs'
import './MyRoomsPage.css'

export default function MyRoomsPage() {
  usePrefs()
  const { rooms, loading, error, addRoom, deleteRoom, duplicateRoom } = useRooms()
  const [openMenuId, setOpenMenuId] = useState(null)
  const navigate = useNavigate()

  const handleCreate = () => {
    const room = addRoom({
      name: 'Untitled Room',
      category: 'Room',
      style: 'Custom',
      budget: 1000,
    })
    navigate(`/room/${room.id}`)
  }

  const toggleMenu = (id) => {
    setOpenMenuId((current) => (current === id ? null : id))
  }

  const handleDuplicate = (id) => {
    duplicateRoom(id)
    setOpenMenuId(null)
  }

  const handleDelete = (id) => {
    deleteRoom(id)
    setOpenMenuId(null)
  }

  return (
    <div className="myrooms-page">
      <div className="myrooms-page__bg">
        <div className="myrooms-page__bg-img" style={{ backgroundImage: `url(${homeBg})` }} />
      </div>
      <div className="myrooms-page__overlay" />

      <AppHeader />

      <div className="myrooms-page__inner">
        {error && <p className="myrooms-page__error">{error}</p>}

        {loading ? (
          <p className="myrooms-page__loading">Loading your projects…</p>
        ) : rooms.length === 0 ? (
          <div className="myrooms-empty">
            <div className="myrooms-empty__icon">
              <Sparkles size={36} />
            </div>
            <h2 className="myrooms-empty__title">No rooms yet</h2>
            <p className="myrooms-empty__text">
              Create your first AI-generated room design and start building your dream space.
            </p>
            <button type="button" onClick={handleCreate} className="myrooms-header__cta">
              <Plus size={18} />
              Create Your First Room
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="myrooms-header">
              <div className="myrooms-header__left">
                <p className="myrooms-header__eyebrow">Dashboard</p>
                <h1 className="myrooms-header__title">Your Projects</h1>
                <p className="myrooms-header__subtitle">
                  All the rooms you&apos;ve created and designed with Roomie.
                </p>
              </div>
              <button type="button" onClick={handleCreate} className="myrooms-header__cta">
                <Plus size={18} />
                Create New Project
              </button>
            </div>

            {/* Grid */}
            <div className="myrooms-grid">
              {rooms.map((room) => {
                const budgetPercent = Math.min((room.spent / room.budget) * 100, 100)
                return (
                  <div
                    key={room.id}
                    className="room-card"
                    onClick={() => navigate(`/room/${room.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/room/${room.id}`)}
                  >
                    {/* Thumbnail */}
                    <div
                      className="room-card__thumbnail"
                      style={room.thumbnail ? { backgroundImage: `url(${room.thumbnail})` } : undefined}
                    >
                      <span className={`room-card__badge room-card__badge--${room.status === 'Completed' ? 'done' : 'progress'}`}>
                        {room.status}
                      </span>

                      <div className="room-card__menu-wrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="room-card__menu-btn"
                          onClick={() => toggleMenu(room.id)}
                          aria-label="Room options"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {openMenuId === room.id && (
                          <div className="room-card__menu">
                            <Link to={`/room/${room.id}`} className="room-card__menu-item">
                              <Pencil size={14} /> Edit Photo
                            </Link>
                            <button className="room-card__menu-item" onClick={() => handleDuplicate(room.id)}>
                              <Copy size={14} /> Duplicate
                            </button>
                            <button
                              className="room-card__menu-item room-card__menu-item--danger"
                              onClick={() => handleDelete(room.id)}
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        )}
                      </div>

                      {!room.thumbnail && <ImageIcon size={36} className="room-card__thumbnail-icon" />}
                    </div>

                    {/* Body */}
                    <div className="room-card__body">
                      <h3 className="room-card__name">{room.name}</h3>
                      <p className="room-card__meta">
                        {room.category} · {room.style}
                      </p>
                      <p className="room-card__budget-text">{formatTHB(room.budget)}</p>
                      <div className="room-card__budget-bar">
                        <div
                          className="room-card__budget-fill"
                          style={{ width: `${budgetPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
