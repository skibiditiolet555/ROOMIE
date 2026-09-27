// Reference catalog for the Replace browser and the Product Match step.
//
// Honesty note: these are typical Thai-market pieces with ESTIMATED prices,
// not scraped listings. There are no invented SKUs or product photos, and
// every link goes to the retailer's own search for that kind of piece — so
// "view product" always leads somewhere real. Replace this file's data with
// a verified feed (e.g. a products table) when one exists; the pages read the
// same field names.

export const CATALOG_VERIFIED_AT = 'ราคาประเมิน ยังไม่ได้ตรวจกับหน้าร้านจริง'

const SEARCH = {
  IKEA: (q) => `https://www.ikea.com/th/en/search/?q=${encodeURIComponent(q)}`,
  HomePro: (q) => `https://www.homepro.co.th/search?text=${encodeURIComponent(q)}`,
  Shopee: (q) => `https://shopee.co.th/search?keyword=${encodeURIComponent(q)}`,
  Lazada: (q) => `https://www.lazada.co.th/catalog/?q=${encodeURIComponent(q)}`,
}

const ALL = ['modern', 'minimalist', 'cozy', 'luxury']
const MOD = ['modern', 'minimalist']
const WARM = ['cozy', 'modern']
const LUX = ['luxury']
const LUXC = ['luxury', 'cozy']

