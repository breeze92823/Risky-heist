// Risky Heist game rules. Owns the save state and wires the world pieces together:
//   hub (stalls, billboards, bases) <- zipline -> building (floors, doors, treasures)
// Loop: ride the zipline to the tower (floors restock, doors reset), smash the
// glass entrance, steal treasures (carry slots limit how many), climb the stairs and
// break each floor's door for richer floors, leave through a floor's glass exit and
// zipline home, then place the loot on the base: each slot earns $/s into a collector
// pad and adds its Luck to every future roll. Police heat ("Jail Chance") builds while
// on the heist bank; at 100% you are busted and lose what you carry.
import { CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, Quaternion, TubeGeometry, Vector3 } from 'three'
import { BASE, BOOSTS, BUILDING, DAILY, FLOORS, HIT_INTERVAL, JAIL, LAYOUT, LUCK_POWER, RARITIES, REBIRTH, SAVE_KEY, SPAWN, STALLS, TIMED_SPAWNS, TOOLS, TREASURES, UPGRADES, ZIPLINE } from '../config.js'
import { player, onRespawn, resetPlayer, setDriver, isDriven } from '../player.js'
import { syncYawToPlayer } from '../camera.js'
import { BONE_INDEX } from '../avatar/rig.js'
import { createFx } from './fx.js'
import { sfx } from './sfx.js'
import { buildHub, drawStatsBoard, drawTimerBoard } from './hub.js'
import { buildBuilding } from './building.js'
import { createBase } from './base.js'
import { createInteractions } from './interact.js'
import { createHud } from './hud.js'
import { makeTreasure, setThumbEnvironment, thumbnail } from './models.js'
import { boxGeo as boxGeoLocal, fmt, metal, money } from './kit.js'

const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, tier: i }]))
const TREASURE = Object.fromEntries(TREASURES.map((t) => [t.id, t]))
const BY_RARITY = Object.fromEntries(RARITIES.map((r) => [r.id, TREASURES.filter((t) => t.rarity === r.id && !t.exclusive)]))
const SLOT_COUNT = BASE.slotsPerSide * 2
const pick = (arr) => arr[(Math.random() * arr.length) | 0]

// --- Save state ------------------------------------------------------------------------
function freshState() {
  const now = Date.now()
  return {
    money: 0,
    carryCap: UPGRADES.carry.start,
    unlocked: UPGRADES.base.start,
    tool: 0,
    owned: [0],
    slots: Array.from({ length: SLOT_COUNT }, () => ({ id: null, stored: 0 })),
    carried: [],
    discovered: [],
    rebirths: 0,
    daily: { day: 1, claimed: Array(7).fill(false), nextAt: now + DAILY.dayHours * 3600000 },
    stats: { stolen: 0, heists: 0, earned: 0, busts: 0, bestId: null, maxFloor: 1 },
    spawns: Object.fromEntries(TIMED_SPAWNS.map((s) => [s.rarity, now + s.seconds * 1000])),
    pending: {},
    lastSeen: now,
  }
}
const cashMult = (rebirths) => 1 + REBIRTH.step * rebirths
const rebirthCost = (rebirths) => Math.round(REBIRTH.baseCost * Math.pow(REBIRTH.costGrowth, rebirths))
function loadState() {
  const s = freshState()
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      Object.assign(s, d)
      s.stats = { ...freshState().stats, ...d.stats }
      s.slots = Array.from({ length: SLOT_COUNT }, (_, i) => ({ id: d.slots?.[i]?.id && TREASURE[d.slots[i].id] ? d.slots[i].id : null, stored: Number(d.slots?.[i]?.stored) || 0 }))
      s.carried = (d.carried ?? []).filter((id) => TREASURE[id])
      // collectors keep filling while the game was closed (capped)
      const away = Math.min(BASE.offlineCapSeconds, Math.max(0, (Date.now() - (d.lastSeen ?? Date.now())) / 1000))
      s.rebirths = Math.max(0, Math.floor(Number(d.rebirths) || 0))
      const dd = d.daily ?? {}
      s.daily = {
        day: Math.min(7, Math.max(1, Math.floor(Number(dd.day) || 1))),
        claimed: Array.from({ length: 7 }, (_, i) => !!dd.claimed?.[i]),
        nextAt: Number(dd.nextAt) || Date.now() + DAILY.dayHours * 3600000,
      }
      s.slots.forEach((sl, i) => {
        if (sl.id && i < s.unlocked) sl.stored += TREASURE[sl.id].income * cashMult(s.rebirths) * away
      })
      s.awaySeconds = away
    }
  } catch {
    // corrupt or blocked storage: start fresh
  }
  return s
}

