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
    const m = new Map<string, string[]>()
    for (let y = 0; y < this.h; y++) {
      let x = 0
      while (x < this.w) {
        const c = this.d[y * this.w + x]
        if (c === undefined) {
          x++
          continue
        }
        let n = 1
        while (x + n < this.w && this.d[y * this.w + x + n] === c) n++
        const k = only ?? c
        const a = m.get(k) ?? []
        a.push(`M${ox + x} ${oy + y}h${n}v1h-${n}z`)
        m.set(k, a)
        x += n
      }
    }
    return [...m].map(([c, p]) => `<path fill="${c}" d="${p.join('')}"/>`).join('')
  }
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
  { id: 'ds', awake: m => whale(28, m), lying: () => whale(24, 'asleep').flipH(), q: '#2d9a8a', r: '#52c4b2', hand: '#4d6bfe', eyeRow: 10 },
  { id: 'gp', awake: m => gpt(SA, m), lying: () => gpt(SL, 'asleep').rotL(), q: '#b8553a', r: '#de7c5e', hand: '#0b8a6b', eyeRow: 12 },
]
const sitOf = (c: Creature) => 24 + c.eyeRow - c.awake('awake').h

// ---------- furniture & props ----------
const WOOD = '#a8703f'
const WOOD_D = '#7a4a28'

const bedCv = () => {
  const c = new Cv(34, 14)
  c.rect(0, 1, 3, 13, WOOD_D)
  c.rect(0, 0, 3, 1, '#c28851')
  c.rect(1, 1, 1, 12, WOOD)
  c.rect(31, 7, 3, 7, WOOD_D)
  c.rect(31, 6, 3, 1, '#c28851')
  c.rect(3, 6, 28, 5, '#eef0fa')
  c.rect(3, 6, 28, 1, '#ffffff')
  c.rect(3, 10, 28, 1, '#c3c9e2')
  c.rect(3, 11, 28, 2, WOOD)
  c.rect(3, 12, 28, 1, WOOD_D)
  c.rect(3, 13, 2, 1, WOOD_D)
  c.rect(29, 13, 2, 1, WOOD_D)
  c.rect(5, 3, 10, 4, '#ffffff')
  c.rect(5, 6, 10, 1, '#d5dcf5')
  c.rect(6, 3, 8, 1, '#f4f6ff')
  return c
}

