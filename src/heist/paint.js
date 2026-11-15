// Procedural canvases for Risky Heist: toy-brick studs (grounds, walls, carpets),
// cliff strata, asphalt, awning stripes, light-ray bursts, door panels and signs.
// Most painters are neutral grey so one texture serves many colours (the
// material colour tints it). Every result is cached by its arguments.
import { fbm, heightToNormal, mulberry32 } from '../textures.js'

const cache = new Map()
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}

function canvas(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// Writes a 0..1 shade field (grey) + height field into canvases.
function fieldsToMaps(shade, height, size, strength) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < shade.length; i++) {
    const v = Math.max(0, Math.min(255, shade[i] * 255))
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return { color: c, normal: heightToNormal(height, size, strength) }
}

// Toy-brick plate: `n` x `n` round studs per tile with a soft top highlight,
// thin seams every `seam` studs. kind 'round' (raised studs) or 'tile' (recessed
// squares, the hub lawn look).
export function paintStuds({ size = 256, n = 4, seam = 4, kind = 'round', seed = 11 } = {}) {
  return cached(`studs:${size}:${n}:${seam}:${kind}:${seed}`, () => {
    const noise = fbm(size, 8, 3, seed)
    const shade = new Float32Array(size * size)
    const height = new Float32Array(size * size)
    const cell = size / n
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x
        const cx = (x % cell) - cell / 2
        const cy = (y % cell) - cell / 2
        let h = 0.35
        let s = 0.8 + (noise[i] - 0.5) * 0.06
        if (kind === 'round') {
          const r = Math.hypot(cx, cy) / (cell * 0.32)
          if (r < 1) {
            h = 0.35 + Math.sqrt(1 - r * r) * 0.1 + 0.45
            // top highlight toward the upper left, shade on the lower right rim
            const lit = (-cx - cy) / (cell * 0.45)
            s = 0.86 + lit * 0.1 + (r > 0.82 ? -0.06 : 0)
          } else if (r < 1.18) {
            const d = (cx + cy) / (cell * 0.45)
            s = 0.8 - 0.12 * Math.max(0, d) // contact shadow on the low side
          }
        } else {
          const ax = Math.abs(cx) / (cell * 0.36)
          const ay = Math.abs(cy) / (cell * 0.36)
          const m = Math.max(ax, ay)
          if (m < 1) {
            h = 0.2
            s = 0.74 + (m > 0.86 ? 0.06 : 0)
          } else if (m < 1.12) {
            h = 0.28
            s = 0.88
          }
        }
        const sx = x % (cell * seam)
        const sy = y % (cell * seam)
        if (sx < 1.5 || sy < 1.5) {
          h -= 0.25
          s -= 0.12
        }
        shade[i] = s
        height[i] = h
      }
    }
    return fieldsToMaps(shade, height, size, kind === 'round' ? 2.4 : 1.6)
  })
}

// Brick wall with studs on the faces: staggered 2:1 bricks, a stud or two per brick.
export function paintBrickStuds({ size = 256, rows = 8, seed = 21 } = {}) {
  return cached(`bricks:${size}:${rows}:${seed}`, () => {
    const rand = mulberry32(seed)
    const noise = fbm(size, 8, 3, seed)
    const bh = size / rows
    const bw = bh * 2
    const tones = Array.from({ length: rows * 8 }, () => rand())
    const shade = new Float32Array(size * size)
    const height = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      const row = Math.floor(y / bh)
      const off = row % 2 ? bw / 2 : 0
      for (let x = 0; x < size; x++) {
        const i = y * size + x
        const bx = (x + off) % bw
        const by = y % bh
        const col = Math.floor((x + off) / bw) % 8
        const tone = tones[row * 8 + col]
        let s = 0.76 + tone * 0.1 + (noise[i] - 0.5) * 0.06
        let h = 0.5
        if (bx < 2 || by < 2) {
          s = 0.52
          h = 0.2
        } else {
          // two studs per brick
          for (const sxc of [bw * 0.27, bw * 0.73]) {
            const r = Math.hypot(bx - sxc, by - bh / 2) / (bh * 0.28)
            if (r < 1) {
              h = 0.75 + Math.sqrt(1 - r * r) * 0.1
              s += 0.07 + ((sxc - bx) + (bh / 2 - by)) / (bh * 2) * 0.12
            }
          }
          if (by > bh - 4) s -= 0.08 // bottom lip shade
        }
        shade[i] = s
        height[i] = h
      }
    }
    return fieldsToMaps(shade, height, size, 2)
  })
}

