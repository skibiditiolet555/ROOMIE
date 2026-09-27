import { useSyncExternalStore } from 'react'

// Language + currency preference, persisted in localStorage. A tiny external
// store so plain helpers (formatMoney) and components share one source.
const KEY = 'roomie.prefs'
// Reference rate only; prices are estimates, not live FX.
export const THB_PER_USD = 35

const read = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { lang: saved.lang === 'en' ? 'en' : 'th', currency: saved.currency === 'USD' ? 'USD' : 'THB' }
  } catch {
    return { lang: 'th', currency: 'THB' }
  }
}

let state = read()
const listeners = new Set()

export const getPrefs = () => state

export function setPrefs(patch) {
  state = { ...state, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode */ }
  document.documentElement.lang = state.lang
  listeners.forEach((listener) => listener())
  // Let the DOM translator re-sweep after React has rendered the new state.
  setTimeout(() => window.dispatchEvent(new Event('roomie:prefs')), 0)
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const usePrefs = () => useSyncExternalStore(subscribe, getPrefs)

if (typeof document !== 'undefined') document.documentElement.lang = state.lang
