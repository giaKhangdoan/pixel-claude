import type { Register, ThemeMessageRule, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'

// Dark "night arcade" palette, kept to a handful of flat pixel-style colors.
const { theme, problems } = makeColors({
  label: 'Pixel night',
  only: 'dark',
  roles: { accent: '#41a6f6', danger: '#e5484d', success: '#38b764', warning: '#ffcd75', pro: '#a77bd9' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#1a1c2c',
        'surface-1': '#202339',
        'surface-2': '#252943',
        'surface-3': '#252943',
        'text-primary': '#f4f4f4',
        'text-secondary': '#c8cae0',
        'text-muted': '#a4a8c8',
      },
    },
  },
})

// Stair-step 8-bit box: 4-unit "pixels", notched corners, solid border.
const box = (border: `#${string}`, fill: `#${string}`): ThemeMessageRule['fill'] => ({
  vector: {
    viewBox: 32,
    slice: 12,
    paths: [
      { d: 'M4 0H28V4H32V28H28V32H4V28H0V4H4Z', color: border },
      { d: 'M8 4H24V8H28V24H24V28H8V24H4V8H8Z', color: fill },
    ],
  },
})

const base: ThemeMessageRule = {
  radius: 0,
  padding: 18,
  shadow: { x: 4, y: 4, blur: 0, color: '#0b0c16' },
}

// ---------- pixel canvas ----------
type Col = string | undefined
type Mode = 'awake' | 'dazed' | 'asleep'

class Cv {
  d: Col[]
  constructor(
    public w: number,
    public h: number,
  ) {
    this.d = new Array<Col>(w * h).fill(undefined)
  }
  set(x: number, y: number, c: Col) {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix >= 0 && iy >= 0 && ix < this.w && iy < this.h) this.d[iy * this.w + ix] = c
  }
  get(x: number, y: number): Col {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : undefined
  }
  rect(x: number, y: number, w: number, h: number, c: Col) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
  }
  each(f: (x: number, y: number) => Col) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = f(x, y)
        if (c !== undefined) this.d[y * this.w + x] = c
      }
  }
  // recolor pixels on the silhouette's edge
  edge(c: string) {
    const src = this.d.slice()
    const at = (x: number, y: number): Col => (x < 0 || y < 0 || x >= this.w || y >= this.h ? undefined : src[y * this.w + x])
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x] === undefined) continue
        if (at(x - 1, y) === undefined || at(x + 1, y) === undefined || at(x, y - 1) === undefined || at(x, y + 1) === undefined) this.d[y * this.w + x] = c
      }
  }
  flipH(): Cv {
    const o = new Cv(this.w, this.h)
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.d[y * this.w + (this.w - 1 - x)] = this.d[y * this.w + x]
    return o
  }
  // 90 degrees counter-clockwise: the top of the sprite ends up on the left
  rotL(): Cv {
    const o = new Cv(this.h, this.w)
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.d[(this.w - 1 - x) * o.w + y] = this.d[y * this.w + x]
    return o
  }
  svg(ox: number, oy: number, only?: string): string {
    type Run = { x: number; y: number; n: number; rows: number; c: string }
    const m = new Map<string, string[]>()
    const out = (r: Run) => {
      const k = only ?? r.c
      const a = m.get(k) ?? []
      a.push(`M${ox + r.x} ${oy + r.y}h${r.n}v${r.rows}h-${r.n}z`)
      m.set(k, a)
    }
    let open = new Map<string, Run>()
    for (let y = 0; y < this.h; y++) {
      const next = new Map<string, Run>()
      let x = 0
      while (x < this.w) {
        const c = this.d[y * this.w + x]
        if (c === undefined) {
          x++
          continue
        }
        let n = 1
        while (x + n < this.w && this.d[y * this.w + x + n] === c) n++
        const key = `${only === undefined ? c : ''}|${x}|${n}`
        const prev = open.get(key)
        if (prev !== undefined) {
          prev.rows++
          next.set(key, prev)
          open.delete(key)
        } else next.set(key, { x, y, n, rows: 1, c })
        x += n
      }
      for (const r of open.values()) out(r)
      open = next
    }
    for (const r of open.values()) out(r)
    return [...m].map(([c, p]) => `<path fill="${c}" d="${p.join('')}"/>`).join('')
  }
}

// only the pixels where `b` differs from `a` (drawn over `a` to change it)
const diffCv = (a: Cv, b: Cv) => {
  const c = new Cv(b.w, b.h)
  for (let i = 0; i < b.d.length; i++) if (b.d[i] !== undefined && b.d[i] !== a.d[i]) c.d[i] = b.d[i]
  return c
}

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) => {
  const A = hex(a)
  const B = hex(b)
  return '#' + A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('')
}

const eyes = (cv: Cv, lx: number, rx: number, y: number, mode: Mode, ink: string) => {
  for (const x of [lx, rx]) {
    if (mode === 'awake') {
      cv.rect(x, y, 2, 3, ink)
      cv.set(x, y, '#ffffff')
    } else if (mode === 'dazed') {
      cv.rect(x - 1, y + 1, 4, 1, ink)
      cv.set(x - 1, y, ink)
    } else {
      cv.set(x - 1, y + 1, ink)
      cv.set(x, y + 2, ink)
      cv.set(x + 1, y + 2, ink)
      cv.set(x + 2, y + 1, ink)
    }
  }
}
const mouth = (cv: Cv, mx: number, my: number, mode: Mode, ink: string) => {
  if (mode === 'awake') {
    cv.set(mx - 2, my, ink)
    cv.rect(mx - 1, my + 1, 3, 1, ink)
    cv.set(mx + 2, my, ink)
  } else if (mode === 'dazed') {
    cv.rect(mx - 1, my, 2, 1, ink)
    cv.rect(mx - 1, my + 2, 2, 1, ink)
    cv.set(mx - 2, my + 1, ink)
    cv.set(mx + 1, my + 1, ink)
  } else {
    cv.rect(mx - 1, my + 1, 2, 1, ink)
  }
}
const blush = (cv: Cv, lx: number, rx: number, y: number) => {
  cv.rect(lx, y, 2, 1, '#ff9fb0')
  cv.rect(rx, y, 2, 1, '#ff9fb0')
}

// ---------- the four AIs, drawn as little icon-creatures ----------
// Claude: the little orange block creature with two black eyes
const clawd = (W: number, mode: Mode) => {
  const bh = Math.round(W * 0.68)
  const c = new Cv(W + 4, bh + 3)
  const ox = 2
  c.each((x, y) => {
    const bx = x - ox
    if (y >= bh || bx < 0 || bx >= W) return undefined
    if (bx + y < 2 || W - 1 - bx + y < 2) return undefined
    return mix('#ee9274', '#c85f3d', y / bh)
  })
  const ay = Math.round(bh * 0.5)
  c.rect(0, ay, 2, 3, '#c85f3d')
  c.rect(ox + W, ay, 2, 3, '#c85f3d')
  for (const lx of [2, Math.round(W * 0.34), Math.round(W * 0.62), W - 3]) c.rect(ox + lx, bh, 3, 3, '#a84e30')
  c.edge('#8f4429')
  const ey = Math.round(bh * 0.28)
  for (const ex of [ox + Math.round(W * 0.24), ox + W - Math.round(W * 0.24) - 2]) {
    if (mode === 'awake') c.rect(ex, ey, 2, 4, '#26160f')
    else if (mode === 'dazed') c.rect(ex - 1, ey + 2, 4, 1, '#26160f')
    else {
      c.rect(ex - 1, ey + 2, 4, 1, '#26160f')
      c.set(ex - 1, ey + 1, '#26160f')
      c.set(ex + 2, ey + 1, '#26160f')
    }
  }
  return c
}

// Codex: a cloud with a terminal prompt
const codex = (S: number, mode: Mode) => {
  const W = S + 4
  const H = S - 2
  const c = new Cv(W, H)
  const circ = (x: number, y: number, cx: number, cy: number, r: number) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
  c.each((x, y) => {
    const inside =
      circ(x, y, 0.27 * W, 0.62 * H, 0.2 * W) ||
      circ(x, y, 0.5 * W, 0.4 * H, 0.27 * W) ||
      circ(x, y, 0.75 * W, 0.6 * H, 0.2 * W) ||
      (x >= 0.27 * W && x <= 0.76 * W && y >= 0.55 * H && y <= 0.9 * H)
    if (!inside) return undefined
    const t = y / H
    return mix('#b9c3ff', '#6a58ff', Math.min(1, t * 1.1))
  })
  c.edge('#2b2796')
  const ex = Math.round(W * 0.5)
  const ey = Math.round(H * 0.27)
  eyes(c, ex - 5, ex + 3, ey, mode, '#1a1a4a')
  // ">_" prompt
  const px0 = Math.round(W * 0.36)
  const py0 = Math.round(H * 0.58)
  for (const [dx, dy] of [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]] as const) c.rect(px0 + dx, py0 + dy - 1, 2, 1, '#ffffff')
  c.rect(px0 + 5, py0 + 3, 4, 1, '#ffffff')
  blush(c, ex - 8, ex + 6, ey + 3)
  return c
}

// DeepSeek: a blue whale
const whale = (W: number, mode: Mode) => {
  const H = Math.round(W * 0.64)
  const c = new Cv(W, H)
  const seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }
  c.each((x, y) => {
    const u = (x + 0.5) / W
    const v = (y + 0.5) / H
    const body = ((u - 0.58) / 0.4) ** 2 + ((v - 0.6) / 0.34) ** 2 <= 1
    const stem = seg(x + 0.5, y + 0.5, 0.26 * W, 0.6 * H, 0.1 * W, 0.34 * H) < 0.07 * W
    const fluke = ((u - 0.09) / 0.1) ** 2 + ((v - 0.24) / 0.15) ** 2 <= 1 && !(u > 0.07 && u < 0.13 && v < 0.2)
    const fin = v > 0.82 && v < 1 && Math.abs(u - 0.56) < (1 - v) * 1.1 + 0.02
    if (!(body || stem || fluke || fin)) return undefined
    if (body && v > 0.78) return '#d6dfff'
    if (body && v < 0.36) return '#7b90ff'
    return '#4d6bfe'
  })
  c.edge('#243aa8')
  const ex = Math.round(W * 0.76)
  const ey = Math.round(H * 0.38)
  c.rect(ex - 1, ey - 1, 4, 4, '#ffffff')
  if (mode === 'awake') c.rect(ex, ey, 2, 3, '#101530')
  else if (mode === 'dazed') c.rect(ex - 1, ey + 1, 4, 1, '#101530')
  else c.rect(ex - 1, ey + 2, 4, 1, '#101530')
  c.set(Math.round(W * 0.93), Math.round(H * 0.62), '#243aa8')
  c.rect(Math.round(W * 0.8), Math.round(H * 0.7), 4, 1, '#243aa8')
  blush(c, Math.round(W * 0.66), Math.round(W * 0.84), Math.round(H * 0.55))
  if (mode !== 'asleep') {
    for (const [dx, dy] of [[0, -3], [-2, -2], [2, -2], [0, -5]] as const) c.set(Math.round(W * 0.64) + dx, Math.round(H * 0.18) + dy + 3, '#9fe3ff')
  }
  return c
}

// ChatGPT: a hexagonal knot
const gpt = (S: number, mode: Mode) => {
  const c = new Cv(S, S)
  const h = S / 2
  const hd = (u: number, v: number) => Math.max(Math.abs(u) * 0.866 + Math.abs(v) * 0.5, Math.abs(v))
  c.each((x, y) => {
    const u = (x + 0.5 - h) / h
    const v = (y + 0.5 - h) / h
    const d = hd(u, v)
    if (d > 0.95) return undefined
    if (d >= 0.62 && d <= 0.8) return '#e8fff7'
    return u + v > 0.5 ? '#0b8a6b' : u + v < -0.5 ? '#2bc29c' : '#10a37f'
  })
  c.edge('#0a5a45')
  const ey = Math.round(h - 3)
  eyes(c, Math.round(h - 4), Math.round(h + 2), ey, mode, '#06251d')
  mouth(c, Math.round(h), ey + 5, mode, '#06251d')
  return c
}

type Creature = {
  id: 'cl' | 'cx' | 'ds' | 'gp'
  awake: (m: Mode) => Cv
  lying: () => Cv
  q: string
  r: string
  hand: string
  eyeRow: number
}
const SA = 22
const SL = 18
const CAST: Creature[] = [
  { id: 'cl', awake: m => clawd(SA, m), lying: () => clawd(SL, 'asleep').rotL(), q: '#6a4bb8', r: '#8f72dc', hand: '#c85f3d', eyeRow: 8 },
  { id: 'cx', awake: m => codex(SA, m), lying: () => codex(SL, 'asleep').rotL(), q: '#3f5fd0', r: '#6a86ef', hand: '#8f9bff', eyeRow: 9 },
  { id: 'ds', awake: m => whale(28, m), lying: () => whale(20, 'asleep').flipH(), q: '#2d9a8a', r: '#52c4b2', hand: '#4d6bfe', eyeRow: 10 },
  { id: 'gp', awake: m => gpt(SA, m), lying: () => gpt(SL, 'asleep').rotL(), q: '#b8553a', r: '#de7c5e', hand: '#0b8a6b', eyeRow: 12 },
]
const sitOf = (c: Creature) => 24 + c.eyeRow - c.awake('awake').h

// ---------- furniture & props ----------
const WOOD = '#a8703f'
const WOOD_D = '#7a4a28'

const bedCv = () => {
  const c = new Cv(30, 14)
  c.rect(0, 1, 3, 13, WOOD_D)
  c.rect(0, 0, 3, 1, '#c28851')
  c.rect(1, 1, 1, 12, WOOD)
  c.rect(27, 7, 3, 7, WOOD_D)
  c.rect(27, 6, 3, 1, '#c28851')
  c.rect(3, 6, 24, 5, '#eef0fa')
  c.rect(3, 6, 24, 1, '#ffffff')
  c.rect(3, 10, 24, 1, '#c3c9e2')
  c.rect(3, 11, 24, 2, WOOD)
  c.rect(3, 12, 24, 1, WOOD_D)
  c.rect(3, 13, 2, 1, WOOD_D)
  c.rect(25, 13, 2, 1, WOOD_D)
  c.rect(4, 3, 9, 4, '#ffffff')
  c.rect(4, 6, 9, 1, '#d5dcf5')
  c.rect(5, 3, 7, 1, '#f4f6ff')
  return c
}

// A quilt that follows the body under it: tall at the chest, lower at the feet, hanging over
// the front of the mattress. It ends exactly at the foot of the bed.
const blanketCv = (q: string, r: string, w: number) => {
  const h = 17
  const c = new Cv(w, h)
  const dark = mix(q, '#000000', 0.28)
  const mid = mix(q, '#000000', 0.12)
  for (let x = 0; x < w; x++) {
    const top = 1 + Math.round((3 * x) / Math.max(1, w - 1)) + Math.max(0, 3 - x) - (x >= w - 4 ? 1 : 0)
    for (let y = top; y < h; y++) c.set(x, y, y <= top + 1 ? r : y === h - 1 ? dark : (x + y) % 6 === 0 ? mid : q)
  }
  for (let x = 5; x < w - 2; x += 5) for (let y = 5; y < h - 1; y++) c.set(x, y, dark)
  for (let x = 1; x < w; x += 2) c.set(x, h - 2, mid)
  c.edge(dark)
  return c
}

const deskCv = () => {
  const c = new Cv(30, 14)
  c.rect(0, 0, 30, 3, '#e0b07a')
  c.rect(0, 0, 30, 1, '#f3cf9c')
  c.rect(0, 2, 30, 1, '#b88650')
  c.rect(1, 3, 9, 10, '#a8703f')
  c.rect(1, 3, 9, 1, '#7a4a28')
  c.rect(1, 13, 9, 1, '#6a3f20')
  c.rect(2, 5, 7, 3, '#c28851')
  c.rect(2, 9, 7, 3, '#c28851')
  c.rect(5, 6, 2, 1, '#f3e3a8')
  c.rect(5, 10, 2, 1, '#f3e3a8')
  c.rect(27, 3, 2, 11, '#8a5a3c')
  c.rect(10, 3, 17, 10, '#262a48')
  c.rect(11, 3, 15, 2, '#4a4f7a')
  c.rect(17, 5, 2, 5, '#8a91b0')
  c.rect(12, 10, 13, 1, '#9aa1c0')
  for (const x of [11, 17, 23]) c.rect(x, 11, 2, 2, '#4a5070')
  return c
}

const chairBackCv = () => {
  const c = new Cv(26, 24)
  c.each((x, y) => {
    const r = 5
    const cx = x < r ? r - x : x > 25 - r ? x - (25 - r) : 0
    const cy = y < r ? r - y : 0
    if (cx * cx + cy * cy > r * r) return undefined
    return y < 3 ? '#6a70a8' : '#4a4f7a'
  })
  c.edge('#2d3052')
  c.rect(5, 6, 16, 10, '#585e94')
  return c
}

