// The Bloxity (Legion) SDK facade. Every SDK call goes through here. Nothing
// here may throw when the SDK is missing: a blocked sdk.bloxity.io leaves the
// game fully playable on the default avatar and keyboard controls.
// Docs: https://docs.bloxity.io/#html5
import { GAME_SLUG, GAME_TITLE, SETTINGS, DEV_MODE, coerceSetting, LEADERBOARDS, AD_SCREENS } from './config.js'

export function sdk() {
  if (DEV_MODE) return null
  return (typeof window !== 'undefined' && window.Legion && window.Legion.SDK) || null
}

// --- State --------------------------------------------------------------
export const settings = {}
for (const key of Object.keys(SETTINGS)) settings[key] = coerceSetting(key, SETTINGS[key].def)

// `user` is only written from onUserChanged (re-reading getUser()). `ready`
// flips once auth has settled so the signed-in avatar load isn't pre-empted.
export const authState = { ready: false, user: null, guest: null }

let latestEquipped = null
let latestProportions = null
const avatarListeners = new Set()
const proportionListeners = new Set()
const authListeners = new Set()
const settingListeners = new Set()
const respawnListeners = new Set()
const emoteListeners = new Set()
const chatListeners = new Set()
const unsubscribers = []

function emit(listeners, ...args) {
  for (const fn of listeners) {
    try {
      fn(...args)
    } catch (err) {
      console.warn('[bloxity] listener threw', err)
    }
  }
}

// Fires on any customizer change (may fire twice: optimistic, then confirmed;
// keep handlers idempotent). Each returns an unsubscribe.
export function onAvatarChanged(fn) {
  avatarListeners.add(fn)
  return () => avatarListeners.delete(fn)
}
export function onProportionsChanged(fn) {
  proportionListeners.add(fn)
  return () => proportionListeners.delete(fn)
}
export function subscribeAuth(fn) {
  authListeners.add(fn)
  fn(authState)
  return () => authListeners.delete(fn)
}
// fn(key, value) on every change of a SETTINGS key (already coerced).
export function onSetting(fn) {
  settingListeners.add(fn)
  return () => settingListeners.delete(fn)
}
// The portal's own pause-menu "Respawn" button.
export function onRespawnRequest(fn) {
  respawnListeners.add(fn)
  return () => respawnListeners.delete(fn)
}

// The player picked an emote in the portal's emote wheel (fn(id)), or took it off (fn('')).
export function onEmote(fn) {
  emoteListeners.add(fn)
  return () => emoteListeners.delete(fn)
}
// A chat message anyone in the game sent (fn(m): { userId, username, text, isGif, at, isLocalPlayer }).
export function onChat(fn) {
  chatListeners.add(fn)
  return () => chatListeners.delete(fn)
}

// --- Auth ---------------------------------------------------------------
// The SDK fires onUserChanged immediately with a null user, then again once the
// portal handshake answers; a null user only settles auth after a grace period.
const GUEST_SETTLE_MS = 2500
let settleTimer = null

function settleAuth() {
  settleTimer = null
  if (authState.ready) return
  authState.ready = true
  emit(authListeners, authState)
}

function onUser() {
  const SDK = sdk()
  const user = SDK ? SDK.auth.getUser() : null
  latestEquipped = null // a different account's equip event must not linger
  latestProportions = null

  if (user || authState.ready) {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = null
    authState.ready = true
  } else if (!settleTimer) {
    settleTimer = setTimeout(settleAuth, GUEST_SETTLE_MS)
  }
  authState.user = user
  try {
    authState.guest = user || typeof SDK.auth.getGuest !== 'function' ? null : SDK.auth.getGuest()
  } catch {
    authState.guest = null
  }
  emit(authListeners, authState)
}

// Name for the HUD badge.
export function displayName() {
  const u = authState.user
  if (u) return u.displayName || u.username || u.name || 'Player'
  const g = authState.guest
  if (g) return g.displayName || g.username || g.name || 'Guest'
  return sdk() ? 'Guest' : 'Offline'
}

