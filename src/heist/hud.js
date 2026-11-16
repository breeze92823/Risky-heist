// DOM HUD: police stars + Jail Chance (top), money (bottom-left), carried loot
// hotbar and Home / Place Best / Sell (bottom centre), Index / Rebirth / Gifts / Guide / Settings
// (left), Stop Police + Random Treasure cash boosts (right), toasts, a floor banner, the BUSTED
// overlay, the siren vignette and modal panels (stalls, index, guide, settings).
// Every control is a pointerdown button (touch + mouse); layout is relative units.
import './hud.css'
import * as bloxity from '../bloxity.js'
import { commas, money } from './kit.js'
import { AUDIO } from '../config.js'
import { sfx } from './sfx.js'

const STAR = '<svg viewBox="0 0 24 24"><path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"/></svg>'
const ICON = {
  index: '<svg viewBox="0 0 24 24"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5V21.5A2.5 2.5 0 0 0 6.5 22H20"/></svg>',
  guide: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><circle cx="12" cy="17.5" r=".6"/></svg>',
  zzz: '<svg viewBox="0 0 24 24"><path d="M4 6h7l-7 8h7M13 3h6l-6 6h6M14 15h4l-4 5h4"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 13h18M12 9v12M12 9C9 9 7 7.5 7.8 5.6 8.7 3.5 11 5 12 9zM12 9c3 0 5-1.5 4.2-3.4C15.3 3.5 13 5 12 9z"/></svg>',
  ad: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.6"/></svg>',
  rebirth: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-13.7 5.6"/><path d="M4 12A8 8 0 0 1 17.7 6.4"/><path d="M17.5 2.5v4h-4M6.5 21.5v-4h4"/></svg>',
}
// Big colourful icons for the window title tabs (self-coloured, not stroke-tinted).
const TAB_ICON = {
  zip: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#33c9ff" stroke="#14081f" stroke-width="4"/><path d="M8 16 56 34" stroke="#14081f" stroke-width="4" stroke-linecap="round"/><rect x="26" y="20" width="12" height="8" rx="2" fill="#ffcc22" stroke="#14081f" stroke-width="3" transform="rotate(20 32 24)"/><path d="M32 28v12M24 40h16" stroke="#14081f" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="48" r="5" fill="#fff" stroke="#14081f" stroke-width="3"/></svg>',
  rebirth: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#fff" stroke="#14081f" stroke-width="4"/><path d="M5 32a27 27 0 0 1 54 0z" fill="#ff2f6d" stroke="#14081f" stroke-width="4"/><path d="M44 22a14 14 0 1 0 3 15" fill="none" stroke="#14081f" stroke-width="7" stroke-linecap="round"/><path d="M44 22a14 14 0 1 0 3 15" fill="none" stroke="#7fd8ff" stroke-width="3.5" stroke-linecap="round"/><path d="M38 14l9 7-10 4z" fill="#7fd8ff" stroke="#14081f" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  gift: '<svg viewBox="0 0 64 64"><rect x="6" y="12" width="52" height="46" rx="8" fill="#fff" stroke="#14081f" stroke-width="4"/><path d="M6 20a8 8 0 0 1 8-8h36a8 8 0 0 1 8 8v8H6z" fill="#ff3b5c" stroke="#14081f" stroke-width="4"/><rect x="17" y="4" width="7" height="15" rx="3.5" fill="#cfd4e0" stroke="#14081f" stroke-width="3"/><rect x="40" y="4" width="7" height="15" rx="3.5" fill="#cfd4e0" stroke="#14081f" stroke-width="3"/><text x="32" y="51" text-anchor="middle" font-family="Fredoka, Arial Black" font-weight="700" font-size="23" fill="#14081f">31</text></svg>',
  upgrades: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#33d6ff" stroke="#14081f" stroke-width="4"/><path d="M32 14 48 32H38v16H26V32H16z" fill="#fff" stroke="#14081f" stroke-width="4" stroke-linejoin="round"/></svg>',
  tools: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#c56bff" stroke="#14081f" stroke-width="4"/><path d="M22 48 40 30" stroke="#14081f" stroke-width="11" stroke-linecap="round"/><path d="M22 48 40 30" stroke="#d9a35a" stroke-width="5" stroke-linecap="round"/><path d="M30 18l10-4 12 12-4 10-6-6-6 2-4-4 2-6z" fill="#dfe4ee" stroke="#14081f" stroke-width="3.5" stroke-linejoin="round"/></svg>',
  sell: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#4ddc2a" stroke="#14081f" stroke-width="4"/><text x="32" y="46" text-anchor="middle" font-family="Fredoka, Arial Black" font-weight="700" font-size="40" fill="#fff" stroke="#14081f" stroke-width="3" paint-order="stroke">$</text></svg>',
  index: '<svg viewBox="0 0 64 64"><path d="M10 14a6 6 0 0 1 6-6h38v44H16a6 6 0 0 0-6 6z" fill="#2f8cff" stroke="#14081f" stroke-width="4" stroke-linejoin="round"/><path d="M10 58a6 6 0 0 1 6-6h38v6z" fill="#fff" stroke="#14081f" stroke-width="4" stroke-linejoin="round"/><path d="M22 20h22M22 28h16" stroke="#cfe6ff" stroke-width="4" stroke-linecap="round"/></svg>',
  settings: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#8a7bff" stroke="#14081f" stroke-width="4"/><path d="M32 12l4 6 7-2 1 7 7 2-3 6 3 6-7 2-1 7-7-2-4 6-4-6-7 2-1-7-7-2 3-6-3-6 7-2 1-7 7 2z" fill="#fff" stroke="#14081f" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="32" r="7" fill="#8a7bff" stroke="#14081f" stroke-width="3"/></svg>',
  guide: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#ff9a1f" stroke="#14081f" stroke-width="4"/><text x="32" y="45" text-anchor="middle" font-family="Fredoka, Arial Black" font-weight="700" font-size="36" fill="#fff" stroke="#14081f" stroke-width="3" paint-order="stroke">?</text></svg>',
}

