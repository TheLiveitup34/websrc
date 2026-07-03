/* ════════════════════════════════════════════
   modify.js — fully schema-driven config UI
   Driven by OVERLAY_READY postMessage payload
   from the iframe (target.html / WebSRC)

   Hash-routing support: when running on a
   non-Apache server (hash-routing mode), all
   query params are embedded inside the hash
   as #?key=val so the Core.js router ignores
   them (it strips /\?(.*)/g before splitting).
   Sensitive fragment params (e.g. sbpassword)
   are appended to the same hash section.
   ════════════════════════════════════════════ */

/* ── State ──────────────────────────────────── */
let config = {};
let DEFAULTS = {};
let URL_SKIP = new Set();
let URL_FRAGMENT = new Set(); // params serialized into #hash instead of ?query
let SCHEMA = null;
let active = 'start';

/* ── Visited-tab completion ─────────────────── */
// A tab is "done" as soon as the user visits it.
// Persisted to localStorage so it survives reloads.
// Cleared when the user hits Reset.
let visitedTabs = new Set();

function markVisited(id) {
  visitedTabs.add(id);
  try { localStorage.setItem('websrc-visited-tabs', JSON.stringify([...visitedTabs])); } catch (e) { }
}

function loadVisitedTabs() {
  try {
    const raw = localStorage.getItem('websrc-visited-tabs');
    if (raw) visitedTabs = new Set(JSON.parse(raw));
  } catch (e) { visitedTabs = new Set(); }
}

function clearVisitedTabs() {
  visitedTabs = new Set();
  try { localStorage.removeItem('websrc-visited-tabs'); } catch (e) { }
}

// ── Schema snapshot ──────────────────────────
// Stores a fingerprint of each tab's field names so we can detect
// when a WebSRC update adds or removes fields in a tab.
// Shape: { [tabId]: "fieldA,fieldB,fieldC" }

// changedFields: Map<tabId, Set<fieldName>> — fields that are new since last visit.
// Populated when schema changes are detected; cleared when the user visits the tab.
let changedFields = new Map();

function buildSchemaSnapshot(schema) {
  // Stores field names as a sorted array per tab (JSON-serialisable Set equivalent).
  const snap = {};
  for (const g of (schema.nav || [])) {
    for (const item of (g.items || [])) {
      snap[item.id] = (schema.params || [])
        .filter(p => p.category === item.id && p.name)
        .map(p => p.name)
        .sort();
    }
  }
  return snap;
}

function saveSchemaSnapshot(snap) {
  try { localStorage.setItem('websrc-schema-snap', JSON.stringify(snap)); } catch (e) { }
}

function loadSchemaSnapshot() {
  try {
    const raw = localStorage.getItem('websrc-schema-snap');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// Compare the previous snapshot against the current one.
// Un-mark any tab whose field list has changed, and record which fields are new.
function unmarkChangedTabs(prevSnap, currentSnap) {
  if (!prevSnap) return; // first ever load — nothing to compare
  let anyChanged = false;
  for (const [tabId, currentFields] of Object.entries(currentSnap)) {
    const prevFields = new Set(prevSnap[tabId] || []);
    const newOnes = currentFields.filter(f => !prevFields.has(f));
    if (prevSnap[tabId] === undefined || JSON.stringify(prevSnap[tabId]) !== JSON.stringify(currentFields)) {
      visitedTabs.delete(tabId);
      anyChanged = true;
      if (newOnes.length) {
        changedFields.set(tabId, new Set(newOnes));
      }
    }
  }
  if (anyChanged) {
    try { localStorage.setItem('websrc-visited-tabs', JSON.stringify([...visitedTabs])); } catch (e) { }
  }
}

// Call when a tab is visited — clears its highlight state.
function clearChangedFields(tabId) {
  changedFields.delete(tabId);
}

// Returns true if this field name should be highlighted as new in the given tab.
function isFieldNew(tabId, fieldName) {
  return changedFields.has(tabId) && changedFields.get(tabId).has(fieldName);
}

/* ── Streamer.bot action search state ───────── */
let sbServerAddress = '127.0.0.1';
let sbServerPort = 8080;
let sdServerAddress = '127.0.0.1';
let sdServerPort = 3080;
window.sbConnectFailed = false;
window.sbActions = [];
window.actionDataList = [];

/* ── Helpers ────────────────────────────────── */
const $ = id => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function stripTags(input) {
  if (!input) return '';
  return String(input).replace(/<\/?[^>]+(>|$)/g, '');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let _toastTimer;
function toast(msg, type = 'info') {
  const el = $('toast');
  const msgEl = $('toast-msg');
  if (!el || !msgEl) return;
  msgEl.textContent = msg;
  el.dataset.type = type;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ── Routing mode detection ─────────────────── */
// Mirrors the same detection logic as Core.js.
// Returns true when the server is Apache (uses pathname routing),
// false when hash-routing is used.
function isApacheMode() {
  const serverMeta = document.querySelector('meta[name="papergrid-server"]');
  if (serverMeta !== null) {
    return serverMeta.getAttribute('content') === 'apache';
  }
  // Fall back to the cached value Core.js stored
  return localStorage.getItem('papergrid.apache') === 'true';
}

/* ── URL builder ────────────────────────────── */
function buildUrl() {
  const apache = isApacheMode();

  // Base URL — strip any existing query string and hash
  const base = window.location.href
    .split('?')[0]
    .split('#')[0];

  // Collect normal config params (non-fragment, non-skip)
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(config)) {
    if (v === '' || v == null) continue;
    if (URL_SKIP.has(k) || URL_FRAGMENT.has(k)) continue;
    if (k.startsWith('_')) continue;
    if (DEFAULTS[k] === v && k !== 'channel') continue;
    params.set(k, v);
  }

  // Collect sensitive / fragment params
  const fragParams = new URLSearchParams();
  for (const k of URL_FRAGMENT) {
    const v = config[k];
    if (v === '' || v == null) continue;
    fragParams.set(k, v);
  }

  const qs = params.toString();
  const fragQs = fragParams.toString();

  if (apache) {
    // ── Apache / pathname mode (original behaviour) ──────────────────────
    // Normal params go into ?query, sensitive params go into #fragment.
    // Example: /overlay?foo=bar#sbpassword=abc
    const url = qs ? base + '?' + qs : base;
    return fragQs ? url + '#' + fragQs : url;
  } else {
    // ── Hash-routing mode ────────────────────────────────────────────────
    // All params ride inside the hash so the Core.js router is not confused.
    // Core strips /\?(.*)/g from the hash before splitting on ':',
    // so embedding params as #?key=val is completely transparent to routing.
    //
    // Layout: base#?normalParam=val&anotherParam=val2&sensitiveParam=secret
    // Both normal and sensitive params are merged into the hash section.
    // The leading '?' is the signal to our parser (below) that these are
    // config params, not a hash-route segment.
    //
    // If there happen to be Core route segments before the params they would
    // look like: base#route:method?key=val — Core strips from '?' onward so
    // the route still resolves correctly.
    const allParams = new URLSearchParams(qs);
    // Merge fragment params into the same set
    for (const [k, v] of fragParams.entries()) allParams.set(k, v);
    const allQs = allParams.toString();
    // Preserve any existing Core route segments that sit before our params
    const existingHash = window.location.hash.split('?')[0]; // e.g. '#route:method' or '#'
    const hashBase = existingHash && existingHash !== '#' ? existingHash : '#';
    return allQs ? base + hashBase + '?' + allQs : base + (hashBase === '#' ? '' : hashBase);
  }
}

/* ── Parse current URL into config params ──── */
// Unified helper that reads config params from the right place depending
// on the routing mode.  Returns a plain object of { key: value }.
function parseUrlParams() {
  const result = {};
  const apache = isApacheMode();

  if (apache) {
    // Normal params in ?query
    new URLSearchParams(window.location.search).forEach((value, key) => {
      if (!key.startsWith('layer-') && DEFAULTS.hasOwnProperty(key)) {
        result[key] = normaliseToggle(value);
      }
    });
    // Sensitive params in #fragment
    const hashStr = window.location.hash.substring(1);
    if (hashStr) {
      new URLSearchParams(hashStr).forEach((value, key) => {
        if (!key.startsWith('layer-') && DEFAULTS.hasOwnProperty(key)) {
          result[key] = normaliseToggle(value);
        }
      });
    }
  } else {
    // Hash-routing mode: params are embedded as #?key=val
    // The hash may look like '#route:method?key=val' or just '#?key=val'.
    const hash = window.location.hash;
    const qIdx = hash.indexOf('?');
    if (qIdx !== -1) {
      new URLSearchParams(hash.substring(qIdx + 1)).forEach((value, key) => {
        if (!key.startsWith('layer-') && DEFAULTS.hasOwnProperty(key)) {
          result[key] = normaliseToggle(value);
        }
      });
    }
  }

  return result;
}

function normaliseToggle(value) {
  if (value === 'on') return 'true';
  if (value === 'off') return 'false';
  return value;
}

/* ── Apply ──────────────────────────────────── */
let _saveTimer, _frameTimer, _pushTimer;

function apply() {
  if (!SCHEMA) return;
  const url = buildUrl();
  const fullUrl = new URL(url, location.href).href;

  const urlTextEl = $('url-text');
  if (urlTextEl) urlTextEl.textContent = fullUrl;
  const dragEl = $('drag-handle');
  if (dragEl) dragEl.href = url;

  clearTimeout(_frameTimer);
  _frameTimer = setTimeout(() => {
    const frame = $('frame');
    if (frame && frame.src !== fullUrl) {
      frame.src = url;
    }
  }, 600);

  // Keep the browser URL bar in sync so the user can copy/paste it directly.
  // Debounced so rapid input changes don't spam history entries.
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    if (window.location.href !== fullUrl) {
      history.pushState({ config: { ...config } }, '', fullUrl);
    }
  }, 500);

  renderNav();

  $('save-txt').textContent = 'Saving…';
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { $('save-txt').textContent = 'All changes saved'; }, 400);

  try { localStorage.setItem('websrc-config', JSON.stringify(config)); } catch (e) { }
}