// [category, Thai name, English description (search + image prompt), price THB, store, size, styles, tags]
const ROWS = [
  // ── Sofas ──
  ['sofa', 'โซฟา 2 ที่นั่ง ผ้าเบจ', 'beige fabric 2-seat sofa', 6900, 'IKEA', 'กว้าง 140 ซม.', MOD, ['fabric', 'beige', 'compact']],
  ['sofa', 'โซฟา 3 ที่นั่ง ผ้าเทาอ่อน', 'light grey fabric 3-seat sofa', 9900, 'IKEA', 'กว้าง 200 ซม.', MOD, ['fabric', 'grey']],
  ['sofa', 'โซฟา 3 ที่นั่ง ผ้ากำมะหยี่', 'grey velvet 3-seat sofa', 14900, 'HomePro', 'กว้าง 210 ซม.', LUXC, ['velvet', 'grey']],
  ['sofa', 'โซฟากำมะหยี่สีเขียวมรกต', 'emerald green velvet sofa with gold legs', 18900, 'HomePro', 'กว้าง 190 ซม.', LUX, ['velvet', 'green', 'gold']],
  ['sofa', 'โซฟาตัวแอล ผ้าลินิน', 'linen L-shaped sectional sofa', 21900, 'HomePro', '260 × 160 ซม.', WARM, ['linen', 'beige', 'sectional']],
  ['sofa', 'โซฟาเบด พับได้ 3 ที่นั่ง', 'fold-out 3-seat sofa bed', 9500, 'Shopee', 'กว้าง 190 ซม.', WARM, ['fabric', 'sofa bed']],
  ['sofa', 'โซฟาหนังสีคาราเมล', 'caramel leather 3-seat sofa', 24900, 'HomePro', 'กว้าง 210 ซม.', LUXC, ['leather', 'brown']],
  ['sofa', 'โซฟาบูเคลขาวทรงโค้ง', 'curved white boucle sofa', 16500, 'Lazada', 'กว้าง 220 ซม.', LUXC, ['boucle', 'white', 'curved']],
  ['sofa', 'โซฟามินิมอล 2 ที่นั่ง ขาไม้', 'minimalist 2-seat sofa on wooden legs', 5900, 'Lazada', 'กว้าง 150 ซม.', MOD, ['fabric', 'wood', 'compact']],
  ['sofa', 'โซฟาพูลแบบนั่งพื้น', 'low floor sofa with thick cushions', 4290, 'Shopee', 'กว้าง 180 ซม.', ['cozy'], ['fabric', 'low']],

  // ── Chairs ──
  ['chair', 'เก้าอี้ไม้ขาเรียว เบาะผ้า', 'wooden chair with fabric seat', 1890, 'IKEA', 'สูง 80 ซม.', MOD, ['wood', 'fabric']],
  ['chair', 'เก้าอี้พักผ่อน ผ้าบูเคล', 'white boucle lounge armchair', 4500, 'HomePro', 'กว้าง 70 ซม.', LUXC, ['boucle', 'white', 'lounge']],
  ['chair', 'เก้าอี้หวายสาน', 'woven rattan armchair', 2400, 'Shopee', 'สูง 85 ซม.', ['cozy'], ['rattan', 'natural']],
  ['chair', 'อาร์มแชร์หนังสีน้ำตาล', 'brown leather armchair', 7900, 'HomePro', 'กว้าง 80 ซม.', LUXC, ['leather', 'brown']],
  ['chair', 'เก้าอี้โยกไม้', 'wooden rocking chair', 3900, 'IKEA', 'สูง 95 ซม.', WARM, ['wood', 'rocking']],
  ['chair', 'เก้าอี้บีนแบ็ก', 'grey bean bag chair', 1290, 'Lazada', 'Ø 80 ซม.', ['cozy'], ['fabric', 'grey', 'bean bag']],
  ['chair', 'เก้าอี้กำมะหยี่ทรงเปลือกหอย', 'pink velvet shell armchair', 3490, 'Shopee', 'กว้าง 72 ซม.', LUX, ['velvet', 'pink']],
  ['chair', 'เก้าอี้พลาสติกขาไม้', 'white molded chair with wooden legs', 890, 'Shopee', 'สูง 82 ซม.', MOD, ['plastic', 'white', 'wood']],
  ['chair', 'เก้าอี้สตูลบาร์', 'wooden bar stool', 1490, 'IKEA', 'สูง 75 ซม.', MOD, ['wood', 'stool']],

  // ── Coffee tables ──
  ['coffee-table', 'โต๊ะกลางทรงกลม ไม้โอ๊ค', 'round oak coffee table', 2900, 'IKEA', 'Ø 80 ซม.', MOD, ['wood', 'round']],
  ['coffee-table', 'โต๊ะกลางหินอ่อน ขาทองเหลือง', 'round marble coffee table with brass base', 8900, 'HomePro', 'Ø 90 ซม.', LUX, ['marble', 'brass', 'round']],
  ['coffee-table', 'โต๊ะกลางไม้ยางพารา', 'rectangular rubberwood coffee table', 1590, 'Lazada', '100 × 50 ซม.', ['cozy', 'minimalist'], ['wood']],
  ['coffee-table', 'โต๊ะกลางกระจกขาเหล็ก', 'glass-top coffee table with black metal frame', 2490, 'Shopee', '100 × 55 ซม.', MOD, ['glass', 'metal', 'black']],
  ['coffee-table', 'โต๊ะกลางซ้อน 2 ชิ้น', 'set of 2 nesting round coffee tables', 3290, 'IKEA', 'Ø 70 / 50 ซม.', MOD, ['wood', 'round', 'nesting']],
  ['coffee-table', 'โต๊ะกลางมีลิ้นชัก', 'white coffee table with storage drawer', 2790, 'IKEA', '90 × 55 ซม.', MOD, ['white', 'storage']],
  ['coffee-table', 'โต๊ะกลางทรงไข่ ท็อปทราเวอร์ทีน', 'oval travertine coffee table', 12900, 'HomePro', '120 × 60 ซม.', LUX, ['stone', 'beige', 'oval']],
  ['coffee-table', 'โต๊ะกลางญี่ปุ่นขาเตี้ย', 'low Japanese-style wooden table', 1890, 'Shopee', '80 × 80 ซม.', ['cozy', 'minimalist'], ['wood', 'low']],

  // ── Side tables ──
  ['side-table', 'โต๊ะข้างโลหะสีดำ', 'round black metal side table', 890, 'IKEA', 'Ø 40 ซม.', MOD, ['metal', 'black', 'round']],
  ['side-table', 'โต๊ะข้างไม้ ทรงกลม', 'round wooden side table', 1290, 'Shopee', 'Ø 45 ซม.', WARM, ['wood', 'round']],
  ['side-table', 'โต๊ะข้างหินอ่อน', 'marble pedestal side table', 3900, 'HomePro', 'Ø 40 ซม.', LUX, ['marble', 'white']],
  ['side-table', 'โต๊ะข้างรูปตัว C', 'C-shaped sofa side table', 990, 'Lazada', '50 × 30 ซม.', MOD, ['metal', 'wood']],
  ['side-table', 'โต๊ะข้างหวาย', 'rattan side table', 1490, 'Shopee', 'Ø 42 ซม.', ['cozy'], ['rattan', 'natural']],

  // ── Dining tables ──
  ['dining-table', 'โต๊ะอาหารไม้ 4 ที่นั่ง', 'wooden 4-seat dining table', 5900, 'HomePro', '120 × 75 ซม.', MOD, ['wood']],
  ['dining-table', 'โต๊ะอาหารหินสังเคราะห์ 6 ที่นั่ง', 'sintered stone 6-seat dining table', 13900, 'HomePro', '160 × 80 ซม.', LUX, ['stone']],
  ['dining-table', 'โต๊ะอาหารกลม ท็อปขาว', 'round white dining table', 4490, 'IKEA', 'Ø 110 ซม.', MOD, ['white', 'round']],
  ['dining-table', 'โต๊ะอาหารพับได้', 'folding drop-leaf dining table', 3290, 'IKEA', '80–120 × 75 ซม.', MOD, ['wood', 'foldable', 'compact']],

  // ── Desks ──
  ['desk', 'โต๊ะทำงาน ท็อปไม้ ขาเหล็ก', 'wooden desk with black metal legs', 2990, 'IKEA', '120 × 60 ซม.', MOD, ['wood', 'metal']],
  ['desk', 'โต๊ะทำงานปรับระดับได้', 'electric height-adjustable desk', 7900, 'Lazada', '140 × 70 ซม.', ['modern'], ['adjustable', 'white']],
  ['desk', 'โต๊ะทำงานติดผนังพับได้', 'wall-mounted folding desk', 1790, 'Shopee', '80 × 50 ซม.', MOD, ['wood', 'compact']],
  ['desk', 'โต๊ะทำงานมีชั้นเก็บของ', 'white desk with drawers and shelf', 3990, 'IKEA', '130 × 60 ซม.', MOD, ['white', 'storage']],

  // ── Cabinets / storage ──
  ['cabinet', 'ตู้เก็บของ 2 บาน สีขาว', 'white 2-door storage cabinet', 3900, 'IKEA', '80 × 40 × 120 ซม.', MOD, ['white', 'storage']],
  ['cabinet', 'ตู้วางทีวี ไม้โอ๊ค', 'low oak sideboard', 5500, 'HomePro', 'กว้าง 160 ซม.', WARM, ['wood', 'sideboard']],
  ['cabinet', 'ตู้ไซด์บอร์ดหวายสาน', 'rattan-front sideboard', 6900, 'Shopee', 'กว้าง 140 ซม.', ['cozy'], ['rattan', 'wood']],
  ['cabinet', 'ตู้กระจกโชว์ของ', 'glass display cabinet with black frame', 7900, 'HomePro', '80 × 40 × 180 ซม.', LUX, ['glass', 'black']],
  ['cabinet', 'ตู้เสื้อผ้า 2 บาน', 'white 2-door wardrobe', 5990, 'IKEA', '100 × 58 × 200 ซม.', MOD, ['white', 'wardrobe']],
  ['cabinet', 'ตู้ลิ้นชัก 6 ช่อง', 'six-drawer wooden dresser', 4290, 'IKEA', '120 × 48 × 78 ซม.', WARM, ['wood', 'drawer']],

  // ── Shelves ──
  ['shelf', 'ชั้นวางของ 5 ชั้น', 'tall 5-tier open bookshelf', 1990, 'IKEA', '80 × 30 × 180 ซม.', MOD, ['open', 'wood']],
  ['shelf', 'ชั้นวางติดผนัง ไม้', 'floating wooden wall shelf', 690, 'Shopee', 'กว้าง 60 ซม.', ALL, ['wall', 'wood']],
  ['shelf', 'ชั้นวางช่องสี่เหลี่ยม 4×4', 'white 4x4 cube shelving unit', 3990, 'IKEA', '147 × 147 ซม.', MOD, ['white', 'cube']],
  ['shelf', 'ชั้นวางบันไดพิงผนัง', 'leaning ladder shelf', 1590, 'Lazada', '60 × 35 × 170 ซม.', WARM, ['wood', 'ladder']],
  ['shelf', 'ชั้นวางเหล็กสไตล์ลอฟท์', 'black metal and wood industrial shelf', 2490, 'Shopee', '90 × 35 × 160 ซม.', ['modern'], ['metal', 'black', 'wood']],

  // ── Rugs ──
  ['rug', 'พรมทอมือ สีเบจ 160×230', 'beige hand-woven wool rug', 3500, 'IKEA', '160 × 230 ซม.', ['cozy', 'minimalist'], ['beige', 'wool']],
  ['rug', 'พรมขนสั้น สีเทา 200×290', 'large short-pile grey rug', 5900, 'HomePro', '200 × 290 ซม.', ['modern', 'luxury'], ['grey']],
  ['rug', 'พรมปูพื้น กันลื่น 120×170', 'non-slip area rug', 990, 'Lazada', '120 × 170 ซม.', ALL, ['budget']],
  ['rug', 'พรมปอกระเจา ทรงกลม', 'round natural jute rug', 1890, 'Shopee', 'Ø 150 ซม.', ['cozy'], ['jute', 'natural', 'round']],
  ['rug', 'พรมขนยาว สีขาว', 'white shaggy rug', 2290, 'Lazada', '160 × 230 ซม.', LUXC, ['white', 'shag']],
  ['rug', 'พรมลายเรขาคณิต', 'black and cream geometric rug', 2990, 'IKEA', '170 × 240 ซม.', MOD, ['geometric', 'black']],
  ['rug', 'พรมวินเทจโทนแดง', 'red vintage Persian-style rug', 4490, 'HomePro', '160 × 230 ซม.', LUXC, ['red', 'vintage']],

  // ── Lamps ──
  ['lamp', 'โคมไฟตั้งพื้น ทรงโค้ง', 'black arc floor lamp', 2200, 'HomePro', 'สูง 170 ซม.', ['modern', 'luxury'], ['floor', 'black']],
  ['lamp', 'โคมไฟตั้งโต๊ะ ผ้าเบจ', 'table lamp with beige fabric shade', 790, 'IKEA', 'สูง 45 ซม.', ['cozy', 'minimalist'], ['table', 'warm']],
  ['lamp', 'โคมไฟตั้งพื้นกระดาษ', 'white paper lantern floor lamp', 1490, 'IKEA', 'สูง 150 ซม.', ['minimalist', 'cozy'], ['floor', 'paper', 'white']],
  ['lamp', 'โคมไฟตั้งพื้น 3 ขาไม้', 'wooden tripod floor lamp', 1790, 'Shopee', 'สูง 155 ซม.', WARM, ['floor', 'wood', 'tripod']],
  ['lamp', 'โคมไฟทองเหลืองขาหินอ่อน', 'brass floor lamp with marble base', 4200, 'Lazada', 'สูง 160 ซม.', LUX, ['floor', 'brass', 'marble']],
  ['lamp', 'โคมไฟเห็ดตั้งโต๊ะ', 'mushroom table lamp', 990, 'Shopee', 'สูง 35 ซม.', ['modern', 'cozy'], ['table', 'white']],
  ['lamp', 'โคมไฟอ่านหนังสือหัวปรับได้', 'adjustable reading lamp', 1290, 'IKEA', 'สูง 140 ซม.', MOD, ['floor', 'metal']],
  ['lamp', 'โคมไฟหวายตั้งพื้น', 'rattan floor lamp', 2490, 'Shopee', 'สูง 150 ซม.', ['cozy'], ['floor', 'rattan', 'natural']],

  // ── Plants ──
  ['plant', 'ต้นไม้ปลอม ในกระถางเซรามิก', 'artificial plant in ceramic pot', 690, 'IKEA', 'สูง 90 ซม.', ALL, ['artificial']],
  ['plant', 'ต้นไทรใบสัก กระถางใหญ่', 'fiddle leaf fig in a large pot', 1590, 'Shopee', 'สูง 120 ซม.', WARM, ['real', 'large']],
  ['plant', 'ต้นมอนสเตอร่า', 'monstera plant in white pot', 890, 'Shopee', 'สูง 80 ซม.', ['cozy', 'modern'], ['real', 'green']],
  ['plant', 'ต้นลิ้นมังกร', 'snake plant in a pot', 390, 'Lazada', 'สูง 60 ซม.', ALL, ['real', 'small']],
  ['plant', 'ต้นมะกอกปลอม', 'artificial olive tree', 1990, 'HomePro', 'สูง 150 ซม.', LUXC, ['artificial', 'tree']],
  ['plant', 'ต้นไม้ในตะกร้าสาน', 'potted plant in a woven basket', 790, 'Shopee', 'สูง 70 ซม.', ['cozy'], ['basket', 'natural']],

  // ── Curtains ──
  ['curtain', 'ผ้าม่านทึบแสง สีเบจ', 'beige blackout curtains', 1490, 'IKEA', '140 × 250 ซม.', MOD, ['blackout', 'beige']],
  ['curtain', 'ผ้าม่านโปร่ง 2 ชั้น', 'white sheer double curtains', 1990, 'HomePro', '150 × 250 ซม.', LUXC, ['sheer', 'white']],
  ['curtain', 'ผ้าม่านลินินสีเทา', 'grey linen curtains', 1290, 'Lazada', '140 × 220 ซม.', MOD, ['linen', 'grey']],
  ['curtain', 'ผ้าม่านกำมะหยี่สีเขียว', 'green velvet curtains', 2490, 'Shopee', '140 × 250 ซม.', LUX, ['velvet', 'green']],
  ['curtain', 'มู่ลี่ไม้ไผ่', 'bamboo roller blind', 890, 'Shopee', 'กว้าง 120 ซม.', ['cozy', 'minimalist'], ['bamboo', 'natural']],

  // ── Beds ──
  ['bed', 'เตียง 5 ฟุต โครงไม้', 'wooden 5 ft bed frame', 7900, 'HomePro', '150 × 200 ซม.', WARM, ['wood']],
  ['bed', 'เตียงหุ้มผ้า 6 ฟุต พร้อมหัวเตียง', 'upholstered 6 ft bed with tall headboard', 15900, 'HomePro', '180 × 200 ซม.', LUX, ['upholstered']],
  ['bed', 'เตียงเหล็กสีดำ 5 ฟุต', 'black metal 5 ft bed frame', 4990, 'IKEA', '150 × 200 ซม.', MOD, ['metal', 'black']],
  ['bed', 'เตียงญี่ปุ่นทรงเตี้ย', 'low Japanese platform bed', 6490, 'Shopee', '160 × 200 ซม.', ['minimalist', 'cozy'], ['wood', 'low']],
  ['bed', 'เตียงมีลิ้นชักเก็บของ', 'white bed with storage drawers', 8990, 'IKEA', '160 × 200 ซม.', MOD, ['white', 'storage']],

  // ── Nightstands ──
  ['nightstand', 'ตู้ข้างเตียง 2 ลิ้นชัก', 'two-drawer nightstand', 1290, 'IKEA', '40 × 35 × 50 ซม.', MOD, ['drawer', 'white']],
  ['nightstand', 'ตู้ข้างเตียงไม้โอ๊ค', 'oak bedside table', 1890, 'HomePro', '45 × 40 × 55 ซม.', WARM, ['wood']],
  ['nightstand', 'ตู้ข้างเตียงหวาย', 'rattan bedside table', 1590, 'Shopee', '40 × 40 × 50 ซม.', ['cozy'], ['rattan']],
  ['nightstand', 'ตู้ข้างเตียงแขวนผนัง', 'floating wall nightstand', 790, 'Lazada', '40 × 30 × 15 ซม.', MOD, ['wall', 'compact']],

  // ── Poufs / ottomans ──
  ['ottoman', 'เบาะนั่งทรงกลม ผ้ากำมะหยี่', 'round velvet pouf', 1190, 'Shopee', 'Ø 45 ซม.', LUXC, ['velvet', 'pouf']],
  ['ottoman', 'สตูลเก็บของ หุ้มผ้า', 'upholstered storage ottoman', 1490, 'IKEA', '60 × 40 ซม.', MOD, ['storage', 'fabric']],
  ['ottoman', 'พูฟถักไหมพรม', 'chunky knit pouf', 890, 'Lazada', 'Ø 50 ซม.', ['cozy'], ['knit', 'beige']],
  ['ottoman', 'สตูลหนังวางเท้า', 'leather footstool', 2490, 'HomePro', '50 × 50 ซม.', LUXC, ['leather', 'brown']],

  // ── Mirrors ──
  ['mirror', 'กระจกยาวทรงโค้ง กรอบไม้', 'arched full-length mirror with wood frame', 2490, 'HomePro', '50 × 150 ซม.', MOD, ['wood', 'full length']],
  ['mirror', 'กระจกกลมกรอบทอง', 'round gold-framed mirror', 1890, 'Shopee', 'Ø 70 ซม.', LUX, ['gold', 'round']],
  ['mirror', 'กระจกทรงออร์แกนิก', 'irregular organic-shaped mirror', 1690, 'Lazada', '60 × 90 ซม.', ['modern'], ['frameless']],
  ['mirror', 'กระจกหวายทรงพระอาทิตย์', 'rattan sunburst mirror', 1290, 'Shopee', 'Ø 60 ซม.', ['cozy'], ['rattan', 'round']],

  // ── Wall art ──
  ['wall-art', 'ภาพพิมพ์ศิลป์ 2 ชิ้น พร้อมกรอบ', 'set of two framed abstract prints', 1290, 'IKEA', '50 × 70 ซม.', MOD, ['abstract', 'frame']],
  ['wall-art', 'ภาพแคนวาสขนาดใหญ่', 'large abstract canvas painting', 2900, 'Lazada', '90 × 120 ซม.', LUXC, ['canvas']],
  ['wall-art', 'ภาพลายเส้นขาวดำ', 'black and white line art print', 690, 'Shopee', '40 × 50 ซม.', MOD, ['line art', 'black']],
  ['wall-art', 'ภาพใบไม้โบทานิคอล 3 ชิ้น', 'set of three botanical prints', 990, 'Shopee', '30 × 40 ซม. × 3', ['cozy'], ['botanical', 'green']],
  ['wall-art', 'งานผ้าแขวนผนังมาคราเม่', 'macrame wall hanging', 790, 'Lazada', '60 × 90 ซม.', ['cozy'], ['macrame', 'beige']],
  ['wall-art', 'ภาพกรอบทองขนาดใหญ่', 'large gold-framed art print', 3900, 'HomePro', '80 × 100 ซม.', LUX, ['gold', 'frame']],

  // ── TV stands ──
  ['television', 'ชั้นวางทีวี พร้อมช่องเก็บของ', 'TV stand with storage', 4900, 'HomePro', 'กว้าง 150 ซม.', WARM, ['tv stand', 'wood']],
  ['television', 'ชั้นวางทีวีสีขาว ขาเตี้ย', 'low white TV bench', 2990, 'IKEA', 'กว้าง 120 ซม.', MOD, ['white', 'low']],
  ['television', 'ชั้นวางทีวีไม้วอลนัท', 'walnut media console', 7900, 'HomePro', 'กว้าง 180 ซม.', LUXC, ['wood', 'walnut']],

  // ── Benches ──
  ['bench', 'ม้านั่งยาว ไม้ เบาะผ้า', 'wooden bench with fabric cushion', 2900, 'IKEA', 'กว้าง 100 ซม.', WARM, ['wood', 'entryway']],
  ['bench', 'ม้านั่งปลายเตียงหุ้มกำมะหยี่', 'velvet end-of-bed bench', 3490, 'Shopee', 'กว้าง 110 ซม.', LUX, ['velvet']],
  ['bench', 'ม้านั่งเก็บรองเท้า', 'shoe storage bench', 1790, 'IKEA', 'กว้าง 80 ซม.', MOD, ['storage', 'entryway']],
]

