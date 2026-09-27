import { usePrefs } from './prefs'

// Thai is the source language of the UI; English overrides live here.
// Anything not listed falls back to the Thai text, so pages can be
// translated incrementally: t('ข้อความไทย').
const EN = {
  'เลือกสินค้าทดแทน': 'Choose a replacement',
  'REPLACE · เลือกของใหม่แทน': 'REPLACE · PICK SOMETHING NEW',
  'เลือกแล้ว': 'Selected',
  'ยกเลิกสินค้าที่เลือก': 'Clear selected product',
  'หมวดสินค้า': 'Product categories',
  'ทั้งหมด': 'All',
  'ค้นหา เช่น กำมะหยี่ ไม้ สีเทา': 'Search e.g. velvet, wood, grey',
  'เรียงลำดับ': 'Sort',
  'แนะนำ': 'Recommended',
  'ราคาต่ำ → สูง': 'Price: low → high',
  'ราคาสูง → ต่ำ': 'Price: high → low',
  'ในงบเท่านั้น': 'In budget only',
  'ตรงสไตล์': 'matches style',
  'เลือกแล้ว ✓': 'Selected ✓',
  'เกินงบ': 'Over budget',
  'เลือกชิ้นนี้': 'Choose this',
  'ดูที่ร้าน': 'View at store',
  'ไม่พบสินค้าที่ตรงกับคำค้นหรือหมวดนี้ ลองหมวด “ทั้งหมด” หรือคำค้นอื่น': 'No products match. Try “All” or another search.',
  'ออกจากระบบ': 'Log out',
  'ภาษา': 'Language',
  'สกุลเงิน': 'Currency',
}

export const translate = (lang, text) => (lang === 'en' ? EN[text] ?? text : text)

export function useT() {
  const { lang } = usePrefs()
  return (text) => translate(lang, text)
}
