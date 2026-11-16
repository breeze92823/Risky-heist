// The world outside the building: the HUB island (dock + zipline tower, stalls,
// billboards, roads, lamps, trees, the six bases), the river, the far bank with
// its fenced heist yard (road loop, police cruisers, ground zipline tower,
// tunnels) and terraced toy-brick cliffs with voxel trees round everything.
// Static meshes are baked into a few draw calls; sprites and animated parts stay live.
import { AdditiveBlending, BoxGeometry, BufferAttribute,CircleGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, ShaderMaterial, Vector3 } from 'three'
import { bake } from '../bake.js'
import { BASE, LAYOUT, POLICE_PATROL, STALLS, ZIPLINE } from '../config.js'
import { mulberry32 } from '../textures.js'
import { asphalt, box, boxGeo, boxMM, bricks, canvasSign, cliff, emissive, glass, groundDecal, infoLabel, metal, outlinedText, plainTex, ringTexture, roundRect, solid, solidMM, studs } from './kit.js'
import { paintLeaves, paintStripes } from './paint.js'
import { buildBaseShell } from './base.js'

const GREEN = '#58dd34'
const TRIM = '#ff9a1f'

// A lattice zipline tower: four posts, cross braces, a deck and a pulley arm.
export function buildTower(root, x, y0, z, top, faceZ = -1) {
  const steel = metal('#5c6170', 0.45)
  const dark = metal('#3a3e4a', 0.5)
  const h = top - y0
  const w = 0.75
  for (const [dx, dz] of [[-w, -w], [w, -w], [-w, w], [w, w]]) box(root, 0.22, h, 0.22, steel, x + dx, y0 + h / 2, z + dz)
  for (let y = y0 + 1.2; y < top - 0.4; y += 1.6) {
    box(root, 1.7, 0.12, 0.12, dark, x, y, z - w)
    box(root, 1.7, 0.12, 0.12, dark, x, y, z + w)
    box(root, 0.12, 0.12, 1.7, dark, x - w, y, z)
    box(root, 0.12, 0.12, 1.7, dark, x + w, y, z)
    // diagonal braces on two faces
    const d1 = box(root, 0.08, 2.1, 0.08, dark, x, y + 0.8, z - w)
    d1.rotation.z = 0.75
    const d2 = box(root, 0.08, 2.1, 0.08, dark, x - w, y + 0.8, z)
    d2.rotation.x = -0.75
  }
  box(root, 2.2, 0.25, 2.2, steel, x, top, z)
  box(root, 0.3, 0.3, 2.4, dark, x, top + 0.4, z + faceZ * 0.9)
  const wheel = new Mesh(new BoxGeometry(0.1, 0.7, 0.7), metal('#c9ced8', 0.25))
  wheel.position.set(x, top + 0.2, z + faceZ * 2)
  root.add(wheel)
  box(root, 1.6, 0.4, 0.15, solid('#ffcc22', 0.5), x, top - 0.6, z + faceZ * 0.85) // hazard plate
}

// Pulsing glow pad at a tower's foot (live, not baked).
function towerPad(live, x, y, z, color = '#33c9ff') {
  const pad = new Mesh(boxGeo(2.6, 0.12, 2.6), emissive(color, 1.6, '#123a6a'))
  pad.position.set(x, y + 0.06, z)
  pad.receiveShadow = true
  live.add(pad)
  const ring = groundDecal(ringTexture(), color, 4.4, 0.9)
  ring.position.set(x, y + 0.14, z)
  live.add(ring)
  return ring
}

// A market stall: four posts, counter, striped awning, title sprite, glow ring.
function buildStall(root, live, s) {
  const { x, z } = s
  const wood = solid('#8a4a22', 0.75)
  for (const [dx, dz] of [[-2.2, -1.3], [2.2, -1.3], [-2.2, 1.3], [2.2, 1.3]]) box(root, 0.28, 3.4, 0.28, wood, x + dx, 1.7, z + dz, { collide: true })
  box(root, 4.8, 1.1, 1.0, solid('#a65a28', 0.7), x, 0.55, z + 0.9, { collide: true })
  box(root, 5.0, 0.15, 1.3, solid('#c9773a', 0.6), x, 1.15, z + 0.9)
  box(root, 4.6, 2.3, 0.2, solid('#5a2e14', 0.8), x, 1.15, z - 1.3)
  // goods on the counter
  const rand = mulberry32(x * 13)
  for (let i = 0; i < 5; i++) box(root, 0.45, 0.35, 0.4, solid(['#ffd23a', '#38c6ff', '#ff4d6d', '#59ff8a'][i % 4], 0.4), x - 1.7 + i * 0.85, 1.4, z + 0.85 + (rand() - 0.5) * 0.2)
  // striped awning: a sloped slab with a scalloped valance
  const stripe = plainTex(paintStripes(s.awning, '#ffffff', 8))
  const awnMat = new MeshStandardMaterial({ map: stripe, roughness: 0.7 })
  const awn = new Mesh(boxGeo(5.4, 0.16, 3.6), awnMat)
  awn.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = i % 2 === 0 ? v / 5.4 : v / 3.6))
  awn.position.set(x, 3.65, z + 0.25)
  awn.rotation.x = 0.28
  awn.castShadow = true
  root.add(awn)
  for (let i = 0; i < 8; i++) {
    const v = new Mesh(boxGeo(0.68, 0.45, 0.08), solid(i % 2 ? '#ffffff' : s.awning, 0.7))
    v.position.set(x - 2.38 + i * 0.68, 3.0, z + 2.05)
    v.castShadow = true
    root.add(v)
  }
  const title = infoLabel([{ text: s.title, size: 64, color: s.awning === '#2bd94f' ? '#8dff5a' : s.ring, outline: '#10082a' }], 0.03)
  title.position.set(x, 4.35, z + 0.2)
  live.add(title)
  const ring = groundDecal(ringTexture(), s.ring, 3.6, 0.85)
  ring.position.set(x, 0.06, z + 3.2)
  live.add(ring)
  return { ring, at: new Vector3(x, 0, z + 3.2) }
}

