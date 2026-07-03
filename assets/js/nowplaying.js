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

ws.get('_listeners_nav', null, 'string', {
    uiType: 'navbtn',
    label: 'Configure Listeners →',
    target: 'listeners',
    desc: 'Control which apps the widget listens to, view plugin requirements for VLC, MusicBee, WinAmp and others, and find Linux setup instructions.',
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
// Whitelist logic: if nothing is selected all apps are heard (default).
// Select specific apps to only hear those. "Listen to all" overrides back to all.

// ── Linux setup ─────────────────────────────────────────────────────────────
// The C# action (StreamerBot_NowPlaying.cs) detects Linux automatically and
// calls `playerctl` instead of SMTC. Install it so the action can read media.
ws.get('_linux_header', null, 'string', {
    uiType: 'header',
    label: 'Linux Setup',
    desc: 'The Streamer.bot C# action detects Linux automatically and uses playerctl to read MPRIS media data. Install it with your package manager — Streamer.bot must run as the same user as your media players.',
    category: 'listeners',
    urlSkip: true
});
ws.get('_linux_apt', null, 'string', {
    uiType: 'collapsable',
    label: 'Debian / Ubuntu / Pop!_OS',
    children: [{ name: '_linux_apt_code', type: 'sbimport', label: 'Install playerctl', desc: 'Run in terminal, then restart Streamer.bot.', code: 'sudo apt install playerctl' }],
    category: 'listeners',
    urlSkip: true
});
ws.get('_linux_pacman', null, 'string', {
    uiType: 'collapsable',
    label: 'Arch / Manjaro',
    children: [{ name: '_linux_pacman_code', type: 'sbimport', label: 'Install playerctl', desc: 'Run in terminal, then restart Streamer.bot.', code: 'sudo pacman -S playerctl' }],
    category: 'listeners',
    urlSkip: true
});
ws.get('_linux_dnf', null, 'string', {
    uiType: 'collapsable',
    label: 'Fedora',
    children: [{ name: '_linux_dnf_code', type: 'sbimport', label: 'Install playerctl', desc: 'Run in terminal, then restart Streamer.bot.', code: 'sudo dnf install playerctl' }],
    category: 'listeners',
    urlSkip: true
});
ws.get('_linux_zypper', null, 'string', {
    uiType: 'collapsable',
    label: 'openSUSE',
    children: [{ name: '_linux_zypper_code', type: 'sbimport', label: 'Install playerctl', desc: 'Run in terminal, then restart Streamer.bot.', code: 'sudo zypper install playerctl' }],
    category: 'listeners',
    urlSkip: true
});
ws.get('_linux_verify', null, 'string', {
    uiType: 'collapsable',
    label: 'Verify installation',
    children: [{ name: '_linux_verify_code', type: 'sbimport', label: 'Verify playerctl', desc: 'Run while something is playing — should print the song title and artist.', code: 'playerctl metadata' }],
    category: 'listeners',
    urlSkip: true
});
ws.get('_linux_mpd', null, 'string', {
    uiType: 'collapsable',
    label: 'Optional: MPD support (mpDris2)',
    children: [{ name: '_linux_mpd_code', type: 'sbimport', label: 'Install mpDris2', desc: 'MPD does not expose MPRIS natively. Install mpDris2 to bridge it, then run it alongside MPD.', code: 'sudo apt install mpdris2        # Debian / Ubuntu\nsudo pacman -S mpd-mpris        # Arch / Manjaro' }],
    category: 'listeners',
    urlSkip: true
});

ws.get('_listeners_header', null, 'string', {
    uiType: 'header',
    label: 'App Listeners',
    desc: 'Select which apps to listen to. Leave everything off to hear all apps, or pick specific ones to create a whitelist.',
    category: 'listeners',
    urlSkip: true
});

const npListenAll = ws.get('npListenAll', false, 'boolean', {
    uiType: 'toggle',
    label: 'Listen to all apps',
    desc: 'When on, all media apps are heard regardless of individual selections below.',
    category: 'listeners'
});

// ── Streaming platforms ───────────────────────────────────────────────────────
ws.get('_streaming_header', null, 'string', {
    uiType: 'header',
    label: 'Streaming Platforms',
    category: 'listeners',
    urlSkip: true
});
const npListenSpotify = ws.get('npListenSpotify', false, 'boolean', { uiType: 'toggle', label: 'Listen to Spotify', category: 'listeners' });
const npListenApple = ws.get('npListenApple', false, 'boolean', { uiType: 'toggle', label: 'Listen to Apple Music / Cider', category: 'listeners' });
const npListeniTunes = ws.get('npListeniTunes', false, 'boolean', { uiType: 'toggle', label: 'Listen to iTunes', category: 'listeners' });
ws.get('_itunes_info', null, 'string', {
    uiType: 'info',
    label: 'iTunes — Windows only — Store plugin required',
    desc: 'Windows: Requires an SMTC integration app from the Microsoft Store to appear. Not available on Linux.',
    links: [{ label: 'Install from Microsoft Store (Windows)', url: 'https://apps.microsoft.com/detail/9nq3d21qt8ml' }],
    category: 'listeners', urlSkip: true
});
const npListenQobuz = ws.get('npListenQobuz', false, 'boolean', { uiType: 'toggle', label: 'Listen to Qobuz', category: 'listeners' });
ws.get('_qobuz_info', null, 'string', {
    uiType: 'info',
    label: 'Qobuz — Windows only — plugin required',
    desc: 'Windows: Requires the qobuz-smtc plugin to bridge Qobuz to SMTC. Not available on Linux.',
    links: [{ label: 'qobuz-smtc on GitHub (Windows)', url: 'https://github.com/TubaApollo/qobuz-smtc' }],
    category: 'listeners', urlSkip: true
});
const npListenTidal = ws.get('npListenTidal', false, 'boolean', { uiType: 'toggle', label: 'Listen to TIDAL', category: 'listeners' });
const npListenDeezer = ws.get('npListenDeezer', false, 'boolean', { uiType: 'toggle', label: 'Listen to Deezer', category: 'listeners' });
const npListenYTM = ws.get('npListenYTM', false, 'boolean', { uiType: 'toggle', label: 'Listen to YouTube Music (browser / Pear / YTMDesktop)', category: 'listeners' });
const npListenAmazon = ws.get('npListenAmazon', false, 'boolean', { uiType: 'toggle', label: 'Listen to Amazon Music', category: 'listeners' });
ws.get('_amazon_info', null, 'string', {
    uiType: 'info', label: 'Amazon Music — web player recommended',
    desc: 'Windows: The desktop app only reports the song title — no artist or album art. Use the web player instead. Linux: The web player in Chrome/Firefox works fine via playerctl.',
    links: [{ label: 'Open Amazon Music Web Player', url: 'https://music.amazon.com/' }],
    category: 'listeners', urlSkip: true
});
const npListenSoundcloud = ws.get('npListenSoundcloud', false, 'boolean', { uiType: 'toggle', label: 'Listen to SoundCloud', category: 'listeners' });
const npListenPretzel = ws.get('npListenPretzel', false, 'boolean', { uiType: 'toggle', label: 'Listen to Pretzel', category: 'listeners' });
ws.get('_pretzel_info', null, 'string', {
    uiType: 'info', label: 'Pretzel — use web player',
    desc: 'Windows: Use the web player for SMTC support — the desktop app is not compatible. Linux: The web player in Chrome/Firefox works via playerctl.',
    links: [{ label: 'Open Pretzel Web Player', url: 'https://play.pretzel.rocks/' }],
    category: 'listeners', urlSkip: true
});

// ── Local music players ───────────────────────────────────────────────────────
ws.get('_local_header', null, 'string', {
    uiType: 'header', label: 'Local Music Players',
    category: 'listeners', urlSkip: true
});
const npListenVLC = ws.get('npListenVLC', false, 'boolean', { uiType: 'toggle', label: 'Listen to VLC', category: 'listeners' });
ws.get('_vlc_info', null, 'string', {
    uiType: 'info', label: 'VLC — Windows: plugin required | Linux: native',
    desc: 'Linux: VLC supports MPRIS natively — no plugin needed. Windows: Use the fork plugin (the official has a broken progress bar).',
    links: [
        { label: 'Fork — recommended (Windows)', url: 'https://github.com/robwiz9/vlc-win10smtc' },
        { label: 'Official plugin (Windows)', url: 'https://github.com/spmn/vlc-win10smtc' }
    ],
    category: 'listeners', urlSkip: true
});
const npListenMPV = ws.get('npListenMPV', false, 'boolean', { uiType: 'toggle', label: 'Listen to mpv', category: 'listeners' });
const npListenWMP = ws.get('npListenWMP', false, 'boolean', { uiType: 'toggle', label: 'Listen to Windows Media Player', category: 'listeners' });
const npListenMpcHc = ws.get('npListenMpcHc', false, 'boolean', { uiType: 'toggle', label: 'Listen to MPC-HC', category: 'listeners' });
const npListenMusicBee = ws.get('npListenMusicBee', false, 'boolean', { uiType: 'toggle', label: 'Listen to MusicBee', category: 'listeners' });
ws.get('_musicbee_info', null, 'string', {
    uiType: 'info', label: 'MusicBee — Windows only — plugin required (no progress bar)',
    desc: 'Windows: Requires the mb_SMTC plugin. Progress bar is not supported. Not available on Linux.',
    links: [{ label: 'mb_SMTC on MusicBee Forum (Windows)', url: 'https://getmusicbee.com/forum/index.php?topic=21240.0' }],
    category: 'listeners', urlSkip: true
});
const npListenWinamp = ws.get('npListenWinamp', false, 'boolean', { uiType: 'toggle', label: 'Listen to WinAmp', category: 'listeners' });
ws.get('_winamp_info', null, 'string', {
    uiType: 'info', label: 'WinAmp — Windows only — plugin required (no progress bar)',
    desc: 'Windows: Requires the gen_smtcinterop plugin. Progress bar is not supported. Not available on Linux.',
    links: [{ label: 'gen_smtcinterop on GitHub (Windows)', url: 'https://github.com/laszlolukacs/gen_smtcinterop' }],
    category: 'listeners', urlSkip: true
});
const npListenFoobar = ws.get('npListenFoobar', false, 'boolean', { uiType: 'toggle', label: 'Listen to foobar2000', category: 'listeners' });
const npListenAIMP = ws.get('npListenAIMP', false, 'boolean', { uiType: 'toggle', label: 'Listen to AIMP', category: 'listeners' });
ws.get('_aimp_info', null, 'string', {
    uiType: 'info', label: 'AIMP — Windows only — plugin required (no progress bar)',
    desc: 'Windows: Requires the SMTC plugin from the AIMP catalogue. Progress bar is not supported. Not available on Linux.',
    links: [{ label: 'AIMP SMTC Plugin (Windows)', url: 'https://aimp.ru/?do=catalog&rec_id=1097' }],
    category: 'listeners', urlSkip: true
});

// ── Web browsers ──────────────────────────────────────────────────────────────
ws.get('_browser_header', null, 'string', {
    uiType: 'header', label: 'Web Browsers',
    desc: 'All browsers report to SMTC/MPRIS natively. Album art quality is low (thumbnail only).',
    category: 'listeners', urlSkip: true
});
const npListenChrome = ws.get('npListenChrome', false, 'boolean', { uiType: 'toggle', label: 'Listen to Chrome / Chromium', category: 'listeners' });
const npListenEdge = ws.get('npListenEdge', false, 'boolean', { uiType: 'toggle', label: 'Listen to Edge', category: 'listeners' });
const npListenFirefox = ws.get('npListenFirefox', false, 'boolean', { uiType: 'toggle', label: 'Listen to Firefox', category: 'listeners' });
const npListenOpera = ws.get('npListenOpera', false, 'boolean', { uiType: 'toggle', label: 'Listen to Opera', category: 'listeners' });
const npListenBrave = ws.get('npListenBrave', false, 'boolean', { uiType: 'toggle', label: 'Listen to Brave', category: 'listeners' });

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
    // Master override
    if (npListenAll) return true;

    // If no apps are explicitly selected, listen to everything (default behaviour)
    const anySelected =
        npListenSpotify || npListenApple || npListeniTunes || npListenQobuz ||
        npListenTidal || npListenDeezer || npListenYTM || npListenAmazon ||
        npListenSoundcloud || npListenPretzel ||
        npListenVLC || npListenMPV || npListenWMP || npListenMpcHc ||
        npListenMusicBee || npListenWinamp || npListenFoobar || npListenAIMP ||
        npListenChrome || npListenEdge || npListenFirefox || npListenOpera ||
        npListenBrave;
    if (!anySelected) return true;

    // Whitelist mode — only allow explicitly selected apps
    const n = (appName || '').toLowerCase();
    if (n.includes('spotify')) return npListenSpotify;
    if (n.includes('apple') && !n.includes('itunes')) return npListenApple;
    if (n.includes('cider')) return npListenApple;
    if (n.includes('itunes')) return npListeniTunes;
    if (n.includes('qobuz')) return npListenQobuz;
    if (n.includes('tidal')) return npListenTidal;
    if (n.includes('deezer')) return npListenDeezer;
    if (n.includes('youtube') || n.includes('ytm') || n.includes('pear') ||
        n.includes('ytmdesktop')) return npListenYTM;
    if (n.includes('amazon')) return npListenAmazon;
    if (n.includes('soundcloud')) return npListenSoundcloud;
    if (n.includes('pretzel')) return npListenPretzel;
    if (n.includes('vlc')) return npListenVLC;
    if (n.includes('mpv')) return npListenMPV;
    if (n.includes('windows media') || n.includes('wmplayer')) return npListenWMP;
    if (n.includes('mpc') || n.includes('media player classic')) return npListenMpcHc;
    if (n.includes('musicbee')) return npListenMusicBee;
    if (n.includes('winamp')) return npListenWinamp;
    if (n.includes('foobar')) return npListenFoobar;
    if (n.includes('aimp')) return npListenAIMP;
    if (n.includes('chrome') || n.includes('chromium')) return npListenChrome;
    if (n.includes('msedge') || n === 'edge') return npListenEdge;
    if (n.includes('firefox')) return npListenFirefox;
    if (n.includes('opera')) return npListenOpera;
    if (n.includes('brave')) return npListenBrave;
    return false; // not in whitelist
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