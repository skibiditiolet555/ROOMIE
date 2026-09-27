import { useEffect, useMemo, useState } from 'react'
import { formatTHB } from '../../lib/currency'
import { usePrefs } from '../../lib/prefs'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CATALOG_VERIFIED_AT } from '../../data/realProductCatalog'
import { useCatalog } from '../../lib/useCatalog'
import { getObjectDecisions, getProject, updateProject } from '../../lib/projects'
import productBoard from '../../assets/hero-room.jpg'
import { CATEGORY_LABELS, normalizeCategory } from '../../lib/productCategories'
import './ProductsPage.css'

const LEGACY_OBJECTS = {
  sofa: { name: 'โซฟา', category: 'sofa' }, table: { name: 'โต๊ะกลาง', category: 'coffee-table' },
  chair: { name: 'เก้าอี้', category: 'chair' }, plant: { name: 'ต้นไม้ตกแต่ง', category: 'plant' },
  pouf: { name: 'เบาะนั่ง', category: 'ottoman' },
}

function isStyleMatch(product, style) {
  return Array.isArray(product.styles) && product.styles.includes(String(style ?? '').toLowerCase())
}

function formatStyleLabel(style) {
  return style?.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') ?? ''
}

function visualMatchScore(product, object, note = '') {
  const visualTags = object?.visual_tags ?? object?.visualTags ?? []
  const desired = [...visualTags, note].join(' ').trim().toLowerCase()
  if (!desired) return 0
  return (product.tags ?? []).reduce((score, tag) => score + (desired.includes(String(tag).toLowerCase()) ? 1 : 0), 0)
}

function sourceHost(url) {
  try {
    const { hostname, pathname } = new URL(url)
    return `${hostname.replace(/^www\./, '')}${pathname.split('/').slice(1, 3).map((part) => `/${part}`).join('')}`
  } catch {
    return 'หน้าสินค้า'
  }
}

function formatCheckedDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(date)
}

function ProductCard({ product, selected, disabled, onSelect, styleMatch, styleLabel }) {
  usePrefs()
  return (
    <article className={`products-card ${selected ? 'is-selected' : ''} ${disabled ? 'is-unaffordable' : ''}`.trim()}>
      <div className="products-card-image">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <div className="products-card-noimage" role="img" aria-label={product.name}><strong>{CATEGORY_LABELS[product.category] ?? product.category}</strong><small>ยังไม่มีรูปสินค้าจริง · กด "ดูสินค้าจริง" เพื่อดูที่ร้าน</small></div>}<span>{product.live ? 'ราคาจริง' : 'ราคาประเมิน'}</span></div>
      <div className="products-card-body">
        <div className="products-card-source"><span className={`is-${product.store.toLowerCase()}`}>{product.store}</span><small>{product.category}</small></div>
        {styleMatch ? <span className="products-card-style-badge">ตรงสไตล์ {styleLabel}</span> : null}
        <h3>{product.name}</h3>
        <p>{product.size}</p>
        <div className="products-card-price"><strong>{formatTHB(product.price)}</strong><small>{product.live ? 'ราคาจากร้าน' : 'ราคาอ้างอิง'}</small></div>
        <p className="products-card-source-note">
          ที่มาของราคา: <a href={product.url} target="_blank" rel="noreferrer">{sourceHost(product.url)}</a> · {product.live ? 'ดึงจากหน้าร้านล่าสุด' : `ตรวจเมื่อ ${formatCheckedDate(product.price_checked_at || product.verified_at || CATALOG_VERIFIED_AT)}`}
        </p>
        <div className="products-card-actions"><button type="button" disabled={disabled} onClick={onSelect}>{selected ? 'เลือกแล้ว ✓' : disabled ? 'เกินงบที่กำหนด' : 'เลือกชิ้นนี้'}</button><a href={product.affiliate_url || product.url} target="_blank" rel={product.affiliate_url ? 'noreferrer sponsored' : 'noreferrer'}>ดูสินค้าจริง ↗</a></div>
      </div>
    </article>
  )
}