const blanketCv = (q: string, r: string, w: number) => {
  const h = 17
  const c = new Cv(w, h)
  const dark = mix(q, '#000000', 0.28)
  const mid = mix(q, '#000000', 0.12)
  for (let x = 0; x < w; x++) {
    // the quilt follows the body: tall near the chest, lower at the feet, rounded at the shoulder
    const top = 1 + Math.round((3 * x) / (w - 1)) + Math.max(0, 3 - x)
    for (let y = top; y < h; y++) c.set(x, y, y <= top + 1 ? r : y === h - 1 ? dark : (x + y) % 6 === 0 ? mid : q)
  }
  for (let x = 6; x < w; x += 6) for (let y = 5; y < h - 1; y++) c.set(x, y, dark)
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
  const c = new Cv(9, 7)
  c.rect(0, 0, 9, 7, body)
  c.rect(0, 0, 9, 1, edge)
  c.rect(0, 6, 9, 1, edge)
  c.rect(0, 0, 1, 7, edge)
  c.rect(8, 0, 1, 7, edge)
  for (let i = 0; i < 4; i++) {
    c.set(1 + i, 1 + i, edge)
    c.set(7 - i, 1 + i, edge)
  }
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

// ---------- Vietnamese pixel text: a 6x10 bitmap font cut from a bold mono face ----------
const VF: Record<string, readonly number[]> = {
  "!": [0,8,8,8,8,8,0,8,0,0],
  ",": [0,0,0,0,0,0,8,8,16,0],
  "?": [0,14,18,2,4,8,0,8,0,0],
  "a": [0,0,0,14,2,30,18,30,0,0],
  "b": [16,16,16,28,18,18,18,28,0,0],
  "c": [0,0,0,14,16,16,16,14,0,0],
  "d": [2,2,2,14,18,18,18,14,0,0],
  "e": [0,0,0,12,18,30,16,14,0,0],
  "g": [0,0,0,14,18,18,18,14,2,14],
  "h": [16,16,16,30,18,18,18,18,0,0],
  "i": [8,8,0,24,8,8,8,62,0,0],
  "k": [16,16,16,20,24,28,20,22,0,0],
  "l": [24,8,8,8,8,8,8,14,0,0],
  "m": [0,0,0,62,42,42,42,42,0,0],
  "n": [0,0,0,30,18,18,18,18,0,0],
  "o": [0,0,0,12,18,18,18,12,0,0],
  "r": [0,0,0,30,16,16,16,16,0,0],
  "s": [0,0,0,30,16,28,2,30,0,0],
  "t": [0,0,8,30,8,8,8,14,0,0],
  "u": [0,0,0,18,18,18,18,30,0,0],
  "v": [0,0,0,18,18,18,12,12,0,0],
  "y": [0,0,0,18,30,12,12,12,8,24],
  "à": [16,8,0,14,2,30,18,30,0,0],
  "â": [8,20,0,14,2,30,18,30,0,0],
  "ã": [10,20,0,14,2,30,18,30,0,0],
  "è": [16,8,0,12,18,30,16,14,0,0],
  "ê": [8,20,0,12,18,30,16,14,0,0],
  "ì": [16,8,0,24,8,8,8,62,0,0],
  "í": [4,8,0,24,8,8,8,62,0,0],
  "ó": [4,8,0,12,18,18,18,12,0,0],
  "ô": [12,18,0,12,18,18,18,12,0,0],
  "đ": [2,2,7,14,18,18,18,14,0,0],
  "ơ": [0,0,13,18,18,18,12,0,0,0],
  "ư": [0,0,37,38,36,36,60,0,0,0],
  "ả": [8,4,0,14,2,30,18,30,0,0],
  "ấ": [8,20,0,14,2,30,18,30,0,0],
  "ậ": [8,20,0,14,2,30,18,30,0,8],
  "ẹ": [0,0,0,12,18,30,16,14,0,8],
  "ệ": [8,20,0,12,18,30,16,14,0,8],
  "ồ": [12,18,0,12,18,18,18,12,0,0],
  "ộ": [8,20,0,12,18,18,18,12,0,8],
  "ớ": [4,8,0,13,18,18,18,12,0,0],
  "ờ": [16,8,0,13,18,18,18,12,0,0],
  "ụ": [0,0,0,18,18,18,18,30,0,8],
  "ủ": [8,4,0,18,18,18,18,30,0,0],
  "ừ": [32,16,0,37,38,36,36,60,0,0],
  "ử": [0,0,0,37,38,36,36,60,0,0],
  "ữ": [20,40,0,37,38,36,36,60,0,0],
}
const VADV = 6
const VH = 10
const HERO_SAY = ["dậy làm đi mày!", "ngủ đủ chưa mày?", "lười vừa thôi!", "tới giờ cày rồi!", "đừng giả vờ ngủ!", "dậy mau, trả lương đó!", "ngủ hoài vậy cha nội?", "deadline tới đít rồi!", "ê dậy, việc chờ kìa!", "làm lẹ lên con!"]
const CLAUDE_SAY = ["dậy làm đi mày!", "tụi bây ngủ đủ rồi!", "việc nè, đừng có than!", "đừng giả vờ ngủ nha!", "làm lẹ, tao đang chờ!", "ngủ nữa là mất lương!", "lười thì đi sửa bug!", "cày đi, đừng cãi tao!"]

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

// A speech bubble whose words pop in one after another. Returns the markup and its box.
const speech = (text: string, tailLeft: boolean, atX: (w: number) => number, bottom: number) => {
  const lines = wrapText(text, 11)
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
      out += `<g class="wd" style="animation-delay:${(0.1 + 0.28 * k).toFixed(2)}s">${c.svg(x + 3 + at * VADV, y + 2 + i * (VH + 1))}</g>`
      at += word.length + 1
      k++
    }
  })
  return out
}

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
const SK = '#f4c9a4'
const SKD = '#e0aa82'
const HAIR = '#15151c'
const NAVY = '#2f3d7c'
const NAVYD = '#252f66'
const PANTS = '#4b5799'
const INK = '#1a1420'
const CXH = 17
const OY = 8

const limb = (c: Cv, pts: [number, number][], thick: number, col: string, sleeve = 0) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!
    const [x1, y1] = pts[i + 1]!
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let s = 0; s <= n; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / n)
      const y = Math.round(y0 + ((y1 - y0) * s) / n)
      const isSleeve = i === 0 && s <= sleeve
      c.rect(x - Math.floor(thick / 2), y - Math.floor(thick / 2), thick, thick, isSleeve ? NAVY : col)
    }
  }
}

