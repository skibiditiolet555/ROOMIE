// Stable image identity keeps geometry from a previous design out of this one.
export function imageKey(image) {
  let hash = 2166136261
  for (let i = 0; i < image.length; i++) hash = Math.imul(hash ^ image.charCodeAt(i), 16777619)
  return `${image.length}-${(hash >>> 0).toString(16)}`
}

export function containsPoint(points, x, y) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j]
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function simplify(points, tolerance = 1.2) {
  if (points.length < 3) return points
  const a = points[0], b = points[points.length - 1]
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy
  let max = tolerance * tolerance, index = -1
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const t = length ? Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / length)) : 0
    const distance = (p.x-a.x-t*dx)**2 + (p.y-a.y-t*dy)**2
    if (distance > max) { max = distance; index = i }
  }
  if (index < 0) return [a, b]
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)]
}

export function maskToOutline(width, height, mask, x, y) {
  const sx = Math.max(0, Math.min(width - 1, Math.floor(x * width)))
  const sy = Math.max(0, Math.min(height - 1, Math.floor(y * height)))
  const seed = sy * width + sx, label = mask[seed]
  const selected = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0, count = 1
  queue[0] = seed
  selected[seed] = 1
  const visit = (index) => {
    if (!selected[index] && mask[index] === label) {
      selected[index] = 1
      queue[count++] = index
    }
  }
  // Retain only the connected object at the click, excluding isolated specks.
  while (head < count) {
    const i = queue[head++], px = i % width
    if (px > 0) visit(i - 1)
    if (px < width - 1) visit(i + 1)
    if (i >= width) visit(i - width)
    if (i < width * (height - 1)) visit(i + width)
  }
  if (count < 12 || count > width * height * 0.7) throw new Error('The object could not be isolated. Try clicking its center.')

  // Walk exposed pixel edges. Closed loops represent outer edges and holes;
  // keep the largest outer loop so upholstery seams do not become outlines.
  const edges = new Map(), stride = width + 1
  const add = (a, b) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push(b) }
  for (let q = 0; q < count; q++) {
    const i = queue[q], px = i % width, py = Math.floor(i / width)
    const tl = py * stride + px, tr = tl + 1, bl = tl + stride, br = bl + 1
    if (py === 0 || !selected[i-width]) add(tl, tr)
    if (px === width-1 || !selected[i+1]) add(tr, br)
    if (py === height-1 || !selected[i+width]) add(br, bl)
    if (px === 0 || !selected[i-1]) add(bl, tl)
  }
  let best = [], bestArea = 0
  while (edges.size) {
    const start = edges.keys().next().value
    let current = start
    const loop = []
    do {
      loop.push({ x: current % stride, y: Math.floor(current / stride) })
      const outgoing = edges.get(current)
      if (!outgoing?.length) break
      const next = outgoing.pop()
      if (!outgoing.length) edges.delete(current)
      current = next
    } while (current !== start)
    if (current !== start || loop.length < 3) continue
    const area = Math.abs(loop.reduce((sum, p, i) => {
      const next = loop[(i + 1) % loop.length]
      return sum + p.x * next.y - next.x * p.y
    }, 0))
    if (area > bestArea) { bestArea = area; best = loop }
  }
  if (best.length < 3) throw new Error('No object boundary found.')
  const middle = Math.floor(best.length / 2)
  const outline = [...simplify(best.slice(0, middle + 1)).slice(0, -1), ...simplify([...best.slice(middle), best[0]]).slice(0, -1)]
  return outline.map((p) => ({ x: p.x / width * 100, y: p.y / height * 100 }))
}

// Framed artwork and mirrors have a closed, high-contrast rim. Detect its
// connected edge locally so a pale print is not merged with the wall.
export function frameOutline(width, height, rgba, x, y) {
  const dark = new Uint8Array(width * height)
  for (let i=0; i<dark.length; i++) {
    const luminance = rgba[i*4]*.299 + rgba[i*4+1]*.587 + rgba[i*4+2]*.114
    if (luminance < 110) dark[i]=1
  }
  const joined = new Uint8Array(dark)
  for (let py=1; py<height-1; py++) for (let px=1; px<width-1; px++) {
    const i=py*width+px
    if (!dark[i]) continue
    for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) joined[i+dy*width+dx]=1
  }
  const queue = new Int32Array(width*height)
  let best=null, score=0
  for (let seed=0; seed<joined.length; seed++) {
    if (!joined[seed]) continue
    let count=1, head=0, minX=width, minY=height, maxX=0, maxY=0
    queue[0]=seed; joined[seed]=0
    while (head<count) {
      const i=queue[head++], px=i%width, py=Math.floor(i/width)
      minX=Math.min(minX,px); maxX=Math.max(maxX,px)
      minY=Math.min(minY,py); maxY=Math.max(maxY,py)
      for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
        if (px+dx<0 || px+dx>=width || py+dy<0 || py+dy>=height) continue
        const next=i+dy*width+dx
        if (joined[next]) { joined[next]=0; queue[count++]=next }
      }
    }
    const w=maxX-minX, h=maxY-minY, area=w*h
    if (w<15 || h<15 || w>width*.6 || h>height*.7 || area>width*height*.25) continue
    if (x*width<minX+w*.08 || x*width>maxX-w*.08 || y*height<minY+h*.08 || y*height>maxY-h*.08) continue
    if (count/area>.4) continue
    const candidateScore=area*(1-count/area)
    if (candidateScore>score) { score=candidateScore; best=Array.from(queue.slice(0,count),i=>({x:i%width,y:Math.floor(i/width)})) }
  }
  if (!best) return null
  best.sort((a,b)=>a.x-b.x || a.y-b.y)
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
  const lower=[], upper=[]
  for (const p of best) { while (lower.length>1 && cross(lower.at(-2),lower.at(-1),p)<=0) lower.pop(); lower.push(p) }
  for (let i=best.length-1;i>=0;i--) { const p=best[i]; while (upper.length>1 && cross(upper.at(-2),upper.at(-1),p)<=0) upper.pop(); upper.push(p) }
  const hull=[...lower.slice(0,-1),...upper.slice(0,-1)]
  return simplify([...hull,hull[0]],1.5).slice(0,-1).map(p=>({x:p.x/width*100,y:p.y/height*100}))
}