function copyUrl() {
  const full = new URL(buildUrl(), location.href).href;
  navigator.clipboard?.writeText(full).then(() => toast('Copied overlay URL to clipboard', 'success'));
}

/* ── Completeness ───────────────────────────── */
// A tab is done simply by having been visited.
function isDone(categoryId) {
  return visitedTabs.has(categoryId);
}

/* ── Feature gate ───────────────────────────── */
function featureAllowed(p) {
  const features = SCHEMA?.features || {};
  if (p.type === 'sbaction' && !features.streamerbot) return false;
  if (p.type === 'streamdeck' && !features.streamdeck) return false;
  if (p.feature && !features[p.feature]) return false;
  return true;
}

/* ── Icons ──────────────────────────────────── */
const ICONS = {
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  network: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="2.5" fill="currentColor" stroke="none"/><circle cx="20" cy="18" r="2.5" fill="currentColor" stroke="none"/><line x1="12" y1="5" x2="4" y2="18"/><line x1="12" y1="5" x2="20" y2="18"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 4l14 8-14 8V4z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-3z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1 0 1.5-.7 1.5-1.5 0-.3-.1-.7-.3-.9-.2-.3-.3-.5-.3-.9 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-5-4-9-9-9z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  monetize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M16 6C16 6 15 4 12 4C9 4 7 5.5 7 8C7 10.5 9.5 11.5 12 12"/><path d="M8 18C8 18 9 20 12 20C15 20 17 18.5 17 16C17 13.5 14.5 12.5 12 12"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  transfer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h14M14 5l3 3-3 3"/><path d="M21 16H7M10 13l-3 3 3 3"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><polyline points="7 11 12 16 17 11"/><path d="M3 19h18"/></svg>',
  listen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

/* ════════════════════════════════════════════
   FIELD RENDERERS
   ════════════════════════════════════════════ */
const FIELD_RENDER = {

  text(p) {
    const val = esc(config[p.name] ?? p.default ?? '');
    const pre = p.prefix ? `<div class="prefix">${esc(p.prefix)}</div>` : '';
    return `
      <div class="setting ${p.stacked !== false ? 'stacked' : ''}">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="setting-ctl">
          <div class="ti-prefix">
            ${pre}
            <input id="field-${esc(p.name)}"
                   value="${val}"
                   placeholder="${esc(p.placeholder || '')}"
                   autocomplete="off"
                   ${p.maxlength ? `maxlength="${p.maxlength}"` : ''}>
          </div>
        </div>
      </div>`;
  },

  toggle(p) {
    const on = config[p.name] === 'true';
    return `
      <div class="setting">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
          ${p.warn ? `<div class="setting-warn">${esc(p.warn)}</div>` : ''}
        </div>
        <div class="setting-ctl">
          <div class="tog ${on ? 'on' : ''}" id="field-${esc(p.name)}"></div>
        </div>
      </div>`;
  },

  number(p) {
    const val = config[p.name] ?? p.default ?? 0;
    const suffix = p.suffix
      ? `<span class="field-suffix">${esc(p.suffix)}</span>` : '';
    return `
      <div class="setting">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="setting-ctl">
          <div style="display:flex;align-items:center;gap:8px">
            <input class="ti w-sm" type="number"
                   id="field-${esc(p.name)}"
                   value="${val}"
                   min="${p.min ?? 0}"
                   ${p.max != null ? `max="${p.max}"` : ''}
                   step="${p.step ?? 1}"
                   placeholder="${esc(p.placeholder ?? '')}">
            ${suffix}
          </div>
        </div>
      </div>`;
  },

  range(p) {
    const val = config[p.name] ?? p.default ?? 0;
    const suffix = p.suffix ?? '';
    return `
      <div class="setting">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="setting-ctl">
          <div class="slider-wrap">
            <input type="range" class="slider"
                   id="field-${esc(p.name)}"
                   min="${p.min ?? 0}" max="${p.max ?? 100}" step="${p.step ?? 1}"
                   value="${val}">
            <span class="slider-val" id="field-${esc(p.name)}-val">${val}${esc(suffix)}</span>
          </div>
        </div>
      </div>`;
  },

  radio(p) {
    const cards = (p.options || []).map(o => `
      <div class="radio-card ${config[p.name] === o.value ? 'on' : ''}"
           data-field="${esc(p.name)}" data-v="${esc(o.value)}">
        <div class="dot"></div>
        <div>
          <div class="rlabel">${esc(o.label)}</div>
          <div class="rsub">${esc(o.sub || '')}</div>
        </div>
      </div>`).join('');
    return `
      <div class="setting stacked">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="setting-ctl">
          <div class="radio-grid" id="field-${esc(p.name)}">${cards}</div>
        </div>
      </div>`;
  },

  select(p) {
    const opts = (p.options || []).map(o => {
      const val = typeof o === 'object' ? o.value : o;
      const label = typeof o === 'object' ? o.label : o;
      const sel = String(config[p.name] ?? p.default ?? '') === String(val) ? 'selected' : '';
      const disabled = o.disabled ? 'disabled' : '';
      return `<option value="${esc(val)}" ${sel} ${disabled}>${esc(label)}</option>`;
    }).join('');
    return `
      <div class="setting">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="setting-ctl">
          <select id="field-${esc(p.name)}" class="select-field">
            ${p.placeholder ? `<option value="" disabled ${!config[p.name] ? 'selected' : ''}>${esc(p.placeholder)}</option>` : ''}
            ${opts}
          </select>
        </div>
      </div>`;
  },

  platform(p) {
    const m = p.meta || {};
    const val = esc(config[p.name] ?? '');
    return `
      <div class="plat-row">
        <div class="plat-icon" style="background:${esc(m.bg || '#888')};color:${esc(m.ink || '#fff')}">${esc(m.letter || '?')}</div>
        <div class="plat-info">
          <div class="n">${esc(p.label)}</div>
          <div class="s">${esc(p.desc || '')}</div>
        </div>
        <div class="plat-input">
          <input id="field-${esc(p.name)}"
                 value="${val}"
                 placeholder="${esc(p.placeholder || 'username')}"
                 autocomplete="off"
                 spellcheck="false">
        </div>
      </div>`;
  },

  colorpicker(p) {
    const swatches = (p.options || []).map(c => `
      <div class="color-swatch ${config[p.name] === c ? 'on' : ''}"
           data-field="${esc(p.name)}" data-c="${esc(c)}"
           style="background:${esc(c)}"></div>`).join('');
    return `
      <div class="setting stacked">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="setting-ctl">
          <div class="color-row" id="field-${esc(p.name)}">${swatches}</div>
        </div>
      </div>`;
  },

  color(p) {
    const val = config[p.name] ?? p.default ?? '#ffffff';
    return `
      <div class="setting">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="setting-ctl">
          <input type="color" id="field-${esc(p.name)}" value="${esc(val)}" class="color-native">
        </div>
      </div>`;
  },

  colorpalette(p) {
    const stored = config[p.name] ?? p.default ?? '';
    const colors = stored ? String(stored).split(',').map(c => c.trim()).filter(Boolean) : [];
    const max = p.max ?? 14;
    const swatchHtml = colors.map(c => `
      <div class="palette-color">
        <input type="color" value="${esc(c)}" data-palette="${esc(p.name)}">
        <button type="button" class="palette-remove ${colors.length <= 1 ? 'hidden' : ''}" title="Remove color">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>`).join('');
    return `
      <div class="setting stacked" id="palette-wrap-${esc(p.name)}">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="setting-ctl">
          <div class="color-palette" id="field-${esc(p.name)}" data-max="${max}">
            ${swatchHtml}
            <button type="button" class="palette-add-btn ${colors.length >= max ? 'hidden' : ''}" data-palette="${esc(p.name)}" title="Add color">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
      </div>`;
  },

  sbaction(p) {
    const savedId = config[p.name] ?? p.default ?? '';
    const hasValue = !!savedId;
    const initValue = hasValue && !window.actionDataList?.length
      ? ''
      : (window.actionDataList?.find(a => a.id === savedId)?.name ?? '');
    return `
      <div class="setting stacked sb-action-field">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
          ${hasValue ? `<div class="setting-desc sb-saved-hint" id="field-${esc(p.name)}-hint">
            Action saved — reload actions to show name
          </div>` : ''}
        </div>
        <div class="setting-ctl">
          <div class="search-wrap">
            <div class="search-box">
              <span class="search-icon">${ICONS.search}</span>
              <input type="text"
                     class="search-field"
                     id="field-${esc(p.name)}-search"
                     data-target="${esc(p.name)}"
                     value="${esc(initValue)}"
                     placeholder="${esc(p.placeholder || 'Search Streamer.bot actions…')}"
                     autocomplete="off">
              <div class="search-autocomplete" id="field-${esc(p.name)}-ac"></div>
            </div>
            <div class="search-btns">
              <button type="button" class="btn-sm sbactions-reload" id="sb-reload-${esc(p.name)}">Reload Actions</button>
              ${p.test ? `<button type="button" class="btn-sm sbaction-test"
                  id="sb-test-${esc(p.name)}"
                  data-target="${esc(p.name)}"
                  data-tests="${esc(JSON.stringify(p.test))}">Send Test</button>` : ''}
            </div>
            <input type="hidden" id="field-${esc(p.name)}" value="${esc(savedId)}">
          </div>
        </div>
      </div>`;
  },

  streamdeck(p) {
    const marketplace = p.marketplace || 'https://marketplace.elgato.com/product/websrc-integration-35520e81-5c8d-4ebe-b187-a4e2a6e06dbe';
    const github = p.github || 'https://github.com/TheLiveitup34/Stream-Deck-Integration/releases/latest/download/com.theliveitup34.websrc-integration.streamDeckPlugin';
    return `
      <div class="setting stacked sd-setting">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="setting-ctl sd-ctl">
          <button type="button" class="btn-sm" id="field-${esc(p.name)}-btn">
            ${ICONS.settings} <span>Update Stream Deck</span>
          </button>
          <div class="sd-links">
            <a href="${esc(marketplace)}" target="_blank" rel="noopener noreferrer" class="sd-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              Elgato Marketplace
            </a>
            <a href="${esc(github)}" target="_blank" rel="noopener noreferrer" class="sd-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
              GitHub Release
            </a>
          </div>
        </div>
      </div>`;
  },

  sbimport(p) {
    if (!p.code) return '';
    return `
      <div class="setting stacked sbimport-setting">
        <div class="setting-info">
          <div class="setting-label">${esc(p.label)}</div>
          ${p.desc ? `<div class="setting-desc">${esc(p.desc)}</div>` : ''}
        </div>
        <div class="sbimport-ctl">
          <div class="sbimport-code" id="field-${esc(p.name)}-code">${esc(p.code)}</div>
          <button type="button" class="btn-sm sbimport-copy" id="field-${esc(p.name)}-btn" data-code="${esc(p.code)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy code
          </button>
        </div>
      </div>`;
  },

  command(p) {
    const cmd = p.cmd || p.name;
    const roleParam = p.roleParam;
    const currentRole = roleParam ? (config[roleParam] ?? p.defaultRole ?? 'user') : (p.defaultRole ?? 'user');
    const roleLabels = {
      user: 'Everyone', subscriber: 'Subscribers+', vip: 'VIPs+',
      moderator: 'Moderators+', broadcaster: 'Broadcaster only'
    };
    const affectedByRole = !!roleParam;
    const roleBadge = affectedByRole
      ? `<span class="cmd-badge role">${esc(roleLabels[currentRole] || currentRole)}</span>`
      : `<span class="cmd-badge fixed">${esc(roleLabels[p.defaultRole] || (p.defaultRole ?? 'Everyone'))}</span>`;
    const lockedBadge = affectedByRole
      ? `<span class="cmd-badge affected" title="Affected by Role Lock setting">Role locked</span>`
      : `<span class="cmd-badge static" title="This command's access is fixed">Fixed access</span>`;
    return `
      <div class="cmd-row">
        <div class="cmd-name">!${esc(config[cmd] ?? p.default ?? cmd)}</div>
        <div class="cmd-meta">
          ${roleBadge}
          ${lockedBadge}
          ${p.desc ? `<span class="cmd-desc">${esc(p.desc)}</span>` : ''}
        </div>
      </div>`;
  },

  navbtn(p) {
    if (!p.target) return '';
    return `
      <div style="margin:8px 0 12px">
        <button type="button" class="step-btn primary" id="navbtn-${esc(p.name)}" style="width:100%">
          ${esc(p.label)}
        </button>
        ${p.desc ? `<p class="setting-desc" style="margin-top:8px">${esc(p.desc)}</p>` : ''}
      </div>`;
  },

  link(p) {
    if (!p.url) return '';
    const icon = p.icon && ICONS[p.icon] ? `<span style="display:inline-flex;align-items:center;margin-inline-end:6px;vertical-align:middle">${ICONS[p.icon]}</span>` : '';
    return `
      <div class="setting stacked">
        <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="btn-sm setting-link-btn"
           style="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;text-decoration:none;border-radius:8px;">
          ${icon}<span>${esc(p.label)}</span>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" style="opacity:.6"><path d="M7 3h10v10"/><path d="M17 3 7 13"/></svg>
        </a>
        ${p.desc ? `<div class="setting-desc" style="margin-top:6px">${esc(p.desc)}</div>` : ''}
      </div>`;
  },

  info(p) {
    console.log('Rendering info block', p);
    return `
      <div class="setting-info-block ${p.highlight ? 'highlight' : ''}">
        ${p.label ? `<strong>${esc(p.label)}</strong>` : ''}
        ${p.desc ? `<p>${esc(p.desc).replace(/\r?\n|\r/g, '<br>')}</p>` : ''}
        ${p.links ? `<div class="info-links">${p.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join(' | ')}</div>` : ''}
      </div>`;
  },

  header(p) {
    return `
      <div class="settings-header">
        <h2>${esc(p.label)}</h2>
        ${p.desc ? `<small>${esc(p.desc)}</small>` : ''}
      </div>`;
  },

  collapsable(p) {
    const id = `collapse-${esc(p.name)}`;
    const children = (p.children || []).map(cp => {
      if (!featureAllowed(cp)) return '';
      const r = FIELD_RENDER[cp.type];
      return r ? r(cp) : '';
    }).join('');
    return `
      <div class="settings-collapsable" data-target="${id}">
        <h3>${esc(p.label)}</h3>
        <span class="arrow">&#9660;</span>
      </div>
      <div class="collapsable-content" id="${id}">
        ${children}
      </div>`;
  },
};

/* ════════════════════════════════════════════
   FIELD WIRERS
   ════════════════════════════════════════════ */
const FIELD_WIRE = {

  text(p) {
    const el = $(`field-${p.name}`);
    if (!el) return;
    el.addEventListener('input', e => {
      let v = e.target.value;
      if (p.sanitize === 'alphanumeric') v = v.replace(/[^a-zA-Z0-9_]/g, '');
      config[p.name] = p.trim !== false ? v.trim() : v;
      const echo = $(`field-${p.name}-echo`);
      if (echo) echo.textContent = config[p.name];
      apply();
    });
  },

  toggle(p) {
    const el = $(`field-${p.name}`);
    if (!el) return;
    el.addEventListener('click', () => {
      config[p.name] = config[p.name] === 'true' ? 'false' : 'true';
      el.classList.toggle('on', config[p.name] === 'true');
      apply();
    });
  },

  number(p) {
    const el = $(`field-${p.name}`);
    if (!el) return;
    el.addEventListener('input', e => {
      const v = p.step && String(p.step).includes('.')
        ? parseFloat(e.target.value)
        : parseInt(e.target.value, 10);
      config[p.name] = isNaN(v) ? (p.default ?? 0) : v;
      apply();
    });
  },

  range(p) {
    const el = $(`field-${p.name}`);
    const val = $(`field-${p.name}-val`);
    if (!el) return;
    const suffix = p.suffix ?? '';
    const pct = ((config[p.name] ?? p.default ?? 0) - (p.min ?? 0)) /
      ((p.max ?? 100) - (p.min ?? 0)) * 100;
    el.style.setProperty('--slider-pct', pct + '%');
    el.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      config[p.name] = v;
      if (val) val.textContent = v + suffix;
      const pct2 = (v - (p.min ?? 0)) / ((p.max ?? 100) - (p.min ?? 0)) * 100;
      el.style.setProperty('--slider-pct', pct2 + '%');
      apply();
    });
  },

  radio(p) {
    document.querySelectorAll(`.radio-card[data-field="${p.name}"]`).forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll(`.radio-card[data-field="${p.name}"]`)
          .forEach(c => c.classList.remove('on'));
        el.classList.add('on');
        config[p.name] = el.dataset.v;
        apply();
      });
    });
  },

  select(p) {
    const el = $(`field-${p.name}`);
    if (!el) return;
    el.addEventListener('change', e => {
      config[p.name] = e.target.value;
      apply();
    });
  },

  platform(p) {
    const el = $(`field-${p.name}`);
    if (!el) return;
    el.addEventListener('input', e => {
      config[p.name] = e.target.value.trim();
      apply();
    });
  },

  colorpicker(p) {
    document.querySelectorAll(`.color-swatch[data-field="${p.name}"]`).forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll(`.color-swatch[data-field="${p.name}"]`)
          .forEach(s => s.classList.remove('on'));
        el.classList.add('on');
        config[p.name] = el.dataset.c;
        apply();
      });
    });
  },

  color(p) {
    const el = $(`field-${p.name}`);
    if (!el) return;
    el.addEventListener('input', e => {
      config[p.name] = e.target.value;
      apply();
    });
  },

  colorpalette(p) {
    const wrap = $(`field-${p.name}`);
    if (!wrap) return;

    function readPalette() {
      return [...wrap.querySelectorAll('input[type="color"]')]
        .map(i => i.value).filter(Boolean);
    }

    function syncPalette() {
      config[p.name] = readPalette().join(',');
      apply();
    }

    function refreshRemoveButtons() {
      const btns = wrap.querySelectorAll('.palette-remove');
      btns.forEach(b => b.classList.toggle('hidden', btns.length <= 1));
    }

    function wireNewSwatch(swatch) {
      swatch.querySelector('input[type="color"]').addEventListener('input', syncPalette);
      swatch.querySelector('.palette-remove').addEventListener('click', () => {
        const swatches = wrap.querySelectorAll('.palette-color');
        if (swatches.length <= 1) { toast('At least one color must remain', 'warning'); return; }
        swatch.remove();
        refreshRemoveButtons();
        wrap.querySelector('.palette-add-btn')?.classList.remove('hidden');
        syncPalette();
      });
    }

    wrap.querySelectorAll('.palette-color').forEach(s => wireNewSwatch(s));

    const addBtn = wrap.querySelector('.palette-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const current = wrap.querySelectorAll('.palette-color');
        const max = parseInt(wrap.dataset.max ?? 14);
        if (current.length >= max) { toast(`Maximum of ${max} colors reached`, 'warning'); return; }
        const swatch = document.createElement('div');
        swatch.className = 'palette-color';
        swatch.innerHTML = `
          <input type="color" value="#ffffff" data-palette="${esc(p.name)}">
          <button type="button" class="palette-remove" title="Remove color">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>`;
        addBtn.insertAdjacentElement('beforebegin', swatch);
        wireNewSwatch(swatch);
        refreshRemoveButtons();
        if (wrap.querySelectorAll('.palette-color').length >= max) {
          addBtn.classList.add('hidden');
        }
        syncPalette();
      });
    }
  },

  navbtn(p) {
    const btn = document.getElementById(`navbtn-${p.name}`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      active = p.target;
      renderNav();
      renderCfg();
    });
  },

  sbimport(p) {
    const btn = document.getElementById(`field-${p.name}-btn`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const code = btn.dataset.code || '';
      navigator.clipboard?.writeText(code).then(() => {
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
          btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy code`;
        }, 2000);
      }).catch(() => toast('Copy failed — select and copy manually', 'error'));
    });
  },

  sbaction(p) {
    const searchEl = $(`field-${p.name}-search`);
    const acEl = $(`field-${p.name}-ac`);
    const hiddenEl = $(`field-${p.name}`);
    const hintEl = $(`field-${p.name}-hint`);
    const reloadBtn = $(`sb-reload-${p.name}`);
    const testBtn = $(`sb-test-${p.name}`);
    if (!searchEl) return;

    function resolveStoredId() {
      const id = hiddenEl?.value || config[p.name] || p.default || '';
      if (!id || !window.actionDataList?.length) return;
      const action = window.actionDataList.find(a => a.id === id);
      if (action) {
        searchEl.value = action.name;
        if (hintEl) hintEl.style.display = 'none';
      }
    }

    if (window.actionDataList?.length) resolveStoredId();

    let searchTimeout;

    searchEl.addEventListener('focus', () => {
      if (acEl && acEl.children.length > 0) acEl.classList.add('show');
    });
    searchEl.addEventListener('blur', () => {
      setTimeout(() => acEl?.classList.remove('show'), 200);
    });

    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      if (window.sbConnectFailed) {
        searchTimeout = setTimeout(() => toast('Failed to connect to Streamer.bot. Reload actions and try again.', 'error'), 500);
        return;
      }
      if (!window.sbActions?.length) {
        searchTimeout = setTimeout(() => toast('No actions loaded. Click Reload Actions.', 'warning'), 500);
        return;
      }
      searchTimeout = setTimeout(() => {
        const q = searchEl.value.trim().toLowerCase();
        if (!q) {
          if (acEl) acEl.innerHTML = '';
          acEl?.classList.remove('show');
          if (hiddenEl) hiddenEl.value = '';
          config[p.name] = '';
          apply();
          return;
        }
        const results = window.sbActions
          .filter(n => n.toLowerCase().includes(q))
          .slice(0, 20);
        if (!acEl) return;
        acEl.innerHTML = '';
        if (!results.length) {
          acEl.innerHTML = '<div class="ac-none">No results found</div>';
          acEl.classList.add('show');
          return;
        }
        acEl.classList.add('show');
        results.forEach(name => {
          const div = document.createElement('div');
          div.textContent = name;
          div.addEventListener('click', () => {
            searchEl.value = name;
            acEl.innerHTML = '';
            acEl.classList.remove('show');
            if (hintEl) hintEl.style.display = 'none';
            const action = (window.actionDataList || []).find(a => a.name === name);
            if (action && hiddenEl) {
              hiddenEl.value = action.id;
              config[p.name] = action.id;
              apply();
            }
          });
          acEl.appendChild(div);
        });
      }, 400);
    });

    if (reloadBtn) {
      reloadBtn.addEventListener('click', async () => {
        if (reloadBtn.disabled) return;
        reloadBtn.disabled = true;
        await updateSearchActions();
        resolveStoredId();
        reloadBtn.disabled = false;
      });
    }

    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        if (testBtn.disabled) return;
        testBtn.disabled = true;
        let tests = testBtn.dataset.tests;
        try { tests = JSON.parse(tests); } catch (e) { tests = {}; }
        if (Array.isArray(tests)) {
          tests = tests[Math.floor(Math.random() * tests.length)];
        }
        const actionId = hiddenEl?.value || config[p.name] || p.default || '';
        if (!actionId) { toast('No action selected to test', 'error'); testBtn.disabled = false; return; }
        await sendSbAction({ host: sbServerAddress, port: sbServerPort, actionId, args: tests });
        testBtn.disabled = false;
      });
    }
  },

  streamdeck(p) {
    const btn = $(`field-${p.name}-btn`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const port = config['sdport'] || sdServerPort;
      if (!port || isNaN(port)) { toast('Invalid StreamDeck port', 'error'); return; }
      const deeplink = `streamdeck://plugins/message/com.theliveitup34.websrc-integration/updateSettings?streamdeck=hidden&port=${port}`;

      btn.disabled = true;
      toast('Sending port update to Stream Deck…', 'info');
      window.location.href = deeplink;

      let attempts = 0;
      const maxAttempts = 20;
      const retryDelay = 1500;
      const startDelay = 3000;
      let interval;

      function probe() {
        attempts++;
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.onopen = () => {
          clearInterval(interval);
          ws.close();
          btn.disabled = false;
          toast('Stream Deck updated successfully', 'success');
        };
        ws.onerror = () => {
          ws.close();
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            btn.disabled = false;
            toast('Stream Deck did not respond in time. Check the app is running and try again.', 'error');
          }
        };
      }

      setTimeout(() => {
        probe();
        interval = setInterval(probe, retryDelay);
      }, startDelay);
    });
  },

  collapsable(p) {
    const id = `collapse-${p.name}`;
    const hdr = document.querySelector(`[data-target="${id}"]`);
    const body = $(`${id}`);
    if (hdr && body) {
      hdr.addEventListener('click', () => {
        body.classList.toggle('active');
        const arrow = hdr.querySelector('.arrow');
        if (arrow) arrow.innerHTML = body.classList.contains('active') ? '&#9650;' : '&#9660;';
      });
    }
    (p.children || []).forEach(cp => {
      if (!featureAllowed(cp)) return;
      const w = FIELD_WIRE[cp.type];
      if (w) w(cp);
    });
  },

  info() { },
  header() { },
  command() { },
};