function h(tag, cls, html = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
function button(cls, html, fn) {
  const b = h('button', `hud-btn ${cls}`, html)
  b.type = 'button'
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (b.classList.contains('off')) return sfx.disabled()
    sfx.click()
    fn(b)
  })
  // a soft tick when the mouse moves onto a button (never on touch: no hover there)
  if (AUDIO.hover)
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && !b.classList.contains('off')) sfx.hover()
    })
  return b
}

export function createHud(actions) {
  const root = h('div', 'hud')
  document.body.appendChild(root)

  // --- Top: stars + jail chance ---------------------------------------------------------
  const top = h('div', 'hud-top')
  const stars = h('div', 'hud-stars')
  const starEls = []
  for (let i = 0; i < 5; i++) {
    const s = h('div', 'hud-star', `<div class="base">${STAR}</div><div class="fill">${STAR}</div>`)
    stars.appendChild(s)
    starEls.push(s.querySelector('.fill'))
  }
  const jail = h('div', 'hud-jail', 'Jail Chance: 0%')
  const floorTag = h('div', 'hud-floortag hidden')
  top.append(stars, jail, floorTag)
  root.appendChild(top)

  // --- Left column ------------------------------------------------------------------------
  const left = h('div', 'hud-left')
  const rebirthBtn = button('side rebirth', `<span class="ico">${ICON.rebirth}</span><span class="badge"></span><span class="lbl">Rebirth</span>`, actions.onRebirth)
  const giftBtn = button('side gifts', `<span class="ico cal">${TAB_ICON.gift}</span><span class="bang hidden">!</span><span class="lbl">Gifts</span>`, actions.onGifts)
  left.append(
    button('side index', `<span class="ico">${ICON.index}</span><span class="lbl">Index</span>`, actions.onIndex),
    rebirthBtn,
    giftBtn,
    button('side guide', `<span class="ico">${ICON.guide}</span><span class="lbl">Guide</span>`, actions.onGuide),
    button('side settings', `<span class="ico">${ICON.settings}</span><span class="lbl">Settings</span>`, actions.onSettings),
  )
  root.appendChild(left)

  // --- Right column: cash boosts --------------------------------------------------------------
  const right = h('div', 'hud-right')
  const stopBtn = button('boost stop', `<span class="ico">${ICON.zzz}</span><span class="lbl">Stop Police<br>for 60s</span><span class="price"></span>`, actions.onStopPolice)
  const randBtn = button('boost rand', `<span class="ico">${ICON.gift}</span><span class="lbl">Random<br>Treasure!</span><span class="price"></span>`, actions.onRandomTreasure)
  // Rewarded ad: only shown while Boxity can play one (setAdOffer); the reward is cash, never premium currency.
  const adBtn = button('boost ad hidden', `<span class="ico">${ICON.ad}</span><span class="lbl">Free Cash<br>Watch Ad</span><span class="price"></span>`, actions.onWatchAd)
  right.append(stopBtn, randBtn, adBtn)
  root.appendChild(right)

  // --- Bottom: money, hotbar, action buttons ----------------------------------------------------
  const moneyEl = h('div', 'hud-money', '<span class="cash-ico"></span><span class="amt">$0</span>')
  const moneyAmt = moneyEl.querySelector('.amt')
  root.appendChild(moneyEl)
  const incomeEl = h('div', 'hud-income', '')
  root.appendChild(incomeEl)

  const bottom = h('div', 'hud-bottom')
  const hotbar = h('div', 'hud-hotbar')
  const actionsRow = h('div', 'hud-actions')
  const homeBtn = button('act home', 'Home', actions.onHome)
  const placeBtn = button('act place', 'Place Best', actions.onPlaceBest)
  const sellBtn = button('act sell', 'Sell', actions.onSell)
  actionsRow.append(homeBtn, placeBtn, sellBtn)
  bottom.append(hotbar, actionsRow)
  root.appendChild(bottom)

  // --- Overlays ---------------------------------------------------------------------------------
  const toasts = h('div', 'hud-toasts')
  root.appendChild(toasts)
  const banner = h('div', 'hud-banner hidden', '<div class="b1"></div><div class="b2"></div>')
  root.appendChild(banner)
  const siren = h('div', 'hud-siren')
  root.appendChild(siren)
  const busted = h('div', 'hud-busted hidden', '<div class="bars"></div><div class="word">BUSTED!</div><div class="sub">The police took your loot</div>')
  root.appendChild(busted)

  // Boxity's death screen: our own card sits in the middle (the portal puts its ads round it) with a
  // Respawn button that stays disabled until the portal's countdown reaches 0.
  const death = h('div', 'hud-death hidden', '<div class="death-card"><div class="death-title">You got caught!</div><div class="death-sub">The police took your loot</div></div>')
  let deathAction = null
  const deathBtn = button('death-btn off', 'Respawn', () => deathAction?.())
  death.querySelector('.death-card').appendChild(deathBtn)
  root.appendChild(death)
  function hideDeathPrompt() {
    death.classList.add('hidden')
    deathAction = null
  }

  // --- Panel ------------------------------------------------------------------------------------
  const shade = h('div', 'panel-shade hidden')
  const panel = h('div', 'panel')
  const panelTab = h('div', 'panel-tab', '<div class="panel-icon"></div><div class="panel-title"></div>')
  const closeBtn = button('panel-close', 'X', () => closePanel())
  const panelBody = h('div', 'panel-body')
  panel.append(panelTab, closeBtn, panelBody)
  const panelFoot = h('div', 'panel-foot hidden')
  const panelWrap = h('div', 'panel-wrap')
  panelWrap.append(panel, panelFoot)
  shade.appendChild(panelWrap)
  shade.addEventListener('pointerdown', (e) => {
    if (e.target === shade) {
      sfx.click()
      closePanel()
    }
  })
  document.body.appendChild(shade)
  let panelOpen = false
  let onClose = null
  function openPanel({ title, color = '#ff2f6d', icon = 'guide', body, onClosed, wide = false }) {
    panel.style.setProperty('--accent', color)
    panel.classList.toggle('wide', wide)
    panelTab.querySelector('.panel-title').textContent = title
    panelTab.querySelector('.panel-icon').innerHTML = TAB_ICON[icon] ?? ''
    panelFoot.classList.add('hidden')
    panelBody.replaceChildren(body)
    shade.classList.remove('hidden')
    if (!panelOpen) sfx.open()
    panelOpen = true
    onClose = onClosed ?? null
    if (document.pointerLockElement) document.exitPointerLock?.()
    bloxity.showAdScreen('panel') // Boxity's banners go round the window
  }
  function closePanel() {
    if (!panelOpen) return
    shade.classList.add('hidden')
    bloxity.hideAdScreen()
    sfx.close()
    panelOpen = false
    onClose?.()
    onClose = null
  }

  // Keep HUD out of the portal's reserved corner (toolbar + chat).
  bloxity.onReservedAreas((areas) => {
    let bottomEdge = 0
    for (const a of areas) if (a.left < window.innerWidth * 0.3) bottomEdge = Math.max(bottomEdge, a.top + a.height)
    root.style.setProperty('--reserved-top', `${bottomEdge}px`)
  })

  let lastMoney = -1
  let lastJail = -1
  let lastHot = ''
  let lastRebirth = ''
  return {
    get panelOpen() {
      return panelOpen
    },
    setFoot(text) {
      panelFoot.classList.toggle('hidden', !text)
      if (text) panelFoot.textContent = text
    },
    // Rebirth button badge: progress toward the next rebirth (green %, READY when affordable).
    setRebirth(mult, progress) {
      const k = progress >= 1 ? 'READY' : `${Math.floor(Math.max(0, progress) * 100)}%`
      const key = k + mult
      if (key === lastRebirth) return
      lastRebirth = key
      rebirthBtn.querySelector('.badge').textContent = k
      rebirthBtn.classList.toggle('ready', progress >= 1)
      rebirthBtn.querySelector('.lbl').textContent = mult > 1 ? `Rebirth x${+mult.toFixed(1)}` : 'Rebirth'
    },
    setGiftReady(on) {
      giftBtn.querySelector('.bang').classList.toggle('hidden', !on)
      giftBtn.classList.toggle('ready', on)
    },
    rebirthView,
    dailyView,
    openPanel,
    closePanel,
    row,
    setMoney(n) {
      const v = Math.floor(n)
      if (v === lastMoney) return
      if (v > lastMoney && lastMoney >= 0) {
        moneyEl.classList.remove('bump')
        void moneyEl.offsetWidth
        moneyEl.classList.add('bump')
      }
      lastMoney = v
      moneyAmt.textContent = commas(v)
    },
    setIncome(perSec) {
      incomeEl.textContent = perSec > 0 ? `+${money(perSec)}/s` : ''
    },
    setJail(pct, frozenSecs) {
      const v = Math.floor(pct)
      const key = v * 1000 + Math.ceil(frozenSecs)
      if (key === lastJail) return
      lastJail = key
      jail.textContent = frozenSecs > 0 ? `Police Asleep: ${Math.ceil(frozenSecs)}s` : `Jail Chance: ${v}%`
      jail.classList.toggle('frozen', frozenSecs > 0)
      jail.classList.toggle('hot', v >= 70 && frozenSecs <= 0)
      starEls.forEach((s, i) => {
        const k = Math.max(0, Math.min(1, (pct - i * 20) / 20))
        s.style.clipPath = `inset(0 ${(1 - k) * 100}% 0 0)`
        s.parentElement.classList.toggle('lit', k >= 1)
      })
    },
    setSiren(on) {
      siren.classList.toggle('on', on)
    },
    setFloorTag(text) {
      floorTag.classList.toggle('hidden', !text)
      if (text) floorTag.textContent = text
    },
    // items: [{ id, name, color, thumb }], capacity
    setCarry(items, capacity) {
      const key = items.map((i) => i.id).join(',') + '|' + capacity
      if (key === lastHot) return
      lastHot = key
      hotbar.replaceChildren()
      for (let i = 0; i < capacity; i++) {
        const it = items[i]
        const slot = h('div', `hot-slot${it ? ' full' : ''}`)
        if (it) {
          slot.style.setProperty('--rc', it.color)
          slot.innerHTML = `<div class="hot-name">${it.name}</div><img src="${it.thumb}" alt="">`
        }
        hotbar.appendChild(slot)
      }
      hotbar.classList.toggle('pop', items.length > 0)
    },
    setButtons({ inHeist, nearBase, carrying }) {
      homeBtn.classList.toggle('off', inHeist)
      sellBtn.classList.toggle('off', inHeist)
      placeBtn.classList.toggle('hidden', !(nearBase && carrying))
      actionsRow.classList.toggle('heist', inHeist)
    },
    // The rewarded-ad button: `reward` text (e.g. "+$12.5K") while ready, `wait` seconds on cooldown,
    // hidden when no ad can be shown.
    setAdOffer(show, reward, wait = 0) {
      adBtn.classList.toggle('hidden', !show)
      adBtn.classList.toggle('wait', wait > 0)
      adBtn.classList.toggle('off', wait > 0)
      adBtn.querySelector('.price').textContent = wait > 0 ? `${Math.ceil(wait / 60)}m` : reward
    },
    // Boxity's death screen: `handle` is its onCountdown / respawn() object; onRespawn runs when the
    // player clicks Respawn after the countdown (respawn() answered true).
    deathPrompt(handle, onRespawn) {
      death.classList.remove('hidden')
      deathBtn.textContent = 'Respawn'
      const counting = typeof handle?.onCountdown === 'function'
      deathBtn.classList.toggle('off', counting)
      deathAction = () => {
        if (handle?.respawn?.() === false) return
        hideDeathPrompt()
        onRespawn()
      }
      if (counting)
        handle.onCountdown((n) => {
          const left = Number(n) || 0
          deathBtn.textContent = left > 0 ? `Respawn in ${left}` : 'Respawn'
          deathBtn.classList.toggle('off', left > 0)
        })
    },
    hideDeathPrompt,
    setBoosts(stopPrice, randPrice, stopActive) {
      stopBtn.querySelector('.price').textContent = stopActive > 0 ? `${Math.ceil(stopActive)}s` : money(stopPrice)
      stopBtn.classList.toggle('active', stopActive > 0)
      randBtn.querySelector('.price').textContent = money(randPrice)
    },
    toast(text, color = '#ffffff') {
      const t = h('div', 'hud-toast', '')
      t.textContent = text
      t.style.color = color
      toasts.appendChild(t)
      if (color !== '#ff6a6a') sfx.toast() // red toasts come with their own deny / bust sound
      while (toasts.children.length > 4) toasts.firstChild.remove()
      setTimeout(() => t.classList.add('out'), 2400)
      setTimeout(() => t.remove(), 3000)
    },
    banner(title, sub, color = '#ffe14d') {
      banner.querySelector('.b1').textContent = title
      banner.querySelector('.b1').style.color = color
      banner.querySelector('.b2').textContent = sub
      banner.classList.remove('hidden', 'show')
      void banner.offsetWidth
      banner.classList.add('show')
      sfx.banner()
    },
    busted() {
      busted.classList.remove('hidden', 'show')
      void busted.offsetWidth
      busted.classList.add('show')
      setTimeout(() => busted.classList.add('hidden'), 2600)
    },
  }
}

