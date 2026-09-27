import { useEffect, useMemo, useRef, useState } from 'react'
import ObjectSelectionCanvas from '../../components/ObjectSelectionCanvas/ObjectSelectionCanvas'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Trash2,
  Check,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ExternalLink,
  Undo2,
} from 'lucide-react'
import AppHeader from '../../components/AppHeader/AppHeader'
import RoomWorkflow from '../../components/RoomWorkflow/RoomWorkflow'
import { useRooms } from '../../context/RoomsContext'
import { detectItems, regenerateItem, deleteItem } from '../../services/roomieApi'
import { categories, iconForCategory } from '../../utils/furnitureCatalog'
import { formatTHB } from '../../lib/currency'
import { usePrefs } from '../../lib/prefs'
import './RoomFurniturePage.css'

const DEFAULT_HIGHLIGHT = '#ffff00'
const OBJECT_COLORS = ['#ffff00', '#ffa6d2', '#4dd8a0', '#5b8def', '#c77dff', '#ff6b6b']

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// Sends the user to that retailer's own search for this item — we never
// invent a product URL (see backend prompts.PRICE_HONESTY), so this is how
// "View Product" leads somewhere real.
function retailerSearchUrl(source, query) {
  const q = encodeURIComponent(query)
  switch (source) {
    case 'IKEA':
      return `https://www.ikea.com/th/en/search/?q=${q}`
    case 'HomePro':
      return `https://www.homepro.co.th/search?text=${q}`
    case 'Shopee':
      return `https://shopee.co.th/search?keyword=${q}`
    case 'TikTok Shop':
      return `https://shop.tiktok.com/search?q=${q}`
    case 'Lazada':
      return `https://www.lazada.co.th/catalog/?q=${q}`
    default:
      return `https://www.google.com/search?q=${q}`
  }
}

// When vision actually looked at the room photo, each item comes back with a
// bbox — where AI spotted (or placed) it in the room, in percent (see
// backend prompts.BBOX_FORMAT): x/y is the box's top-left corner, w/h its
// size. Selecting an item fills its real (AI-estimated) outline with color —
// nothing shows until then. Demo items (no photo was looked at) have no
// bbox, so they fall back to a spread-out grid the user can drag into place.
function withLayout(item, index) {
  const col = index % 3
  const row = Math.floor(index / 3)
  const bbox = item.bbox
  const w = item.w ?? bbox?.w ?? 22
  const h = item.h ?? bbox?.h ?? 18
  return {
    ...item,
    w,
    h,
    x: item.x ?? bbox?.x ?? clamp(8 + col * 32, 0, 100 - w),
    y: item.y ?? bbox?.y ?? clamp(30 + row * 26, 0, 100 - h),
    detected: item.x == null && bbox != null,
    color: item.color ?? DEFAULT_HIGHLIGHT,
  }
}

function normalizeItem(item, index) {
  return withLayout(
    {
      ...item,
      price: item.price ?? item.price_estimate ?? 0,
      categoryId: item.categoryId ?? item.category,
    },
    index
  )
}