/* ════════════════════════════════════════════
   Panel render
   ════════════════════════════════════════════ */
function renderCfg() {
  if (!SCHEMA) {
    $('cfg').innerHTML = `<div class="cfg-inner"><div class="cfg-header"><h1>Loading…</h1></div></div>`;
    return;
  }

  // Mark the current tab as visited and immediately refresh the nav
  // so the checkmark appears on this visit, not the next one.
  markVisited(active);
  renderNav();

  if (active === 'start') { renderStartPanel(); return; }

  let navItem = null, crumb = '';
  for (const g of SCHEMA.nav) {
    const found = g.items.find(i => i.id === active);
    if (found) { navItem = found; crumb = g.group; break; }
  }
  if (!navItem) {
    active = SCHEMA.nav[0]?.items[0]?.id || 'start';
    markVisited(active);
    if (active === 'start') { renderStartPanel(); return; }
    for (const g of SCHEMA.nav) {
      const found = g.items.find(i => i.id === active);
      if (found) { navItem = found; crumb = g.group; break; }
    }
  }
  if (!navItem) return;

  const items = SCHEMA.params.filter(p => p.category === active);

  const fieldsHtml = items.map(p => {
    if (!featureAllowed(p)) return '';
    const r = FIELD_RENDER[p.type];
    if (!r) return '';
    const html = r(p);
    // Wrap newly-added fields in a highlight container so the user can spot them.
    if (p.name && isFieldNew(active, p.name)) {
      return `<div class="field-new-wrap">${html}<div class="field-new-badge">New</div></div>`;
    }
    return html;
  }).join('');

  // Clear highlight state now that the user is seeing this tab.
  clearChangedFields(active);

  $('cfg').innerHTML = `
    <div class="cfg-inner">
      <div class="cfg-header">
        <div class="crumb">${esc(crumb)}</div>
        <h1>${esc(navItem.label)}</h1>
        ${navItem.sub ? `<p>${esc(navItem.sub)}</p>` : ''}
      </div>
      ${fieldsHtml}
    </div>`;

  items.forEach(p => {
    if (!featureAllowed(p)) return;
    const w = FIELD_WIRE[p.type];
    if (w) w(p);
  });
}

