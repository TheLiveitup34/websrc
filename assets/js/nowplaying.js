/**
 * Now Playing Widget — WebSRC
 * Receives NowPlaying broadcasts from the C# Streamer.bot action.
 */

/* ── WebSRC init ────────────────────────────────────────────────────────────── */
const ws = new WebSRC({
    platforms: ['streamerbot'],
    streamerbot: { disableOnTwitchChat: false, disableOnKickChat: false },
    emotes: { autoload: false }
});

/* ═══════════════════════════════════════════════════════════════════════════════
   SETTINGS  (ws.get returns the current URL-param value, or the default)
   Registering here builds the modify-panel UI automatically.
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ── Widget info header ────────────────────────────────────────────────────── */
ws.get('_np_header', null, 'string', {
    uiType: 'header',
    label: 'Now Playing',
    desc: 'Displays the currently playing song from any Windows media player (Spotify, YouTube Music, Apple Music, VLC, browser tabs…) via the Windows System Media Transport Controls.',
    category: 'nowplaying',
    urlSkip: true
});

/* ── Appearance ─────────────────────────────────────────────────────────────── */
ws.get('_np_appearance_header', null, 'string', {
    uiType: 'header',
    label: 'Appearance',
    desc: 'Choose a visual style for the widget.',
    category: 'nowplaying',
    urlSkip: true
});

const npStyle = ws.get('npStyle', 'default', 'string', {
    uiType: 'select',
    label: 'Widget style',
    options: [
        { value: 'default', label: 'Default  —  solid dark card' },
        { value: 'glass', label: 'Glass    —  frosted translucent card' },
        { value: 'neon', label: 'Neon     —  black with glowing border' },
        { value: 'minimal', label: 'Minimal  —  flat, no effects' },
        { value: 'none', label: 'None     —  no card background at all' }
    ],
    category: 'nowplaying'
});

const npDiscMode = ws.get('npDiscMode', 'vinyl', 'string', {
    uiType: 'select',
    label: 'Disc / image mode',
    options: [
        { value: 'vinyl', label: 'Vinyl disc  —  spinning record with grooves' },
        { value: 'image', label: 'Static image  —  album art fills the disc area' },
        { value: 'image-detached', label: 'Detached image  —  album art floats beside the card' }
    ],
    category: 'nowplaying'
});

const npDisableDynColor = ws.get('npDisableDynColor', false, 'boolean', {
    uiType: 'toggle',
    label: 'Disable dynamic accent colour',
    desc: 'When on, the widget always uses the default accent colour instead of extracting one from the album art.',
    category: 'nowplaying'
});

const npAccentColor = ws.get('npAccentColor', '#e85d3b', 'string', {
    uiType: 'color',
    label: 'Static accent colour',
    desc: 'Only applies when dynamic accent colour is disabled. Has no effect while dynamic accent is active.',
    category: 'nowplaying'
});

/* ── Elements ───────────────────────────────────────────────────────────────── */
// NOTE: defaults are false (don't hide). The URL only ever stores `true` values.
// Toggling ON means "hide this element", default OFF means "show this element".
ws.get('_np_elements_header', null, 'string', {
    uiType: 'header',
    label: 'Hide elements',
    desc: 'Turn on to hide individual parts of the widget. Off = visible (default).',
    category: 'nowplaying',
    urlSkip: true
});

const npHideDisc = ws.get('npHideDisc', false, 'boolean', { uiType: 'toggle', label: 'Hide vinyl disc', category: 'nowplaying' });
const npHideTitle = ws.get('npHideTitle', false, 'boolean', { uiType: 'toggle', label: 'Hide song title', category: 'nowplaying' });
const npHideArtist = ws.get('npHideArtist', false, 'boolean', { uiType: 'toggle', label: 'Hide artist name', category: 'nowplaying' });
const npHideProgress = ws.get('npHideProgress', false, 'boolean', { uiType: 'toggle', label: 'Hide progress bar', category: 'nowplaying' });
const npHideTime = ws.get('npHideTime', false, 'boolean', { uiType: 'toggle', label: 'Hide timestamps', category: 'nowplaying' });
const npHideAppName = ws.get('npHideAppName', false, 'boolean', { uiType: 'toggle', label: 'Hide app name badge', category: 'nowplaying' });
const npHideDot = ws.get('npHideDot', false, 'boolean', { uiType: 'toggle', label: 'Hide live status dot', category: 'nowplaying' });

/* ── Background & accent ────────────────────────────────────────────────────── */
ws.get('_np_bg_header', null, 'string', {
    uiType: 'header',
    label: 'Background & Accent',
    desc: 'Control the card background and accent colour behaviour.',
    category: 'nowplaying',
    urlSkip: true
});

const npArtBg = ws.get('npArtBg', false, 'boolean', {
    uiType: 'toggle',
    label: 'Album art as card background',
    desc: 'Displays the album art stretched behind the card content with a dark scrim for readability.',
    category: 'nowplaying'
});