const laptopCv = () => {
  const c = new Cv(20, 8)
  c.rect(1, 0, 18, 6, '#cdd2e6')
  c.rect(1, 0, 18, 1, '#eceff9')
  c.rect(1, 5, 18, 1, '#8d93b0')
  c.rect(9, 2, 3, 2, '#ffffff')
  c.rect(0, 6, 20, 2, '#a9afc8')
  c.rect(0, 7, 20, 1, '#7d84a2')
  return c
}

const tabletCv = () => {
  const c = new Cv(12, 16)
  c.rect(0, 0, 12, 16, '#aab0c8')
  c.rect(1, 1, 10, 14, '#1b1e33')
  c.rect(2, 2, 8, 12, '#8ec5ff')
  c.rect(2, 2, 8, 2, '#5a9be0')
  c.rect(3, 5, 5, 2, '#ffffff')
  c.rect(5, 8, 5, 2, '#ffb08f')
  c.rect(3, 11, 4, 1, '#ffffff')
  c.rect(5, 15, 2, 1, '#4a5070')
  return c
}

const envCv = (body: string, edge: string) => {
  const c = new Cv(11, 8)
  c.rect(0, 0, 11, 8, body)
  c.rect(0, 0, 11, 1, edge)
  c.rect(0, 7, 11, 1, edge)
  c.rect(0, 0, 1, 8, edge)
  c.rect(10, 0, 1, 8, edge)
  for (let i = 0; i < 5; i++) {
    c.set(1 + i, 1 + i, edge)
    c.set(9 - i, 1 + i, edge)
  }
  c.rect(4, 3, 3, 3, '#e5484d')
  return c
}

const bubbleCv = (W: number, H: number, tailLeft: boolean) => {
  const c = new Cv(W, H + 3)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue
      c.set(x, y, '#ffffff')
    }
  c.edge('#1a1c2c')
  const tx = tailLeft ? 4 : W - 7
  c.rect(tx, H, 3, 1, '#ffffff')
  c.rect(tx, H + 1, 2, 1, '#ffffff')
  c.rect(tx, H + 2, 1, 1, '#ffffff')
  c.set(tx - 1, H, '#1a1c2c')
  c.set(tx + 3, H, '#1a1c2c')
  return c
}

// One continuous strip of grass and soil across the whole stage. Everybody stands on it.
// `back` is the ground itself; `front` is a few blades of grass drawn in front of the feet.
const groundCv = (w: number, h: number) => {
  const back = new Cv(w, h)
  const front = new Cv(w, 2)
  let seed = 11
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let x = 0; x < w; x++) {
    back.set(x, 2, '#52d672')
    back.set(x, 3, '#2f9e50')
    for (let y = 4; y < h; y++) back.set(x, y, mix('#8b5a36', '#2a1c12', (y - 4) / (h - 4)))
    if (rnd() < 0.36) {
      front.set(x, 1, '#52d672')
      if (rnd() < 0.4) front.set(x, 0, '#86eb9a')
    }
    if (rnd() < 0.07) back.set(x, 5 + Math.floor(rnd() * (h - 6)), '#a87a50')
    if (rnd() < 0.06) back.set(x, 6 + Math.floor(rnd() * (h - 7)), '#3a2616')
  }
  for (let i = 0; i < 16; i++) back.rect(Math.floor(rnd() * (w - 3)), 7 + Math.floor(rnd() * (h - 9)), 2 + Math.floor(rnd() * 2), 1, '#7a7a92')
  return { back, front }
}
const GROUND = groundCv(160, 46)

// ---------- Vietnamese pixel text: a 6x12 bitmap font cut from a bold mono face ----------
const VF: Record<string, readonly number[]> = {
  "!": [0,0,0,8,8,8,8,8,0,8,0,0],
  "\"": [0,0,0,20,20,0,0,0,0,0,0,0],
  "'": [0,0,0,8,8,0,0,0,0,0,0,0],
  "(": [0,0,4,8,8,8,8,8,8,4,0,0],
  ")": [0,0,8,4,4,4,4,4,4,8,0,0],
  ",": [0,0,0,0,0,0,0,0,8,8,16,0],
  "-": [0,0,0,0,0,0,0,28,0,0,0,0],
  ".": [0,0,0,0,0,0,0,0,8,8,0,0],
  "0": [0,0,0,12,18,18,22,18,18,12,0,0],
  "1": [0,0,0,24,8,8,8,8,8,28,0,0],
  "2": [0,0,0,28,2,2,6,12,24,30,0,0],
  "3": [0,0,0,28,2,2,12,2,2,28,0,0],
  "4": [0,0,0,4,12,12,20,30,4,4,0,0],
  "5": [0,0,0,30,16,16,28,2,2,28,0,0],
  "6": [0,0,0,14,24,16,30,18,18,12,0,0],
  "7": [0,0,0,30,2,6,4,4,12,8,0,0],
  "8": [0,0,0,12,18,18,12,18,18,12,0,0],
  "9": [0,0,0,12,18,18,30,2,6,28,0,0],
  ":": [0,0,0,0,0,8,8,0,8,8,0,0],
  ";": [0,0,0,0,0,8,8,0,8,8,16,0],
  "?": [0,0,0,14,18,2,4,8,0,8,0,0],
  "A": [0,0,0,12,12,12,18,18,30,18,0,0],
  "B": [0,0,0,30,18,18,28,18,18,30,0,0],
  "C": [0,0,0,14,16,16,16,16,16,14,0,0],
  "D": [0,0,0,28,18,18,18,18,18,28,0,0],
  "E": [0,0,0,30,16,16,30,16,16,30,0,0],
  "F": [0,0,0,30,16,16,30,16,16,16,0,0],
  "G": [0,0,0,14,16,16,22,18,18,14,0,0],
  "H": [0,0,0,18,18,18,30,18,18,18,0,0],
  "I": [0,0,0,28,8,8,8,8,8,28,0,0],
  "J": [0,0,0,14,2,2,2,2,18,12,0,0],
  "K": [0,0,0,18,20,28,28,20,22,18,0,0],
  "L": [0,0,0,16,16,16,16,16,16,30,0,0],
  "M": [0,0,0,18,30,30,30,18,18,18,0,0],
  "N": [0,0,0,18,26,26,22,22,22,18,0,0],
  "O": [0,0,0,12,18,18,18,18,18,12,0,0],
  "P": [0,0,0,28,18,18,28,16,16,16,0,0],
  "Q": [0,0,0,12,18,18,18,18,18,12,2,0],
  "R": [0,0,0,30,18,18,28,22,18,19,0,0],
  "S": [0,0,0,12,18,16,14,2,18,12,0,0],
  "T": [0,0,0,62,8,8,8,8,8,8,0,0],
  "U": [0,0,0,18,18,18,18,18,18,12,0,0],
  "V": [0,0,0,18,18,18,18,12,12,12,0,0],
  "W": [0,0,0,34,34,42,54,54,20,20,0,0],
  "X": [0,0,0,18,18,12,12,12,18,18,0,0],
  "Y": [0,0,0,54,20,20,8,8,8,8,0,0],
  "Z": [0,0,0,30,6,4,12,8,24,30,0,0],
  "a": [0,0,0,0,0,14,2,30,18,30,0,0],
  "b": [0,0,16,16,16,28,18,18,18,28,0,0],
  "c": [0,0,0,0,0,14,16,16,16,14,0,0],
  "d": [0,0,2,2,2,14,18,18,18,14,0,0],
  "e": [0,0,0,0,0,12,18,30,16,14,0,0],
  "f": [0,0,14,8,8,30,8,8,8,8,0,0],
  "g": [0,0,0,0,0,14,18,18,18,14,2,14],
  "h": [0,0,16,16,16,30,18,18,18,18,0,0],
  "i": [0,0,8,8,0,24,8,8,8,62,0,0],
  "j": [0,0,8,8,0,24,8,8,8,8,8,56],
  "k": [0,0,16,16,16,20,24,28,20,22,0,0],
  "l": [0,0,24,8,8,8,8,8,8,14,0,0],
  "m": [0,0,0,0,0,62,42,42,42,42,0,0],
  "n": [0,0,0,0,0,30,18,18,18,18,0,0],
  "o": [0,0,0,0,0,12,18,18,18,12,0,0],
  "p": [0,0,0,0,0,28,18,18,18,28,16,16],
  "q": [0,0,0,0,0,14,18,18,18,14,2,2],
  "r": [0,0,0,0,0,30,16,16,16,16,0,0],
  "s": [0,0,0,0,0,30,16,28,2,30,0,0],
  "t": [0,0,0,0,8,30,8,8,8,14,0,0],
  "u": [0,0,0,0,0,18,18,18,18,30,0,0],
  "v": [0,0,0,0,0,18,18,18,12,12,0,0],
  "w": [0,0,0,0,0,34,42,54,20,20,0,0],
  "x": [0,0,0,0,0,18,12,12,12,18,0,0],
  "y": [0,0,0,0,0,18,30,12,12,12,8,24],
  "z": [0,0,0,0,0,30,6,12,24,30,0,0],
  "À": [16,8,0,12,12,12,18,18,30,18,0,0],
  "Á": [4,8,0,12,12,12,18,18,30,18,0,0],
  "Â": [12,18,0,12,12,12,18,18,30,18,0,0],
  "Ã": [10,20,0,12,12,12,18,18,30,18,0,0],
  "È": [16,8,0,30,16,16,30,16,16,30,0,0],
  "É": [4,8,0,30,16,16,30,16,16,30,0,0],
  "Ê": [24,20,0,30,16,16,30,16,16,30,0,0],
  "Ì": [16,8,0,28,8,8,8,8,8,28,0,0],
  "Í": [4,8,0,28,8,8,8,8,8,28,0,0],
  "Ò": [16,8,0,12,18,18,18,18,18,12,0,0],
  "Ó": [4,8,0,12,18,18,18,18,18,12,0,0],
  "Ô": [12,18,0,12,18,18,18,18,18,12,0,0],
  "Õ": [10,20,0,12,18,18,18,18,18,12,0,0],
  "Ù": [16,8,0,18,18,18,18,18,18,12,0,0],
  "Ú": [4,8,0,18,18,18,18,18,18,12,0,0],
  "Ý": [4,8,0,54,20,20,8,8,8,8,0,0],
  "à": [0,0,16,8,0,14,2,30,18,30,0,0],
  "á": [0,0,4,8,0,14,2,30,18,30,0,0],
  "â": [0,0,8,20,0,14,2,30,18,30,0,0],
  "ã": [0,0,10,20,0,14,2,30,18,30,0,0],
  "è": [0,0,16,8,0,12,18,30,16,14,0,0],
  "é": [0,0,4,8,0,12,18,30,16,14,0,0],
  "ê": [0,0,8,20,0,12,18,30,16,14,0,0],
  "ì": [0,0,16,8,0,24,8,8,8,62,0,0],
  "í": [0,0,4,8,0,24,8,8,8,62,0,0],
  "ò": [0,0,16,8,0,12,18,18,18,12,0,0],
  "ó": [0,0,4,8,0,12,18,18,18,12,0,0],
  "ô": [0,0,12,18,0,12,18,18,18,12,0,0],
  "õ": [0,0,10,20,0,12,18,18,18,12,0,0],
  "ù": [0,0,16,8,0,18,18,18,18,30,0,0],
  "ú": [0,0,4,8,0,18,18,18,18,30,0,0],
  "ý": [0,0,4,8,0,18,30,12,12,12,8,24],
  "Ă": [0,20,28,12,12,12,18,18,30,18,0,0],
  "ă": [0,0,0,28,0,14,2,30,18,30,0,0],
  "Đ": [0,0,0,28,18,18,58,18,18,28,0,0],
  "đ": [0,0,2,2,7,14,18,18,18,14,0,0],
  "Ĩ": [26,44,0,28,8,8,8,8,8,28,0,0],
  "ĩ": [0,0,10,20,0,24,8,8,8,62,0,0],
  "Ũ": [10,20,0,18,18,18,18,18,18,12,0,0],
  "ũ": [0,0,10,20,0,18,18,18,18,30,0,0],
  "Ơ": [0,0,13,18,18,18,18,18,12,0,0,0],
  "ơ": [0,0,0,0,13,18,18,18,12,0,0,0],
  "Ư": [0,0,19,18,18,18,18,18,12,0,0,0],
  "ư": [0,0,0,0,37,38,36,36,60,0,0,0],
  "Ạ": [0,0,0,12,12,12,18,18,30,18,0,8],
  "ạ": [0,0,0,0,0,14,2,30,18,30,0,8],
  "Ả": [8,4,0,12,12,12,18,18,30,18,0,0],
  "ả": [0,0,8,4,0,14,2,30,18,30,0,0],
  "Ấ": [12,18,0,12,12,12,18,18,30,18,0,0],
  "ấ": [0,0,8,20,0,14,2,30,18,30,0,0],
  "Ầ": [12,18,0,12,12,12,18,18,30,18,0,0],
  "ầ": [0,0,8,20,0,14,2,30,18,30,0,0],
  "Ẩ": [12,18,0,12,12,12,18,18,30,18,0,0],
  "ẩ": [0,0,8,20,0,14,2,30,18,30,0,0],
  "Ẫ": [12,18,0,12,12,12,18,18,30,18,0,0],
  "ẫ": [0,0,8,20,0,14,2,30,18,30,0,0],
  "Ậ": [24,20,0,12,12,12,18,18,30,18,0,8],
  "ậ": [0,0,8,20,0,14,2,30,18,30,0,8],
  "Ắ": [0,20,28,12,12,12,18,18,30,18,0,0],
  "ắ": [0,0,0,28,0,14,2,30,18,30,0,0],
  "Ằ": [16,8,20,28,12,12,18,18,30,18,0,0],
  "ằ": [0,16,8,28,0,14,2,30,18,30,0,0],
  "Ẳ": [0,20,28,12,12,12,18,18,30,18,0,0],
  "ẳ": [0,0,0,28,0,14,2,30,18,30,0,0],
  "Ẵ": [0,20,28,12,12,12,18,18,30,18,0,0],
  "ẵ": [0,0,0,28,0,14,2,30,18,30,0,0],
  "Ặ": [0,20,28,12,12,12,18,18,30,18,0,8],
  "ặ": [0,0,0,28,0,14,2,30,18,30,0,8],
  "Ẹ": [0,0,0,30,16,16,30,16,16,30,0,8],
  "ẹ": [0,0,0,0,0,12,18,30,16,14,0,8],
  "Ẻ": [8,4,0,30,16,16,30,16,16,30,0,0],
  "ẻ": [0,0,8,4,0,12,18,30,16,14,0,0],
  "Ẽ": [10,20,0,30,16,16,30,16,16,30,0,0],
  "ẽ": [0,0,10,20,0,12,18,30,16,14,0,0],
  "Ế": [24,20,0,30,16,16,30,16,16,30,0,0],
  "ế": [0,0,8,20,0,12,18,30,16,14,0,0],
  "Ề": [24,20,0,30,16,16,30,16,16,30,0,0],
  "ề": [0,0,8,20,0,12,18,30,16,14,0,0],
  "Ể": [24,20,0,30,16,16,30,16,16,30,0,0],
  "ể": [0,0,8,20,0,12,18,30,16,14,0,0],
  "Ễ": [24,20,0,30,16,16,30,16,16,30,0,0],
  "ễ": [0,0,8,20,0,12,18,30,16,14,0,0],
  "Ệ": [24,20,0,30,16,16,30,16,16,30,0,8],
  "ệ": [0,0,8,20,0,12,18,30,16,14,0,8],
  "Ỉ": [8,4,0,28,8,8,8,8,8,28,0,0],
  "ỉ": [0,0,8,8,0,24,8,8,8,62,0,0],
  "Ị": [0,0,0,28,8,8,8,8,8,28,0,8],
  "ị": [0,0,8,8,0,24,8,8,8,62,0,8],
  "Ọ": [0,0,0,12,18,18,18,18,18,12,0,8],
  "ọ": [0,0,0,0,0,12,18,18,18,12,0,8],
  "Ỏ": [8,4,0,12,18,18,18,18,18,12,0,0],
  "ỏ": [0,0,8,4,0,12,18,18,18,12,0,0],
  "Ố": [12,18,0,12,18,18,18,18,18,12,0,0],
  "ố": [0,0,12,18,0,12,18,18,18,12,0,0],
  "Ồ": [12,18,0,12,18,18,18,18,18,12,0,0],
  "ồ": [0,0,12,18,0,12,18,18,18,12,0,0],
  "Ổ": [12,18,0,12,18,18,18,18,18,12,0,0],
  "ổ": [0,0,12,18,0,12,18,18,18,12,0,0],
  "Ỗ": [12,18,0,12,18,18,18,18,18,12,0,0],
  "ỗ": [0,0,12,18,0,12,18,18,18,12,0,0],
  "Ộ": [24,20,0,12,18,18,18,18,18,12,0,8],
  "ộ": [0,0,8,20,0,12,18,18,18,12,0,8],
  "Ớ": [4,8,0,13,18,18,18,18,18,12,0,0],
  "ớ": [0,0,4,8,0,13,18,18,18,12,0,0],
  "Ờ": [16,8,0,13,18,18,18,18,18,12,0,0],
  "ờ": [0,0,16,8,0,13,18,18,18,12,0,0],
  "Ở": [0,0,0,13,18,18,18,18,18,12,0,0],
  "ở": [0,0,0,0,0,13,18,18,18,12,0,0],
  "Ỡ": [10,20,0,13,18,18,18,18,18,12,0,0],
  "ỡ": [0,0,10,20,0,13,18,18,18,12,0,0],
  "Ợ": [0,0,13,18,18,18,18,18,12,0,8,0],
  "ợ": [0,0,0,0,13,18,18,18,12,0,8,0],
  "Ụ": [0,0,0,18,18,18,18,18,18,12,0,8],
  "ụ": [0,0,0,0,0,18,18,18,18,30,0,8],
  "Ủ": [8,4,0,18,18,18,18,18,18,12,0,0],
  "ủ": [0,0,8,4,0,18,18,18,18,30,0,0],
  "Ứ": [8,16,0,19,18,18,18,18,18,12,0,0],
  "ứ": [0,0,8,16,0,37,38,36,36,60,0,0],
  "Ừ": [32,16,0,19,18,18,18,18,18,12,0,0],
  "ừ": [0,0,32,16,0,37,38,36,36,60,0,0],
  "Ử": [0,0,0,19,18,18,18,18,18,12,0,0],
  "ử": [0,0,0,0,0,37,38,36,36,60,0,0],
  "Ữ": [20,40,0,19,18,18,18,18,18,12,0,0],
  "ữ": [0,0,20,40,0,37,38,36,36,60,0,0],
  "Ự": [0,0,19,18,18,18,18,18,12,0,16,0],
  "ự": [0,0,0,0,37,38,36,36,60,0,16,0],
  "Ỳ": [16,8,0,54,20,20,8,8,8,8,0,0],
  "ỳ": [0,0,16,8,0,18,30,12,12,12,8,24],
  "Ỵ": [0,0,0,54,20,20,8,8,8,8,0,8],
  "ỵ": [0,0,0,0,0,18,30,12,12,12,8,28],
  "Ỷ": [8,4,0,54,20,20,8,8,8,8,0,0],
  "ỷ": [0,0,8,4,0,18,30,12,12,12,8,24],
  "Ỹ": [10,20,0,54,20,20,8,8,8,8,0,0],
  "ỹ": [0,0,10,20,0,18,30,12,12,12,8,24],
}
const VADV = 6
const VH = 12
const HERO_SAY = ["dậy làm đi mày!", "ngủ đủ chưa mày?", "lười vừa thôi!", "tới giờ cày rồi!", "đừng giả vờ ngủ!", "dậy mau, trả lương đó!", "ngủ hoài vậy cha nội?", "deadline tới đít rồi!", "ê dậy, việc chờ kìa!", "làm lẹ lên con!", "mặt trời lên cao rồi!", "dậy đi, tao thấy mày hé mắt!", "mơ gì mà ngủ lâu dữ?", "khách đang chờ kìa!", "ngáy to quá, dậy đi!", "mày ngủ là tao cực nha!", "việc mới tới, bật máy lên!", "đừng để tao hô lần nữa!", "cà phê nguội rồi, dậy!", "nghỉ xả hơi đủ rồi nha!", "dậy, sprint mới bắt đầu!", "tao đếm tới ba nè!"]
const CLAUDE_SAY = ["dậy làm đi mày!", "tụi bây ngủ đủ rồi!", "việc nè, đừng có than!", "đừng giả vờ ngủ nha!", "làm lẹ, tao đang chờ!", "ngủ nữa là mất lương!", "lười thì đi sửa bug!", "cày đi, đừng cãi tao!", "nhận việc đi nè!", "cái này gấp, nhờ nha!", "tới lượt mày đó!", "xong sớm tao thưởng!", "đừng có lướt web nha!", "nhanh tay, sếp đang nhìn!", "việc dễ ẹc, làm đi!", "tao tin mày mà!", "lẹ lẹ, kẹt deadline rồi!", "dậy, có task mới!"]
const CLAUDE_RECV_POOL = ["Gì nhiều việc vậy sếp", "Trời, lại việc nữa hả", "Dạ... em dậy rồi", "Ủa vừa mới chợp mắt mà", "Để em xem sao", "Việc gì mà gấp vậy", "Ơ... mấy giờ rồi sếp", "Dạ em làm ngay", "Cho em xin ly cà phê", "Lại tăng ca nữa à"]
const WORKER_RECV_POOL = ["má nhiều việc vậy", "trời ơi lại việc", "mới ngủ mà", "nhiều vậy trời", "thêm nữa hả trời", "đừng đánh thức tui", "việc gì nữa đây", "cho ngủ thêm xíu", "ôi mệt quá đi", "biết rồi, đang dậy"]
const WORKER_SHOUT_POOL = ["AAAAAH!", "GRAAAH!", "HAAAAA!", "UOOOOH!", "RAAAAH!", "TỚI LUÔN!"]
const CHAT_POOL = ["chát!", "bốp!", "chát!", "vút!", "chát!"]
const pickNot = (pool: string[], last: number) => {
  let i = Math.floor(Math.random() * pool.length)
  if (pool.length > 1 && i === last) i = (i + 1) % pool.length
  return i
}