/* ── Start panel ────────────────────────────── */
function renderStartPanel() {
  const connectionsId = (() => {
    if (!SCHEMA) return 'integrations';
    for (const g of SCHEMA.nav) {
      const found = g.items.find(i => i.id === 'integrations');
      if (found) return found.id;
    }
    for (const g of SCHEMA.nav) {
      const found = g.items.find(i => i.id !== 'start');
      if (found) return found.id;
    }
    return 'integrations';
  })();

  const sbEnabled = config.streamerbot === true || config.streamerbot === 'true';
  const sbConfigured = sbEnabled && config.address && config.address.trim() !== '' && config.address !== '127.0.0.1';
  const hasConnection =
    sbConfigured ||
    (typeof config.twitch === 'string' && config.twitch.trim() !== '') ||
    (typeof config.kick === 'string' && config.kick.trim() !== '') ||
    (config.tiktok === true || config.tiktok === 'true');

  const hasUrl = Object.keys(config).some(k => {
    if (k.startsWith('_')) return false;
    const def = DEFAULTS[k];
    return config[k] !== '' && config[k] != null && config[k] !== def;
  });

  const step = (done, num, title, desc, actions) => `
    <div class="step ${done ? 'done' : ''}">
      <div class="step-num">${done ? '✓' : num}</div>
      <div>
        <div class="step-title">${title}</div>
        <div class="step-desc">${desc}</div>
        <div class="step-actions">${actions}</div>
      </div>
    </div>`;

  const doneCount = [hasConnection, hasUrl].filter(Boolean).length;
  const total = 2;
  const pct = Math.round((doneCount / total) * 100);

  $('cfg').innerHTML = `
    <div class="cfg-inner">
      <div class="cfg-header">
        <div class="crumb">Setup</div>
        <h1>Welcome! Let's set up your overlay</h1>
        <p>This should only take a minute. You can jump to any section from the menu on the left.</p>
      </div>
      <div class="guide">
        <div class="guide-head">
          <span class="guide-tag">Quick start</span>
          <h3>${total} things to do</h3>
          <span class="guide-progress"><span id="gp">${doneCount}</span>/${total} complete</span>
        </div>
        <div class="guide-bar"><div class="fill" style="width:${pct}%"></div></div>
        ${step(hasConnection, 1,
    'Connect to a chat source',
    'Enter your Twitch or Kick username, enable Streamer.bot, or connect TikFinity — you only need one to get started.',
    `<button class="step-btn primary" data-go="${connectionsId}">Go to Connections →</button>`
  )}
        ${step(hasUrl, 2,
    'Copy the overlay URL into OBS',
    'Add it as a Browser Source. The URL updates automatically as you change settings.',
    `<button class="step-btn primary" id="btn-copy-inline">📋 Copy overlay URL</button>`
  )}
      </div>
    </div>`;

  document.querySelectorAll('[data-go]').forEach(b =>
    b.addEventListener('click', () => { active = b.dataset.go; renderNav(); renderCfg(); })
  );
  $('btn-copy-inline')?.addEventListener('click', copyUrl);
}

