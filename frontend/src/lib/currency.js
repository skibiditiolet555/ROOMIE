import { THB_PER_USD, getPrefs } from './prefs'

const thb = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** Amounts are stored in baht; shown as "฿1,490" or, when USD is chosen, "$43". */
export function formatTHB(value) {
  const baht = Math.round(Number(value) || 0)
  return getPrefs().currency === 'USD' ? usd.format(baht / THB_PER_USD) : thb.format(baht)
}