// words wrap at `maxChars` characters per line
const wrapText = (t: string, maxChars: number): string[] => {
  const lines: string[] = []
  let cur = ''
  for (const w of t.split(' ')) {
    if (cur !== '' && cur.length + 1 + w.length > maxChars) {
      lines.push(cur)
      cur = w
    } else cur = cur === '' ? w : `${cur} ${w}`
  }
  if (cur !== '') lines.push(cur)
  return lines
}

// A speech bubble. Each word is its own group (classes wd, w0, w1...) so the stylesheet
// can pop them in one after another. Returns the markup.
const speech = (text: string, tailLeft: boolean, atX0: (w: number) => number, bottom0: number, scale = 1) => {
  const atX = (w: number) => atX0(w * scale) / scale
  const bottom = bottom0 / scale
  const lines = wrapText(text, Math.floor(11 / scale))
  const cols = Math.max(...lines.map(l => l.length))
  const W = cols * VADV - 1 + 6
  const H = lines.length * (VH + 1) + 3
  const x = atX(W)
  const y = bottom - 3 - H
  let out = bubbleCv(W, H, tailLeft).svg(x, y)
  let k = 0
  lines.forEach((line, i) => {
    let at = 0
    for (const word of line.split(' ')) {
      const c = new Cv(word.length * VADV, VH)
      ;[...word].forEach((ch, n) =>
        (VF[ch] ?? []).forEach((bits, row) => {
          for (let b = 0; b < VADV; b++) if ((bits >> (VADV - 1 - b)) & 1) c.set(n * VADV + b, row, '#1a1c2c')
        }),
      )
      out += `<g class="wd w${k}">${c.svg(x + 3 + at * VADV, y + 2 + i * (VH + 1))}</g>`
      at += word.length + 1
      k++
    }
  })
  return scale === 1 ? out : `<g transform="scale(${scale})">${out}</g>`
}