/* ── Nav render ─────────────────────────────── */
function renderNav() {
  if (!SCHEMA) return;
  $('nav').innerHTML = SCHEMA.nav.map(g => `
    <div class="nav-group">
      <span>${esc(g.group)}</span>
      <span class="pct">${g.items.filter(i => isDone(i.id)).length}/${g.items.length}</span>
    </div>
    ${g.items.map(it => `
      <div class="nav-item ${active === it.id ? 'active' : ''} ${isDone(it.id) ? 'done' : ''}" data-id="${it.id}">
        <span class="ico">${ICONS[it.icon] || ''}</span>
        <span>${esc(it.label)}</span>
        <span class="check">✓</span>
      </div>`).join('')}
  `).join('');

  $('nav').querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (active === id) {
        setCfgClosed(!shellEl.classList.contains('cfg-closed'));
      } else {
        active = id;
        renderNav();
        renderCfg();
        if (shellEl.classList.contains('cfg-closed')) setCfgClosed(false);
      }
    });
  });
}

/* ════════════════════════════════════════════
   Streamer.bot helpers
   ════════════════════════════════════════════ */
async function fetchSbActionList(options = {}) {
  const opts = { host: sbServerAddress, port: sbServerPort, ...options };
  try {
    const client = new StreamerbotClient({
      host: opts.host, port: opts.port, autoReconnect: false, immediate: false
    });
    await client.connect();
    await new Promise(r => setTimeout(r, 1000));
    const actions = await client.getActions();
    window.sbConnectFailed = false;
    setTimeout(() => client.disconnect(), 5000);
    return actions;
  } catch (err) {
    console.error('[modify] SB connect failed:', err);
    window.sbConnectFailed = true;
    toast('Could not connect to Streamer.bot. Check your settings.', 'error');
    return [];
  }
}