const npHideAccentOverlay = ws.get('npHideAccentOverlay', false, 'boolean', {
    uiType: 'toggle',
    label: 'Hide accent colour overlay',
    desc: 'Removes the accent gradient that appears in the top-left corner of the card.',
    category: 'nowplaying'
});

const npDisableAccent = ws.get('npDisableAccent', false, 'boolean', {
    uiType: 'toggle',
    label: 'Disable accent colour',
    desc: 'Turns off all accent colouring — progress bar, status dot, spindle, and glow all render in neutral grey.',
    category: 'nowplaying'
});

/* ── Imports page ───────────────────────────────────────────────────────────── */
ws.get('_imports_header', null, 'string', {
    uiType: 'header',
    label: 'Streamer.bot Imports',
    desc: 'Copy and paste these import codes into Streamer.bot (Actions → Import).',
    category: 'imports',
    urlSkip: true
});

ws.get('_np_sb_import', null, 'string', {
    uiType: 'sbimport',
    label: 'Now Playing Action',
    desc: 'Polls Windows every 2 seconds for the currently playing media and broadcasts it to this widget via the Streamer.bot WebSocket. Requires a timer trigger set to 2 seconds.(Comes with a timer trigger pre-configured. You need to enable it by going to Services → Streamer.bot → Timers → music then right click it and check the enable box.)',
    code: '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',
    category: 'imports',
    urlSkip: true
});

/* Convert a #rrggbb hex string to { r, g, b } — needed before settings are applied */
const hexToRgb = hex => {
    const h = (hex || '#e85d3b').replace('#', '');
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
    };
};

/* ═══════════════════════════════════════════════════════════════════════════════
   DOM REFS
   ═══════════════════════════════════════════════════════════════════════════════ */
const card = document.getElementById('np-card');
const disc = document.querySelector('.np-disc');
const artImg = document.getElementById('np-art');
const title = document.getElementById('np-title');
const artist = document.getElementById('np-artist');
const dot = document.getElementById('np-dot');
const fill = document.getElementById('np-fill');
const app = document.getElementById('np-app');
const pos = document.getElementById('np-pos');
const dur = document.getElementById('np-dur');
const canvas = document.getElementById('np-canvas');
const ctx = canvas.getContext('2d');
const bgArt = document.getElementById('np-bg-art');

/* ═══════════════════════════════════════════════════════════════════════════════
   APPLY SETTINGS TO DOM
   These run once at load — the widget reloads when settings are saved,
   so the values are always fresh from URL params.
   ═══════════════════════════════════════════════════════════════════════════════ */
document.body.setAttribute('data-np-style', npStyle || 'default');
document.body.setAttribute('data-np-disc', npDiscMode || 'vinyl');


// Visibility toggles — add a class when param is true (i.e. user wants to hide it)
if (npHideDisc) card.classList.add('np-no-disc');
if (npHideTitle) card.classList.add('np-no-title');
if (npHideArtist) card.classList.add('np-no-artist');
if (npHideProgress) card.classList.add('np-no-progress');
if (npHideTime) card.classList.add('np-no-time');
if (npHideAppName) card.classList.add('np-no-appname');
if (npHideDot) card.classList.add('np-no-dot');

if (npHideAccentOverlay) card.classList.add('np-no-accent-overlay');
if (npDisableAccent) card.classList.add('np-no-accent');

/* ═══════════════════════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════════════════════ */
let state = { isPlaying: false, positionMs: 0, durationMs: 0 };
let lastAlbumArt = '';
let serverPos = 0;
let serverTs = 0;   // wall-clock ms when serverPos was last anchored

/* ═══════════════════════════════════════════════════════════════════════════════
   TIME HELPERS
   ═══════════════════════════════════════════════════════════════════════════════ */
const fmt = ms => {
    if (!ms || ms <= 0) return '0:00';
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

const estPos = () => {
    if (!state.isPlaying || serverTs === 0) return serverPos;
    return Math.min(state.durationMs, serverPos + (Date.now() - serverTs));
};

const updateProgress = () => {
    const p = estPos();
    fill.style.width = state.durationMs > 0
        ? Math.min(100, (p / state.durationMs) * 100) + '%'
        : '0%';
    pos.textContent = fmt(p);
    dur.textContent = fmt(state.durationMs);
};

setInterval(() => { if (state.isPlaying) updateProgress(); }, 250);

/* ═══════════════════════════════════════════════════════════════════════════════
   ACCENT COLOUR EXTRACTION
   ═══════════════════════════════════════════════════════════════════════════════ */
const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return [h, s, l];
};

const hslToRgb = (h, s, l) => {
    if (s === 0) return [l * 255, l * 255, l * 255];
    const hue2 = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue2(p, q, h + 1 / 3), hue2(p, q, h), hue2(p, q, h - 1 / 3)].map(v => Math.round(v * 255));
};