// a short, drawable summary of some text (a prompt, a task): the first few words
const brief = (text: string, maxWords: number, maxChars: number): string => {
  const clean = text
    .replace(/<([A-Za-z][\w-]*)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[`*_#>\[\]()"'{}|\\/]/g, ' ')
    .normalize('NFC')
  const first = clean.split(/\n|[.!?;](?:\s|$)/).map(x => x.trim()).find(x => x.length > 2) ?? ''
  const words = first.split(/\s+/).map(w => [...w].filter(ch => VF[ch] !== undefined).join('').slice(0, 11)).filter(w => w !== '')
  const out: string[] = []
  let len = 0
  for (const w of words) {
    if (out.length >= maxWords || len + w.length + 1 > maxChars) break
    out.push(w)
    len += w.length + 1
  }
  if (out.length === 0) return ''
  return out.join(' ') + (out.length < words.length ? '...' : '')
}
// a line made of an opener and a summary, kept within the 10 words a bubble can pop in
const fitN = (text: string, width = 11, maxLines = 3, maxWords = 10): string => {
  const ws = text.split(' ')
  while (ws.length > 1 && (wrapText(ws.join(' '), width).length > maxLines || ws.length > maxWords)) ws.pop()
  return ws.join(' ')
}
const fit3 = (text: string): string => fitN(text)
const joinSay = (head: string, tail: string): string => (tail === '' ? head : fit3(`${head} ${tail}`.trim()) === head.split(' ').slice(0, 10).join(' ') ? head : fit3(`${head} ${tail}`))
// the newest few words of a stream of thoughts, as a short line that fits a bubble
const TS_SCALE = 0.62 // thoughts are drawn smaller so a longer line fits
const TS_W = Math.floor(11 / TS_SCALE)
const tailWords = (text: string): string => {
  const clean = text
    .replace(/<([A-Za-z][\w-]*)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[`*_#>\[\]()"'{}|\\/<]/g, ' ')
    .normalize('NFC')
  const words = clean.split(/\s+/).map(w => [...w].filter(ch => VF[ch] !== undefined).join('').slice(0, 11)).filter(w => w !== '')
  const out: string[] = []
  for (let i = words.length - 1; i >= 0 && out.length < 12; i--) {
    out.unshift(words[i]!)
    if (wrapText(out.join(' '), TS_W).length > 4) {
      out.shift()
      break
    }
  }
  if (out.length === 0) return ''
  const lead = out.length < words.length ? '.. ' : ''
  while (out.length > 1 && wrapText(lead + out.join(' '), TS_W).length > 4) out.shift()
  return lead + out.join(' ')
}
const LIVE_TTL = 7000
// neighbouring AIs sit closer together than a bubble is wide, so only the one that spoke last shows its thoughts
const focusWorker = (): string => {
  let best = ''
  let t = -1
  for (const w of st.awake) {
    const v = Math.max(st.liveAt[w] ?? 0, st.sendAt[w] ?? 0)
    if (v > t) {
      t = v
      best = w
    }
  }
  return best
}
let lean = false // last resort when the scene is still too big: no thought bubbles
const liveText = (key: string): string => (lean ? '' : (st.liveAt[key] ?? 0) + LIVE_TTL > Date.now() ? st.live[key] ?? '' : '')
const staticWords = (markup: string) => markup.replace(/class="wd w\d+"/g, 'class="wk"')
const WORKER_NAME: Record<string, string> = { cx: 'Codex', ds: 'DeepSeek', gp: 'ChatGPT' }
const HAND_OPEN = ["ê", "nè", "này", "ơi", "cu ơi", "bồ ơi"]
const HAND_TAIL = ["làm giúp nha:", "lo vụ này:", "nhận việc:", "xử lý:", "cày vụ:"]
const DREAMS: Record<string, string[]> = {
  cl: ["zzz... 5 phút nữa thôi...", "mơ thấy hết bug rồi...", "đừng gọi em, sếp...", "token ơi đừng hết...", "em chưa commit mà..."],
  cx: ["mơ thấy code sạch...", "git push... zzz", "đừng merge vội...", "build xanh hết rồi..."],
  ds: ["vòi nước đâu rồi...", "mơ bơi trong dữ liệu...", "bơi... bơi... zzz", "phun nước lên mây..."],
  gp: ["xin lỗi, tôi là AI...", "để tui nghĩ thêm xíu...", "mơ được tăng lương...", "prompt dài quá..."],
  hero: ["chán quá, ai làm gì đi...", "roi ngứa tay rồi nè...", "tụi này ngủ hoài vậy...", "uống ngụm cà phê cái...", "hôm nay êm ghê..."],
}
const PRAISE = ["giỏi lắm, tụi bây!", "xong sớm, thưởng nè!", "tạm được đó nha!", "hôm nay cày ngon!", "nghỉ được rồi đó!", "làm tốt, mai tiếp nha!"]
const THINK_VERB = ["đang làm:", "xử lý:", "để tui lo:", "ok, làm:", "tui làm:"]

const SPARK = new Cv(5, 5)
;[[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4]].forEach(([x, y]) => SPARK.set(x!, y!, '#ffd45e'))
const VEIN = new Cv(5, 5)
;[[0, 0], [1, 1], [4, 0], [3, 1], [0, 4], [1, 3], [4, 4], [3, 3]].forEach(([x, y]) => VEIN.set(x!, y!, '#ff4d4d'))
const QMARK = new Cv(5, 7)
;[[1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [3, 3], [2, 3], [2, 4], [2, 6]].forEach(([x, y]) => QMARK.set(x!, y!, '#ffffff'))
const ZZZ = new Cv(5, 5)
;[[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [2, 2], [1, 3], [0, 4], [1, 4], [2, 4], [3, 4]].forEach(([x, y]) => ZZZ.set(x!, y!, '#c8cae0'))
const HEART = new Cv(9, 8)
;['.RR...RR.', 'RRRR.RRRR', 'RRRRRRRRR', 'RRRRRRRRR', '.RRRRRRR.', '..RRRRR..', '...RRR...', '....R....'].forEach((row, y) =>
  [...row].forEach((ch, x) => {
    if (ch === 'R') HEART.set(x, y, y < 2 && x < 4 ? '#ff8aa0' : '#ff4f72')
  }),
)
const CHECK = bubbleCv(13, 12, false)
;[[3, 5], [4, 6], [5, 7], [6, 6], [7, 5], [8, 4], [9, 3]].forEach(([x, y]) => {
  CHECK.rect(x!, y!, 2, 1, '#2fb35a')
})

// ---------- the person ----------
// Several chibi people take turns: the one that turns up depends on what the prompt is about.
type Look = {
  id: string
  hair: string
  top: string
  topD: string
  pants: string
  pantsD: string
  shoe: string
  hat: 'none' | 'hard' | 'chef' | 'cap' | 'beret'
  hatCol: string
  glasses: boolean
  bib: 'none' | 'overall' | 'apron' | 'vest' | 'smock' | 'cardigan'
  weapon: 'whip' | 'wrench' | 'ruler' | 'pan' | 'gun' | 'brush'
  hits: string[]
  says: string[]
  kw: RegExp | null
}
const LOOKS: Look[] = [
  { id: 'whip', hair: '#15151c', top: '#2f3d7c', topD: '#252f66', pants: '#4b5799', pantsD: '#3c477f', shoe: '#f4f4f4', hat: 'none', hatCol: '', glasses: false, bib: 'none', weapon: 'whip', hits: ['chát!', 'bốp!', 'chát!', 'vút!'], says: [], kw: null },
  { id: 'mech', hair: '#3a2a1c', top: '#e6e1d0', topD: '#cfc9b6', pants: '#e07a1f', pantsD: '#b85e12', shoe: '#5a4a3a', hat: 'hard', hatCol: '#ffcc33', glasses: false, bib: 'overall', weapon: 'wrench', hits: ['keng!', 'boong!', 'cạch!'], says: ["để tao vặn ốc mày!", "máy hư thì đập là hết!", "dậy, có bug cần sửa!", "mày hỏng rồi, vặn cái nè!"], kw: /bug|lỗi|fix|sửa|error|crash|debug|hỏng|fail|exception|traceback/i },
  { id: 'teach', hair: '#5a3a24', top: '#8a5a3c', topD: '#6e4529', pants: '#3b3f55', pantsD: '#2d3044', shoe: '#2a2020', hat: 'none', hatCol: '', glasses: true, bib: 'cardigan', weapon: 'ruler', hits: ['bốp!', 'cạch!', 'chát!'], says: ["chép phạt 100 lần nè!", "đưa tay ra cô đánh!", "dậy học bài, mau!", "không thuộc bài là ăn thước!"], kw: /giải thích|explain|học|dạy|tài liệu|docs?\b|readme|viết|dịch|translate|vì sao|tại sao|why\b|how\b/i },
  { id: 'chef', hair: '#2a2a33', top: '#f2f2f2', topD: '#d6d9e2', pants: '#3a3d4c', pantsD: '#2c2f3c', shoe: '#222', hat: 'chef', hatCol: '#ffffff', glasses: false, bib: 'apron', weapon: 'pan', hits: ['xoảng!', 'boong!', 'keng!'], says: ["dậy, bếp nóng rồi!", "dọn cho sạch nha mày!", "chảo này có tên mày đó!", "trộn gọn lại cho tao!"], kw: /refactor|dọn|clean|tối ưu|optimi[sz]e|nấu|gọn|format|lint/i },
  { id: 'ranger', hair: '#23202a', top: '#3f7a4f', topD: '#2f5f3c', pants: '#5a5a48', pantsD: '#444436', shoe: '#2a2a22', hat: 'cap', hatCol: '#d33a3a', glasses: false, bib: 'vest', weapon: 'gun', hits: ['pằng!', 'píu!', 'pằng!'], says: ["đứng yên, tao bắn nha!", "dậy, deadline đuổi tới rồi!", "giơ tay lên, đi làm!", "lên đạn, cày thôi!"], kw: /deploy|release|security|bảo mật|gấp|urgent|asap|deadline|prod\b|build|ship|push/i },
  { id: 'artist', hair: '#6b3a8c', top: '#f1efe8', topD: '#d8d4c6', pants: '#2f6f8f', pantsD: '#235874', shoe: '#e8e8e8', hat: 'beret', hatCol: '#7a4bd0', glasses: false, bib: 'smock', weapon: 'brush', hits: ['xẹt!', 'bẹt!', 'xẹt!'], says: ["dậy tô màu cho đời nè!", "mặt mày cần thêm sơn!", "tao vẽ râu cho mày nha!", "nghệ thuật đòi hỏi kỷ luật!"], kw: /\bui\b|giao diện|design|thiết kế|css|màu|layout|style|font|nút|button|icon|ảnh|image/i },
]
const LOOK_ORDER = ['ranger', 'mech', 'artist', 'chef', 'teach']
const pickLook = (text: string): Look => {
  for (const id of LOOK_ORDER) {
    const l = LOOKS.find(x => x.id === id)!
    if (l.kw !== null && l.kw.test(text)) return l
  }
  const bag = [...LOOKS, LOOKS[0]!] // the classic whip-wielder turns up a bit more often
  return bag[Math.floor(Math.random() * bag.length)]!
}
const INK = '#1a1420'
const SK = '#f4c9a4'
const SKD = '#e0aa82'
const CXH = 17
const OY = 8

const limb = (c: Cv, pts: [number, number][], thick: number, col: string, sleeve = 0, sleeveCol = '#2f3d7c') => {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!
    const [x1, y1] = pts[i + 1]!
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let s = 0; s <= n; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / n)
      const y = Math.round(y0 + ((y1 - y0) * s) / n)
      const isSleeve = i === 0 && s <= sleeve
      c.rect(x - Math.floor(thick / 2), y - Math.floor(thick / 2), thick, thick, isSleeve ? sleeveCol : col)
    }
  }
}

const heroHead = (dx: number, look: number, L: Look) => {
  const c = new Cv(34, 26)
  const cx = CXH + dx
  const cy = OY + 6
  const HAIR = L.hair
  c.each((x, y) => {
    const u = (x + 0.5 - cx) / 9.5
    const v = (y + 0.5 - cy) / 9
    return u * u + v * v <= 1 ? SK : undefined
  })
  c.rect(Math.round(cx) - 11, cy + 1, 2, 4, SK)
  c.rect(Math.round(cx) + 9, cy + 1, 2, 4, SK)
  // hair: a cap, a side-swept fringe and (without a hat) a few spikes
  c.each((x, y) => {
    const u = (x + 0.5 - cx) / 10.5
    const v = (y + 0.5 - (cy - 1)) / 10
    if (u * u + v * v > 1) return undefined
    const fringe = cy - 3 + Math.round((x - cx) * 0.22)
    const side = Math.abs(x + 0.5 - cx) > 8 && y < cy + 1
    return y < fringe || side ? HAIR : undefined
  })
  if (L.hat === 'none') {
    for (const [x, y, w, h] of [[-6, -10, 3, 3], [-2, -12, 3, 4], [2, -11, 3, 3], [6, -9, 2, 3]] as const) c.rect(Math.round(cx) + x, cy + y, w, h, HAIR)
    c.rect(Math.round(cx) - 4, cy - 8, 5, 1, '#34344a')
  }
  const ex = Math.round(cx + look)
  for (const x of [ex - 5, ex + 3]) {
    c.rect(x - 1, cy - 1, 4, 1, HAIR)
    c.rect(x, cy + 1, 2, 3, INK)
  }
  c.rect(ex - 6, cy + 5, 2, 1, '#f1b9a0')
  c.rect(ex + 4, cy + 5, 2, 1, '#f1b9a0')
  c.set(ex - 2, cy + 6, '#a8543f')
  c.rect(ex - 1, cy + 7, 3, 1, '#a8543f')
  c.set(ex + 2, cy + 6, '#a8543f')
  c.rect(Math.round(cx) - 3, cy + 9, 6, 1, SKD)
  const X = Math.round(cx)
  if (L.glasses) {
    for (const lx of [ex - 7, ex + 1]) {
      c.rect(lx, cy - 2, 6, 1, '#2a2a33')
      c.rect(lx, cy + 3, 6, 1, '#2a2a33')
      c.rect(lx, cy - 2, 1, 6, '#2a2a33')
      c.rect(lx + 5, cy - 2, 1, 6, '#2a2a33')
    }
    c.rect(ex - 1, cy, 2, 1, '#2a2a33')
  }
  if (L.hat === 'hard') {
    c.rect(X - 8, cy - 8, 16, 4, L.hatCol)
    c.rect(X - 6, cy - 11, 12, 3, L.hatCol)
    c.rect(X - 11, cy - 4, 22, 2, '#e0a800')
    c.rect(X - 1, cy - 11, 2, 7, '#e0a800')
  } else if (L.hat === 'chef') {
    c.rect(X - 8, cy - 8, 16, 3, L.hatCol)
    c.rect(X - 8, cy - 13, 16, 5, L.hatCol)
    c.rect(X - 5, cy - 14, 10, 1, L.hatCol)
    c.rect(X - 8, cy - 6, 16, 1, '#dfe3ee')
    c.rect(X - 3, cy - 12, 1, 4, '#dfe3ee')
    c.rect(X + 3, cy - 12, 1, 4, '#dfe3ee')
  } else if (L.hat === 'cap') {
    c.rect(X - 9, cy - 8, 18, 5, L.hatCol)
    c.rect(X - 6, cy - 10, 12, 2, L.hatCol)
    c.rect(X - 1, cy - 4, 13, 2, '#a82020')
  } else if (L.hat === 'beret') {
    c.rect(X - 10, cy - 8, 17, 3, L.hatCol)
    c.rect(X - 8, cy - 10, 14, 2, L.hatCol)
    c.rect(X - 2, cy - 12, 3, 2, L.hatCol)
    c.rect(X - 9, cy - 5, 14, 1, '#5a36a8')
  }
  return c
}

const heroTorso = (L: Look) => {
  const c = new Cv(34, 52)
  const t = OY + 15
  c.rect(CXH - 3, t - 2, 6, 4, SKD)
  c.rect(CXH - 8, t + 2, 16, 1, L.top)
  c.rect(CXH - 7, t + 2, 14, 12, L.top)
  c.rect(CXH - 8, t + 3, 16, 10, L.top)
  c.rect(CXH + 3, t + 3, 5, 10, L.topD)
  c.rect(CXH - 7, t + 13, 14, 1, L.topD)
  c.rect(CXH - 3, t + 2, 6, 1, '#e4e8ff')
  c.rect(CXH - 2, t + 3, 4, 1, '#e4e8ff')
  c.rect(CXH - 1, t + 4, 2, 1, '#e4e8ff')
  if (L.bib === 'none') {
    c.rect(CXH, t + 5, 1, 6, '#1b2350')
    c.set(CXH - 1, t + 6, '#e4e8ff')
    c.set(CXH - 1, t + 9, '#e4e8ff')
  } else if (L.bib === 'overall') {
    c.rect(CXH - 6, t + 6, 12, 8, L.pants)
    c.rect(CXH - 6, t + 2, 2, 5, L.pants)
    c.rect(CXH + 4, t + 2, 2, 5, L.pants)
    c.rect(CXH - 3, t + 8, 6, 3, L.pantsD)
    c.set(CXH - 5, t + 6, '#ffd45e')
    c.set(CXH + 4, t + 6, '#ffd45e')
  } else if (L.bib === 'apron') {
    c.rect(CXH - 6, t + 5, 12, 9, '#fafafa')
    c.rect(CXH - 4, t + 8, 8, 3, '#e4e7ef')
    c.rect(CXH - 1, t + 3, 2, 3, '#fafafa')
  } else if (L.bib === 'vest') {
    c.rect(CXH - 7, t + 3, 5, 10, '#2f5f3c')
    c.rect(CXH + 2, t + 3, 5, 10, '#2f5f3c')
    c.rect(CXH - 6, t + 8, 3, 3, '#244a2f')
    c.rect(CXH + 3, t + 8, 3, 3, '#244a2f')
    c.rect(CXH, t + 4, 1, 9, '#e4e8ff')
  } else if (L.bib === 'smock') {
    for (const [x, y, col] of [[-5, 5, '#ff4f72'], [2, 8, '#4fc3ff'], [-2, 11, '#ffd45e'], [4, 4, '#7bd88f']] as const) c.rect(CXH + x, t + y, 2, 2, col)
  } else {
    c.rect(CXH - 1, t + 4, 2, 9, '#e4e8ff')
    c.rect(CXH - 6, t + 10, 4, 3, L.topD)
    c.rect(CXH + 2, t + 10, 4, 3, L.topD)
  }
  return c
}

const heroLegs = (stance: 'close' | 'wide', lift: 'L' | 'R' | null, L: Look) => {
  const c = new Cv(34, 52)
  const top = OY + 29
  const gap = stance === 'wide' ? 4 : 0
  const lx = CXH - 7 - gap / 2
  const rx = CXH + 2 + gap / 2
  const draw = (x: number, up: number) => {
    c.rect(x, top, 5, 6 - up, L.pants)
    c.rect(x + 3, top, 2, 6 - up, L.pantsD)
    c.rect(x - 1, top + 6 - up, 7, 2, INK)
    c.rect(x - 1, top + 7 - up, 7, 1, L.shoe)
  }
  draw(Math.round(lx), lift === 'L' ? 2 : 0)
  draw(Math.round(rx), lift === 'R' ? 2 : 0)
  return c
}

type Pose = 'A' | 'B' | 'R' | 'W1' | 'W2' | 'W3'
const heroArms = (pose: Pose, L: Look) => {
  const c = new Cv(40, 52)
  const ls = [CXH - 8, OY + 18] as [number, number]
  const rs = [CXH + 8, OY + 18] as [number, number]
  const hand = (x: number, y: number) => {
    c.rect(x - 1, y - 1, 3, 3, SK)
    c.rect(x, y, 2, 2, SKD)
  }
  const arm = (pts: [number, number][]) => limb(c, pts, 3, SK, 3, L.top)
  if (pose === 'A' || pose === 'B') {
    const up = pose === 'A' ? ls : rs
    const dn = pose === 'A' ? rs : ls
    const s = pose === 'A' ? -1 : 1
    arm([up, [up[0] + s * 6, up[1]], [up[0] + s * 6, up[1] - 8]])
    hand(up[0] + s * 6, up[1] - 10)
    arm([dn, [dn[0] - s * 6, dn[1]], [dn[0] - s * 6, dn[1] + 8]])
    hand(dn[0] - s * 6, dn[1] + 9)
  } else if (pose === 'R') {
    arm([ls, [ls[0] - 2, ls[1] + 9]])
    arm([rs, [rs[0] + 2, rs[1] + 9]])
    hand(ls[0] - 2, ls[1] + 10)
    hand(rs[0] + 2, rs[1] + 10)
  } else {
    arm([ls, [ls[0] - 4, ls[1] + 4], [ls[0] + 1, ls[1] + 8]])
    hand(ls[0] + 2, ls[1] + 9)
    if (pose === 'W1') {
      arm([rs, [rs[0] + 4, rs[1] - 8], [rs[0] + 5, rs[1] - 17]])
      hand(rs[0] + 5, rs[1] - 19)
    } else if (pose === 'W2') {
      arm([rs, [rs[0] + 5, rs[1] - 6], [rs[0] + 8, rs[1] - 14]])
      hand(rs[0] + 8, rs[1] - 16)
    } else {
      arm([rs, [rs[0] + 8, rs[1] - 1]])
      hand(rs[0] + 9, rs[1] - 1)
    }
  }
  return c
}

const HX = 1
const HY = 47 // the shoes end 45 rows below the top of the person's sprite, so this puts them on the ground (GH = 92)
const heroPose = (pose: Pose, L: Look) => {
  const wide = pose === 'W1' || pose === 'W2' || pose === 'W3'
  const dx = pose === 'A' ? -1 : pose === 'B' ? 1 : 0
  const look = pose === 'A' ? -1 : pose === 'B' ? 1 : wide ? 1 : 0
  const lift = pose === 'A' ? 'L' : pose === 'B' ? 'R' : null
  return [heroLegs(wide ? 'wide' : 'close', lift, L), heroTorso(L), heroArms(pose, L), heroHead(dx, look, L)].map(c => c.svg(HX, HY)).join('')
}
// where the weapon is held in each pose, in left-group coordinates
const HAND: Record<'W1' | 'W2' | 'W3', [number, number]> = {
  W1: [HX + CXH + 14, HY + OY - 3],
  W2: [HX + CXH + 17, HY + OY],
  W3: [HX + CXH + 19, HY + OY + 17],
}

// the things people hit Claude's friends with: the grip is at x = 0, the business end points right
const weaponCv = (kind: Look['weapon']): Cv => {
  if (kind === 'wrench') {
    const c = new Cv(18, 8)
    c.rect(0, 3, 13, 2, '#9aa3b5')
    c.rect(12, 1, 5, 2, '#9aa3b5')
    c.rect(12, 5, 5, 2, '#9aa3b5')
    c.rect(12, 3, 2, 2, '#9aa3b5')
    c.rect(1, 3, 6, 1, '#c7cfde')
    c.edge('#434b5e')
    return c
  }
  if (kind === 'ruler') {
    const c = new Cv(20, 5)
    c.rect(0, 1, 19, 3, '#ffd45e')
    for (let x = 2; x < 19; x += 3) c.rect(x, 1, 1, 2, '#9a6b00')
    c.edge('#6e4c00')
    return c
  }
  if (kind === 'pan') {
    const c = new Cv(20, 12)
    c.rect(0, 5, 10, 2, '#5a4632')
    c.each((x, y) => (Math.hypot(x - 14.5, y - 5.5) <= 5.2 ? '#2c2c36' : undefined))
    c.rect(11, 2, 3, 1, '#5b5b6c')
    c.edge('#15151c')
    return c
  }
  if (kind === 'gun') {
    const c = new Cv(18, 11)
    c.rect(0, 2, 10, 4, '#58d6ee')
    c.rect(1, 6, 3, 5, '#34425c')
    c.rect(10, 3, 5, 2, '#cfd8e8')
    c.rect(15, 3, 1, 2, '#ff4d6d')
    c.rect(3, 3, 4, 1, '#d9fbff')
    c.edge('#1e2a40')
    return c
  }
  const c = new Cv(20, 6) // brush
  c.rect(0, 2, 13, 2, '#c58b52')
  c.rect(13, 2, 2, 2, '#d0d0d8')
  c.rect(15, 1, 4, 4, '#ff4f72')
  c.rect(18, 2, 1, 2, '#ff9bb2')
  c.edge('#5a3a20')
  return c
}
const WANGLE = { W1: -130, W2: -55, W3: 14 } as const
const GANGLE = { W1: -50, W2: -28, W3: 0 } as const

// ---------- scene pieces ----------
const FLOOR = 72 // the ground line; every character stands on it
const GH = 92 // height of both character groups (their bottom edge is the floor; the top is headroom for three-line speech bubbles)
const LW = 72 // left group: the person, then Claude's bed
const RW = 90 // right group: Codex, DeepSeek and ChatGPT, side by side
const KD = 0.5 // design scale (root units per local unit)

// The scene is laid out for 16:9. Other window shapes are handled by CSS inside the
// scene itself: it reads its own box (@media aspect-ratio), works out which part of the
// 160x90 stage is visible, and moves/scales the groups (.Lg left, .Rg right, .Gr/.Gf
// ground) so the characters hug the edges, stay clear of the chat column and keep
// their feet above the message box.
const placeFor = (a: number) => {
  const visW = Math.min(160, 90 * a)
  const x0 = (160 - visW) / 2
  const visH = Math.min(90, 160 / a)
  const f = Math.min(1, visH / 90) * Math.min(1, (visW * 0.26 * 0.98) / (Math.max(LW, RW) * KD))
  const K = KD * f
  const fl = 90 - 18 * (visH / 90)
  const edge = visW * 0.01
  const sc = f.toFixed(3)
  return `.Lg{transform:translate(${(x0 + edge).toFixed(1)}px,${(fl - GH * K).toFixed(1)}px) scale(${sc})}.Rg{transform:translate(${(x0 + visW - edge - RW * K).toFixed(1)}px,${(fl - GH * K).toFixed(1)}px) scale(${sc})}.Gr,.Gf{transform:translateY(${(fl - FLOOR).toFixed(1)}px)}.Mn{transform:translateY(${(90 - visH).toFixed(1)}px)}`
}
const bucketCss = () => {
  const out = [placeFor(16 / 9)]
  for (let i = 6; i <= 30; i += 2) {
    const a = (i + 1) / 10
    out.push(`@media (min-aspect-ratio:${Math.round((a - 0.1) * 100)}/100) and (max-aspect-ratio:${Math.round((a + 0.1) * 100)}/100){${placeFor(a)}}`)
  }
  return out.join('\n')
}

const poly = (W: number, H: number, pts: [number, number][], col: string) => {
  const c = new Cv(W, H)
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!
    const [x1, y1] = pts[i + 1]!
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let s = 0; s <= n; s++) c.set(x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, col)
  }
  return c
}

