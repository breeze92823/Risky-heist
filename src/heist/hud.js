// DOM HUD: police stars + Jail Chance (top), money (bottom-left), carried loot
// hotbar and Home / Place Best / Sell (bottom centre), Index + Guide (left),
// Stop Police + Random Treasure cash boosts (right), toasts, a floor banner,
// the BUSTED overlay, the siren vignette and modal panels (stalls, index, guide).
// Every control is a pointerdown button (touch + mouse); layout is relative units.
import './hud.css'
import * as bloxity from '../bloxity.js'
import { commas, money } from './kit.js'

const STAR = '<svg viewBox="0 0 24 24"><path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"/></svg>'
const ICON = {
  index: '<svg viewBox="0 0 24 24"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5V21.5A2.5 2.5 0 0 0 6.5 22H20"/></svg>',
  guide: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><circle cx="12" cy="17.5" r=".6"/></svg>',
  zzz: '<svg viewBox="0 0 24 24"><path d="M4 6h7l-7 8h7M13 3h6l-6 6h6M14 15h4l-4 5h4"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 13h18M12 9v12M12 9C9 9 7 7.5 7.8 5.6 8.7 3.5 11 5 12 9zM12 9c3 0 5-1.5 4.2-3.4C15.3 3.5 13 5 12 9z"/></svg>',
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
    if (!b.classList.contains('off')) fn(b)
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
  left.append(
    button('side index', `<span class="ico">${ICON.index}</span><span class="lbl">Index</span>`, actions.onIndex),
    button('side guide', `<span class="ico">${ICON.guide}</span><span class="lbl">Guide</span>`, actions.onGuide),
  )
  root.appendChild(left)

  // --- Right column: cash boosts --------------------------------------------------------------
  const right = h('div', 'hud-right')
  const stopBtn = button('boost stop', `<span class="ico">${ICON.zzz}</span><span class="lbl">Stop Police<br>for 60s</span><span class="price"></span>`, actions.onStopPolice)
  const randBtn = button('boost rand', `<span class="ico">${ICON.gift}</span><span class="lbl">Random<br>Treasure!</span><span class="price"></span>`, actions.onRandomTreasure)
  right.append(stopBtn, randBtn)
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

  // --- Panel ------------------------------------------------------------------------------------
  const shade = h('div', 'panel-shade hidden')
  const panel = h('div', 'panel')
  const panelHead = h('div', 'panel-head', '<div class="panel-title"></div>')
  const closeBtn = button('panel-close', '✕', () => closePanel())
  panelHead.appendChild(closeBtn)
  const panelBody = h('div', 'panel-body')
  panel.append(panelHead, panelBody)
  shade.appendChild(panel)
  shade.addEventListener('pointerdown', (e) => {
    if (e.target === shade) closePanel()
  })
  document.body.appendChild(shade)
  let panelOpen = false
  let onClose = null
  function openPanel({ title, color = '#2f8cff', body, onClosed }) {
    panel.style.setProperty('--accent', color)
    panelHead.querySelector('.panel-title').textContent = title
    panelBody.replaceChildren(body)
    shade.classList.remove('hidden')
    panelOpen = true
    onClose = onClosed ?? null
    if (document.pointerLockElement) document.exitPointerLock?.()
  }
  function closePanel() {
    if (!panelOpen) return
    shade.classList.add('hidden')
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
  return {
    get panelOpen() {
      return panelOpen
    },
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
    const b = button(`prow-btn ${btn.disabled ? 'off' : ''}`, btn.label, () => btn.onClick(b))
    if (btn.color) b.style.setProperty('--btn', btn.color)
    r.appendChild(b)
  }
  return r
}
