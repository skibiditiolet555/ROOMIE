import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, X, Sparkles } from 'lucide-react'
import AppHeader from '../../components/AppHeader/AppHeader'
import RoomWorkflow from '../../components/RoomWorkflow/RoomWorkflow'
import { useRooms } from '../../context/RoomsContext'
import { styleOptions } from '../../utils/roomStyles'
import { generateDesign } from '../../services/roomieApi'
import { THB_PER_USD } from '../../lib/prefs'
import './RoomDesignSetupPage.css'

const MIN_BUDGET = 100
const MAX_BUDGET = 1000000

// Photos are redesigned this many at a time — enough to be quick, few enough
// not to hit OpenAI's per-minute image limits on a room with 6 photos.
const MAX_PARALLEL_DESIGNS = 3
const DESIGN_CATEGORIES = [
  { id: 'furniture', label: 'Furniture' },
  { id: 'curtains', label: 'Curtains' },
  { id: 'flooring', label: 'Flooring & rugs' },
  { id: 'decor', label: 'Decorations' },
  { id: 'lighting', label: 'Lighting' },
]
const DEFAULT_CATEGORIES = DESIGN_CATEGORIES.map(({ id }) => id)

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

export default function RoomDesignSetupPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { rooms, updateRoom } = useRooms()
  const room = rooms.find((r) => r.id === id)

  const [name, setName] = useState(room?.name || '')
  const [budget, setBudget] = useState(room?.budget || 1000)
  // What the user is literally typing, digits only — kept separate from the
  // clamped numeric `budget` so a mid-edit value like "" or "0" is never
  // fought by React re-rendering the number as something else (the cause of
  // the old bug where the field would jumble into a value like "0100000").
  const [budgetText, setBudgetText] = useState((room?.budget || 1000).toLocaleString('en-US'))
  const [selectedStyle, setSelectedStyle] = useState(
    () => styleOptions.find((s) => s.label === room?.style)?.id || null
  )
  const [prompt, setPrompt] = useState(room?.designPrompt || '')
  const [selectedCategories, setSelectedCategories] = useState(
    () => room?.designCategories?.length ? room.designCategories : DEFAULT_CATEGORIES
  )
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')

  // Autosave the draft so a user who leaves mid-form (closes the tab, loses
  // connection, navigates away) can come back and pick up where they left off,
  // instead of having to redo the name/budget/style/prompt from scratch.
  const draftTimerRef = useRef(null)
  useEffect(() => {
    if (!room) return
    clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      const style = styleOptions.find((s) => s.id === selectedStyle)?.label
      const updates = {}
      const trimmedName = name.trim()
      if (trimmedName && trimmedName !== room.name) updates.name = trimmedName
      if (budget !== room.budget) updates.budget = budget
      if (style && style !== room.style) updates.style = style
      if (prompt !== (room.designPrompt || '')) updates.designPrompt = prompt
      const savedCategories = room.designCategories?.length ? room.designCategories : DEFAULT_CATEGORIES
      if (JSON.stringify(selectedCategories) !== JSON.stringify(savedCategories)) updates.designCategories = selectedCategories
      if (Object.keys(updates).length > 0) updateRoom(room.id, updates)
    }, 800)
    return () => clearTimeout(draftTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, budget, selectedStyle, prompt, selectedCategories, room?.id])

  if (!room) {
    return (
      <div className="room-design-page">
        <AppHeader />
        <div className="room-design-page__inner">
          <p className="room-design-page__missing">Room not found.</p>
          <Link to="/home" className="room-design-page__back-link">
            <ArrowLeft size={16} /> Back to your projects
          </Link>
        </div>
      </div>
    )
  }

  const photos = room.photos?.length ? room.photos : (room.thumbnail ? [room.thumbnail] : [])

  const clampBudget = (value) => {
    if (Number.isNaN(value)) return MIN_BUDGET
    return Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, value))
  }

  // Digits only, no leading zeros, hard-capped at MAX_BUDGET as you type —
  // so it's never possible to end up with more than ฿1,000,000.
  const handleBudgetInput = (raw) => {
    const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
    if (!digits) { setBudgetText(''); setBudget(0); return }
    const capped = Math.min(MAX_BUDGET, Number(digits))
    setBudgetText(capped.toLocaleString('en-US'))
    setBudget(capped)
  }
  const budgetUsd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format((budget || 0) / THB_PER_USD)

  const isValid = name.trim().length > 0 && budget >= MIN_BUDGET && budget <= MAX_BUDGET && selectedStyle && prompt.trim().length > 0 && selectedCategories.length > 0

  const handleNext = async () => {
    if (!isValid || generating) return
    const style = styleOptions.find((s) => s.id === selectedStyle)?.label || room.style
    const trimmedPrompt = prompt.trim()

    // If the user already generated designs for this exact style/prompt/budget/
    // set of photos (e.g. they hit Back just to fix the name, or refreshed the
    // page), reuse what's already there instead of burning API calls to redo
    // work that's already done.
    const alreadyGenerated =
      room.designImages?.length === photos.length &&
      room.designImages.every(Boolean) &&
      room.style === style &&
      room.designPrompt === trimmedPrompt &&
      room.budget === budget &&
      JSON.stringify(room.designCategories?.length ? room.designCategories : DEFAULT_CATEGORIES) === JSON.stringify(selectedCategories)

    if (alreadyGenerated) {
      await updateRoom(room.id, { name: name.trim(), budget, style, designPrompt: trimmedPrompt, designCategories: selectedCategories })
      navigate(`/room/${room.id}/compare`)
      return
    }

    setError('')
    setGenerating(true)
    setProgress({ done: 0, total: photos.length })

    // Every photo is redesigned on its own, from its own original. They can
    // be different rooms, so they are never used as references for each other.
    const failures = []
    const sameCheckpoint = room.style === style &&
      room.designPrompt === trimmedPrompt &&
      room.budget === budget &&
      JSON.stringify(room.designCategories?.length ? room.designCategories : DEFAULT_CATEGORIES) === JSON.stringify(selectedCategories) &&
      room.designImages?.length === photos.length
    const designs = sameCheckpoint ? [...room.designImages] : new Array(photos.length).fill(null)
    setProgress({ done: designs.filter(Boolean).length, total: photos.length })
    await updateRoom(room.id, {
      name: name.trim(), style, budget, designPrompt: trimmedPrompt,
      designCategories: selectedCategories, status: 'In Progress', designImages: designs,
    })
    let checkpointSave = Promise.resolve()
    const updatedDesigns = await mapWithConcurrency(photos, MAX_PARALLEL_DESIGNS, async (photo, index) => {
      try {
        if (designs[index]) return designs[index]
        const result = await generateDesign({ image: photo, style, prompt: trimmedPrompt, budget, categories: selectedCategories })
        designs[index] = result.image
        const firstSaved = designs.find(Boolean)
        checkpointSave = checkpointSave.then(() => updateRoom(room.id, {
          style, budget, designPrompt: trimmedPrompt, designCategories: selectedCategories,
          status: 'In Progress', designImages: [...designs], designImage: firstSaved, thumbnail: firstSaved,
        }))
        await checkpointSave
        return result.image
      } catch (requestError) {
        failures.push(requestError)
        return null
      } finally {
        setProgress((current) => ({ ...current, done: current.done + 1 }))
      }
    })

    const firstDesign = updatedDesigns.find(Boolean)
    if (!firstDesign) {
      setError(failures[0]?.message || 'The designs could not be generated.')
      setGenerating(false)
      return
    }

    // A photo that failed stays null; the compare page lets you retry it
    // on its own instead of throwing away the ones that worked.
    await updateRoom(room.id, {
      name: name.trim(),
      budget,
      style,
      designPrompt: trimmedPrompt,
      status: 'In Progress',
      designImages: updatedDesigns,
      designImage: firstDesign,
      thumbnail: firstDesign,
    })
    navigate(`/room/${room.id}/compare`)
  }

  return (
    <div className="room-design-page">
      <AppHeader />

      <div className="room-design-page__inner">
        <RoomWorkflow roomId={room.id} currentStep={2} />
        <Link to={`/room/${room.id}`} className="room-design-page__back-link">
          <ArrowLeft size={16} /> Back
        </Link>

        <p className="room-design-page__eyebrow">Design Setup</p>
        <h1 className="room-design-page__title">Set up your new room</h1>
        <p className="room-design-page__subtitle">
          Tell Roomie a few details and pick a style — then get AI furniture suggestions to match.
        </p>

        {error && <p className="room-design-page__error">{error}</p>}

        {/* Your Photos */}
        <div className="room-design-field">
          <label className="room-design-field__label">
            Your photos ({photos.length})
          </label>
          {photos.length > 1 && (
            <p className="room-design-field__hint">
              Each photo gets its own redesign, so you&apos;ll see a Before and After for every one.
            </p>
          )}
          <div className="room-design-photos">
            {photos.map((photo, index) => (
              <button
                key={index}
                type="button"
                className="room-design-photos__btn"
                onClick={() => setLightboxPhoto(photo)}
                aria-label={`View room photo ${index + 1} full size`}
              >
                <img
                  src={photo}
                  alt={`Uploaded room photo ${index + 1}`}
                  className="room-design-photos__img"
                />
              </button>
            ))}
          </div>
        </div>

        {lightboxPhoto && (
          <div
            className="room-design-lightbox"
            onClick={() => setLightboxPhoto(null)}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="room-design-lightbox__close"
              onClick={() => setLightboxPhoto(null)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <img
              src={lightboxPhoto}
              alt="Room photo, full size"
              className="room-design-lightbox__img"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Room Name */}
        <div className="room-design-field">
          <label className="room-design-field__label" htmlFor="room-name">
            Room name
          </label>
          <input
            id="room-name"
            type="text"
            className="room-design-field__input"
            placeholder="e.g. My Cozy Bedroom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </div>

        {/* Budget */}
        <div className="room-design-field">
          <label className="room-design-field__label" htmlFor="room-budget">
            Budget (฿{MIN_BUDGET.toLocaleString()} – ฿{MAX_BUDGET.toLocaleString()})
          </label>
          <div className="room-design-field__budget-wrap">
            <span className="room-design-field__currency">฿</span>
            <input
              id="room-budget"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="room-design-field__input room-design-field__input--budget"
              value={budgetText}
              onChange={(e) => handleBudgetInput(e.target.value)}
              onBlur={() => { const clamped = clampBudget(budget); setBudget(clamped); setBudgetText(clamped.toLocaleString('en-US')) }}
            />
          </div>
          <p className="room-design-field__budget-usd">≈ ${budgetUsd} USD</p>
        </div>

        {/* Style Picker */}
        <div className="room-design-field">
          <label className="room-design-field__label">Pick a design direction</label>
          <p className="room-design-field__hint">
            This guides the furniture suggestions in the next step.
          </p>
          <div className="room-design-styles">
            {styleOptions.map((option) => (
              <button
                type="button"
                key={option.id}
                className={`room-design-style ${selectedStyle === option.id ? 'room-design-style--selected' : ''}`}
                onClick={() => setSelectedStyle(option.id)}
              >
                <div className={`room-design-style__set room-design-style__set--${Math.min(photos.length, 6)}`}>
                  {photos.map((photo, i) => (
                    <div
                      key={i}
                      className="room-design-style__thumb"
                      style={{ backgroundImage: `url(${photo})`, filter: option.filter }}
                    />
                  ))}
                </div>
                {selectedStyle === option.id && (
                  <span className="room-design-style__check">
                    <Check size={14} />
                  </span>
                )}
                <span className="room-design-style__label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="room-design-field">
          <span className="room-design-field__label">Choose what to add</span>
          <p className="room-design-field__hint">Select the object types Roomie should add to the room.</p>
          <div className="room-design-categories">
            {DESIGN_CATEGORIES.map((category) => (
              <label key={category.id} className="room-design-category">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category.id)}
                  onChange={(event) => setSelectedCategories((current) => (
                    event.target.checked
                      ? [...current, category.id]
                      : current.filter((id) => id !== category.id)
                  ))}
                />
                {category.label}
              </label>
            ))}
          </div>
        </div>

        {/* Prompt */}
        <div className="room-design-field">
          <label className="room-design-field__label" htmlFor="room-prompt">
            Describe what you want
          </label>
          <textarea
            id="room-prompt"
            className="room-design-field__textarea"
            placeholder="e.g. Warm wood tones, lots of plants, a reading nook by the window…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
          />
        </div>

        <div className="room-design-page__actions">
          <Link to={`/room/${room.id}`} className="room-design-page__cancel">
            Back
          </Link>
          <button
            type="button"
            className="room-design-page__next"
            onClick={handleNext}
            disabled={!isValid || generating}
          >
            {generating ? (
              <>
                <Sparkles size={18} className="room-design-page__spin" />
                {photos.length > 1
                  ? `Designing your photos… (${progress.done}/${progress.total} done)`
                  : 'Generating…'}
              </>
            ) : (
              <>
                Next
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