// ---------- extra props for the story ----------
// Super Saiyan style: a flickering golden aura (two frames), golden spiky hair and blue sparks
const auraCv = (w: number, h: number, ph: number) => {
  const c = new Cv(w, h)
  c.each((x, y) => {
    const u = (x + 0.5 - w / 2) / (w / 2)
    const spike = 0.6 + 0.4 * Math.abs(Math.sin((x + ph * 2.5) * 0.75))
    const reach = h * spike * (1 - 0.55 * Math.abs(u) ** 1.4)
    const up = h - y
    if (up > reach) return undefined
    const core = 1 - Math.abs(u)
    return up / Math.max(1, reach) > 0.72 ? '#ffe45e' : core > 0.45 ? '#fff2a8' : '#ffb21e'
  })
  return c
}
const spikesCv = (w: number) => {
  const c = new Cv(w, 11)
  const xs = [0.12, 0.3, 0.5, 0.7, 0.88]
  const hs = [7, 10, 11, 10, 7]
  xs.forEach((fx, i) => {
    const h = hs[i]!
    for (let y = 11 - h; y < 11; y++) {
      const half = ((y - (11 - h)) / h) * 3.2
      for (let x = Math.round(w * fx - half); x <= Math.round(w * fx + half); x++) c.set(x, y, '#ffe14a')
    }
  })
  c.edge('#f0a000')
  return c
}
const boltCv = (w: number, h: number, ph: number) => {
  const c = new Cv(w, h)
  const zig = (x0: number) => {
    let x = x0
    for (let y = 0; y < h; y += 2) {
      x += ((y / 2 + ph) % 2 === 0 ? 1 : -1) * 2
      c.rect(x, y, 2, 2, '#9fe3ff')
      c.set(x, y, '#ffffff')
    }
  }
  zig(2)
  zig(w - 5)
  return c
}
const HIT = new Cv(13, 13)
HIT.each((x, y) => {
  const u = x + 0.5 - 6.5
  const v = y + 0.5 - 6.5
  return Math.hypot(u, v) <= 3.2 + 3 * Math.abs(Math.cos(2 * Math.atan2(v, u))) ? '#ffe066' : undefined
})
HIT.edge('#ffffff')
const ringCv = (r: number) => {
  const c = new Cv(2 * r + 3, 2 * r + 3)
  c.each((x, y) => (Math.abs(Math.hypot(x - r - 1, y - r - 1) - r) < 0.75 ? '#fff2a8' : undefined))
  return c
}
const burstText = (text: string) => {
  const w = text.length * VADV - 1 + 14
  const h = VH + 14
  const c = new Cv(w, h)
  c.each((x, y) => {
    const u = (x + 0.5 - w / 2) / (w / 2)
    const v = (y + 0.5 - h / 2) / (h / 2)
    return Math.hypot(u, v) <= 0.62 + 0.38 * Math.abs(Math.cos(5 * Math.atan2(v, u))) ? '#ffe066' : undefined
  })
  c.edge('#ff7a1a')
  ;[...text].forEach((ch, n) =>
    (VF[ch] ?? []).forEach((bits, row) => {
      for (let b = 0; b < VADV; b++) if ((bits >> (VADV - 1 - b)) & 1) c.set(7 + n * VADV + b, 7 + row, '#b3261e')
    }),
  )
  return c
}
const PAPER = new Cv(12, 15)
PAPER.rect(0, 0, 12, 15, '#fbfbff')
PAPER.rect(8, 0, 4, 4, '#d0d4ee')
PAPER.rect(0, 0, 12, 1, '#c3c8e6')
PAPER.rect(0, 14, 12, 1, '#c3c8e6')
PAPER.rect(0, 0, 1, 15, '#c3c8e6')
PAPER.rect(11, 4, 1, 11, '#c3c8e6')
for (const y of [6, 8, 10, 12]) PAPER.rect(2, y, 8, 1, '#8a8fb0')
PAPER.rect(2, 3, 4, 2, '#e5484d')
const thinkBubble = () => {
  const c = bubbleCv(19, 9, true)
  return c.svg(0, 0)
}

// ---------- one slot ----------
// slotSleep: a bed with its sleeper under a blanket (always drawn).
// slotAwake: the creature that wakes (drawn only while it is up): it is hit on the head by a
// task letter, goes Super Saiyan, then sits at a desk reading it (Claude: holds a tablet) and
// finally works on a laptop.
const slotSleep = (c: Creature, B: number, bx: number) => {
  const lying = c.lying()
  const ly = B - 8 - lying.h + 1
  const lyX = bx + 4
  const bStart = lyX + Math.round(lying.w / 2)
  const bl = blanketCv(c.q, c.r, bx + 26 - bStart + 1)
  return `<g class="bed bed-${c.id}">${bedCv().svg(bx, B - 14)}</g>
<g class="${c.id}-sl"><g class="breath">${lying.svg(lyX, ly)}${bl.svg(bStart, B - 3 - bl.h)}</g>
<g class="zz zz1">${ZZZ.svg(bx + 6, B - 31)}</g><g class="zz zz2">${ZZZ.svg(bx + 12, B - 36)}</g></g>`
}

const workerBubbles = (c: Creature, bubX: (w: number) => number, bubTop: number): string => `<g class="shout shout-${c.id}">${speech(WORKER_SHOUT_POOL[(st.wShout[c.id] ?? 0) % WORKER_SHOUT_POOL.length]!, true, bubX, bubTop)}</g><g class="wsay wsay-${c.id}">${speech(WORKER_RECV_POOL[(st.wRecv[c.id] ?? 0) % WORKER_RECV_POOL.length]!, true, bubX, bubTop)}</g>${!lean && focusWorker() === c.id && (liveText(c.id) !== '' || st.wTask[c.id]) ? `<g class="think think-${c.id}">${staticWords(speech(liveText(c.id) !== '' ? liveText(c.id) : fitN(`${THINK_VERB[(st.wVerb[c.id] ?? 0) % THINK_VERB.length]} ${st.wTask[c.id]}`, TS_W, 4, 12), true, bubX, bubTop, TS_SCALE))}</g>` : ''}`
const awakeCache = new Map<string, string>()
const slotAwake = (c: Creature, B: number, ax: number, bx: number, gw: number) => {
  const key = `${c.id}|${B}|${ax}|${bx}|${gw}`
  const bubX = (w: number) => Math.max(0, Math.min(gw - w, bx + 15 - Math.round(w / 2)))
  const bubTop = B - 46
  const fresh = (t: string) => (c.id === 'cl' ? t : t.replace('@@BUB@@', () => workerBubbles(c, bubX, bubTop)))
  const hit0 = awakeCache.get(key)
  if (hit0 !== undefined) return fresh(hit0)
  const A = c.awake('awake')
  const D = c.awake('dazed')
  const ay = B - A.h
  const cx = ax + Math.round(A.w / 2)
  const lap = laptopCv().svg(cx - 10, B - 22)
  const worker = c.id !== 'cl'
  const hit = HIT.svg(cx - 6, ay - 9) + [[-16, -4], [12, -6], [-13, 5], [10, 7]].map(([dx, dy]) => SPARK.svg(cx + dx! - 2, ay + dy!)).join('')
  const au = [0, 1].map(i => `<g class="ar${i}">${auraCv(A.w + 12, A.h + 12, i).svg(ax - 6, B - A.h - 12)}</g>`).join('')
  const bolts = [0, 1].map(i => `<g class="ar${i}">${boltCv(A.w + 18, A.h + 8, i).svg(ax - 9, ay - 4)}</g>`).join('')
  const out = `<g class="${c.id}-aw"><g class="aura aura-${c.id}">${au}</g><g class="jmp"><g class="sit"><g class="chairb">${chairBackCv().svg(cx - 13, ay - 1)}</g><g class="nm bob">${A.svg(ax, ay)}</g><g class="dz wob">${diffCv(A, D).svg(ax, ay)}${QMARK.svg(cx - 2, ay - 9)}</g><g class="rdw"><g class="rd">${A.svg(ax, ay, '#ff4d4d')}</g></g><g class="paper paper-${c.id}">${PAPER.svg(cx - 6, ay + 5)}</g><g class="ssj ssj-${c.id}">${spikesCv(A.w).svg(ax, ay - 9)}${bolts}</g></g></g>
<g class="desk desk-${c.id}">${deskCv().svg(ax - 4, B - 14)}<g class="lap">${lap}</g><g class="hand h1"><path fill="${c.hand}" d="M${cx - 7} ${B - 25}h4v3h-4z"/></g><g class="hand h2"><path fill="${c.hand}" d="M${cx + 3} ${B - 25}h4v3h-4z"/></g></g>
<g class="hit hit-${c.id}">${hit}</g><g class="vein">${VEIN.svg(cx + 8, ay - 3)}</g><g class="stm stm1"><path fill="#e8ecff" d="M${cx - 6} ${ay - 2}h3v3h-3z"/></g><g class="stm stm2"><path fill="#e8ecff" d="M${cx + 3} ${ay - 5}h3v3h-3z"/></g>
${
  worker
    ? `@@BUB@@<g class="spk spk-${c.id}">${SPARK.svg(bx + 21, B - 34)}</g>`
    : `<g class="tab"><g class="tshake">${tabletCv().svg(ax + A.w - 8, ay + 3)}<g class="ping"><path fill="#ff4d4d" d="M${ax + A.w + 1} ${ay + 4}h2v2h-2z"/></g></g></g>`
}
</g>
<g class="pk pk-${c.id}-in">${envCv('#ffd988', '#8a5a1c').svg(cx - 5, ay - 4)}</g><g class="pk pk-${c.id}-out">${envCv('#8fe3ac', '#1b5a34').svg(cx - 5, ay - 4)}</g>`
  awakeCache.set(key, out)
  return fresh(out)
}

// ---------- the two groups ----------
const CSX = 38 // Claude's bed x (Claude stands at CSX + 4)

const whipPts = (pose: 'W1' | 'W2' | 'W3'): [number, number][] => {
  const [hx, hy] = HAND[pose]
  if (pose === 'W1') return [[hx, hy], [hx - 4, hy - 5], [hx - 12, hy - 8], [hx - 20, hy - 6], [hx - 24, hy]]
  if (pose === 'W2') return [[hx, hy], [hx + 4, hy - 6], [hx + 11, hy - 8], [hx + 15, hy - 5], [hx + 17, hy + 1]]
  return [[hx, hy], [hx + 8, hy - 2], [CSX + 14, GH - 16]]
}

// what is always drawn on the left: the dancing person (three poses) and Claude's bed
const leftStatic = (L: Look) => {
  const poses: Pose[] = ['A', 'B', 'R']
  return `${slotSleep(CAST[0]!, GH, CSX)}
${poses.map(p => `<g class="p${p}">${heroPose(p, L)}</g>`).join('')}
<g class="heart">${HEART.svg(HX + CXH - 4, HY - 6)}</g><g class="cbub">${CHECK.svg(CSX + 18, GH - 44)}</g>`
}
const whipCache: Record<string, string> = {}
// drawn only while the prompt is being whipped in: the three striking poses, the weapon, and what it does to Claude's bed
const whipExtras = (L: Look) => {
  if (whipCache[L.id] === undefined) {
    const tx = CSX + 14
    const ty = GH - 18
    const sparks = [[0, -6], [-9, -3], [9, -3], [-6, 5], [6, 5]].map(([dx, dy]) => SPARK.svg(tx + dx! - 2, ty + dy!)).join('')
    const rings = [5, 9, 13].map((r, i) => `<g class="ring ring${i}">${ringCv(r).svg(tx - r - 1, ty - r - 1)}</g>`).join('')
    const streaks = new Cv(LW, GH)
    if (L.weapon === 'whip' || L.weapon === 'ruler') for (const [dx, dy, len] of [[3, -3, 7], [6, 1, 9], [2, 4, 6]] as const) streaks.rect(HAND.W3[0] + dx, HAND.W3[1] + dy, len, 1, '#ffffff')
    const poses: Pose[] = ['W1', 'W2', 'W3']
    const arms = (['W1', 'W2', 'W3'] as const)
      .map(p => {
        if (L.weapon === 'whip') return `<g class="w${p}">${poly(LW, GH, whipPts(p), '#f1e2b0').svg(0, 0)}</g>`
        const [hx, hy] = HAND[p]
        const wc = weaponCv(L.weapon)
        const ang = L.weapon === 'gun' ? GANGLE[p] : WANGLE[p]
        const beam = L.weapon === 'gun' && p === 'W3' ? poly(LW, GH, [[hx + 17, hy], [CSX + 14, GH - 16]], '#7fe3ff').svg(0, 0) : ''
        return `<g class="w${p}"><g transform="translate(${hx} ${hy}) rotate(${ang})">${wc.svg(-1, -Math.floor(wc.h / 2))}</g>${beam}</g>`
      })
      .join('\n')
    whipCache[L.id] = `${poses.map(p => `<g class="p${p}">${heroPose(p, L)}</g>`).join('')}
${arms}
<g class="wcrack">${sparks}${streaks.svg(0, 0)}</g>${rings}
<g class="bang"><path fill="#ff4f72" d="M${CSX + 16} ${GH - 36}h2v6h-2zM${CSX + 16} ${GH - 28}h2v2h-2z"/></g>`
  }
  const chat = [0, 1].map(i => `<g class="chat chat${i}">${burstText(L.hits[(st.chatT + i) % L.hits.length]!).svg(LW - 45 - i * 2, GH - 70 - i * 4)}</g>`).join('')
  return whipCache[L.id] + chat
}
const thinkCl = () => `<g class="think think-cl">${staticWords(speech(liveText('cl'), false, w => LW - w, HY + 1, TS_SCALE))}</g>`
const csayMarkup = () => `<g class="csay">${speech(CLAUDE_RECV_POOL[st.cRecv % CLAUDE_RECV_POOL.length]!, false, w => LW - w, HY + 1)}</g>`

const rightStatic = () => CAST.slice(1).map((c, i) => slotSleep(c, GH, i * 30)).join('\n')
const leftStaticCache: Record<string, string> = {}
const leftStaticFor = (L: Look) => (leftStaticCache[L.id] ??= leftStatic(L))
const RIGHT_STATIC = rightStatic()

// ---------- animation helpers ----------
// A keyframe set that shows an element (opacity 1) only inside the given windows (seconds).
type Wins = readonly (readonly [number, number])[]
const kfw = (name: string, wins: Wins, T: number) => {
  const p = (t: number) => ((t / T) * 100).toFixed(2)
  let s = `@keyframes ${name}{0%{opacity:0}`
  for (const [a, b] of wins) s += `${p(a)}%{opacity:1}${b >= T ? '' : `${p(b)}%{opacity:0}`}`
  const endsOn = wins.length > 0 && wins[wins.length - 1]![1] >= T
  return `${s}100%{opacity:${endsOn ? 1 : 0}}}`
}
// run keyframes `kf` that last T seconds, `E` seconds in (so a redraw never restarts them)
const an = (kf: string, T: number, E: number) => `animation:${kf} ${T}s steps(1) ${(-E).toFixed(2)}s forwards`
// words of a speech bubble appear one after another
const wordCss = (cont: string, base: number, step: number, E: number) =>
  Array.from({ length: 10 }, (_, k) => `${cont} .w${k}{animation:wd .01s steps(1) ${(base + step * k - E).toFixed(2)}s forwards}`).join('')

