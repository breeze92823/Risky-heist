// Colyseus link to Risky-heist-backend (room "world"): loads the signed-in player's progress from
// the server, mirrors every save to it, shows who owns which hub base, and tells the Bloxity portal
// which room the player is in. Never throws and never blocks play: with no server (or an unreachable
// one) the game simply runs offline with nothing saved (progress is never stored in the browser).
//
// A room holds 6 players and every player owns one of the hub's 6 plots (see readRoster below).
//
// Identity: the client never tells the server who it is. It sends its Bloxity token
// (`Legion.SDK.auth.getToken()`); the server verifies it with Bloxity and uses only the account id
// Bloxity returns. No token (or a refused one) = a guest, who is never saved.
//
// Contract (backend CLAUDE.md): after joining, the server answers `progress` (the saved doc),
// `noProgress` (new account, guest or no database) or `serverError` (the save exists but could not be
// read: saving stays off so it is never overwritten). Saves (`saveProgress`, the whole snapshot) are
// ignored by the server until that answer.
import { Client } from '@colyseus/sdk'
import { NET, SERVER_URL } from './config.js'
import {
  authState, canResolveServer, displayName, getEquippedAvatar, getPfp, getProportions, getToken, launchRoomId, locateRoom,
  playerInRoom, playerJoined, resolveServerEndpoint, subscribeAuth, updateRoom,
} from './bloxity.js'

const AVATAR_MAX = 3000 // backend AVATAR_MAX_LEN

export const net = {
  room: null,
  connected: false,
  hydrated: false, // the server answered for the current identity: saving is allowed
  // The live roster (server WorldState.players, sessionId -> PlayerState) and this player's own id:
  // remotePlayers.js draws everyone else from it every frame.
  get players() {
    return this.connected ? this.room?.state?.players ?? null : null
  },
  get sessionId() {
    return this.room?.sessionId ?? null
  },
}

// --- What the others draw: pose, look, emote ---------------------------------------
let lastPose = ''
let lastPoseAt = 0
// ~NET.poseHz times a second, and only when something changed. `speed` = horizontal m/s; `body` =
// { carry, riding, swing } (game.bodyState(): the loot overhead, the zipline ride, the door swing).
export function sendPose(player, speed, body) {
  if (!net.connected) return
  const now = performance.now()
  if (now - lastPoseAt < 1000 / NET.poseHz) return
  lastPoseAt = now
  const r = (n) => Math.round(n * 100) / 100
  const msg = { x: r(player.position.x), y: r(player.position.y), z: r(player.position.z), yaw: r(player.facing), speed: r(speed), grounded: player.grounded, ...body }
  const key = JSON.stringify(msg)
  if (key === lastPose) return
  lastPose = key
  send('pose', msg)
}

// The Bloxity look as the others rebuild it: the equipped item ids and body proportions as the SDK
// gives them (ids only, never URLs: each client builds the asset URLs itself). '' = the default look.
function avatarJson() {
  if (!authState.user) return ''
  const equipped = getEquippedAvatar()
  if (!equipped) return ''
  try {
    const json = JSON.stringify({ equipped, proportions: getProportions() })
    return json.length <= AVATAR_MAX ? json : ''
  } catch {
    return ''
  }
}
let sentAvatar = null
export function syncAvatar() {
  if (!net.connected) return
  const avatar = avatarJson()
  if (avatar === sentAvatar) return
  sentAvatar = avatar
  send('setAvatar', { avatar })
}

// The portal emote this player plays ('' = stopped).
export function sendEmote(id) {
  if (net.connected) send('emote', { id })
}

// --- Identity ----------------------------------------------------------------
// `key` only tells this page whether the player changed (a guest, or a Bloxity account); the server
// is sent the token, never the key.
function identity() {
  const u = authState.user
  const token = u ? getToken() : ''
  const id = u && (u._id || u.id || u.userId || u.uid)
  const name = displayName() === 'Offline' ? 'Guest' : displayName() // no SDK (dev): shown on the base sign
  return { key: token && id ? String(id) : 'guest', token, username: name, pfp: getPfp() }
}
const isGuest = () => sentKey === 'guest'

// --- Saving ------------------------------------------------------------------
let game = null
let sentKey = '' // the player the server currently attributes saves to
let hydratedFor = '' // player whose server save this page already loaded
let lastKey = '' // what the server holds (minus the clock): unchanged saves are not re-sent
let lastSentAt = 0
let timer = 0