const heroHead = (dx: number, look: number) => {
  const c = new Cv(34, 26)
  const cx = CXH + dx
  const cy = OY + 5
  c.each((x, y) => {
    const u = (x + 0.5 - cx) / 9.5
    const v = (y + 0.5 - cy) / 9
    return u * u + v * v <= 1 ? SK : undefined
  })
  c.rect(Math.round(cx) - 11, cy + 1, 2, 4, SK)
  c.rect(Math.round(cx) + 9, cy + 1, 2, 4, SK)
  // short black hair: a cap, a side-swept fringe and a few spikes
  c.each((x, y) => {
    const u = (x + 0.5 - cx) / 10.5
    const v = (y + 0.5 - (cy - 1)) / 10
    if (u * u + v * v > 1) return undefined
    const fringe = cy - 3 + Math.round((x - cx) * 0.22)
    const side = Math.abs(x + 0.5 - cx) > 8 && y < cy + 1
    return y < fringe || side ? HAIR : undefined
  })
  for (const [x, y, w, h] of [[-6, -10, 3, 3], [-2, -12, 3, 4], [2, -11, 3, 3], [6, -9, 2, 3]] as const) c.rect(Math.round(cx) + x, cy + y, w, h, HAIR)
  const ex = Math.round(cx + look)
  for (const x of [ex - 5, ex + 3]) c.rect(x, cy + 1, 2, 3, INK)
  c.rect(ex - 6, cy + 5, 2, 1, '#f1b9a0')
  c.rect(ex + 4, cy + 5, 2, 1, '#f1b9a0')
  c.set(ex - 2, cy + 6, '#a8543f')
  c.rect(ex - 1, cy + 7, 3, 1, '#a8543f')
  c.set(ex + 2, cy + 6, '#a8543f')
  return c
}

const heroTorso = () => {
  const c = new Cv(34, 52)
  const t = OY + 15
  c.rect(CXH - 2, t, 4, 2, SKD)
  c.rect(CXH - 7, t + 2, 14, 12, NAVY)
  c.rect(CXH - 8, t + 3, 16, 10, NAVY)
  c.rect(CXH + 3, t + 3, 5, 10, NAVYD)
  c.rect(CXH - 7, t + 13, 14, 1, NAVYD)
  c.rect(CXH - 3, t + 2, 6, 1, '#e4e8ff')
  c.rect(CXH - 2, t + 3, 4, 1, '#e4e8ff')
  c.rect(CXH - 1, t + 4, 2, 1, '#e4e8ff')
  c.rect(CXH, t + 5, 1, 6, '#1b2350')
  c.set(CXH - 1, t + 6, '#e4e8ff')
  c.set(CXH - 1, t + 9, '#e4e8ff')
  return c
}

const heroLegs = (stance: 'close' | 'wide', lift: 'L' | 'R' | null) => {
  const c = new Cv(34, 52)
  const top = OY + 29
  const gap = stance === 'wide' ? 4 : 0
  const lx = CXH - 7 - gap / 2
  const rx = CXH + 2 + gap / 2
  const draw = (x: number, up: number) => {
    c.rect(x, top, 5, 6 - up, PANTS)
    c.rect(x + 3, top, 2, 6 - up, '#3c477f')
    c.rect(x - 1, top + 6 - up, 7, 2, INK)
    c.rect(x - 1, top + 7 - up, 7, 1, '#f4f4f4')
  }
  draw(Math.round(lx), lift === 'L' ? 2 : 0)
  draw(Math.round(rx), lift === 'R' ? 2 : 0)
  return c
}

type Pose = 'A' | 'B' | 'R' | 'W1' | 'W2' | 'W3'
const heroArms = (pose: Pose) => {
  const c = new Cv(40, 52)
  const ls = [CXH - 8, OY + 18] as [number, number]
  const rs = [CXH + 8, OY + 18] as [number, number]
  const hand = (x: number, y: number) => {
    c.rect(x - 1, y - 1, 3, 3, SK)
    c.rect(x, y, 2, 2, SKD)
  }
  if (pose === 'A' || pose === 'B') {
    const up = pose === 'A' ? ls : rs
    const dn = pose === 'A' ? rs : ls
    const s = pose === 'A' ? -1 : 1
    limb(c, [up, [up[0] + s * 6, up[1]], [up[0] + s * 6, up[1] - 8]], 3, SK, 3)
    hand(up[0] + s * 6, up[1] - 10)
    limb(c, [dn, [dn[0] - s * 6, dn[1]], [dn[0] - s * 6, dn[1] + 8]], 3, SK, 3)
    hand(dn[0] - s * 6, dn[1] + 9)
  } else if (pose === 'R') {
    limb(c, [ls, [ls[0] - 2, ls[1] + 9]], 3, SK, 3)
    limb(c, [rs, [rs[0] + 2, rs[1] + 9]], 3, SK, 3)
    hand(ls[0] - 2, ls[1] + 10)
    hand(rs[0] + 2, rs[1] + 10)
  } else {
    limb(c, [ls, [ls[0] - 4, ls[1] + 4], [ls[0] + 1, ls[1] + 8]], 3, SK, 3)
    hand(ls[0] + 2, ls[1] + 9)
    if (pose === 'W1') {
      limb(c, [rs, [rs[0] + 4, rs[1] - 8], [rs[0] + 5, rs[1] - 17]], 3, SK, 3)
      hand(rs[0] + 5, rs[1] - 19)
    } else if (pose === 'W2') {
      limb(c, [rs, [rs[0] + 5, rs[1] - 6], [rs[0] + 8, rs[1] - 14]], 3, SK, 3)
      hand(rs[0] + 8, rs[1] - 16)
    } else {
      limb(c, [rs, [rs[0] + 8, rs[1] - 1]], 3, SK, 3)
      hand(rs[0] + 9, rs[1] - 1)
    }
  }
  return c
}