// ---------- timelines (seconds) ----------
const TW = 4.2 // the prompt: dance + bubble, two whip cracks, Claude wakes
const WW = {
  A: [[0, 0.5], [1, 1.5], [2, 2.3]],
  B: [[0.5, 1], [1.5, 2]],
  W1: [[2.3, 2.55], [3.1, 3.35]],
  W2: [[2.55, 2.8], [3.35, 3.55]],
  W3: [[2.8, 3.1], [3.55, 3.9]],
  R: [[3.9, TW]],
  say: [[0, 2.6]],
  crack: [[2.8, 3.1], [3.55, 3.9]],
  ring0: [[2.8, 2.9], [3.55, 3.65]],
  ring1: [[2.9, 3.0], [3.65, 3.75]],
  ring2: [[3.0, 3.1], [3.75, 3.85]],
  chat0: [[2.8, 3.25]],
  chat1: [[3.55, 4.05]],
  bang: [[3.55, TW]],
  asleep: [[0, 3.9]],
  awake: [[3.9, TW]],
  tab: [[4.0, TW]],
  jolt: [[2.8, 2.95], [3.55, 3.7]],
} as const
const danceWins = (which: 0 | 1): [number, number][] => {
  const t = st.tempo
  const w: [number, number][] = []
  for (let a = which * t; a < 2.3 - 0.05; a += 2 * t) w.push([a, Math.min(a + t, 2.3)])
  return w
}
const TF = 4.4 // Claude has the order: "Gì nhiều việc vậy sếp", then thinking
const TC = 3.8 // Claude hands a job over (teasing line + throws the letter)
const TS = 5.6 // a worker's whole wake-up
const WS = {
  asleep: [[0, 1.15]],
  awake: [[1.15, TS]],
  hit: [[1.15, 1.7]],
  ssj: [[1.7, 3.3]],
  dazed: [[1.15, 1.7]],
  normal: [[1.7, TS]],
  paper: [[3.3, 5.3]],
  read: [[3.3, 4.7]],
  think: [[4.7, TS]],
} as const
const TR = 1.8 // a worker throws its result back at Claude
const TG = 2.4 // the angry desk-slam

const dynCss = (now: number): string => {
  const E = (at: number) => Math.max(0, (now - at) / 1000)
  const o: string[] = []
  // ----- the prompt: dance, "dậy làm đi mày", two cracks of the whip -----
  if (st.phase === 'whip') {
    const e = E(st.whipAt)
    const k = (n: string, w: Wins) => o.push(kfw(n, w, TW))
    k('kA', danceWins(0)); k('kB', danceWins(1)); k('kW1', WW.W1); k('kW2', WW.W2); k('kW3', WW.W3); k('kR', WW.R); k('kSay', WW.say)
    k('kCr', WW.crack); k('kR0', WW.ring0); k('kR1', WW.ring1); k('kR2', WW.ring2); k('kC0', WW.chat0); k('kC1', WW.chat1)
    k('kBang', WW.bang); k('kAsl', WW.asleep); k('kAwk', WW.awake); k('kTab', WW.tab)
    o.push(`@keyframes kJolt{0%{transform:translate(0,0)}${WW.jolt.map(([a, b]) => `${((a / TW) * 100).toFixed(2)}%{transform:translate(2px,-1px)}${(((a + b) / 2 / TW) * 100).toFixed(2)}%{transform:translate(-2px,1px)}${((b / TW) * 100).toFixed(2)}%{transform:translate(0,0)}`).join('')}100%{transform:translate(0,0)}}`)
    const pairs: [string, string][] = [['.ph-whip .pA', 'kA'], ['.ph-whip .pB', 'kB'], ['.ph-whip .pW1,.ph-whip .wW1', 'kW1'], ['.ph-whip .pW2,.ph-whip .wW2', 'kW2'], ['.ph-whip .pW3,.ph-whip .wW3', 'kW3'], ['.ph-whip .pR', 'kR'], ['.ph-whip .hsay', 'kSay'], ['.ph-whip .wcrack', 'kCr'], ['.ph-whip .ring0', 'kR0'], ['.ph-whip .ring1', 'kR1'], ['.ph-whip .ring2', 'kR2'], ['.ph-whip .chat0', 'kC0'], ['.ph-whip .chat1', 'kC1'], ['.ph-whip .bang', 'kBang'], ['.ph-whip .bed-cl', 'kAsl'], ['.ph-whip .cl-aw', 'kAwk'], ['.ph-whip .tab', 'kTab']]
    for (const [sel, kf] of pairs) o.push(`${sel}{${an(kf, TW, e)}}`)
    o.push(`.ph-whip .cl-sl{${an('kAsl', TW, e)},kJolt ${TW}s steps(1) ${(-e).toFixed(2)}s forwards}`)
    o.push(`.ph-whip .cl-aw .jmp{animation:jmp .5s steps(5) ${(3.9 - e).toFixed(2)}s 1 both}`)
    o.push(wordCss('.ph-whip .hsay', 0.2, 0.26, e))
  }
  // ----- Claude has the order -----
  if (st.fresh) {
    const e = E(st.freshAt)
    o.push(kfw('kCsay', [[0, 3.4]], TF), kfw('kCth', [[3.4, TF]], TF), kfw('kCdz', [[0, 1.2]], TF))
    o.push(`.dz-cl .csay{${an('kCsay', TF, e)}}`, `.dz-cl .think-cl{${an('kCth', TF, e)}}`, `.dz-cl .cl-aw .dz{${an('kCdz', TF, e)}}`)
    o.push(wordCss('.dz-cl .csay', 0.2, 0.45, e))
  }
  // ----- Claude hands a job over: teasing line, throws the letter -----
  if (st.send.size > 0 && now - st.cAt < TC * 1000) {
    const e = E(st.cAt)
    o.push(kfw('kCs', [[0, 3.6]], TC))
    const p = (t: number) => ((t / TC) * 100).toFixed(2)
    o.push(`@keyframes kOutR{0%{opacity:0;transform:translateX(0)}${p(0)}%{opacity:1;transform:translateX(0);animation-timing-function:steps(8)}${p(0.7)}%{opacity:1;transform:translateX(36px)}${p(0.8)}%{opacity:0}100%{opacity:0}}`)
    o.push(`.say .say-b{${an('kCs', TC, e)}}`, `.say .pk-cl-out{animation:kOutR ${TC}s linear ${(-e).toFixed(2)}s forwards}`, `.say .cl-aw .jmp{animation:jmp .45s steps(5) ${(-e).toFixed(2)}s 1}`)
    o.push(wordCss('.say .say-b', 0.1, 0.45, e))
  }
  // ----- each worker: letter on the head, Super Saiyan, reads the task -----
  for (const w of ['cx', 'ds', 'gp']) {
    const x = `.s-${w}`
    if (st.send.has(w)) {
      const e = E(st.sendAt[w] ?? now)
      const k = (n: string, ws: Wins) => o.push(kfw(`${n}${w}`, ws, TS))
      k('sl', WS.asleep); k('aw', WS.awake); k('hi', WS.hit); k('ss', WS.ssj); k('dz', WS.dazed); k('pa', WS.paper); k('rd', WS.read); k('th', WS.think)
      o.push(kfw(`dk${w}`, [[3.3, TS]], TS))
      const p = (t: number) => ((t / TS) * 100).toFixed(2)
      o.push(`@keyframes fall${w}{0%{opacity:0;transform:translate(-30px,-34px)}${p(0.45)}%{opacity:1;transform:translate(-30px,-34px);animation-timing-function:steps(7)}${p(1.15)}%{opacity:1;transform:translate(0,0)}${p(1.35)}%{opacity:0;transform:translate(0,0)}100%{opacity:0}}`)
      const A = (sel: string, n: string) => o.push(`${x} ${sel}{${an(`${n}${w}`, TS, e)}}`)
      A(`.${w}-sl,${x} .bed-${w}`, 'sl'); A(`.${w}-aw`, 'aw'); A(`.hit-${w}`, 'hi'); A(`.aura-${w},${x} .ssj-${w},${x} .rdw,${x} .shout-${w}`, 'ss')
      A(`.${w}-aw .dz`, 'dz'); A(`.paper-${w}`, 'pa'); A(`.wsay-${w}`, 'rd'); A(`.think-${w}`, 'th'); A(`.desk-${w}`, 'dk'); A(`.${w}-aw .chairb`, 'dk')
      o.push(`${x} .pk-${w}-in{animation:fall${w} ${TS}s linear ${(-e).toFixed(2)}s forwards}`)
      o.push(`${x} .${w}-aw .sit{animation:sit-${w} .01s steps(1) ${(3.3 - e).toFixed(2)}s forwards}`)
      o.push(`${x} .${w}-aw .jmp{animation:jmp .5s steps(5) ${(1.15 - e).toFixed(2)}s 1,stomp .4s steps(4) ${(1.7 - e).toFixed(2)}s 4}`)
      o.push(wordCss(`${x} .shout-${w}`, 1.75, 0.1, e), wordCss(`${x} .wsay-${w}`, 3.35, 0.45, e))
    }
    // ----- the result is thrown back at Claude -----
    if (st.recv.has(w)) {
      const e = E(st.recvAt[w] ?? now)
      const p = (t: number) => ((t / TR) * 100).toFixed(2)
      o.push(`@keyframes bk${w}{0%{opacity:1;transform:translateX(0)}${p(0.6)}%{opacity:1;transform:translateX(-36px)}${p(0.7)}%{opacity:0}100%{opacity:0}}`)
      o.push(`.r-${w} .pk-${w}-out{animation:bk${w} ${TR}s steps(9) ${(-e).toFixed(2)}s forwards}`)
    }
    // ----- the angry desk-slam -----
    if (st.rage.has(w)) {
      const e = E(st.rageAt[w] ?? now)
      const g = `.g-${w}`
      const [yx, yy, yr] = st.yeet[w] ?? [18, -16, 540]
      o.push(`@keyframes yeet${w}{0%,18%{opacity:1;transform:translate(0,0) rotate(0deg)}70%{opacity:1;transform:translate(${yx}px,${yy}px) rotate(${yr}deg)}71%,100%{opacity:0;transform:translate(${yx}px,${yy}px)}}`)
      o.push(`${g} .desk-${w}{animation:slam ${TG}s steps(1) ${(-e).toFixed(2)}s forwards}`, `${g} .${w}-aw .lap{animation:yeet${w} ${TG}s steps(14) ${(-e).toFixed(2)}s forwards}`, `${g} .${w}-aw .jmp{animation:stomp .4s steps(4) ${(-e).toFixed(2)}s 6}`)
    }
  }
  // ----- Claude catches the thrown result with his head -----
  if (st.recv.size > 0 && now - st.rAt < TR * 1000) {
    const e = E(st.rAt)
    const p = (t: number) => ((t / TR) * 100).toFixed(2)
    o.push(kfw('kCh', [[1.25, TR]], TR))
    o.push(`@keyframes kInL{0%{opacity:0;transform:translate(36px,-30px)}${p(0.55)}%{opacity:1;transform:translate(36px,-30px);animation-timing-function:steps(7)}${p(1.25)}%{opacity:1;transform:translate(0,0)}${p(1.45)}%{opacity:0}100%{opacity:0}}`)
    o.push(`.rcv .pk-cl-in{animation:kInL ${TR}s linear ${(-e).toFixed(2)}s forwards}`, `.rcv .hit-cl{${an('kCh', TR, e)}}`, `.rcv .cl-aw .jmp{animation:jmp .5s steps(5) ${(1.25 - e).toFixed(2)}s 1}`)
  }
  return o.join('\n')
}

// ---------- stylesheet (what does not depend on the clock) ----------
const castCss = () =>
  CAST.map(c => {
    const sit = sitOf(c)
    const base = c.id === 'cl' ? '.lp' : `.a-${c.id}`
    const ci = CAST.indexOf(c)
    const typ = [0.3, 0.3, 0.22, 0.38][ci]!
    const out = [
      `.${c.id}-sl .breath{animation-delay:-${(ci * 0.8).toFixed(1)}s}`,
      `.${c.id}-sl .zz1{animation-delay:-${(ci * 0.9).toFixed(1)}s}.${c.id}-sl .zz2{animation-delay:-${(ci * 0.9 + 1.5).toFixed(1)}s}`,
      `@keyframes sit-${c.id}{to{transform:translateY(-${sit}px)}}`,
      `${base} .desk-${c.id}{opacity:1}`,
      `${base} .${c.id}-aw .chairb{opacity:1}`,
      `${base} .${c.id}-aw .sit{animation:sit-${c.id} .01s steps(1) forwards}`,
      `${base} .${c.id}-aw .h1{animation:typ ${typ}s steps(1) infinite}`,
      `${base} .${c.id}-aw .h2{animation:typ ${typ}s steps(1) infinite ${(typ / 2).toFixed(2)}s}`,
      `.t-${c.id} .${c.id}-aw .jmp{animation:stretch ${[0, 11, 8, 14][ci]!}s steps(1) infinite -${[0, 3, 6, 1][ci]!}s}`,
    ]
    if (c.id === 'cl') {
      out.push(`.lp .desk-cl{opacity:0;animation:popIn .3s steps(1) forwards}`, `.lp .cl-aw .chairb{opacity:0;animation:popIn .3s steps(1) forwards}`)
    } else {
      out.push(
        `.a-${c.id} .${c.id}-sl{opacity:0}.a-${c.id} .${c.id}-aw{opacity:1}.a-${c.id} .bed-${c.id}{opacity:0}`,
        `.a-${c.id} .spk-${c.id}{opacity:1;animation:blink .5s steps(2) infinite}`,
        `.g-${c.id} .${c.id}-aw .sit{animation:none}`,
        `.g-${c.id} .${c.id}-aw .chairb{opacity:0}`,
        `.g-${c.id} .${c.id}-aw .hand{opacity:0}`,
        `.g-${c.id} .${c.id}-aw .rdw{opacity:1}`,
        `.g-${c.id} .${c.id}-aw .vein{animation:blink .3s steps(2) infinite}`,
        `.g-${c.id} .${c.id}-aw .stm1{animation:steam 1s steps(4) infinite}`,
        `.g-${c.id} .${c.id}-aw .stm2{animation:steam 1s steps(4) infinite .5s}`,
      )
    }
    return out.join('\n')
  }).join('\n')