const extractAccent = img => {
    try {
        ctx.clearRect(0, 0, 32, 32);
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let best = -1, bH = 0, bS = 0, bL = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue;
            const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
            if (l < 0.12 || l > 0.88) continue;
            const score = s * (1 - Math.abs(l - 0.45));
            if (score > best) { best = score; bH = h; bS = s; bL = l; }
        }
        if (best < 0.08) return null;
        const s = Math.min(1, bS * 1.15);
        const l = Math.max(0.40, Math.min(0.62, bL));
        const [r, g, b] = hslToRgb(bH, s, l);
        return { r, g, b };
    } catch { return null; }
};

const resetAccent = () => {
    const root = document.documentElement;
    root.style.setProperty('--np-accent', 'var(--accent, #e85d3b)');
    root.style.setProperty('--np-accent-rgb', '232, 93, 59');
    root.style.setProperty('--np-glow', 'rgba(232,93,59,0.55)');
};

const applyAccent = col => {
    if (!col) { resetAccent(); return; }
    const root = document.documentElement;
    root.style.setProperty('--np-accent', `rgb(${col.r},${col.g},${col.b})`);
    root.style.setProperty('--np-accent-rgb', `${col.r}, ${col.g}, ${col.b}`);
    root.style.setProperty('--np-glow', `rgba(${col.r},${col.g},${col.b},0.55)`);
};

// Apply static accent colour now that applyAccent is available
if (npDisableDynColor && npAccentColor) {
    applyAccent(hexToRgb(npAccentColor));
}

/* ═══════════════════════════════════════════════════════════════════════════════
   STATE APPLICATION
   ═══════════════════════════════════════════════════════════════════════════════ */
const applyState = p => {
    if (!p) return;

    const trackChanged =
        !state.isPlaying !== !p.isPlaying ||
        state.title !== p.title ||
        state.artist !== p.artist;

    state = p;
    dot.classList.toggle('np-live', !!p.isPlaying);
    disc.classList.toggle('np-spinning', !!p.isPlaying);

    if (!p.isPlaying) {
        card.classList.add('np-hidden');
        card.classList.remove('np-art-bg');
        if (bgArt) bgArt.style.backgroundImage = '';
        resetAccent();
        serverPos = p.positionMs;
        serverTs = 0;
        return;
    }

    card.classList.remove('np-hidden');
    title.textContent = p.title || 'Untitled';
    artist.textContent = p.artist || '';
    app.textContent = p.appName || '';

    /* ── Time anchor — use SMTC LastUpdatedTime for accuracy ── */
    if (trackChanged) {
        const lag = p.lastUpdatedMs ? (Date.now() - p.lastUpdatedMs) : 0;
        serverPos = p.positionMs + lag;
        serverTs = Date.now();
    } else {
        const lag = p.lastUpdatedMs ? (Date.now() - p.lastUpdatedMs) : 0;
        const diff = Math.abs((p.positionMs + lag) - estPos());
        if (diff > 3000) {  // seek detected
            serverPos = p.positionMs + lag;
            serverTs = Date.now();
        }
    }

    /* ── Album art + dynamic accent + background art ── */
    if (p.albumArt && p.albumArt !== lastAlbumArt) {
        lastAlbumArt = p.albumArt;
        artImg.onerror = () => resetAccent();
        artImg.onload = () => {
            // Dynamic accent
            if (!npDisableDynColor) applyAccent(extractAccent(artImg));
            // Background art — set image and reveal layer
            if (npArtBg && bgArt) {
                bgArt.style.backgroundImage = `url('${p.albumArt}')`;
                card.classList.add('np-art-bg');
            }
        };
        artImg.src = p.albumArt;
        artImg.style.display = 'block';
    } else if (p.albumArt && npArtBg && bgArt && !bgArt.style.backgroundImage) {
        // Same art as before but bg wasn't set yet (e.g. setting just enabled)
        bgArt.style.backgroundImage = `url('${p.albumArt}')`;
        card.classList.add('np-art-bg');
    } else if (!p.albumArt) {
        artImg.style.display = 'none';
        lastAlbumArt = '';
        resetAccent();
        if (bgArt) bgArt.style.backgroundImage = '';
        card.classList.remove('np-art-bg');
    }

    updateProgress();
};

/* ═══════════════════════════════════════════════════════════════════════════════
   WEBSRC EVENTS
   ═══════════════════════════════════════════════════════════════════════════════ */
ws.on('ready', () => {
    ws.postSchemaToParent({
        meta: { app: 'Now Playing', version: '1.0.0' },
        features: { streamerbot: true },
        nav: [
            {
                group: 'SETUP', items: [
                    { id: 'start', label: 'Get started', icon: 'sparkle' },
                    { id: 'integrations', label: 'Connections', icon: 'network' },
                    { id: 'imports', label: 'Imports', icon: 'import' }
                ]
            },
            {
                group: 'WIDGET', items: [
                    { id: 'nowplaying', label: 'Now Playing', icon: 'music' }
                ]
            }
        ]
    });
});

/*
 * StreamerbotClient passes the full envelope: { timeStamp, event, data }
 * Our payload lives at msg.data.
 */
ws.on('streamerbot.General.Custom', msg => {
    const inner = msg?.data;
    if (!inner || inner.evt !== 'NowPlaying') return;
    applyState(inner.payload);
});