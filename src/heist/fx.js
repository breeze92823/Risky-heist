// Visual effects, all pooled (no per-frame allocation):
//  - sparks: additive soft-dot / sparkle points (per-particle colour, size, fade),
//    used for treasure shimmer, cash fountains, door dust, zipline sparks
//  - debris: instanced boxes with gravity, spin and a floor bounce (glass shards,
//    wood splinters, gold chips); glass has its own see-through instanced mesh
//  - rings: expanding additive shock rings (pickups, placing, collecting)
//  - floating text: DOM "+$1.2K" popups projected from world space
//  - camera shake and full-screen flashes
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { boxGeo, plainTex } from './kit.js'
import { paintSparkle } from '../textures.js'

const MAX_SPARKS = 2400
const MAX_DEBRIS = 260
const MAX_GLASS = 160
const MAX_RINGS = 16

const sparkVertex = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  varying float vAlpha;
  varying vec3 vTint;
  uniform float scale;
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`
const sparkFragment = /* glsl */ `
  uniform sampler2D map;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vTint * t.rgb * 1.6, t.a * vAlpha);
  }`

export function createFx(scene, camera, renderer) {
  // --- Sparks ------------------------------------------------------------------
  const pos = new Float32Array(MAX_SPARKS * 3)
  const tint = new Float32Array(MAX_SPARKS * 3)
  const size = new Float32Array(MAX_SPARKS)
  const alpha = new Float32Array(MAX_SPARKS)
  const vel = new Float32Array(MAX_SPARKS * 3)
  const life = new Float32Array(MAX_SPARKS)
  const maxLife = new Float32Array(MAX_SPARKS)
  const grav = new Float32Array(MAX_SPARKS)
  const drag = new Float32Array(MAX_SPARKS)
  const size0 = new Float32Array(MAX_SPARKS)
  const geo = new BufferGeometry()
  const attr = (name, arr, n) => {
    const a = new BufferAttribute(arr, n)
    a.setUsage(DynamicDrawUsage)
    geo.setAttribute(name, a)
    return a
  }
  const aPos = attr('position', pos, 3)
  const aTint = attr('tint', tint, 3)
  const aSize = attr('size', size, 1)
  const aAlpha = attr('alpha', alpha, 1)
  const sparkMat = new ShaderMaterial({
    uniforms: { map: { value: plainTex(paintSparkle(64)) }, scale: { value: 400 } },
    vertexShader: sparkVertex,
    fragmentShader: sparkFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geo, sparkMat)
  points.frustumCulled = false
  points.renderOrder = 10
  scene.add(points)
  let sparkCursor = 0
  let density = 1 // graphics preset particle scale
  const col = new Color()

  function spark(x, y, z, vx, vy, vz, color, s, l, g = 0, d = 0) {
    const i = sparkCursor
    sparkCursor = (sparkCursor + 1) % MAX_SPARKS
    pos[i * 3] = x
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = z
    vel[i * 3] = vx
    vel[i * 3 + 1] = vy
    vel[i * 3 + 2] = vz
    col.set(color)
    tint[i * 3] = col.r
    tint[i * 3 + 1] = col.g
    tint[i * 3 + 2] = col.b
    size0[i] = s
    life[i] = maxLife[i] = l
    grav[i] = g
    drag[i] = d
  }

  // A burst of sparks. opts: count, color (string or array), speed, up, spread (box radius),
  // size, life, gravity, drag.
  function burst(p, { count = 20, color = '#ffffff', speed = 4, up = 2, spread = 0.2, size: s = 0.5, life: l = 0.9, gravity = -6, drag: dr = 1.5 } = {}) {
    const n = Math.max(1, Math.round(count * density))
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2
      const e = Math.random() * 2 - 1
      const r = Math.sqrt(1 - e * e)
      const sp = speed * (0.4 + Math.random() * 0.6)
      const c = Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color
      spark(
        p.x + (Math.random() - 0.5) * spread * 2,
        p.y + (Math.random() - 0.5) * spread * 2,
        p.z + (Math.random() - 0.5) * spread * 2,
        Math.cos(a) * r * sp,
        e * sp * 0.6 + up,
        Math.sin(a) * r * sp,
        c,
        s * (0.6 + Math.random() * 0.8),
        l * (0.6 + Math.random() * 0.6),
        gravity,
        dr,
      )
    }
  }
  // Continuous emitters call this with their rate * dt; fractional counts carry via probability.
  function trickle(p, rate, dt, opts) {
    const want = rate * dt * density
    let n = Math.floor(want)
    if (Math.random() < want - n) n++
    if (n > 0) burst(p, { ...opts, count: n / density })
  }

  // --- Debris -------------------------------------------------------------------
  const debrisMat = new MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 })
  const debris = new InstancedMesh(boxGeo(1, 1, 1), debrisMat, MAX_DEBRIS)
  const glassMat = new MeshPhysicalMaterial({ color: '#cdeeff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.6, side: DoubleSide, clearcoat: 1, envMapIntensity: 2, emissive: '#5fb0ff', emissiveIntensity: 0.25 })
  const shards = new InstancedMesh(boxGeo(1, 1, 1), glassMat, MAX_GLASS)
  for (const im of [debris, shards]) {
    im.instanceMatrix.setUsage(DynamicDrawUsage)
    im.frustumCulled = false
    im.castShadow = true
    im.count = im === debris ? MAX_DEBRIS : MAX_GLASS
    scene.add(im)
  }
  const pool = (n) => Array.from({ length: n }, () => ({ alive: false, p: new Vector3(), v: new Vector3(), q: new Quaternion(), w: new Vector3(), s: new Vector3(), life: 0, max: 1, floor: 0 }))
  const dPool = pool(MAX_DEBRIS)
  const gPool = pool(MAX_GLASS)
  let dCursor = 0
  let gCursor = 0
  const m4 = new Matrix4()
  const tmpQ = new Quaternion()
  const tmpV = new Vector3()
  const hidden = new Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < MAX_DEBRIS; i++) {
    debris.setMatrixAt(i, hidden)
    debris.setColorAt(i, col.set('#ffffff'))
  }
  for (let i = 0; i < MAX_GLASS; i++) shards.setMatrixAt(i, hidden)

  // pieces: count, color(s), size [w,h,d] ranges, speed, up, life, floor y, glass
  function chunks(p, { count = 12, color = '#8a4a22', size: sz = [0.15, 0.4], flat = 0.25, speed = 6, up = 4, life: l = 2.2, floor = 0, glass = false, dir = null, spread = 0.3 } = {}) {
    const n = Math.max(1, Math.round(count * Math.max(0.5, density)))
    for (let k = 0; k < n; k++) {
      const P = glass ? gPool : dPool
      const idx = glass ? gCursor : dCursor
      if (glass) gCursor = (gCursor + 1) % MAX_GLASS
      else dCursor = (dCursor + 1) % MAX_DEBRIS
      const d = P[idx]
      d.alive = true
      d.p.set(p.x + (Math.random() - 0.5) * spread * 2, p.y + (Math.random() - 0.5) * spread * 2, p.z + (Math.random() - 0.5) * spread * 2)
      const a = Math.random() * Math.PI * 2
      const sp = speed * (0.35 + Math.random() * 0.65)
      d.v.set(Math.cos(a) * sp, up * (0.5 + Math.random()), Math.sin(a) * sp)
      if (dir) d.v.addScaledVector(dir, speed * (0.6 + Math.random() * 0.6))
      d.q.setFromAxisAngle(tmpV.set(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * Math.PI)
      d.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14)
      const base = sz[0] + Math.random() * (sz[1] - sz[0])
      d.s.set(base, base * (glass ? 0.06 : flat + Math.random() * 0.5), base * (0.4 + Math.random() * 0.8))
      d.life = d.max = l * (0.7 + Math.random() * 0.6)
      d.floor = floor
      if (!glass) debris.setColorAt(idx, col.set(Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color))
    }
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true
  }

  function stepPool(P, im, dt) {
    let any = false
    for (let i = 0; i < P.length; i++) {
      const d = P[i]
      if (!d.alive) continue
      any = true
      d.life -= dt
      if (d.life <= 0) {
        d.alive = false
        im.setMatrixAt(i, hidden)
        continue
      }
      d.v.y -= 18 * dt
      d.p.addScaledVector(d.v, dt)
      if (d.p.y < d.floor + d.s.y * 0.5) {
        d.p.y = d.floor + d.s.y * 0.5
        d.v.y = Math.abs(d.v.y) * 0.3
        d.v.x *= 0.6
        d.v.z *= 0.6
        d.w.multiplyScalar(0.6)
      }
      tmpQ.setFromAxisAngle(tmpV.copy(d.w).normalize(), d.w.length() * dt)
      d.q.premultiply(tmpQ)
      const shrink = Math.min(1, d.life / 0.5)
      tmpV.copy(d.s).multiplyScalar(shrink)
      m4.compose(d.p, d.q, tmpV)
      im.setMatrixAt(i, m4)
    }
    if (any) im.instanceMatrix.needsUpdate = true
  }

  // --- Rings --------------------------------------------------------------------
  const rings = []
  const ringGeo = new RingGeometry(0.8, 1, 48)
  ringGeo.rotateX(-Math.PI / 2)
  for (let i = 0; i < MAX_RINGS; i++) {
    const m = new Mesh(ringGeo, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }))
    m.visible = false
    m.renderOrder = 9
    scene.add(m)
    rings.push({ m, t: 0, max: 1, r0: 0.5, r1: 4 })
  }
  let ringCursor = 0
  function ring(p, color = '#ffffff', r1 = 4, l = 0.6, r0 = 0.4) {
    const r = rings[ringCursor]
    ringCursor = (ringCursor + 1) % MAX_RINGS
    r.m.position.set(p.x, p.y, p.z)
    r.m.material.color.set(color)
    r.m.visible = true
    r.t = 0
    r.max = l
    r.r0 = r0
    r.r1 = r1
  }

  // --- Floating text ----------------------------------------------------------------
  const layer = document.createElement('div')
  layer.className = 'fx-layer'
  document.body.appendChild(layer)
  const texts = []
  const proj = new Vector3()
  function floatText(p, text, { color = '#4dff5a', size = 1, life: l = 1.4, rise = 1.6 } = {}) {
    const el = document.createElement('div')
    el.className = 'fx-text'
    el.textContent = text
    el.style.color = color
    el.style.fontSize = `calc(${size} * clamp(20px, 3.4vmin, 40px))`
    layer.appendChild(el)
    texts.push({ el, p: p.clone(), t: 0, life: l, rise })
  }

  // --- Shake + flash ------------------------------------------------------------------
  let shake = 0
  const flashEl = document.createElement('div')
  flashEl.className = 'fx-flash'
  document.body.appendChild(flashEl)
  function flash(color = '#ffffff', strength = 0.5) {
    flashEl.style.transition = 'none'
    flashEl.style.background = color
    flashEl.style.opacity = String(strength)
    void flashEl.offsetWidth
    flashEl.style.transition = 'opacity 0.45s ease-out'
    flashEl.style.opacity = '0'
  }

  const dummy = new Object3D()
  void dummy

  return {
    burst,
    trickle,
    chunks,
    ring,
    floatText,
    flash,
    shake(amount) {
      shake = Math.min(1.2, shake + amount)
    },
    setDensity(k) {
      density = k
    },
    update(dt) {
      // sparks
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (life[i] <= 0) {
          if (alpha[i] !== 0) {
            alpha[i] = 0
            size[i] = 0
          }
          continue
        }
        life[i] -= dt
        const k = Math.max(0, life[i] / maxLife[i])
        const dmp = Math.exp(-drag[i] * dt)
        vel[i * 3] *= dmp
        vel[i * 3 + 2] *= dmp
        vel[i * 3 + 1] = vel[i * 3 + 1] * dmp + grav[i] * dt
        pos[i * 3] += vel[i * 3] * dt
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        alpha[i] = k < 0.3 ? k / 0.3 : 1
        size[i] = size0[i] * (0.5 + k * 0.5)
      }
      aPos.needsUpdate = aTint.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true
      sparkMat.uniforms.scale.value = (renderer.domElement.height / 2) / Math.tan((camera.fov * Math.PI) / 360)

      stepPool(dPool, debris, dt)
      stepPool(gPool, shards, dt)

      for (const r of rings) {
        if (!r.m.visible) continue
        r.t += dt
        const k = r.t / r.max
        if (k >= 1) {
          r.m.visible = false
          continue
        }
        const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k))
        r.m.scale.setScalar(rad)
        r.m.material.opacity = (1 - k) * 0.9
      }

      const w = window.innerWidth
      const h = window.innerHeight
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i]
        t.t += dt
        const k = t.t / t.life
        if (k >= 1) {
          t.el.remove()
          texts.splice(i, 1)
          continue
        }
        proj.copy(t.p)
        proj.y += t.rise * (1 - (1 - k) * (1 - k))
        proj.project(camera)
        if (proj.z > 1) {
          t.el.style.opacity = '0'
          continue
        }
        const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.5 : k < 0.2 ? 1.1 - ((k - 0.12) / 0.08) * 0.1 : 1
        t.el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * h}px) translate(-50%, -50%) scale(${pop})`
        t.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1)
      }
    },
    // Called after the camera has been placed for the frame.
    applyShake(dt) {
      if (shake <= 0.001) return
      const s = shake * shake * 0.35
      camera.position.x += (Math.random() - 0.5) * s
      camera.position.y += (Math.random() - 0.5) * s
      camera.position.z += (Math.random() - 0.5) * s
      shake = Math.max(0, shake - dt * 2.8)
    },
  }
}