export function createGame({ scene, camera, renderer, preset }) {
  const fx = createFx(scene, camera, renderer)
  fx.setDensity(preset.particles ?? 1)
  const hub = buildHub(scene)
  const building = buildBuilding(scene, { fx, sfx })
  const base = createBase(scene, hub.baseSlots[BASE.player])
  const interactions = createInteractions(camera)
  const state = loadState()
  const heist = { active: false, visited: new Set(), anchorFloor: 0, heat: 0, stopUntil: 0, riding: null, busted: false }
  const thumb = (id) => thumbnail(id, renderer)
  setThumbEnvironment(scene.environment)

  // --- Derived numbers -----------------------------------------------------------------------
  const placed = () => state.slots.filter((s, i) => s.id && i < state.unlocked)
  const totalLuck = () => placed().reduce((a, s) => a + TREASURE[s.id].luck, 0)
  const totalIncome = () => placed().reduce((a, s) => a + TREASURE[s.id].income, 0)
  const tool = () => TOOLS[state.tool]
  const mult = () => cashMult(state.rebirths)
  const stopPrice = () => Math.round(Math.max(BOOSTS.stopPolice.base, totalIncome() * BOOSTS.stopPolice.incomeSeconds))
  const randPrice = () => Math.round(Math.max(BOOSTS.randomTreasure.base, totalIncome() * BOOSTS.randomTreasure.incomeSeconds))
  const baseCost = () => {
    const step = (state.unlocked - UPGRADES.base.start) / UPGRADES.base.step
    return UPGRADES.base.costs[step] ?? null
  }
  const carryCost = () => UPGRADES.carry.costs[state.carryCap - UPGRADES.carry.start] ?? null
  const inHeistZone = () => player.position.z < LAYOUT.river.minZ + 0.5

  function roll(floorIndex) {
    const luck = totalLuck()
    const k = 1 + (luck / 100) * LUCK_POWER
    const w = FLOORS[floorIndex].weights.map((v, tier) => (tier === 0 ? v : v * Math.pow(k, tier)))
    let r = Math.random() * w.reduce((a, b) => a + b, 0)
    let tier = 0
    for (; tier < w.length - 1; tier++) {
      r -= w[tier]
      if (r <= 0) break
    }
    return pick(BY_RARITY[RARITIES[tier].id]).id
  }

  // --- Saving ------------------------------------------------------------------------------------
  let saveT = 0
  function save() {
    state.lastSeen = Date.now()
    try {
      const { awaySeconds, ...rest } = state
      void awaySeconds
      localStorage.setItem(SAVE_KEY, JSON.stringify(rest))
    } catch {
      // storage blocked: the session still plays
    }
  }
  window.addEventListener('beforeunload', save)
  document.addEventListener('visibilitychange', () => document.hidden && save())

  // --- HUD ---------------------------------------------------------------------------------------
  const hud = createHud({
    onHome: () => teleport(base.entrance, 0),
    onSell: () => teleport(new Vector3(STALLS.sell.x, 0.6, STALLS.sell.z + 3.6), Math.PI),
    onPlaceBest: placeBest,
    onStopPolice: buyStopPolice,
    onRandomTreasure: buyRandom,
    onIndex: openIndex,
    onGuide: openGuide,
    onRebirth: openRebirth,
    onGifts: openDaily,
  })
  function refreshCarry() {
    hud.setCarry(
      state.carried.map((id) => ({ id, name: TREASURE[id].name, color: RARITY[TREASURE[id].rarity].color === '#1b1b1b' ? '#ffffff' : RARITY[TREASURE[id].rarity].color, thumb: thumb(id) })),
      state.carryCap,
    )
    refreshHeld()
  }
  function refreshBase() {
    state.slots.forEach((s, i) => {
      if (base.slots[i].item !== (i < state.unlocked ? s.id : null)) base.setItem(i, i < state.unlocked ? s.id : null)
      base.setStored(i, s.stored)
    })
    base.setUnlocked(state.unlocked)
    base.setStats(totalLuck(), totalIncome() * mult())
    base.setUpgrade(state.unlocked, SLOT_COUNT, baseCost())
    hud.setIncome(totalIncome() * mult())
    hud.setRebirth(mult(), state.money / rebirthCost(state.rebirths))
  }

  function canAfford(cost) {
    if (state.money >= cost) return true
    hud.toast(`Need ${money(cost - state.money)} more!`, '#ff6a6a')
    sfx.deny()
    return false
  }
  function spend(cost) {
    state.money -= cost
    hud.setMoney(state.money)
    hud.setRebirth(mult(), state.money / rebirthCost(state.rebirths))
  }
  function earn(amount, at) {
    state.money += amount
    state.stats.earned += amount
    hud.setMoney(state.money)
    hud.setRebirth(mult(), state.money / rebirthCost(state.rebirths))
    if (at) fx.floatText(at, `+${money(amount)}`, { color: '#6dff3a', size: amount > 1e6 ? 1.5 : 1.2 })
  }

  // --- Teleport (Home / Sell buttons, bust) ---------------------------------------------------------
  function teleport(p, facing) {
    if (inHeistZone() || heist.riding) {
      hud.toast('Escape the tower first!', '#ff6a6a')
      sfx.deny()
      return
    }
    resetPlayer({ x: p.x, y: p.y, z: p.z }, facing)
    syncYawToPlayer()
    fx.ring(new Vector3(p.x, p.y + 0.05, p.z), '#5fd0ff', 3, 0.5)
  }

  // --- Zipline cable + rides ------------------------------------------------------------------------
  const hz = ZIPLINE.hub
  const gz = ZIPLINE.ground
  const hubTop = new Vector3(hz.x, hz.top + 0.25, hz.z - 2)
  const groundTop = new Vector3(gz.x, gz.top + 0.25, gz.z + 2)
  const anchorTop = (f) => (f === 0 ? groundTop : building.floors[f].anchor.top)
  const anchorStand = (f) => (f === 0 ? hub.groundPadAt : building.floors[f].anchor.stand)
  const cableEnd = groundTop.clone()
  const cableTarget = new Vector3()
  const cableMat = new MeshStandardMaterial({ color: '#1d1f26', roughness: 0.4, metalness: 0.6 })
  const cable = new Mesh(new TubeGeometry(new CatmullRomCurve3([hubTop, groundTop]), 4, 0.07, 6), cableMat)
  cable.castShadow = true
  scene.add(cable)
  const sag = (a, b) => a.distanceTo(b) * ZIPLINE.sag
  function cablePoint(a, b, t, out) {
    out.lerpVectors(a, b, t)
    out.y -= sag(a, b) * 4 * t * (1 - t)
    return out
  }
  const cablePts = Array.from({ length: 33 }, () => new Vector3())
  const lastEnd = new Vector3(Infinity, 0, 0)
  function rebuildCable() {
    if (lastEnd.distanceToSquared(cableEnd) < 1e-6) return
    lastEnd.copy(cableEnd)
    cablePts.forEach((p, i) => cablePoint(hubTop, cableEnd, i / (cablePts.length - 1), p))
    cable.geometry.dispose()
    cable.geometry = new TubeGeometry(new CatmullRomCurve3(cablePts), 64, 0.07, 6)
  }
  // trolley + handle bar that runs on the cable
  const trolley = new Group()
  const tBody = new Mesh(boxGeoLocal(0.5, 0.3, 0.7), metal('#ffcc22', 0.35))
  const tBar = new Mesh(boxGeoLocal(1.3, 0.12, 0.12), metal('#3a3e4a', 0.4))
  tBar.position.y = -ZIPLINE.hang + 1.9
  const tRod = new Mesh(boxGeoLocal(0.08, ZIPLINE.hang - 0.5, 0.08), metal('#3a3e4a', 0.4))
  tRod.position.y = -(ZIPLINE.hang - 0.5) / 2
  trolley.add(tBody, tBar, tRod)
  trolley.visible = false
  scene.add(trolley)

  const tmpA = new Vector3()
  const tmpB = new Vector3()
  // Ride from (cable end a, stand point from) to (cable end b, stand point to).
  function ride(a, b, fromStand, toStand, onDone) {
    if (heist.riding) return
    const hang = ZIPLINE.hang
    const len = a.distanceTo(b)
    const lift = 0.55
    const drop = 0.55
    const dur = len / ZIPLINE.speed
    let t = 0
    const start = new Vector3(player.position.x, player.position.y, player.position.z)
    const out = new Vector3()
    heist.riding = { t: 0 }
    sfx.zipStart()
    trolley.visible = true
    fx.burst(start, { count: 18, color: '#7fd8ff', speed: 4, up: 3, size: 0.4 })
    setDriver((dt) => {
      t += dt
      if (t < lift) {
        const k = t / lift
        const e = k * k * (3 - 2 * k)
        out.set(start.x + (a.x - start.x) * e, start.y + (a.y - hang - start.y) * Math.min(1, e * 1.4), start.z + (a.z - start.z) * e)
        trolley.position.copy(a)
      } else if (t < lift + dur) {
        const k = (t - lift) / dur
        const e = k < 0.15 ? (k / 0.15) * (k / 0.15) * 0.15 : k // ease in, then constant
        cablePoint(a, b, Math.min(1, e), tmpA)
        trolley.position.copy(tmpA)
        out.set(tmpA.x, tmpA.y - hang, tmpA.z)
        cablePoint(a, b, Math.min(1, e + 0.02), tmpB)
        player.facing = Math.atan2(tmpB.x - tmpA.x, tmpB.z - tmpA.z)
        sfx.zipSpeed(Math.min(1, k * 3))
        fx.trickle(tmpA, 40, dt, { color: ['#ffd76a', '#ffffff', '#ffb31a'], speed: 3, up: -1, size: 0.25, life: 0.4, gravity: -10 })
      } else if (t < lift + dur + drop) {
        const k = (t - lift - dur) / drop
        const e = k * k * (3 - 2 * k)
        out.set(b.x + (toStand.x - b.x) * e, b.y - hang + (toStand.y - (b.y - hang)) * e, b.z + (toStand.z - b.z) * e)
        trolley.position.copy(b)
      } else {
        trolley.visible = false
        sfx.zipStop()
        heist.riding = null
        fx.ring(new Vector3(toStand.x, toStand.y + 0.05, toStand.z), '#5fd0ff', 3.5, 0.5)
        fx.burst(toStand, { count: 24, color: '#7fd8ff', speed: 5, up: 2, size: 0.4 })
        queueMicrotask(onDone)
        return null
      }
      return out
    })
    void fromStand
  }

  function rideToTower() {
    if (heist.riding) return
    heist.anchorFloor = 0
    cableEnd.copy(groundTop)
    rebuildCable()
    startHeist()
    ride(hubTop, groundTop, hub.hubPadAt, hub.groundPadAt, () => {
      hud.banner('Heist Started!', 'Smash the glass and grab the loot', '#ffe14d')
    })
  }
  function rideHome(f) {
    if (heist.riding) return
    const from = anchorTop(f)
    ride(from, hubTop, anchorStand(f), hub.hubPadAt, () => {
      endHeist(true)
    })
  }

  // --- Heist flow -------------------------------------------------------------------------------------
  function startHeist() {
    heist.active = true
    heist.visited = new Set([0])
    building.resetDoors()
    restock()
    state.stats.heists++
  }
  function restock() {
    for (const f of building.floors) for (const s of f.spots) building.setSpot(s, Math.random() < 0.82 ? roll(f.i) : null)
    for (const ts of TIMED_SPAWNS) if (state.pending[ts.rarity]) spawnTimed(ts)
  }
  function spawnTimed(ts) {
    state.pending[ts.rarity] = false
    const fi = ts.minFloor + Math.floor(Math.random() * (BUILDING.floors - ts.minFloor))
    const spot = pick(building.floors[fi].spots)
    building.setSpot(spot, pick(BY_RARITY[ts.rarity]).id)
    hud.toast(`A ${RARITY[ts.rarity].name} treasure appeared on Floor ${fi + 1}!`, ts.color === '#ffffff' ? '#e0e0ff' : ts.color)
  }
  function endHeist(escaped) {
    heist.active = false
    heist.anchorFloor = 0
    if (escaped) {
      const n = state.carried.length
      hud.banner(n ? 'Escaped!' : 'Back Home', n ? `${n} item${n > 1 ? 's' : ''} stolen - place them on your base` : 'Better luck next time', n ? '#6dff3a' : '#ffffff')
      if (n) sfx.buy()
    }
    save()
  }
  function bust() {
    if (heist.busted) return
    heist.busted = true
    setDriver(null)
    sfx.zipStop()
    trolley.visible = false
    heist.riding = null
    const lost = state.carried.length
    state.carried = []
    state.stats.busts++
    refreshCarry()
    hud.busted()
    sfx.busted()
    fx.flash('#ff2030', 0.6)
    fx.shake(1)
    setTimeout(() => {
      resetPlayer({ ...SPAWN }, Math.PI)
      syncYawToPlayer()
      heist.heat = 0
      heist.busted = false
      endHeist(false)
      if (lost) hud.toast(`Lost ${lost} item${lost > 1 ? 's' : ''}`, '#ff6a6a')
    }, 1400)
  }
  onRespawn(() => {
    if (heist.active && state.carried.length) {
      hud.toast('You dropped your loot!', '#ff6a6a')
      state.carried = []
      refreshCarry()
    }
    if (heist.active) endHeist(false)
    heist.riding = null
    trolley.visible = false
    sfx.zipStop()
  })

  // --- Interactions -------------------------------------------------------------------------------------
  let swingT = 0
  const register = (t) => interactions.register(t)
  register({ at: hub.hubPadAt, radius: 3.2, title: () => 'Zipline', titleColor: () => '#5fd0ff', action: () => 'Ride to Tower', enabled: () => !heist.riding, press: rideToTower })
  register({ at: hub.groundPadAt, radius: 3.0, title: () => 'Escape', titleColor: () => '#7dff5a', action: () => 'Zipline Back', enabled: () => !heist.riding && heist.anchorFloor === 0, press: () => rideHome(0) })
  for (const f of building.floors) {
    if (f.anchor) register({ at: f.anchor.stand, radius: 2.4, dy: 1.5, title: () => 'Escape', titleColor: () => '#7dff5a', action: () => 'Zipline Back', enabled: () => !heist.riding && f.exitDoor.broken, press: () => rideHome(f.i) })
    const g = f.exitDoor
    register({ at: g.at, radius: 2.6, dy: 1.6, labelAt: g.center, title: () => 'Glass Door', titleColor: () => '#bfeaff', action: () => 'Smash', enabled: () => !g.broken, press: () => {
      swingT = 0.35
      building.smashGlass(g)
      heist.heat += JAIL.glass
    } })
    if (f.hpDoor) {
      const d = f.hpDoor
      register({ at: d.at, radius: 2.6, dy: 1.6, labelAt: d.center, hold: true, interval: HIT_INTERVAL, title: () => `${FLOORS[f.i].name} Door - ${Math.ceil(d.hp)}/${d.max} HP`, titleColor: () => '#ff8ad8', action: () => `Break (${tool().name})`, enabled: () => !d.broken, press: () => {
        swingT = HIT_INTERVAL
        heist.heat += JAIL.hit
        if (building.hitDoor(d, tool().damage)) hud.toast(`${FLOORS[f.i].name} unlocked!`, '#ff8ad8')
      } })
    }
    for (const s of f.spots) {
      register({
        at: s.at,
        radius: 1.9,
        dy: 1.5,
        labelAt: s.at.clone().setY(s.at.y + 1.2),
        title: () => (s.item ? TREASURE[s.item].name : ''),
        titleColor: () => (s.item ? (RARITY[TREASURE[s.item].rarity].tier === 6 ? '#ffffff' : RARITY[TREASURE[s.item].rarity].color) : '#fff'),
        action: () => (state.carried.length >= state.carryCap ? 'Hands Full!' : 'Steal'),
        disabled: () => state.carried.length >= state.carryCap,
        enabled: () => !!s.item && !heist.riding,
        press: () => steal(s),
      })
    }
  }
  function steal(s) {
    if (state.carried.length >= state.carryCap) {
      hud.toast('Hands full! Buy more carry slots at Upgrades', '#ff6a6a')
      sfx.deny()
      return
    }
    const id = s.item
    const t = TREASURE[id]
    const r = RARITY[t.rarity]
    state.carried.push(id)
    building.setSpot(s, null)
    state.stats.stolen++
    if (!state.discovered.includes(id)) {
      state.discovered.push(id)
      hud.toast(`New treasure discovered: ${t.name}!`, r.tier === 6 ? '#ffffff' : r.color)
    }
    if (!state.stats.bestId || TREASURE[state.stats.bestId].value < t.value) state.stats.bestId = id
    heist.heat += JAIL.steal
    const p = s.at.clone().setY(s.at.y + 0.8)
    fx.burst(p, { count: 30 + r.tier * 12, color: [r.glow, '#ffffff'], speed: 5, up: 3, size: 0.5, life: 1 })
    fx.ring(s.at.clone().setY(s.at.y + 0.15), r.glow, 3, 0.5)
    fx.floatText(p, money(t.value), { color: '#6dff3a' })
    if (r.tier >= 4) {
      fx.flash(r.glow, 0.25)
      hud.banner(`${r.name}!`, t.name, r.tier === 6 ? '#ffffff' : r.color)
    }
    sfx.steal()
    refreshCarry()
  }

  // base slots
  base.slots.forEach((slot, i) => {
    register({
      at: slot.pedestal,
      radius: 2.2,
      dy: 1.8,
      labelAt: slot.pedestal.clone().setY(1.6),
      title: () => (i >= state.unlocked ? 'Locked Slot' : state.slots[i].id ? TREASURE[state.slots[i].id].name : 'Slot'),
      titleColor: () => (i >= state.unlocked ? '#9f9acb' : state.slots[i].id ? RARITY[TREASURE[state.slots[i].id].rarity].color : '#7dff5a'),
      action: () => (i >= state.unlocked ? 'Use Base Upgrade' : state.slots[i].id ? (state.carried.length ? 'Swap' : 'Pick Up') : 'Place'),
      disabled: () => i >= state.unlocked,
      enabled: () => i >= state.unlocked || !!state.slots[i].id || state.carried.length > 0,
      press: () => useSlot(i),
    })
  })
  function bestCarriedIndex() {
    let bi = 0
    state.carried.forEach((id, k) => {
      if (TREASURE[id].income > TREASURE[state.carried[bi]].income) bi = k
    })
    return bi
  }
  function placeInto(i, carriedIndex) {
    const id = state.carried.splice(carriedIndex, 1)[0]
    state.slots[i].id = id
    const s = base.slots[i]
    const r = RARITY[TREASURE[id].rarity]
    fx.ring(s.pedestal.clone().setY(0.75), r.glow, 3.5, 0.6)
    fx.burst(s.pedestal.clone().setY(1.2), { count: 36, color: [r.glow, '#ffffff', '#ffd21f'], speed: 5, up: 4, size: 0.45 })
    sfx.place()
  }
  function useSlot(i) {
    if (i >= state.unlocked) {
      hud.toast('Unlock more slots at the Base Upgrade board', '#ff6a6a')
      sfx.deny()
      return
    }
    const s = state.slots[i]
    if (!s.id) {
      if (!state.carried.length) return
      placeInto(i, bestCarriedIndex())
    } else if (state.carried.length) {
      const old = s.id
      collectSlot(i)
      placeInto(i, bestCarriedIndex())
      state.carried.push(old)
    } else {
      if (state.carried.length >= state.carryCap) return
      collectSlot(i)
      state.carried.push(s.id)
      s.id = null
      sfx.steal()
    }
    refreshCarry()
    refreshBase()
    save()
  }
  function placeBest() {
    if (!state.carried.length) return
    const order = state.carried.map((id, k) => k).sort((a, b) => TREASURE[state.carried[b]].income - TREASURE[state.carried[a]].income)
    let placedN = 0
    const ids = order.map((k) => state.carried[k])
    for (const id of ids) {
      const i = state.slots.findIndex((s, k) => k < state.unlocked && !s.id)
      if (i < 0) break
      placeInto(i, state.carried.indexOf(id))
      placedN++
    }
    if (!placedN) {
      hud.toast('No empty slots - upgrade your base or swap items', '#ff6a6a')
      sfx.deny()
    } else hud.toast(`Placed ${placedN} item${placedN > 1 ? 's' : ''}!`, '#6dff3a')
    refreshCarry()
    refreshBase()
    save()
  }
  function collectSlot(i) {
    const s = state.slots[i]
    if (s.stored < 1) return
    const amount = Math.floor(s.stored)
    s.stored -= amount
    const pad = base.slots[i].pad
    earn(amount, pad.clone().setY(1.4))
    fx.burst(pad.clone().setY(0.9), { count: 26, color: ['#6dff3a', '#c9ff9e', '#ffd21f'], speed: 4, up: 5, size: 0.45, life: 1 })
    fx.chunks(pad.clone().setY(1), { count: 6, color: ['#5bdc4a', '#3cae32'], size: [0.25, 0.4], flat: 0.05, speed: 2.5, up: 5, life: 1.4, floor: 0.6 })
    fx.ring(pad.clone().setY(0.62), '#6dff3a', 2.2, 0.45)
    sfx.cash()
    base.setStored(i, s.stored)
  }

  // base upgrade board + stalls
  register({ at: base.boardAt, radius: 2.6, title: () => 'Base Upgrade', titleColor: () => '#5fb0ff', action: () => (baseCost() == null ? 'Maxed' : `Buy ${money(baseCost())}`), disabled: () => baseCost() == null, press: buyBaseSlots })
  register({ at: hub.stalls.upgrades.at, radius: 2.8, title: () => 'Upgrades', titleColor: () => STALLS.upgrades.ring, action: () => 'Open', press: openUpgrades })
  register({ at: hub.stalls.tools.at, radius: 2.8, title: () => 'Tools', titleColor: () => STALLS.tools.ring, action: () => 'Open', press: openTools })
  register({ at: hub.stalls.sell.at, radius: 2.8, title: () => 'Sell', titleColor: () => '#8dff5a', action: () => 'Open', press: openSell })

  // --- Purchases ---------------------------------------------------------------------------------
  function buyBaseSlots() {
    const cost = baseCost()
    if (cost == null || !canAfford(cost)) return
    spend(cost)
    state.unlocked = Math.min(SLOT_COUNT, state.unlocked + UPGRADES.base.step)
    sfx.buy()
    hud.toast(`Base upgraded! ${state.unlocked} slots`, '#5fb0ff')
    fx.burst(base.boardAt.clone().setY(2), { count: 40, color: ['#5fb0ff', '#ffffff', '#ffd21f'], speed: 6, up: 4 })
    refreshBase()
    save()
  }
  function buyCarry() {
    const cost = carryCost()
    if (cost == null || !canAfford(cost)) return
    spend(cost)
    state.carryCap++
    sfx.buy()
    hud.toast(`You can now carry ${state.carryCap} items!`, '#5fd0ff')
    refreshCarry()
    save()
  }
  function buyStopPolice() {
    if (performance.now() < heist.stopUntil) return
    const cost = stopPrice()
    if (!canAfford(cost)) return
    spend(cost)
    heist.stopUntil = performance.now() + BOOSTS.stopPolice.seconds * 1000
    sfx.buy()
    hud.toast('The police are asleep for 60s!', '#7fd8ff')
    save()
  }
  function buyRandom() {
    const cost = randPrice()
    const freeSlot = state.slots.findIndex((s, k) => k < state.unlocked && !s.id)
    if (state.carried.length >= state.carryCap && freeSlot < 0) {
      hud.toast('No room: free a carry slot or a base slot first', '#ff6a6a')
      sfx.deny()
      return
    }
    if (!canAfford(cost)) return
    spend(cost)
    const id = roll(BOOSTS.randomTreasure.floor)
    const t = TREASURE[id]
    const r = RARITY[t.rarity]
    if (!state.discovered.includes(id)) state.discovered.push(id)
    if (state.carried.length < state.carryCap) {
      state.carried.push(id)
      refreshCarry()
    } else {
      state.slots[freeSlot].id = id
      refreshBase()
    }
    hud.banner(t.name, `${r.name} - ${money(t.income)}/s`, r.tier === 6 ? '#ffffff' : r.color)
    fx.burst(new Vector3(player.position.x, player.position.y + 2, player.position.z), { count: 50, color: [r.glow, '#ffffff', '#ffd21f'], speed: 6, up: 4 })
    sfx.buy()
    save()
  }

  // --- Panels --------------------------------------------------------------------------------------
  const div = (cls, text) => {
    const d = document.createElement('div')
    d.className = cls
    if (text) d.textContent = text
    return d
  }
  function frag(children) {
    const f = div('panel-list')
    f.style.display = 'contents'
    for (const c of children) if (c) f.appendChild(c)
    return f
  }
  function openUpgrades() {
    const cc = carryCost()
    const bc = baseCost()
    hud.openPanel({
      title: 'Upgrades',
      icon: 'upgrades',
      color: STALLS.upgrades.ring,
      onClosed: () => (interactions.blocked = false),
      body: frag([
        div('panel-note', `Cash: ${money(state.money)}`),
        hud.row({ name: 'Carry Slots', nameColor: '#5fd0ff', lines: [{ text: `Carry ${state.carryCap} item${state.carryCap > 1 ? 's' : ''} at once${cc == null ? '' : ` -> ${state.carryCap + 1}`}` }], button: { label: cc == null ? 'MAX' : money(cc), disabled: cc == null || state.money < cc, onClick: () => (buyCarry(), openUpgrades()) } }),
        hud.row({ name: 'Base Slots', nameColor: '#ffd21f', lines: [{ text: `${state.unlocked}/${SLOT_COUNT} display slots unlocked${bc == null ? '' : ` -> ${state.unlocked + UPGRADES.base.step}`}` }], button: { label: bc == null ? 'MAX' : money(bc), disabled: bc == null || state.money < bc, onClick: () => (buyBaseSlots(), openUpgrades()) } }),
        div('panel-note', 'Tip: better tools at the Tools stall break the floor doors faster.'),
      ]),
    })
    interactions.blocked = true
  }
  function openTools() {
    hud.openPanel({
      title: 'Tools',
      icon: 'tools',
      color: STALLS.tools.ring,
      onClosed: () => (interactions.blocked = false),
      body: frag([
        div('panel-note', `Cash: ${money(state.money)} - damage per hit on floor doors`),
        ...TOOLS.map((t, i) => {
          const owned = state.owned.includes(i)
          const equipped = state.tool === i
          return hud.row({
            name: t.name,
            nameColor: t.color,
            lines: [{ text: `${t.damage} damage per hit`, color: '#ffe14d' }],
            button: {
              label: equipped ? 'Equipped' : owned ? 'Equip' : money(t.cost),
              disabled: equipped || (!owned && state.money < t.cost),
              color: owned ? '#2f8cff' : '#3fcf2a',
              onClick: () => {
                if (!owned) {
                  if (!canAfford(t.cost)) return
                  spend(t.cost)
                  state.owned.push(i)
                  sfx.buy()
                  hud.toast(`Bought ${t.name}!`, t.color)
                }
                state.tool = i
                save()
                openTools()
              },
            },
          })
        }),
      ]),
    })
    interactions.blocked = true
  }
  function openSell() {
    const rows = []
    rows.push(div('panel-note', `Cash: ${money(state.money)}`))
    rows.push(div('panel-section', 'Carried loot'))
    if (!state.carried.length) rows.push(div('panel-note', 'Nothing in your hands.'))
    state.carried.forEach((id, k) => {
      const t = TREASURE[id]
      rows.push(hud.row({ thumb: thumb(id), name: t.name, nameColor: RARITY[t.rarity].tier === 6 ? '#ffffff' : RARITY[t.rarity].color, lines: [{ text: RARITY[t.rarity].name, color: '#cfc8ff' }], button: { label: `Sell ${money(t.value * mult())}`, onClick: () => sellCarried(k) } }))
    })
    if (state.carried.length > 1) {
      const all = state.carried.reduce((a, id) => a + TREASURE[id].value, 0) * mult()
      rows.push(hud.row({ name: 'Sell all carried', nameColor: '#8dff5a', button: { label: money(all), onClick: () => sellCarried(-1) } }))
    }
    rows.push(div('panel-section', 'On your base'))
    const onBase = state.slots.map((s, i) => [s, i]).filter(([s, i]) => s.id && i < state.unlocked)
    if (!onBase.length) rows.push(div('panel-note', 'Your base is empty.'))
    for (const [s, i] of onBase) {
      const t = TREASURE[s.id]
      rows.push(hud.row({ thumb: thumb(s.id), name: t.name, nameColor: RARITY[t.rarity].tier === 6 ? '#ffffff' : RARITY[t.rarity].color, lines: [{ text: `${money(t.income * mult())}/s - +${t.luck}% luck`, color: '#c9ff9e' }], button: { label: `Sell ${money(t.value * mult())}`, color: '#ff8a1f', onClick: () => sellSlot(i) } }))
    }
    hud.openPanel({ title: 'Sell', icon: 'sell', color: '#3fd92a', onClosed: () => (interactions.blocked = false), body: frag(rows) })
    interactions.blocked = true
  }
  function sellCarried(k) {
    const ids = k < 0 ? state.carried.splice(0) : state.carried.splice(k, 1)
    const total = ids.reduce((a, id) => a + TREASURE[id].value, 0) * mult()
    earn(total, new Vector3(player.position.x, player.position.y + 2.4, player.position.z))
    sfx.cash()
    refreshCarry()
    save()
    openSell()
  }
  function sellSlot(i) {
    collectSlot(i)
    const id = state.slots[i].id
    state.slots[i].id = null
    earn(TREASURE[id].value * mult(), new Vector3(player.position.x, player.position.y + 2.4, player.position.z))
    sfx.cash()
    refreshBase()
    save()
    openSell()
  }
  function openIndex() {
    const grid = div('index-grid')
    for (const t of TREASURES) {
      const r = RARITY[t.rarity]
      const known = state.discovered.includes(t.id)
      const card = div(`index-card${known ? '' : ' locked'}`)
      card.style.setProperty('--rc', r.tier === 6 ? '#ffffff' : r.color)
      const img = document.createElement('img')
      img.src = thumb(t.id)
      card.append(img, div('n', known ? t.name : '???'), div('r', r.name), div('s', known ? `${money(t.income)}/s` : ''))
      grid.appendChild(card)
    }
    hud.openPanel({ title: `Index ${state.discovered.length}/${TREASURES.length}`, icon: 'index', color: '#2f8cff', onClosed: () => (interactions.blocked = false), body: frag([div('panel-note', 'Every treasure you steal is recorded here.'), grid]) })
    interactions.blocked = true
  }
  function openGuide() {
    const steps = [
      ['1. Zipline over', 'Stand on the blue pad by the tower on the dock and press E (or tap the prompt).'],
      ['2. Break in', 'Smash the glass entrance. Each treasure shows its rarity and worth - press E to steal it.'],
      ['3. Climb higher', 'Take the stairs up and break the floor door. Higher floors (x2 ... x5 luck) hold rarer loot, but their doors are tougher: buy tools at the Tools stall.'],
      ['4. Escape', 'Smash the glass exit on your floor and zipline home from the balcony. Watch the Jail Chance - at 100% you get busted and lose your loot.'],
      ['5. Get rich', 'Place loot on your base slots. Each one earns cash per second (walk over the green pad to collect) and adds Luck to every future roll.'],
    ]
    hud.openPanel({ title: 'How to Heist', icon: 'guide', color: '#ff9a1f', onClosed: () => (interactions.blocked = false), body: frag(steps.map(([a, b]) => hud.row({ name: a, nameColor: '#ffe14d', lines: [{ text: b }] }))) })
    interactions.blocked = true
  }

  // --- Rebirth ---------------------------------------------------------------------------------------
  let panelTick = null // live refresh for the open panel (the rebirth progress bar)
  function openRebirth() {
    const view = hud.rebirthView()
    const paint = () => {
      const cost = rebirthCost(state.rebirths)
      view.set({ from: mult(), to: cashMult(state.rebirths + 1), money: state.money, cost, rebirths: state.rebirths })
    }
    view.onRebirth = doRebirth
    paint()
    panelTick = paint
    hud.openPanel({
      title: 'Rebirth',
      icon: 'rebirth',
      color: '#ff2f6d',
      onClosed: () => {
        interactions.blocked = false
        panelTick = null
      },
      body: view.el,
    })
    interactions.blocked = true
  }
  function doRebirth() {
    const cost = rebirthCost(state.rebirths)
    if (state.money < cost) {
      hud.toast(`Need ${money(cost - state.money)} more to rebirth!`, '#ff6a6a')
      sfx.deny()
      return
    }
    state.money = 0
    state.rebirths++
    hud.setMoney(0)
    hud.closePanel()
    refreshBase()
    const p = new Vector3(player.position.x, player.position.y + 1.5, player.position.z)
    fx.flash('#ffffff', 0.7)
    fx.shake(0.6)
    fx.ring(new Vector3(p.x, player.position.y + 0.1, p.z), '#ff2f6d', 7, 0.9)
    fx.ring(new Vector3(p.x, player.position.y + 0.1, p.z), '#6dff3a', 5, 0.7)
    fx.burst(p, { count: 120, color: ['#ff2f6d', '#ffffff', '#6dff3a', '#ffd21f'], speed: 10, up: 6, size: 0.6, life: 1.4 })
    fx.chunks(p, { count: 24, color: ['#5bdc4a', '#3cae32', '#ffd21f'], size: [0.25, 0.45], flat: 0.05, speed: 6, up: 7, life: 2, floor: player.position.y })
    hud.banner('REBIRTH!', `Cash x${fmt(mult(), 1)} forever`, '#ff4f8a')
    sfx.buy()
    sfx.floor()
    save()
  }

  // --- Daily Gifts -------------------------------------------------------------------------------------
  const DAY_MS = DAILY.dayHours * 3600000
  const rewardWorth = (r) => r.cash ?? TREASURE[r.item].value
  function dailyTick() {
    const d = state.daily
    const now = Date.now()
    if (d.claimed.every(Boolean)) {
      // a finished week starts over on the next play day
      if (now >= d.nextAt) {
        d.day = 1
        d.claimed = Array(7).fill(false)
        d.nextAt = now + DAY_MS
        hud.toast('A new week of Daily Gifts is ready!', '#ffd21f')
      }
    } else if (now >= d.nextAt && d.day < 7) {
      d.day++
      d.nextAt = now + DAY_MS
      hud.toast(`Daily Gift day ${d.day} unlocked!`, '#ffd21f')
    }
    hud.setGiftReady(d.claimed.some((c, i) => !c && i < d.day))
  }
  const freeRoom = () => state.carryCap - state.carried.length + state.slots.filter((sl, k) => k < state.unlocked && !sl.id).length
  function giveItem(id) {
    if (!state.discovered.includes(id)) state.discovered.push(id)
    if (state.carried.length < state.carryCap) state.carried.push(id)
    else state.slots[state.slots.findIndex((sl, k) => k < state.unlocked && !sl.id)].id = id
  }
  function grant(i) {
    const r = DAILY.rewards[i]
    if (r.cash) earn(r.cash, new Vector3(player.position.x, player.position.y + 2.4, player.position.z))
    else giveItem(r.item)
    state.daily.claimed[i] = true
  }
  function celebrate(color) {
    const p = new Vector3(player.position.x, player.position.y + 1.6, player.position.z)
    fx.burst(p, { count: 70, color: [color, '#ffffff', '#ffd21f'], speed: 7, up: 5, size: 0.5 })
    fx.ring(new Vector3(p.x, player.position.y + 0.1, p.z), color, 5, 0.7)
    sfx.buy()
  }
  let dailyView = null
  function paintDaily() {
    const d = state.daily
    const cells = DAILY.rewards.map((r, i) => {
      const t = r.item ? TREASURE[r.item] : null
      const rr = t ? RARITY[t.rarity] : null
      return {
        day: i + 1,
        title: t ? t.name : money(r.cash),
        titleColor: t ? (rr.tier === 6 ? '#ffffff' : rr.color) : '#7dff5a',
        thumb: t ? thumb(t.id) : null,
        state: d.claimed[i] ? 'claimed' : i < d.day ? 'claim' : 'locked',
      }
    })
    const left = DAILY.rewards.filter((r, i) => !d.claimed[i])
    dailyView.set(cells, left.length ? Math.round(left.reduce((a, r) => a + rewardWorth(r), 0) * DAILY.allMarkup) : null)
  }
  function dailyFoot() {
    const d = state.daily
    if (d.claimed.every(Boolean) || d.day < 7) {
      const s = Math.max(0, Math.ceil((d.nextAt - Date.now()) / 1000))
      const hh = String(Math.floor(s / 3600)).padStart(2, '0')
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      hud.setFoot(`Next play day in: ${hh}:${mm}:${ss}`)
    } else hud.setFoot('All 7 days unlocked!')
  }
  function openDaily() {
    dailyView = hud.dailyView()
    dailyView.onClaim = (i) => {
      const r = DAILY.rewards[i]
      if (r.item && freeRoom() < 1) {
        hud.toast('No room! Free a carry slot or a base slot first', '#ff6a6a')
        sfx.deny()
        return
      }
      grant(i)
      celebrate(r.item ? RARITY[TREASURE[r.item].rarity].glow : '#6dff3a')
      hud.toast(`Claimed Day ${i + 1}: ${r.item ? TREASURE[r.item].name : money(r.cash)}!`, '#ffd21f')
      afterClaim()
    }
    dailyView.onClaimAll = () => {
      const d = state.daily
      const left = DAILY.rewards.map((r, i) => [r, i]).filter(([, i]) => !d.claimed[i])
      if (!left.length) return
      const items = left.filter(([r]) => r.item).length
      if (freeRoom() < items) {
        hud.toast(`Need room for ${items} items: free carry or base slots first`, '#ff6a6a')
        sfx.deny()
        return
      }
      const price = Math.round(left.reduce((a, [r]) => a + rewardWorth(r), 0) * DAILY.allMarkup)
      if (!canAfford(price)) return
      spend(price)
      for (const [, i] of left) grant(i)
      d.day = 7
      celebrate('#ffd21f')
      hud.banner('Claimed All!', 'Every Daily Gift is yours', '#ffd21f')
      afterClaim()
    }
    paintDaily()
    dailyFoot()
    panelTick = dailyFoot
    hud.openPanel({
      title: 'Daily Gifts!',
      icon: 'gift',
      color: '#ff2f6d',
      wide: true,
      onClosed: () => {
        interactions.blocked = false
        panelTick = null
      },
      body: dailyView.el,
    })
    interactions.blocked = true
  }
  function afterClaim() {
    refreshCarry()
    refreshBase()
    dailyTick()
    paintDaily()
    save()
  }

  // --- Carried loot floats over the player's head -----------------------------------------------------
  const held = new Group()
  scene.add(held)
  let heldId = null
  function refreshHeld() {
    const id = state.carried.length ? state.carried[bestCarriedIndex()] : null
    if (id === heldId) return
    heldId = id
    held.clear()
    if (id) held.add(makeTreasure(id, 0.7))
  }

  // --- Boards ----------------------------------------------------------------------------------------
  let boardT = 0
  const mmss = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }
  function redrawBoards() {
    const now = Date.now()
    hub.timerSign.setDraw((ctx, w, h) => drawTimerBoard(ctx, w, h, TIMED_SPAWNS.map((ts) => ({ label: ts.label, time: state.pending[ts.rarity] ? 'READY' : mmss(state.spawns[ts.rarity] - now) }))))
    const best = state.stats.bestId ? TREASURE[state.stats.bestId] : null
    hub.statsSign.setDraw((ctx, w, h) =>
      drawStatsBoard(ctx, w, h, [
        ['Cash earned', money(state.stats.earned)],
        ['Items stolen', fmt(state.stats.stolen)],
        ['Best steal', best ? best.name : '-', best ? (RARITY[best.rarity].tier === 6 ? '#ffffff' : RARITY[best.rarity].color) : '#ffffff'],
        ['Highest floor', `${state.stats.maxFloor}`],
        ['Heists / Busts', `${state.stats.heists} / ${state.stats.busts}`],
      ]),
    )
  }

  // --- Init --------------------------------------------------------------------------------------------
  hud.setMoney(state.money)
  refreshCarry()
  refreshBase()
  redrawBoards()
  // the tower starts stocked so it is never empty to look at
  restock()
  building.resetDoors()
  if (state.awaySeconds > 60 && totalIncome() > 0) setTimeout(() => hud.toast(`Your base earned ${money(totalIncome() * mult() * state.awaySeconds)} while you were away!`, '#6dff3a'), 1500)
  else setTimeout(() => hud.banner('Risky Heist', 'Zipline to the tower and steal everything!', '#ffe14d'), 900)

  // --- Per-frame ---------------------------------------------------------------------------------------
  let labelT = 0
  let panelT = 0
  let dailyT = 0
  const pos = new Vector3()
  let lastRoom = -1
  return {
    hud,
    fx,
    get panelOpen() {
      return hud.panelOpen
    },
    setDensity: (k) => fx.setDensity(k),
    // dev console handle (main.js exposes it as __game.game in dev builds only)
    debug: { state, heist, building, base, rideToTower, rideHome, steal, bust, save, openRebirth, openDaily },
    update(dt, t) {
      pos.set(player.renderPosition.x, player.renderPosition.y, player.renderPosition.z)
      const nowMs = Date.now()

      // income into collectors
      const m = mult()
      for (let i = 0; i < state.unlocked; i++) {
        const s = state.slots[i]
        if (s.id) s.stored += TREASURE[s.id].income * m * dt
      }
      labelT -= dt
      if (labelT <= 0) {
        labelT = 0.25
        for (let i = 0; i < state.unlocked; i++) base.setStored(i, state.slots[i].stored)
      }
      // walk over a pad to collect
      if (!isDriven())
        for (let i = 0; i < state.unlocked; i++) {
          const s = state.slots[i]
          if (s.stored < 1) continue
          const pad = base.slots[i].pad
          if (Math.abs(pos.x - pad.x) < BASE.collectRadius && Math.abs(pos.z - pad.z) < BASE.collectRadius + 0.4 && pos.y < 2) collectSlot(i)
        }
      // collector shimmer
      for (let i = 0; i < state.unlocked; i++) if (state.slots[i].stored >= 1) fx.trickle(base.slots[i].pad, 2.5, dt, { color: ['#6dff3a', '#c9ff9e'], speed: 0.4, up: 1.6, spread: 0.7, size: 0.3, life: 1, gravity: 0 })

      // timed spawns
      for (const ts of TIMED_SPAWNS) {
        if (nowMs >= state.spawns[ts.rarity]) {
          state.spawns[ts.rarity] = nowMs + ts.seconds * 1000
          if (heist.active) {
            state.pending[ts.rarity] = true
            spawnTimed(ts)
          } else {
            state.pending[ts.rarity] = true
            hud.toast(`A ${RARITY[ts.rarity].name} treasure will be in the tower on your next heist!`, ts.color === '#ffffff' ? '#e0e0ff' : ts.color)
          }
        }
      }
      boardT -= dt
      if (boardT <= 0) {
        boardT = 1
        redrawBoards()
      }

      // police heat
      const frozen = Math.max(0, (heist.stopUntil - performance.now()) / 1000)
      const zone = inHeistZone()
      const fi = building.insideFloor(pos)
      if (zone && !heist.busted && !heist.riding) {
        if (frozen <= 0) heist.heat += (JAIL.risePerSecond + Math.max(0, fi) * JAIL.risePerFloor) * dt
      } else heist.heat -= JAIL.decayPerSecond * dt
      heist.heat = Math.max(0, heist.heat)
      if (heist.heat >= 100 && zone && !heist.riding) {
        heist.heat = 100
        bust()
      }
      hud.setJail(Math.min(100, heist.heat), frozen)
      hud.setSiren(zone && heist.heat >= JAIL.sirenAt && frozen <= 0)
      hud.setBoosts(stopPrice(), randPrice(), frozen)

      // floor tracking -> zipline anchor, banners
      const room = building.roomAt(pos)
      if (room >= 0) {
        if (room !== lastRoom && zone && !heist.visited.has(room)) {
          heist.visited.add(room)
          const F = FLOORS[room]
          hud.banner(`Floor ${room + 1}: ${F.name}`, `x${F.luckSign} Luck`, '#ffe14d')
          sfx.floor()
          if (room + 1 > state.stats.maxFloor) state.stats.maxFloor = room + 1
        }
        lastRoom = room
        if (zone) heist.anchorFloor = room
      } else if (fi < 0 && pos.y < 3) heist.anchorFloor = 0
      const tf = building.insideFloor(pos, false)
      hud.setFloorTag(zone && tf >= 0 ? `Floor ${tf + 1} - ${FLOORS[tf].name} - x${FLOORS[tf].luckSign} Luck` : '')
      if (!heist.riding) {
        cableTarget.copy(anchorTop(heist.anchorFloor))
        cableEnd.lerp(cableTarget, 1 - Math.exp(-6 * dt))
        if (cableEnd.distanceTo(cableTarget) < 0.01) cableEnd.copy(cableTarget)
      }
      rebuildCable()

      // HUD buttons
      hud.setButtons({ inHeist: zone || !!heist.riding, nearBase: base.contains(pos), carrying: state.carried.length > 0 })

      // held loot over the head
      held.visible = !!heldId && camera.position.distanceTo(pos) > 4.2
      if (heldId) {
        held.position.set(pos.x, pos.y + 2.55 + Math.sin(t * 3) * 0.08, pos.z)
        held.rotation.y += dt * 1.5
      }

      dailyT -= dt
      if (dailyT <= 0) {
        dailyT = 1
        dailyTick()
      }
      if (panelTick) {
        panelT -= dt
        if (panelT <= 0) {
          panelT = 0.2
          panelTick()
        }
      }
      swingT = Math.max(0, swingT - dt)
      hub.update(dt, t)
      building.update(dt, t, pos)
      base.update(dt, t)
      interactions.update(dt, pos)
      fx.update(dt)

      saveT += dt
      if (saveT > 6) {
        saveT = 0
        save()
      }
    },
    // After the animator: arm overrides (zipline hang, hitting swings).
    animate(animator) {
      if (!animator?.rig) return
      const ride = !!heist.riding
      const swing = swingT > 0 ? Math.sin((1 - swingT / HIT_INTERVAL) * Math.PI) : 0
      if (!ride && swing <= 0 && !heldId) return
      for (const b of animator.rig.bindings) {
        let x = 0
        let z = 0
        if (b.index === BONE_INDEX.ArmR1 * 3) {
          if (ride) {
            x = -2.9
            z = 0.25
          } else if (swing > 0) x = -2.4 * swing - 0.3
          else if (heldId) x = -2.8
        } else if (b.index === BONE_INDEX.ArmL1 * 3) {
          if (ride) {
            x = -2.9
            z = -0.25
          } else if (heldId && swing <= 0) x = -2.8
        } else if ((b.index === BONE_INDEX.LegL1 * 3 || b.index === BONE_INDEX.LegR1 * 3) && ride) x = -0.35
        if (x === 0 && z === 0) continue
        qa.setFromAxisAngle(b.axisX, x)
        if (z) qa.premultiply(qb.setFromAxisAngle(b.axisZ, z))
        b.bone.quaternion.premultiply(qa)
      }
    },
  }
}

const qa = new Quaternion()
const qb = new Quaternion()
