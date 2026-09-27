import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatTHB } from '../../lib/currency'
import { usePrefs } from '../../lib/prefs'
import { getObjectDecisions, getProject } from '../../lib/projects'
import './ProjectSummaryPage.css'

const DECISION_LABELS = {
  keep: { label: 'KEEP', detail: 'คงไว้ในแบบสุดท้าย', icon: '✓' },
  replace: { label: 'REPLACE', detail: 'เปลี่ยนตามโจทย์ที่ระบุ', icon: '↻' },
  remove: { label: 'REMOVE', detail: 'นำออกจากแบบและงบประมาณ', icon: '−' },
}

const LEGACY_OBJECTS = {
  rug: { name: 'พรม', category: 'rug' }, sofa: { name: 'โซฟา', category: 'sofa' },
  coffee_table: { name: 'โต๊ะกลาง', category: 'coffee-table' }, table: { name: 'โต๊ะกลาง', category: 'coffee-table' },
  tv_stand: { name: 'ตู้วางทีวี', category: 'television' }, curtain: { name: 'ผ้าม่าน', category: 'curtain' },
  chair: { name: 'เก้าอี้', category: 'chair' }, plant: { name: 'ต้นไม้ตกแต่ง', category: 'plant' },
}

export default function ProjectSummaryPage() {
  usePrefs()
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getProject(id).then((loaded) => !cancelled && setProject(loaded)).finally(() => !cancelled && setIsLoading(false))
    return () => { cancelled = true }
  }, [id])

  const objectDecisions = getObjectDecisions(project?.decisions)
  const decisionObjects = project?.detectedObjects?.length
    ? project.detectedObjects
    : Object.keys(objectDecisions).map((objectId) => ({ id: objectId, ...(LEGACY_OBJECTS[objectId] ?? { name: objectId, category: objectId }) }))
  const generatedImages = project?.generatedImages?.length
    ? project.generatedImages
    : project?.generatedImageUrl ? [{ sourceImageId: 'legacy', generatedImageUrl: project.generatedImageUrl }] : []
  const selectedProducts = Object.values(project?.productSelections ?? {})
  const hasSelectedProducts = selectedProducts.length > 0
  const displayedTotal = hasSelectedProducts
    ? selectedProducts.reduce((sum, selection) => sum + (Number(selection.price) || 0), 0)
    : Number(project?.estimatedTotal) || 0

  if (isLoading) return <main className="summary-missing"><h1>กำลังโหลด...</h1></main>
  if (!project) return <main className="summary-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>
  // Decisions are the real prerequisite. Do not reject a valid preview just
  // because an older project or a browser-only workflow has a stale stage.
  if (!decisionObjects.length || !Object.keys(objectDecisions).length) {
    return <main className="summary-missing"><h1>โปรเจกต์ยังไม่พร้อมตรวจสอบ</h1><p>ตัดสินใจเลือก Keep / Replace / Remove ให้เสร็จก่อนดูแบบสุดท้าย</p><Link to={`/room/${id}/decision`}>กลับไปตัดสินใจ</Link></main>
  }

  const counts = decisionObjects.reduce((result, item) => {
    const decision = objectDecisions[item.id] ?? 'keep'
    result[decision] += 1
    return result
  }, { keep: 0, replace: 0, remove: 0 })

  return (
    <div className="summary-shell">
      <header className="summary-topbar"><Link to={`/room/${id}/decision`}>← กลับไปตัดสินใจ</Link><span>ROOMLY AI · FINAL PREVIEW</span><Link to="/home">คลังโปรเจกต์</Link></header>
      <main className="summary-content">
        <div className="summary-success"><span>◎</span><p>05 · FINAL PROJECT</p><h1>ตรวจแบบสุดท้ายก่อนเลือกซื้อ</h1><strong>{project.name}</strong><small>ดูภาพห้องและการตัดสินใจทั้งหมดให้เรียบร้อย แล้วค่อยไปดูสินค้าจริงในขั้นถัดไป</small></div>

        <section className="summary-metrics"><article><span>สไตล์</span><strong>{project.style}</strong></article><article><span>งบประมาณสูงสุด</span><strong>{formatTHB(project.budget)}</strong></article><article><span>{hasSelectedProducts ? 'ยอดสินค้าจริง' : 'ยอดประมาณการ'}</span><strong>{formatTHB(displayedTotal)}</strong></article><article><span>สถานะงบ</span><strong className={displayedTotal <= project.budget ? 'is-good' : 'is-over'}>{displayedTotal <= project.budget ? `เหลือ ${formatTHB(project.budget - displayedTotal)}` : `เกิน ${formatTHB(displayedTotal - project.budget)}`}</strong></article></section>

        {generatedImages.length ? <section className="summary-card"><div className="summary-section-heading"><div><span>FINAL AI ROOMS</span><h2>แบบห้องสุดท้ายของคุณ</h2></div><small>{generatedImages.length} ภาพ</small></div><div className="summary-room-gallery">{generatedImages.map((room, index) => <figure key={room.sourceImageId ?? index}><img src={room.generatedImageUrl} alt={`แบบห้องสุดท้าย ภาพที่ ${index + 1}`} /><figcaption>ROOM {String(index + 1).padStart(2, '0')}</figcaption></figure>)}</div></section> : null}

        <section className="summary-card"><div className="summary-section-heading"><div><span>OBJECT DECISIONS</span><h2>ผล Keep / Replace / Remove</h2></div><small>{decisionObjects.length} รายการ</small></div><div className="summary-decision-stats"><span className="is-keep">✓ {counts.keep} Keep</span><span className="is-replace">↻ {counts.replace} Replace</span><span className="is-remove">− {counts.remove} Remove</span></div><div className="summary-decisions">{decisionObjects.map((item) => {
          const decision = objectDecisions[item.id] ?? 'keep'
          const config = DECISION_LABELS[decision]
          const replacementNote = project.replacementBriefs?.[item.id]?.note
          return <article className={`is-${decision}`} key={item.id}><b>{config.icon}</b><div><strong>{item.name}</strong><small>ห้อง {item.roomNumber ?? 1} · {replacementNote || config.detail}</small></div><em>{config.label}</em></article>
        })}</div></section>

        <section className="summary-actions"><Link to={`/room/${id}/compare`}>ดูแบบก่อน-หลัง</Link><Link className="is-primary" to={`/room/${id}/products`}>{hasSelectedProducts ? 'กลับไปดูสินค้า' : 'ดูและซื้อสินค้า'} →</Link></section>
      </main>
    </div>
  )
}
