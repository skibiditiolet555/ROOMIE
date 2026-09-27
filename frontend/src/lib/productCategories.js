// Shared by the Decision (Replace browser) and Product Match pages, so a
// detected object maps to the same catalog category in both.

export const CATEGORY_LABELS = {
  sofa: 'โซฟา', chair: 'เก้าอี้', 'coffee-table': 'โต๊ะกลาง', 'side-table': 'โต๊ะข้าง',
  'dining-table': 'โต๊ะอาหาร', desk: 'โต๊ะทำงาน', cabinet: 'ตู้เก็บของ', shelf: 'ชั้นวาง',
  rug: 'พรม', lamp: 'โคมไฟ', plant: 'ต้นไม้ตกแต่ง', curtain: 'ผ้าม่าน', bed: 'เตียง',
  nightstand: 'ตู้ข้างเตียง', ottoman: 'สตูล/เบาะนั่ง', mirror: 'กระจก', 'wall-art': 'ของตกแต่งผนัง',
  television: 'ชั้นวางทีวี', bench: 'ม้านั่ง',
}

// Kinds of furniture that can stand in for each other — a sofa can be
// replaced by armchairs or a bench, a coffee table by side tables, etc.
export const RELATED_CATEGORIES = {
  sofa: ['sofa', 'chair', 'bench', 'ottoman'],
  chair: ['chair', 'sofa', 'ottoman', 'bench'],
  'coffee-table': ['coffee-table', 'side-table', 'ottoman'],
  'side-table': ['side-table', 'coffee-table', 'nightstand'],
  'dining-table': ['dining-table', 'desk'],
  desk: ['desk', 'dining-table'],
  cabinet: ['cabinet', 'shelf', 'television'],
  shelf: ['shelf', 'cabinet'],
  television: ['television', 'cabinet', 'shelf'],
  bed: ['bed', 'nightstand', 'bench'],
  nightstand: ['nightstand', 'side-table'],
  rug: ['rug'],
  lamp: ['lamp'],
  plant: ['plant'],
  curtain: ['curtain'],
  mirror: ['mirror', 'wall-art'],
  'wall-art': ['wall-art', 'mirror'],
  ottoman: ['ottoman', 'chair', 'bench'],
  bench: ['bench', 'ottoman', 'chair'],
}

export function normalizeCategory(item) {
  const value = `${item?.category ?? ''} ${item?.name ?? ''} ${item?.sourceObjectId ?? ''} ${item?.id ?? ''}`.toLowerCase()
  const aliases = [
    [['side table', 'end table', 'side-table', 'side_table'], 'side-table'], [['dining table', 'dining-table', 'dining_table'], 'dining-table'],
    [['coffee table', 'center table', 'coffee-table', 'coffee_table'], 'coffee-table'],
    [['nightstand', 'bedside'], 'nightstand'], [['armchair', 'chair'], 'chair'], [['sectional', 'sofa', 'couch'], 'sofa'],
    [['sideboard', 'credenza', 'cabinet', 'dresser', 'storage', 'wardrobe'], 'cabinet'], [['bookshelf', 'shelf', 'shelving'], 'shelf'],
    [['area rug', 'rug', 'carpet'], 'rug'], [['lamp', 'lighting'], 'lamp'], [['plant', 'tree'], 'plant'],
    [['curtain', 'drape'], 'curtain'], [['ottoman', 'pouf', 'pouffe'], 'ottoman'], [['wall art', 'picture', 'artwork', 'print'], 'wall-art'],
    [['tv stand', 'tv_stand', 'tv bench', 'media console'], 'television'], [['television', ' tv'], 'television'],
    [['desk'], 'desk'], [['bed'], 'bed'], [['mirror'], 'mirror'], [['bench'], 'bench'],
  ]
  const matched = aliases.find(([keywords]) => keywords.some((keyword) => value.includes(keyword)))?.[1]
  if (matched) return matched
  if (/\btable\b/.test(value)) return 'coffee-table'
  return item?.category?.toLowerCase()
}