const keyOf = (snap) => JSON.stringify({ ...snap, lastSeen: 0 })

function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}

function sendNow() {
  clearTimeout(timer)
  timer = 0
  if (!game || !net.connected || !net.hydrated || isGuest()) return
  const snap = game.snapshot()
  const key = keyOf(snap)
  if (key === lastKey) return
  lastKey = key
  lastSentAt = performance.now()
  send('saveProgress', snap)
}

// game.js calls this on every local save (about every 6 s, and on each purchase / sale / heist end):
// at most one server write per NET.saveEvery seconds, and at once when the tab is closing or hiding.
function onSave(flush) {
  if (!net.connected || !net.hydrated || isGuest()) return
  if (flush) return sendNow()
  const wait = lastSentAt + NET.saveEvery * 1000 - performance.now()
  if (wait <= 0) sendNow()
  else if (!timer) timer = setTimeout(sendNow, wait)
}

// --- Roster: who owns which hub plot ------------------------------------------
// The server gives every player in the room one of the hub's plots (`base`, 0..5, unique) and relays
// what each base shows (`baseUnlocked`, `baseItems`). Read twice a second: the game puts each owner's
// name and loot on their plot, and this player's own plot is whichever the server assigned.
let lastBaseKey = ''
let known = null // sessionId -> name of the players seen in this room (null until the first read)
function readRoster() {
  const players = net.room?.state?.players
  if (!players) return []
  const out = []
  players.forEach((p, id) => out.push({ id, mine: id === net.room.sessionId, base: p.base, name: p.username, unlocked: p.baseUnlocked, items: p.baseItems ? p.baseItems.split(',') : [] }))
  return out
}
// The portal toasts joins to the players' friends: someone already here when we arrived is "in the
// room" (playerInRoom), someone who comes later "joined" (playerJoined).
function announce(roster) {
  const first = known === null
  known ??= new Map()
  const here = new Set()
  for (const p of roster) {
    if (p.mine || !p.name) continue
    here.add(p.id)
    if (known.has(p.id)) continue
    known.set(p.id, p.name)
    if (first) playerInRoom(p.name)
    else playerJoined(p.name)
  }
  for (const id of known.keys()) if (!here.has(id)) known.delete(id)
}
function syncBases() {
  if (!game) return
  const roster = net.connected ? readRoster() : []
  game.setRoster(roster)
  if (net.connected && net.room?.state?.players) announce(roster)
  if (!net.connected || !net.hydrated) return
  const view = game.baseView()
  const key = JSON.stringify(view)
  if (key === lastBaseKey) return
  lastBaseKey = key
  send('setBase', view)
}

// --- Rewarded ads ----------------------------------------------------------------
// The ad's reward token is checked by the server with Bloxity (single use, this game, 5 minutes);
// the reward is granted only when it says yes. Resolves false when offline or on no answer.
const adWaiters = new Map() // placement -> resolve
export function verifyAdReward(token, placement) {
  return new Promise((resolve) => {
    if (!net.connected || !token) return resolve(false)
    adWaiters.get(placement)?.(false)
    adWaiters.set(placement, resolve)
    send('adReward', { token, placement })
    setTimeout(() => {
      if (adWaiters.get(placement) !== resolve) return
      adWaiters.delete(placement)
      resolve(false)
    }, 10000)
  })
}

// --- Connection --------------------------------------------------------------
function attach(room, relayRoomId = '') {
  net.room = room
  net.connected = true
  net.hydrated = false
  lastBaseKey = ''
  lastPose = ''
  sentAvatar = null
  known = null
  // The portal's friend invites land in this room: "<relay>~<room>" for a pod behind the matchmaker.
  updateRoom(relayRoomId ? `${relayRoomId}~${room.roomId}` : room.roomId)

  room.onMessage('progress', (doc) => {
    // A reconnect within the same page keeps the local state: it is newer than the server's copy.
    if (hydratedFor !== sentKey) {
      game.hydrate(doc ?? {})
      hydratedFor = sentKey
      lastKey = keyOf(game.snapshot()) // what the server holds: don't echo it straight back
    } else lastKey = '' // reconnect: push the local state
    net.hydrated = true
    sendNow()
  })
  room.onMessage('noProgress', () => {
    // New account, guest or no database: keep what we have; a real account's first save is the local one.
    hydratedFor = sentKey
    lastKey = ''
    net.hydrated = true
    sendNow()
  })
  room.onMessage('serverError', () => {
    // The save exists but could not be read: never overwrite it.
    net.hydrated = false
    game?.toast("Couldn't load your saved progress - saving is paused", '#ff6a6a')
    console.warn('[net] server could not read the saved progress; saving is off for this session')
  })
  room.onMessage('adRewardResult', (m) => {
    const resolve = adWaiters.get(m?.placement)
    adWaiters.delete(m?.placement)
    resolve?.(m?.ok === true)
  })
  // Not drawn yet, but the server sends them: registering stops the SDK warning about each one.
  room.onMessage('leaderboard', () => {})
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    clearTimeout(timer)
    timer = 0
    updateRoom('') // not joinable any more
    sentAvatar = null
    attempt = 0
    setTimeout(connect, 1000) // the room closed under us: resolve and rejoin; local play goes on meanwhile
  })
  syncIdentity()
  syncAvatar()
}