async function sendSbAction(options = {}) {
  const opts = { host: sbServerAddress, port: sbServerPort, actionId: null, args: {}, ...options };
  if (!opts.actionId) { toast('No action ID provided', 'error'); return; }
  try {
    const client = new StreamerbotClient({
      host: opts.host, port: opts.port, autoReconnect: false, immediate: false
    });
    await client.connect();
    await new Promise(r => setTimeout(r, 1000));
    await client.doAction(opts.actionId, opts.args);
    window.sbConnectFailed = false;
    toast('Test sent to Streamer.bot', 'success');
    setTimeout(() => client.disconnect(), 5000);
  } catch (err) {
    window.sbConnectFailed = true;
    toast('Could not connect to Streamer.bot', 'error');
  }
}

async function updateSearchActions() {
  const result = await fetchSbActionList({ host: sbServerAddress, port: sbServerPort });
  if (!result?.actions) return;
  const list = result.actions.map(a => ({ name: a.name, id: a.id }));
  window.actionDataList = list;
  window.sbActions = list.map(a => a.name);
  toast(`Loaded ${list.length} actions from Streamer.bot`, 'success');
}

/* ════════════════════════════════════════════
   postMessage listener
   ════════════════════════════════════════════ */
let _schemaReceived = false;
window.addEventListener('message', e => {
  let expectedOrigin = "";

  if (window.location.hostname.endsWith(".localhost")) {
    expectedOrigin = "http://websrc.theliveitup34.localhost";
  } else {
    expectedOrigin = "https://websrc.theliveitup34.com";
  }

  // Exact string match check
  if (e.origin !== expectedOrigin) {
    return;
  }
  if (e.data?.type !== 'OVERLAY_READY') return;
  if (_schemaReceived) return;
  // validate payload came from the overlay and is a valid schema object
  if (!e.data.payload || typeof e.data.payload !== 'object' || !Array.isArray(e.data.payload.params)) return;
  _schemaReceived = true;

  SCHEMA = e.data.payload;

  DEFAULTS = {};
  URL_SKIP = new Set();
  URL_FRAGMENT = new Set();

  const _displayOnlyTypes = new Set(['header', 'info', 'command', 'streamdeck']);

  function collectDefaults(params) {
    (params || []).forEach(p => {
      if (p.type === 'collapsable') {
        collectDefaults(p.children);
      } else if (p.urlFragment === true) {
        URL_FRAGMENT.add(p.name);
        DEFAULTS[p.name] = p.default ?? '';
      } else if (_displayOnlyTypes.has(p.type) || p.urlSkip === true || (p.name && p.name.startsWith('_'))) {
        URL_SKIP.add(p.name);
      } else {
        let def = p.default ?? '';
        if (p.type === 'toggle') {
          def = (def === true || def === 'on' || def === '1' || def === 1) ? 'true' : 'false';
        }
        DEFAULTS[p.name] = def;
      }
    });
  }
  collectDefaults(SCHEMA.params);

  if (DEFAULTS.address) sbServerAddress = DEFAULTS.address;
  if (DEFAULTS.port) sbServerPort = DEFAULTS.port;
  if (DEFAULTS.sdip) sdServerAddress = DEFAULTS.sdip;
  if (DEFAULTS.sdport) sdServerPort = DEFAULTS.sdport;

  // Merge: defaults → localStorage → URL params (highest priority)
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('websrc-config') || '{}'); } catch (e) { }
  config = { ...DEFAULTS, ...saved };

  // Apply URL params using the routing-aware parser
  const urlParams = parseUrlParams();
  Object.assign(config, urlParams);

  // Re-sync server addresses from final merged config
  if (config.address) sbServerAddress = config.address;
  if (config.port) sbServerPort = Number(config.port);
  if (config.sdip) sdServerAddress = config.sdip;
  if (config.sdport) sdServerPort = Number(config.sdport);

  // Load persisted visited-tab state, then un-mark any tabs whose
  // field list has changed since the user last saw them.
  loadVisitedTabs();
  const currentSnap = buildSchemaSnapshot(SCHEMA);
  const prevSnap = loadSchemaSnapshot();
  unmarkChangedTabs(prevSnap, currentSnap);
  saveSchemaSnapshot(currentSnap);

  renderNav();
  renderCfg();
  apply();
});

