import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Upload, X, Plus } from 'lucide-react'
import AppHeader from '../../components/AppHeader/AppHeader'
import RoomWorkflow from '../../components/RoomWorkflow/RoomWorkflow'
import { useRooms } from '../../context/RoomsContext'
import './RoomUploadPage.css'

const MAX_PHOTOS = 6

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function RoomUploadPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { rooms, updateRoom } = useRooms()
  const room = rooms.find((r) => r.id === id)

  const [photos, setPhotos] = useState(() => room?.photos?.length ? room.photos : (room?.thumbnail ? [room.thumbnail] : []))
  const [dragOver, setDragOver] = useState(false)
  const [notice, setNotice] = useState('')
  const fileInputRef = useRef(null)
  const noticeTimerRef = useRef(null)
  const isFirstPhotosRender = useRef(true)

  const showNotice = (message) => {
    setNotice(message)
    clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(''), 4000)
  }

  useEffect(() => () => clearTimeout(noticeTimerRef.current), [])

  // Autosave photos as they're added or removed, so a user who leaves before
  // pressing Next (closes the tab, loses connection) doesn't lose what they
  // already uploaded — reopening the room picks up right where they left off.
  useEffect(() => {
    if (isFirstPhotosRender.current) {
      isFirstPhotosRender.current = false
      return
    }
    if (!room) return
    updateRoom(room.id, {
      photos,
      thumbnail: photos[0] || room.thumbnail,
      originalThumbnail: room.originalThumbnail || photos[0],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  if (!room) {
    return (
      <div className="room-upload-page">
        <AppHeader />
        <div className="room-upload-page__inner">
          <p className="room-upload-page__missing">Room not found.</p>
          <Link to="/home" className="room-upload-page__back-link">
            <ArrowLeft size={16} /> Back to your projects
          </Link>
        </div>
      </div>
    )
  }

  const remainingSlots = MAX_PHOTOS - photos.length

  const addFiles = async (fileList) => {
    const imageFiles = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) return

    const candidateUrls = await Promise.all(imageFiles.map(readFileAsDataUrl))

    let duplicateCount = 0
    const uniqueNew = []
    for (const url of candidateUrls) {
      if (photos.includes(url) || uniqueNew.includes(url)) {
        duplicateCount += 1
      } else {
        uniqueNew.push(url)
      }
    }

    const accepted = uniqueNew.slice(0, remainingSlots)
    const overflow = uniqueNew.length - accepted.length

    if (accepted.length > 0) {
      setPhotos((prev) => [...prev, ...accepted].slice(0, MAX_PHOTOS))
    }

    if (duplicateCount > 0) {
      showNotice(
        duplicateCount === 1
          ? "That photo's already added — skipped the duplicate."
          : `Skipped ${duplicateCount} photos that were already added.`
      )
    } else if (overflow > 0) {
      showNotice(`Only room for ${accepted.length} more — the rest were skipped (max ${MAX_PHOTOS}).`)
    }
  }

  const handleFileChange = (e) => {
    addFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const handleNext = () => {
    updateRoom(room.id, {
      photos,
      thumbnail: photos[0],
      originalThumbnail: photos[0],
    })
    navigate(`/room/${room.id}/design`)
  }

  return (
    <div className="room-upload-page">
      <AppHeader />

      <div className="room-upload-page__inner">
        <RoomWorkflow roomId={room.id} currentStep={1} />
        <Link to="/home" className="room-upload-page__back-link">
          <ArrowLeft size={16} /> Back to your projects
        </Link>

        <p className="room-upload-page__eyebrow">{room.category} · {room.style}</p>
        <h1 className="room-upload-page__title">{room.name}</h1>
        <p className="room-upload-page__subtitle">
          Upload up to {MAX_PHOTOS} photos of this room, from different angles — the more
          perspectives AI can see, the more accurately it can work out real furniture and layout details.
        </p>

        {notice && <p className="room-upload-page__notice">{notice}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="room-upload-dropzone__input"
          onChange={handleFileChange}
        />

        {photos.length === 0 ? (
          <div
            className={`room-upload-dropzone ${dragOver ? 'room-upload-dropzone--active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <div className="room-upload-dropzone__empty">
              <div className="room-upload-dropzone__icon">
                <Upload size={28} />
              </div>
              <p className="room-upload-dropzone__text">
                <strong>Click to upload</strong> or drag and drop
              </p>
              <p className="room-upload-dropzone__hint">PNG, JPG or WEBP · up to {MAX_PHOTOS} photos</p>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`room-upload-grid ${dragOver ? 'room-upload-grid--active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                if (remainingSlots > 0) setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {photos.map((photo, index) => (
                <div key={index} className="room-upload-grid__item">
                  <img src={photo} alt={`Room photo ${index + 1}`} className="room-upload-grid__img" />
                  <button
                    type="button"
                    className="room-upload-grid__remove"
                    onClick={() => removePhoto(index)}
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <X size={14} />
                  </button>
                  {index === 0 && <span className="room-upload-grid__badge">1st Photo</span>}
                </div>
              ))}

              {remainingSlots > 0 && (
                <button
                  type="button"
                  className="room-upload-grid__add"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus size={22} />
                  <span>Add photo</span>
                </button>
              )}
            </div>
            <p className="room-upload-page__count">{photos.length} / {MAX_PHOTOS} photos</p>
          </>
        )}

        <div className="room-upload-page__actions">
          <Link to="/home" className="room-upload-page__cancel">
            Cancel
          </Link>
          <button
            type="button"
            className="room-upload-page__save"
            onClick={handleNext}
            disabled={photos.length === 0}
          >
            Next
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