// Cliff face: horizontal block strata in red-brown with darker gaps (coloured, not tinted).
export function paintCliff(size = 256, seed = 31) {
  return cached(`cliff:${size}:${seed}`, () => {
    const rand = mulberry32(seed)
    const c = canvas(size)
    const ctx = c.getContext('2d')
    const height = new Float32Array(size * size)
    const rows = 8
    const rh = size / rows
    ctx.fillStyle = '#5c2318'
    ctx.fillRect(0, 0, size, size)
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 40
      while (x < size) {
        const w = 24 + rand() * 60
        const t = rand()
        const base = [[150, 62, 36], [176, 76, 42], [128, 48, 30], [196, 96, 52]][Math.floor(t * 4)]
        ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`
        ctx.fillRect(x + 1.5, r * rh + 1.5, w - 3, rh - 3)
        ctx.fillStyle = 'rgba(255,190,120,0.18)'
        ctx.fillRect(x + 1.5, r * rh + 1.5, w - 3, 3)
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.fillRect(x + 1.5, r * rh + rh - 5, w - 3, 3.5)
        for (let yy = Math.floor(r * rh + 2); yy < r * rh + rh - 2; yy++) {
          for (let xx = Math.max(0, Math.floor(x + 2)); xx < Math.min(size, x + w - 2); xx++) height[yy * size + xx] = 0.6 + t * 0.15
        }
        x += w
      }
    }
    return { color: c, normal: heightToNormal(height, size, 1.6) }
  })
}

// Asphalt: speckled grey with faint patches (tinted by the material).
export function paintAsphalt(size = 256, seed = 41) {
  return cached(`asphalt:${size}:${seed}`, () => {
    const n = fbm(size, 16, 4, seed)
    const big = fbm(size, 3, 2, seed + 1)
    const shade = new Float32Array(size * size)
    for (let i = 0; i < shade.length; i++) shade[i] = 0.62 + (n[i] - 0.5) * 0.22 + (big[i] - 0.5) * 0.1
    return fieldsToMaps(shade, n, size, 0.8)
  })
}

// Awning stripes (UV u across the stripes).
export function paintStripes(color, white = '#ffffff', stripes = 6, w = 128, h = 32) {
  return cached(`stripes:${color}:${white}:${stripes}`, () => {
    const c = canvas(w, h)
    const ctx = c.getContext('2d')
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? white : color
      ctx.fillRect((i / stripes) * w, 0, w / stripes + 1, h)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(0, h - 4, w, 4)
    return c
  })
}

// Light-ray burst (white on transparent; tinted additively under treasures).
export function paintRays(size = 256, rays = 14, seed = 51) {
  return cached(`rays:${size}:${rays}:${seed}`, () => {
    const rand = mulberry32(seed)
    const c = canvas(size)
    const ctx = c.getContext('2d')
    const m = size / 2
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + rand() * 0.2
      const spread = 0.06 + rand() * 0.07
      const len = m * (0.6 + rand() * 0.4)
      const g = ctx.createRadialGradient(m, m, 0, m, m, len)
      g.addColorStop(0, 'rgba(255,255,255,0.9)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(m, m)
      ctx.arc(m, m, len, a - spread, a + spread)
      ctx.closePath()
      ctx.fill()
    }
    const core = ctx.createRadialGradient(m, m, 0, m, m, m * 0.35)
    core.addColorStop(0, 'rgba(255,255,255,1)')
    core.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = core
    ctx.fillRect(0, 0, size, size)
    return c
  })
}

// Soft ring (glowing interaction circles on the ground).
export function paintRing(size = 128, width = 0.16) {
  return cached(`ring:${size}:${width}`, () => {
    const c = canvas(size)
    const ctx = c.getContext('2d')
    const m = size / 2
    const g = ctx.createRadialGradient(m, m, m * (1 - width * 2), m, m, m)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.55, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    const fill = ctx.createRadialGradient(m, m, 0, m, m, m)
    fill.addColorStop(0, 'rgba(255,255,255,0.18)')
    fill.addColorStop(0.8, 'rgba(255,255,255,0.08)')
    fill.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, size, size)
    return c
  })
}

// Wooden panel door (coloured): two tall and two short raised panels.
export function paintDoor(w = 128, h = 256) {
  return cached(`door:${w}:${h}`, () => {
    const rand = mulberry32(61)
    const c = canvas(w, h)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#7a2a12'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? '40,10,0' : '160,70,30'},${0.08 + rand() * 0.1})`
      ctx.fillRect(0, rand() * h, w, 1 + rand() * 3)
    }
    const panel = (x, y, pw, ph) => {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.fillRect(x, y, pw, ph)
      ctx.fillStyle = '#93371a'
      ctx.fillRect(x + 4, y + 4, pw - 8, ph - 8)
      ctx.fillStyle = 'rgba(255,170,110,0.25)'
      ctx.fillRect(x + 4, y + 4, pw - 8, 3)
    }
    panel(w * 0.12, h * 0.06, w * 0.33, h * 0.5)
    panel(w * 0.55, h * 0.06, w * 0.33, h * 0.5)
    panel(w * 0.12, h * 0.62, w * 0.33, h * 0.3)
    panel(w * 0.55, h * 0.62, w * 0.33, h * 0.3)
    return c
  })
}

// Clover luck sign: dark green board, clover leaf and "xN".
export function paintCloverSign(mult, w = 512, h = 256) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  const draw = () => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#5bd12a'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#0d4a12'
    ctx.fillRect(16, 16, w - 32, h - 32)
    const cx = w * 0.28
    const cy = h * 0.5
    const r = h * 0.17
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4
      const g = ctx.createRadialGradient(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, 2, cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, r * 1.1)
      g.addColorStop(0, '#c8ff5a')
      g.addColorStop(1, '#2fb52a')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#1a6b16'
      ctx.lineWidth = 5
      ctx.stroke()
    }
    ctx.font = '700 150px Fredoka, "Arial Black", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 16
    ctx.strokeStyle = '#06210a'
    ctx.strokeText(`x${mult}`, w * 0.68, h * 0.54)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`x${mult}`, w * 0.68, h * 0.54)
  }
  draw()
  return { canvas: c, draw }
}

// Leaves (voxel tree blocks): bright greens with lighter block edges (coloured).
export function paintLeaves(size = 64, seed = 71) {
  return cached(`leaves:${size}:${seed}`, () => {
    const rand = mulberry32(seed)
    const c = canvas(size)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#3fbf2a'
    ctx.fillRect(0, 0, size, size)
    const s = size / 4
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const t = rand()
        ctx.fillStyle = t < 0.3 ? '#55d633' : t < 0.6 ? '#3cb328' : '#2f9e22'
        ctx.fillRect(x * s, y * s, s, s)
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.fillRect(x * s, y * s, s, 2)
      }
    return c
  })
}
