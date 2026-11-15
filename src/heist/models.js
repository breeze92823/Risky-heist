// Procedural treasure models. Every builder returns a Group of a few dozen
// primitives with shared PBR materials (metals pick up the sky environment map),
// normalised to sit on y = 0 and fit a TARGET-metre box. makeTreasure(id)
// clones from a cache; thumbnail(id) renders one to a data URL for the HUD.
import {
  AmbientLight,
  Box3,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  LinearSRGBColorSpace,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { boxGeo } from './kit.js'
import { mulberry32 } from '../textures.js'

const TARGET = 1.25

// --- Materials -------------------------------------------------------------------
const M = {}
const mat = (key, make) => (M[key] ??= make())
const gold = () => mat('gold', () => new MeshStandardMaterial({ color: '#ffc531', metalness: 1, roughness: 0.22, emissive: '#5a3a00', emissiveIntensity: 0.25 }))
const darkGold = () => mat('dgold', () => new MeshStandardMaterial({ color: '#d99a12', metalness: 1, roughness: 0.32 }))
const silver = () => mat('silver', () => new MeshStandardMaterial({ color: '#e3e8f0', metalness: 1, roughness: 0.18 }))
const iron = () => mat('iron', () => new MeshStandardMaterial({ color: '#9aa1ad', metalness: 0.85, roughness: 0.38 }))
const black = () => mat('black', () => new MeshStandardMaterial({ color: '#1d1f26', roughness: 0.5, metalness: 0.2 }))
const plain = (c, r = 0.6, m = 0) => mat(`p${c}${r}${m}`, () => new MeshStandardMaterial({ color: c, roughness: r, metalness: m }))
const glow = (c, i = 2.5) => mat(`g${c}${i}`, () => new MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3 }))
const gem = (c, e = 0.45) =>
  mat(`gem${c}${e}`, () => new MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.04, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02, flatShading: true, envMapIntensity: 2.2, transparent: true, opacity: 0.92 }))
