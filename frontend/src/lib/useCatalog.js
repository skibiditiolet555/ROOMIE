import { useSyncExternalStore } from 'react'
import { REAL_PRODUCT_CATALOG } from '../data/realProductCatalog'
import { getPrefs, usePrefs } from './prefs'
import { backendUrl } from './backendUrl'

// Live IKEA Thailand listings (real names, prices, photos, product pages) via
// the backend. Cached in localStorage for a few hours; the static estimate
// list is only a fallback when the store can't be reached. In English mode the
// English IKEA Thailand names and product pages are used.
const KEY = 'roomie.liveCatalog.v2'
const TTL = 6 * 60 * 60 * 1000

const toProduct = (item) => ({
  ...item,
  en: (item.name_en ?? item.en).replace(/\s*\d{6,}$/, ''),
  swatch: item.swatch || '#d9c9ad',
  styles: [],
  tags: [item.description, item.description_en].filter(Boolean),
  match: 80,
  live: true,
})

let state = { raw: REAL_PRODUCT_CATALOG, live: false, loading: true }
const listeners = new Set()
const emit = (next) => { state = next; listeners.forEach((listener) => listener()) }

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved?.items?.length) {
      emit({ raw: saved.items, live: true, loading: Date.now() - saved.at > TTL })
      if (Date.now() - saved.at <= TTL) return
    }
  } catch { /* ignore */ }
  fetch(backendUrl('/api/products?limit=12'))
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
    .then(({ items }) => {
      const raw = items.map(toProduct)
      try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), items: raw })) } catch { /* quota */ }
      emit({ raw, live: true, loading: false })
    })
    .catch(() => emit({ ...state, loading: false }))
}
load()

// Products shown in the chosen language (memoised so the snapshot stays stable).
let cached = { raw: null, lang: null, products: [] }
function localized() {
  const { lang } = getPrefs()
  if (cached.raw === state.raw && cached.lang === lang) return cached.products
  const products = lang === 'en'
    ? state.raw.map((item) => (item.name_en
      ? { ...item, name: item.name_en, size: item.size_en ?? item.size, url: item.url_en ?? item.url }
      : item))
    : state.raw
  cached = { raw: state.raw, lang, products }
  return products
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
const snapshot = () => state

/** { products, live, loading } — `live` is false when only the static estimate list is available. */
export function useCatalog() {
  usePrefs()
  const current = useSyncExternalStore(subscribe, snapshot)
  return { products: localized(), live: current.live, loading: current.loading }
}

/** Current catalog outside React (pair with useCatalog() in the component so it re-renders). */
export const getCatalog = () => localized()
