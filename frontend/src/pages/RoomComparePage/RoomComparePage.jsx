import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, MessageSquare, RefreshCw, Sparkles, X, Check, AlertTriangle } from 'lucide-react'
import AppHeader from '../../components/AppHeader/AppHeader'
import RoomWorkflow from '../../components/RoomWorkflow/RoomWorkflow'
import { useRooms } from '../../context/RoomsContext'
import { generateDesign } from '../../services/roomieApi'
import './RoomComparePage.css'

function photosOf(room) {
  if (!room) return []
  if (room.photos?.length) return room.photos
  const single = room.originalThumbnail || room.thumbnail
  return single ? [single] : []
}

// One entry per uploaded photo. `designImages` lines up with `photos`; a null
// entry means that photo has no design yet (its generation failed).
function buildViews(room) {
  const photos = photosOf(room)
  const designs = room.designImages?.length ? room.designImages : room.designImage ? [room.designImage] : []
  return photos.map((_, index) => ({
    variants: designs[index]
      ? [{ id: `v${index}-1`, label: 'Variation 1', image: designs[index] }]
      : [],
    current: 0,
  }))
}

export default function RoomComparePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { rooms, updateRoom } = useRooms()
  const room = rooms.find((r) => r.id === id)

  const [views, setViews] = useState(() => (room ? buildViews(room) : null))
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState({})
  const [ratios, setRatios] = useState({})
  const [error, setError] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  // What the user typed about the CURRENT result, per photo — kept separate
  // per index so switching photo tabs doesn't lose or mix up feedback.
  const [notes, setNotes] = useState({})
  const note = notes[selected] ?? ''
  const setNote = (value) => setNotes((current) => ({ ...current, [selected]: value }))

  // Rooms load asynchronously, so on a refresh or direct link `room` is not
  // there yet when the state above is first created.
  useEffect(() => {
    if (room && views === null) setViews(buildViews(room))
  }, [room, views])

  if (!room) {
    return (
      <div className="room-compare-page">
        <AppHeader />
        <div className="room-compare-page__inner">
          <p className="room-compare-page__missing">Room not found.</p>
          <Link to="/home" className="room-compare-page__back-link">
            <ArrowLeft size={16} /> Back to your projects
          </Link>
        </div>
      </div>
    )
  }

  const photos = photosOf(room)
  const activeViews = views || []
  const view = activeViews[selected]
  const beforeSrc = photos[selected]
  const currentVariant = view?.variants[view.current]
  const isBusy = !!busy[selected]
  const anyBusy = Object.values(busy).some(Boolean)
  const hasAnyDesign = activeViews.some((v) => v.variants.length > 0)
  const paneRatio = ratios[selected] || 4 / 3

  const handleRegenerate = async () => {
    const index = selected
    const feedback = (notes[index] ?? '').trim()
    setBusy((current) => ({ ...current, [index]: true }))
    setError('')
    try {
      // Always start from this photo's original. Editing the previous result
      // compounds the model's drift, so each variation got further from the
      // real room. If the user said what was wrong with the last result,
      // fold it into the brief so the new pass actually addresses it.
      const prompt = feedback
        ? `${room.designPrompt || ''}\n\nThe previous result wasn't right: ${feedback}`.trim()
        : room.designPrompt || ''
      const result = await generateDesign({
        image: photos[index],
        style: room.style,
        prompt,
        budget: room.budget,
        categories: room.designCategories,
      })
      setViews((current) =>
        current.map((v, i) =>
          i === index
            ? {
                variants: [
                  ...v.variants,
                  {
                    id: `v${index}-${v.variants.length + 1}`,
                    label: `Variation ${v.variants.length + 1}`,
                    image: result.image,
                    note: feedback || null,
                  },
                ],
                current: v.variants.length,
              }
            : v
        )
      )
      setNotes((current) => ({ ...current, [index]: '' }))
    } catch (requestError) {
      setError(requestError.message || 'The design could not be generated.')
    } finally {
      setBusy((current) => ({ ...current, [index]: false }))
    }
  }

  const handleNext = () => {
    setFinishing(true)
    const designs = activeViews.map((v) => v.variants[v.current]?.image ?? null)
    const firstDesign = designs.find(Boolean)
    updateRoom(room.id, { designImages: designs, designImage: firstDesign, thumbnail: firstDesign })
    navigate(`/room/${room.id}/furniture`)
  }

  const selectVariant = (index) => {
    setViews((current) => current.map((v, i) => (i === selected ? { ...v, current: index } : v)))
  }

  return (
    <div className="room-compare-page">
      <AppHeader />

      <div className="room-compare-page__inner">
        <RoomWorkflow roomId={room.id} currentStep={3} />
        <Link to={`/room/${room.id}/design`} className="room-compare-page__back-link">
          <ArrowLeft size={16} /> Back
        </Link>

        <p className="room-compare-page__eyebrow">{room.style} · AI Generated</p>
        <h1 className="room-compare-page__title">{room.name}</h1>
        {room.designPrompt && (
          <p className="room-compare-page__prompt">&quot;{room.designPrompt}&quot;</p>
        )}

        {/* One tab per uploaded photo */}
        {photos.length > 1 && (
          <div className="room-compare-views" role="tablist" aria-label="Room photos">
            {photos.map((photo, index) => {
              const done = activeViews[index]?.variants.length > 0
              return (
                <button
                  key={index}
                  type="button"
                  role="tab"
                  aria-selected={index === selected}
                  className={`room-compare-views__item ${index === selected ? 'room-compare-views__item--active' : ''}`}
                  onClick={() => setSelected(index)}
                >
                  <img src={photo} alt="" className="room-compare-views__img" />
                  <span className="room-compare-views__label">
                    Photo {index + 1}
                    {done ? (
                      <Check size={12} className="room-compare-views__ok" />
                    ) : (
                      <AlertTriangle size={12} className="room-compare-views__warn" />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {error && <p className="room-compare-page__error">{error}</p>}

        {/* Big Before / After frame */}
        <div className="room-compare-frame">
          <button
            type="button"
            className="room-compare-frame__pane room-compare-frame__pane--btn"
            style={{ aspectRatio: paneRatio }}
            onClick={() => setLightboxPhoto(beforeSrc)}
            aria-label="View original photo full size"
          >
            <span className="room-compare-frame__tag">Before</span>
            <img
              key={`before-${selected}`}
              src={beforeSrc}
              alt="Original room"
              className="room-compare-frame__img"
              onLoad={(e) => {
                const { naturalWidth, naturalHeight } = e.currentTarget
                if (!naturalWidth || !naturalHeight) return
                const ratio = naturalWidth / naturalHeight
                setRatios((current) => (current[selected] === ratio ? current : { ...current, [selected]: ratio }))
              }}
            />
          </button>

          <button
            type="button"
            className="room-compare-frame__pane room-compare-frame__pane--btn"
            style={{ aspectRatio: paneRatio }}
            onClick={() => currentVariant?.image && setLightboxPhoto(currentVariant.image)}
            disabled={!currentVariant}
            aria-label="View AI redesigned photo full size"
          >
            <span className="room-compare-frame__tag room-compare-frame__tag--after">After</span>
            {currentVariant ? (
              <img
                key={`after-${selected}-${view.current}`}
                src={currentVariant.image}
                alt="AI redesigned room"
                className="room-compare-frame__img"
              />
            ) : (
              <div className="room-compare-frame__empty">
                <AlertTriangle size={24} />
                <span>This photo has no design yet.</span>
                <span>Press &quot;Generate this photo&quot; below to try again.</span>
              </div>
            )}
            {isBusy && (
              <div className="room-compare-frame__loading">
                <Sparkles size={26} className="room-compare-frame__loading-icon" />
                <span>Generating…</span>
              </div>
            )}
          </button>
        </div>

        {lightboxPhoto && (
          <div
            className="room-compare-lightbox"
            onClick={() => setLightboxPhoto(null)}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="room-compare-lightbox__close"
              onClick={() => setLightboxPhoto(null)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <img
              src={lightboxPhoto}
              alt="Room photo, full size"
              className="room-compare-lightbox__img"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Variations of the selected photo */}
        {view && view.variants.length > 0 && (
          <div className="room-compare-gallery">
            {view.variants.map((variant, i) => (
              <button
                type="button"
                key={variant.id}
                className={`room-compare-gallery__item ${i === view.current ? 'room-compare-gallery__item--active' : ''}`}
                onClick={() => selectVariant(i)}
                title={variant.note ? `Regenerated because: ${variant.note}` : undefined}
              >
                <img src={variant.image} alt={variant.label} className="room-compare-gallery__img" />
                <span className="room-compare-gallery__label">{variant.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Not happy with this result? Say what's wrong and regenerate with it in mind. */}
        {currentVariant && (
          <div className="room-compare-feedback">
            <label htmlFor="room-compare-note" className="room-compare-feedback__label">
              <MessageSquare size={15} />
              Don&apos;t like this result? Tell Roomie what to change
            </label>
            <textarea
              id="room-compare-note"
              className="room-compare-feedback__input"
              placeholder="e.g. too dark, remove the rug, I wanted a wooden bed frame not metal"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isBusy}
              rows={2}
              maxLength={400}
            />
          </div>
        )}

        <div className="room-compare-page__actions">
          <button
            type="button"
            className="room-compare-page__regenerate"
            onClick={handleRegenerate}
            disabled={isBusy || finishing}
          >
            <RefreshCw size={18} className={isBusy ? 'room-compare-page__spin' : ''} />
            {currentVariant
              ? note.trim()
                ? 'Regenerate with feedback'
                : photos.length > 1
                  ? `Regenerate photo ${selected + 1}`
                  : 'Regenerate'
              : photos.length > 1
                ? `Generate photo ${selected + 1}`
                : 'Generate'}
          </button>

          <button
            type="button"
            className="room-compare-page__next"
            onClick={handleNext}
            disabled={anyBusy || finishing || !hasAnyDesign}
          >
            {finishing ? 'Saving…' : 'Next'}
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
