// Royal Deluxe Casino utilities
// EIN gemeinsames Guthaben fuer alle Spiele.
// Speichert robust in localStorage + sessionStorage + window.name + Cookie + URL-Parametern.
(function () {
  'use strict';

  const BANKROLL_KEY = 'royal_deluxe_shared_bankroll_v6';
  const LEGACY_JSON_KEYS = [
    'royal_deluxe_shared_bankroll_v5',
    'royal_deluxe_shared_bankroll_v4',
    'royal_deluxe_shared_bankroll_v3',
    'casino_bankroll_shared'
  ];
  const LEGACY_NUMBER_KEYS = [
    'casino_bankroll_v2',
    'casino_bankroll_v1',
    'casino_cash',
    'royal_deluxe_bankroll',
    'royal_deluxe_cash',
    'cash',
    'bankroll'
  ];
  const STATS_KEY = 'casino_stats_v2';
  const WINDOW_PREFIX = 'ROYAL_DELUXE_SHARED_BANKROLL_V6=';
  const DEFAULT_BANKROLL = 1000;
  let cachedState = null;
  let broadcast = null;

  function now() { return Date.now(); }
  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }
  function safeTimestamp(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }
  function makeState(amount, ts) {
    const cleaned = safeNumber(amount);
    if (cleaned === null) return null;
    return { amount: cleaned, ts: safeTimestamp(ts) };
  }
  function newest(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    if (b.ts > a.ts) return b;
    if (b.ts === a.ts && b.amount !== a.amount) return b;
    return a;
  }
  function canUse(storageName) {
    try {
      const storage = window[storageName];
      storage.setItem('__casino_storage_test__', '1');
      storage.removeItem('__casino_storage_test__');
      return true;
    } catch (e) {
      return false;
    }
  }
  const hasLocal = canUse('localStorage');
  const hasSession = canUse('sessionStorage');

  function parseState(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return makeState(parsed.amount, parsed.ts || parsed.updatedAt);
      return makeState(parsed, 1);
    } catch (e) {
      return makeState(raw, 1);
    }
  }
  function readStorage(storage) {
    let best = null;
    try { best = newest(best, parseState(storage.getItem(BANKROLL_KEY))); } catch (e) {}
    for (const key of LEGACY_JSON_KEYS) {
      try { best = newest(best, parseState(storage.getItem(key))); } catch (e) {}
    }
    for (const key of LEGACY_NUMBER_KEYS) {
      try { best = newest(best, makeState(storage.getItem(key), 1)); } catch (e) {}
    }
    return best;
  }
  function readCookie() {
    try {
      const cookie = String(document.cookie || '').split('; ').find(x => x.startsWith(BANKROLL_KEY + '='));
      if (!cookie) return null;
      return parseState(decodeURIComponent(cookie.split('=').slice(1).join('=')));
    } catch (e) {
      return null;
    }
  }
  function readWindowName() {
    try {
      const parts = String(window.name || '').split('|');
      for (const part of parts) {
        if (part.startsWith(WINDOW_PREFIX)) return parseState(decodeURIComponent(part.slice(WINDOW_PREFIX.length)));
      }
    } catch (e) {}
    return null;
  }
  function readURL() {
    try {
      const url = new URL(window.location.href);
      const amount = url.searchParams.get('bank') || url.searchParams.get('cash') || url.searchParams.get('money');
      const ts = url.searchParams.get('bankts') || url.searchParams.get('casinots');
      return makeState(amount, ts || 1);
    } catch (e) {
      return null;
    }
  }
  function readBestState() {
    let best = cachedState;
    best = newest(best, readURL());
    best = newest(best, readWindowName());
    best = newest(best, readCookie());
    if (hasSession) best = newest(best, readStorage(sessionStorage));
    if (hasLocal) best = newest(best, readStorage(localStorage));
    return best || makeState(DEFAULT_BANKROLL, now());
  }
  function writeWindowName(state) {
    try {
      const encoded = encodeURIComponent(JSON.stringify(state));
      const parts = String(window.name || '').split('|').filter(part => part && !part.startsWith(WINDOW_PREFIX));
      parts.push(WINDOW_PREFIX + encoded);
      window.name = parts.join('|');
    } catch (e) {}
  }
  function writeStorage(storage, state) {
    try {
      storage.setItem(BANKROLL_KEY, JSON.stringify(state));
      // Alte Aliasse bewusst mitschreiben, damit alte Dateien nicht wieder ein anderes Konto anzeigen.
      for (const key of LEGACY_JSON_KEYS) storage.setItem(key, JSON.stringify(state));
      for (const key of LEGACY_NUMBER_KEYS) storage.setItem(key, String(state.amount));
    } catch (e) {}
  }
  function writeCookie(state) {
    try {
      document.cookie = `${BANKROLL_KEY}=${encodeURIComponent(JSON.stringify(state))}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (e) {}
  }
  function updateCurrentURL(state) {
    try {
      if (!history.replaceState) return;
      const url = new URL(window.location.href);
      if (url.protocol !== 'file:' && url.protocol !== 'http:' && url.protocol !== 'https:') return;
      url.searchParams.set('bank', String(state.amount));
      url.searchParams.set('bankts', String(state.ts));
      history.replaceState(null, '', url.href);
    } catch (e) {}
  }
  function persistState(state, options = {}) {
    cachedState = { amount: Math.max(0, Math.floor(state.amount)), ts: safeTimestamp(state.ts) };
    if (hasLocal) writeStorage(localStorage, cachedState);
    if (hasSession) writeStorage(sessionStorage, cachedState);
    writeCookie(cachedState);
    writeWindowName(cachedState);
    if (options.updateURL !== false) updateCurrentURL(cachedState);
    if (broadcast && options.broadcast !== false) {
      try { broadcast.postMessage(cachedState); } catch (e) {}
    }
  }
  function getBankrollState() {
    const state = readBestState();
    persistState(state, { updateURL: true, broadcast: false });
    return cachedState;
  }
  function money(n) { return `${Math.floor(Number(n) || 0)} €`; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || min)); }
  function getCash() { return getBankrollState().amount; }
  function setCash(amount) {
    const state = makeState(amount, now());
    if (!state) return;
    persistState(state, { updateURL: true, broadcast: true });
    syncUI();
    try { window.dispatchEvent(new CustomEvent('bankrollchange', { detail: { amount: state.amount } })); } catch (e) {}
  }
  function changeCash(delta) { setCash(getCash() + Math.floor(Number(delta) || 0)); }
  function canAfford(amount) { return getCash() >= Math.floor(Number(amount) || 0); }
  function resetBankroll() {
    if (confirm('Kontostand wirklich auf 1000 € zurücksetzen?')) setCash(DEFAULT_BANKROLL);
  }

  function updateLinks() {
    const state = cachedState || getBankrollState();
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || /^https?:\/\//i.test(href)) return;
      try {
        const url = new URL(href, window.location.href);
        url.searchParams.set('bank', String(state.amount));
        url.searchParams.set('bankts', String(state.ts));
        a.setAttribute('href', url.href);
      } catch (e) {}
    });
  }
  function syncUI() {
    const cash = (cachedState || getBankrollState()).amount;
    document.querySelectorAll('.shared-bankroll').forEach(el => { el.textContent = money(cash); });
    document.querySelectorAll('input[data-bet-slider="1"]').forEach(input => {
      const hardMax = Number(input.dataset.hardMax || 500);
      const min = Number(input.min || 1);
      const max = Math.max(min, Math.min(hardMax, cash || hardMax));
      input.max = String(max);
      if (Number(input.value) > max) input.value = String(max);
      if (Number(input.value) < min) input.value = String(min);
      input.dispatchEvent(new Event('casino-bet-sync'));
    });
    updateLinks();
  }
  function createBetSlider({ inputId, displayId, min = 1, max = 500, value = 10, step = 1, onChange }) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    if (!input || !display) return () => value;
    input.dataset.betSlider = '1';
    input.dataset.hardMax = String(max);
    input.min = String(min);
    input.step = String(step);
    const currentCash = getCash();
    input.max = String(Math.max(min, Math.min(max, currentCash || max)));
    input.value = String(clamp(value, min, Number(input.max)));
    const update = () => {
      const cash = getCash();
      const newMax = Math.max(min, Math.min(max, cash || max));
      input.max = String(newMax);
      input.value = String(clamp(input.value, min, newMax));
      display.textContent = money(input.value);
      if (onChange) onChange(Number(input.value));
    };
    input.addEventListener('input', update);
    input.addEventListener('casino-bet-sync', update);
    update();
    return () => Number(input.value);
  }
  function casinoURL(href) {
    const state = getBankrollState();
    try {
      const url = new URL(href, window.location.href);
      url.searchParams.set('bank', String(state.amount));
      url.searchParams.set('bankts', String(state.ts));
      return url.href;
    } catch (e) {
      const sep = href.includes('?') ? '&' : '?';
      return `${href}${sep}bank=${state.amount}&bankts=${state.ts}`;
    }
  }
  function casinoNavigate(href) { window.location.href = casinoURL(href); }
  function goLobby() { casinoNavigate('index.html'); }
  function toast(message, type = 'info') {
    let el = document.getElementById('casino-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'casino-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = `show ${type}`;
    clearTimeout(window.__casinoToastTimer);
    window.__casinoToastTimer = setTimeout(() => { el.className = ''; }, 2200);
  }
  function recordGame(game, delta) {
    if (!hasLocal) return;
    try {
      const stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
      stats[game] ||= { played: 0, profit: 0 };
      stats[game].played += 1;
      stats[game].profit += Math.floor(delta);
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {}
  }
  function getStats() {
    if (!hasLocal) return {};
    try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch (e) { return {}; }
  }

  const CARD_SUITS = ['♠', '♥', '♦', '♣'];
  const CARD_COLORS = { '♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red' };
  function cardLabel(v) { return v === 1 ? 'A' : v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : String(v); }
  function makeDeck(decks = 1) {
    const deck = [];
    for (let d = 0; d < decks; d++) {
      for (const suit of CARD_SUITS) {
        for (let value = 1; value <= 13; value++) deck.push({ suit, value, id: `${d}-${suit}-${value}-${Math.random().toString(36).slice(2)}` });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  function pipPositions(value) {
    const map = {
      2: [[50,27],[50,73]],
      3: [[50,24],[50,50],[50,76]],
      4: [[35,25],[65,25],[35,75],[65,75]],
      5: [[35,24],[65,24],[50,50],[35,76],[65,76]],
      6: [[35,22],[65,22],[35,50],[65,50],[35,78],[65,78]],
      7: [[35,20],[65,20],[50,36],[35,52],[65,52],[35,80],[65,80]],
      8: [[35,19],[65,19],[50,34],[35,48],[65,48],[50,63],[35,81],[65,81]],
      9: [[35,18],[65,18],[35,34],[65,34],[50,50],[35,66],[65,66],[35,82],[65,82]],
      10:[[35,16],[65,16],[35,31],[65,31],[35,46],[65,46],[35,61],[65,61],[35,78],[65,78]]
    };
    return map[value] || [[50,50]];
  }
  function pipHTML(value, suit) {
    const pips = pipPositions(value).map(([x,y], index) =>
      `<span class="pip pip-${index}" style="left:${x}%;top:${y}%">${suit}</span>`
    ).join('');
    return `<div class="card-center pip-layout pips-${value}">${pips}</div>`;
  }
  function courtSVG(card, label) {
    const themes = {
      K: { name: 'KING', crown: '♔', primary: '#2e5ea7', secondary: '#d4a43a', accent: '#b22a2a' },
      Q: { name: 'QUEEN', crown: '♕', primary: '#8a2f6b', secondary: '#d4a43a', accent: '#b22a2a' },
      J: { name: 'JACK', crown: '♞', primary: '#2f7a5d', secondary: '#d4a43a', accent: '#b22a2a' }
    }[label];
    const suitColor = (card.suit === '♥' || card.suit === '♦') ? '#b22222' : '#111111';
    const torso = themes.primary;
    const gold = themes.secondary;
    const accent = themes.accent;
    return `
      <svg class="court-svg" viewBox="0 0 120 180" aria-hidden="true">
        <rect x="6" y="6" width="108" height="168" rx="12" fill="#fffdf8" stroke="#c9b187" stroke-width="1.5"/>
        <rect x="12" y="12" width="96" height="156" rx="10" fill="none" stroke="${gold}" stroke-width="1" opacity="0.6"/>
        <line x1="18" y1="90" x2="102" y2="90" stroke="${gold}" stroke-width="1.2" opacity="0.7"/>
        <circle cx="60" cy="90" r="10" fill="#fff" stroke="${gold}" stroke-width="1.2"/>
        <text x="60" y="94" text-anchor="middle" font-size="12" fill="${suitColor}" font-family="Georgia,serif">${card.suit}</text>

        <g transform="translate(60 44)">
          <text x="0" y="-22" text-anchor="middle" font-size="16" fill="${gold}" font-family="Georgia,serif">${themes.crown}</text>
          <circle cx="0" cy="-2" r="10" fill="#f0c8a2" stroke="#9a6a46" stroke-width="1"/>
          <path d="M -10 0 Q 0 -10 10 0" fill="${accent}" opacity="0.95"/>
          <circle cx="-4" cy="-3" r="1.2" fill="#333"/>
          <circle cx="4" cy="-3" r="1.2" fill="#333"/>
          <path d="M -4 3 Q 0 6 4 3" fill="none" stroke="#6c4936" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M -18 18 Q 0 4 18 18 L 13 38 Q 0 34 -13 38 Z" fill="${torso}" stroke="#2f2f2f" stroke-width="0.8"/>
          <path d="M -8 11 L 0 19 L 8 11" fill="#f9f1de" stroke="#cab48a" stroke-width="0.7"/>
          <circle cx="0" cy="27" r="6" fill="#f7f2e6" stroke="${gold}" stroke-width="0.8"/>
          <text x="0" y="30" text-anchor="middle" font-size="9" fill="${suitColor}" font-family="Georgia,serif">${card.suit}</text>
          <text x="-22" y="40" font-size="10" fill="${gold}" font-weight="700" font-family="Georgia,serif">${label}</text>
          <text x="16" y="40" font-size="10" fill="${gold}" font-weight="700" font-family="Georgia,serif">${label}</text>
        </g>

        <g transform="translate(60 136) rotate(180)">
          <text x="0" y="-22" text-anchor="middle" font-size="16" fill="${gold}" font-family="Georgia,serif">${themes.crown}</text>
          <circle cx="0" cy="-2" r="10" fill="#f0c8a2" stroke="#9a6a46" stroke-width="1"/>
          <path d="M -10 0 Q 0 -10 10 0" fill="${accent}" opacity="0.95"/>
          <circle cx="-4" cy="-3" r="1.2" fill="#333"/>
          <circle cx="4" cy="-3" r="1.2" fill="#333"/>
          <path d="M -4 3 Q 0 6 4 3" fill="none" stroke="#6c4936" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M -18 18 Q 0 4 18 18 L 13 38 Q 0 34 -13 38 Z" fill="${torso}" stroke="#2f2f2f" stroke-width="0.8"/>
          <path d="M -8 11 L 0 19 L 8 11" fill="#f9f1de" stroke="#cab48a" stroke-width="0.7"/>
          <circle cx="0" cy="27" r="6" fill="#f7f2e6" stroke="${gold}" stroke-width="0.8"/>
          <text x="0" y="30" text-anchor="middle" font-size="9" fill="${suitColor}" font-family="Georgia,serif">${card.suit}</text>
          <text x="-22" y="40" font-size="10" fill="${gold}" font-weight="700" font-family="Georgia,serif">${label}</text>
          <text x="16" y="40" font-size="10" fill="${gold}" font-weight="700" font-family="Georgia,serif">${label}</text>
        </g>
      </svg>`;
  }
  function courtCardHTML(card, label) {
    return `<div class="card-center court-card">${courtSVG(card, label)}</div>`;
  }
  function aceHTML(card) {
    return `<div class="card-center ace-card"><div class="ace-mark">A</div><div class="ace-suit">${card.suit}</div></div>`;
  }
  function cardCenterHTML(card) {
    const label = cardLabel(card.value);
    if (label === 'J' || label === 'Q' || label === 'K') return courtCardHTML(card, label);
    if (label === 'A') return aceHTML(card);
    return pipHTML(Math.min(10, card.value), card.suit);
  }
  function cardHTML(card, hidden = false) {
    if (hidden || !card) return '<div class="card hidden"><span>⚜</span></div>';
    const label = cardLabel(card.value);
    const color = CARD_COLORS[card.suit];
    return `<div class="card ${color}" data-id="${card.id}">
      <div class="corner tl"><span class="rank-mark">${label}</span><span class="suit-mark">${card.suit}</span></div>
      ${cardCenterHTML(card)}
      <div class="corner br"><span class="rank-mark">${label}</span><span class="suit-mark">${card.suit}</span></div>
    </div>`;
  }

  if (hasLocal) {
    window.addEventListener('storage', e => {
      if ([BANKROLL_KEY, ...LEGACY_JSON_KEYS, ...LEGACY_NUMBER_KEYS].includes(e.key)) {
        cachedState = null;
        getBankrollState();
        syncUI();
      }
    });
  }
  try {
    if ('BroadcastChannel' in window) {
      broadcast = new BroadcastChannel('royal_deluxe_bankroll');
      broadcast.onmessage = event => {
        const incoming = makeState(event.data && event.data.amount, event.data && event.data.ts);
        if (!incoming) return;
        const best = newest(cachedState, incoming);
        if (best === incoming) {
          persistState(incoming, { updateURL: true, broadcast: false });
          syncUI();
        }
      };
    }
  } catch (e) {}

  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || /^https?:\/\//i.test(href)) return;
    e.preventDefault();
    casinoNavigate(href);
  });
  document.addEventListener('DOMContentLoaded', () => { getBankrollState(); syncUI(); });
  window.addEventListener('pageshow', () => { cachedState = null; getBankrollState(); syncUI(); });
  window.addEventListener('focus', () => { cachedState = null; getBankrollState(); syncUI(); });

  Object.assign(window, {
    clamp, money, getCash, setCash, canAfford, changeCash, resetBankroll, syncUI,
    createBetSlider, casinoURL, casinoNavigate, goLobby, toast, recordGame, getStats,
    CARD_SUITS, CARD_COLORS, cardLabel, makeDeck, cardHTML
  });
})();