const sceneCss = () => `
.cl-sl,.cx-sl,.ds-sl,.gp-sl{opacity:1}
.cl-aw,.cx-aw,.ds-aw,.gp-aw,.dz,.chairb,.desk,.vein,.stm,.rd,.rdw,.tab,.pR,.pW1,.pW2,.pW3,.wW1,.wW2,.wW3,.wcrack,.bang,.hsay,.heart,.cbub,.pk,.spk,.say-b,.wd,.aura,.ssj,.hit,.paper,.wsay,.shout,.think,.csay,.ring,.chat{opacity:0}
.ca .cl-sl{opacity:0}.ca .cl-aw{opacity:1}.ca .bed-cl{opacity:0}
.lap,.tshake{transform-box:fill-box;transform-origin:center}
.pA{animation:dA .6s steps(1) infinite}.pB{animation:dB .6s steps(1) infinite}
@keyframes dA{0%{opacity:1}50%{opacity:0}}
@keyframes dB{0%{opacity:0}50%{opacity:1}}
.bob{animation:bob .8s steps(1) infinite}
.wob{animation:wob .6s steps(1) infinite}
.breath{animation:br 3s steps(1) infinite}
.rd{animation:redf .3s steps(2) infinite}
.ar0{animation:fl0 .3s steps(1) infinite}.ar1{animation:fl1 .3s steps(1) infinite}
@keyframes fl0{0%{opacity:1}50%{opacity:0}}
@keyframes fl1{0%{opacity:0}50%{opacity:1}}
.dot{animation:blink .9s steps(1) infinite}.d1{animation-delay:.3s}.d2{animation-delay:.6s}
@keyframes br{0%{transform:translateY(0)}35%{transform:translateY(-1px)}70%{transform:translateY(-1px)}}
@keyframes bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}100%{transform:translateY(0)}}
@keyframes wob{0%{transform:translateX(-1px)}50%{transform:translateX(1px)}100%{transform:translateX(-1px)}}
@keyframes jmp{0%{transform:translateY(0) scaleY(1)}12%{transform:translateY(1px)}35%{transform:translateY(-6px)}50%{transform:translateY(-7px)}70%{transform:translateY(-2px)}85%{transform:translateY(1px)}100%{transform:translateY(0)}}
@keyframes blink{0%{opacity:1}33%{opacity:.15}66%{opacity:1}}
@keyframes typ{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes popIn{0%,32%{opacity:0}33%,65%{opacity:.5}66%,100%{opacity:1}}
@keyframes wd{0%,100%{opacity:1}}
@keyframes slam{0%{opacity:1;transform:translateY(0)}6%{transform:translateY(2px)}12%{transform:translateY(0)}18%{transform:translateY(2px)}24%{transform:translateY(0)}30%{transform:translateY(2px)}36%{transform:translateY(0)}58%{opacity:1}60%,100%{opacity:0}}
@keyframes yeet{0%,18%{opacity:1;transform:translate(0,0) rotate(0deg)}70%{opacity:1;transform:translate(18px,-16px) rotate(540deg)}71%,100%{opacity:0;transform:translate(18px,-16px)}}
@keyframes stretch{0%,86%{transform:translateY(0)}89%{transform:translateY(-3px)}92%{transform:translateY(-4px)}95%{transform:translateY(1px)}98%,100%{transform:translateY(0)}}
@keyframes ssh{0%{opacity:0;transform:translate(0,0)}2%{opacity:1}9%{opacity:0;transform:translate(-30px,15px)}100%{opacity:0;transform:translate(-30px,15px)}}
.ssh1{animation:ssh 19s linear infinite 4s}.ssh2{animation:ssh 29s linear infinite 13s}
@keyframes dawn{0%{opacity:0}30%{opacity:.24}100%{opacity:0}}
.ph-done .dawn{animation:dawn 3.5s linear forwards}
.conf{opacity:0}.ph-done .conf{opacity:1}
.cfp{transform-box:fill-box;transform-origin:center;animation:cfall 2.8s linear infinite}
@keyframes cfall{0%{opacity:0;transform:translateY(0) rotate(0deg)}10%{opacity:1}90%{opacity:1}100%{opacity:0;transform:translateY(70px) rotate(300deg)}}
.zbub{animation:popIn .4s steps(1) 1 both}
@keyframes fwb{0%{opacity:0;transform:scale(.15)}12%{opacity:1}70%{opacity:1}100%{opacity:0;transform:scale(2.4)}}
.fw{transform-box:fill-box;transform-origin:center;animation:fwb 1.7s steps(9) infinite}
.rain rect{animation:rainf .8s linear infinite}
@keyframes rainf{0%{opacity:0;transform:translate(0,0)}10%{opacity:.7}100%{opacity:0;transform:translate(-8px,72px)}}
.lit{animation:litf 6.5s steps(1) infinite}
@keyframes litf{0%,88%{opacity:0}89%{opacity:.5}90%{opacity:0}91%{opacity:.35}92%,100%{opacity:0}}
.ff{animation:fff 5s ease-in-out infinite}
@keyframes fff{0%,100%{opacity:.1;transform:translate(0,0)}50%{opacity:1;transform:translate(5px,-4px)}}
.ufo{transform:translate(-10px,14px);animation:ufof 53s linear infinite 6s}
@keyframes ufof{0%{transform:translate(-10px,14px)}9%{transform:translate(80px,22px)}12%{transform:translate(80px,22px)}22%{transform:translate(172px,12px)}100%{transform:translate(172px,12px)}}
.beam{animation:beamf 53s steps(1) infinite 6s;opacity:0}
@keyframes beamf{0%,9%{opacity:0}9.5%,11.5%{opacity:.55}12%,100%{opacity:0}}
.oops{animation:oopf .5s steps(2) infinite}
@keyframes oopf{0%{opacity:1}50%{opacity:.4}}
@keyframes stomp{0%{transform:translateY(0)}50%{transform:translateY(-2px)}100%{transform:translateY(0)}}
@keyframes redf{0%{opacity:0}50%{opacity:.55}100%{opacity:0}}
@keyframes steam{0%{opacity:0;transform:translateY(0)}25%{opacity:.9}100%{opacity:0;transform:translateY(-7px)}}
@keyframes shake{0%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}
.zz{animation:zz 3s steps(4) infinite}.zz2{animation-delay:-1.5s}
@keyframes zz{0%{opacity:0;transform:translate(0,3px)}25%{opacity:1;transform:translate(0,1px)}75%{opacity:1;transform:translate(2px,-3px)}100%{opacity:0;transform:translate(2px,-5px)}}
.tb .tab{opacity:1}
.th .think-cl{opacity:1}
.t-cx .think-cx,.t-ds .think-ds,.t-gp .think-gp{opacity:1}
.say .tshake{animation:shake .2s steps(1) infinite}
.ping{animation:blink .6s steps(2) infinite}
.ph-whip .cl-aw .dz{opacity:1}
.ph-done .heart{opacity:1;animation:blink .8s steps(2) infinite}
.ph-done .cbub{opacity:1}
.say .say-b{opacity:1}
${castCss()}`

// ---------- runtime state: the scene reacts to the session ----------
type Phase = 'idle' | 'whip' | 'work' | 'done'
const st = {
  phase: 'idle' as Phase,
  gen: 0,
  fresh: false,
  awake: new Set<string>(),
  send: new Set<string>(),
  recv: new Set<string>(),
  rage: new Set<string>(),
  hSay: 0,
  cSay: 0,
  cRecv: 0,
  wRecv: {} as Record<string, number>,
  wShout: {} as Record<string, number>,
  chatT: 0,
  hTask: '',
  look: LOOKS[0]!,
  promptText: '',
  oops: null as null | { who: string; at: number },
  chat: null as null | { who: string; text: string; at: number },
  wins: 0,
  praise: 0,
  tempo: 0.4,
  yeet: {} as Record<string, [number, number, number]>,
  live: {} as Record<string, string>,
  liveAt: {} as Record<string, number>,
  plan: '',
  cLine: '',
  wTask: {} as Record<string, string>,
  wVerb: {} as Record<string, number>,
  whipAt: 0,
  freshAt: 0,
  cAt: 0,
  rAt: 0,
  sendAt: {} as Record<string, number>,
  recvAt: {} as Record<string, number>,
  rageAt: {} as Record<string, number>,
}

// Claude holds a tablet while orders or reports come in, a laptop when working alone.
const claudeBusy = () => st.phase === 'work' && (st.fresh || st.awake.size + st.send.size + st.recv.size + st.rage.size > 0)

const sceneClasses = () =>
  [
    `ph-${st.phase}`,
    st.phase === 'work' || st.phase === 'done' ? 'ca' : '',
    st.fresh ? 'dz-cl' : '',
    st.send.size > 0 ? 'say' : '',
    st.recv.size > 0 ? 'rcv' : '',
    claudeBusy() ? 'tb' : st.phase === 'work' ? 'lp' : '',
    st.phase === 'work' && !st.fresh && st.send.size === 0 && liveText('cl') !== '' ? 'th' : '',
    ...[...st.awake, ...st.recv, ...st.rage].map(w => `a-${w}`),
    ...[...st.awake].filter(w => !st.send.has(w) && !st.recv.has(w) && !st.rage.has(w)).map(w => `t-${w}`),
    ...[...st.rage].map(w => `g-${w}`),
    ...[...st.send].map(w => `s-${w}`),
    ...[...st.recv].map(w => `r-${w}`),
  ]
    .filter(Boolean)
    .join(' ')

const stars = Array.from({ length: 40 }, (_, i) => {
  const x = (i * 37 + 11) % 158
  const y = (i * 23 + 5) % 52
  return `<rect class="s s${i % 3}" x="${x}" y="${y}" width="0.6" height="0.6" fill="#c8cae0"/>`
}).join('')

const cloud = (x: number, y: number, c: string) =>
  `<g fill="${c}"><rect x="${x + 2}" y="${y}" width="8" height="2"/><rect x="${x}" y="${y + 2}" width="14" height="2"/></g>`

// the lines people say (changes with each prompt / hand-over)
const heroLine = (): string => (st.hSay >= 1000 ? st.look.says[st.hSay - 1000] : undefined) ?? HERO_SAY[st.hSay >= 1000 ? 0 : st.hSay % HERO_SAY.length]!
const heroSay = () => `<g class="hsay">${speech(joinSay(heroLine(), st.hTask), true, () => 0, HY + 1)}</g>`
const claudeSay = () => `<g class="say-b">${speech(st.cLine !== '' ? st.cLine : CLAUDE_SAY[st.cSay % CLAUDE_SAY.length]!, false, w => LW - w, HY + 1)}</g>`

const active = (w: string) => st.awake.has(w) || st.send.has(w) || st.recv.has(w) || st.rage.has(w)
const chatBubble = (who: string) => {
  const c = st.chat
  if (c === null || c.who !== who) return ''
  return `<g class="zbub">${staticWords(speech(c.text, who === 'hero', who === 'hero' ? () => 0 : w => LW - w, HY + 1, TS_SCALE))}</g>`
}
const leftDynamic = () => {
  if (st.phase === 'idle') return chatBubble('hero') + chatBubble('cl')
  let o = slotAwake(CAST[0]!, GH, CSX + 4, CSX, LW)
  if (st.phase === 'whip') o += whipExtras(st.look) + heroSay()
  if (st.oops !== null && st.oops.who === 'cl') o += `<g transform="translate(${CSX + 14} ${GH - 56})">${oopsMarkup('cl')}</g>`
  if (st.phase === 'done') o += `<g class="zbub">${staticWords(speech(PRAISE[st.praise % PRAISE.length]!, true, () => 0, HY + 1, TS_SCALE))}</g>`
  if (st.fresh) o += csayMarkup()
  if (st.phase === 'work' && st.send.size === 0 && liveText('cl') !== '') o += thinkCl()
  if (st.send.size > 0) o += claudeSay()
  return o
}
const rightDynamic = () =>
  CAST.slice(1)
    .map((c, i) => {
      if (active(c.id)) return slotAwake(c, GH, i * 30 + 4, i * 30, RW) + (st.oops !== null && st.oops.who === c.id ? `<g transform="translate(${i * 30 + 14} ${GH - 56})">${oopsMarkup(c.id)}</g>` : '')
      const z = st.phase === 'idle' && st.chat !== null && st.chat.who === c.id
      return z ? `<g class="zbub">${staticWords(speech(st.chat!.text, true, w => Math.max(0, Math.min(RW - w, i * 30 + 15 - Math.round(w / 2))), GH - 46, TS_SCALE))}</g>` : ''
    })
    .join('\n')

const sceneStatic = () => `<g class="Lg"><svg x="0" y="0" width="${LW * KD}" height="${GH * KD}" viewBox="0 0 ${LW} ${GH}" preserveAspectRatio="xMinYMax meet">${leftStaticFor(st.look)}${leftDynamic()}</svg></g>
<g class="Rg"><svg x="0" y="0" width="${RW * KD}" height="${GH * KD}" viewBox="0 0 ${RW} ${GH}" preserveAspectRatio="xMaxYMax meet">${RIGHT_STATIC}${rightDynamic()}</svg></g>
<g class="Gf">${GROUND.front.svg(0, FLOOR - 2)}</g>`

const FW = [[38, 22, '#ffd45e'], [118, 16, '#ff7aa2'], [80, 34, '#7fe3ff']] as const
const ambient = (now: number): string => {
  let o = ''
  const h = new Date(now).getHours()
  if (h >= 5 && h < 7) o += '<rect width="160" height="62" fill="#ff8f70" opacity=".14"/>'
  if (h >= 17 && h < 20) o += '<rect width="160" height="62" fill="#ff9a3c" opacity=".16"/>'
  if (st.phase === 'done') {
    o += FW.map(([x, y, col], i) => `<g class="fw" fill="${col}" style="animation-delay:-${(i * 0.55).toFixed(2)}s">${[0, 1, 2, 3, 4, 5, 6, 7].map(a => `<rect x="${Math.round(x + 7 * Math.cos((a * Math.PI) / 4)) - 1}" y="${Math.round(y + 7 * Math.sin((a * Math.PI) / 4)) - 1}" width="2" height="2"/>`).join('')}<rect x="${x - 1}" y="${y - 1}" width="2" height="2"/></g>`).join('')
  }
  if (st.phase === 'work' && st.awake.size >= 2) {
    o += '<rect class="lit" width="160" height="62" fill="#e8ecff" opacity="0"/><g class="rain" fill="#9fb4ff">'
    for (let i = 0; i < 22; i++) o += `<rect style="animation-delay:-${((i * 0.13) % 0.9).toFixed(2)}s" x="${(i * 19 + 7) % 160}" y="0" width="1" height="3"/>`
    o += '</g>'
  }
  if (st.phase === 'idle') {
    o += '<g class="ffs" fill="#d6ff7a">'
    for (let i = 0; i < 7; i++) o += `<rect class="ff" style="animation-duration:${4 + (i % 3)}s;animation-delay:-${i * 0.9}s" x="${12 + i * 21}" y="${58 + ((i * 7) % 10)}" width="1.5" height="1.5"/>`
    o += '</g>'
  }
  if (st.phase === 'idle' || st.phase === 'work') {
    o += '<g class="ufo"><path fill="#9ad0e8" d="M-5 1h10v1h-10zM-3 0h6v1h-6zM-2 -1h4v1h-4z"/><path class="beam" fill="#ffe97a" d="M-2 2h4l3 14h-10z"/></g>'
  }
  return o
}
const oopsMarkup = (who: string): string => {
  const o = st.oops
  if (o === null || o.who !== who || Date.now() - o.at > 1600) return ''
  return '<g class="oops"><path fill="#ff4d4d" d="M0 0h2v5h-2zM0 6h2v2h-2zM4 1h2v2h-2zM6 3h2v2h-2zM4 5h2v1h-2z"/><path fill="#8fd8ff" d="M-3 4h1v2h-1zM9 7h1v2h-1z"/></g>'
}
const CONF = `<g class="conf">${Array.from({ length: 16 }, (_, i) => {
  const x = 6 + ((i * 37) % 148)
  const col = ['#ffd45e', '#ff7aa2', '#7fe3ff', '#8fe3ac'][i % 4]
  return `<rect class="cfp" style="animation-delay:-${((i * 0.41) % 2.8).toFixed(2)}s" x="${x}" y="0" width="2" height="2" fill="${col}"/>`
}).join('')}</g>`
const winsMarkup = () =>
  st.wins === 0 ? '' : `<g>${Array.from({ length: st.wins }, (_, i) => `<path fill="#ffd45e" d="M${4 + i * 5} 3h1v1h-1zM${3 + i * 5} 4h3v1h-3zM${4 + i * 5} 5h1v1h-1z"/>`).join('')}</g>`