// Street lamp: pole, arm and a glowing bulb.
function lamp(root, x, z, rotY = 0, color = '#ffe08a') {
  box(root, 0.22, 4.6, 0.22, metal('#2d3140', 0.5), x, 2.3, z)
  box(root, 0.5, 0.3, 0.5, metal('#2d3140', 0.5), x, 0.15, z)
  const arm = box(root, 1.1, 0.14, 0.14, metal('#2d3140', 0.5), x + Math.cos(rotY) * 0.5, 4.55, z - Math.sin(rotY) * 0.5)
  arm.rotation.y = rotY
  box(root, 0.55, 0.32, 0.55, emissive(color, 3.2, '#4a3a10'), x + Math.cos(rotY) * 1.0, 4.35, z - Math.sin(rotY) * 1.0, { cast: false })
}

// Low railing with posts (visual) along a line; the collider is separate.
function fence(root, x0, z0, x1, z1, color = '#3f7bff', h = 1.1) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.max(1, Math.round(len / 2.4))
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  const post = solid(color, 0.5)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    box(root, 0.3, h, 0.3, post, x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t)
  }
  for (const y of [h * 0.45, h * 0.92]) box(root, len, 0.16, 0.16, solid('#9fc1ff', 0.4), (x0 + x1) / 2, y, (z0 + z1) / 2, { rotY: yaw })
}

// "POLICE" + star door decal (one canvas texture shared by every cruiser).
let doorDecalMat = null
function doorDecal() {
  if (doorDecalMat) return doorDecalMat
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const ctx = c.getContext('2d')
  // gold star badge
  ctx.save()
  ctx.translate(62, 64)
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 22 : 50
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fillStyle = '#ffcc33'
  ctx.strokeStyle = '#7a5200'
  ctx.lineWidth = 6
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  outlinedText(ctx, 'POLICE', 300, 68, 92, '#14214d', '#ffffff', 800)
  doorDecalMat = new MeshStandardMaterial({ map: plainTex(c), transparent: true, alphaTest: 0.35, roughness: 0.4 })
  return doorDecalMat
}

const paintMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 })
const wheelGeo = new CylinderGeometry(0.4, 0.4, 0.32, 18).rotateX(Math.PI / 2)
const hubGeo = new CylinderGeometry(0.22, 0.22, 0.34, 12).rotateX(Math.PI / 2)
const lampGeo = new CylinderGeometry(0.13, 0.15, 0.32, 14).rotateZ(Math.PI / 2)
const lensGeo = new CylinderGeometry(0.11, 0.11, 0.03, 14).rotateZ(Math.PI / 2)

// A police cruiser (its nose is local +x): black-and-white body, sloped glass, push bar, wheels with
// hubcaps, door decals, light bar and a roof searchlight. The body is baked to a few meshes and the
// whole car is one live Group so it can drive. Bar materials are pushed to `bars` for blinking.
// Returns { car, aim (searchlight yaw/pitch group), lens (its glowing material) }.
function cruiser(live, bars) {
  const g = new Group()
  const white = solid('#f4f6fb', 0.3, 0.2)
  const black = solid('#16181f', 0.3, 0.35)
  const trim = solid('#0b0c10', 0.7)
  const chrome = metal('#c9ced8', 0.25)
  const darkGlass = glass('#1a2740', 0.88)
  const rot = (m, z) => {
    m.rotation.z = z
    return m
  }
  // body: chassis, hood, doors, trunk, arches, stripe
  box(g, 4.5, 0.42, 1.86, black, 0, 0.62, 0)
  box(g, 1.1, 0.36, 1.86, black, 1.7, 1.01, 0)
  box(g, 2.15, 0.44, 1.9, white, 0.075, 1.05, 0)
  box(g, 1.25, 0.42, 1.86, black, -1.625, 1.04, 0)
  for (const x of [1.45, -1.45]) box(g, 1.05, 0.16, 1.94, trim, x, 0.88, 0)
  box(g, 2.17, 0.06, 1.92, solid('#1f5fff', 0.4), 0.075, 0.9, 0)
  // cabin: glass box, sloped windshield + rear window, roof, pillars, sill
  box(g, 1.8, 0.6, 1.72, darkGlass, -0.15, 1.57, 0)
  rot(box(g, 0.06, 0.72, 1.7, darkGlass, 0.95, 1.55, 0), 0.75)
  rot(box(g, 0.06, 0.66, 1.7, darkGlass, -1.25, 1.55, 0), -0.75)
  box(g, 1.75, 0.09, 1.74, white, -0.15, 1.91, 0)
  box(g, 1.82, 0.05, 1.76, trim, -0.15, 1.3, 0)
  for (const z of [0.86, -0.86]) box(g, 0.12, 0.6, 0.04, trim, -0.15, 1.57, z)
  // door seam, handles, mirrors, decals
  box(g, 0.03, 0.42, 1.92, trim, 0.1, 1.05, 0)
  for (const x of [0.5, -0.38]) box(g, 0.16, 0.05, 1.94, chrome, x, 1.18, 0)
  for (const z of [1.02, -1.02]) box(g, 0.18, 0.14, 0.14, trim, 0.72, 1.35, z)
  const decalGeo = new PlaneGeometry(1.7, 0.42)
  const d1 = new Mesh(decalGeo, doorDecal())
  d1.position.set(0.07, 1.06, 0.956)
  const d2 = new Mesh(decalGeo, doorDecal())
  d2.position.set(0.07, 1.06, -0.956)
  d2.rotation.y = Math.PI
  g.add(d1, d2)
  // front: bumper, grille, headlights, plate, push bar
  box(g, 0.22, 0.3, 1.96, solid('#2a2d36', 0.6), 2.3, 0.62, 0)
  box(g, 0.04, 0.2, 0.9, trim, 2.26, 0.98, 0)
  for (const z of [0.68, -0.68]) box(g, 0.06, 0.16, 0.42, emissive('#fff6c2', 2.5), 2.26, 1.0, z)
  box(g, 0.03, 0.16, 0.42, solid('#f2f2f2', 0.5), 2.42, 0.62, 0)
  for (const z of [0.36, -0.36]) {
    box(g, 0.08, 0.55, 0.08, trim, 2.55, 0.78, z)
    box(g, 0.28, 0.06, 0.06, trim, 2.42, 0.62, z)
  }
  for (const y of [0.6, 0.98]) box(g, 0.08, 0.07, 0.9, trim, 2.55, y, 0)
  // back: bumper, taillights, plate, antenna
  box(g, 0.22, 0.3, 1.96, solid('#2a2d36', 0.6), -2.3, 0.62, 0)
  for (const z of [0.7, -0.7]) box(g, 0.06, 0.18, 0.36, emissive('#ff2a2a', 2.2), -2.26, 1.05, z)
  box(g, 0.03, 0.16, 0.42, solid('#f2f2f2', 0.5), -2.42, 0.62, 0)
  box(g, 0.03, 0.7, 0.03, trim, -1.9, 1.6, -0.6)
  // wheels + hubcaps
  for (const [x, z] of [[1.45, 0.86], [1.45, -0.86], [-1.45, 0.86], [-1.45, -0.86]]) {
    const w = new Mesh(wheelGeo, solid('#111216', 0.85))
    w.position.set(x, 0.4, z)
    const h = new Mesh(hubGeo, chrome)
    h.position.set(x, 0.4, z)
    g.add(w, h)
  }
  // light bar base + clear centre
  box(g, 0.36, 0.08, 1.5, trim, -0.35, 1.99, 0)
  box(g, 0.3, 0.14, 0.24, emissive('#ffffff', 0.8, '#d8dde8'), -0.35, 2.1, 0)
  // searchlight mount
  box(g, 0.16, 0.08, 0.16, trim, 0.45, 1.99, 0)

  // plain painted parts share one vertex-coloured material so the bake merges them into one draw call
  const paint = [white, black, trim, solid('#1f5fff', 0.4), solid('#2a2d36', 0.6), solid('#f2f2f2', 0.5), solid('#111216', 0.85)]
  g.traverse((o) => {
    if (!o.isMesh || !paint.includes(o.material)) return
    const c = o.material.color
    o.geometry = o.geometry === wheelGeo ? wheelGeo.clone() : o.geometry
    const n = o.geometry.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
    o.geometry.setAttribute('color', new BufferAttribute(col, 3))
    o.material = paintMat
  })
  const car = bake(g, true)
  car.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  // light bar stays its own meshes (blinks)
  const red = new MeshStandardMaterial({ color: '#330000', emissive: '#ff1f2f', emissiveIntensity: 3 })
  const blue = new MeshStandardMaterial({ color: '#000533', emissive: '#1f6bff', emissiveIntensity: 3 })
  const a = new Mesh(boxGeo(0.32, 0.16, 0.6), red)
  a.position.set(-0.35, 2.11, 0.44)
  const b = new Mesh(boxGeo(0.32, 0.16, 0.6), blue)
  b.position.set(-0.35, 2.11, -0.44)
  // searchlight: yaw group on the roof, pitched housing + glowing lens
  const aim = new Group()
  aim.position.set(0.45, 2.12, 0)
  const pitch = new Group()
  const housing = new Mesh(lampGeo, metal('#2b2f3a', 0.35))
  const lens = new MeshStandardMaterial({ color: '#fffbe0', emissive: '#fff3b0', emissiveIntensity: 4 })
  const lensMesh = new Mesh(lensGeo, lens)
  lensMesh.position.x = 0.17
  pitch.add(housing, lensMesh)
  aim.add(pitch)
  car.add(a, b, aim)
  live.add(car)
  bars.push(red, blue)
  return { car, aim, pitch, lens }
}

