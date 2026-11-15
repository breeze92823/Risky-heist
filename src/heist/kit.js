// Building blocks shared by the hub, the heist building and the base: world-scaled
// box UVs (so every studded surface has the same stud size), a material cache,
// boxes that can also be solid (Rapier fixed colliders), info labels (multi-line
// outlined text sprites that can be repainted) and glow / ray sprites.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
} from 'three'
import { RAPIER, addFixed } from '../physics.js'
import { fontReady } from '../propkit.js'
import { paintAsphalt, paintBrickStuds, paintCliff, paintRays, paintRing, paintStuds } from './paint.js'
import { paintSoftDot } from '../textures.js'

// --- Textures (one instance per painter; UVs are in metres) ---------------------
const texCache = new Map()
function tex(key, make, { tile = 4, srgb = true } = {}) {
  const k = `${key}:${tile}:${srgb}`
  if (!texCache.has(k)) {
    const t = new CanvasTexture(make())
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(1 / tile, 1 / tile)
    t.anisotropy = 8
    if (srgb) t.colorSpace = SRGBColorSpace
    texCache.set(k, t)
  }
  return texCache.get(k)
}
export function plainTex(c, srgb = true) {
  const t = new CanvasTexture(c)
  if (srgb) t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

// --- Materials ----------------------------------------------------------------
const matCache = new Map()
function memo(key, make) {
  if (!matCache.has(key)) matCache.set(key, make())
  return matCache.get(key)
}

// Studded toy-brick surface. kind 'round' | 'tile'; tile = metres per texture tile (4 studs).
export function studs(color, { kind = 'round', tile = 4, rough = 0.62, emissive = null, ei = 0 } = {}) {
  return memo(`studs:${color}:${kind}:${tile}:${rough}:${emissive}:${ei}`, () => {
    const p = paintStuds({ kind })
    return new MeshStandardMaterial({
      color,
      map: tex(`studs-c-${kind}`, () => p.color, { tile }),
      normalMap: tex(`studs-n-${kind}`, () => p.normal, { tile, srgb: false }),
      normalScale: new Vector2(0.8, 0.8),
      roughness: rough,
      metalness: 0,
      ...(emissive ? { emissive, emissiveIntensity: ei } : {}),
    })
  })
}
export function bricks(color, { tile = 4, rough = 0.7 } = {}) {
  return memo(`bricks:${color}:${tile}`, () => {
    const p = paintBrickStuds()
    return new MeshStandardMaterial({
      color,
      map: tex('bricks-c', () => p.color, { tile }),
      normalMap: tex('bricks-n', () => p.normal, { tile, srgb: false }),
      normalScale: new Vector2(0.7, 0.7),
      roughness: rough,
    })
  })
}
export function cliff() {
  return memo('cliff', () => {
    const p = paintCliff()
    return new MeshStandardMaterial({
      map: tex('cliff-c', () => p.color, { tile: 8 }),
      normalMap: tex('cliff-n', () => p.normal, { tile: 8, srgb: false }),
      roughness: 0.92,
    })
  })
}
export function asphalt(color = '#7d7f8c') {
  return memo(`asphalt:${color}`, () => {
    const p = paintAsphalt()
    return new MeshStandardMaterial({ color, map: tex('asph-c', () => p.color, { tile: 6 }), normalMap: tex('asph-n', () => p.normal, { tile: 6, srgb: false }), roughness: 0.9 })
  })
}
export const solid = (color, rough = 0.6, metal = 0, extra = {}) => memo(`solid:${color}:${rough}:${metal}:${JSON.stringify(extra)}`, () => new MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }))
export const metal = (color, rough = 0.3) => solid(color, rough, 1)
export const emissive = (color, intensity = 2, base = '#000000') => memo(`emi:${color}:${intensity}:${base}`, () => new MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.5 }))
export const glass = (color = '#bfe6ff', opacity = 0.32) =>
  memo(`glass:${color}:${opacity}`, () => new MeshPhysicalMaterial({ color, roughness: 0.04, metalness: 0.1, transparent: true, opacity, depthWrite: false, side: DoubleSide, clearcoat: 1, envMapIntensity: 1.6 }))
export const additive = (color, opacity = 0.85, map = null) =>
  memo(`add:${color}:${opacity}:${map ? map.uuid : ''}`, () => new MeshBasicMaterial({ color, map, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }))

// --- Geometry -----------------------------------------------------------------
// Box whose UVs are in metres on every face, so textures keep one scale.
export function boxGeo(w, h, d) {
  const g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]] // px nx py ny pz nz
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1])
    }
  }
  return g
}

// A box mesh at (x, y-centre, z). opts: collide (fixed collider), rotY, cast, receive.
export function box(parent, w, h, d, mat, x, y, z, { collide = false, rotY = 0, cast = true, receive = true } = {}) {
  const m = new Mesh(boxGeo(w, h, d), mat)
  m.position.set(x, y, z)
  m.rotation.y = rotY
  m.castShadow = cast
  m.receiveShadow = receive
  parent.add(m)
  if (collide) m.userData.collider = solidCuboid(w / 2, h / 2, d / 2, x, y, z, rotY)
  return m
}
// Box from min/max corners (handy for walls and slabs).
export function boxMM(parent, x0, y0, z0, x1, y1, z1, mat, opts) {
  return box(parent, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, opts)
}