// --- Environment ----------------------------------------------------------
// Bloxity runs in prod, stage and local environments; the platform tells the game which one, so
// every URL comes from the SDK (never detected from the hostname, never hardcoded). '' = the SDK
// is absent (dev mode / blocked) or too old to say: callers skip what needs the URL.
export function environment() {
  try {
    return sdk()?.environment?.() ?? null
  } catch {
    return null
  }
}
export const apiUrl = () => environment()?.apiUrl || ''
export const staticUrl = () => environment()?.staticUrl || ''
const envListeners = new Set()
// fn() when the platform switches environment: anything cached from an API / CDN is stale then.
export function onEnvironment(fn) {
  envListeners.add(fn)
  return () => envListeners.delete(fn)
}

// The player's Bloxity token (`Legion.SDK.auth.getToken()`): the server verifies it with Bloxity
// and uses only the account id Bloxity returns. '' for a guest / no SDK.
export function getToken() {
  try {
    const t = sdk()?.auth?.getToken?.()
    return typeof t === 'string' ? t : ''
  } catch {
    return ''
  }
}

// The player's Bloxity profile picture (user, else the guest's derived one) as an absolute
// http(s) URL, '' when there is none. Relative paths resolve against the CDN (staticUrl).
export function getPfp() {
  const raw = authState.user?.pfp || authState.guest?.pfp
  if (typeof raw !== 'string' || !raw) return ''
  try {
    const url = new URL(raw, staticUrl() || undefined)
    return /^https?:$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

// --- Init ---------------------------------------------------------------
let initialised = false

export function init() {
  if (initialised) return
  initialised = true

  const SDK = sdk()
  if (!SDK) {
    if (DEV_MODE) console.info('[bloxity] VITE_DEV_MODE=true: skipping SDK/CDN, running on the default avatar')
    else console.info('[bloxity] SDK not loaded: running offline on the default avatar')
    authState.ready = true
    emit(authListeners, authState)
    return
  }

  try {
    // One build for every environment: the SDK itself works out where it runs (never the hostname).
    const ready = Promise.resolve(SDK.init({ gameSlug: GAME_SLUG }))
    SDK.game.loadingStep(`Loading ${GAME_TITLE}`)
    if (typeof SDK.onEnvironmentChanged === 'function') unsubscribers.push(SDK.onEnvironmentChanged(() => emit(envListeners)))
    // Features are announced once the SDK is initialised: the portal then shows the emote button.
    ready.then(
      () => registerFeature('emotes'),
      () => {},
    )
    defineLeaderboards(LEADERBOARDS)
    declareAdScreens()
    watchAdBreaks()

    for (const key of Object.keys(SETTINGS)) {
      const off = SDK.settings.listen(key, (raw) => {
        const next = coerceSetting(key, raw)
        if (settings[key] === next) return
        settings[key] = next
        emit(settingListeners, key, next)
      })
      if (typeof off === 'function') unsubscribers.push(off)
    }
    SDK.settings.triggerAll?.()

    unsubscribers.push(SDK.auth.onUserChanged(onUser))

    if (typeof SDK.avatar?.onAvatarChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onAvatarChanged((equipped) => {
          // The event payload wins over getEquipped(), which can lag the event.
          if (equipped && typeof equipped === 'object') latestEquipped = equipped
          emit(avatarListeners)
        }),
      )
    }
    if (typeof SDK.avatar?.onProportionsChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onProportionsChanged((proportions) => {
          if (proportions && typeof proportions === 'object') latestProportions = proportions
          emit(proportionListeners)
        }),
      )
    }

    unsubscribers.push(
      SDK.player.onEvent((event, data) => {
        if (event === 'respawn_request') emit(respawnListeners)
        else if (event === 'play_emote') emit(emoteListeners, typeof data === 'string' ? data : '')
        else if (event === 'stop_emote') emit(emoteListeners, '')
      }),
    )
    if (typeof SDK.chat?.onMessage === 'function') unsubscribers.push(SDK.chat.onMessage((m) => emit(chatListeners, m)))

    SDK.game.loadingStep('Building the island')
  } catch (err) {
    console.warn('[bloxity] init failed; running without the SDK', err)
    authState.ready = true
    emit(authListeners, authState)
  }
}

