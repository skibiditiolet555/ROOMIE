import { useMemo, useState } from 'react'
import { formatTHB } from '../../lib/currency'
import { usePrefs } from '../../lib/prefs'
import { translate } from '../../lib/i18n'
import {
  Archive, Armchair, Bed, Blinds, Check, ExternalLink, Frame, Lamp, Library,
  Package, RectangleHorizontal, Search, Sofa, Sprout, Square, Table, Tv, X,
} from 'lucide-react'
import { CATEGORY_LABELS, RELATED_CATEGORIES, normalizeCategory } from '../../lib/productCategories'
import './ReplacementBrowser.css'

const ICONS = {
  sofa: Sofa, chair: Armchair, 'coffee-table': Table, 'side-table': Table, 'dining-table': Table,
  desk: Table, cabinet: Archive, shelf: Library, television: Tv, bed: Bed, nightstand: Archive,
  rug: RectangleHorizontal, lamp: Lamp, plant: Sprout, curtain: Blinds, mirror: Square,
  'wall-art': Frame, ottoman: Package, bench: RectangleHorizontal,
}

const SORTS = [
  { id: 'recommended', label: 'แนะนำ' },
  { id: 'price-asc', label: 'ราคาต่ำ → สูง' },
  { id: 'price-desc', label: 'ราคาสูง → ต่ำ' },
]


/**
 * IKEA-style browser for choosing what replaces one object: category tabs
 * (the object's own kind first, then pieces that can stand in for it, then
 * everything), search, sort, and a scrolling grid. Picking a piece sets the
 * replacement's budget and description, which drive both the "regenerate
 * just this object" edit and the Product Match step.
 */