export function solidCuboid(hx, hy, hz, x, y, z, rotY = 0, rotX = 0) {
  // rotation: yaw then pitch (pitch about local X)
  const cy = Math.cos(rotY / 2)
  const sy = Math.sin(rotY / 2)
  const cx = Math.cos(rotX / 2)
  const sx = Math.sin(rotX / 2)
  const q = { x: cy * sx, y: sy * cx, z: -sy * sx, w: cy * cx }
  return addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y, z }, q)
}
export function solidMM(x0, y0, z0, x1, y1, z1) {
  return solidCuboid(Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
}

// --- Sprites ------------------------------------------------------------------
let raysTex = null
let dotTex = null
let ringTex = null
export function raysTexture() {
  return (raysTex ??= plainTex(paintRays()))
}
export function dotTexture() {
  return (dotTex ??= plainTex(paintSoftDot(64)))
}
export function ringTexture() {
  return (ringTex ??= plainTex(paintRing()))
}
export function glowSprite(color, size, opacity = 0.8) {
  const s = new Sprite(new SpriteMaterial({ map: dotTexture(), color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false }))
  s.scale.set(size, size, 1)
  return s
}
// Flat glowing disc on the ground (interaction rings, treasure rays).
export function groundDecal(map, color, size, opacity = 0.9) {
  const m = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false }))
  m.rotation.x = -Math.PI / 2
  m.renderOrder = 2
  return m
}

// --- Info labels --------------------------------------------------------------
// lines: [{ text, color, size (px at 1x), outline, weight }]. Returns a Sprite whose
// .setLines(lines) repaints it. worldPerPx sets the scale (metres per canvas pixel).
const FONT = 'Fredoka, "Arial Black", sans-serif'
function paintLines(c, lines, pad = 10) {
  const ctx = c.getContext('2d')
  let w = 0
  let h = 0
  const metrics = lines.map((l) => {
    ctx.font = `${l.weight ?? 700} ${l.size}px ${FONT}`
    const tw = ctx.measureText(l.text).width
    w = Math.max(w, tw)
    h += l.size * 1.12
    return tw
  })
  const ow = Math.max(...lines.map((l) => l.size * 0.22))
  const cw = Math.ceil(w + pad * 2 + ow * 2)
  const ch = Math.ceil(h + pad * 2)
  if (c.width !== cw || c.height !== ch) {
    c.width = cw
    c.height = ch
  } else ctx.clearRect(0, 0, cw, ch)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  let y = pad
  lines.forEach((l) => {
    ctx.font = `${l.weight ?? 700} ${l.size}px ${FONT}`
    const cy = y + l.size * 0.56
    ctx.lineWidth = l.size * 0.22
    ctx.strokeStyle = l.outline ?? '#0d0a1f'
    ctx.strokeText(l.text, cw / 2, cy)
    ctx.fillStyle = l.color ?? '#ffffff'
    ctx.fillText(l.text, cw / 2, cy)
    y += l.size * 1.12
  })
  return metrics
}
export function infoLabel(lines, worldPerPx = 0.012, { depthTest = true, renderOrder = 5 } = {}) {
  const c = document.createElement('canvas')
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest, fog: false }))
  sprite.renderOrder = renderOrder
  sprite.center.set(0.5, 0)
  let current = lines
  let key = ''
  sprite.setLines = (next) => {
    const k = JSON.stringify(next)
    if (k === key) return
    key = k
    current = next
    const w0 = c.width
    const h0 = c.height
    paintLines(c, next)
    if (w0 !== c.width || h0 !== c.height) t.dispose()
    t.needsUpdate = true
    sprite.scale.set(c.width * worldPerPx, c.height * worldPerPx, 1)
  }
  sprite.setLines(lines)
  fontReady.then(() => {
    key = ''
    sprite.setLines(current)
  })
  sprite.dispose = () => {
    t.dispose()
    sprite.material.dispose()
  }
  return sprite
}

// A canvas-painted sign on a plane (both sides lit). draw(ctx, w, h) paints it; returns { mesh, redraw }.
export function canvasSign(w, h, pxW, pxH, draw, { emissiveBoost = 0.35, doubleSided = false } = {}) {
  const c = document.createElement('canvas')
  c.width = pxW
  c.height = pxH
  const t = plainTex(c)
  const mat = new MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new Color('#ffffff'), emissiveIntensity: emissiveBoost, roughness: 0.6, side: doubleSided ? DoubleSide : undefined })
  const mesh = new Mesh(new PlaneGeometry(w, h), mat)
  let painter = draw
  const redraw = () => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, pxW, pxH)
    painter(ctx, pxW, pxH)
    t.needsUpdate = true
  }
  redraw()
  fontReady.then(redraw)
  return {
    mesh,
    redraw,
    setDraw(fn) {
      painter = fn
      redraw()
    },
  }
}

// Rounded-rect path helper for canvas painters.
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
export function outlinedText(ctx, text, x, y, px, fill = '#fff', stroke = '#120a2a', weight = 700) {
  ctx.font = `${weight} ${px}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = px * 0.2
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

// --- Money formatting -----------------------------------------------------------
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']
export function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return '0'
  const neg = n < 0
  n = Math.abs(n)
  if (n < 1000) return (neg ? '-' : '') + (n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString())
  let i = 0
  while (n >= 1000 && i < SUFFIX.length - 1) {
    n /= 1000
    i++
  }
  const s = n >= 100 ? n.toFixed(Math.max(0, digits - 2)) : n >= 10 ? n.toFixed(Math.max(0, digits - 1)) : n.toFixed(digits)
  return (neg ? '-' : '') + parseFloat(s).toString() + SUFFIX[i]
}
export const money = (n) => `$${fmt(n)}`
export const commas = (n) => `$${Math.floor(n).toLocaleString('en-US')}`