const glassMat = () => mat('glass', () => new MeshPhysicalMaterial({ color: '#d9f3ff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide, clearcoat: 1, envMapIntensity: 2 }))
const pearl = () => mat('pearl', () => new MeshPhysicalMaterial({ color: '#fff7f0', roughness: 0.12, metalness: 0.1, sheen: 1, sheenColor: '#ffd1f0', clearcoat: 1, iridescence: 0.6 }))
function canvasMat(key, w, h, draw, extra = {}) {
  return mat(key, () => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d'), w, h)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return new MeshStandardMaterial({ map: t, roughness: 0.6, ...extra })
  })
}

function add(g, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) {
  const m = new Mesh(geo, material)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  if (s) m.scale.set(s[0], s[1], s[2])
  m.castShadow = true
  g.add(m)
  return m
}
const B = (w, h, d) => boxGeo(w, h, d)
const cyl = (rt, rb, h, seg = 24) => new CylinderGeometry(rt, rb, h, seg)
const sph = (r, ws = 20, hs = 14) => new SphereGeometry(r, ws, hs)
const tor = (r, t, rs = 10, ts = 32, arc = Math.PI * 2) => new TorusGeometry(r, t, rs, ts, arc)
// An ingot: a tapered 4-sided prism.
function ingotGeo(w, h, d) {
  const g = new CylinderGeometry(0.72, 1, 1, 4, 1)
  g.rotateY(Math.PI / 4)
  g.scale(w / Math.SQRT2, h, d / Math.SQRT2)
  return g.toNonIndexed()
}
function crystalGeo(r, h) {
  const body = new CylinderGeometry(r, r * 1.05, h, 6)
  const tip = new ConeGeometry(r, r * 1.6, 6)
  tip.translate(0, h / 2 + r * 0.8, 0)
  return mergeGeometries([body, tip])
}
function dollarFace(key, bg = '#ffcf3a', fg = '#b77d00') {
  return canvasMat(key, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = fg
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = fg
    ctx.font = '700 84px Fredoka, Arial Black, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('$', w / 2, h / 2 + 4)
  }, { metalness: 0.9, roughness: 0.3 })
}

// --- Builders ----------------------------------------------------------------------
const BUILD = {
  coin() {
    const g = new Group()
    const face = dollarFace('coinface')
    add(g, cyl(0.5, 0.5, 0.1, 40), [gold(), face, face], 0, 0.55, 0, Math.PI / 2, 0, 0)
    add(g, tor(0.5, 0.045, 8, 40), darkGold(), 0, 0.55, 0.0)
    for (let i = 0; i < 3; i++) add(g, cyl(0.34, 0.34, 0.06, 32), [gold(), face, face], 0.55 + i * 0.02, 0.05 + i * 0.065, 0.1 - i * 0.04)
    return g
  },
  iron() {
    const g = new Group()
    const geo = ingotGeo(0.95, 0.28, 0.42)
    add(g, geo, iron(), -0.25, 0.14, 0)
    add(g, geo, iron(), 0.25, 0.14, 0.05, 0, 0.1, 0)
    add(g, geo, iron(), 0, 0.42, 0.02, 0, -0.08, 0)
    add(g, B(0.3, 0.02, 0.12), plain('#6b7280'), 0, 0.565, 0.02)
    return g
  },
  dollar() {
    const g = new Group()
    const bill = canvasMat('bill', 256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#8fd17a'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#2f6b2a'
      ctx.lineWidth = 8
      ctx.strokeRect(8, 8, w - 16, h - 16)
      ctx.fillStyle = '#d7f5c8'
      ctx.beginPath()
      ctx.ellipse(w / 2, h / 2, 34, 42, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2f6b2a'
      ctx.font = '700 60px Fredoka, Arial Black'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('$', w / 2, h / 2 + 3)
      ctx.font = '700 30px Fredoka, Arial Black'
      ctx.fillText('100', 40, 30)
      ctx.fillText('100', w - 40, h - 28)
    })
    const side = plain('#6fb85c')
    for (let i = 0; i < 7; i++) add(g, B(1.0, 0.035, 0.46), [side, side, bill, side, side, side], (i % 2) * 0.02, 0.02 + i * 0.036, (i % 3) * 0.015, 0, (i - 3) * 0.03, 0)
    add(g, B(0.16, 0.28, 0.5), plain('#f0e2b5'), 0, 0.13, 0)
    // a fanned bill on top
    add(g, B(1.0, 0.02, 0.46), [side, side, bill, side, side, side], 0.1, 0.32, -0.05, 0.25, 0.4, 0.12)
    return g
  },
  cashbag() {
    const g = new Group()
    const burlap = canvasMat('burlap', 128, 128, (ctx, w, h) => {
      const r = mulberry32(5)
      ctx.fillStyle = '#c9a26a'
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < w; i += 4) {
        ctx.fillStyle = `rgba(90,60,20,${0.08 + r() * 0.08})`
        ctx.fillRect(i, 0, 2, h)
        ctx.fillRect(0, i, w, 2)
      }
    }, { roughness: 0.95 })
    const pts = []
    const prof = [[0.0, 0], [0.32, 0.02], [0.5, 0.14], [0.56, 0.34], [0.52, 0.56], [0.4, 0.72], [0.2, 0.84], [0.12, 0.9], [0.16, 0.98], [0.26, 1.08], [0.2, 1.12]]
    for (const [x, y] of prof) pts.push(new Vector2(x, y))
    add(g, new LatheGeometry(pts, 28), burlap)
    add(g, tor(0.14, 0.04, 8, 24), plain('#6b3a17', 0.8), 0, 0.9, 0, Math.PI / 2)
    const tag = canvasMat('bagtag', 64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#2d7a2a'
      ctx.font = '700 58px Fredoka, Arial Black'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('$', w / 2, h / 2 + 3)
    })
    tag.transparent = true
    add(g, new PlaneGeometry(0.42, 0.42), tag, 0, 0.42, 0.565)
    return g
  },
  gem() {
    const g = new Group()
    add(g, new OctahedronGeometry(0.42, 0), gem('#22e0b0'), 0, 0.55, 0, 0, 0, 0, [1, 1.35, 1])
    add(g, new OctahedronGeometry(0.18, 0), gem('#7dffd9'), 0.42, 0.2, 0.1, 0.4, 0.3, 0)
    add(g, new OctahedronGeometry(0.14, 0), gem('#18c79a'), -0.38, 0.15, -0.12, 0.2, 0, 0.5)
    return g
  },
  bracelet() {
    const g = new Group()
    add(g, tor(0.42, 0.07, 12, 48), gold(), 0, 0.5, 0, 0.35, 0, 0)
    const cols = ['#ff4d6d', '#38c6ff', '#59ff8a', '#ffd23a']
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const m = add(g, sph(0.085, 12, 10), i % 2 ? gem(cols[(i / 2) % 4 | 0], 0.3) : pearl(), Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.42 * Math.cos(0.35), Math.sin(a) * 0.42 * Math.sin(0.35))
      m.scale.setScalar(i % 2 ? 1.1 : 0.9)
    }
    return g
  },
  binoculars() {
    const g = new Group()
    const body = black()
    const rubber = plain('#2b2f3a', 0.9)
    for (const x of [-0.24, 0.24]) {
      add(g, cyl(0.17, 0.17, 0.72, 24), body, x, 0.36, 0, Math.PI / 2, 0, 0)
      add(g, cyl(0.19, 0.19, 0.26, 24), rubber, x, 0.36, 0.05, Math.PI / 2, 0, 0)
      add(g, cyl(0.2, 0.17, 0.12, 24), body, x, 0.36, 0.38, Math.PI / 2, 0, 0)
      add(g, cyl(0.15, 0.15, 0.02, 24), gem('#5fb6ff', 0.6), x, 0.36, 0.445, Math.PI / 2, 0, 0)
      add(g, cyl(0.1, 0.12, 0.14, 20), body, x * 0.9, 0.36, -0.42, Math.PI / 2, 0, 0)
    }
    add(g, B(0.3, 0.1, 0.3), silver(), 0, 0.45, -0.05)
    add(g, cyl(0.05, 0.05, 0.42, 12), silver(), 0, 0.5, -0.05, 0, 0, Math.PI / 2)
    add(g, tor(0.38, 0.018, 6, 30, Math.PI), plain('#7a4a23'), 0, 0.36, -0.1, 0, 0, Math.PI)
    return g
  },
  goblet() {
    const g = new Group()
    const pts = [[0, 0], [0.34, 0], [0.34, 0.04], [0.12, 0.1], [0.06, 0.18], [0.05, 0.5], [0.09, 0.56], [0.2, 0.62], [0.36, 0.8], [0.42, 1.08], [0.4, 1.1], [0.34, 0.86], [0.0, 0.68]].map(([x, y]) => new Vector2(x, y))
    add(g, new LatheGeometry(pts, 32), silver())
    add(g, tor(0.41, 0.025, 8, 36), gold(), 0, 1.08, 0, Math.PI / 2)
    add(g, tor(0.09, 0.03, 8, 24), gold(), 0, 0.53, 0, Math.PI / 2)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      add(g, new OctahedronGeometry(0.055, 0), gem(i % 2 ? '#ff2d55' : '#2d7bff', 0.6), Math.cos(a) * 0.38, 0.86, Math.sin(a) * 0.38)
    }
    return g
  },
  watch() {
    const g = new Group()
    const face = canvasMat('watchface', 128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#fffaf0'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#222'
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        ctx.fillRect(w / 2 + Math.cos(a) * 50 - 3, h / 2 + Math.sin(a) * 50 - 3, 6, 6)
      }
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(w / 2, h / 2)
      ctx.lineTo(w / 2, h / 2 - 38)
      ctx.moveTo(w / 2, h / 2)
      ctx.lineTo(w / 2 + 26, h / 2 + 10)
      ctx.stroke()
    })
    add(g, cyl(0.42, 0.42, 0.14, 40), [gold(), face, gold()], 0, 0.5, 0, Math.PI / 2, 0, 0)
    add(g, tor(0.42, 0.05, 10, 40), darkGold(), 0, 0.5, 0)
    add(g, cyl(0.38, 0.38, 0.01, 40), glassMat(), 0, 0.5, 0.075, Math.PI / 2)
    add(g, cyl(0.06, 0.06, 0.14, 12), gold(), 0, 0.98, 0)
    add(g, tor(0.07, 0.02, 6, 16), gold(), 0, 1.08, 0)
    for (let i = 0; i < 7; i++) add(g, tor(0.05, 0.016, 6, 12), gold(), 0.1 + i * 0.08, 1.06 - Math.sin(i * 0.5) * 0.25 - i * 0.07, 0, 0, i % 2 ? Math.PI / 2 : 0, 0)
    return g
  },
  necklace() {
    const g = new Group()
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2
      add(g, sph(0.065, 12, 10), pearl(), Math.cos(a) * 0.45, 0.07 + (Math.sin(a) + 1) * 0.06, Math.sin(a) * 0.36)
    }
    add(g, new OctahedronGeometry(0.13, 0), gem('#3d6bff', 0.5), 0, 0.3, 0.42, 0, 0, 0, [0.8, 1.3, 0.6])
    add(g, tor(0.13, 0.02, 6, 20), gold(), 0, 0.3, 0.42)
    // velvet display bust
    const pts = [[0, 0], [0.22, 0], [0.22, 0.04], [0.1, 0.1], [0.12, 0.5], [0.32, 0.62], [0.36, 0.7], [0.12, 0.78], [0.0, 0.8]].map(([x, y]) => new Vector2(x, y))
    const bust = add(g, new LatheGeometry(pts, 24), plain('#3a1d4f', 0.9), 0, 0, -0.05)
    bust.scale.set(1, 1, 0.6)
    return g
  },
  goldbar() {
    const g = new Group()
    const geo = ingotGeo(0.9, 0.26, 0.4)
    add(g, geo, gold(), -0.24, 0.13, 0.2)
    add(g, geo, gold(), 0.24, 0.13, 0.2)
    add(g, geo, gold(), -0.24, 0.13, -0.24)
    add(g, geo, gold(), 0.24, 0.13, -0.24)
    add(g, geo, gold(), 0, 0.39, -0.02, 0, Math.PI / 2, 0)
    add(g, geo, gold(), 0, 0.65, -0.02, 0, 0.3, 0)
    return g
  },
  amethyst() {
    const g = new Group()
    add(g, new DodecahedronGeometry(0.42, 0), plain('#5f5a66', 0.95), 0, 0.14, 0, 0, 0, 0, [1.2, 0.45, 1])
    const r = mulberry32(9)
    const c = gem('#b14bff', 0.7)
    const c2 = gem('#e08cff', 0.6)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      const lean = 0.25 + r() * 0.35
      const h = 0.45 + r() * 0.5
      const m = add(g, crystalGeo(0.09 + r() * 0.05, h), i % 3 ? c : c2, Math.cos(a) * 0.2, 0.2 + h / 2, Math.sin(a) * 0.2)
      m.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean)
    }
    add(g, crystalGeo(0.16, 0.95), c, 0, 0.66, 0)
    return g
  },
  emerald() {
    const g = new Group()
    const cut = new CylinderGeometry(0.34, 0.5, 0.26, 8, 1)
    add(g, cut, gem('#17e05a', 0.55), 0, 0.72, 0, 0, Math.PI / 8, 0, [1, 1, 0.75])
    add(g, new ConeGeometry(0.5, 0.62, 8), gem('#0fb446', 0.5), 0, 0.28, 0, Math.PI, Math.PI / 8, 0, [1, 1, 0.75])
    add(g, cyl(0.34, 0.34, 0.01, 8), gem('#7dffa8', 0.9), 0, 0.855, 0, 0, Math.PI / 8, 0, [1, 1, 0.75])
    return g
  },
  diamond() {
    const g = new Group()
    const ice = gem('#e6fbff', 0.35)
    add(g, new CylinderGeometry(0.3, 0.55, 0.24, 10), ice, 0, 0.9, 0)
    add(g, new ConeGeometry(0.55, 0.76, 10), ice, 0, 0.4, 0, Math.PI, 0, 0)
    add(g, cyl(0.3, 0.3, 0.01, 10), gem('#ffffff', 1.2), 0, 1.025, 0)
    return g
  },
  clam() {
    const g = new Group()
    const shellGeo = new SphereGeometry(0.55, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)
    const pos = shellGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const a = Math.atan2(z, x)
      const k = 1 + Math.cos(a * 14) * 0.035
      pos.setXYZ(i, x * k, pos.getY(i) * 0.38, z * k)
    }
    shellGeo.computeVertexNormals()
    const shellMat = mat('shell', () => new MeshStandardMaterial({ color: '#ffb3c8', roughness: 0.45, side: DoubleSide }))
    const bottom = add(g, shellGeo, shellMat, 0, 0.22, 0, Math.PI, 0, 0)
    bottom.scale.set(1, 1, 1)
    const top = add(g, shellGeo, shellMat, 0, 0.24, -0.5, -0.9, 0, 0)
    top.position.set(0, 0.24, -0.3)
    top.rotation.set(-1.05, 0, 0)
    add(g, cyl(0.5, 0.5, 0.04, 32), plain('#ff7fa8', 0.35), 0, 0.22, 0)
    add(g, sph(0.2, 28, 20), pearl(), 0, 0.42, 0.05)
    return g
  },
  crown() {
    const g = new Group()
    add(g, cyl(0.46, 0.42, 0.32, 40, 1).toNonIndexed(), mat('crownband', () => new MeshStandardMaterial({ color: '#ffc531', metalness: 1, roughness: 0.22, side: DoubleSide })), 0, 0.22, 0)
    add(g, sph(0.4, 24, 12), plain('#b0102a', 0.9), 0, 0.3, 0, 0, 0, 0, [1, 0.8, 1])
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      add(g, new ConeGeometry(0.1, 0.4, 4), gold(), Math.cos(a) * 0.44, 0.58, Math.sin(a) * 0.44)
      add(g, sph(0.05, 10, 8), pearl(), Math.cos(a) * 0.44, 0.8, Math.sin(a) * 0.44)
      add(g, new OctahedronGeometry(0.07, 0), gem(i % 2 ? '#ff2d55' : '#2d9bff', 0.6), Math.cos(a) * 0.465, 0.22, Math.sin(a) * 0.465)
    }
    add(g, tor(0.44, 0.04, 8, 40), darkGold(), 0, 0.07, 0, Math.PI / 2)
    add(g, sph(0.08, 14, 10), gold(), 0, 0.72, 0)
    add(g, B(0.04, 0.22, 0.04), gold(), 0, 0.86, 0)
    add(g, B(0.16, 0.04, 0.04), gold(), 0, 0.9, 0)
    return g
  },
  musicbox() {
    const g = new Group()
    const wood = plain('#7b3a1c', 0.55)
    add(g, B(0.9, 0.42, 0.62), wood, 0, 0.21, 0)
    add(g, B(0.94, 0.04, 0.66), gold(), 0, 0.43, 0)
    add(g, B(0.94, 0.04, 0.66), gold(), 0, 0.02, 0)
    const lid = new Group()
    lid.position.set(0, 0.44, -0.31)
    lid.rotation.x = -1.9
    add(lid, B(0.9, 0.06, 0.62), wood, 0, 0, 0.31)
    add(lid, B(0.7, 0.01, 0.46), silver(), 0, -0.035, 0.31)
    g.add(lid)
    add(g, B(0.8, 0.02, 0.52), plain('#c2185b', 0.9), 0, 0.42, 0.0)
    // ballerina
    add(g, cyl(0.05, 0.05, 0.05, 16), gold(), 0, 0.46, 0.04)
    add(g, new ConeGeometry(0.13, 0.12, 16), plain('#ff9ad5', 0.5), 0, 0.6, 0.04, Math.PI, 0, 0)
    add(g, cyl(0.035, 0.05, 0.16, 10), plain('#ffd7c2'), 0, 0.72, 0.04)
    add(g, sph(0.05, 12, 10), plain('#ffd7c2'), 0, 0.84, 0.04)
    add(g, B(0.3, 0.02, 0.02), plain('#ffd7c2'), 0, 0.77, 0.04, 0, 0, 0.3)
    add(g, cyl(0.03, 0.03, 0.2, 10), gold(), 0.5, 0.25, 0, 0, 0, Math.PI / 2)
    add(g, B(0.03, 0.18, 0.06), gold(), 0.6, 0.25, 0)
    return g
  },
  ship() {
    const g = new Group()
    const wood = plain('#6b3a1a', 0.6)
    add(g, B(0.3, 0.12, 0.12), wood, -0.3, 0.06, 0)
    add(g, B(0.3, 0.12, 0.12), wood, 0.3, 0.06, 0)
    const pts = [[0, 0], [0.22, 0], [0.26, 0.04], [0.27, 0.6], [0.24, 0.74], [0.11, 0.86], [0.1, 1.02]].map(([x, y]) => new Vector2(x, y))
    const bottle = add(g, new LatheGeometry(pts, 28), glassMat(), -0.5, 0.36, 0, 0, 0, -Math.PI / 2)
    bottle.renderOrder = 3
    add(g, cyl(0.1, 0.085, 0.14, 16), plain('#c48a52', 0.9), 0.58, 0.36, 0, 0, 0, Math.PI / 2)
    const ship = new Group()
    ship.position.set(-0.05, 0.22, 0)
    add(ship, ingotGeo(0.6, 0.12, 0.16), plain('#8a4a22', 0.7), 0, 0, 0, Math.PI, 0, 0)
    for (const [x, h] of [[-0.15, 0.32], [0.08, 0.4]]) {
      add(ship, cyl(0.012, 0.012, h, 6), wood, x, h / 2 + 0.05, 0)
      add(ship, B(0.16, h * 0.55, 0.01), plain('#fffaf0', 0.8), x, h * 0.55 + 0.05, 0)
    }
    add(ship, B(0.06, 0.04, 0.005), plain('#e0262b'), 0.08, 0.47, 0)
    g.add(ship)
    add(g, cyl(0.26, 0.26, 0.02, 24), plain('#2f8fd8', 0.2), -0.05, 0.13, 0, 0, 0, Math.PI / 2, [1, 1, 0.6])
    return g
  },
  hourglass() {
    const g = new Group()
    const wood = plain('#7a3d1c', 0.5)
    add(g, cyl(0.44, 0.44, 0.08, 6), wood, 0, 0.04, 0)
    add(g, cyl(0.44, 0.44, 0.08, 6), wood, 0, 1.12, 0)
    add(g, cyl(0.46, 0.46, 0.02, 6), gold(), 0, 0.09, 0)
    add(g, cyl(0.46, 0.46, 0.02, 6), gold(), 0, 1.07, 0)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      add(g, cyl(0.035, 0.035, 1.0, 10), gold(), Math.cos(a) * 0.36, 0.58, Math.sin(a) * 0.36)
    }
    const top = add(g, new ConeGeometry(0.3, 0.46, 24, 1, true), glassMat(), 0, 0.84, 0, Math.PI, 0, 0)
    const bot = add(g, new ConeGeometry(0.3, 0.46, 24, 1, true), glassMat(), 0, 0.32, 0)
    top.renderOrder = bot.renderOrder = 3
    const sand = glow('#ffcf5a', 0.35)
    add(g, new ConeGeometry(0.2, 0.18, 20), sand, 0, 0.19, 0)
    add(g, new ConeGeometry(0.16, 0.16, 20), sand, 0, 0.93, 0, Math.PI, 0, 0)
    add(g, cyl(0.01, 0.01, 0.36, 6), sand, 0, 0.45, 0)
    return g
  },
  scepter() {
    const g = new Group()
    add(g, cyl(0.28, 0.32, 0.08, 24), plain('#3a1d4f', 0.8), 0, 0.04, 0)
    add(g, cyl(0.045, 0.06, 1.4, 16), gold(), 0, 0.78, 0)
    for (const y of [0.3, 0.7, 1.1]) add(g, tor(0.07, 0.025, 8, 20), darkGold(), 0, y, 0, Math.PI / 2)
    add(g, sph(0.17, 24, 16), gem('#ff1f4f', 0.9), 0, 1.6, 0)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      add(g, new ConeGeometry(0.04, 0.18, 4), gold(), Math.cos(a) * 0.15, 1.5, Math.sin(a) * 0.15, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
    }
    add(g, B(0.04, 0.2, 0.04), gold(), 0, 1.85, 0)
    add(g, B(0.14, 0.04, 0.04), gold(), 0, 1.88, 0)
    add(g, tor(0.19, 0.02, 6, 30), gold(), 0, 1.6, 0, 0, 0, 0)
    return g
  },
  fossil() {
    const g = new Group()
    const bone = plain('#efe2c4', 0.75)
    const rock = plain('#7a6b5a', 0.95)
    add(g, new DodecahedronGeometry(0.5, 0), rock, 0, 0.12, 0, 0, 0, 0, [1.4, 0.35, 0.9])
    add(g, B(0.7, 0.32, 0.36), bone, 0.05, 0.5, 0)
    add(g, B(0.42, 0.22, 0.3), bone, 0.5, 0.45, 0, 0, 0, -0.08)
    add(g, B(0.82, 0.1, 0.3), bone, 0.22, 0.27, 0, 0, 0, 0.12)
    add(g, sph(0.08, 12, 8), black(), -0.08, 0.58, 0.17)
    add(g, sph(0.08, 12, 8), black(), -0.08, 0.58, -0.17)
    add(g, sph(0.05, 10, 8), black(), 0.66, 0.5, 0.1)
    for (let i = 0; i < 7; i++) {
      add(g, new ConeGeometry(0.035, 0.12, 6), bone, 0.68 - i * 0.1, 0.32, 0.12, Math.PI, 0, 0)
      add(g, new ConeGeometry(0.035, 0.12, 6), bone, 0.68 - i * 0.1, 0.32, -0.12, Math.PI, 0, 0)
    }
    add(g, B(0.2, 0.18, 0.3), bone, -0.4, 0.62, 0, 0, 0, 0.5)
    for (let i = 0; i < 4; i++) add(g, cyl(0.04, 0.04, 0.4, 8), bone, -0.6 - i * 0.12, 0.3, 0, 0, 0, 0.6)
    return g
  },
  robot() {
    const g = new Group()
    const shell = silver()
    add(g, B(0.82, 0.7, 0.72), shell, 0, 0.55, 0)
    add(g, B(0.86, 0.08, 0.76), plain('#3b82f6', 0.3, 0.6), 0, 0.94, 0)
    add(g, B(0.66, 0.24, 0.02), black(), 0, 0.62, 0.37)
    add(g, sph(0.08, 16, 12), glow('#2ef3ff', 3), -0.17, 0.62, 0.38)
    add(g, sph(0.08, 16, 12), glow('#2ef3ff', 3), 0.17, 0.62, 0.38)
    for (let i = 0; i < 5; i++) add(g, B(0.05, 0.1, 0.02), black(), -0.2 + i * 0.1, 0.35, 0.37)
    add(g, cyl(0.12, 0.12, 0.1, 20), plain('#3b82f6', 0.3, 0.6), 0.46, 0.58, 0, 0, 0, Math.PI / 2)
    add(g, cyl(0.12, 0.12, 0.1, 20), plain('#3b82f6', 0.3, 0.6), -0.46, 0.58, 0, 0, 0, Math.PI / 2)
    add(g, cyl(0.02, 0.02, 0.36, 8), shell, 0.2, 1.12, 0)
    add(g, sph(0.06, 12, 10), glow('#ff2d4f', 3), 0.2, 1.32, 0)
    add(g, B(0.5, 0.2, 0.5), iron(), 0, 0.1, 0)
    return g
  },
  car() {
    const g = new Group()
    const paint = mat('carpaint', () => new MeshPhysicalMaterial({ color: '#ffc21a', metalness: 0.7, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }))
    add(g, B(1.5, 0.22, 0.72), paint, 0, 0.3, 0)
    add(g, B(1.0, 0.1, 0.7), paint, -0.1, 0.45, 0, 0, 0, 0.03)
    add(g, B(0.6, 0.22, 0.62), glassMat(), -0.15, 0.58, 0)
    add(g, B(0.6, 0.04, 0.6), paint, -0.18, 0.7, 0)
    add(g, B(0.08, 0.16, 0.74), black(), -0.72, 0.52, 0)
    add(g, B(0.22, 0.03, 0.8), black(), -0.78, 0.62, 0)
    for (const [x, z] of [[0.48, 0.36], [0.48, -0.36], [-0.5, 0.36], [-0.5, -0.36]]) {
      add(g, cyl(0.17, 0.17, 0.14, 20), black(), x, 0.17, z, Math.PI / 2, 0, 0)
      add(g, cyl(0.1, 0.1, 0.15, 12), gold(), x, 0.17, z, Math.PI / 2, 0, 0)
    }
    add(g, B(0.04, 0.06, 0.16), glow('#fff6c2', 3), 0.76, 0.34, 0.24)
    add(g, B(0.04, 0.06, 0.16), glow('#fff6c2', 3), 0.76, 0.34, -0.24)
    add(g, B(0.04, 0.05, 0.18), glow('#ff2d2d', 2.5), -0.76, 0.36, 0.22)
    add(g, B(0.04, 0.05, 0.18), glow('#ff2d2d', 2.5), -0.76, 0.36, -0.22)
    return g
  },
}

