import { getPrefs } from './prefs'
import { FRAGMENTS } from './i18nFragments'
import { FRAGMENTS_EN } from './i18nFragmentsEn'

// Translates UI text at the DOM level so every page follows the language
// switch, even pages that were written natively in Thai (Decision, Product
// Match, Summary) or natively in English (Upload, Design Setup, Compare,
// Furnish & Decorate, My Rooms). Each text node is translated in whichever
// direction its own source language needs:
//   - Thai source (FRAGMENTS)   -> shown in English when lang is 'en'
//   - English source (FRAGMENTS_EN) -> shown in Thai when lang is 'th'
// The original is always remembered, so switching back restores it exactly.
// Text with no matching entry is left as it is.
// Thai block minus U+0E3F (฿, the Baht sign) — that symbol alone appears in
// plenty of English-sourced price strings ("฿1,000 left in your budget") and
// must not make the whole string look Thai.
const THAI = /[฀-฾เ-๿]/
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const thKeys = Object.keys(FRAGMENTS).sort((a, b) => b.length - a.length)
const thMatcher = new RegExp(thKeys.map(escape).join('|'), 'g')
const toEnglish = (text) => text.replace(thMatcher, (hit) => FRAGMENTS[hit])

// English keys get word boundaries so short common words ("Next", "Back")
// don't corrupt unrelated text they merely appear inside of.
// \b only makes sense where the phrase itself starts/ends on a word
// character — appending it after e.g. a trailing "." leaves no word char on
// either side of the boundary, so it would never match at all.
const wordEdge = (key, pattern) => {
  const start = /\w/.test(key[0]) ? '\\b' : ''
  const end = /\w/.test(key[key.length - 1]) ? '\\b' : ''
  return `${start}${pattern}${end}`
}
const enKeys = Object.keys(FRAGMENTS_EN).sort((a, b) => b.length - a.length)
const enMatcher = new RegExp(enKeys.map((key) => wordEdge(key, escape(key))).join('|'), 'g')
const toThai = (text) => text.replace(enMatcher, (hit) => FRAGMENTS_EN[hit] ?? hit)
const looksEnglish = (text) => { enMatcher.lastIndex = 0; return enMatcher.test(text) }

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt']
const textState = new WeakMap() // Text/Element -> { src, out, from: 'th' | 'en' }
const attrState = new WeakMap() // Element -> { [attr]: { src, out, from } }

function translateFresh(value) {
  if (THAI.test(value)) return { from: 'th', out: toEnglish(value) }
  if (looksEnglish(value)) return { from: 'en', out: toThai(value) }
  return null
}

function resolve(entry, lang) {
  // Thai-source text shows Thai by default, English only in 'en' mode.
  // English-source text shows English by default, Thai only in 'th' mode.
  if (entry.from === 'th') return lang === 'en' ? entry.out : entry.src
  return lang === 'th' ? entry.out : entry.src
}

function syncText(node) {
  const lang = getPrefs().lang
  const value = node.nodeValue
  const entry = textState.get(node)
  if (entry && (value === entry.src || value === entry.out)) {
    const wanted = resolve(entry, lang)
    if (value !== wanted) node.nodeValue = wanted
    return
  }
  const fresh = translateFresh(value)
  if (!fresh) return
  const record = { src: value, out: fresh.out, from: fresh.from }
  textState.set(node, record)
  const wanted = resolve(record, lang)
  if (value !== wanted) node.nodeValue = wanted
}

function syncAttrs(element) {
  const lang = getPrefs().lang
  const store = attrState.get(element) ?? {}
  for (const attr of ATTRS) {
    const value = element.getAttribute?.(attr)
    if (value == null) continue
    const entry = store[attr]
    if (entry && (value === entry.src || value === entry.out)) {
      const wanted = resolve(entry, lang)
      if (value !== wanted) element.setAttribute(attr, wanted)
      continue
    }
    const fresh = translateFresh(value)
    if (!fresh) continue
    const record = { src: value, out: fresh.out, from: fresh.from }
    store[attr] = record
    const wanted = resolve(record, lang)
    if (value !== wanted) element.setAttribute(attr, wanted)
  }
  attrState.set(element, store)
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) return syncText(root)
  if (root.nodeType !== Node.ELEMENT_NODE) return
  syncAttrs(root)
  const tree = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let node = tree.nextNode()
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) syncText(node)
    else syncAttrs(node)
    node = tree.nextNode()
  }
}

export function startTranslator() {
  if (typeof document === 'undefined') return
  let queued = false
  const pending = new Set()
  const flush = () => {
    queued = false
    const batch = [...pending]
    pending.clear()
    batch.forEach((node) => node.isConnected && walk(node))
  }
  const enqueue = (node) => {
    pending.add(node)
    if (!queued) { queued = true; queueMicrotask(flush) }
  }

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') enqueue(mutation.target)
      else if (mutation.type === 'attributes') enqueue(mutation.target)
      else mutation.addedNodes.forEach(enqueue)
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })

  let lang = getPrefs().lang
  const relang = () => walk(document.body)
  relang()
  // Language switched: re-sweep the page (prefs notifies via localStorage write + event).
  window.addEventListener('roomie:prefs', () => {
    if (getPrefs().lang !== lang) { lang = getPrefs().lang; relang() }
  })
}