export function loadingStep(text) {
  try {
    sdk()?.game.loadingStep(text)
  } catch {
    // Non-fatal.
  }
}

let announcedFirstFrame = false

// Call once the scene has rendered: tells the portal loading is done.
export function notifyFirstFrame() {
  if (announcedFirstFrame) return
  announcedFirstFrame = true
  const SDK = sdk()
  if (!SDK) return
  try {
    SDK.game.loadingEnd()
    SDK.game.gameplayStart()
  } catch {
    // Non-fatal.
  }
}

export function teardown() {
  for (const off of unsubscribers.splice(0)) {
    try {
      off()
    } catch {
      // Tearing down anyway.
    }
  }
  try {
    sdk()?.game.gameplayEnd()
  } catch {
    // Non-fatal.
  }
}

// --- Avatar accessors (null when the SDK is unavailable or the call throws) ---
export function getEquippedAvatar() {
  if (latestEquipped) return latestEquipped
  try {
    return sdk()?.avatar.getEquipped() ?? null
  } catch {
    return null
  }
}

// { height, shoulderWidth, armLength, legOffsetX, torsoScaleX, neckHeight,
// headScale }, normalised around 1.0; loader.js applyProportions() consumes it.
export function getProportions() {
  try {
    const current = sdk()?.avatar.getProportions()
    return latestProportions ? { ...current, ...latestProportions } : current ?? null
  } catch {
    return latestProportions
  }
}