// Rough colour of each piece, for the placeholder swatch on its card.
const SWATCHES = [
  ['emerald', '#2f6b4f'], ['green', '#4c7a55'], ['pink', '#d9a3a8'], ['red', '#8e3b35'],
  ['caramel', '#a8703f'], ['brown', '#7a5234'], ['walnut', '#5c3d26'], ['black', '#2b2926'],
  ['grey', '#8e8c88'], ['white', '#ece8e1'], ['cream', '#efe4cf'], ['beige', '#d8c7aa'],
  ['gold', '#c8a94b'], ['brass', '#b8923f'], ['marble', '#e6e2dc'], ['travertine', '#d9c9ae'],
  ['rattan', '#c49a63'], ['jute', '#b99a6b'], ['bamboo', '#c9a66b'], ['oak', '#c49a6c'],
  ['wood', '#a57a52'], ['linen', '#cfc2ac'], ['velvet', '#6e5a6e'], ['leather', '#7a5234'],
]

function swatchFor(text) {
  const lower = text.toLowerCase()
  return SWATCHES.find(([word]) => lower.includes(word))?.[1] ?? '#b9ad9a'
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const REAL_PRODUCT_CATALOG = ROWS.map(([category, name, en, price, store, size, styles, tags]) => ({
  id: `ref-${category}-${slug(en)}`,
  category,
  name,
  en,
  price,
  store,
  size,
  styles,
  tags,
  swatch: swatchFor(`${en} ${tags.join(' ')}`),
  // Retailer search for this kind of piece — never an invented product URL.
  url: SEARCH[store](en),
  image_url: null,
  match: 80,
}))