// One shop/sell row: icon, name (+ coloured sub lines) and a button.
function row({ thumb, name, nameColor = '#ffffff', lines = [], button: btn }) {
  const r = h('div', 'prow')
  if (thumb) r.appendChild(h('img', 'prow-thumb'))
  if (thumb) r.lastChild.src = thumb
  const info = h('div', 'prow-info')
  const n = h('div', 'prow-name')
  n.textContent = name
  n.style.color = nameColor
  info.appendChild(n)
  for (const l of lines) {
    const d = h('div', 'prow-line')
    d.textContent = l.text
    d.style.color = l.color ?? '#d8d4ff'
    info.appendChild(d)
  }
  r.appendChild(info)
  if (btn) {
    const b = button(`prow-btn ${btn.cls ?? ''} ${btn.disabled ? 'off' : ''}`, btn.label, () => btn.onClick(b))
    if (btn.color) b.style.setProperty('--btn', btn.color)
    r.appendChild(b)
  }
  return r
}

const cashIcon = () => h('span', 'cash-ico big')

// The Rebirth window body: current -> next multiplier pills, warning, progress bar, button.
function rebirthView() {
  const el = h('div', 'rb')
  const from = h('div', 'rb-pill')
  const to = h('div', 'rb-pill next')
  const arrow = h('div', 'rb-arrow', '<svg viewBox="0 0 40 30"><path d="M3 10h20V3l14 12-14 12v-7H3z" fill="#fff" stroke="#14081f" stroke-width="3" stroke-linejoin="round"/></svg>')
  const mults = h('div', 'rb-mults')
  mults.append(from, arrow, to)
  const warn = h('div', 'rb-warn', 'Rebirth resets your Cash!')
  const bar = h('div', 'rb-bar')
  const fill = h('div', 'rb-fill')
  const txt = h('div', 'rb-text')
  bar.append(fill, txt)
  const barRow = h('div', 'rb-barrow')
  barRow.append(cashIcon(), bar)
  const go = button('big-green', 'Rebirth', () => view.onRebirth?.())
  const note = h('div', 'rb-note', '')
  el.append(mults, warn, barRow, go, note)
  const pill = (p, m) => {
    p.replaceChildren(cashIcon(), h('span', 'rb-x', `${+m.toFixed(1)}X`))
  }
  const view = {
    el,
    onRebirth: null,
    set({ from: a, to: b, money: m, cost, rebirths }) {
      pill(from, a)
      pill(to, b)
      fill.style.width = `${Math.min(1, m / cost) * 100}%`
      txt.textContent = `${money(m)}/${money(cost)}`
      go.classList.toggle('off', m < cost)
      note.textContent = `Rebirths: ${rebirths} - multiplies base income and sale prices. Your items, slots and tools stay.`
    },
  }
  return view
}