export default function ReplacementBrowser({ object, catalog, style, maxBudget, selectedId, onSelect, onClear, compact = false }) {
  const { lang } = usePrefs()
  const t = (text) => translate(lang, text)
  const ownCategory = normalizeCategory(object)
  const related = RELATED_CATEGORIES[ownCategory] ?? (ownCategory ? [ownCategory] : [])
  const tabs = [...related.filter((category) => catalog.some((product) => product.category === category)), 'all']

  const [category, setCategory] = useState(tabs[0] ?? 'all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recommended')
  const [affordableOnly, setAffordableOnly] = useState(false)
  const styleKey = String(style ?? '').toLowerCase()

  const products = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const list = catalog.filter((product) => {
      if (category !== 'all' && product.category !== category) return false
      if (affordableOnly && product.price > maxBudget) return false
      if (!words.length) return true
      const haystack = `${product.name} ${product.en} ${product.store} ${(product.tags ?? []).join(' ')} ${CATEGORY_LABELS[product.category] ?? ''}`.toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
    const reference = object?.price || maxBudget
    return list.sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price
      if (sort === 'price-desc') return b.price - a.price
      // Recommended: the object's own kind, then affordable, then matching
      // the room's style, then closest to what the current piece costs.
      const kind = Number(b.category === ownCategory) - Number(a.category === ownCategory)
      const fits = Number(b.price <= maxBudget) - Number(a.price <= maxBudget)
      const styled = Number(b.styles?.includes(styleKey)) - Number(a.styles?.includes(styleKey))
      return kind || fits || styled || Math.abs(a.price - reference) - Math.abs(b.price - reference)
    })
  }, [catalog, category, query, sort, affordableOnly, maxBudget, object?.price, ownCategory, styleKey])

  const selected = catalog.find((product) => product.id === selectedId)

  return (
    <section className={`rb ${compact ? 'is-compact' : ''}`.trim()} aria-label={t('เลือกสินค้าทดแทน')}>
      <header className="rb-head">
        <div>
          <span>{t('REPLACE · เลือกของใหม่แทน')}</span>
          <h2>เลือกสิ่งที่จะมาแทน “{object.name}”</h2>
          <p>งบสำหรับชิ้นนี้ไม่เกิน {formatTHB(maxBudget)} · {catalog.some((product) => product.live) ? 'ราคาและรูปจริงจาก IKEA Thailand · กด “ดูที่ร้าน” เพื่อสั่งซื้อ' : 'ราคาเป็นราคาประเมิน กด “ดูที่ร้าน” เพื่อดูราคาจริง'}</p>
        </div>
        {selected ? (
          <div className="rb-picked">
            <span className="rb-picked-swatch" style={{ background: selected.swatch }}>{selected.image_url ? <img src={selected.image_url} alt="" /> : null}</span>
            <div><small>{t('เลือกแล้ว')}</small><strong>{selected.name}</strong><em>{formatTHB(selected.price)}</em></div>
            <button type="button" onClick={onClear} aria-label={t('ยกเลิกสินค้าที่เลือก')}><X size={14} /></button>
          </div>
        ) : null}
      </header>

      <div className="rb-toolbar">
        <nav className="rb-tabs" aria-label={t('หมวดสินค้า')}>
          {tabs.map((tab) => {
            const count = tab === 'all' ? catalog.length : catalog.filter((product) => product.category === tab).length
            return (
              <button type="button" className={tab === category ? 'is-active' : ''} onClick={() => setCategory(tab)} key={tab}>
                {tab === 'all' ? t('ทั้งหมด') : CATEGORY_LABELS[tab] ?? tab}
                <small>{count}</small>
              </button>
            )
          })}
        </nav>
        <div className="rb-controls">
          <label className="rb-search">
            <Search size={14} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหา เช่น กำมะหยี่ ไม้ สีเทา')} />
          </label>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label={t('เรียงลำดับ')}>
            {SORTS.map((option) => <option value={option.id} key={option.id}>{t(option.label)}</option>)}
          </select>
          <label className="rb-toggle">
            <input type="checkbox" checked={affordableOnly} onChange={(event) => setAffordableOnly(event.target.checked)} />
            {t('ในงบเท่านั้น')}
          </label>
        </div>
      </div>

      {products.length ? (
        <div className="rb-grid">
          {products.map((product) => {
            const Icon = ICONS[product.category] ?? Package
            const isSelected = product.id === selectedId
            const tooExpensive = product.price > maxBudget
            return (
              <article className={`rb-card ${isSelected ? 'is-selected' : ''} ${tooExpensive ? 'is-over' : ''}`.trim()} key={product.id}>
                <button type="button" className="rb-card-visual" style={product.image_url ? undefined : { background: product.swatch }} disabled={tooExpensive} onClick={() => onSelect(product)} aria-label={`เลือก ${product.name}`}>
                  {product.image_url ? <img className="rb-photo" src={product.image_url} alt={product.name} loading="lazy" /> : <Icon size={34} strokeWidth={1.4} />}
                  <span className={`rb-store is-${product.store.toLowerCase()}`}>{product.store}</span>
                  {isSelected ? <span className="rb-check"><Check size={14} /></span> : null}
                </button>
                <div className="rb-card-body">
                  <small>{CATEGORY_LABELS[product.category] ?? product.category}{product.styles?.includes(styleKey) ? ' · ' + t('ตรงสไตล์') : ''}</small>
                  <h3>{product.name}</h3>
                  <p>{product.size}</p>
                  <strong>{formatTHB(product.price)}</strong>
                  <div className="rb-card-actions">
                    <button type="button" disabled={tooExpensive} onClick={() => onSelect(product)}>
                      {isSelected ? t('เลือกแล้ว ✓') : tooExpensive ? t('เกินงบ') : t('เลือกชิ้นนี้')}
                    </button>
                    <a href={product.url} target="_blank" rel="noreferrer" aria-label={`ดู ${product.name} ที่ ${product.store}`}>
                      {t('ดูที่ร้าน')} <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="rb-empty">ไม่พบสินค้าที่ตรงกับคำค้นหรือหมวดนี้ ลองหมวด “ทั้งหมด” หรือคำค้นอื่น</p>
      )}
    </section>
  )
}