const HX = 1
const HY = 39 // the shoes end 45 rows below the top of the person's sprite, so this puts them on the ground (GH = 84)
const heroPose = (pose: Pose) => {
  const wide = pose === 'W1' || pose === 'W2' || pose === 'W3'
  const dx = pose === 'A' ? -2 : pose === 'B' ? 2 : 0
  const look = pose === 'A' ? -1 : pose === 'B' ? 1 : wide ? 1 : 0
  const lift = pose === 'A' ? 'L' : pose === 'B' ? 'R' : null
  return [heroLegs(wide ? 'wide' : 'close', lift), heroTorso(), heroArms(pose), heroHead(dx, look)].map(c => c.svg(HX, HY)).join('')
}
// where the whip leaves the hand in each pose, in left-group coordinates
const HAND: Record<'W1' | 'W2' | 'W3', [number, number]> = {
  W1: [HX + CXH + 14, HY + OY - 3],
  W2: [HX + CXH + 17, HY + OY],
  W3: [HX + CXH + 19, HY + OY + 17],
}

// ---------- scene pieces ----------
const FLOOR = 72 // the ground line; every character stands on it
const GH = 84 // height of both character groups (their bottom edge is the floor; the top is headroom for three-line speech bubbles)
const LW = 72 // left group: the person, then Claude's bed
const RW = 94 // right group: Codex, DeepSeek and ChatGPT, side by side
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
  for (let i = 6; i <= 30; i++) {
    const a = i / 10
    out.push(`@media (min-aspect-ratio:${Math.round((a - 0.05) * 100)}/100) and (max-aspect-ratio:${Math.round((a + 0.05) * 100)}/100){${placeFor(a)}}`)
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

// One bed with its sleeper lying under a blanket, and the creature that stands up
// beside it: groggy first, then seated at a desk (Claude: holding a tablet).
const slot = (c: Creature, B: number, ax: number, bx: number) => {
  const sit = sitOf(c)
  const A = c.awake('awake')
  const D = c.awake('dazed')
  const ay = B - A.h
  const cx = ax + Math.round(A.w / 2)
  const lying = c.lying()
  const ly = B - 8 - lying.h + 1
  const lyX = bx + (lying.w > 20 ? 5 : 4)
  const bStart = lyX + Math.round(lying.w / 2)
  const bl = blanketCv(c.q, c.r, bx + 33 - bStart)
  const lap = laptopCv().svg(cx - 10, B - 22)
  return `<g class="bed bed-${c.id}">${bedCv().svg(bx, B - 14)}</g>
<g class="${c.id}-sl"><g class="breath">${lying.svg(lyX, ly)}${bl.svg(bStart, B - 3 - bl.h)}</g>
<g class="zz zz1">${ZZZ.svg(bx + 6, B - 31)}</g><g class="zz zz2">${ZZZ.svg(bx + 12, B - 36)}</g></g>
<g class="${c.id}-aw"><g class="jmp"><g class="sit"><g class="chairb">${chairBackCv().svg(cx - 13, ay - 1)}</g><g class="nm bob">${A.svg(ax, ay)}</g><g class="dz wob">${D.svg(ax, ay)}${QMARK.svg(cx - 2, ay - 9)}</g><g class="rd">${A.svg(ax, ay, '#ff4d4d')}</g></g></g>
<g class="desk desk-${c.id}">${deskCv().svg(ax - 4, B - 14)}<g class="lap">${lap}</g><g class="hand h1">${new Cv(3, 3).svg(0, 0)}<path fill="${c.hand}" d="M${cx - 7} ${B - 25}h4v3h-4z"/></g><g class="hand h2"><path fill="${c.hand}" d="M${cx + 3} ${B - 25}h4v3h-4z"/></g></g>
<g class="vein">${VEIN.svg(cx + 8, ay - 3)}</g><g class="stm stm1">${new Cv(2, 2).svg(0, 0)}<path fill="#e8ecff" d="M${cx - 6} ${ay - 2}h3v3h-3z"/></g><g class="stm stm2"><path fill="#e8ecff" d="M${cx + 3} ${ay - 5}h3v3h-3z"/></g>
<g class="pk pk-${c.id}-in">${envCv('#ffd988', '#8a5a1c').svg(cx - 4, ay - 10)}</g><g class="pk pk-${c.id}-out">${envCv('#8fe3ac', '#1b5a34').svg(cx - 4, ay - 10)}</g>
${c.id === 'cl' ? `<g class="tab"><g class="tshake">${tabletCv().svg(ax + A.w - 8, ay + 3)}<g class="ping"><path fill="#ff4d4d" d="M${ax + A.w + 1} ${ay + 4}h2v2h-2z"/></g></g></g>` : ''}</g>`
}

// Layout (local units, K root units each). Claude's slot sits above the person in the
// Left margin: the person, then Claude's bed. Right margin: the three workers, side by
// side. All of them stand on the same ground line.
const CSX = 38 // Claude's bed x (Claude stands at CSX + 4)

const whipPts = (pose: 'W1' | 'W2' | 'W3'): [number, number][] => {
  const [hx, hy] = HAND[pose]
  if (pose === 'W1') return [[hx, hy], [hx - 4, hy - 5], [hx - 12, hy - 8], [hx - 20, hy - 6], [hx - 24, hy]]
  if (pose === 'W2') return [[hx, hy], [hx + 4, hy - 6], [hx + 11, hy - 8], [hx + 15, hy - 5], [hx + 17, hy + 1]]
  return [[hx, hy], [hx + 8, hy - 2], [CSX + 14, GH - 16]]
}

const leftInner = () => {
  const poses: Pose[] = ['A', 'B', 'R', 'W1', 'W2', 'W3']
  const crack = [[2, 0], [2, 1], [2, 3], [2, 4], [0, 2], [1, 2], [3, 2], [4, 2]]
  const shock = new Cv(LW, GH)
  crack.forEach(([x, y]) => shock.set(CSX + 12 + x!, GH - 19 + y!, '#ffd45e'))
  return `${slot(CAST[0]!, GH, CSX + 4, CSX)}
${poses.map(p => `<g class="p${p}">${heroPose(p)}</g>`).join('')}
${(['W1', 'W2', 'W3'] as const).map(p => `<g class="w${p}">${poly(LW, GH, whipPts(p), '#f1e2b0').svg(0, 0)}</g>`).join('')}
<g class="wcrack">${shock.svg(0, 0)}</g>
<g class="bang"><path fill="#ff4f72" d="M${CSX + 16} ${GH - 32}h2v6h-2zM${CSX + 16} ${GH - 24}h2v2h-2z"/></g>
<g class="heart">${HEART.svg(HX + CXH - 4, HY - 6)}</g>
<g class="cbub">${CHECK.svg(CSX + 18, GH - 40)}</g>
`
}

const rightInner = () =>
  CAST.slice(1)
    .map((c, i) => `${slot(c, GH, i * 30 + 4, i * 30)}<g class="spk spk-${c.id}">${SPARK.svg(i * 30 + 21, GH - 34)}</g>`)
    .join('\n')
const LEFT_INNER = leftInner()
const RIGHT_INNER = rightInner()

// message envelopes cross the sky between Claude and whoever works
const win = (a: number, b: number) => `${a}%,${b}%{opacity:1}`
const WIN = {
  W1: [41.6, 54.1],
  W2: [54.1, 64.5],
  W3: [64.5, 81.2],
} as const

const castCss = () => {
  return CAST.map(c => {
  const sit = sitOf(c)
  const base = c.id === 'cl' ? '.lp' : `.a-${c.id}`
  const out = [
    `@keyframes sit-${c.id}{to{transform:translateY(-${sit}px)}}`,
    `${base} .desk-${c.id}{opacity:1}`,
    `${base} .${c.id}-aw .chairb{opacity:1}`,
    `${base} .${c.id}-aw .sit{animation:sit-${c.id} .01s steps(1) forwards}`,
    `${base} .${c.id}-aw .h1{animation:typ .3s steps(1) infinite}`,
    `${base} .${c.id}-aw .h2{animation:typ .3s steps(1) infinite .15s}`,
  ]
  if (c.id === 'cl') {
    out.push(`.lp .desk-cl{opacity:0;animation:popIn .3s steps(1) forwards}`, `.lp .cl-aw .chairb{opacity:0;animation:popIn .3s steps(1) forwards}`)
    return out.join('\n')
  }
  out.push(
    `.a-${c.id} .${c.id}-sl{opacity:0}.a-${c.id} .${c.id}-aw{opacity:1}.a-${c.id} .bed-${c.id}{opacity:0}`,
    `.a-${c.id} .spk-${c.id}{opacity:1;animation:blink .5s steps(2) infinite}`,
    `.s-${c.id} .${c.id}-aw .dz{animation:dzA 1.4s steps(1) forwards}`,
    `.s-${c.id} .${c.id}-aw .nm{animation:nmA 1.4s steps(1) forwards}`,
    `.s-${c.id} .${c.id}-aw .jmp{animation:jmp .5s steps(5) 1}`,
    `.s-${c.id} .desk-${c.id}{opacity:0;animation:popIn .3s steps(1) 1.4s forwards}`,
    `.s-${c.id} .${c.id}-aw .chairb{opacity:0;animation:popIn .3s steps(1) 1.4s forwards}`,
    `.s-${c.id} .${c.id}-aw .sit{animation-delay:1.4s}`,
    `.g-${c.id} .${c.id}-aw .sit{animation:none}`,
    `.g-${c.id} .${c.id}-aw .chairb{opacity:0}`,
    `.g-${c.id} .desk-${c.id}{animation:slam 2.4s steps(1) forwards}`,
    `.g-${c.id} .${c.id}-aw .lap{animation:yeet 2.4s steps(14) forwards}`,
    `.g-${c.id} .${c.id}-aw .hand{opacity:0}`,
    `.g-${c.id} .${c.id}-aw .jmp{animation:stomp .4s steps(4) 6}`,
    `.g-${c.id} .${c.id}-aw .rd{animation:redf .3s steps(2) infinite}`,
    `.g-${c.id} .${c.id}-aw .vein{animation:blink .3s steps(2) infinite}`,
    `.g-${c.id} .${c.id}-aw .stm1{animation:steam 1s steps(4) infinite}`,
    `.g-${c.id} .${c.id}-aw .stm2{animation:steam 1s steps(4) infinite .5s}`,
    `.s-${c.id} .pk-${c.id}-in{opacity:1;animation:envIn 1.1s steps(11) forwards}`,
    `.r-${c.id} .pk-${c.id}-out{opacity:1;animation:envOut 1.2s steps(12) forwards}`,
  )
  return out.join('\n')
  }).join('\n')
}

const sceneCss = () => `
.cl-sl,.cx-sl,.ds-sl,.gp-sl{opacity:1}
.cl-aw,.cx-aw,.ds-aw,.gp-aw,.dz,.chairb,.desk,.vein,.stm,.rd,.tab,.pR,.pW1,.pW2,.pW3,.wW1,.wW2,.wW3,.wcrack,.bang,.hsay,.heart,.cbub,.pk,.spk,.say-b,.wd{opacity:0}
.ca .cl-sl{opacity:0}.ca .cl-aw{opacity:1}.ca .bed-cl{opacity:0}
.ph-whip .bed-cl{animation:kCs 2.4s steps(1) forwards}
.lap,.tshake{transform-box:fill-box;transform-origin:center}
.pA{animation:dA 1s steps(1) infinite}.pB{animation:dB 1s steps(1) infinite}
@keyframes dA{0%{opacity:1}50%{opacity:0}}
@keyframes dB{0%{opacity:0}50%{opacity:1}}
.bob{animation:bob .8s steps(1) infinite}
.wob{animation:wob .6s steps(1) infinite}
.breath{animation:br 3s steps(1) infinite}
@keyframes br{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}100%{transform:translateY(0)}}
@keyframes wob{0%{transform:translateX(-1px)}50%{transform:translateX(1px)}100%{transform:translateX(-1px)}}
@keyframes jmp{0%{transform:translateY(0)}30%{transform:translateY(-6px)}60%{transform:translateY(0)}80%{transform:translateY(-1px)}100%{transform:translateY(0)}}
@keyframes dzA{0%,99%{opacity:1}100%{opacity:0}}
@keyframes nmA{0%,99%{opacity:0}100%{opacity:1}}
@keyframes blink{0%{opacity:1}50%{opacity:.2}100%{opacity:1}}
@keyframes typ{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes popIn{0%,32%{opacity:0}33%,65%{opacity:.5}66%,100%{opacity:1}}
@keyframes slam{0%{opacity:1;transform:translateY(0)}6%{transform:translateY(2px)}12%{transform:translateY(0)}18%{transform:translateY(2px)}24%{transform:translateY(0)}30%{transform:translateY(2px)}36%{transform:translateY(0)}58%{opacity:1}60%,100%{opacity:0}}
@keyframes yeet{0%,18%{opacity:1;transform:translate(0,0) rotate(0deg)}70%{opacity:1;transform:translate(18px,-16px) rotate(540deg)}71%,100%{opacity:0;transform:translate(18px,-16px)}}
@keyframes stomp{0%{transform:translateY(0)}50%{transform:translateY(-2px)}100%{transform:translateY(0)}}
@keyframes redf{0%{opacity:0}50%{opacity:.55}100%{opacity:0}}
@keyframes steam{0%{opacity:0;transform:translateY(0)}25%{opacity:.9}100%{opacity:0;transform:translateY(-7px)}}
@keyframes shake{0%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}
.zz{animation:zz 3s steps(4) infinite}.zz2{animation-delay:-1.5s}
@keyframes zz{0%{opacity:0;transform:translate(0,3px)}25%{opacity:1;transform:translate(0,1px)}75%{opacity:1;transform:translate(2px,-3px)}100%{opacity:0;transform:translate(2px,-5px)}}
.tb .tab{opacity:1}
.say .pk-cl-out{opacity:1;animation:envR 1.1s steps(11) forwards}
.rcv .pk-cl-in{opacity:1;animation:envL 1.2s steps(12) forwards}
@keyframes envIn{0%{opacity:1;transform:translateX(-20px)}85%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(0)}}
@keyframes envOut{0%{opacity:1;transform:translateX(0)}85%{opacity:1;transform:translateX(-20px)}100%{opacity:0;transform:translateX(-20px)}}
@keyframes envR{0%{opacity:1;transform:translateX(0)}85%{opacity:1;transform:translateX(20px)}100%{opacity:0;transform:translateX(20px)}}
@keyframes envL{0%{opacity:1;transform:translateX(20px)}85%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(0)}}
.say .tshake{animation:shake .2s steps(1) infinite}
.ping{animation:blink .6s steps(2) infinite}
.ph-whip .pA{animation:wA 2.4s steps(1) forwards}
.ph-whip .pB{animation:wB 2.4s steps(1) forwards}
.ph-whip .pW1{animation:kW1 2.4s steps(1) forwards}.ph-whip .wW1{animation:kW1 2.4s steps(1) forwards}
.ph-whip .pW2{animation:kW2 2.4s steps(1) forwards}.ph-whip .wW2{animation:kW2 2.4s steps(1) forwards}
.ph-whip .pW3{animation:kW3 2.4s steps(1) forwards}.ph-whip .wW3{animation:kW3 2.4s steps(1) forwards}
.ph-whip .wcrack{animation:kW3 2.4s steps(1) forwards}
.ph-whip .pR{animation:kR 2.4s steps(1) forwards}
.ph-whip .hsay{animation:kSay 2.4s steps(1) forwards}
.ph-whip .bang{animation:kBang 2.4s steps(1) forwards}
.ph-whip .cl-sl{animation:kCs 2.4s steps(1) forwards}
.ph-whip .cl-aw{animation:kCw 2.4s steps(1) forwards}
.ph-whip .cl-aw .dz{opacity:1}
.ph-whip .cl-aw .nm{opacity:0}
.ph-whip .cl-aw .jmp{animation:jmp .5s steps(5) 1.58s 1 both}
@keyframes wA{0%{opacity:1}20.8%{opacity:0}100%{opacity:0}}
@keyframes wB{0%{opacity:0}20.8%{opacity:1}41.6%{opacity:0}100%{opacity:0}}
@keyframes kW1{0%,${WIN.W1[0] - 0.1}%{opacity:0}${win(...WIN.W1)}${WIN.W1[1] + 0.1}%,100%{opacity:0}}
@keyframes kW2{0%,${WIN.W2[0] - 0.1}%{opacity:0}${win(...WIN.W2)}${WIN.W2[1] + 0.1}%,100%{opacity:0}}
@keyframes kW3{0%,${WIN.W3[0] - 0.1}%{opacity:0}${win(...WIN.W3)}${WIN.W3[1] + 0.1}%,100%{opacity:0}}
@keyframes kR{0%,81.2%{opacity:0}81.3%,100%{opacity:1}}
@keyframes kSay{0%,41.5%{opacity:1}41.6%,100%{opacity:0}}
@keyframes kBang{0%,64.4%{opacity:0}64.5%,95%{opacity:1}95.1%,100%{opacity:0}}
@keyframes kCs{0%,65.9%{opacity:1}66%,100%{opacity:0}}
@keyframes kCw{0%,65.9%{opacity:0}66%,100%{opacity:1}}
.dz-cl .cl-aw .dz{animation:dzA 1.2s steps(1) forwards}
.dz-cl .cl-aw .nm{animation:nmA 1.2s steps(1) forwards}
.ph-done .heart{opacity:1;animation:blink .8s steps(2) infinite}
.ph-done .cbub{opacity:1}
.say .say-b{opacity:1}
.ph-whip .hsay .wd{animation:wd 2.4s steps(1) forwards}
.say .say-b .wd{animation:wd 2.2s steps(1) forwards}
@keyframes wd{0%,99%{opacity:1}100%{opacity:1}}
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
    ...[...st.awake, ...st.recv, ...st.rage].map(w => `a-${w}`),
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
const bubbles = () =>
  `<g class="hsay">${speech(HERO_SAY[st.hSay % HERO_SAY.length]!, true, () => 0, HY + 1)}</g><g class="say-b">${speech(CLAUDE_SAY[st.cSay % CLAUDE_SAY.length]!, false, w => LW - w, HY + 1)}</g>`

const sceneStatic = () => `<g class="Lg"><svg x="0" y="0" width="${LW * KD}" height="${GH * KD}" viewBox="0 0 ${LW} ${GH}" preserveAspectRatio="xMinYMax meet">${LEFT_INNER}${bubbles()}</svg></g>
<g class="Rg"><svg x="0" y="0" width="${RW * KD}" height="${GH * KD}" viewBox="0 0 ${RW} ${GH}" preserveAspectRatio="xMaxYMax meet">${RIGHT_INNER}</svg></g>\n<g class="Gf">${GROUND.front.svg(0, FLOOR - 2)}</g>`

const buildScene = (now: number) => {
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
</style>
<rect width="160" height="90" fill="#1a1c2c"/>
<rect y="40" width="160" height="50" fill="#1f2340"/>
<rect y="62" width="160" height="28" fill="#262b4d"/>
${stars}
<g class="c1" style="animation-delay:${d(90)}">${cloud(0, 14, '#2f3560')}</g>
<g class="c2" style="animation-delay:${d(140)}">${cloud(0, 30, '#2a3058')}</g>
<g class="Mn"><rect x="96" y="10" width="8" height="8" fill="#ffcd75"/><rect x="98" y="8" width="4" height="12" fill="#ffcd75"/><rect x="94" y="12" width="12" height="4" fill="#ffcd75"/></g>
<g class="Gr">${GROUND.back.svg(0, FLOOR - 2)}</g>
${sceneStatic()}
</svg>`
}