// The searchlight's ground spot (soft disc, bright rim, rippling rings) and its beam (a cone fading
// toward the ground). Additive, no depth write; uColor turns from white to red while a player is being spotted.
const spotGeo = new CircleGeometry(1, 40).rotateX(-Math.PI / 2)
const beamGeo = new ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0) // apex at the origin, base at y = -1
const spotVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`
function spotMaterial() {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color('#fff1b8') }, uTime: { value: 0 } },
    vertexShader: spotVert,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float disc = smoothstep(1.0, 0.86, r);
        float rim = smoothstep(0.76, 0.9, r) * smoothstep(1.0, 0.91, r);
        float rings = 0.5 + 0.5 * sin(r * 16.0 - uTime * 5.0);
        float a = disc * (0.32 + 0.14 * rings * (1.0 - r)) + rim * 0.75;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  })
}
function beamMaterial() {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color('#fff1b8') } },
    vertexShader: spotVert,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float a = 0.04 + 0.2 * vUv.y * vUv.y; // uv.y = 1 at the lamp, 0 at the ground
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
}

// The patrol route as a closed polyline of (x, z) corners, filleted and sampled every `step` m:
// { xs, zs, turn (1 = on a bend), step, n, length }. Pure numbers so per-frame lookups allocate nothing.
function sampleRoute(corners, radius, step = 0.25) {
  const n = corners.length
  const segs = [] // { kind: 'line', a, b } | { kind: 'arc', a, c, b } (quadratic bezier)
  const fillets = corners.map((p, i) => {
    const prev = corners[(i - 1 + n) % n]
    const next = corners[(i + 1) % n]
    const lin = Math.hypot(p[0] - prev[0], p[1] - prev[1])
    const lout = Math.hypot(next[0] - p[0], next[1] - p[1])
    const r = Math.min(radius, lin / 2, lout / 2)
    const a = [p[0] - ((p[0] - prev[0]) / lin) * r, p[1] - ((p[1] - prev[1]) / lin) * r]
    const b = [p[0] + ((next[0] - p[0]) / lout) * r, p[1] + ((next[1] - p[1]) / lout) * r]
    return { a, c: p, b }
  })
  for (let i = 0; i < n; i++) {
    const f = fillets[i]
    segs.push({ kind: 'arc', a: f.a, c: f.c, b: f.b })
    segs.push({ kind: 'line', a: f.b, b: fillets[(i + 1) % n].a })
  }
  // dense points, then resample at even arc length
  const px = []
  const pz = []
  const pt = []
  for (const s of segs) {
    const k = s.kind === 'arc' ? 24 : Math.max(1, Math.ceil(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / step))
    for (let j = 0; j < k; j++) {
      const t = j / k
      if (s.kind === 'arc') {
        const u = 1 - t
        px.push(u * u * s.a[0] + 2 * u * t * s.c[0] + t * t * s.b[0])
        pz.push(u * u * s.a[1] + 2 * u * t * s.c[1] + t * t * s.b[1])
        pt.push(1)
      } else {
        px.push(s.a[0] + (s.b[0] - s.a[0]) * t)
        pz.push(s.a[1] + (s.b[1] - s.a[1]) * t)
        pt.push(0)
      }
    }
  }
  const cum = [0]
  for (let i = 1; i <= px.length; i++) {
    const j = i % px.length
    cum.push(cum[i - 1] + Math.hypot(px[j] - px[i - 1], pz[j] - pz[i - 1]))
  }
  const length = cum[cum.length - 1]
  const count = Math.floor(length / step)
  const xs = new Float32Array(count)
  const zs = new Float32Array(count)
  const turn = new Uint8Array(count)
  let k = 0
  for (let i = 0; i < count; i++) {
    const d = i * step
    while (cum[k + 1] < d) k++
    const t = (d - cum[k]) / (cum[k + 1] - cum[k] || 1)
    const j = (k + 1) % px.length
    xs[i] = px[k] + (px[j] - px[k]) * t
    zs[i] = pz[k] + (pz[j] - pz[k]) * t
    turn[i] = pt[k]
  }
  return { xs, zs, turn, step: length / count, n: count, length }
}

// Police cruisers driving the yard roads: the west, back and east sides of the loop and both tunnel
// spurs (never the front road by the building entrance and ground zipline tower). They drive into each
// tunnel, U-turn out of sight inside the cliff and come back out, slow for bends, U-turn at
// POLICE_PATROL.endZ, keep their distance from the car ahead and stop for a player in front of them.
function createPatrol(live, bars, loop, spurZ, tunnelX) {
  const P = POLICE_PATROL
  const cw = (loop.x1 - loop.x0) / 2 - loop.w / 2 // west/east road centre |x|
  const zb = loop.z0 + loop.w / 2 // back road centre z
  const ln = P.lane
  const T = tunnelX + P.tunnelDepth // U-turn point hidden inside the cliff
  // Right-hand traffic, every bend a right turn: out of the west tunnel, up the outer west lane,
  // U-turn, down the inner west lane, east along the back, up the inner east lane, U-turn, down the
  // outer east lane into the east tunnel, U-turn inside, back out, down the outer east lane, west along
  // the back, up the outer west lane into the west tunnel, U-turn inside.
  const route = sampleRoute(
    [
      [-T, spurZ + ln],
      [-cw - ln, spurZ + ln],
      [-cw - ln, P.endZ],
      [-cw + ln, P.endZ],
      [-cw + ln, zb + ln],
      [cw - ln, zb + ln],
      [cw - ln, P.endZ],
      [cw + ln, P.endZ],
      [cw + ln, spurZ + ln],
      [T, spurZ + ln],
      [T, spurZ - ln],
      [cw + ln, spurZ - ln],
      [cw + ln, zb - ln],
      [-cw - ln, zb - ln],
      [-cw - ln, spurZ - ln],
      [-T, spurZ - ln],
    ],
    P.cornerRadius,
  )
  const { xs, zs, turn, step, n, length } = route
  const idx = (d) => ((Math.floor(d / step) % n) + n) % n
  const S = P.spot
  const cars = []
  for (let i = 0; i < P.cars; i++) {
    const { car, aim, pitch, lens } = cruiser(live, bars)
    const spotMat = spotMaterial()
    const beamMat = beamMaterial()
    const spot = new Mesh(spotGeo, spotMat)
    spot.scale.setScalar(S.radius)
    spot.renderOrder = 3
    const beam = new Mesh(beamGeo, beamMat)
    beam.renderOrder = 4
    live.add(spot, beam)
    cars.push({ g: car, aim, pitch, lens, spot, beam, spotMat, beamMat, phase: i * 2.1, d: (length / P.cars) * i + 10, v: P.speed })
  }
  const look = Math.max(1, Math.round(1.2 / step)) // heading from samples +-1.2 m apart

  function place(c) {
    const i = idx(c.d)
    const t = c.d / step - Math.floor(c.d / step)
    const j = (i + 1) % n
    const x = xs[i] + (xs[j] - xs[i]) * t
    const z = zs[i] + (zs[j] - zs[i]) * t
    const a = (i + look) % n
    const b = (i - look + n) % n
    c.g.position.set(x, 0, z)
    c.g.rotation.y = Math.atan2(-(zs[a] - zs[b]), xs[a] - xs[b]) // nose (+x) along the route
  }
  cars.forEach(place)

  const SAFE = new Color('#fff1b8')
  const ALARM = new Color('#ff2a1a')
  const DOWN = new Vector3(0, -1, 0)
  const ray = new Vector3()
  let seen = 0 // seconds the player has stood in a spot
  let seenBy = null
  // For the sound (sfx.js): each cruiser's ground position + speed, and how close a spot is to catching.
  const audio = { cars: cars.map(() => ({ x: 0, z: 0, v: 0 })), alarm: 0 }

  // awake: false while the police are asleep (searchlights off). watch: the player can be caught now
  // (on the heist bank, on the ground outside the building, not riding or already busted).
  // Returns true the moment the player has been held in a spot for S.catchTime.
  function update(dt, t, playerPos, awake = true, watch = false) {
    const ahead = Math.round(7 / step)
    let inside = null
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k]
      const i = idx(c.d)
      let target = P.speed
      for (let s = 0; s <= ahead; s += 2) if (turn[(i + s) % n]) target = P.turnSpeed
      // the car in front (along the route)
      const front = cars[(k + 1) % cars.length]
      if (front !== c && (((front.d - c.d) % length) + length) % length < 8) target = 0
      const yaw = c.g.rotation.y
      const fx = Math.cos(yaw)
      const fz = -Math.sin(yaw)
      // a player on the road in front
      if (playerPos && playerPos.y < 3) {
        const dx = playerPos.x - c.g.position.x
        const dz = playerPos.z - c.g.position.z
        const along = dx * fx + dz * fz
        const side = Math.abs(dx * fz - dz * fx)
        if (along > 0 && along < P.brakeDist && side < 1.8) target = 0
      }
      const acc = target < c.v ? 9 : 3
      c.v += Math.sign(target - c.v) * Math.min(Math.abs(target - c.v), acc * dt)
      c.d = (c.d + c.v * dt) % length
      place(c)
      const a = audio.cars[k]
      a.x = c.g.position.x
      a.z = c.g.position.z
      a.v = c.v

      // searchlight: sweeps side to side ahead of the car, never onto the front road (safe zone)
      const on = awake && Math.abs(c.g.position.x) < tunnelX - 1
      c.spot.visible = c.beam.visible = on
      c.lens.emissiveIntensity = on ? 4 : 0.15
      if (!on) continue
      const y2 = c.g.rotation.y
      const sweep = Math.sin(t * S.sweepSpeed + c.phase) * S.sweep
      const sx = c.g.position.x + Math.cos(y2 + sweep) * S.dist
      const sz = Math.min(c.g.position.z - Math.sin(y2 + sweep) * S.dist, P.safeZ - S.radius)
      const lx = c.g.position.x + Math.cos(y2) * 0.45
      const lz = c.g.position.z - Math.sin(y2) * 0.45
      const ly = 2.12
      c.aim.rotation.y = Math.atan2(-(sz - lz), sx - lx) - y2
      c.pitch.rotation.z = -Math.atan2(ly, Math.hypot(sx - lx, sz - lz))
      c.spot.position.set(sx, 0.16, sz)
      ray.set(sx - lx, 0.16 - ly, sz - lz)
      const len = ray.length()
      c.beam.position.set(lx, ly, lz)
      c.beam.quaternion.setFromUnitVectors(DOWN, ray.divideScalar(len))
      c.beam.scale.set(S.radius * 0.95, len, S.radius * 0.95)
      c.spotMat.uniforms.uTime.value = t
      if (watch && playerPos && playerPos.y < 3 && playerPos.z < P.safeZ && Math.hypot(playerPos.x - sx, playerPos.z - sz) < S.radius * 0.92) inside = c
    }
    if (inside) {
      seen += dt
      seenBy = inside
    } else seen = Math.max(0, seen - dt * 2)
    const alarm = Math.min(1, seen / S.catchTime)
    audio.alarm = alarm
    for (const c of cars) {
      const col = c.spotMat.uniforms.uColor.value
      col.copy(SAFE)
      if (c === seenBy) col.lerp(ALARM, alarm)
      c.beamMat.uniforms.uColor.value.copy(col)
    }
    if (seen >= S.catchTime) {
      seen = 0
      return true
    }
    return false
  }
  update.audio = audio
  return update
}

export function buildHub(scene) {
  const root = new Group() // baked
  const live = new Group() // sprites, glows, anything animated
  scene.add(live)
  const rand = mulberry32(4242)
  const { hub, bank, river, slabDepth } = LAYOUT

  // --- Land slabs -------------------------------------------------------------
  const top = studs(GREEN, { kind: 'tile', tile: 4 })
  const side = cliff()
  const slabMats = [side, side, top, side, side, side]
  const hubSlab = new Mesh(boxGeo(hub.maxX - hub.minX, slabDepth, hub.maxZ - hub.minZ), slabMats)
  hubSlab.position.set((hub.minX + hub.maxX) / 2, -slabDepth / 2, (hub.minZ + hub.maxZ) / 2)
  hubSlab.receiveShadow = true
  root.add(hubSlab)
  solidMM(hub.minX, -slabDepth, hub.minZ, hub.maxX, 0, hub.maxZ)
  const bankSlab = new Mesh(boxGeo(bank.maxX - bank.minX, slabDepth, bank.maxZ - bank.minZ), slabMats)
  bankSlab.position.set((bank.minX + bank.maxX) / 2, -slabDepth / 2, (bank.minZ + bank.maxZ) / 2)
  bankSlab.receiveShadow = true
  root.add(bankSlab)
  solidMM(bank.minX, -slabDepth, bank.minZ, bank.maxX, 0, bank.maxZ)
  // river bed (deep blue, no collider: falling in respawns)
  const bed = new Mesh(new PlaneGeometry(200, 60), new MeshStandardMaterial({ color: '#0a3d8a', roughness: 1 }))
  bed.rotation.x = -Math.PI / 2
  bed.position.set(0, river.bedY, (river.minZ + river.maxZ) / 2)
  root.add(bed)
  // orange brick trims along both river banks
  const trim = studs(TRIM, { kind: 'round', tile: 4 })
  boxMM(root, hub.minX, -0.6, -0.4, hub.maxX, 0.12, 1.4, trim)
  boxMM(root, bank.minX, -0.6, bank.maxZ - 1.4, bank.maxX, 0.12, bank.maxZ + 0.4, trim)

  // --- Cliffs (three terraces on every outer edge) ---------------------------------
  const { tiers, tierHeight, tierStep } = LAYOUT.cliff
  const capMat = studs('#47c92b', { kind: 'tile', tile: 4 })
  const minX = hub.minX
  const maxX = hub.maxX
  const minZ = bank.minZ
  const maxZ = hub.maxZ
  const FAR = 70
  const edges = [] // for hedges: [x0,z0,x1,z1,y]
  for (let k = 0; k < tiers; k++) {
    const o = k * tierStep
    const h = (k + 1) * tierHeight
    const y0 = -slabDepth
    // west, east, north (bank side), south (hub back)
    boxMM(root, minX - o - FAR, y0, minZ - FAR, minX - o, h, maxZ + FAR, side, { cast: k === 0 })
    boxMM(root, maxX + o, y0, minZ - FAR, maxX + o + FAR, h, maxZ + FAR, side, { cast: k === 0 })
    boxMM(root, minX - FAR, y0, minZ - o - FAR, maxX + FAR, h, minZ - o, side, { cast: k === 0 })
    boxMM(root, minX - FAR, y0, maxZ + o, maxX + FAR, h, maxZ + o + FAR, side, { cast: k === 0 })
    const capEnd = k < tiers - 1 ? tierStep : FAR
    boxMM(root, minX - o - capEnd, h, minZ - o - capEnd, minX - o + 0.5, h + 0.7, maxZ + o + capEnd, capMat, { cast: false })
    boxMM(root, maxX + o - 0.5, h, minZ - o - capEnd, maxX + o + capEnd, h + 0.7, maxZ + o + capEnd, capMat, { cast: false })
    boxMM(root, minX - o - capEnd, h, minZ - o - capEnd, maxX + o + capEnd, h + 0.7, minZ - o + 0.5, capMat, { cast: false })
    boxMM(root, minX - o - capEnd, h, maxZ + o - 0.5, maxX + o + capEnd, h + 0.7, maxZ + o + capEnd, capMat, { cast: false })
    edges.push([minX - o, minZ - o, minX - o, maxZ + o, h + 0.7], [maxX + o, minZ - o, maxX + o, maxZ + o, h + 0.7], [minX - o, minZ - o, maxX + o, minZ - o, h + 0.7], [minX - o, maxZ + o, maxX + o, maxZ + o, h + 0.7])
  }
  // invisible walls so nobody climbs out
  solidMM(minX - 2, -slabDepth, minZ - 2, minX, 40, maxZ + 2)
  solidMM(maxX, -slabDepth, minZ - 2, maxX + 2, 40, maxZ + 2)
  solidMM(minX - 2, -slabDepth, minZ - 2, maxX + 2, 40, minZ)
  solidMM(minX - 2, -slabDepth, maxZ, maxX + 2, 40, maxZ + 2)

  // --- Instanced foliage: hedges on cliff lips, voxel trees ---------------------------
  const leavesMat = new MeshStandardMaterial({ map: plainTex(paintLeaves()), roughness: 0.85 })
  const trunkMat = solid('#7a4a24', 0.85)
  const hedgeList = []
  for (const [x0, z0, x1, z1, y] of edges) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.floor(len / 2.6)
    for (let i = 0; i < n; i++) {
      const t = (i + rand() * 0.5) / n
      const s = 1.6 + rand() * 1.6
      const inward = x0 === x1 ? (x0 < 0 ? -1 : 1) : 0
      const inwardZ = z0 === z1 ? (z0 < 0 ? -1 : 1) : 0
      hedgeList.push([x0 + (x1 - x0) * t + inward * (s * 0.5 + rand()), y + s * 0.4, z0 + (z1 - z0) * t + inwardZ * (s * 0.5 + rand()), s])
    }
  }
  const trees = []
  const addTree = (x, z, y = 0, s = 1) => trees.push([x, y, z, s * (0.85 + rand() * 0.4)])
  // trees on the terraces
  for (let i = 0; i < 70; i++) {
    const sideIdx = i % 4
    const k = (i >> 2) % tiers
    const o = k * tierStep + 2 + rand() * (tierStep - 3)
    const y = (k + 1) * tierHeight + 0.7
    if (sideIdx === 0) addTree(minX - o, minZ + rand() * (maxZ - minZ), y, 1.3)
    else if (sideIdx === 1) addTree(maxX + o, minZ + rand() * (maxZ - minZ), y, 1.3)
    else if (sideIdx === 2) addTree(minX + rand() * (maxX - minX), minZ - o, y, 1.3)
    else addTree(minX + rand() * (maxX - minX), maxZ + o, y, 1.3)
  }
  // hub trees (edges and between bases), bank trees outside the yard
  for (const [x, z] of [[-66, 8], [-62, 18], [-67, 30], [66, 8], [62, 20], [67, 32], [-66, 60], [66, 62], [-23, 96], [23, 96], [-66, 96], [66, 96], [-23, 30], [23, 30], [-60, 2], [58, 3]]) addTree(x + rand() * 2, z + rand() * 2)
  for (const [x, z] of [[-50, -50], [-58, -66], [-50, -82], [-62, -100], [-48, -120], [50, -50], [60, -64], [52, -84], [62, -104], [48, -122], [-20, -125], [0, -128], [20, -126], [-34, -116], [34, -116]]) addTree(x + rand() * 3, z + rand() * 3)

  const unit = boxGeo(1, 1, 1)
  const hedges = new InstancedMesh(unit, leavesMat, hedgeList.length + trees.length * 4)
  const trunks = new InstancedMesh(unit, trunkMat, trees.length)
  const m4 = new Matrix4()
  const q = new Quaternion()
  const v = new Vector3()
  const sc = new Vector3()
  let li = 0
  for (const [x, y, z, s] of hedgeList) {
    q.setFromAxisAngle(v.set(0, 1, 0), rand() * 0.4)
    hedges.setMatrixAt(li++, m4.compose(v.set(x, y, z), q, sc.set(s, s * 0.8, s)))
  }
  trees.forEach(([x, y, z, s], i) => {
    const th = 2.6 * s
    q.identity()
    trunks.setMatrixAt(i, m4.compose(v.set(x, y + th / 2, z), q, sc.set(0.7 * s, th, 0.7 * s)))
    const blocks = [[0, th + 1.2 * s, 0, 3.2 * s], [0.6 * s, th + 2.7 * s, 0.3 * s, 2.4 * s], [-0.7 * s, th + 2.2 * s, -0.4 * s, 2.0 * s], [0.1 * s, th + 3.9 * s, -0.2 * s, 1.5 * s]]
    for (const [dx, dy, dz, bs] of blocks) {
      q.setFromAxisAngle(v.set(0, 1, 0), rand() * 0.6)
      hedges.setMatrixAt(li++, m4.compose(v.set(x + dx, y + dy, z + dz), q, sc.set(bs, bs, bs)))
    }
  })
  hedges.count = li
  for (const im of [hedges, trunks]) {
    im.castShadow = true
    im.receiveShadow = true
    scene.add(im)
  }

  // --- Hub fence along the river (gap for the dock) ----------------------------------
  fence(root, hub.minX, 0.9, -7.2, 0.9)
  fence(root, 7.2, 0.9, hub.maxX, 0.9)
  solidMM(hub.minX, 0, 0.6, -7.2, 3, 1.2)
  solidMM(7.2, 0, 0.6, hub.maxX, 3, 1.2)

  // --- Dock + hub zipline tower --------------------------------------------------------
  const deckMat = studs('#ff8a1a', { kind: 'round', tile: 4 })
  const deck2 = studs('#ffa52e', { kind: 'round', tile: 4 })
  boxMM(root, -7, -1.4, -4, 7, 0.4, 10, deckMat, { collide: true })
  boxMM(root, -5, 0.4, -2, 5, 0.8, 8, deck2, { collide: true })
  boxMM(root, -3, 0.8, 0, 3, 1.2, 6, deckMat, { collide: true })
  // dock pilings into the water
  for (const [px, pz] of [[-6.4, -3.4], [6.4, -3.4], [-6.4, 0], [6.4, 0]]) box(root, 0.7, 4, 0.7, solid('#6b3a1a', 0.8), px, -2.6, pz)
  fence(root, -7, -4, 7, -4, '#3f7bff')
  fence(root, -7, -4, -7, 0.9, '#3f7bff')
  fence(root, 7, -4, 7, 0.9, '#3f7bff')
  solidMM(-7.2, 0, -4.4, 7.2, 3.5, -3.6)
  solidMM(-7.4, 0, -4.4, -6.6, 3.5, 1.2)
  solidMM(6.6, 0, -4.4, 7.4, 3.5, 1.2)
  const hz = ZIPLINE.hub
  buildTower(root, hz.x, hz.deck, hz.z, hz.top, -1)
  solidMM(hz.x - 0.9, hz.deck, hz.z - 0.9, hz.x + 0.9, hz.top, hz.z + 0.9)
  const hubPad = towerPad(live, hz.x, hz.deck, hz.z + 2.2)
  const towerLight = new PointLight('#5fd0ff', 18, 14, 1.6)
  towerLight.position.set(hz.x, hz.deck + 2, hz.z + 2.2)
  live.add(towerLight)

  // --- Paths and roads ---------------------------------------------------------------------
  const path = studs('#c9c4e6', { kind: 'round', tile: 4 })
  boxMM(root, -4, 0, 10, 4, 0.06, 31, path, { cast: false })
  boxMM(root, -30, 0, 16, 30, 0.05, 19.5, path, { cast: false })
  const road = asphalt('#6e7183')
  const lineMat = solid('#fff3b0', 0.6)
  boxMM(root, hub.minX, 0, 62.5, hub.maxX, 0.07, 67.5, road, { cast: false })
  for (let x = hub.minX + 2; x < hub.maxX - 2; x += 5) boxMM(root, x, 0.07, 64.85, x + 2.4, 0.09, 65.15, lineMat, { cast: false })
  for (const rx of [-23, 23]) {
    boxMM(root, rx - 2.5, 0, 22, rx + 2.5, 0.07, hub.maxZ, road, { cast: false })
    for (let z = 24; z < hub.maxZ - 2; z += 5) boxMM(root, rx - 0.15, 0.07, z, rx + 0.15, 0.09, z + 2.4, lineMat, { cast: false })
  }
  // flower beds
  const petals = ['#ff4d8d', '#ffd23a', '#ffffff', '#b46bff']
  for (const [fx, fz] of [[-8, 22], [8, 22], [-30, 24], [30, 24], [-62, 46], [62, 46], [-36, 9], [36, 9]]) {
    boxMM(root, fx - 1.6, 0, fz - 1.0, fx + 1.6, 0.35, fz + 1.0, studs('#7a4a24', { tile: 4 }), { cast: false })
    for (let i = 0; i < 6; i++) box(root, 0.35, 0.35, 0.35, solid(petals[i % 4], 0.5), fx - 1.2 + (i % 3) * 1.2 + rand() * 0.3, 0.55, fz - 0.4 + Math.floor(i / 3) * 0.8, { cast: false })
  }
  // lamps
  for (const [lx, lz, r] of [[-9, 12, 0], [9, 12, Math.PI], [-26, 22, 0], [26, 22, Math.PI], [-26, 44, 0], [26, 44, Math.PI], [-26, 80, 0], [26, 80, Math.PI], [-60, 65, -Math.PI / 2], [60, 65, -Math.PI / 2], [-4.6, 28, 0], [4.6, 28, Math.PI]]) lamp(root, lx, lz, r)

  // --- Stalls ---------------------------------------------------------------------------
  const stalls = {}
  for (const [key, s] of Object.entries(STALLS)) stalls[key] = buildStall(root, live, s)

  // --- Bases: one plot per player in the room (BASE.positions); every shell looks the same, and
  // base.js adds each plot's live parts (owner sign, loot) -- game.js decides whose is whose ------
  const baseSlots = BASE.positions.map(([bx, bz]) => buildBaseShell(root, bx, bz, true))

  // --- Billboards: timed spawns (left), heist stats (right) --------------------------------
  const boardPost = metal('#2d3140', 0.5)
  const timerSign = canvasSign(13, 6.5, 1024, 512, () => {})
  timerSign.mesh.position.set(-38, 7.2, 9)
  timerSign.mesh.rotation.y = 0.45
  live.add(timerSign.mesh)
  for (const dx of [-4.5, 4.5]) box(root, 0.5, 4.2, 0.5, boardPost, -38 + Math.cos(0.45) * dx, 2.1, 9 - Math.sin(0.45) * dx)
  box(root, 13.6, 7.1, 0.4, solid('#24123f', 0.6), -38 - Math.sin(0.45) * 0.25, 7.2, 9 - Math.cos(0.45) * 0.25, { rotY: 0.45 })
  const statsSign = canvasSign(11, 7, 1024, 640, () => {})
  statsSign.mesh.position.set(38, 6.8, 9)
  statsSign.mesh.rotation.y = -0.45
  live.add(statsSign.mesh)
  for (const dx of [-3.8, 3.8]) box(root, 0.5, 3.6, 0.5, boardPost, 38 + Math.cos(-0.45) * dx, 1.8, 9 - Math.sin(-0.45) * dx)
  box(root, 11.6, 7.6, 0.4, solid('#3a1406', 0.6), 38 + Math.sin(0.45) * 0.25, 6.8, 9 - Math.cos(0.45) * 0.25, { rotY: -0.45 })

  // --- The far bank: heist yard -----------------------------------------------------------
  const { yard } = LAYOUT
  fence(root, yard.minX, yard.maxZ - 1.2, yard.maxX, yard.maxZ - 1.2, '#3f7bff')
  fence(root, yard.minX, yard.minZ, yard.maxX, yard.minZ, '#7d7f8c', 1.6)
  // west/east fences leave a gap where the road to each tunnel crosses them
  const gap = { z0: -94, z1: -86 }
  for (const x of [yard.minX, yard.maxX]) {
    fence(root, x, yard.minZ, x, gap.z0, '#7d7f8c', 1.6)
    fence(root, x, gap.z1, x, yard.maxZ - 1.2, '#7d7f8c', 1.6)
    solidMM(x - 0.3, 0, yard.minZ, x + 0.3, 4, gap.z0)
    solidMM(x - 0.3, 0, gap.z1, x + 0.3, 4, yard.maxZ)
  }
  solidMM(yard.minX, 0, yard.maxZ - 1.5, yard.maxX, 4, yard.maxZ - 0.9)
  solidMM(yard.minX, 0, yard.minZ - 0.3, yard.maxX, 4, yard.minZ + 0.3)
  // road loop round the building + spurs to the tunnels
  const loop = { x0: -31, x1: 31, z0: -101, z1: -55, w: 6 }
  boxMM(root, loop.x0, 0, loop.z0, loop.x1, 0.07, loop.z0 + loop.w, road, { cast: false })
  boxMM(root, loop.x0, 0, loop.z1 - loop.w, loop.x1, 0.07, loop.z1, road, { cast: false })
  boxMM(root, loop.x0, 0, loop.z0, loop.x0 + loop.w, 0.07, loop.z1, road, { cast: false })
  boxMM(root, loop.x1 - loop.w, 0, loop.z0, loop.x1, 0.07, loop.z1, road, { cast: false })
  boxMM(root, bank.minX, 0, -93, loop.x0, 0.07, -87, road, { cast: false })
  boxMM(root, loop.x1, 0, -93, bank.maxX, 0.07, -87, road, { cast: false })
  for (let x = loop.x0 + 3; x < loop.x1 - 3; x += 5) {
    boxMM(root, x, 0.07, loop.z0 + 2.85, x + 2.4, 0.09, loop.z0 + 3.15, lineMat, { cast: false })
    boxMM(root, x, 0.07, loop.z1 - 3.15, x + 2.4, 0.09, loop.z1 - 2.85, lineMat, { cast: false })
  }
  for (let z = loop.z0 + 6; z < loop.z1 - 6; z += 5) {
    boxMM(root, loop.x0 + 2.85, 0.07, z, loop.x0 + 3.15, 0.09, z + 2.4, lineMat, { cast: false })
    boxMM(root, loop.x1 - 3.15, 0.07, z, loop.x1 - 2.85, 0.09, z + 2.4, lineMat, { cast: false })
  }
  // sidewalk round the building
  boxMM(root, -19, 0, -90, 19, 0.12, -61.5, studs('#d2cde8', { kind: 'tile', tile: 2 }), { cast: false })
  // tunnels in the west/east cliff faces
  const tunnelStone = studs('#6a5fb0', { tile: 4 })
  for (const sx of [-1, 1]) {
    const fx = sx * bank.maxX
    boxMM(root, fx - sx * 0.2, 0, -97, fx + sx * 1.6, 9, -83, tunnelStone)
    boxMM(root, fx - sx * 0.3, 0.05, -94, fx + sx * 1.7, 6.5, -86, solid('#090814', 1))
  }
  // police cruisers patrolling the loop + street lamps on the bank
  const bars = []
  const patrol = createPatrol(live, bars, loop, -90, bank.maxX)
  for (const [lx, lz, r] of [[-34, -60, 0], [34, -60, Math.PI], [-34, -80, 0], [34, -80, Math.PI], [-34, -100, 0], [34, -100, Math.PI], [-8, -48, 0], [8, -48, Math.PI]]) lamp(root, lx, lz, r)
  // ground zipline tower in front of the building
  const gz = ZIPLINE.ground
  boxMM(root, gz.x - 2.6, 0, gz.z - 2.6, gz.x + 2.6, 0.3, gz.z + 2.6, studs('#3a8dff', { tile: 4 }), { collide: true })
  buildTower(root, gz.x, 0.3, gz.z, gz.top, 1)
  solidMM(gz.x - 0.9, 0.3, gz.z - 0.9, gz.x + 0.9, gz.top, gz.z + 0.9)
  const groundPad = towerPad(live, gz.x, 0.3, gz.z - 2.2)

  // --- Bake the static scene -------------------------------------------------------------
  const baked = bake(root, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(baked)

  const pulse = [hubPad, groundPad, ...Object.values(stalls).map((s) => s.ring)]
  return {
    stalls,
    baseSlots,
    hubPadAt: new Vector3(hz.x, hz.deck, hz.z + 2.2),
    groundPadAt: new Vector3(gz.x, 0.3, gz.z - 2.2),
    timerSign,
    statsSign,
    police: patrol.audio, // { cars: [{ x, z, v }], alarm } for sfx.js
    // Returns true when a police searchlight has caught the player (see createPatrol).
    update(dt, t, playerPos, policeAwake = true, watch = false) {
      const caught = patrol(dt, t, playerPos, policeAwake, watch)
      pulse.forEach((r, i) => {
        const k = 1 + Math.sin(t * 3 + i) * 0.08
        r.scale.set(k, k, k)
        r.material.opacity = 0.65 + Math.sin(t * 3 + i) * 0.25
      })
      const on = Math.sin(t * 9) > 0
      for (let i = 0; i < bars.length; i += 2) {
        bars[i].emissiveIntensity = on ? 4 : 0.3
        bars[i + 1].emissiveIntensity = on ? 0.3 : 4
      }
      return caught
    },
  }
}

// Draw helpers for the two billboards (called by game.js with live data).
export function drawTimerBoard(ctx, w, h, rows) {
  ctx.fillStyle = '#1b0d33'
  ctx.fillRect(0, 0, w, h)
  const colors = [['#ffd21f', '#ff9a1f'], ['#ff4fa3', '#d62f8a'], ['#9b5bff', '#5d2bd6']]
  rows.forEach((r, i) => {
    const y = 26 + i * 160
    const g = ctx.createLinearGradient(0, y, w, y + 140)
    g.addColorStop(0, colors[i][0])
    g.addColorStop(1, colors[i][1])
    ctx.fillStyle = g
    roundRect(ctx, 24, y, w - 48, 140, 26)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    roundRect(ctx, 34, y + 8, w - 68, 40, 18)
    ctx.fill()
    outlinedText(ctx, `${r.label}: ${r.time}`, w / 2, y + 74, 64, '#ffffff', '#2a0b3d')
  })
}
export function drawStatsBoard(ctx, w, h, stats) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#ff6a1f')
  g.addColorStop(1, '#d6331f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  roundRect(ctx, 30, 120, w - 60, h - 150, 24)
  ctx.fill()
  outlinedText(ctx, 'Heist Stats', w / 2, 66, 76, '#ffe14d', '#3a0b05')
  stats.forEach((s, i) => {
    const y = 175 + i * 88
    ctx.font = '700 46px Fredoka, Arial Black, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 9
    ctx.strokeStyle = '#2a0805'
    ctx.strokeText(s[0], 70, y)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(s[0], 70, y)
    ctx.textAlign = 'right'
    ctx.strokeText(s[1], w - 70, y)
    ctx.fillStyle = s[2] ?? '#7dff5a'
    ctx.fillText(s[1], w - 70, y)
  })
}