// Skin texture URL with the worn face, shirt and pants already drawn on.
export function getSkinTextureUrl() {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrl?.()
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

export const canCustomize = () => typeof sdk()?.avatar?.toggleCustomizer === 'function'

// Opens / closes the portal's avatar editor; edits come back through onAvatarChanged.
export function toggleCustomizer() {
  try {
    sdk()?.avatar.toggleCustomizer()
  } catch {
    // Ignore.
  }
}

// --- Game server ------------------------------------------------------
// Bloxity hosting has no fixed socket URL: the matchmaker picks a pod with room (or wakes one) and
// the SDK returns its endpoint (the dev channel reaches the dev backend, prod the prod one). Each
// endpoint is pinned to one pod, so net.js builds a new Client per resolve.
export function canResolveServer() {
  try {
    return typeof sdk()?.net?.resolveEndpoint === 'function'
  } catch {
    return false
  }
}
// { endpoint, relayRoomId }: relayRoomId is the matchmaker relay pinning the pod (the endpoint is
// {playUrl}/v1/ws/<relayRoomId>). Rejects (net.js retries with backoff) when the matchmaker can't answer.
export async function resolveServerEndpoint(userId) {
  const { endpoint, roomId, cold } = await sdk().net.resolveEndpoint(GAME_SLUG, userId ? { userId } : undefined)
  if (cold) console.info('[net] waking up a server...')
  return { endpoint, relayRoomId: roomId }
}

// The ?roomId= the page was opened with: the game page's Open Rooms Join button (a bare Colyseus
// room id) or a friend invite (what updateRoom() reported: "<relayRoomId>~<colyseusRoomId>").
export function launchRoomId() {
  try {
    return new URLSearchParams(location.search).get('roomId') || ''
  } catch {
    return ''
  }
}

// Where a launch room lives: { endpoint, roomId, relayRoomId }, or null when it is gone, full or
// can't be found. A bare id needs the matchmaker's cross-pod directory (a plain joinById through
// any relay would usually land on another pod); a relay~room id is joined through its relay.
export async function locateRoom(id) {
  const playUrl = (() => {
    try {
      return sdk()?.environment?.()?.playUrl
    } catch {
      return '' // Older SDK builds have no environment().
    }
  })()
  if (!playUrl || !id) return null
  const base = playUrl.replace(/\/$/, '')
  const [relay, roomId] = id.includes('~') ? id.split('~', 2) : ['', id]
  if (relay) return { endpoint: `${base.replace(/^http/i, 'ws')}/v1/ws/${encodeURIComponent(relay)}`, roomId, relayRoomId: relay }
  const res = await fetch(`${base}/v1/dir/${encodeURIComponent(GAME_SLUG)}/list`)
  const rooms = res.ok ? (await res.json())?.rooms ?? [] : []
  const r = rooms.find((r) => r.colyseusRoomId === roomId && !r.locked && r.players < r.maxPlayers)
  return r ? { endpoint: r.joinUrl, roomId: r.colyseusRoomId, relayRoomId: r.relayRoomId } : null
}

// Reports the room this player is in ('' = not in a joinable room), so the portal's friend invites
// land in it.
export function updateRoom(roomId) {
  try {
    sdk()?.game?.updateRoom?.(roomId)
  } catch {
    // Ignore.
  }
}

// --- Portal -----------------------------------------------------------
export function showMenu() {
  try {
    sdk()?.portal.showMenu(true)
  } catch {
    // Ignore.
  }
}

// Where Boxity draws its own controls over the game: the toolbar in the top-left corner and
// the chat feed under it, as [{ id, left, top, width, height }] in CSS px. fn runs now and on
// every change (resize, toolbar change). Without the SDK (dev mode, blocked CDN) it gets the
// default footprint the SDK itself assumes until the portal reports, so the HUD is laid out
// the same everywhere. Returns an unsubscribe.
export function onReservedAreas(fn) {
  try {
    const off = sdk()?.ui?.onReservedAreasChange?.((areas) => fn(Array.isArray(areas) ? areas : []))
    if (typeof off === 'function') return off
  } catch {
    // Fall back to the estimate below.
  }
  const update = () => fn(estimatedReservedAreas(window.innerWidth, window.innerHeight))
  window.addEventListener('resize', update)
  update()
  return () => window.removeEventListener('resize', update)
}

// The SDK's estimate (legion-sdk ui.estimatedAreas): an 8 px margin round one row of buttons,
// the whole width on narrow phones, and the chat feed under it.
function estimatedReservedAreas(w, h) {
  const compact = w < 640 || h <= 500
  const toolbarHeight = 16 + (w < 640 ? 32 : w < 768 ? 40 : 44)
  const chatWidth = compact ? Math.min(w * 0.7, 260) : Math.min(w * 0.8, 360)
  return [
    { id: 'toolbar', left: 0, top: 0, width: Math.min(w, w < 480 ? w : 330), height: toolbarHeight },
    { id: 'chat', left: 0, top: toolbarHeight, width: Math.round(chatWidth + 8), height: compact ? 140 : 180 },
  ]
}

// --- Features, lifecycle, rooms -------------------------------------------
// Tells the portal which optional features this game supports ('emotes' shows the emote button).
export function registerFeature(name) {
  try {
    sdk()?.game?.registerFeature?.(name)
  } catch {
    // Ignore.
  }
}
// A player joined / is already in this room: the portal toasts it to their friends.
export function playerJoined(username) {
  try {
    if (username) sdk()?.game?.playerJoined?.(username)
  } catch {
    // Ignore.
  }
}
export function playerInRoom(username) {
  try {
    if (username) sdk()?.game?.playerInRoom?.(username)
  } catch {
    // Ignore.
  }
}
// Real play started / stopped (analytics): around the time the player is actually in the game.
export function gameplayStart() {
  try {
    sdk()?.game?.gameplayStart?.()
  } catch {
    // Ignore.
  }
}
export function gameplayEnd() {
  try {
    sdk()?.game?.gameplayEnd?.()
  } catch {
    // Ignore.
  }
}

// --- Leaderboards -----------------------------------------------------------
// Declares the boards once after init (ids are permanent; later changes are ignored). Scores are
// reported by the game server (a hosted game never submits from the client): see the backend's bloxity.ts.
export function defineLeaderboards(boards) {
  try {
    sdk()?.leaderboard?.define?.(boards)
  } catch (err) {
    console.warn('[bloxity] leaderboard.define failed', err)
  }
}

// --- Ads ----------------------------------------------------------------------
const breakListeners = new Set()
// fn(true) when an ad break starts (pause the game and mute), fn(false) when it ends.
export function onAdBreak(fn) {
  breakListeners.add(fn)
  return () => breakListeners.delete(fn)
}
function watchAdBreaks() {
  try {
    const ads = sdk()?.ads
    if (!ads) return
    if (typeof ads.onBreakStart === 'function') unsubscribers.push(ads.onBreakStart(() => emit(breakListeners, true)))
    if (typeof ads.onBreakEnd === 'function') unsubscribers.push(ads.onBreakEnd(() => emit(breakListeners, false)))
  } catch {
    // Ignore.
  }
}
// Lists every screen this game has (gameplay is always listed; its banners stay off unless opted in).
function declareAdScreens() {
  try {
    sdk()?.ads?.declareScreens?.(AD_SCREENS)
  } catch (err) {
    console.warn('[bloxity] ads.declareScreens failed', err)
  }
}
let screenAd = null
// A screen opened (menu / lobby / results / panel / gameplay): Boxity shows its banners around it.
export function showAdScreen(type, opts) {
  try {
    screenAd = sdk()?.ads?.screen?.(type, opts) ?? null
  } catch {
    screenAd = null
  }
}
export function hideAdScreen() {
  try {
    if (screenAd?.hide) screenAd.hide()
    else sdk()?.ads?.hideScreen?.()
  } catch {
    // Ignore.
  }
  screenAd = null
}
export function adsAvailable() {
  try {
    return !!sdk()?.ads?.isAvailable?.()
  } catch {
    return false
  }
}
// Plays a rewarded ad: { status ('completed' = grant it), rewardToken?, reason? }. Never rejects.
export async function showRewardedAd(placement) {
  try {
    return (await sdk().ads.showRewarded(placement)) ?? { status: 'error' }
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) }
  }
}

