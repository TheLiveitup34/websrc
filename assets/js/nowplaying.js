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

const npLayout = ws.get('npLayout', 'horizontal', 'string', {
    uiType: 'select',
    label: 'Layout',
    options: [
        { value: 'horizontal', label: 'Horizontal  —  artwork left, text right (default)' },
        { value: 'vertical', label: 'Vertical    —  artwork top, text below' }
    ],
    category: 'nowplaying'
});

const npDiscMode = ws.get('npDiscMode', 'vinyl', 'string', {
    uiType: 'select',
    label: 'Disc / image mode',
    options: [
        { value: 'vinyl', label: 'Vinyl disc  —  spinning record with grooves' },
        { value: 'vinyl-detached', label: 'Detached vinyl  —  spinning disc floats beside the card' },
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

const npDisableScroll = ws.get('npDisableScroll', false, 'boolean', {
    uiType: 'toggle',
    label: 'Disable scrolling text',
    desc: 'By default, long titles and artist names scroll left and back in a loop. Turn this on to disable that and just clip the text.',
    category: 'nowplaying'
});

const npHideDisc = ws.get('npHideDisc', false, 'boolean', { uiType: 'toggle', label: 'Hide artwork / vinyl disc', category: 'nowplaying' });
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

const npHideShadow = ws.get('npHideShadow', false, 'boolean', {
    uiType: 'toggle',
    label: 'Disable drop shadow',
    desc: 'Removes the depth shadow from the card and detached art elements.',
    category: 'nowplaying'
});

const npHideGlow = ws.get('npHideGlow', false, 'boolean', {
    uiType: 'toggle',
    label: 'Disable accent glow',
    desc: 'Removes all accent-coloured glow effects — spinning disc glow, progress bar glow, status dot glow, and spindle glow.',
    category: 'nowplaying'
});

const npUseBgColor = ws.get('npUseBgColor', false, 'boolean', {
    uiType: 'toggle',
    label: 'Custom background colour',
    desc: 'When on, the colour picker below overrides the card background. Turn off to use the selected style background.',
    category: 'nowplaying'
});

const npBgColor = ws.get('npBgColor', '#111111', 'string', {
    uiType: 'color',
    label: 'Background colour',
    desc: 'Only applies when "Custom background colour" is enabled above.',
    category: 'nowplaying'
});

/* ── Listeners ──────────────────────────────────────────────────────────────── */
// All default false (= listen), turn ON to block that app.
ws.get('_listeners_header', null, 'string', {
    uiType: 'header',
    label: 'App Listeners',
    desc: 'Choose which media apps the widget will respond to. All apps are active by default — toggle one on to ignore it.',
    category: 'listeners',
    urlSkip: true
});

const npDisableSpotify = ws.get('npDisableSpotify', false, 'boolean', { uiType: 'toggle', label: 'Ignore Spotify', category: 'listeners' });
const npDisableChrome = ws.get('npDisableChrome', false, 'boolean', { uiType: 'toggle', label: 'Ignore Chrome (browsers)', category: 'listeners' });
const npDisableFirefox = ws.get('npDisableFirefox', false, 'boolean', { uiType: 'toggle', label: 'Ignore Firefox', category: 'listeners' });
const npDisableEdge = ws.get('npDisableEdge', false, 'boolean', { uiType: 'toggle', label: 'Ignore Edge', category: 'listeners' });
const npDisableVLC = ws.get('npDisableVLC', false, 'boolean', { uiType: 'toggle', label: 'Ignore VLC', category: 'listeners' });
const npDisableApple = ws.get('npDisableApple', false, 'boolean', { uiType: 'toggle', label: 'Ignore Apple Music / iTunes', category: 'listeners' });
const npDisableWMP = ws.get('npDisableWMP', false, 'boolean', { uiType: 'toggle', label: 'Ignore Windows Media Player', category: 'listeners' });
const npDisableOthers = ws.get('npDisableOthers', false, 'boolean', { uiType: 'toggle', label: 'Ignore all other apps', category: 'listeners' });

/* ── Widget settings ─────────────────────────────────────────────────────────── */
ws.get('_settings_header', null, 'string', {
    uiType: 'header',
    label: 'Widget Settings',
    desc: 'General widget behaviour options.',
    category: 'settings',
    urlSkip: true
});

// streaming=true is the actual WebSRC param that bypasses modify-panel detection.
// When enabled the widget URL always serves the overlay view, even in a regular browser.
ws.get('streaming', false, 'boolean', {
    uiType: 'toggle',
    label: 'Force streaming mode',
    desc: 'Adds streaming=true to the widget URL. When on, opening the widget in a regular browser will show the overlay directly instead of this settings panel. Useful for testing outside of OBS.',
    category: 'settings'
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
    desc: 'Polls Windows every 2 seconds for the currently playing media and broadcasts it to this widget via the Streamer.bot WebSocket. Requires a timer trigger set to 2 seconds.',
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
const meta = document.querySelector('.np-meta');

/* ═══════════════════════════════════════════════════════════════════════════════
   APPLY SETTINGS TO DOM
   These run once at load — the widget reloads when settings are saved,
   so the values are always fresh from URL params.
   ═══════════════════════════════════════════════════════════════════════════════ */
document.body.setAttribute('data-np-style', npStyle || 'default');
const isDetachedMode = () => npDiscMode === 'image-detached' || npDiscMode === 'vinyl-detached';
document.body.setAttribute('data-np-disc', npDiscMode || 'vinyl');
document.body.setAttribute('data-np-layout', npLayout || 'horizontal');


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
if (npHideShadow) {
    card.classList.add('np-no-shadow');
    // setProperty with 'important' creates an inline !important which beats
    // any stylesheet !important (e.g. neon np-no-glow box-shadow override)
    card.style.setProperty('box-shadow', 'none', 'important');
    if (meta) meta.style.setProperty('box-shadow', 'none', 'important');
    const artWrap = document.querySelector('.np-art-wrap');
    if (artWrap) artWrap.style.setProperty('filter', 'none', 'important');
}
if (npHideGlow) {
    card.classList.add('np-no-glow');
}

// Custom background colour — applied inline so it overrides CSS style rules
if (npUseBgColor && npBgColor) {
    const isDetached = npDiscMode === 'image-detached' || npDiscMode === 'vinyl-detached';
    // In detached modes the meta section is the "card", otherwise target the card itself
    const bgTarget = isDetached ? document.querySelector('.np-meta') : card;
    if (bgTarget) bgTarget.style.backgroundColor = npBgColor;
}

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
   SCROLLING TEXT (MARQUEE)
   Animates element.scrollLeft so the text scrolls within its own hidden
   overflow — the element never moves, only its scroll position does.
   Pause at each end, then loop indefinitely.
   ═══════════════════════════════════════════════════════════════════════════════ */
const MARQUEE_PAUSE_MS = 6000;  // ms to hold at each end
const MARQUEE_SPEED = 1;     // px per ~16 ms tick ≈ 60 px/s

const applyMarquee = el => {
    // Cancel any existing marquee on this element
    if (el._marqueeInterval) {
        clearInterval(el._marqueeInterval);
        el._marqueeInterval = null;
    }
    el.scrollLeft = 0;

    if (npDisableScroll) return;

    // Brief delay — let the browser lay out the new text before measuring
    setTimeout(() => {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll <= 4) return;   // fits, nothing to scroll

        let direction = 1;            // 1 = scroll forward, -1 = scroll back
        let pauseLeft = MARQUEE_PAUSE_MS;   // start with initial pause

        el._marqueeInterval = setInterval(() => {
            if (pauseLeft > 0) {
                pauseLeft -= 16;      // tick down the pause counter
                return;
            }

            el.scrollLeft += direction * MARQUEE_SPEED;

            if (direction === 1 && el.scrollLeft >= maxScroll) {
                el.scrollLeft = maxScroll;
                direction = -1;
                pauseLeft = MARQUEE_PAUSE_MS;
            } else if (direction === -1 && el.scrollLeft <= 0) {
                el.scrollLeft = 0;
                direction = 1;
                pauseLeft = MARQUEE_PAUSE_MS;
            }
        }, 16);
    }, 100);
};

const stopMarquee = el => {
    if (el._marqueeInterval) {
        clearInterval(el._marqueeInterval);
        el._marqueeInterval = null;
    }
    el.scrollLeft = 0;
};

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
   LISTENER FILTER
   Checks the appName from the Streamer.bot broadcast against user preferences.
   Returns false if the user has disabled that app source.
   ═══════════════════════════════════════════════════════════════════════════════ */
const isAppAllowed = appName => {
    const n = (appName || '').toLowerCase();
    if (n.includes('spotify')) return !npDisableSpotify;
    if (n.includes('chrome') || n.includes('chromium')) return !npDisableChrome;
    if (n.includes('firefox')) return !npDisableFirefox;
    if (n.includes('edge') || n.includes('msedge')) return !npDisableEdge;
    if (n.includes('vlc')) return !npDisableVLC;
    if (n.includes('apple') || n.includes('itunes') || n.includes('music') && n.includes('apple')) return !npDisableApple;
    if (n.includes('windows media') || n.includes('wmp') || n.includes('wmplayer')) return !npDisableWMP;
    return !npDisableOthers;  // anything unrecognised falls under Others
};

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
        // Stop any scrolling marquee
        [title, artist].forEach(stopMarquee);
        serverPos = p.positionMs;
        serverTs = 0;
        return;
    }

    card.classList.remove('np-hidden');
    title.textContent = p.title || 'Untitled';
    artist.textContent = p.artist || '';
    app.textContent = p.appName || '';

    // Apply scrolling marquee to title and artist (only if text changed)
    if (trackChanged) {
        applyMarquee(title);
        applyMarquee(artist);
    }

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
            // Background art — detached: apply to meta panel; normal: use np-bg-art div
            if (npArtBg) {
                if (isDetachedMode() && meta) {
                    meta.style.backgroundImage = `url('${p.albumArt}')`;
                    meta.classList.add('np-art-bg-meta');
                } else if (bgArt) {
                    bgArt.style.backgroundImage = `url('${p.albumArt}')`;
                    card.classList.add('np-art-bg');
                }
            }
        };
        artImg.src = p.albumArt;
        artImg.style.display = 'block';
    } else if (p.albumArt && npArtBg && !lastAlbumArt) {
        // Same art as before but bg wasn't set yet (e.g. setting just enabled)
        if (isDetachedMode() && meta) {
            meta.style.backgroundImage = `url('${p.albumArt}')`;
            meta.classList.add('np-art-bg-meta');
        } else if (bgArt) {
            bgArt.style.backgroundImage = `url('${p.albumArt}')`;
            card.classList.add('np-art-bg');
        }
    } else if (!p.albumArt) {
        artImg.style.display = 'none';
        lastAlbumArt = '';
        resetAccent();
        if (bgArt) bgArt.style.backgroundImage = '';
        card.classList.remove('np-art-bg');
        if (meta) { meta.style.backgroundImage = ''; meta.classList.remove('np-art-bg-meta'); }
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
                    { id: 'nowplaying', label: 'Now Playing', icon: 'music' },
                    { id: 'listeners', label: 'Listeners', icon: 'listen' },
                    { id: 'settings', label: 'Settings', icon: 'cog' }
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
    if (!isAppAllowed(inner.payload?.appName)) return;   // skip ignored apps
    applyState(inner.payload);
});