function ProductsPage() {
  usePrefs()
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const { products, live } = useCatalog()
  const [activeObjectId, setActiveObjectId] = useState('')
  const [selections, setSelections] = useState({})
  const [saveError, setSaveError] = useState('')

  const objectDecisions = getObjectDecisions(project?.decisions)
  const objects = useMemo(() => {
    if (project?.detectedObjects?.length) return project.detectedObjects
    return Object.keys(objectDecisions).map((objectId) => ({ id: objectId, ...(LEGACY_OBJECTS[objectId] ?? { name: objectId, category: objectId }) }))
  }, [objectDecisions, project?.detectedObjects])
  // Removed items, and furniture already in the room that you're keeping, aren't bought.
  const needsProduct = (item, decisions) => (decisions[item.id] ?? 'keep') !== 'remove' && !(item.existing && (decisions[item.id] ?? 'keep') === 'keep')
  const visibleObjects = objects.filter((item) => needsProduct(item, objectDecisions))

  useEffect(() => {
    let cancelled = false
    getProject(id).then(async (loaded) => {
      if (cancelled || !loaded) return
      setProject(loaded)
      const loadedDecisions = getObjectDecisions(loaded.decisions)
      const loadedObjects = loaded.detectedObjects?.length
        ? loaded.detectedObjects
        : Object.keys(loadedDecisions).map((objectId) => ({ id: objectId, ...(LEGACY_OBJECTS[objectId] ?? { name: objectId, category: objectId }) }))
      const matchableObjects = loadedObjects.filter((item) => (loadedDecisions[item.id] ?? 'keep') !== 'remove' && !(item.existing && (loadedDecisions[item.id] ?? 'keep') === 'keep'))
      setActiveObjectId(matchableObjects[0]?.id ?? '')

      const catalog = products

      const planned = new Set((loaded.plannedProducts ?? []).map((item) => item.productId))
      const existing = loaded.productSelections ?? {}
      let runningTotal = 0
      const initialSelections = {}
      for (const item of matchableObjects) {
        const brief = loaded.replacementBriefs?.[item.id]
        const isReplace = loadedDecisions[item.id] === 'replace'
        // The piece chosen in the Decision page's Replace browser wins — and
        // it may be a different kind (armchairs instead of a sofa).
        const picked = isReplace ? catalog.find((product) => product.id === brief?.productId) : null
        const category = picked?.category ?? normalizeCategory(item)
        const itemBudget = isReplace && Number(brief?.budget) > 0 ? Number(brief.budget) : loaded.budget
        const candidates = catalog.filter((product) => product.category === category && product.price <= itemBudget)
        const preferred = picked ?? candidates.find((product) => product.id === existing[item.id]?.productId)
        const ranked = [...candidates].sort((first, second) => {
          const noteDiff = visualMatchScore(second, item, brief?.note) - visualMatchScore(first, item, brief?.note)
          const styleDiff = Number(isStyleMatch(second, loaded.style)) - Number(isStyleMatch(first, loaded.style))
          const plannedDiff = Number(planned.has(second.id)) - Number(planned.has(first.id))
          return plannedDiff || noteDiff || styleDiff || second.match - first.match || first.price - second.price
        })
        const affordable = [preferred, ...ranked].filter(Boolean).find((product) => runningTotal + product.price <= loaded.budget)
        if (affordable) {
          initialSelections[item.id] = affordable.id
          runningTotal += affordable.price
        }
      }
      setSelections(initialSelections)
    }).finally(() => !cancelled && setIsLoading(false))
    return () => { cancelled = true }
  }, [id, live])

  const total = useMemo(() => Object.values(selections).reduce((sum, productId) => sum + (products.find((product) => product.id === productId)?.price ?? 0), 0), [selections, products])
  const activeObject = visibleObjects.find((item) => item.id === activeObjectId) ?? visibleObjects[0]
  const activeBrief = project?.replacementBriefs?.[activeObject?.id]
  const activeDecision = objectDecisions[activeObject?.id] ?? 'keep'
  const pickedForActive = activeDecision === 'replace' ? products.find((product) => product.id === activeBrief?.productId) : null
  const activeCategory = pickedForActive?.category ?? normalizeCategory(activeObject)
  const selectedProductForActive = products.find((product) => product.id === selections[activeObject?.id])
  const totalWithoutActive = total - (selectedProductForActive?.price ?? 0)
  const remainingForActive = Math.max(0, (project?.budget ?? 0) - totalWithoutActive)
  const itemLimit = activeDecision === 'replace' && Number(activeBrief?.budget) > 0 ? Math.min(remainingForActive, Number(activeBrief.budget)) : remainingForActive
  const alternatives = products.filter((product) => product.category === activeCategory).sort((first, second) => {
    const noteDiff = visualMatchScore(second, activeObject, activeBrief?.note) - visualMatchScore(first, activeObject, activeBrief?.note)
    const styleDiff = Number(isStyleMatch(second, project?.style)) - Number(isStyleMatch(first, project?.style))
    return noteDiff || styleDiff || second.match - first.match
  })
  // An object whose kind the catalog has nothing for can't be matched — it
  // must not block saving (the page would otherwise be an unfinishable dead
  // end), so only objects the catalog can actually serve are required.
  const matchableObjects = visibleObjects.filter((item) => Boolean(selections[item.id])
    || products.some((product) => product.category === normalizeCategory(item)))
  const skippedCount = visibleObjects.length - matchableObjects.length
  const selectedCount = matchableObjects.filter((item) => selections[item.id]).length
  const allItemsSelected = selectedCount === matchableObjects.length

  if (isLoading) return <main className="products-missing"><h1>กำลังโหลดโปรเจกต์...</h1></main>
  if (!project) return <main className="products-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>

  function buildProductSelections() {
    return Object.fromEntries(Object.entries(selections).filter(([, productId]) => productId).map(([objectId, productId]) => {
      const product = products.find((item) => item.id === productId)
      const object = objects.find((item) => item.id === objectId)
      return [objectId, {
        productId, objectName: object?.name, category: normalizeCategory(object), decision: objectDecisions[objectId] ?? 'keep',
        name: product?.name, price: product?.price, store: product?.store, sku: product?.sku, size: product?.size,
        url: product?.affiliate_url || product?.url, imageUrl: product?.image_url, match: product?.match, verifiedAt: product?.live ? new Date().toISOString() : CATALOG_VERIFIED_AT,
        visualTags: object?.visual_tags ?? object?.visualTags ?? [],
      }]
    }))
  }

  async function saveProject() {
    if (!allItemsSelected || total > project.budget) return
    setSaveError('')
    try {
      await updateProject(project.id, { productSelections: buildProductSelections(), estimatedTotal: total, stage: 'saved', status: 'done', progress: 100 })
      navigate('/home')
    } catch (error) {
      setSaveError(error.message || 'บันทึกชุดสินค้าไม่สำเร็จ')
    }
  }

  async function saveDraft() {
    setSaveError('')
    try {
      await updateProject(project.id, { productSelections: buildProductSelections(), estimatedTotal: total, stage: 'product-matching', status: 'in-progress', progress: 92 })
      navigate('/home')
    } catch (error) {
      setSaveError(error.message || 'บันทึกร่างไม่สำเร็จ')
    }
  }

  function selectProduct(product) {
    if (!activeObject || product.price > itemLimit || totalWithoutActive + product.price > project.budget) return
    setSelections((current) => ({ ...current, [activeObject.id]: product.id }))
  }

  const roomPreview = project.generatedImages?.find((room) => room.sourceImageId === activeObject?.roomId)?.generatedImageUrl
  const activeVisualTags = activeObject?.visual_tags ?? activeObject?.visualTags ?? []

  return (
    <div className="products-shell">
      <header className="products-topbar"><Link to={`/room/${project.id}/summary`}>← กลับไปดูโปรเจกต์สุดท้าย</Link><span>ROOMLY AI · SEE & BUY</span><button className="products-save-draft" type="button" onClick={saveDraft}>บันทึกร่างและออก</button></header>
      <main className="products-content">
        <header className="products-heading"><div><p>06 · SEE & BUY PRODUCTS</p><h1>ดูและซื้อสินค้าที่เข้ากับโปรเจกต์</h1><span>เลือกสินค้าจริงตามแบบสุดท้าย พร้อมตรวจราคาและเปิดลิงก์ร้านค้าได้โดยตรง</span></div><div className={`products-budget-status ${total > project.budget ? 'is-over' : ''}`}><span>HARD BUDGET LIMIT · ห้ามเกิน</span><strong>{formatTHB(total)} <small>/ {formatTHB(project.budget)}</small></strong><i><b style={{ width: `${Math.min(100, (total / project.budget) * 100)}%` }} /></i></div></header>
        {saveError ? <p className="products-error" role="alert">{saveError}</p> : null}
        <nav className="products-category-tabs" aria-label="วัตถุที่ต้องจับคู่">{visibleObjects.map((item, index) => <button className={activeObject?.id === item.id ? 'is-active' : ''} type="button" onClick={() => setActiveObjectId(item.id)} key={item.id}><span>{String(index + 1).padStart(2, '0')}</span>{item.name || CATEGORY_LABELS[normalizeCategory(item)]}<small>ห้อง {item.roomNumber ?? 1} · {selections[item.id] ? 'เลือกแล้ว' : 'ยังไม่เลือก'}</small></button>)}</nav>
        {activeObject ? <section className="products-layout"><aside className="products-preview"><img src={roomPreview || project.generatedImageUrl || productBoard} alt={`ภาพ AI ที่ใช้จับคู่ ${activeObject.name}`} /><div><span>AI GENERATED REFERENCE</span><strong>{activeObject.name}</strong><p>{activeDecision === 'replace' ? `Replace · ${activeBrief?.note || 'ใช้สไตล์และประเภทวัตถุเป็นหลัก'}` : 'Keep · ค้นหาสินค้าจริงที่ใกล้แบบ AI'}{activeVisualTags.length ? ` · AI มองเห็น: ${activeVisualTags.join(', ')}` : ''}</p></div></aside><section className="products-alternatives"><div className="products-section-title"><div><span>{CATEGORY_LABELS[activeCategory] ?? activeObject.category}</span><h2>สินค้าจริงที่แนะนำ</h2></div><small>รายการนี้ใช้ได้ไม่เกิน {formatTHB(itemLimit)}</small></div><div className="products-grid">{alternatives.length ? alternatives.map((product) => <ProductCard product={product} selected={selections[activeObject.id] === product.id} disabled={selections[activeObject.id] !== product.id && product.price > itemLimit} onSelect={() => selectProduct(product)} styleMatch={isStyleMatch(product, project.style)} styleLabel={formatStyleLabel(project.style)} key={product.id} />) : <p className="products-empty">ยังไม่มีสินค้าจริงในหมวดนี้ที่ตรวจสอบแหล่งอ้างอิงแล้ว ระบบจะไม่แนะนำสินค้าคนละประเภทแทน</p>}</div></section></section> : <p className="products-empty">ไม่มีวัตถุที่ต้องจับคู่สินค้า</p>}
        <p className="products-catalog-note">{live ? 'ราคา รูป และลิงก์สินค้าดึงตรงจาก IKEA Thailand · ราคาอาจเปลี่ยนตามโปรโมชัน กรุณาตรวจสอบที่หน้าร้านก่อนชำระเงิน' : `ข้อมูลและราคาอ้างอิงตรวจสอบล่าสุด ${CATALOG_VERIFIED_AT} · เชื่อมต่อร้านไม่ได้ จึงแสดงราคาประเมิน กรุณาตรวจสอบที่หน้าร้านก่อนสั่งซื้อ`}</p>
        <footer className="products-footer"><div><span>สรุปชุดสินค้า</span><strong>{selectedCount}/{matchableObjects.length} ชิ้น{skippedCount ? ` (ข้าม ${skippedCount} ชิ้นที่ยังไม่มีสินค้าในหมวด)` : ''} · {formatTHB(total)}</strong><small>{total > project.budget ? 'ยอดรวมเกินงบ ระบบไม่อนุญาตให้บันทึก' : !allItemsSelected ? 'เลือกสินค้าให้ครบทุกชิ้นโดยต้องอยู่ในงบ' : `ผ่านเงื่อนไข · เหลือ ${formatTHB(project.budget - total)}`}</small></div><button type="button" disabled={!allItemsSelected || total > project.budget} onClick={saveProject}>บันทึกโปรเจกต์และกลับคลัง →</button></footer>
      </main>
    </div>
  )
}

export default ProductsPage