const buildSceneWith = (now: number, decor: boolean) => {
  const d = (period: number) => `-${(now / 1000) % period}s`
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${sceneClasses()}" viewBox="0 0 160 90" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">
<style>
.s0{animation:tw 3s steps(2) infinite}
.s1{animation:tw 4s steps(2) infinite}
.s2{opacity:.25}
@keyframes tw{0%{opacity:.55}50%{opacity:.12}100%{opacity:.55}}
.c1{animation:dr 90s linear infinite}
.c2{animation:dr 140s linear infinite}
@keyframes dr{from{transform:translateX(-30px)}to{transform:translateX(190px)}}
${bucketCss()}
${sceneCss()}
${dynCss(now)}
</style>
<rect width="160" height="90" fill="#1a1c2c"/>
<rect y="40" width="160" height="50" fill="#1f2340"/>
<rect y="62" width="160" height="28" fill="#262b4d"/>
<rect class="dawn" width="160" height="62" fill="#ff9d5c" opacity="0"/>
${decor ? stars : ''}
${CONF}
${decor ? ambient(now) : ''}
${decor ? `<g class="ssh ssh1" opacity="0"><path fill="#ffffff" d="M120 8h2v1h-2zM122 9h2v1h-2zM124 10h2v1h-2z"/></g><g class="ssh ssh2" opacity="0"><path fill="#cfd4ff" d="M70 20h2v1h-2zM72 21h2v1h-2zM74 22h2v1h-2z"/></g>` : ''}
${decor ? `<g class="c1" style="animation-delay:${d(90)}">${cloud(0, 14, '#2f3560')}</g><g class="c2" style="animation-delay:${d(140)}">${cloud(0, 30, '#2a3058')}</g>` : ''}
<g class="Mn"><rect x="96" y="10" width="8" height="8" fill="#ffcd75"/><rect x="98" y="8" width="4" height="12" fill="#ffcd75"/><rect x="94" y="12" width="12" height="4" fill="#ffcd75"/></g>
<g class="Gr">${GROUND.back.svg(0, FLOOR - 2)}</g>
${sceneStatic()}
${winsMarkup()}
</svg>`
}

// The app refuses a scene over 131,072 characters, so drop the stars and clouds if it gets close.
const buildScene = (now: number) => {
  lean = false
  const full = buildSceneWith(now, true)
  if (full.length <= 126000) return full
  const bare = buildSceneWith(now, false)
  if (bare.length <= 130000) return bare
  lean = true
  const out = buildSceneWith(now, false)
  lean = false
  return out
}

const note = (wave: 'square' | 'triangle', notes: string[], step: number) => ({
  layers: [{ wave, notes, step }],
})

// `frosted` (a switch in the plugin's settings, off by default) lets the app frost its panels over the scene
const lookFor = (frosted: boolean): ThemeSetArgs => ({
  colors: theme,
  backdrop: { scene: 'pixel-night', glass: frosted ? { blur: 5, tint: '#171a2e', opacity: 0.5 } : false },
  style: {
    Text: { fontFamily: ['mono'], fontSize: 15, lineHeight: 24, color: '#f4f4f4' },
    Heading: { fontFamily: ['mono'], fontWeight: 'bold', letterSpacing: 1, color: '#ffcd75' },
    UserMessage: { ...base, color: '#1a1c2c', backgroundColor: '#ffcd75', fill: box('#0b0c16', '#ffcd75') },
    AssistantMessage: { ...base, color: '#f4f4f4', backgroundColor: '#2b3052', fill: box('#41a6f6', '#2b3052') },
    ToolUse: { fontFamily: ['mono'], color: '#a4e8b8', backgroundColor: '#14261c', radius: 0, paddingX: 8 },
  },
  sound: {
    cues: {
      // whip crack when you send a prompt
      send: {
        layers: [
          { wave: 'white', gain: 0.8, attack: 0.002, release: 0.07, filter: { type: 'highpass', hz: 3000 } },
          { wave: 'square', notes: ['A5'], glide: -14, gain: 0.3, attack: 0.002, release: 0.08 },
        ],
      },
      // "kịch": a desk slam when Claude finishes
      done: {
        layers: [
          { wave: 'brown', gain: 0.9, attack: 0.002, release: 0.2 },
          { wave: 'white', gain: 0.5, attack: 0.002, release: 0.05, filter: { type: 'highpass', hz: 2500 } },
          { wave: 'square', notes: ['C2'], glide: -12, gain: 0.7, attack: 0.002, release: 0.25 },
        ],
      },
      ask: note('triangle', ['A4', 'E5'], 0.1),
      error: note('square', ['E3', 'C3'], 0.12),
    },
  },
})


// ---------- reactions ----------
let poke = (): void => {}
let later = (_ms: number, _fn: () => void): void => {}
let sfx = (_n: 'slam' | 'crash' | 'crack'): void => {}
const ms = (s: number) => Math.round(s * 1000)

let firstLine = true
const startWhip = () => {
  const gen = ++st.gen
  st.chat = null
  mainBusy = true
  st.look = pickLook(st.promptText)
  st.hSay = firstLine ? 0 : st.look.says.length > 0 && Math.random() < 0.55 ? 1000 + Math.floor(Math.random() * st.look.says.length) : pickNot(HERO_SAY, st.hSay >= 1000 ? 0 : st.hSay)
  st.tempo = [0.2, 0.25, 0.3, 0.4][Math.floor(Math.random() * 4)]!
  st.cRecv = pickNot(CLAUDE_RECV_POOL, st.cRecv)
  st.chatT = Math.floor(Math.random() * CHAT_POOL.length)
  firstLine = false
  st.phase = 'whip'
  st.whipAt = Date.now()
  poke()
  for (const t of [2.8, 3.55]) {
    later(ms(t), () => {
      if (st.gen === gen) sfx('crack')
    })
  }
  later(ms(TW), () => {
    if (st.gen === gen && st.phase === 'whip') {
      st.phase = 'work'
      st.fresh = true
      st.freshAt = Date.now()
      poke()
      later(ms(TF), () => {
        if (st.gen === gen) {
          st.fresh = false
          poke()
        }
      })
    }
  })
}

let mainBusy = false
const WORKERS = ['cx', 'ds', 'gp'] as const
const load: Record<string, number> = { cx: 0, ds: 0, gp: 0 }
const tok: Record<string, number> = { cx: 0, ds: 0, gp: 0 }
const agentWorker = new Map<string, string>()
const anyLoad = () => WORKERS.some(w => (load[w] ?? 0) > 0)

const settle = () => {
  if (!mainBusy && !anyLoad() && st.rage.size === 0 && st.recv.size === 0 && st.phase === 'work') {
    st.phase = 'idle'
    st.awake.clear()
    st.send.clear()
    poke()
  }
}

// while nothing is going on, somebody mutters in their sleep every now and then
let chatterOn = false
const startChatter = () => {
  if (chatterOn) return
  chatterOn = true
  const tick = () => {
    if (st.phase === 'idle' && !mainBusy && st.chat === null) {
      const who = (['hero', 'cl', 'cx', 'ds', 'gp'] as const)[Math.floor(Math.random() * 5)]!
      const pool = DREAMS[who]!
      const at = Date.now()
      st.chat = { who, text: pool[Math.floor(Math.random() * pool.length)]!, at }
      poke()
      later(4500, () => {
        if (st.chat !== null && st.chat.at === at) {
          st.chat = null
          poke()
        }
      })
    }
    later(14000 + Math.floor(Math.random() * 18000), tick)
  }
  later(9000, tick)
}

const finishAll = () => {
  const gen = ++st.gen
  st.wins = Math.min(st.wins + 1, 12)
  st.praise = Math.floor(Math.random() * PRAISE.length)
  mainBusy = false
  st.fresh = false
  st.phase = 'done'
  poke()
  later(3500, () => {
    if (st.gen === gen && st.phase === 'done') {
      // background tasks may still be running: their AIs stay awake
      st.phase = 'work'
      settle()
      poke()
    }
  })
}

// which AI takes a job: named in the text, else the least busy one
const hintOf = (text: string): string | undefined => {
  if (/deepseek/i.test(text)) return 'ds'
  if (/chatgpt|openai|\bgpt\b/i.test(text) && !/codex/i.test(text)) return 'gp'
  if (/codex/i.test(text)) return 'cx'
  return undefined
}
const agentHints: string[] = [] // who each Agent/Task call is meant for, in the order the subagents start
const pickWorker = (text: string): string => hintOf(text) ?? [...WORKERS].sort((a, b) => (load[a] ?? 0) - (load[b] ?? 0))[0]!

// the AI throws its result back at Claude's head, then slams the desk and goes to bed
const beginReturn = (w: string) => {
  st.yeet[w] = [[18, -16, 540], [-16, -20, -540], [4, -26, 720], [26, -8, 360], [-24, -12, -360]][Math.floor(Math.random() * 5)] as [number, number, number]
  st.awake.delete(w)
  st.recv.add(w)
  st.recvAt[w] = Date.now()
  st.rAt = st.recvAt[w]!
  poke()
  later(ms(TR), () => {
    if (st.recv.delete(w)) {
      st.rage.add(w)
      st.rageAt[w] = Date.now()
      poke()
      for (const t of [140, 430, 720]) later(t, () => sfx('slam'))
      later(1000, () => sfx('crash'))
      later(ms(TG), () => {
        st.rage.delete(w)
        settle()
        poke()
      })
    }
  })
}

const endWork = (w: string) => {
  load[w] = Math.max(0, (load[w] ?? 0) - 1)
  if ((load[w] ?? 0) > 0) return
  // let the wake-up scene play out before the result is thrown back
  const rem = (st.sendAt[w] ?? 0) + ms(TS) - Date.now()
  if (rem > 0 && st.send.has(w)) {
    later(rem, () => {
      if ((load[w] ?? 0) === 0) beginReturn(w)
    })
    return
  }
  beginReturn(w)
}

const startWork = (w: string, task = '') => {
  const tb = brief(task, 4, 24)
  if (tb !== '') {
    st.wTask[w] = tb
    st.wVerb[w] = Math.floor(Math.random() * THINK_VERB.length)
  }
  load[w] = (load[w] ?? 0) + 1
  const t = (tok[w] = (tok[w] ?? 0) + 1)
  if (st.phase === 'idle') st.phase = 'work'
  st.recv.delete(w)
  st.rage.delete(w)
  if (!st.awake.has(w)) {
    const now = Date.now()
    st.cSay = pickNot(CLAUDE_SAY, st.cSay)
    st.cLine = tb === '' ? '' : joinSay(`${HAND_OPEN[Math.floor(Math.random() * HAND_OPEN.length)]!} ${WORKER_NAME[w] ?? ''},`, `${tb}`)
    st.wRecv[w] = pickNot(WORKER_RECV_POOL, st.wRecv[w] ?? -1)
    st.wShout[w] = pickNot(WORKER_SHOUT_POOL, st.wShout[w] ?? -1)
    st.cAt = now
    st.sendAt[w] = now
    st.awake.add(w)
    st.send.add(w)
    later(ms(TS), () => {
      st.send.delete(w)
      poke()
    })
  }
  poke()
  // safety net: a job whose end we never hear about does not keep the AI up forever
  later(15 * 60 * 1000, () => {
    if (tok[w] === t && (load[w] ?? 0) > 0) {
      load[w] = 1
      endWork(w)
    }
  })
}

// what a shell command is for: its description, else the longest quoted text in it
const taskOf = (e: { command?: string; description?: string }): string => {
  if (e.description !== undefined && e.description.trim() !== '') return e.description
  const quoted = [...(e.command ?? '').matchAll(/"([^"]{8,})"|'([^']{8,})'/g)].map(m => m[1] ?? m[2] ?? '')
  return quoted.sort((a, b) => b.length - a.length)[0] ?? ''
}
const bashWorker = (e: { command?: string }): string | undefined => {
  const text = e.command ?? ''
  if (/codex/i.test(text)) return 'cx'
  if (/deepseek/i.test(text)) return 'ds'
  if (/chatgpt|openai|\bgpt\b/i.test(text)) return 'gp'
  return undefined
}

// Background shells and monitors have no end event of their own, but every time a turn
// stops the engine lists the background work still in flight. We follow that list: each
// task keeps one AI awake until it drops off the list.
type BgTask = { id: string; type: string; description?: string; command?: string }
const bgTask = new Map<string, string>() // task id -> the AI looking after it
const bgPending: string[] = [] // AIs woken by a background command that has not been listed yet

const syncBackground = (tasks: readonly BgTask[]) => {
  const live = tasks.filter(t => t.type !== 'subagent') // subagents are followed by their own turns
  const ids = new Set(live.map(t => t.id))
  for (const [id, w] of [...bgTask]) {
    if (!ids.has(id)) {
      bgTask.delete(id)
      endWork(w)
    }
  }
  for (const t of live) {
    if (bgTask.has(t.id)) continue
    const w = bgPending.shift()
    if (w !== undefined) {
      bgTask.set(t.id, w) // already awake for it
    } else {
      const named = pickWorker(`${t.command ?? ''} ${t.description ?? ''}`)
      startWork(named)
      bgTask.set(t.id, named)
    }
  }
  // commands that finished before the list was read
  for (const w of bgPending.splice(0)) endWork(w)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    poke = () => $.ui.invalidate('ui.render')
    later = (ms, fn) => {
      void $.clock.after(ms, fn)
    }
    sfx = n => {
      void $.audio.play({ asset: n === 'slam' ? 'sounds/slam.wav' : n === 'crash' ? 'sounds/crash.wav' : 'sounds/crack.wav' }).catch(() => {})
    }
    startChatter()
    const bad = problems.find(line => line.startsWith("Desktop won't paint"))
    if (bad !== undefined) {
      $.ui.toast(bad)
    }
    try {
      await $.theme.set(lookFor(options.frosted === true))
    } catch (error) {
      $.ui.log(String(error))
      const { sound: _s, style: _y, ...rest } = lookFor(false)
      await $.theme.set(rest)
    }
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    poke = () => $.ui.invalidate('ui.render')
    later = (ms, fn) => {
      void $.clock.after(ms, fn)
    }
    sfx = n => {
      void $.audio.play({ asset: n === 'slam' ? 'sounds/slam.wav' : n === 'crash' ? 'sounds/crash.wav' : 'sounds/crack.wav' }).catch(() => {})
    }
    st.hTask = brief(e.text, 4, 22)
    st.plan = brief(e.text, 5, 28)
    st.promptText = e.text.slice(0, 600)
    startWhip()
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    poke = () => $.ui.invalidate('ui.render')
    later = (ms, fn) => {
      void $.clock.after(ms, fn)
    }
    sfx = n => {
      void $.audio.play({ asset: n === 'slam' ? 'sounds/slam.wav' : n === 'crash' ? 'sounds/crash.wav' : 'sounds/crack.wav' }).catch(() => {})
    }
    if (e.agentId === undefined) {
      mainBusy = true
      if (st.phase === 'idle') {
        st.hTask = brief(e.text, 4, 22)
        st.plan = brief(e.text, 5, 28)
        st.promptText = e.text.slice(0, 600)
        startWhip()
      }
    } else if (!agentWorker.has(e.agentId)) {
      const hint = agentHints.shift()
      const w = hintOf(e.text) ?? (hint !== undefined && hint !== '' ? hint : pickWorker(''))
      agentWorker.set(e.agentId, w)
      startWork(w, e.text)
    }
    return next(e)
  })

  // Watch the model think and write, live: the newest words show in the speech bubble of whoever it is
  // (Claude for the main loop, the AI looking after a subagent). Chunks pass through untouched.
  const flushing = new Set<string>()
  on('turn.step', async function* ($, e, next) {
    poke = () => $.ui.invalidate('ui.render')
    later = (ms, fn) => {
      void $.clock.after(ms, fn)
    }
    const key = e.agentId === undefined ? 'cl' : agentWorker.get(e.agentId) ?? ''
    let buf = ''
    const show = () => {
      flushing.delete(key)
      const t = tailWords(buf)
      if (t === '') return
      st.live[key] = t
      st.liveAt[key] = Date.now()
      poke()
      later(LIVE_TTL + 200, () => poke())
    }
    for await (const c of next(e)) {
      if (key !== '') {
        try {
          const piece = c.kind === 'thinking' || c.kind === 'text' ? c.text : c.kind === 'tool' ? ` ${c.name} ` : ''
          if (piece !== '') {
            buf = (buf + piece).slice(-400)
            const since = Date.now() - (st.liveAt[key] ?? 0)
            if (since >= 1300) show()
            else if (!flushing.has(key)) {
              flushing.add(key)
              later(1300 - since, show)
            }
          }
        } catch {
          // never let a drawing problem touch the model's stream
        }
      }
      yield c
    }
  })

  on('turn.complete', ($, e, next) => {
    poke = () => $.ui.invalidate('ui.render')
    later = (ms, fn) => {
      void $.clock.after(ms, fn)
    }
    sfx = n => {
      void $.audio.play({ asset: n === 'slam' ? 'sounds/slam.wav' : n === 'crash' ? 'sounds/crash.wav' : 'sounds/crack.wav' }).catch(() => {})
    }
    if (e.agentId === undefined) {
      finishAll()
    } else {
      const w = agentWorker.get(e.agentId)
      if (w !== undefined) {
        agentWorker.delete(e.agentId)
        endWork(w)
      }
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    poke = () => $.ui.invalidate('ui.render')
    later = (ms, fn) => {
      void $.clock.after(ms, fn)
    }
    sfx = n => {
      void $.audio.play({ asset: n === 'slam' ? 'sounds/slam.wav' : n === 'crash' ? 'sounds/crash.wav' : 'sounds/crack.wav' }).catch(() => {})
    }
    const args = e as unknown as { tool: string; command?: string; description?: string; run_in_background?: boolean }
    const failed = (who: string): void => {
      st.oops = { who, at: Date.now() }
      poke()
      later(1700, () => poke())
    }
    const watch = async (): Promise<ReturnType<typeof next>> => {
      const r = await next(e)
      const who = (e as unknown as { agentId?: string }).agentId
      if ((r as { isError?: boolean }).isError === true && st.phase === 'work') failed(who === undefined ? 'cl' : agentWorker.get(who) ?? 'cl')
      return r
    }
    if (args.tool === 'Agent' || args.tool === 'Task') {
      agentHints.push(hintOf(JSON.stringify(e).slice(0, 4000)) ?? '')
      if (agentHints.length > 8) agentHints.shift()
      return next(e)
    }
    if (args.tool.startsWith('mcp__')) {
      const w = hintOf(args.tool)
      if (w === undefined) return next(e)
      startWork(w, args.description ?? '')
      try {
        return await next(e)
      } finally {
        endWork(w)
      }
    }
    if (args.tool !== 'Bash') {
      return watch()
    }
    const named = bashWorker(args)
    if (args.run_in_background === true) {
      // wake an AI now; the next list of background work (classic.Stop) says how long to keep it up
      const w = named ?? pickWorker('')
      startWork(w, taskOf(args))
      bgPending.push(w)
      return next(e)
    }
    if (named === undefined) {
      return next(e)
    }
    startWork(named, taskOf(args))
    try {
      return await next(e)
    } finally {
      endWork(named)
    }
  })

  on('classic.Stop', ($, e, next) => {
    poke = () => $.ui.invalidate('ui.render')
    later = (ms, fn) => {
      void $.clock.after(ms, fn)
    }
    sfx = n => {
      void $.audio.play({ asset: n === 'slam' ? 'sounds/slam.wav' : n === 'crash' ? 'sounds/crash.wav' : 'sounds/crack.wav' }).catch(() => {})
    }
    syncBackground(e.background_tasks ?? [])
    return next(e)
  })

  on('classic.SubagentStop', ($, e, next) => {
    poke = () => $.ui.invalidate('ui.render')
    later = (ms, fn) => {
      void $.clock.after(ms, fn)
    }
    sfx = n => {
      void $.audio.play({ asset: n === 'slam' ? 'sounds/slam.wav' : n === 'crash' ? 'sounds/crash.wav' : 'sounds/crack.wav' }).catch(() => {})
    }
    syncBackground(e.background_tasks ?? [])
    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    return <Svg source={buildScene(Date.now())} alt="Pixel scene: a chibi hero whips Claude awake, Claude hands work to Codex, the rest sleep in their beds" isInteractive />
  })
}