export default function RoomFurniturePage() {
  usePrefs()
  const { id } = useParams()
  const navigate = useNavigate()
  const { rooms, updateRoom, loading: roomsLoading } = useRooms()
  const room = rooms.find((r) => r.id === id)

  const [items, setItems] = useState(() => (room?.items || []).map(normalizeItem))
  // Furniture you removed, kept around (with the room photo exactly as it
  // looked right before that removal) so it can be brought back later —
  // deleting never throws the item away for good.
  const [deletedItems, setDeletedItems] = useState(() => room?.workflow?.deletedItems || [])
  const [kept, setKept] = useState({})
  const [regeneratingId, setRegeneratingId] = useState(null)
  const [loadingItems, setLoadingItems] = useState(!room?.items?.length)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [highlightedIds, setHighlightedIds] = useState([])
  const [detection, setDetection] = useState(() => ({
    source: room?.itemsSource || 'demo',
    roomCondition: room?.roomCondition || 'unknown',
    renovationPlan: room?.renovationPlan || '',
  }))
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const selectItem = (itemId) => {
    setSelectedId(itemId)
    setHighlightedIds((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId) : [...current, itemId])
  }

  // The state above is seeded from `room` at first render, but on a direct
  // link or a refresh `room` isn't loaded from the backend yet (rooms load
  // asynchronously) — so that seed runs against `undefined` and never gets a
  // second chance, leaving items/surfaces empty and the loading spinner stuck
  // forever even once the real room arrives. Re-sync once, the first time a
  // real room shows up.
  const syncedRoomRef = useRef(false)
  useEffect(() => {
    if (syncedRoomRef.current || !room) return
    syncedRoomRef.current = true
    if (room.items?.length) {
      setItems(room.items.map(normalizeItem))
      setLoadingItems(false)
      // First time this room has a furniture list: freeze it as "original" so
      // it survives every later edit, regenerate or delete.
      if (!room.workflow?.originalItems?.length) {
        updateRoom(room.id, {
          workflow: { ...room.workflow, originalItems: room.items, originalDesignImage: room.designImage || room.thumbnail },
        })
      }
    }
    setDeletedItems(room.workflow?.deletedItems || [])
    setDetection({
      source: room.itemsSource || 'demo',
      roomCondition: room.roomCondition || 'unknown',
      renovationPlan: room.renovationPlan || '',
    })
  }, [room, updateRoom])

  useEffect(() => {
    if (!room || room.items?.length) return
    const photos = room.photos?.length ? room.photos : (room.thumbnail ? [room.thumbnail] : [])
    setLoadingItems(true)
    detectItems({
      images: photos,
      budget: room.budget,
      style: room.style,
      prompt: room.designPrompt,
      roomCategory: room.category,
    })
      .then((result) => {
        const detectedItems = result.items.map(normalizeItem)
        setItems(detectedItems)
        setDetection({
          source: result.source,
          roomCondition: result.room_condition,
          renovationPlan: result.renovation_plan,
        })
        updateRoom(room.id, {
          items: detectedItems,
          itemsSource: result.source,
          roomCondition: result.room_condition,
          renovationPlan: result.renovation_plan,
          // The very first furniture list AI found — cached once, untouched
          // by anything the user does afterwards.
          workflow: { ...room.workflow, originalItems: detectedItems, originalDesignImage: room.designImage || room.thumbnail },
        })
      })
      .catch((requestError) => setError(requestError.message || 'Items could not be detected.'))
      .finally(() => setLoadingItems(false))
  }, [room, updateRoom])

  const total = useMemo(() => items.reduce((sum, item) => sum + item.price, 0), [items])

  const roomImage = room?.designImage || room?.thumbnail || room?.photos?.[0]

  if (!room) {
    return (
      <div className="room-furniture-page">
        <AppHeader />
        <div className="room-furniture-page__inner">
          <p className="room-furniture-page__missing">{roomsLoading ? 'Loading your room…' : 'Room not found.'}</p>
          <Link to="/home" className="room-furniture-page__back-link">
            <ArrowLeft size={16} /> Back to your projects
          </Link>
        </div>
      </div>
    )
  }

  const budget = room.budget || 0
  const diff = budget - total
  const isOver = diff < 0

  const handleKeep = (itemId) => {
    setKept((prev) => ({ ...prev, [itemId]: true }))
  }

  const saveItems = (next) => {
    itemsRef.current = next
    setItems(next)
    updateRoom(room.id, { items: next })
  }
  const saveDeleted = (next) => {
    setDeletedItems(next)
    updateRoom(room.id, { workflow: { ...room.workflow, deletedItems: next } })
  }
  const setItemColor = (itemId, color) => {
    saveItems(itemsRef.current.map((item) => item.id === itemId ? { ...item, color } : item))
  }
  const setItemCategory = (itemId, categoryId) => {
    saveItems(itemsRef.current.map((item) => item.id === itemId ? { ...item, categoryId, category: categoryId } : item))
  }

  const handleRegenerate = async (item) => {
    setRegeneratingId(item.id)
    setKept((prev) => ({ ...prev, [item.id]: false }))
    try {
      const result = await regenerateItem({
        image: room.designImage || room.thumbnail,
        item: { ...item, price_estimate: item.price, category: item.categoryId },
        style: room.style,
        budgetRemaining: Math.max(0, budget - total),
        exclude: items.map((currentItem) => currentItem.name),
      })
      // Keep this item's spot on the canvas — only what it *is* changed.
      const replacement = { ...normalizeItem(result.item, 0), x: item.x, y: item.y, w: item.w, h: item.h, color: item.color }
      saveItems(itemsRef.current.map((currentItem) => currentItem.id === item.id ? replacement : currentItem))
      setSelectedId(replacement.id)
      setHighlightedIds((current) => current.filter((id) => id !== item.id))
      if (result.image) {
        updateRoom(room.id, { thumbnail: result.image, designImage: result.image })
        setHighlightedIds([])
      }
    } catch (requestError) {
      setError(requestError.message || 'The item could not be regenerated.')
    } finally {
      setRegeneratingId(null)
    }
  }

  const handleDelete = async (item) => {
    // Remember exactly how the photo looked with this piece still in it, so
    // "Bring back" can restore that look rather than just re-adding a name to
    // the list with nothing behind it.
    const imageBeforeDelete = room.designImage || room.thumbnail
    try {
      const result = await deleteItem({
        image: imageBeforeDelete,
        item: { ...item, price_estimate: item.price, category: item.categoryId },
        style: room.style,
      })
      saveItems(itemsRef.current.filter((currentItem) => currentItem.id !== item.id))
      saveDeleted([...deletedItems, { item, image: imageBeforeDelete }])
      if (selectedId === item.id) setSelectedId(null)
      setHighlightedIds((current) => current.filter((id) => id !== item.id))
      if (result.image) {
        updateRoom(room.id, { thumbnail: result.image, designImage: result.image })
        setHighlightedIds([])
      }
    } catch (requestError) {
      setError(requestError.message || 'The item could not be removed.')
    }
  }

  // Bring a deleted item back: re-add it to the list and put the room photo
  // back to how it looked right before it was removed. Note this reverts the
  // photo to that exact snapshot, so any other edits made after this
  // deletion are undone along with it — restore in reverse (most recent
  // deletion first) for a clean result.
  const handleRestore = (entry) => {
    saveItems([...itemsRef.current, entry.item])
    saveDeleted(deletedItems.filter((deleted) => deleted.item.id !== entry.item.id))
    updateRoom(room.id, { thumbnail: entry.image, designImage: entry.image })
  }

  // The very first furniture list and photo, cached the moment AI produced
  // them — a full safety net back to before any edit, regenerate or delete.
  const original = room.workflow?.originalItems?.length ? room.workflow : null
  const handleRestoreOriginal = () => {
    if (!original) return
    saveItems(original.originalItems.map(normalizeItem))
    saveDeleted([])
    setSelectedId(null)
    setHighlightedIds([])
    updateRoom(room.id, {
      thumbnail: original.originalDesignImage,
      designImage: original.originalDesignImage,
      workflow: { ...room.workflow, deletedItems: [] },
    })
  }

  const handleNext = () => {
    // Not "Completed" yet — the room isn't finished until Products is saved.
    updateRoom(room.id, { items, spent: total })
    navigate(`/room/${room.id}/decision`)
  }

  return (
    <div className="room-furniture-page">
      <AppHeader />

      <div className="room-furniture-page__inner">
        <RoomWorkflow roomId={room.id} currentStep={4} />
        <Link to={`/room/${room.id}/compare`} className="room-furniture-page__back-link">
          <ArrowLeft size={16} /> Back
        </Link>

        <p className="room-furniture-page__eyebrow">Furnish &amp; Decorate</p>
        <h1 className="room-furniture-page__title">
          {detection.source === 'ai_vision' && detection.roomCondition === 'furnished'
            ? 'Renovate your room'
            : 'Pick your items'}
        </h1>
        <p className="room-furniture-page__subtitle">
          Select an object in the photo to outline it and edit its details in the panel.
        </p>

        {detection.source === 'demo' && (
          <p className="room-furniture-page__demo-note">
            Demo suggestions — generated from your room&apos;s style and brief, not the actual photo.
          </p>
        )}

        {detection.source === 'ai_vision' && detection.roomCondition === 'empty' && (
          <p className="room-furniture-page__demo-note room-furniture-page__demo-note--vision">
            AI looked at your photos — this room looks empty, so here&apos;s a full furnishing plan.
          </p>
        )}

        {detection.source === 'ai_vision' && detection.roomCondition === 'furnished' && detection.renovationPlan && (
          <div className="room-furniture-plan">
            <p className="room-furniture-plan__label">AI&apos;s Renovation Plan</p>
            <p className="room-furniture-plan__text">{detection.renovationPlan}</p>
          </div>
        )}

        {error && <p className="room-furniture-list__empty">{error}</p>}

        <div className="room-canvas-wrap">
          <ObjectSelectionCanvas key={roomImage} image={roomImage} items={items}
            highlightedIds={highlightedIds} selectedId={selectedId} onSelect={selectItem}
            onClear={() => { setSelectedId(null); setHighlightedIds([]) }} regeneratingId={regeneratingId} />

          {/* ── Detail panel: what the selected item actually is ── */}
          <div className="room-detail-panel">
            {loadingItems && <p className="room-detail-panel__empty">Loading furniture suggestions…</p>}
            {(() => {
              const selected = items.find((it) => it.id === selectedId)
              if (!selected) {
                return (
                  <p className="room-detail-panel__empty">
                    Click an object in the photo to see its price, change its outline color, and manage the item.
                  </p>
                )
              }
              const Icon = iconForCategory(selected.categoryId)
              const fitsBudget = total <= budget
              return (
                <div className="room-detail-panel__card">
                  <div className="room-detail-panel__top">
                    <span className="room-detail-panel__icon" style={{ backgroundColor: selected.color || DEFAULT_HIGHLIGHT }}>
                      <Icon size={22} />
                    </span>
                    <span className="room-detail-panel__badge">
                      <Check size={11} /> AI suggested
                    </span>
                  </div>
                  <h3 className="room-detail-panel__name">{selected.name}</h3>
                  <p className="room-detail-panel__price">{formatTHB(selected.price)}</p>
                  {selected.description && <p className="room-detail-panel__desc">{selected.description}</p>}
                  <ul className="room-detail-panel__checks">
                    <li>
                      <Check size={13} /> Fits your {room.style} style
                    </li>
                    <li className={fitsBudget ? '' : 'room-detail-panel__checks--warn'}>
                      {fitsBudget ? <Check size={13} /> : <AlertTriangle size={13} />}
                      {fitsBudget ? 'Project is within budget' : 'Project is over budget'}
                    </li>
                    <li>
                      <Check size={13} /> From {selected.source}
                    </li>
                  </ul>
                  <a
                    className="room-detail-panel__view"
                    href={retailerSearchUrl(selected.source, selected.search_query || selected.name)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on {selected.source} <ExternalLink size={14} />
                  </a>
                  <select
                    className="furniture-item__type"
                    value={selected.categoryId}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setItemCategory(selected.id, e.target.value)}
                    aria-label={`Change type for ${selected.name}`}
                    title="Change item type"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <p className="room-detail-panel__label">Outline color</p>
                  <div className="furniture-item__colors" onClick={(e) => e.stopPropagation()}>
                    {OBJECT_COLORS.slice(0, 6).map((color) => (
                      <button
                        type="button"
                        key={color}
                        className={`furniture-item__color ${selected.color === color ? 'furniture-item__color--active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setItemColor(selected.id, color)}
                        aria-label={`Recolor ${selected.name} ${color}`}
                      />
                    ))}
                    <input
                      type="color"
                      className="furniture-item__color-picker"
                      value={selected.color || '#c8a94b'}
                      onChange={(e) => setItemColor(selected.id, e.target.value)}
                      aria-label={`Custom color for ${selected.name}`}
                    />
                    {selected.color && (
                      <button
                        type="button"
                        className="furniture-item__color-clear"
                        onClick={() => setItemColor(selected.id, null)}
                        aria-label={`Clear color for ${selected.name}`}
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                <div className="furniture-item__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="furniture-item__btn"
                    onClick={() => handleKeep(selected.id)}
                    disabled={regeneratingId === selected.id}
                  >
                    <Check size={14} /> {kept[selected.id] ? 'Kept' : 'Keep'}
                  </button>
                  <button
                    type="button"
                    className="furniture-item__btn"
                    onClick={() => handleRegenerate(selected)}
                    disabled={regeneratingId === selected.id}
                  >
                    <RefreshCw size={14} className={regeneratingId === selected.id ? 'furniture-item__spin' : ''} />
                    Regenerate
                  </button>
                  <button
                    type="button"
                    className="furniture-item__btn furniture-item__btn--danger"
                    onClick={() => handleDelete(selected)}
                    disabled={regeneratingId === selected.id}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Recently removed: deleting never throws a piece away for good. */}
        {deletedItems.length > 0 && (
          <div className="room-furniture-trash">
            <p className="room-furniture-trash__label">Recently removed</p>
            <ul className="room-furniture-trash__list">
              {deletedItems.map((entry) => (
                <li key={entry.item.id} className="room-furniture-trash__item">
                  <span className="room-furniture-trash__name">{entry.item.name}</span>
                  <span className="room-furniture-trash__price">{formatTHB(entry.item.price)}</span>
                  <button type="button" className="room-furniture-trash__restore" onClick={() => handleRestore(entry)}>
                    <Undo2 size={13} /> Bring back
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Budget status */}
        <div className={`room-furniture-budget ${isOver ? 'room-furniture-budget--over' : 'room-furniture-budget--under'}`}>
          <div className="room-furniture-budget__icon">
            {isOver ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div className="room-furniture-budget__info">
            <p className="room-furniture-budget__status">
              {isOver
                ? `Over budget by ${formatTHB(Math.abs(diff))}`
                : `${formatTHB(diff)} left in your budget`}
            </p>
            <p className="room-furniture-budget__amounts">
              {formatTHB(total)} of {formatTHB(budget)} used
            </p>
            <div className="room-furniture-budget__bar">
              <div
                className={`room-furniture-budget__fill ${isOver ? 'room-furniture-budget__fill--over' : ''}`}
                style={{ width: `${Math.min((total / (budget || 1)) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="room-furniture-page__actions">
          {original && (
            <button type="button" className="room-furniture-page__restore-original" onClick={handleRestoreOriginal}>
              <RotateCcw size={15} /> Restore original furniture
            </button>
          )}
          <button type="button" className="room-furniture-page__next" onClick={handleNext}>
            Next
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