// The Daily Gifts window body: days 1-6 in a 3x2 grid, day 7 as a big card, Claim All.
// cells: [{ day, title, titleColor, thumb (null = cash), state: 'claim' | 'claimed' | 'locked' }]
function dailyView() {
  const el = h('div', 'dg')
  const grid = h('div', 'dg-grid')
  const big = h('div', 'dg-side')
  el.append(grid, big)
  const view = {
    el,
    onClaim: null,
    onClaimAll: null,
    set(cells, allPrice) {
      grid.replaceChildren()
      big.replaceChildren()
      cells.forEach((c, i) => {
        const card = h('div', `dg-card ${c.state}${i === 6 ? ' seven' : ''}`)
        card.append(h('div', 'dg-day', `Day ${c.day}`))
        const art = h('div', 'dg-art')
        if (c.thumb) {
          const img = h('img')
          img.src = c.thumb
          art.appendChild(img)
        } else art.appendChild(h('span', 'cash-stack'))
        card.append(art)
        const t = h('div', 'dg-title')
        t.textContent = c.title
        t.style.color = c.titleColor
        card.append(t, h('div', 'dg-state', c.state === 'claim' ? 'CLAIM' : c.state === 'claimed' ? 'CLAIMED' : ''))
        if (c.state === 'claim') {
          card.addEventListener('pointerdown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            sfx.click()
            view.onClaim?.(i)
          })
        }
        if (i < 6) grid.appendChild(card)
        else big.appendChild(card)
      })
      big.append(h('div', 'dg-all', 'Claim All!'))
      const b = button('big-green dg-buy', allPrice == null ? 'All claimed' : `<span class="cash-ico"></span>${money(allPrice)}`, () => view.onClaimAll?.())
      if (allPrice == null) b.classList.add('off')
      big.append(b)
    },
  }
  return view
}