// --- Cache, normalise, clone --------------------------------------------------------
const base = new Map()
const box3 = new Box3()
const size = new Vector3()
const center = new Vector3()
function built(id) {
  if (!base.has(id)) {
    const make = BUILD[id] ?? BUILD.cashbag
    const raw = make()
    const holder = new Group()
    holder.add(raw)
    box3.setFromObject(raw)
    box3.getSize(size)
    box3.getCenter(center)
    const k = TARGET / Math.max(size.x, size.y, size.z)
    raw.scale.setScalar(k)
    raw.position.set(-center.x * k, -box3.min.y * k, -center.z * k)
    base.set(id, holder)
  }
  return base.get(id)
}
export function makeTreasure(id, scale = 1) {
  const g = built(id).clone(true)
  g.scale.setScalar(scale)
  return g
}

// --- Thumbnails (HUD icons) ------------------------------------------------------
const thumbs = new Map()
let thumbRig = null
export function thumbnail(id, renderer) {
  if (thumbs.has(id)) return thumbs.get(id)
  if (!thumbRig) {
    const scene = new Scene()
    scene.add(new AmbientLight('#ffffff', 1.4))
    const key = new DirectionalLight('#ffffff', 2.6)
    key.position.set(2, 3, 4)
    const rim = new DirectionalLight('#c9b6ff', 1.6)
    rim.position.set(-3, 2, -2)
    scene.add(key, rim)
    const cam = new PerspectiveCamera(32, 1, 0.1, 20)
    cam.position.set(1.4, 1.5, 2.4)
    cam.lookAt(0, 0.55, 0)
    const target = new WebGLRenderTarget(128, 128, { samples: 4 })
    target.texture.colorSpace = LinearSRGBColorSpace
    thumbRig = { scene, cam, target, pixels: new Uint8Array(128 * 128 * 4), canvas: document.createElement('canvas') }
    thumbRig.canvas.width = thumbRig.canvas.height = 128
    // neutral studio reflections, so silver reads as silver whatever the sky is
    const pmrem = new PMREMGenerator(renderer)
    thumbRig.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
  }
  const { scene, cam, target, pixels, canvas } = thumbRig
  const model = makeTreasure(id)
  scene.add(model)
  const prevTarget = renderer.getRenderTarget()
  const prevAlpha = renderer.getClearAlpha()
  renderer.getClearColor(prevClear)
  scene.environment = thumbRig.env ?? thumbEnv
  renderer.setRenderTarget(target)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.render(scene, cam)
  renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels)
  renderer.setRenderTarget(prevTarget)
  renderer.setClearColor(prevClear, prevAlpha)
  scene.remove(model)
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(128, 128)
  // flip Y and encode linear -> sRGB
  const enc = (v) => {
    const l = v / 255
    const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
    return Math.min(255, s * 255)
  }
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const si = ((127 - y) * 128 + x) * 4
      const di = (y * 128 + x) * 4
      const a = pixels[si + 3]
      img.data[di] = a ? enc(pixels[si] / (a / 255)) : 0
      img.data[di + 1] = a ? enc(pixels[si + 1] / (a / 255)) : 0
      img.data[di + 2] = a ? enc(pixels[si + 2] / (a / 255)) : 0
      img.data[di + 3] = a
    }
  }
  ctx.putImageData(img, 0, 0)
  const url = canvas.toDataURL()
  thumbs.set(id, url)
  return url
}
let thumbEnv = null
const prevClear = new Color()
export function setThumbEnvironment(env) {
  thumbEnv = env
}