// Bloxity hosting has no fixed socket URL: the SDK resolves the endpoint of this game's server (a
// dev-channel page reaches the dev backend, prod the prod one) on every connect, and each resolve
// needs its own Client. A configured SERVER_URL (config.js; `npm run dev` -> the local server) wins.
async function serverUrl(id) {
  if (SERVER_URL) return { endpoint: SERVER_URL, relayRoomId: '' }
  return resolveServerEndpoint(id.key === 'guest' ? '' : id.key)
}

// A page opened from the portal's Open Rooms list or a friend's invite (?roomId=) joins that room
// directly; if it is gone or full the player is matchmade as usual.
let launchTried = false
async function joinLaunchRoom(id) {
  if (launchTried) return null
  launchTried = true
  const wanted = launchRoomId()
  if (!wanted) return null
  try {
    const where = await locateRoom(wanted)
    if (!where) return null
    const room = await new Client(where.endpoint).joinById(where.roomId, id)
    return { room, relayRoomId: where.relayRoomId }
  } catch (err) {
    console.warn('[net] could not join the launch room; matchmaking instead', err?.message ?? err)
    return null
  }
}

// Failed connects back off (1, 2, 4, 8, then every 15 s) and give up after about a minute (a cold
// server can take ~45 s to wake); the game then waits a while and starts over. Play is never blocked.
let connecting = false
let attempt = 0
let attemptsSince = 0
async function connect() {
  if (connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentKey = id.key
    const options = { token: id.token, username: id.username, pfp: id.pfp }
    const launched = await joinLaunchRoom(options)
    if (launched) attach(launched.room, launched.relayRoomId)
    else {
      const { endpoint, relayRoomId } = await serverUrl(id)
      attach(await new Client(endpoint).joinOrCreate('world', options), relayRoomId)
    }
    attempt = 0
    attemptsSince = 0
  } catch (err) {
    console.warn('[net] could not reach the server; playing offline', err?.message ?? err)
    if (!attempt) attemptsSince = performance.now()
    const delay = Math.min(NET.retryMax, 2 ** attempt)
    attempt++
    const giveUp = performance.now() - attemptsSince + delay * 1000 > NET.giveUpAfter * 1000
    if (giveUp) attempt = 0
    setTimeout(connect, giveUp ? NET.retryPause * 1000 : delay * 1000)
  } finally {
    connecting = false
  }
}

// Sign-in / sign-out after joining: tell the server who this is now (its new token, "" after signing
// out); it verifies it with Bloxity and answers with that account's progress (or noProgress), which
// `attach` handles like the first answer.
function syncIdentity() {
  if (!net.connected) return
  const id = identity()
  if (id.key === sentKey) return void send('identify', { username: id.username, pfp: id.pfp })
  sendNow() // under the old identity, before switching
  net.hydrated = false
  sentKey = id.key
  send('identify', { token: id.token, username: id.username, pfp: id.pfp })
}

// `g` is the game's save API (heist/game.js): snapshot(), hydrate(doc), toast(), onSave(fn), setRoster, baseView.
export function initNet(g) {
  if (!SERVER_URL && !canResolveServer()) return void console.info('[net] no server configured; playing offline')
  game = g
  game.onSave(onSave)
  setInterval(syncBases, 500)
  // The first ready call connects; later ones are sign-in / sign-out.
  subscribeAuth((s) => {
    if (!s.ready) return
    if (net.connected) syncIdentity()
    else connect()
  })
}