/* ── Loading state ──────────────────────────── */
function renderLoading() {
  $('nav').innerHTML = `<div class="nav-group"><span>Loading…</span></div>`;
  $('cfg').innerHTML = `
    <div class="cfg-inner">
      <div class="cfg-header">
        <h1>Connecting to overlay…</h1>
        <p>Waiting for the overlay to report its settings.</p>
      </div>
    </div>`;
}

/* ── Shell / layout ─────────────────────────── */
const shellEl = $('shell');

function setNavClosed(closed) {
  shellEl.classList.toggle('nav-closed', closed);
  try { localStorage.setItem('websrc-nav-closed', closed ? '1' : '0'); } catch (e) { }
}
function setCfgClosed(closed) {
  shellEl.classList.toggle('cfg-closed', closed);
  try { localStorage.setItem('websrc-cfg-closed', closed ? '1' : '0'); } catch (e) { }
}

/* ── Top-bar ────────────────────────────────── */
$('btn-reset')?.addEventListener('click', () => {
  if (!confirm('Reset all settings to defaults?')) return;
  config = { ...DEFAULTS };
  clearVisitedTabs();
  try { localStorage.removeItem('websrc-config'); } catch (e) { }
  renderNav(); renderCfg(); apply();
  toast('Reset to defaults', 'info');
});

