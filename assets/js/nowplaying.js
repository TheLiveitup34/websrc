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
    code: '',
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
});g