// --- Death screen -------------------------------------------------------------
// Boxity's own death screen (ads + a countdown the Respawn button waits for). The handle has
// onCountdown(fn) and respawn() (true once the countdown ran out); null without the SDK, then the
// game just respawns on its own timer.
export function showDeathScreen() {
  try {
    return sdk()?.deathScreen?.show?.() ?? null
  } catch {
    return null
  }
}
export function hideDeathScreen() {
  try {
    sdk()?.deathScreen?.hide?.()
  } catch {
    // Ignore.
  }
}

// --- Chat bubbles ---------------------------------------------------------------
export const chatBubbleSeconds = () => {
  try {
    return Number(sdk()?.chat?.bubbleSeconds) || 4
  } catch {
    return 4
  }
}
// The text a bubble shows for a message (GIFs read as a label).
export function bubbleText(m) {
  try {
    return String(sdk()?.chat?.bubbleText?.(m) ?? m?.text ?? '')
  } catch {
    return String(m?.text ?? '')
  }
}
// A bubble above `root` (three.js), or null; the returned object has remove().
export function attachBubble(THREE, root, text) {
  try {
    return sdk()?.chat?.attachBubble?.(THREE, root, text) ?? null
  } catch {
    return null
  }
}

export function requestFullscreen(on) {
  try {
    const SDK = sdk()
    if (!SDK) return
    if (on) SDK.portal.requestFullscreen()
    else SDK.portal.exitFullscreen()
  } catch {
    // Ignore.
  }
}