$('btn-copy-top')?.addEventListener('click', copyUrl);
$('url-box')?.addEventListener('click', copyUrl);

$('drag-handle')?.addEventListener('dragstart', e => {
  const url = buildUrl();
  const app = SCHEMA?.meta?.app || 'Overlay';
  const full = new URL(
    url + (url.includes('?') ? '&' : '?') +
    'layer-name=' + encodeURIComponent(app) +
    '&layer-width=1920&layer-height=1080',
    location.href
  ).href;
  e.dataTransfer.effectAllowed = 'copyLink';
  try { e.dataTransfer.setData('text/uri-list', full); } catch (_) { }
  try { e.dataTransfer.setData('text/plain', full); } catch (_) { }
  try { e.dataTransfer.setData('text/x-moz-url', `${full}\n${app}`); } catch (_) { }
  toast('Drag onto OBS to add as a Browser Source');
});
$('drag-handle')?.addEventListener('click', e => { e.preventDefault(); copyUrl(); });

$('nav-toggle')?.addEventListener('click', () => {
  setNavClosed(!shellEl.classList.contains('nav-closed'));
  setCfgClosed(true);
});
$('cfg-reopen')?.addEventListener('click', () =>
  setCfgClosed(!shellEl.classList.contains('cfg-closed'))
);

/* ── Restore layout state ───────────────────── */
try { if (localStorage.getItem('websrc-nav-closed') === '1') setNavClosed(true); } catch (e) { }
try { if (localStorage.getItem('websrc-cfg-closed') === '1') setCfgClosed(true); } catch (e) { }

/* ── popstate — back/forward restores config ─ */
window.addEventListener('popstate', e => {
  if (!SCHEMA) return;

  if (e.state?.config) {
    config = { ...DEFAULTS, ...e.state.config };
  } else {
    config = { ...DEFAULTS };
    // Use the routing-aware parser instead of hardcoded window.location.search
    Object.assign(config, parseUrlParams());
  }

  if (config.address) sbServerAddress = config.address;
  if (config.port) sbServerPort = Number(config.port);
  if (config.sdip) sdServerAddress = config.sdip;
  if (config.sdport) sdServerPort = Number(config.sdport);

  renderNav();
  renderCfg();
  const url = buildUrl();
  const fullUrl = new URL(url, location.href).href;
  const urlTextEl = $('url-text');
  if (urlTextEl) urlTextEl.textContent = fullUrl;
  const dragEl = $('drag-handle');
  if (dragEl) dragEl.href = url;
  const frame = $('frame');
  if (frame && frame.src !== fullUrl) frame.src = url;
  try { localStorage.setItem('websrc-config', JSON.stringify(config)); } catch (e) { }
});

/* ── Init ───────────────────────────────────── */
renderLoading();

const _initFrame = $('frame');
if (_initFrame) {

  // Rebuild the base URL + the route hash
  _initFrame.src = window.location.href.split('#')[0].split('?')[0];
}