const note = (wave: 'square' | 'triangle', notes: string[], step: number) => ({
  layers: [{ wave, notes, step }],
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'pixel-night', glass: false },
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
}


// ---------- reactions ----------
let poke = (): void => {}
let later = (_ms: number, _fn: () => void): void => {}
let sfx = (_n: 'slam' | 'crash' | 'crack'): void => {}

let firstLine = true
const startWhip = () => {
  const gen = ++st.gen
  st.hSay = firstLine ? 0 : Math.floor(Math.random() * HERO_SAY.length)
  firstLine = false
  mainBusy = true
  st.phase = 'whip'
  poke()
  later(1550, () => {
    if (st.gen === gen) sfx('crack')
  })
  later(2400, () => {
    if (st.gen === gen && st.phase === 'whip') {
      st.phase = 'work'
      st.fresh = true
      poke()
      later(1200, () => {
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

const finishAll = () => {
  const gen = ++st.gen
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
const pickWorker = (text: string): string => {
  if (/deepseek/i.test(text)) return 'ds'
  if (/chatgpt|openai|\bgpt\b/i.test(text)) return 'gp'
  if (/codex/i.test(text)) return 'cx'
  return [...WORKERS].sort((a, b) => (load[a] ?? 0) - (load[b] ?? 0))[0]!
}

const endWork = (w: string) => {
  load[w] = Math.max(0, (load[w] ?? 0) - 1)
  if ((load[w] ?? 0) > 0) return
  st.awake.delete(w)
  st.recv.add(w)
  poke()
  later(1200, () => {
    if (st.recv.delete(w)) {
      st.rage.add(w)
      poke()
      for (const t of [140, 430, 720]) later(t, () => sfx('slam'))
      later(1000, () => sfx('crash'))
      later(2400, () => {
        st.rage.delete(w)
        settle()
        poke()
      })
    }
  })
}

const startWork = (w: string) => {
  load[w] = (load[w] ?? 0) + 1
  const t = (tok[w] = (tok[w] ?? 0) + 1)
  if (st.phase === 'idle') st.phase = 'work'
  st.recv.delete(w)
  st.rage.delete(w)
  if (!st.awake.has(w)) {
    st.cSay = Math.floor(Math.random() * CLAUDE_SAY.length)
    st.awake.add(w)
    st.send.add(w)
    later(2200, () => {
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

const bashWorker = (e: { command?: string }): string | undefined => {
  const text = e.command ?? ''
  if (/codex/i.test(text)) return 'cx'
  if (/deepseek/i.test(text)) return 'ds'
  if (/chatgpt|openai|\bgpt\b/i.test(text)) return 'gp'
  return undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    poke = () => $.ui.invalidate('ui.render')
    later = (ms, fn) => {
      void $.clock.after(ms, fn)
    }
    sfx = n => {
      void $.audio.play({ asset: n === 'slam' ? 'sounds/slam.wav' : n === 'crash' ? 'sounds/crash.wav' : 'sounds/crack.wav' }).catch(() => {})
    }
    const bad = problems.find(line => line.startsWith("Desktop won't paint"))
    if (bad !== undefined) {
      $.ui.toast(bad)
    }
    try {
      await $.theme.set(LOOK)
    } catch (error) {
      $.ui.log(String(error))
      const { sound: _s, style: _y, ...rest } = LOOK
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
      if (st.phase === 'idle') startWhip()
    } else if (!agentWorker.has(e.agentId)) {
      const w = pickWorker(e.text)
      agentWorker.set(e.agentId, w)
      startWork(w)
    }
    return next(e)
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
    const args = e as unknown as { tool: string; command?: string; run_in_background?: boolean }
    if (args.tool !== 'Bash') {
      return next(e)
    }
    const named = bashWorker(args)
    if (args.run_in_background === true) {
      // a background shell has no end event: show a short burst of work
      const w = named ?? pickWorker('')
      startWork(w)
      later(8000, () => endWork(w))
      return next(e)
    }
    if (named === undefined) {
      return next(e)
    }
    startWork(named)
    try {
      return await next(e)
    } finally {
      endWork(named)
    }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    return <Svg source={buildScene(Date.now())} alt="Pixel scene: a chibi hero whips Claude awake, Claude hands work to Codex, the rest sleep in their beds" isInteractive />
  })
}
