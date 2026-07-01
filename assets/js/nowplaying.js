/**
 * Now Playing Widget — WebSRC
 *
 * Listens for NowPlaying broadcasts from the companion Streamer.bot
 * C# action (StreamerBot_NowPlaying.cs) via the General.Custom event.
 *
 * URL:  /#Widget:nowplaying  (hash routing)
 *       /Widget/nowplaying   (Apache)
 */

/* ── WebSRC init ──────────────────────────────────────────────────────────── */
const ws = new WebSRC({
    // Only Streamer.bot — all other platform clients are skipped entirely
    platforms: ['streamerbot'],
    streamerbot: {
        // Force connect even without ?streamerbot=true in the URL
        disableOnTwitchChat: false,
        disableOnKickChat: false
    },
    emotes: { autoload: false }
});

/* Settings exposed to the modify panel */
ws.get('_np_header', null, 'string', {
    uiType: 'header',
    label: 'Now Playing',
    desc: 'Displays the currently playing song from any media player on your PC via the Windows System Media Transport Controls (Spotify, YouTube Music, Apple Music, VLC, etc.).',
    category: 'nowplaying',
    urlSkip: true
});

/* ── Imports page ─────────────────────────────────────────────────────────── */
ws.get('_imports_header', null, 'string', {
    uiType: 'header',
    label: 'Streamer.bot Imports',
    desc: 'Copy and paste these import codes directly into Streamer.bot (Actions → Import) to set up the required actions for this widget.',
    category: 'imports',
    urlSkip: true
});

ws.get('_np_sb_import', null, 'string', {
    uiType: 'sbimport',
    label: 'Now Playing Action',
    desc: 'Polls Windows every 2 seconds for the currently playing media and broadcasts it to this widget via the Streamer.bot WebSocket server. Requires a timer trigger set to 2 seconds(included in the import may require enabling under Services > Timers > music).',
    // Paste your generated Streamer.bot import code string here
    code: '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',
    category: 'imports',
    urlSkip: true
});

/* ── DOM refs ─────────────────────────────────────────────────────────────── */
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

/* ── State ────────────────────────────────────────────────────────────────── */
let state = { isPlaying: false, positionMs: 0, durationMs: 0 };
let lastAlbumArt = '';
let serverPos = 0;
let serverTs = 0;   // wall-clock ms when serverPos was set

/* ── Time helpers ─────────────────────────────────────────────────────────── */
const fmt = ms => {
    if (!ms || ms <= 0) return '0:00';
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

const estPos = () => {
    if (!state.isPlaying || serverTs === 0) return serverPos;
    return Math.min(state.durationMs, serverPos + (Date.now() - serverTs));
};

/* ── Progress bar + time ──────────────────────────────────────────────────── */
const updateProgress = () => {
    const p = estPos();
    fill.style.width = state.durationMs > 0
        ? Math.min(100, (p / state.durationMs) * 100) + '%'
        : '0%';
    pos.textContent = fmt(p);
    dur.textContent = fmt(state.durationMs);
};

setInterval(() => { if (state.isPlaying) updateProgress(); }, 250);

/* ── Accent colour extraction ─────────────────────────────────────────────── */
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

const applyAccent = col => {
    const root = document.documentElement;
    if (!col) {
        root.style.setProperty('--np-accent', 'var(--accent, #e85d3b)');
        root.style.setProperty('--np-accent-rgb', '232, 93, 59');
        root.style.setProperty('--np-glow', 'rgba(232,93,59,0.55)');
    } else {
        root.style.setProperty('--np-accent', `rgb(${col.r},${col.g},${col.b})`);
        root.style.setProperty('--np-accent-rgb', `${col.r}, ${col.g}, ${col.b}`);
        root.style.setProperty('--np-glow', `rgba(${col.r},${col.g},${col.b},0.55)`);
    }
};

/* ── State application ────────────────────────────────────────────────────── */
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
        applyAccent(null);
        serverPos = p.positionMs;
        serverTs = 0;
        return;
    }

    card.classList.remove('np-hidden');
    title.textContent = p.title || 'Untitled';
    artist.textContent = p.artist || '';
    app.textContent = p.appName || '';

    /* Time anchor — use SMTC's LastUpdatedTime for precision */
    if (trackChanged) {
        const lag = p.lastUpdatedMs ? (Date.now() - p.lastUpdatedMs) : 0;
        serverPos = p.positionMs + lag;
        serverTs = Date.now();
    } else {
        const lag = p.lastUpdatedMs ? (Date.now() - p.lastUpdatedMs) : 0;
        const diff = Math.abs((p.positionMs + lag) - estPos());
        if (diff > 3000) {                       /* seek detected */
            serverPos = p.positionMs + lag;
            serverTs = Date.now();
        }
        /* else: let the wall-clock estimate keep running — no jump */
    }

    /* Album art + accent colour */
    if (p.albumArt && p.albumArt !== lastAlbumArt) {
        lastAlbumArt = p.albumArt;
        artImg.onload = () => applyAccent(extractAccent(artImg));
        artImg.onerror = () => applyAccent(null);
        artImg.src = p.albumArt;
        artImg.style.display = 'block';
    } else if (!p.albumArt) {
        artImg.style.display = 'none';
        lastAlbumArt = '';
        applyAccent(null);
    }

    updateProgress();
};

/* ── Streamer.bot event listener ──────────────────────────────────────────── */
ws.on('ready', () => {
    console.log('[NowPlaying] WebSRC ready — listening for Streamer.bot broadcasts');

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
 * StreamerbotClient passes the full WebSocket envelope to the callback:
 *   { timeStamp, event: { source, type }, data: { evt, payload } }
 *
 * The actual now-playing data lives at msg.data, not at the top level.
 */
ws.on('streamerbot.General.Custom', msg => {
    const inner = msg?.data;
    if (!inner || inner.evt !== 'NowPlaying') return;
    applyState(inner.payload);
});