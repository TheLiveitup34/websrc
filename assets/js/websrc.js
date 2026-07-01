(function () {
    if (window.obsstudio ||
        ['obs', 'xsplit', 'meld'].some(s => navigator.userAgent.toLowerCase().includes(s))) {

        const key = 'websrc_reloaded_at';
        const last = localStorage.getItem(key);
        const now = Date.now();

        localStorage.setItem(key, now);

        if (!last || (now - Number(last)) > 3000) {
            const meta = document.createElement('meta');
            meta.httpEquiv = "refresh";
            meta.content = "0";
            document.head.appendChild(meta);
        }
    }
})();
class InputValidator {
    constructor() {
        this.params = new Map();
        this.fragmentParams = new Map();
        this._parseURL();
    }

    /**
     * Parse URL query string and fragment parameters
     * @private
     */
    _parseURL() {
        // Parse query string
        const searchParams = new URLSearchParams(window.location.search);
        for (const [key, value] of searchParams) {
            this.params.set(key, value);
        }

        // Parse fragment (hash) parameters
        const hash = window.location.hash.substring(1);
        if (hash) {
            const fragmentParams = new URLSearchParams(hash);
            for (const [key, value] of fragmentParams) {
                this.fragmentParams.set(key, value);
            }
        }
    }

    /**
     * Remove all script tags, event handlers, and javascript: protocols
     * @private
     * @param {string} input - Raw input string
     * @returns {string} Sanitized string
     */
    _stripJavaScript(input) {
        if (typeof input !== 'string') return '';

        let sanitized = input;

        // Remove script tags and their content
        sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        // Remove event handlers (onclick, onerror, onload, etc.)
        sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
        sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

        // Remove javascript: protocol
        sanitized = sanitized.replace(/javascript:/gi, '');

        // Remove data: protocol (can be used for XSS)
        sanitized = sanitized.replace(/data:text\/html/gi, '');

        // Remove vbscript: protocol
        sanitized = sanitized.replace(/vbscript:/gi, '');

        // Remove any attempts to use HTML entities to obfuscate javascript
        sanitized = sanitized.replace(/&#(x)?0*([0-9a-f]{2,});?/gi, (match, hex, code) => {
            const num = hex ? parseInt(code, 16) : parseInt(code, 10);
            // Block common XSS characters
            if ([60, 62, 34, 39, 47].includes(num)) return '';
            return match;
        });

        return sanitized;
    }

    /**
     * Validate input based on type
     * @private
     * @param {string} value - Value to validate
     * @param {Function|string} typeValidation - Validation function or type string
     * @returns {*} Validated value or null if invalid
     */
    _validateType(value, typeValidation) {
        // If typeValidation is a function, use it
        if (typeof typeValidation === 'function') {
            try {
                return typeValidation(value);
            } catch (error) {
                console.warn('Type validation function threw error:', error);
                return null;
            }
        }

        // Built-in type validation
        switch (typeValidation) {
            case 'string':
                return String(value);

            case 'number':
                const num = Number(value);
                return isNaN(num) ? null : num;

            case 'integer':
                const int = parseInt(value, 10);
                return isNaN(int) ? null : int;

            case 'float':
                const float = parseFloat(value);
                return isNaN(float) ? null : float;

            case 'boolean':
                if (value === 'true' || value === '1') return true;
                if (value === 'false' || value === '0') return false;
                return null;

            case 'alphanumeric':
                return /^[a-zA-Z0-9]+$/.test(value) ? value : null;

            case 'alpha':
                return /^[a-zA-Z]+$/.test(value) ? value : null;

            case 'numeric':
                return /^[0-9]+$/.test(value) ? value : null;

            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;

            case 'url':
                try {
                    new URL(value);
                    return value;
                } catch {
                    return null;
                }

            default:
                return value;
        }
    }

    /**
     * Get parameter from query string, fragment, or both
     * @param {string} name - Parameter name
     * @param {*} fallback - Fallback value if parameter doesn't exist
     * @param {Function|string} typeValidation - Type validation (function or string)
     * @param {Object} options - Options object
     * @param {string} options.source - 'query', 'fragment', or 'both' (default: 'both')
     * @param {string} options.priority - 'query' or 'fragment' when source is 'both' (default: 'query')
     * @returns {*} Sanitized and validated parameter value
     */
    get(name, fallback = null, typeValidation = 'string', options = {}) {
        const { source = 'both', priority = 'query' } = options;

        let value = null;

        // Determine which source(s) to check
        if (source === 'both') {
            // Check priority source first
            if (priority === 'query') {
                value = this.params.get(name) || this.fragmentParams.get(name);
            } else {
                value = this.fragmentParams.get(name) || this.params.get(name);
            }
        } else if (source === 'fragment') {
            value = this.fragmentParams.get(name);
        } else {
            value = this.params.get(name);
        }

        // Return fallback if not found
        if (value === null || value === undefined) {
            return fallback;
        }

        // Strip JavaScript/XSS attempts
        value = this._stripJavaScript(value);

        // Apply type validation
        const validated = this._validateType(value, typeValidation);

        // Treat NaN, null, and undefined as validation failures
        if (validated === null || validated === undefined || (typeof validated === 'number' && isNaN(validated))) {
            return fallback;
        }

        return validated;
    }

    /**
     * Get parameter only from query string
     * @param {string} name - Parameter name
     * @param {*} fallback - Fallback value
     * @param {Function|string} typeValidation - Type validation
     * @returns {*} Sanitized and validated parameter value
     */
    getQuery(name, fallback = null, typeValidation = 'string') {
        return this.get(name, fallback, typeValidation, { source: 'query' });
    }

    /**
     * Get parameter only from fragment (hash)
     * @param {string} name - Parameter name
     * @param {*} fallback - Fallback value
     * @param {Function|string} typeValidation - Type validation
     * @returns {*} Sanitized and validated parameter value
     */
    getFragment(name, fallback = null, typeValidation = 'string') {
        return this.get(name, fallback, typeValidation, { source: 'fragment' });
    }

    /**
     * Sanitize HTML - user must provide their own implementation
     * This is a placeholder that does basic entity encoding
     * @param {string} html - HTML string to sanitize
     * @param {Function} customSanitizer - Custom sanitization function
     * @returns {string} Sanitized HTML
     */
    sanitizeHTML(html, customSanitizer = null) {
        if (customSanitizer && typeof customSanitizer === 'function') {
            return customSanitizer(html);
        }

        // Default: strip all JavaScript and encode HTML entities
        let sanitized = this._stripJavaScript(html);

        // Basic HTML entity encoding for remaining content
        const entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;'
        };

        return sanitized.replace(/[&<>"'\/]/g, char => entityMap[char]);
    }

    /**
     * Sanitize CSS - user must provide their own implementation
     * This is a placeholder that removes dangerous CSS
     * @param {string} css - CSS string to sanitize
     * @param {Function} customSanitizer - Custom sanitization function
     * @returns {string} Sanitized CSS
     */
    sanitizeCSS(css, customSanitizer = null) {
        if (customSanitizer && typeof customSanitizer === 'function') {
            return customSanitizer(css);
        }

        // Default: remove dangerous CSS properties and functions
        let sanitized = css;

        // Remove javascript: URLs in CSS
        sanitized = sanitized.replace(/javascript:/gi, '');

        // Remove expressions (IE specific)
        sanitized = sanitized.replace(/expression\s*\(/gi, '');

        // Remove import statements
        sanitized = sanitized.replace(/@import/gi, '');

        // Remove behavior (IE specific)
        sanitized = sanitized.replace(/behavior:/gi, '');

        // Remove -moz-binding (Firefox specific)
        sanitized = sanitized.replace(/-moz-binding:/gi, '');

        // Remove data: URLs
        sanitized = sanitized.replace(/url\s*\(\s*["']?data:/gi, 'url(');

        return sanitized;
    }

    /**
     * Check if parameter exists
     * @param {string} name - Parameter name
     * @param {Object} options - Options object
     * @param {string} options.source - 'query', 'fragment', or 'both' (default: 'both')
     * @returns {boolean}
     */
    has(name, options = {}) {
        const { source = 'both' } = options;

        if (source === 'both') {
            return this.params.has(name) || this.fragmentParams.has(name);
        } else if (source === 'fragment') {
            return this.fragmentParams.has(name);
        } else {
            return this.params.has(name);
        }
    }

    /**
     * Get all parameters as object
     * @param {Object} options - Options object
     * @param {string} options.source - 'query', 'fragment', or 'both' (default: 'both')
     * @param {boolean} options.sanitize - Apply JavaScript stripping (default: true)
     * @param {string} options.priority - 'query' or 'fragment' when source is 'both' (default: 'query')
     * @returns {Object}
     */
    getAll(options = {}) {
        const { source = 'both', sanitize = true, priority = 'query' } = options;
        const result = {};

        if (source === 'both') {
            // Merge both sources with priority
            const first = priority === 'query' ? this.params : this.fragmentParams;
            const second = priority === 'query' ? this.fragmentParams : this.params;

            for (const [key, value] of second) {
                result[key] = sanitize ? this._stripJavaScript(value) : value;
            }
            for (const [key, value] of first) {
                result[key] = sanitize ? this._stripJavaScript(value) : value;
            }
        } else if (source === 'fragment') {
            for (const [key, value] of this.fragmentParams) {
                result[key] = sanitize ? this._stripJavaScript(value) : value;
            }
        } else {
            for (const [key, value] of this.params) {
                result[key] = sanitize ? this._stripJavaScript(value) : value;
            }
        }

        return result;
    }

    /**
     * Refresh parameters from current URL
     */
    refresh() {
        this.params.clear();
        this.fragmentParams.clear();
        this._parseURL();
    }
}
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = InputValidator;
} else {
    window.InputValidator = InputValidator;
}

class WebSRC {
    #broadcastChannel;
    _listeners = {};
    _initializedRelays = new Set();
    _clientListeners = {};
    _clients = {};
    _statusTimeOut = null;
    _streamerBotPlatforms = []
    _kickEnabled = false;
    _twitchEnabled = false;
    _relayID = null;
    _requiredParameters = [];
    _registeredCommands = [];
    emotes = [];
    badges = [];
    _emoteCache = {};
    _badgeCache = {};
    constructor(options = {}) {
        this._params = new InputValidator();
        this._scripts = [...new Set(['relay', 'broadcastsystem', 'websrcclient', 'polling', 'kickwsclient', 'twitchircclient', 'tikfinityclient', 'https://cdn.jsdelivr.net/npm/@streamerbot/client/dist/streamerbot-client.js', 'search', ...options.scripts || []])];
        delete options.scripts;
        this._options = {
            autoConnect: options.autoConnect || true,
            // platforms: null means all platforms allowed (default, fully backward-compatible).
            // platforms: ['streamerbot'] means ONLY Streamer.bot initialises; every other
            // platform client and its UI schema registrations are skipped entirely.
            platforms: options.platforms || null,
            // ── Shared Chat ───────────────────────────────────────────────────
            // false (default) = filter out messages from shared chat guests
            // true            = allow messages from shared chat guests through
            sharedChat: options.sharedChat !== undefined ? options.sharedChat : false,
            // ─────────────────────────────────────────────────────────────────
            streamerbot: {
                disableOnTwitchChat: true,
                disableOnKickChat: false,
                ...options.streamerbot || {}
            },
            kick: {
                ...options.kick || {}
            },
            twitch: {
                ...options.twitch || {}
            },
            tikfinity: {
                ...options.tikfinity || {}
            },
            relay: {
                ...options.relay || {}
            },
            emotes: {
                sevenTV: true,
                bttv: true,
                ffz: true,
                cheermotes: true,
                cacheTTL: 600000,
                autoload: true,
                ...options.emotes || {}
            }
        };
        this.#broadcastChannel = document.querySelector('meta[name="websrc-broadcast-channel"]') ? document.querySelector('meta[name="websrc-broadcast-channel"]').getAttribute('content') : false;
        // remove broadcast channel meta tag to prevent conflicts with other instances of WebSRC
        if (this.#broadcastChannel) {
            const metaTag = document.querySelector('meta[name="websrc-broadcast-channel"]');
            if (metaTag) {
                metaTag.remove();
            }
        }


        this._loadScripts();
        window.addEventListener('beforeunload', () => {
            this.disconnect();
        });

        if (window.self === window.top) {
            console.debug('[WebSRC] Running in top-level window, setting up popstate listener for URL changes.');
            window.addEventListener('popstate', () => {
                let link = document.createElement('a');
                link.href = window.location.href;
                link.rel = 'noopener noreferrer';
                link.click();
                console.debug('[WebSRC] Popstate event detected, reloading page to apply new URL parameters:', window.location.href);
            });
        }
        window.addEventListener('pageshow', (e) => {
            console.debug('[WebSRC] Page show event detected. Persisted:', e);
            if (e.persisted) {
                // e.persisted = true means restored from cache, not a fresh load
                const meta = document.createElement('meta');
                meta.httpEquiv = "refresh";
                meta.content = "0";
                document.head.appendChild(meta);
            }
        });
    }

    async _initialize() {
        this.get("_channel_platforms_header", null, "string", { uiType: "header", label: "Platforms", desc: "Enter your username on each platform you stream to.", category: "channel", urlSkip: true });

        this.get("_cmd_prefix_header", null, "string", { uiType: "header", label: "Command settings", category: "cmd", urlSkip: true });

        // _cmd_viewer_header, _cmd_mod_header, and _cmd_ref_header are now
        // injected automatically by _extractCommandParams() — no manual calls needed.


        // ── Platforms (direct WebSocket connections) ───────────────────────────
        // Registered first so any widget that uses the integrations category
        // gets these automatically — no ws.get() calls needed in the overlay.
        // Only show the standalone IRC/WebSocket platform section when at
        // least one of those platforms is in the allowlist.
        if (this._platformAllowed('twitch') || this._platformAllowed('kick')) {
            this.get("_integrations_platforms_header", null, "string", {
                uiType: "header", label: "Platforms",
                desc: "Enter your username to connect directly — no Streamer.bot required.",
                category: "integrations", urlSkip: true
            });
            if (this._platformAllowed('twitch')) {
                this.get("twitch", "", "string", {
                    label: "Twitch",
                    desc: "Your Twitch username. Connects via IRC.",
                    uiType: "platform", placeholder: "twitch_username",
                    meta: { bg: "#9146FF", letter: "T", ink: "#fff" },
                    category: "integrations"
                });
            }
            if (this._platformAllowed('kick')) {
                this.get("kick", "", "string", {
                    label: "Kick",
                    desc: "Your Kick username. Connects via WebSocket.",
                    uiType: "platform", placeholder: "kick_username",
                    meta: { bg: "#53FC18", letter: "K", ink: "#111" },
                    category: "integrations"
                });
            }
        }

        // ── Streamer.bot ────────────────────────────────────────────────────
        this.get("_integrations_sb_header", null, "string", {
            uiType: "header", label: "Streamer.bot",
            desc: "Connect to a local Streamer.bot instance for YouTube, TikTok, and advanced Twitch/Kick features.",
            category: "integrations", urlSkip: true
        });
        this.get("_integrations_sb_info", null, "string", {
            uiType: "collapsable",
            type: "collapsable",
            label: "How to connect Streamer.bot?",
            name: "streamerbot",
            children: [
                {
                    type: "info",
                    label: "How to connect Streamer.bot",
                    highlight: true,
                    desc: `1. Download and install Streamer.bot from the link below if you haven't already. It's free and open-source.

            2. Open Streamer.bot and go to
             "Servers/Clients" > "WebSocket Server".
              Enable the WebSocket server under "Server Status" and enable "Auto Start" if you want it to start automatically with Streamer.bot.

            3. If you need to change the  Address or Port make sure to update those settings in the WebSRC Streamer.bot integration section below.

            4. (Optional) If you set a password in Streamer.bot, enter it in the WebSRC settings. The password is stored in the URL fragment and the URL fragment never leaves your browser, so it's safe and WebSRC will never see your password. 

           Note: You will have to connect your accounts with Streamer.bot under 
           "Platforms" > "Twitch/Kick/YouTube"
            for Streamer.bot to receive events from those platforms. 
           
           For Twitch and Kick you can also connect via IRC/WebSocket without Streamer.bot, but using Streamer.bot allows you to receive additional events like raids, shoutouts, and more detailed subscriber/donation info on Twitch.
           `,
                    links: [
                        { label: "Streamer.bot download", url: "https://streamer.bot/downloads" },
                        { label: "Streamer.bot Startup Guide", url: "https://docs.streamer.bot/get-started/setup" },
                    ]
                }
            ],
            category: "integrations", urlSkip: true
        });
        this.get('streamerbot', false, "boolean", {
            label: "Enable Streamer.bot", uiType: "toggle",
            category: "integrations"
        });
        const sbAddress = this.get('address', "127.0.0.1", "string", {
            label: "Streamer.bot IP",
            desc: "IP of the machine running Streamer.bot.",
            uiType: "text", placeholder: "127.0.0.1",
            category: "integrations"
        });
        const sbPort = this.get('port', 8080, "number", {
            label: "Streamer.bot port",
            uiType: "number", min: 1, max: 65535, step: 1,
            category: "integrations"
        });
        this.get("sbpassword", "", "string", {
            label: "Streamer.bot password",
            desc: "Optional — only required if your Streamer.bot instance has a password set. Stored in the URL fragment so it never appears in your shareable link.",
            uiType: "text", placeholder: "leave blank if not set",
            feature: "streamerbot", category: "integrations", urlFragment: true
        });

        if (this._platformAllowed('streamerbot') && (this.get('streamerbot', false, "boolean") || (this._options.streamerbot.disableOnTwitchChat === false && this._options.streamerbot.disableOnKickChat === false))) {

            if (typeof StreamerbotClient === 'undefined') {
                console.error('StreamerbotClient is not defined. Please make sure the Streamerbot client script is included and loaded before initializing WebSRC with Streamerbot support.');
                return;
            }
            const sboptions = {
                host: sbAddress,
                port: sbPort,
                immediate: this._options.streamerbot.immediate || false,
                onConnect: async (data) => {
                    console.debug('[WebSRC] Streamer.bot connected:', data);
                    this.emit('connected', ['streamerbot', data]);
                    console.debug('[WebSRC] Requesting broadcaster info via GetBroadcaster...');
                    let broadcastData = await this._clients.streamerbot.getBroadcaster();
                    console.debug('[WebSRC] GetBroadcaster response:', broadcastData);
                    this._streamerBotPlatforms = broadcastData.connected || [];
                    console.debug('[WebSRC] Connected platforms:', this._streamerBotPlatforms);
                    this._setConnectionStatus(true, ["streamerbot", ...this._streamerBotPlatforms]);
                    if (this._options.emotes.autoload !== false) {
                        this._autoloadEmotes();
                    }
                },
                onDisconnect: (data) => {
                    console.warn('[WebSRC] Streamer.bot disconnected:', data);
                    this.emit('disconnected', ['streamerbot', data]);
                    this._setConnectionStatus(false, ["streamerbot", ...this._streamerBotPlatforms]);
                },
                onError: (error) => {
                    console.error('[WebSRC] Streamer.bot error:', error);
                    this.emit('error', ['streamerbot', error]);
                },
                ...this._options.streamerbot
            };
            if (this.get('sbpassword', false, "string", { priority: 'fragment' })) {
                sboptions.password = this.get('sbpassword', false, "string", { priority: 'fragment' });
            }
            this._clients.streamerbot = new StreamerbotClient(sboptions);
        }

        // ── TikFinity ───────────────────────────────────────────────────────
        if (this._platformAllowed('tiktok')) {
            this.get("_integrations_tiktok_header", null, "string", {
                uiType: "header", label: "TikTok / TikFinity",
                desc: "TikFinity is a free, open-source TikTok bot client that allows us to receive TikTok events. It must be running locally for WebSRC to connect to it.",
                category: "integrations", urlSkip: true
            });
            this.get("_integrations_tikfinity_info", null, "string", {
                uiType: "collapsable",
                type: "collapsable",
                label: "How to connect TikFinity?",
                name: "tikfinity",
                children: [
                    {
                        type: "info",
                        label: "How to connect TikFinity",
                        highlight: true,
                        desc: `1. Download and install TikFinity from the link below if you haven't already. It's free and open-source.

            2. Run Tikfinity and make sure to set the TikTok account you want to connect to in the TikFinity settings. TikFinity must be running locally so WebSRC can connect to it.

            Note: If you want to have TikFinity comunicate with chat TikTok Chat, look at the "Comunication" tab under "Setup".
           `,
                        links: [
                            { label: "TikFinity download", url: "https://tikfinity.zerody.one/app/" }
                        ]
                    }
                ],
                category: "integrations", urlSkip: true
            });
            this.get('tiktok', false, "boolean", {
                label: "Enable TikFinity", uiType: "toggle",
                category: "integrations"
            });
            if (this.get('tiktok', false, "boolean")) {
                if (typeof TikFinityClient === 'undefined') {
                    console.error('TikFinityClient is not defined. Please make sure the TikFinity client script is included and loaded before initializing WebSRC with TikTok support.');
                    return;
                }
                let tikOptions = {
                    host: this.get('tikfinityHost', "localhost", "string", {
                        label: "TikFinity host", uiType: "text", placeholder: "localhost",
                        category: "integrations"
                    }),
                    port: this.get('tikfinityPort', 21213, "number", {
                        label: "TikFinity port", uiType: "number", min: 1, max: 65535, step: 1,
                        category: "integrations"
                    }),
                    ...this._options.tikfinity
                };
                this._clients.tikfinity = new TikFinityClient(tikOptions);
                this._clients.tikfinity.on('connected', () => {
                    this.emit('connected', ['tikfinity', {}]);
                    this._setConnectionStatus(true, ['tiktok']);
                });
                this._clients.tikfinity.on('disconnected', data => {
                    this.emit('disconnected', ['tikfinity', data]);
                    this._setConnectionStatus(false, ['tiktok']);
                });
                this._clients.tikfinity.on('error', error => {
                    this.emit('error', ['tikfinity', error]);
                });
            } else {
                // Register TikFinity host/port schema even when disabled so they
                // appear in the UI and can be configured before enabling TikTok.
                this.get('tikfinityHost', "localhost", "string", {
                    label: "TikFinity host", uiType: "text", placeholder: "localhost",
                    category: "integrations"
                });
                this.get('tikfinityPort', 21213, "number", {
                    label: "TikFinity port", uiType: "number", min: 1, max: 65535, step: 1,
                    category: "integrations"
                });
            }
        } // end _platformAllowed('tiktok')

        if (this._platformAllowed('twitch') && this.get('twitch', false, "string")) {
            if (typeof TwitchIRCClient === 'undefined') {
                console.error('TwitchIRCClient is not defined. Please make sure the Twitch IRC client script is included and loaded before initializing WebSRC with Twitch support.');
                return;
            }
            this._twitchEnabled = true;
            this._clients.twitch = new TwitchIRCClient({ channel: this.get('twitch', false, "string") });

            this._clients.twitch.on('connected', () => {
                this.emit('connected', ['twitch', {}]);
                this._setConnectionStatus(true, ['twitch']);
            });
            this._clients.twitch.on('disconnected', data => {
                this.emit('disconnected', ['twitch', data]);
                this._setConnectionStatus(false, ['twitch']);
            });
            this._clients.twitch.on('error', error => {
                this.emit('error', ['twitch', error]);
            });
        }

        if (this._platformAllowed('kick') && this.get('kick', false, "string")) {
            if (typeof KickClient === 'undefined') {
                console.error('KickClient is not defined. Please make sure the Kick WebSocket client script is included and loaded before initializing WebSRC with Kick support.');
                return;
            }
            this._kickEnabled = true;
            this._clients.kick = new KickClient(this.get('kick', false, "string"));
            this._clients.kick.on('open', data => {
                this.emit('connected', ['kick', data]);
                this._setConnectionStatus(true, ['kick']);
            });
            this._clients.kick.on('close', data => {
                this.emit('disconnected', ['kick', data]);
                this._setConnectionStatus(false, ['kick']);
            });
            this._clients.kick.on('error', error => {
                this.emit('error', ['kick', error]);
            });
        }

        if (this.#broadcastChannel) {
            if (typeof BroadcastSystem === 'undefined') {
                console.error('BroadcastSystem is not defined. Please make sure the BroadcastSystem script is included and loaded before initializing WebSRC with broadcast channel support.');
                return;
            }
            this._clients.broadcast = new BroadcastSystem().channel(this.#broadcastChannel);
        }

        if (this._platformAllowed('streamdeck')) {
            // ── Stream Deck ─────────────────────────────────────────────────────
            this.get("_integrations_sd_header", null, "string", {
                uiType: "header", label: "Stream Deck",
                desc: "Install the WebSRC plugin from the Elgato Marketplace or GitHub to enable Stream Deck integration.",
                category: "integrations", urlSkip: true
            });
            this.get("_integrations_sd_info", null, "string", {
                uiType: "collapsable",
                type: "collapsable",
                label: "How to connect Stream Deck?",
                name: "streamdeck",
                children: [
                    {
                        type: "info",
                        label: "How to connect Stream Deck",
                        highlight: true,
                        desc: `If you have a stream deck, you can use the WebSRC Integration plugin to control your overlays and widgets directly from your Stream Deck.

                1. Download and install the Stream Deck software from the link below if you haven't already.

                2. Download and install the WebSRC Integration plugin from the Elgato Marketplace or GitHub.

                3. Open the Stream Deck software and add the WebSRC Integration plugin to your Stream Deck.
                
                You can now use the WebSRC Integration plugin to control your overlays and widgets directly from your Stream Deck.

                Note: GitHub releases may be more up-to-date than the Elgato Marketplace. If you have any issues with the plugin, please check the GitHub page for the latest version and report any issues there.
           `,
                        links: [
                            { label: "Stream Deck Software download", url: "https://www.elgato.com/us/en/s/stream-deck-app" },
                            { label: "Plugin download", url: "https://marketplace.elgato.com/product/websrc-integration-35520e81-5c8d-4ebe-b187-a4e2a6e06dbe" },
                            { label: "Plugin GitHub", url: "https://github.com/TheLiveitup34/Stream-Deck-Integration/releases/latest/download/com.theliveitup34.websrc-integration.streamDeckPlugin" }
                        ]
                    }
                ],
                category: "integrations", urlSkip: true
            });
            this.get('streamdeck', false, "boolean", {
                label: "Enable Stream Deck", uiType: "toggle",
                category: "integrations"
            });
            this.get('sdip', "127.0.0.1", "string", {
                label: "Stream Deck IP", uiType: "text", placeholder: "127.0.0.1",
                category: "integrations"
            });
            this.get('sdport', 3080, "number", {
                label: "Stream Deck port", uiType: "number", min: 1, max: 65535, step: 1,
                category: "integrations"
            });
            this.get('sdupdate', "", "string", {
                label: "Update Stream Deck port",
                desc: "Sends the current port to the Stream Deck plugin via deeplink. The plugin will restart — this may take up to 30 seconds.",
                uiType: "streamdeck", feature: "streamdeck",
                marketplace: "https://marketplace.elgato.com/product/websrc-integration-35520e81-5c8d-4ebe-b187-a4e2a6e06dbe",
                github: "https://github.com/TheLiveitup34/Stream-Deck-Integration/releases/latest/download/com.theliveitup34.websrc-integration.streamDeckPlugin",
                category: "integrations"
            });
            if (this._platformAllowed('streamdeck') && this.get('streamdeck', false, "boolean")) {
                if (typeof WebsrcClient === 'undefined') {
                    console.error('WebsrcClient is not defined. Please make sure the WebsrcClient script is included and loaded before initializing WebSRC with StreamDeck support.');
                    return;
                }
                this._clients.streamdeck = new WebsrcClient({ host: this.get('sdip', "127.0.0.1", "string"), port: this.get('sdport', 3080, "number"), autoConnect: false, ...this._options.streamdeck });

                this._clients.streamdeck.on('ready', () => {
                    this.emit('connected', ['streamdeck', {}]);
                    this._setConnectionStatus(true, ['streamdeck']);
                });
                this._clients.streamdeck.on('disconnect', data => {
                    this.emit('disconnected', ['streamdeck', data]);
                    this._setConnectionStatus(false, ['streamdeck']);
                });
                this._clients.streamdeck.on('error', error => {
                    this.emit('error', ['streamdeck', error]);
                });
            }
        } // end _platformAllowed('streamdeck')

        for (const client in this._clientListeners) {
            if (this._clients[client]) {
                for (const eventName in this._clientListeners[client]) {
                    this._clientListeners[client][eventName].forEach(callback => {
                        this._clients[client].on(eventName, callback);
                    });
                }
                delete this._clientListeners[client];
            }
        }


        if (this._options.autoConnect) {
            console.debug('[WebSRC] Auto-connect is enabled, connecting to clients...');
            this.connect();
        }

        if (this._platformAllowed('relay') && this._options.relay && this._options.relay.autoConnect === true) {
            this.initializeRelay();
        }
        // Autoload emotes/badges for direct clients (no Streamer.bot)
        // Streamer.bot path triggers from onConnect instead
        if (this._options.emotes.autoload !== false && !this._clients.streamerbot) {
            this._autoloadEmotes();
        }


        this.emit('ready');
    }

    _autoloadEmotes() {
        let self = this;

        if (self._clients.streamerbot) {
            console.debug('[WebSRC] _autoloadEmotes: using Streamer.bot path. Connected platforms:', self._streamerBotPlatforms);

            // Only attempt TwitchGetEmotes if Twitch is actually connected in Streamer.bot
            if (self._streamerBotPlatforms.indexOf('twitch') !== -1) {
                console.debug('[WebSRC] Autoloading Twitch emotes via Streamer.bot...');
                self.getEmotes('twitch').catch(function (e) {
                    console.warn('[WebSRC] autoload Twitch emotes failed:', e);
                });
                console.debug('[WebSRC] Autoloading Twitch badges via Streamer.bot...');
                self.getBadges('twitch').catch(function (e) {
                    console.warn('[WebSRC] autoload Twitch badges failed:', e);
                });
            } else {
                console.warn('[WebSRC] Skipping TwitchGetEmotes — Twitch is not in connected platforms:', self._streamerBotPlatforms);
            }

            // Load Kick emotes if Kick is a connected platform
            if (self._streamerBotPlatforms.indexOf('kick') !== -1) {
                console.debug('[WebSRC] Kick is connected, resolving Kick username from GetBroadcaster...');
                self._clients.streamerbot.getBroadcaster().then(function (res) {
                    console.debug('[WebSRC] GetBroadcaster (Kick username lookup):', res);
                    let platforms = res.platforms || {};
                    let kickData = platforms.kick || {};
                    let kickUser = kickData.broadcasterLogin || kickData.broadcasterUserName || null;
                    if (kickUser) {
                        console.debug('[WebSRC] Autoloading Kick emotes for user:', kickUser);
                        self.getEmotes('kick', kickUser).catch(function (e) {
                            console.warn('[WebSRC] autoload Kick emotes failed:', e);
                        });
                    } else {
                        console.warn('[WebSRC] Could not resolve Kick username from GetBroadcaster response:', res);
                    }
                }).catch(function (e) {
                    console.warn('[WebSRC] GetBroadcaster failed during Kick emote autoload:', e);
                });
            } else {
                console.debug('[WebSRC] Skipping Kick emotes — Kick is not in connected platforms.');
            }
            return;
        }

        // Direct Twitch IRC client — username is the channel param
        let twitchUser = self._params ? self._params.get('twitch', false, 'string') : null;
        if (twitchUser) {
            console.debug('[WebSRC] _autoloadEmotes: direct Twitch IRC path, user:', twitchUser);
            self.getEmotes('twitch', twitchUser).catch(function (e) {
                console.warn('[WebSRC] autoload Twitch emotes failed:', e);
            });
            self.getBadges('twitch', twitchUser).catch(function (e) {
                console.warn('[WebSRC] autoload Twitch badges failed:', e);
            });
        }

        // Direct Kick WS client — username is the kick param
        let kickUser = self._params ? self._params.get('kick', false, 'string') : null;
        if (kickUser) {
            console.debug('[WebSRC] _autoloadEmotes: direct Kick WS path, user:', kickUser);
            self.getEmotes('kick', kickUser).catch(function (e) {
                console.warn('[WebSRC] autoload Kick emotes failed:', e);
            });
        }
    }

    _loadScripts() {
        if (!this._scripts || !Array.isArray(this._scripts)) {
            console.error('Invalid scripts array provided to WebSRC');
            return;
        }
        let scriptCount = this._scripts.length;
        let scriptsLoaded = 0;
        this._scripts.forEach(script => {
            if (script.trim() === '') {
                scriptCount--;
                return;
            }
            // check if the script is already loaded
            // grab all script tags with src and strtolower check if the file exists
            let scriptsExisting = document.querySelectorAll('script[src]');
            for (let i = 0; i < scriptsExisting.length; i++) {
                let existingSrc = scriptsExisting[i].getAttribute('src');
                if (existingSrc && existingSrc.toLowerCase().includes(script.toLowerCase())) {
                    scriptsLoaded++;
                    if (scriptsLoaded === scriptCount) {

                        this._initialize();
                    }
                    return;
                }
            }
            const scriptElement = document.createElement('script');
            // check if the script is a URL or a local file            
            if ((script.startsWith('http://') || script.startsWith('https://') || script.startsWith('//')) && (script.endsWith('.js') || script.endsWith('.min.js')) && (script.includes('unpkg.com') || script.includes('cdn.jsdelivr.net') || script.includes('cdnjs.cloudflare.com') || script.includes('code.jquery.com'))) {
                scriptElement.src = script;
            } else {
                scriptElement.src = `/assets/js/${script.split('/').pop()}.js`;
            }
            document.head.appendChild(scriptElement);
            scriptElement.onload = () => {
                scriptsLoaded++;
                // scriptElement.remove();
                if (scriptsLoaded === scriptCount) {
                    this._initialize();
                    return;
                }
            };
            scriptElement.onerror = () => {
                console.error(`Failed to load script: ${script}`);
            };
        });

    }

    initializeRelay(relayOptions = {}) {
        if (this._clients.relay) {
            console.warn('Relay client is already initialized.');
            return;
        }
        if (typeof Relay === 'undefined') {
            console.error('Relay is not defined. Please make sure the Relay client script is included and loaded before initializing the relay client.');
            return;
        }
        const url = window.location.href.split('?')[0].split('#')[0];
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            hash = (Math.imul(31, hash) + url.charCodeAt(i)) | 0;
        }
        const urlID = `RCID.${Math.abs(hash).toString(16)}`;
        const nodeName = this._options.relay.name || null;
        delete this._options.relay.name;
        relayOptions = {
            autoConnect: true,
            ...this._options.relay,
            ...relayOptions
        };
        this._clients.relay = new Relay(relayOptions);
        if (this._clientListeners['relay']) {
            for (const eventName in this._clientListeners['relay']) {
                this._clientListeners['relay'][eventName].forEach(callback => {
                    this._clients.relay.on(eventName, callback);
                });
            }
            delete this._clientListeners['relay'];
        }

        this._clients.relay.on('ready', id => {
            this._relayID = id;
            sessionStorage.setItem(urlID, id);
            this.emit('connected', ['relay', { id }]);
        });

        if (sessionStorage.getItem(urlID)) {
            this._clients.relay.init(sessionStorage.getItem(urlID), nodeName);
        } else {
            this._clients.relay.init(null, nodeName);
        }
    }

    _setConnectionStatus(connected, platforms = []) {
        if (this._statusTimeOut !== null) {
            clearTimeout(this._statusTimeOut);
        }
        let statusContainer = document.getElementById("statusContainer");
        if (!statusContainer) {
            return;
        }
        let statusContainerStatus = statusContainer.querySelector(".status");
        if (connected) {
            statusContainerStatus.innerText = "Connected!";
            statusContainer.classList.add('statusConnected');
            platforms.forEach(platform => {
                let currentPlatform = statusContainer.querySelector(`.${platform}`);
                if (currentPlatform) {
                    currentPlatform.classList.add('active');
                }
            });
            this._statusTimeOut = setTimeout(function () {
                statusContainer.classList.remove('statusConnected');
                statusContainer.style.opacity = 0;
            }, 2000);
        }
        else {
            statusContainerStatus.innerText = "Connecting...";
            statusContainer.classList.add('statusDisconnected');
            statusContainer.classList.remove('statusDisconnected');
            statusContainer.style.opacity = 1;
            platforms.forEach(platform => {
                let currentPlatform = statusContainer.querySelector(`.${platform}`);
                if (currentPlatform) {
                    currentPlatform.classList.remove('active');
                }
            });
        }
    }

    _initializeChatMessageRelay() {
        if (this._initializedRelays.has('chat')) return;
        this._initializedRelays.add('chat');
        if (this._twitchEnabled === false) {
            this.on('streamerbot.Twitch.ChatMessage', (data) => {
                // Filter out shared chat guest messages if sharedChat is disabled
                if (this._options.sharedChat === false && data.data && data.data.isFromSharedChatGuest) {
                    console.debug('[WebSRC] Dropping shared chat guest message (sharedChat disabled)');
                    return;
                }
                let messageData = {
                    bot: 'streamerbot',
                    platform: 'twitch',
                    type: 'message',
                    role: this._getRole(data.data.user),
                    data: data.data
                }
                this.emit('chatmessage', messageData);
                this.emit('chat', messageData);
            });

            this.on('streamerbot.Twitch.ChatMessageDeleted', (data) => {
                // Filter out shared chat guest deletions if sharedChat is disabled
                if (this._options.sharedChat === false && data.data && data.data.isFromSharedChatGuest) {
                    console.debug('[WebSRC] Dropping shared chat guest deletion (sharedChat disabled)');
                    return;
                }
                let messageData = {
                    bot: 'streamerbot',
                    platform: 'twitch',
                    type: 'messageDeleted',
                    deleted: true,
                    data: data.data
                }
                this.emit('chatmessage', messageData);
                this.emit('chat', messageData);
            });
        }
        this.on('streamerbot.Trovo.ChatMessage', (data) => {
            let messageData = {
                bot: 'streamerbot',
                platform: 'trovo',
                type: 'message',
                role: this._getRole(data.data.user),
                data: data.data
            }
            this.emit('chatmessage', messageData);
            this.emit('chat', messageData);
        });
        this.on('streamerbot.YouTube.Message', (data) => {
            let messageData = {
                bot: 'streamerbot',
                platform: 'youtube',
                type: 'message',
                role: this._getRole(data.data.user),
                data: data.data
            }
            this.emit('chatmessage', messageData);
            this.emit('chat', messageData);
        });
        this.on('streamerbot.YouTube.MessageDeleted', (data) => {
            let messageData = {
                bot: 'streamerbot',
                platform: 'youtube',
                type: 'messageDeleted',
                deleted: true,
                data: data.data
            }
            this.emit('chatmessage', messageData);
            this.emit('chat', messageData);
        });
        if (this._kickEnabled === false) {
            this.on('streamerbot.Kick.ChatMessage', (data) => {
                let messageData = {
                    bot: 'streamerbot',
                    platform: 'kick',
                    type: 'message',
                    role: this._getRole(data.data.user),
                    data: data.data
                }
                this.emit('chatmessage', messageData);
                this.emit('chat', messageData);
            });
            this.on('streamerbot.Kick.ChatMessageDeleted', (data) => {
                let messageData = {
                    bot: 'streamerbot',
                    platform: 'kick',
                    type: 'messageDeleted',
                    deleted: true,
                    data: data.data
                }
                this.emit('chatmessage', messageData);
                this.emit('chat', messageData);
            });
        }
        this.on('twitch.message', (data) => {
            let messageData = {
                bot: 'twitchIRC',
                platform: 'twitch',
                type: 'message',
                role: this._getRole(data.userData),
                data: data
            }
            this.emit('chatmessage', messageData);
            this.emit('chat', messageData);
        });
        this.on('twitch.clearmsg', (data) => {
            let messageData = {
                bot: 'twitchIRC',
                platform: 'twitch',
                type: 'messageDeleted',
                deleted: true,
                data: data
            }
            this.emit('chatmessage', messageData);
            this.emit('chat', messageData);
        });
        this.on('kick.chatMessage', (data) => {
            let messageData = {
                bot: 'kickWS',
                platform: 'kick',
                type: 'message',
                role: data.role,
                data: data
            }
            this.emit('chatmessage', messageData);
            this.emit('chat', messageData);
        });
        this.on('kick.messageDeleted', (data) => {
            let messageData = {
                bot: 'kickWS',
                platform: 'kick',
                type: 'messageDeleted',
                deleted: true,
                data: data
            }
            this.emit('chatmessage', messageData);
            this.emit('chat', messageData);
        });

        this.on('tikfinity.chat', (data) => {
            data.message = data.comment
            data.messageId = data.msgId
            let currentRole = "user"
            if (data.uniqueId.toLowerCase() == data.tikfinityUsername.toLowerCase()) {
                currentRole = "broadcaster"
            }
            if (data.isModerator && currentRole !== "user") {
                currentRole = "moderator"
            }
            if (data.isSubscriber && currentRole !== "user") {
                currentRole = "subscriber"
            }
            let messageData = {
                bot: 'tikfinity',
                platform: 'tiktok',
                type: 'message',
                role: currentRole,
                data: data
            }
            this.emit('chatmessage', messageData);
            this.emit('chat', messageData);
        });
        this.on('tikfinity.imDelete', (data) => {
            let messageData = {
                bot: 'tikfinity',
                platform: 'tiktok',
                type: 'messageDeleted',
                deleted: true,
                data: data
            }
            this.emit('chatmessage', messageData);
            this.emit('chat', messageData);
        });
    }

    _initializeFollowRelay() {
        if (this._initializedRelays.has('follow')) return;
        this._initializedRelays.add('follow');
        this.on("streamerbot.Twitch.Follow", (data) => {
            let followData = {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'follow',
                data: data.data
            }
            this.emit('follow', followData);
        });
        this.on("streamerbot.YouTube.NewSubscriber", (data) => {
            let followData = {
                bot: 'streamerbot',
                platform: 'youtube',
                type: 'follow',
                data: data.data
            }
            this.emit('follow', followData);
        });
        this.on("streamerbot.Trovo.Follow", (data) => {
            let followData = {
                bot: 'streamerbot',
                platform: 'trovo',
                type: 'follow',
                data: data.data
            }
            this.emit('follow', followData);
        });
        this.on("streamerbot.Kick.Follow", (data) => {
            let followData = {
                bot: 'streamerbot',
                platform: 'kick',
                type: 'follow',
                data: data.data
            }
            this.emit('follow', followData);
        });
        this.on("tikfinity.follow", (data) => {
            let followData = {
                bot: 'tikfinity',
                platform: 'tiktok',
                type: 'follow',
                data: data
            }
            this.emit('follow', followData);
        });
    }

    _initializeSubscriptionRelay() {
        if (this._initializedRelays.has('subscription')) return;
        this._initializedRelays.add('subscription');
        this.on("streamerbot.Twitch.Sub", (data) => {
            let subData = {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'subscription',
                data: data.data
            }
            this.emit('subscription', subData);
        });
        this.on("streamerbot.YouTube.NewSponsor", (data) => {
            let subData = {
                bot: 'streamerbot',
                platform: 'youtube',
                type: 'subscription',
                data: data.data
            }
            this.emit('subscription', subData);
        });
        this.on("streamerbot.Kick.Subscription", (data) => {
            let subData = {
                bot: 'streamerbot',
                platform: 'kick',
                type: 'subscription',
                data: data.data
            }
            this.emit('subscription', subData);
        });
        this.on('streamerbot.Trovo.Subscription', (data) => {
            let subData = {
                bot: 'streamerbot',
                platform: 'trovo',
                type: 'subscription',
                data: data.data
            }
            this.emit('subscription', subData);
        });
        this.on("tikfinity.superFan", (data) => {
            let subData = {
                bot: 'tikfinity',
                platform: 'tiktok',
                type: 'subscription',
                data: data
            }
            this.emit('subscription', subData);
        });
        // ── Resubs ───────────────────────────────────────────────────────────
        this.on("streamerbot.Twitch.ReSub", (data) => {
            let subData = {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'resub',
                data: data.data
            }
            this.emit('subscription', subData);
        });
        this.on("streamerbot.Kick.Resubscription", (data) => {
            let subData = {
                bot: 'streamerbot',
                platform: 'kick',
                type: 'resub',
                data: data.data
            }
            this.emit('subscription', subData);
        });
        this.on("streamerbot.Trovo.Resubscription", (data) => {
            let subData = {
                bot: 'streamerbot',
                platform: 'trovo',
                type: 'resub',
                data: data.data
            }
            this.emit('subscription', subData);
        });
        this.on("streamerbot.YouTube.MemberMileStone", (data) => {
            let subData = {
                bot: 'streamerbot',
                platform: 'youtube',
                type: 'resub',
                data: data.data
            }
            this.emit('subscription', subData);
        });
    }

    _initializeGiftSubRelay() {
        if (this._initializedRelays.has('giftsub')) return;
        this._initializedRelays.add('giftsub');
        // ── Twitch ──────────────────────────────────────────────────────────
        this.on('streamerbot.Twitch.GiftSub', (data) => {
            let d = data.data || {};
            this.emit('giftsub', {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'giftsub',
                isAnonymous: d.isAnonymous || false,
                gifter: d.gifter || null,
                recipient: d.recipient || null,
                amount: 1,
                data: data.data
            });
        });
        this.on('streamerbot.Twitch.GiftBomb', (data) => {
            let d = data.data || {};
            this.emit('giftsub', {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'massgiftsub',
                isAnonymous: d.isAnonymous || false,
                gifter: d.gifter || null,
                recipient: null,
                amount: d.gifts || 1,
                data: data.data
            });
        });

        // ── Kick (via Streamer.bot) ──────────────────────────────────────────
        this.on('streamerbot.Kick.GiftSubscription', (data) => {
            let d = data.data || {};
            this.emit('giftsub', {
                bot: 'streamerbot',
                platform: 'kick',
                type: 'giftsub',
                isAnonymous: d.isAnonymous || false,
                gifter: d.gifter || null,
                recipient: d.recipient || null,
                amount: 1,
                data: data.data
            });
        });
        this.on('streamerbot.Kick.MassGiftSubscription', (data) => {
            let d = data.data || {};
            this.emit('giftsub', {
                bot: 'streamerbot',
                platform: 'kick',
                type: 'massgiftsub',
                isAnonymous: d.isAnonymous || false,
                gifter: d.gifter || null,
                recipient: null,
                amount: d.gifts || 1,
                data: data.data
            });
        });

        // ── Kick (direct KickClient WS) ──────────────────────────────────────
        this.on('kick.giftSubscription', (data) => {
            let d = data || {};
            this.emit('giftsub', {
                bot: 'kickWS',
                platform: 'kick',
                type: 'giftsub',
                isAnonymous: d.gifter_username === 'Anonymous' || false,
                gifter: d.gifter_username || null,
                recipient: d.gifted_username || null,
                amount: 1,
                data: data
            });
        });

        // ── Trovo ────────────────────────────────────────────────────────────
        this.on('streamerbot.Trovo.GiftSubscription', (data) => {
            let d = data.data || {};
            this.emit('giftsub', {
                bot: 'streamerbot',
                platform: 'trovo',
                type: 'giftsub',
                isAnonymous: d.isAnonymous || false,
                gifter: d.gifter || null,
                recipient: d.recipient || null,
                amount: 1,
                data: data.data
            });
        });
        this.on('streamerbot.Trovo.MassGiftSubscription', (data) => {
            let d = data.data || {};
            this.emit('giftsub', {
                bot: 'streamerbot',
                platform: 'trovo',
                type: 'massgiftsub',
                isAnonymous: d.isAnonymous || false,
                gifter: d.gifter || null,
                recipient: null,
                amount: d.gifts || 1,
                data: data.data
            });
        });

        // ── YouTube ──────────────────────────────────────────────────────────
        this.on('streamerbot.YouTube.MembershipGift', (data) => {
            let d = data.data || {};
            this.emit('giftsub', {
                bot: 'streamerbot',
                platform: 'youtube',
                type: 'massgiftsub',
                isAnonymous: false,
                gifter: d.gifter || null,
                recipient: null,
                amount: d.count || 1,
                data: data.data
            });
        });
        this.on('streamerbot.YouTube.GiftMembershipReceived', (data) => {
            let d = data.data || {};
            this.emit('giftsub', {
                bot: 'streamerbot',
                platform: 'youtube',
                type: 'giftsub',
                isAnonymous: false,
                gifter: d.gifter || null,
                recipient: d.user || null,
                amount: 1,
                data: data.data
            });
        });

        // ── TikTok (via TikFinity) ────────────────────────────────────────────
        this.on('tikfinity.gift', (data) => {
            let d = data || {};
            let u = d.user || {};
            this.emit('giftsub', {
                bot: 'tikfinity',
                platform: 'tiktok',
                type: 'gift',
                isAnonymous: false,
                gifter: d.uniqueId || u.uniqueId || null,
                recipient: null,
                amount: d.repeatCount || d.giftCount || 1,
                giftName: d.giftName || null,
                giftId: d.giftId || null,
                data: data
            });
        });
    }

    _initializeBitsRelay() {
        if (this._initializedRelays.has('bits')) return;
        this._initializedRelays.add('bits');
        this.on('streamerbot.Twitch.Cheer', (data) => {
            let d = data.data || {};
            let cheerData = {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'cheer',
                user: d.user || null,
                amount: d.bits || 0,
                message: d.message || null,
                data: data.data
            };
            this.emit('bits', cheerData);
            this.emit('cheer', cheerData);
        });
    }

    _initializeRaidRelay() {
        if (this._initializedRelays.has('raid')) return;
        this._initializedRelays.add('raid');
        this.on('streamerbot.Twitch.Raid', (data) => {
            let d = data.data || {};
            this.emit('raid', {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'raid',
                user: d.user || null,
                viewers: d.viewers || 0,
                data: data.data
            });
        });
        this.on('streamerbot.Trovo.Raid', (data) => {
            let d = data.data || {};
            this.emit('raid', {
                bot: 'streamerbot',
                platform: 'trovo',
                type: 'raid',
                user: d.user || null,
                viewers: d.viewers || 0,
                data: data.data
            });
        });
        this.on('kick.streamHosted', (data) => {
            let d = data || {};
            this.emit('raid', {
                bot: 'kickWS',
                platform: 'kick',
                type: 'raid',
                user: d.host_username || null,
                viewers: d.number_viewers || 0,
                data: data
            });
        });
    }

    _initializeDonationRelay() {
        if (this._initializedRelays.has('donation')) return;
        this._initializedRelays.add('donation');
        this.on('streamerbot.StreamElements.Tip', (data) => {
            let d = data.data || {};
            this.emit('donation', {
                bot: 'streamerbot',
                platform: 'streamelements',
                type: 'donation',
                user: d.username || null,
                amount: d.amount || 0,
                currency: d.currency || null,
                message: d.message || null,
                data: data.data
            });
        });
        this.on('streamerbot.Streamlabs.Donation', (data) => {
            let d = data.data || {};
            this.emit('donation', {
                bot: 'streamerbot',
                platform: 'streamlabs',
                type: 'donation',
                user: d.name || null,
                amount: d.amount || 0,
                currency: d.currency || null,
                message: d.message || null,
                data: data.data
            });
        });
        this.on('streamerbot.TipeeeStream.Donation', (data) => {
            let d = data.data || {};
            this.emit('donation', {
                bot: 'streamerbot',
                platform: 'tipeestream',
                type: 'donation',
                user: d.username || null,
                amount: d.amount || 0,
                currency: d.currency || null,
                message: d.message || null,
                data: data.data
            });
        });
        this.on('streamerbot.KoFi.Donation', (data) => {
            let d = data.data || {};
            this.emit('donation', {
                bot: 'streamerbot',
                platform: 'kofi',
                type: 'donation',
                user: d.from || null,
                amount: d.amount || 0,
                currency: d.currency || null,
                message: d.message || null,
                data: data.data
            });
        });
        this.on('streamerbot.Fourthwall.Donation', (data) => {
            let d = data.data || {};
            this.emit('donation', {
                bot: 'streamerbot',
                platform: 'fourthwall',
                type: 'donation',
                user: d.name || null,
                amount: d.amount || 0,
                currency: d.currency || null,
                message: d.message || null,
                data: data.data
            });
        });
        this.on('tikfinity.gift', (data) => {
            let d = data || {};
            let u = d.user || {};
            this.emit('donation', {
                bot: 'tikfinity',
                platform: 'tiktok',
                type: 'gift',
                user: d.uniqueId || u.uniqueId || null,
                amount: d.repeatCount || d.giftCount || 1,
                currency: null,
                message: null,
                giftName: d.giftName || null,
                giftId: d.giftId || null,
                data: data
            });
        });
        this.on('streamerbot.YouTube.SuperChat', (data) => {
            let d = data.data || {};
            this.emit('donation', {
                bot: 'streamerbot',
                platform: 'youtube',
                type: 'superchat',
                user: d.user || null,
                amount: d.amount || 0,
                currency: d.currency || null,
                message: d.message || null,
                data: data.data
            });
        });
    }

    _initializeHypeTrainRelay() {
        if (this._initializedRelays.has('hypetrain')) return;
        this._initializedRelays.add('hypetrain');
        let events = ['HypeTrainStart', 'HypeTrainUpdate', 'HypeTrainLevelUp', 'HypeTrainEnd'];
        for (let i = 0; i < events.length; i++) {
            (function (evtName) {
                this.on('streamerbot.Twitch.' + evtName, (data) => {
                    let d = data.data || {};
                    this.emit('hypetrain', {
                        bot: 'streamerbot',
                        platform: 'twitch',
                        type: evtName.replace('HypeTrain', '').toLowerCase() || 'update',
                        level: d.level || 1,
                        progress: d.progress || 0,
                        goal: d.goal || 0,
                        total: d.total || 0,
                        data: data.data
                    });
                });
            }).call(this, events[i]);
        }
    }

    _initializePollRelay() {
        if (this._initializedRelays.has('poll')) return;
        this._initializedRelays.add('poll');
        let twitchEvents = ['PollCreated', 'PollUpdated', 'PollCompleted'];
        for (let i = 0; i < twitchEvents.length; i++) {
            (function (evtName) {
                this.on('streamerbot.Twitch.' + evtName, (data) => {
                    let d = data.data || {};
                    this.emit('poll', {
                        bot: 'streamerbot',
                        platform: 'twitch',
                        type: evtName.replace('Poll', '').toLowerCase(),
                        title: d.title || null,
                        choices: d.choices || [],
                        duration: d.duration || 0,
                        data: data.data
                    });
                });
            }).call(this, twitchEvents[i]);
        }
        let ytEvents = ['PollStarted', 'PollUpdated', 'PollClosed'];
        for (let j = 0; j < ytEvents.length; j++) {
            (function (evtName) {
                this.on('streamerbot.YouTube.' + evtName, (data) => {
                    let d = data.data || {};
                    this.emit('poll', {
                        bot: 'streamerbot',
                        platform: 'youtube',
                        type: evtName.replace('Poll', '').toLowerCase(),
                        title: d.title || null,
                        choices: d.choices || [],
                        duration: d.duration || 0,
                        data: data.data
                    });
                });
            }).call(this, ytEvents[j]);
        }
    }

    _initializePredictionRelay() {
        if (this._initializedRelays.has('prediction')) return;
        this._initializedRelays.add('prediction');
        let predEvents = ['PredictionCreated', 'PredictionUpdated', 'PredictionCompleted', 'PredictionCanceled', 'PredictionLocked'];
        for (let i = 0; i < predEvents.length; i++) {
            (function (evtName) {
                this.on('streamerbot.Twitch.' + evtName, (data) => {
                    let d = data.data || {};
                    this.emit('prediction', {
                        bot: 'streamerbot',
                        platform: 'twitch',
                        type: evtName.replace('Prediction', '').toLowerCase(),
                        title: d.title || null,
                        outcomes: d.outcomes || [],
                        data: data.data
                    });
                });
            }).call(this, predEvents[i]);
        }
    }

    _initializeRedemptionRelay() {
        if (this._initializedRelays.has('redemption')) return;
        this._initializedRelays.add('redemption');
        this.on('streamerbot.Twitch.RewardRedemption', (data) => {
            let d = data.data || {};
            let reward = d.reward || {};
            this.emit('redemption', {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'redemption',
                user: d.user || null,
                reward: reward.title || null,
                rewardId: reward.id || null,
                cost: reward.cost || 0,
                input: d.input || null,
                data: data.data
            });
        });
        this.on('streamerbot.Kick.RewardRedemption', (data) => {
            let d = data.data || {};
            this.emit('redemption', {
                bot: 'streamerbot',
                platform: 'kick',
                type: 'redemption',
                user: d.user || null,
                reward: d.title || null,
                rewardId: d.id || null,
                cost: d.cost || 0,
                input: d.input || null,
                data: data.data
            });
        });
    }

    _initializeShoutoutRelay() {
        if (this._initializedRelays.has('shoutout')) return;
        this._initializedRelays.add('shoutout');
        this.on('streamerbot.Twitch.ShoutoutCreated', (data) => {
            let d = data.data || {};
            this.emit('shoutout', {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'sent',
                user: d.targetUser || d.user || null,
                data: data.data
            });
        });
        this.on('streamerbot.Twitch.ShoutoutReceived', (data) => {
            let d = data.data || {};
            this.emit('shoutout', {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'received',
                user: d.sourceUser || d.user || null,
                viewers: d.viewerCount || 0,
                data: data.data
            });
        });
    }

    _initializeFirstChatRelay() {
        if (this._initializedRelays.has('firstchat')) return;
        this._initializedRelays.add('firstchat');
        this.on('streamerbot.Twitch.FirstWord', (data) => {
            let d = data.data || {};
            this.emit('firstchat', {
                bot: 'streamerbot',
                platform: 'twitch',
                user: d.user || null,
                message: d.message || null,
                data: data.data
            });
        });
        this.on('streamerbot.Kick.FirstWords', (data) => {
            let d = data.data || {};
            this.emit('firstchat', {
                bot: 'streamerbot',
                platform: 'kick',
                user: d.user || null,
                message: d.message || null,
                data: data.data
            });
        });
        this.on('streamerbot.YouTube.FirstWords', (data) => {
            let d = data.data || {};
            this.emit('firstchat', {
                bot: 'streamerbot',
                platform: 'youtube',
                user: d.user || null,
                message: d.message || null,
                data: data.data
            });
        });
        this.on('streamerbot.Trovo.FirstWords', (data) => {
            let d = data.data || {};
            this.emit('firstchat', {
                bot: 'streamerbot',
                platform: 'trovo',
                user: d.user || null,
                message: d.message || null,
                data: data.data
            });
        });
    }

    _initializeResubRelay() {
        if (this._initializedRelays.has('resub')) return;
        this._initializedRelays.add('resub');
        this.on('streamerbot.Twitch.ReSub', (data) => {
            this.emit('resub', {
                bot: 'streamerbot',
                platform: 'twitch',
                type: 'resub',
                data: data.data
            });
        });
        this.on('streamerbot.Kick.Resubscription', (data) => {
            this.emit('resub', {
                bot: 'streamerbot',
                platform: 'kick',
                type: 'resub',
                data: data.data
            });
        });
        this.on('streamerbot.Trovo.Resubscription', (data) => {
            this.emit('resub', {
                bot: 'streamerbot',
                platform: 'trovo',
                type: 'resub',
                data: data.data
            });
        });
        this.on('streamerbot.YouTube.MemberMileStone', (data) => {
            this.emit('resub', {
                bot: 'streamerbot',
                platform: 'youtube',
                type: 'resub',
                data: data.data
            });
        });
    }

    _getRole(data) {
        if ("roles" in data) {
            if (data.roles.includes("streamer")) {
                return "broadcaster";
            }
            if (data.roles.includes("mod") || data.roles.includes("supermod") || data.roles.includes("admin") || data.roles.includes("warden") || data.roles.includes("editor")) {
                return "moderator";
            }
            if (data.roles.includes("subscriber")) {
                return "subscriber";
            }
            if (data.roles.includes("custom role") || data.roles.includes("ace") || data.roles.includes("vip") || data.roles.includes("ace+")) {
                return "vip";
            }
            return "user";
        }

        if ("role" in data) {
            if (data.role == 4) {
                return "broadcaster";
            }
            if (data.role == 3) {
                return "moderator";
            }
            if (data.subscribed == true) {
                return "subscriber";
            }
            if (data.role == 2) {
                return "vip";
            }
            return "user";
        }
        if ("badges" in data && data.badges != null) {

            if ("broadcaster" in data.badges) {
                return "broadcaster";
            }
            if (data.mod == "1") {
                return "moderator";
            }
            if (data.subscriber == "1") {
                return "subscriber";
            }
            if (data.vip == "1") {
                return "vip";
            }

            return "user";
        }
        if ("isOwner" in data && data.isOwner) {
            return "broadcaster";
        }
        if ("isModerator" in data && data.isModerator) {
            return "moderator";
        }
        if ("isSponsor" in data && data.isSponsor) {
            return "subscriber";
        }
        return "user";
    }

    _resolveMessage(data) {
        let d = data.data;
        if (d && typeof d.message === 'string') return d.message;
        if (d && typeof d.message.message === 'string') return d.message.message;
        if (d && d.data && typeof d.data.message === 'string') return d.data.message;
        if (d && typeof d.comment === 'string') return d.comment;
        return null;
    }

    _checkRoles(role, allowedRoles) {
        if (!allowedRoles || allowedRoles.length === 0) return true;
        return allowedRoles.indexOf(role) !== -1;
    }

    connect() {
        for (const client in this._clients) {
            if (typeof this._clients[client].connect === 'function') {
                this._clients[client].connect();
            }
        }
    }

    disconnect() {
        for (const client in this._clients) {
            if (typeof this._clients[client].disconnect === 'function') {
                this._clients[client].disconnect();
            }
        }
    }

    command(options = {}, callback) {
        if (typeof options === 'string') {
            options = { command: options };
        }
        if (typeof callback !== 'function') {
            console.error('WebSRC.command() requires a callback function as the second argument.');
            return;
        }

        let command = (options.command || '').toLowerCase();
        let prefix = options.prefix || '';
        let placement = options.placement || 'start';
        let cooldown = options.cooldown || 0;
        let allowedRoles = options.allowedRoles || [];
        let lastFired = 0;
        let roleModifiable = options.roleModifiable || false;

        if (!command) {
            console.error('WebSRC.command() requires a "command" option.');
            return;
        }

        // Find the ws.get() param key whose resolved value matches this command word.
        // ws.get() always runs before ws.command() (it's in the options expression),
        // so the param is already in _requiredParameters by the time we get here.
        // We match on default value — e.g. ws.get('enable','enablewatch',...) → paramKey='enable'.
        const _matchedParam = this._requiredParameters.slice().reverse().find(
            p => (p.default || '').toLowerCase() === command ||
                p.name.toLowerCase() === command
        );
        const paramKey = _matchedParam ? _matchedParam.name : command;

        let meta = {
            name: paramKey,          // param key — used to look up the input field in extractSchema
            configKey: paramKey,     // same — the ws.get() name
            default: command,        // the actual command word (resolved value)
            defaultRole: roleModifiable ? "user" : "moderator",
            desc: options.desc || '',
            category: 'cmd',
        };
        if (roleModifiable) {
            meta.roleParam = "role";
        }

        this.registerCommand(meta);

        let fullCommand = (prefix + command).toLowerCase();

        this.on('chat', (data) => {
            if (data.type !== 'message') return;
            if (!this._checkRoles(data.role, allowedRoles)) return;

            let rawMessage = this._resolveMessage(data);
            if (!rawMessage) return;

            let messageLower = rawMessage.toLowerCase();
            let matchIndex = -1;

            if (placement === 'start') {
                if (messageLower.indexOf(fullCommand) === 0) {
                    let charAfter = rawMessage[fullCommand.length];
                    if (charAfter === undefined || charAfter === ' ') {
                        matchIndex = 0;
                    }
                }
            } else {
                let searchFrom = 0;
                while (searchFrom < messageLower.length) {
                    let idx = messageLower.indexOf(fullCommand, searchFrom);
                    if (idx === -1) break;
                    matchIndex = idx;
                    searchFrom = idx + 1;
                }
            }

            if (matchIndex === -1) return;

            if (cooldown > 0) {
                let now = Date.now();
                if (now - lastFired < cooldown) return;
                lastFired = now;
            }
            // if placment is anywhere we dont need to remove the command from the message, just split on it and trim the parts
            let args = [];
            if (placement === 'start') {
                rawMessage = rawMessage.substring(fullCommand.length).trim();
                if (rawMessage) {
                    args = rawMessage.split(/\s+/);
                }
            } else {
                args = rawMessage.split(/\s+/);
            }


            callback({
                command: fullCommand,
                platform: data.platform,
                bot: data.bot,
                role: data.role || null,
                rawInput: rawMessage,
                args: args,
                data: data.data
            });
        });
    }

    link(options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (typeof callback !== 'function') {
            console.error('WebSRC.link() requires a callback function.');
            return;
        }

        let allowedRoles = options.allowedRoles || [];

        // Matches http://, https://, or bare domain-like patterns (e.g. twitch.tv/...)
        let urlRegex = /(https?:\/\/[^\s]+)|([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+([\/\?#][^\s]*)?)/g;

        this.on('chat', (data) => {
            if (data.type !== 'message') return;
            if (!this._checkRoles(data.role, allowedRoles)) return;

            let rawMessage = this._resolveMessage(data);
            if (!rawMessage) return;

            let matches = rawMessage.match(urlRegex);
            if (!matches || matches.length === 0) return;

            let seen = {};
            let urls = [];
            for (let i = 0; i < matches.length; i++) {
                let url = matches[i];
                if (!seen[url]) {
                    seen[url] = true;
                    urls.push(url);
                }
            }

            callback({
                platform: data.platform,
                bot: data.bot,
                role: data.role || null,
                urls: urls,
                message: rawMessage,
                data: data.data
            });
        });
    }

    keyword(options, callback) {
        if (typeof options === 'string') {
            options = { keyword: options };
        }
        if (typeof callback !== 'function') {
            console.error('WebSRC.keyword() requires a callback function as the second argument.');
            return;
        }

        let keyword = (options.keyword || '').toLowerCase();
        let placement = options.placement !== undefined ? options.placement : 'anywhere';
        let caseSensitive = options.caseSensitive !== undefined ? options.caseSensitive : false;
        let allowedRoles = options.allowedRoles || [];
        let cooldown = options.cooldown !== undefined ? options.cooldown : 0;
        let lastFired = 0;

        if (!keyword) {
            console.error('WebSRC.keyword() requires a "keyword" option.');
            return;
        }

        this.on('chat', (data) => {
            if (data.type !== 'message') return;
            if (!this._checkRoles(data.role, allowedRoles)) return;

            let rawMessage = this._resolveMessage(data);
            if (!rawMessage) return;

            let searchIn = caseSensitive ? rawMessage : rawMessage.toLowerCase();
            let searchFor = caseSensitive ? options.keyword : keyword;
            let found = false;

            if (placement === 'start') {
                if (searchIn.indexOf(searchFor) === 0) {
                    let charAfter = searchIn[searchFor.length];
                    found = charAfter === undefined || charAfter === ' ';
                }
            } else if (placement === 'end') {
                let endIdx = searchIn.lastIndexOf(searchFor);
                if (endIdx !== -1 && endIdx === searchIn.length - searchFor.length) {
                    let charBefore = endIdx === 0 ? undefined : searchIn[endIdx - 1];
                    found = charBefore === undefined || charBefore === ' ';
                }
            } else {
                // anywhere — whole word match
                let si = 0;
                while (si < searchIn.length) {
                    let ki = searchIn.indexOf(searchFor, si);
                    if (ki === -1) break;
                    let cb = ki === 0 ? undefined : searchIn[ki - 1];
                    let ca = searchIn[ki + searchFor.length];
                    if ((cb === undefined || cb === ' ') && (ca === undefined || ca === ' ')) {
                        found = true;
                        break;
                    }
                    si = ki + 1;
                }
            }

            if (!found) return;

            if (cooldown > 0) {
                let now = Date.now();
                if (now - lastFired < cooldown) return;
                lastFired = now;
            }

            callback({
                keyword: options.keyword,
                platform: data.platform,
                bot: data.bot,
                role: data.role || null,
                message: rawMessage,
                data: data.data
            });
        });
    }

    mention(username, callback) {
        if (typeof username !== 'string' || !username) {
            console.error('WebSRC.mention() requires a username string as the first argument.');
            return;
        }
        if (typeof callback !== 'function') {
            console.error('WebSRC.mention() requires a callback function as the second argument.');
            return;
        }

        let target = username.toLowerCase().replace(/^@/, '');

        this.on('chat', (data) => {
            if (data.type !== 'message') return;

            let rawMessage = this._resolveMessage(data);
            if (!rawMessage) return;

            let lower = rawMessage.toLowerCase();
            // Match @username as a whole token
            let withAt = '@' + target;
            let foundAt = lower.indexOf(withAt);
            if (foundAt === -1) return;

            let charAfter = lower[foundAt + withAt.length];
            if (charAfter !== undefined && charAfter !== ' ' && charAfter !== ',' && charAfter !== '.' && charAfter !== '!' && charAfter !== '?') return;

            callback({
                username: username.replace(/^@/, ''),
                platform: data.platform,
                bot: data.bot,
                role: data.role || null,
                message: rawMessage,
                data: data.data
            });
        });
    }

    once(event, callback) {
        if (typeof callback !== 'function') {
            console.error('WebSRC.once() requires a callback function.');
            return;
        }
        let fired = false;
        let wrapper = (arg1, arg2, arg3, arg4, arg5) => {
            if (fired) return;
            fired = true;
            callback(arg1, arg2, arg3, arg4, arg5);
        };
        this.on(event, wrapper);
    }
    /**
     * Get a URL parameter with optional schema metadata for the modify UI.
     *
     * Signature (fully backwards-compatible):
     *   ws.get(name, fallback, typeValidation, options)
     *
     * options accepts BOTH InputValidator routing keys AND schema metadata:
     *
     * InputValidator routing (passed through to InputValidator.get):
     *   source    — 'query' | 'fragment' | 'both' (default 'both')
     *   priority  — 'query' | 'fragment'          (default 'query')
     *
     * Schema metadata (used by extractSchema() to build the modify UI):
     *   label       string   — human-readable label shown in the UI
     *   desc        string   — description shown below the label
     *   category    string   — nav panel id this param belongs to
     *   uiType      string   — override inferred UI type:
     *                          'text' | 'toggle' | 'number' | 'range' | 'radio' |
     *                          'select' | 'platform' | 'colorpicker' | 'color' |
     *                          'colorpalette' | 'sbaction' | 'streamdeck' |
     *                          'header' | 'info' | 'command'
     *   options     array    — options for radio/select/colorpicker
     *   meta        object   — { bg, letter, ink } for platform rows
     *   prefix      string   — prefix displayed before the input (e.g. '!')
     *   placeholder string   — input placeholder text
     *   suffix      string   — suffix after the input (e.g. 'seconds')
     *   min         number   — min for number/range
     *   max         number   — max for number/range
     *   step        number   — step for number/range
     *   required    boolean  — marks field as required in completeness check
     *   urlSkip     boolean  — exclude from URL even if value differs from default
     *   feature     string   — gate behind features.X flag (e.g. 'streamerbot')
     *   warn        string   — warning text shown below the label
     *   sanitize    string   — 'alphanumeric' etc, passed to text wirer
     *   trim        boolean  — trim whitespace on input
     *   marketplace string   — Elgato marketplace URL (for streamdeck type)
     *   github      string   — GitHub release URL (for streamdeck type)
     *
     * Example:
     *   ws.get("watch", "watch", "string", {
     *       label: "Watch command", desc: "Viewers type this + a clip link.",
     *       category: "cmd", prefix: "!", placeholder: "watch",
     *       sanitize: "alphanumeric"
     *   });
     */
    get(name, fallback = null, typeValidation = 'string', options = {}) {
        // Split InputValidator routing keys from schema metadata
        const { source, priority, ...schemaMeta } = options;
        const inputOptions = {};
        if (source !== undefined) inputOptions.source = source;
        if (priority !== undefined) inputOptions.priority = priority;

        // Register param once — schema metadata stored separately from routing
        if (!this._requiredParameters.some(p => p.name === name)) {
            this._requiredParameters.push({
                name: name,
                default: fallback,
                type: typeValidation,
                schema: schemaMeta
            });
        }

        return this._params.get(name, fallback, typeValidation, inputOptions);
    }

    /**
     * Return the raw required-parameters array (legacy compat).
     */
    extractParams() {
        return this._requiredParameters;
    }

    /**
     * Register a command for schema extraction so extractSchema() can
     * build command-reference rows in the modify UI automatically.
     * Call this alongside ws.command() — it does not affect command behaviour.
     *
     * @param {Object} meta
     *   {
     *     name:        string  — unique key (usually matches ws.get() param name)
     *     configKey:   string  — ws.get() param name holding the command word
     *     default:     string  — default command word shown in the UI
     *     roleParam:   string  — ws.get() param name for role (omit = fixed access)
     *     defaultRole: string  — 'user'|'subscriber'|'vip'|'moderator'|'broadcaster'
     *     desc:        string  — shown in command reference table
     *     category:    string  — nav panel id (default 'cmd')
     *   }
     *
     * Example:
     *   ws.registerCommand({
     *       name: "watch", configKey: "watch", default: "watch",
     *       roleParam: "role", defaultRole: "user",
     *       desc: "Submit a clip link to the queue", category: "cmd"
     *   });
     */
    registerCommand(meta = {}) {
        if (!this._registeredCommands) this._registeredCommands = [];
        if (!this._registeredCommands.some(c => c.name === meta.name)) {
            // Persist roleModifiable so _extractCommandParams can classify
            // the command as viewer vs moderator without re-inspecting allowedRoles.
            this._registeredCommands.push(meta);
        }
    }

    /**
     * Build command-type schema entries from registered commands.
     *
     * Automatically injects section headers before viewer commands,
     * moderator commands, and the command-reference table so you never
     * need to call ws.get("_cmd_viewer_header", ...) manually.
     *
     * Classification rules (in priority order):
     *   1. roleModifiable === true  → viewer command (role-locked group)
     *   2. defaultRole is 'user' | 'subscriber' | 'vip'  → viewer command
     *   3. everything else  → moderator command (fixed-access group)
     *
     * @private
     */
    _extractCommandParams() {
        const cmds = this._registeredCommands || [];
        if (!cmds.length) return [];

        // All command reference rows go under a single "Command reference" header —
        // no sub-grouping here. The input fields above already show viewer/mod sections.
        const refRows = cmds.map(c => ({
            name: '_ref_' + c.name,
            type: 'command',
            cmd: c.configKey || c.name,
            default: c.default || c.name,
            roleParam: c.roleParam || null,
            defaultRole: c.defaultRole || 'moderator',
            desc: c.desc || '',
            category: c.category || 'cmd',
            urlSkip: true,
        }));

        return [
            {
                name: '_cmd_ref_header',
                type: 'header',
                label: 'Command reference',
                desc: 'Live preview of all commands and who can use them.',
                category: 'cmd',
                urlSkip: true,
            },
            ...refRows,
        ];
    }

    /**
     * Build the full OVERLAY_READY schema payload from every ws.get() call
     * and every ws.registerCommand() call made so far.
     *
     * @param {Object} overlay
     *   {
     *     meta:     { app, version, requiresInteraction }
     *     features: { streamerbot, streamdeck, ... }
     *     nav:      [ { group, items: [{ id, label, icon, sub? }] } ]
     *   }
     * @returns {Object}  Full schema payload for postSchemaToParent()
     *
     * Example:
     *   const schema = ws.extractSchema({
     *       meta:     { app: "Watch Overlay", version: "1.0.0" },
     *       features: { streamerbot: true, streamdeck: true },
     *       nav: [
     *           { group: "SETUP", items: [
     *               { id: "start",   label: "Get started",  icon: "sparkle" },
     *               { id: "channel", label: "Your channel", icon: "user"    },
     *           ]},
     *           { group: "APP SETTINGS", items: [
     *               { id: "cmd", label: "Chat commands", icon: "chat" },
     *           ]}
     *       ]
     *   });
     */
    extractSchema(overlay = {}) {
        const uiTypeMap = {
            string: 'text',
            boolean: 'toggle',
            number: 'number',
            integer: 'number',
            float: 'number',
        };

        // Strip any _cmd_*_header sentinels that were registered manually via
        // ws.get() — _extractCommandParams() now injects them automatically in
        // the correct order, so duplicates would create double headers.
        const AUTO_CMD_HEADERS = new Set([
            '_cmd_viewer_header',
            '_cmd_mod_header',
            '_cmd_ref_header',
            '_cmd_prefix_header',   // also remove legacy prefix header — kept only if still needed
        ]);
        const filteredParams = this._requiredParameters.filter(
            p => !AUTO_CMD_HEADERS.has(p.name)
        );

        const params = filteredParams.map(p => {
            const s = p.schema || {};

            // Determine UI type — explicit uiType wins, otherwise infer from validation type
            const uiType = s.uiType || uiTypeMap[p.type] || 'text';

            // Normalise toggle defaults to 'true'/'false' boolean strings.
            // Platform is now a text input (username string) — no normalisation needed.
            let defaultVal = p.default;
            if (uiType === 'toggle') {
                defaultVal = (defaultVal === true || defaultVal === 'on' || defaultVal === '1' || defaultVal === 1)
                    ? 'true' : 'false';
            }

            const entry = {
                name: p.name,
                label: s.label || p.name,
                type: uiType,
                default: defaultVal ?? '',
                category: s.category || 'general',
            };

            // Only attach optional fields when explicitly provided
            const optional = [
                'desc', 'placeholder', 'prefix', 'suffix',
                'min', 'max', 'step', 'required', 'urlSkip', 'urlFragment',
                'feature', 'warn', 'options', 'meta',
                'sanitize', 'trim', 'marketplace', 'github',
                'links', 'highlight', 'children', 'type', 'code'
            ];
            optional.forEach(k => { if (s[k] !== undefined) entry[k] = s[k]; });

            return entry;
        });

        // ── Auto-group cmd-category input params with section headers ──────
        // Every ws.get() in the cmd category that matches a registered command
        // is classified viewer vs moderator. Headers are injected between the
        // groups so the actual input fields render under the correct heading.
        // Params not tied to any command (e.g. "prefix") are placed first.
        const cmdParams = params.filter(p => p.category === 'cmd');
        const otherParams = params.filter(p => p.category !== 'cmd');

        const VIEWER_ROLES_SET = new Set(['user', 'subscriber', 'vip']);
        const cmdMetaMap = {};
        (this._registeredCommands || []).forEach(c => {
            cmdMetaMap[c.configKey || c.name] = c;
        });

        const prefixParams = [];
        const viewerInputs = [];
        const modInputs = [];

        cmdParams.forEach(p => {
            const meta = cmdMetaMap[p.name];
            if (!meta) { prefixParams.push(p); return; }
            const isViewer =
                meta.roleModifiable === true ||
                VIEWER_ROLES_SET.has((meta.defaultRole || 'moderator').toLowerCase());
            (isViewer ? viewerInputs : modInputs).push(p);
        });

        const _hdr = (name, label, desc) => ({
            name, type: 'header', label,
            ...(desc ? { desc } : {}),
            category: 'cmd', urlSkip: true,
        });

        const groupedCmdParams = [
            ...prefixParams,
            ...(viewerInputs.length ? [
                _hdr('_cmd_viewer_header', 'Viewer commands',
                    'Access level controlled by the role lock in Who can use it.'),
                ...viewerInputs,
            ] : []),
            ...(modInputs.length ? [
                _hdr('_cmd_mod_header', 'Moderator commands',
                    'Always restricted to moderators and above regardless of role lock.'),
                ...modInputs,
            ] : []),
        ];

        return {
            meta: overlay.meta || { app: 'WebSRC Overlay', version: '1.0.0', requiresInteraction: false },
            features: overlay.features || {},
            nav: overlay.nav || [],
            params: [...otherParams, ...groupedCmdParams, ...this._extractCommandParams()]
        };
    }

    /**
     * Post the schema payload to the modify parent window via postMessage.
     * Call this inside ws.on("ready", ...) — it no-ops automatically when
     * the overlay is running standalone (OBS, direct tab) so it is safe
     * to call unconditionally without a window.self !== window.top check.
     *
     * @param {Object} overlay  — same shape as extractSchema(overlay)
     *
     * Example:
     *   ws.on("ready", () => {
     *       ws.postSchemaToParent({
     *           meta:     { app: "Watch Overlay", version: "1.0.0" },
     *           features: { streamerbot: true, streamdeck: true },
     *           nav: [ ... ]
     *       });
     *   });
     */
    postSchemaToParent(overlay = {}) {
        if (window.self === window.top) return;
        const payload = this.extractSchema(overlay);
        window.parent.postMessage({ type: 'OVERLAY_READY', payload }, window.location.origin);
    }
    getRelayID() {
        return this._relayID;
    }
    // event is [client].[eventName] and eventname can be [type].[action] or just [action] depending on the client
    on(event, callback, options) {
        if (typeof event !== 'string' || !event.includes('.')) {
            // register listener for all clients that support the event
            const customEvents = ['ready', 'connected', 'disconnected', 'error', 'chatmessage', 'chat', 'follow', 'subscription', 'resub', 'donation', 'raid', 'giftsub', 'bits', 'cheer', 'hypetrain', 'poll', 'prediction', 'redemption', 'shoutout', 'firstchat'];
            if (!customEvents.includes(event.toLowerCase())) {
                if (options && options.clients) {
                    options.clients.forEach(client => {
                        this.on(client + '.' + event, callback);
                    });
                    return;
                }
                console.error('Event name must include a client prefix (e.g. "[client].[application].[event]") or be a custom event ("ready", "connected", "disconnected", "error").');
                return;
            }

            // Wrap callback with platform filter if options.platform is specified
            let wrappedCallback = callback;
            if (options && options.platform) {
                let allowedPlatform = options.platform.toLowerCase();
                wrappedCallback = function (data) {
                    if (data && data.platform && data.platform.toLowerCase() === allowedPlatform) {
                        callback(data);
                    }
                };
            }

            switch (event.toLowerCase()) {
                case 'chat':
                case 'chatmessage':
                    this.on('ready', this._initializeChatMessageRelay.bind(this));
                    break;
                case 'follow':
                    this._initializeFollowRelay();
                    break;
                case 'subscription':
                    this._initializeSubscriptionRelay();
                    break;
                case 'resub':
                    this._initializeResubRelay();
                    break;
                case 'giftsub':
                    this._initializeGiftSubRelay();
                    break;
                case 'bits':
                case 'cheer':
                    this._initializeBitsRelay();
                    break;
                case 'donation':
                    this._initializeDonationRelay();
                    break;
                case 'host':
                case 'raid':
                    this._initializeRaidRelay();
                    break;
                case 'hypetrain':
                    this._initializeHypeTrainRelay();
                    break;
                case 'poll':
                    this._initializePollRelay();
                    break;
                case 'prediction':
                    this._initializePredictionRelay();
                    break;
                case 'redemption':
                    this._initializeRedemptionRelay();
                    break;
                case 'shoutout':
                    this._initializeShoutoutRelay();
                    break;
                case 'firstchat':
                    this._initializeFirstChatRelay();
                    break;
            }

            this._listeners[event.toLowerCase()] = this._listeners[event.toLowerCase()] || [];
            this._listeners[event.toLowerCase()].push(wrappedCallback);

            return;
        }
        const client = event.split('.')[0].toLowerCase();
        const eventName = event.split('.').slice(1).join('.');
        if (!this._clients[client]) {
            this._clientListeners[client] = this._clientListeners[client] || {};
            this._clientListeners[client][eventName] = this._clientListeners[client][eventName] || [];
            this._clientListeners[client][eventName].push(callback);
            return;
        }
        if (typeof callback !== 'function') {
            console.error('Callback must be a function.');
            return;
        }
        this._clients[client].on(eventName, callback);

    }

    off(event, callback) {
        if (typeof event !== 'string' || !event.includes('.')) {
            // remove listener for all clients that support the event
            if (!this._listeners[event.toLowerCase()]) return;
            this._listeners[event.toLowerCase()] = this._listeners[event.toLowerCase()].filter(cb => cb !== callback);
            return;
        }
        const client = event.split('.')[0].toLowerCase();
        const eventName = event.split('.').slice(1).join('.');
        console.debug(`Removing event listener for ${client} event: ${eventName}`);
        if (!this._clients[client]) {
            console.error(`Client ${client} is not initialized or supported.`);
            return;
        }
        if (typeof callback !== 'function') {
            console.error('Callback must be a function.');
            return;
        }
        if (typeof this._clients[client].off !== 'function') {
            console.error(`Client ${client} does not support removing event listeners.`);
            return;
        }
        this._clients[client].off(eventName, callback);
    }

    /**
     * Returns true if the given platform is allowed to initialise.
     * @param {string} name 'streamerbot'|'twitch'|'kick'|'tiktok'|'streamdeck'|'relay'
     */
    _platformAllowed(name) {
        if (!this._options.platforms) return true;
        return this._options.platforms.includes(name);
    }


    emit(event, ...args) {
        if (this._listeners[event.toLowerCase()]) {
            this._listeners[event.toLowerCase()].forEach(callback => callback(...args));
        }
    }

    call(action, params = {}, clients = []) {
        if (clients.length === 0) {
            clients.push(action.split('.')[0].toLowerCase());
            action = action.split('.').slice(1).join('.');
        }

        clients.forEach(client => {
            if (!this._clients[client]) {
                // fail silently if client is not available, since some actions may be not avaiable as clients are resorce dependent (e.g. Streamer.bot actions) and it's up to the user to only call actions on supported clients
                return;
            }
            this._clients[client].call(action, params);
        });
    }

    doAction(actionId, args) {
        if (!this._clients.streamerbot) {
            console.error('WebSRC.doAction() requires Streamer.bot to be connected.');
            return Promise.reject(new Error('Streamer.bot not connected.'));
        }
        let payload = { action: {}, args: args || {} };
        if (typeof actionId === 'object') {
            payload.action = actionId;
        } else {
            payload.action.id = actionId;
        }
        console.debug('[WebSRC] doAction:', payload.action, 'args:', payload.args);
        return this._clients.streamerbot.doAction(payload.action, payload.args);
    }

    sendMessage(platform, message, options) {
        if (!this._clients.streamerbot) {
            console.error('WebSRC.sendMessage() requires Streamer.bot to be connected.');
            return Promise.reject(new Error('Streamer.bot not connected.'));
        }
        options = options || {};
        console.debug('[WebSRC] sendMessage platform:', platform, 'message:', message, 'options:', options);
        return this._clients.streamerbot.sendMessage(
            platform || 'twitch',
            message,
            { bot: options.bot !== undefined ? options.bot : true, internal: options.internal || false }
        );
    }

    getUser(platform, username) {
        let self = this;
        platform = (platform || 'twitch').toLowerCase();
        console.debug('[WebSRC] getUser:', platform, username);
        return new Promise(function (resolve, reject) {
            if (self._clients.streamerbot) {
                console.debug('[WebSRC] getUser: sending GetUserPronouns request for', username);
                self._clients.streamerbot.getUserPronouns(platform, username).then(function (res) {
                    console.debug('[WebSRC] GetUserPronouns response for', username, ':', res);
                    resolve({
                        platform: platform,
                        username: username,
                        pronouns: (res && res.pronoun) ? res.pronoun : null,
                        data: res || null
                    });
                }).catch(function (e) {
                    console.warn('[WebSRC] GetUserPronouns failed for', username, ':', e);
                    resolve({ platform: platform, username: username, pronouns: null, data: null });
                });
                return;
            }
            // Fallback: bare Twitch Helix user lookup
            if (platform === 'twitch') {
                console.debug('[WebSRC] getUser: falling back to Twitch API for', username);
                fetch('/api/v1/twitch/users?login=' + encodeURIComponent(username)).then(function (r) { return r.json(); }).then(function (json) {
                    let user = (json.data && json.data.length) ? json.data[0] : null;
                    resolve({ platform: platform, username: username, pronouns: null, data: user });
                }).catch(function (err) { reject(err); });
                return;
            }
            reject(new Error('WebSRC.getUser(): no fallback available for platform "' + platform + '" without Streamer.bot.'));
        });
    }

    getViewers() {
        if (!this._clients.streamerbot) {
            console.error('WebSRC.getViewers() requires Streamer.bot to be connected.');
            return Promise.reject(new Error('Streamer.bot not connected.'));
        }
        console.debug('[WebSRC] getViewers: sending GetActiveViewers request...');
        return this._clients.streamerbot.getActiveViewers().then(function (res) {
            console.debug('[WebSRC] GetActiveViewers response:', res);
            return res ? (res.viewers || []) : [];
        });
    }

    getEmotes(platform, username) {
        let self = this;
        platform = (platform || '').toLowerCase();

        let use7TV = self._options.emotes.sevenTV !== false;
        let useBTTV = self._options.emotes.bttv !== false;
        let useFFZ = self._options.emotes.ffz !== false;
        let useCheer = self._options.emotes.cheermotes !== false;
        let cacheTTL = self._options.emotes.cacheTTL !== undefined ? self._options.emotes.cacheTTL : 600000;

        // Cache key includes username so per-channel caches don't collide
        let cacheKey = platform + ':' + (username || '');
        if (cacheTTL > 0 && self._emoteCache[cacheKey]) {
            let entry = self._emoteCache[cacheKey];
            if (Date.now() - entry.ts < cacheTTL) {
                console.debug('[WebSRC] getEmotes: serving from cache for', cacheKey, '(' + entry.emotes.length + ' emotes)');
                self.emotes = entry.emotes;
                return Promise.resolve(entry.emotes);
            }
        }

        function storeAndResolve(resolve, emotes) {
            if (cacheTTL > 0) {
                self._emoteCache[cacheKey] = { ts: Date.now(), emotes: emotes };
            }
            console.debug('[WebSRC] getEmotes: loaded', emotes.length, 'emotes for', cacheKey);
            self.emotes = emotes;
            resolve(emotes);
        }

        return new Promise(function (resolve, reject) {
            let store = storeAndResolve.bind(null, resolve);

            // ── Streamer.bot path ─────────────────────────────────────────────
            if (self._clients.streamerbot) {
                if (platform === 'twitch' || platform === '') {
                    console.debug('[WebSRC] getEmotes: sending TwitchGetEmotes request to Streamer.bot...');
                    self._clients.streamerbot.getEmotes('twitch').then(function (res) {
                        console.debug('[WebSRC] TwitchGetEmotes response status:', res && res.status);
                        if (res && res.status === 'ok') {
                            store(_normalizeStreambotEmotes(res.emotes));
                            return;
                        }
                        console.warn('[WebSRC] TwitchGetEmotes returned non-ok status, falling back to direct fetch. Response:', res);
                        _fetchTwitchFallback(username, store, reject);
                    }).catch(function (e) {
                        console.warn('[WebSRC] TwitchGetEmotes request failed/timed out, falling back to direct fetch. Error:', e);
                        _fetchTwitchFallback(username, store, reject);
                    });
                    return;
                }
                if (platform === 'youtube') {
                    console.debug('[WebSRC] getEmotes: sending YouTubeGetEmotes request to Streamer.bot...');
                    self._clients.streamerbot.getEmotes('youtube').then(function (res) {
                        console.debug('[WebSRC] YouTubeGetEmotes response status:', res && res.status);
                        if (res && res.status === 'ok') {
                            store(_normalizeStreambotEmotes(res.emotes));
                            return;
                        }
                        console.warn('[WebSRC] YouTubeGetEmotes returned non-ok status. Response:', res);
                        reject(new Error('YouTubeGetEmotes failed and no fallback is available.'));
                    }).catch(function (err) {
                        console.error('[WebSRC] YouTubeGetEmotes request failed/timed out:', err);
                        reject(err);
                    });
                    return;
                }
            }

            // ── Direct fallback paths ─────────────────────────────────────────
            if (platform === 'twitch') {
                _fetchTwitchFallback(username, store, reject);
                return;
            }
            if (platform === 'kick') {
                _fetchKickEmotes(username, store, reject);
                return;
            }
            if (platform === '7tv') {
                if (!use7TV) { store([]); return; }
                _fetch7TVEmotes(username, store, reject);
                return;
            }
            if (platform === 'bttv') {
                if (!useBTTV) { store([]); return; }
                _fetchBTTVEmotes(username, store, reject);
                return;
            }
            if (platform === 'ffz') {
                if (!useFFZ) { store([]); return; }
                _fetchFFZEmotes(username, store, reject);
                return;
            }

            reject(new Error('WebSRC.getEmotes(): unsupported platform "' + platform + '". Use "twitch", "kick", "7tv", "bttv", "ffz", or "youtube".'));
        });

        // ── Normalise Streamer.bot emote response ─────────────────────────────
        // Filters out 7TV/BTTV/FFZ buckets if disabled in options
        function _normalizeStreambotEmotes(emotes) {
            let result = [];
            if (!emotes) return result;
            let buckets = [
                { key: 'userEmotes', allow: true },
                { key: 'bttvEmotes', allow: useBTTV },
                { key: 'ffzEmotes', allow: useFFZ },
                { key: 'sevenTvEmotes', allow: use7TV }
            ];
            for (let k = 0; k < buckets.length; k++) {
                if (!buckets[k].allow) continue;
                let list = emotes[buckets[k].key];
                if (!list || !list.length) continue;
                for (let i = 0; i < list.length; i++) {
                    let e = list[i];
                    result.push({
                        name: e.name || null,
                        imageUrl: e.imageUrl || null,
                        type: e.type || buckets[k].key,
                        zeroWidth: e.zeroWidth || false
                    });
                }
            }
            return result;
        }

        // ── Twitch fallback ───────────────────────────────────────────────────
        function _fetchTwitchFallback(user, resolve, reject) {
            let results = [];
            let pending = 1;

            function done() {
                pending--;
                if (pending === 0) resolve(results);
            }

            function push(arr) {
                for (let i = 0; i < arr.length; i++) results.push(arr[i]);
            }

            // Twitch global emotes
            fetch('/api/v1/twitch/chat/emotes/global').then(function (r) { return r.json(); }).then(function (json) {
                let data = json.data || [];
                for (let i = 0; i < data.length; i++) {
                    let e = data[i];
                    let url = e.images ? (e.images.url_4x || e.images.url_2x || e.images.url_1x) : null;
                    results.push({ name: e.name, imageUrl: url, type: 'twitch_global', zeroWidth: false });
                }
                done();
            }).catch(function () { done(); });

            if (user) {
                // Twitch channel emotes (needs user id first)
                pending++;
                fetch('/api/v1/twitch/users?login=' + encodeURIComponent(user)).then(function (r) { return r.json(); }).then(function (json) {
                    let users = json.data || [];
                    if (!users.length) { done(); return null; }
                    let userId = users[0].id;
                    return fetch('/api/v1/twitch/chat/emotes?broadcaster_id=' + userId).then(function (r) { return r.json(); });
                }).then(function (json) {
                    if (!json) return;
                    let data = json.data || [];
                    for (let i = 0; i < data.length; i++) {
                        let e = data[i];
                        let url = e.images ? (e.images.url_4x || e.images.url_2x || e.images.url_1x) : null;
                        results.push({ name: e.name, imageUrl: url, type: 'twitch_channel', zeroWidth: false });
                    }
                    done();
                }).catch(function () { done(); });

                // 7TV
                if (use7TV) {
                    pending++;
                    _fetch7TVEmotes(user, function (arr) { push(arr); done(); }, function () { done(); });
                }

                // BTTV
                if (useBTTV) {
                    pending++;
                    _fetchBTTVEmotes(user, function (arr) { push(arr); done(); }, function () { done(); });
                }

                // FFZ
                if (useFFZ) {
                    pending++;
                    _fetchFFZEmotes(user, function (arr) { push(arr); done(); }, function () { done(); });
                }

                // Cheermotes (Twitch bits animated emotes)
                if (useCheer) {
                    pending++;
                    fetch('/api/v1/twitch/bits/cheermotes').then(function (r) { return r.json(); }).then(function (json) {
                        let data = json.data || [];
                        for (let i = 0; i < data.length; i++) {
                            let cm = data[i];
                            let tiers = cm.tiers || [];
                            let url = null;
                            if (tiers.length) {
                                let imgs = tiers[0].images;
                                let dark = imgs && imgs.dark;
                                url = dark ? (dark.animated['4'] || dark.animated['2'] || dark.animated['1'] || dark.static['4'] || dark.static['1']) : null;
                            }
                            results.push({
                                name: cm.prefix,
                                imageUrl: url,
                                type: 'cheermote',
                                zeroWidth: false,
                                tiers: tiers
                            });
                        }
                        done();
                    }).catch(function () { done(); });
                }
            }
        }

        // ── 7TV emotes ────────────────────────────────────────────────────────
        function _fetch7TVEmotes(user, resolve, reject) {
            let results = [];
            let pending = 1;

            function done() {
                pending--;
                if (pending === 0) resolve(results);
            }

            function _parse7TVHost(e) {
                let host = e.data && e.data.host ? e.data.host : null;
                if (!host || !host.url || !host.files || !host.files.length) return null;
                let best = null;
                for (let f = 0; f < host.files.length; f++) {
                    let fn = host.files[f].name;
                    if (fn === '4x.webp' || fn === '4x.avif' || fn === '4x.png') { best = fn; break; }
                }
                if (!best) best = host.files[host.files.length - 1].name;
                return 'https:' + host.url + '/' + best;
            }

            fetch('https://7tv.io/v3/emote-sets/global').then(function (r) {
                return r.json();
            }).then(function (json) {
                let emotes = json.emotes || [];
                for (let i = 0; i < emotes.length; i++) {
                    let e = emotes[i];
                    results.push({ name: e.name, imageUrl: _parse7TVHost(e), type: '7tv_global', zeroWidth: !!(e.data && e.data.flags & 256) });
                }
                done();
            }).catch(function () { done(); });

            if (user) {
                pending++;
                fetch('https://7tv.io/v3/users/twitch/' + encodeURIComponent(user)).then(function (r) {
                    return r.json();
                }).then(function (json) {
                    let emotes = (json.emote_set && json.emote_set.emotes) ? json.emote_set.emotes : [];
                    for (let i = 0; i < emotes.length; i++) {
                        let e = emotes[i];
                        results.push({ name: e.name, imageUrl: _parse7TVHost(e), type: '7tv_channel', zeroWidth: !!(e.data && e.data.flags & 256) });
                    }
                    done();
                }).catch(function () { done(); });
            }
        }

        // ── BTTV emotes ───────────────────────────────────────────────────────
        function _fetchBTTVEmotes(user, resolve, reject) {
            let results = [];
            let pending = 1;

            function done() {
                pending--;
                if (pending === 0) resolve(results);
            }

            function _bttvUrl(id) {
                return 'https://cdn.betterttv.net/emote/' + id + '/3x';
            }

            // BTTV global emotes
            fetch('https://api.betterttv.net/3/cached/emotes/global').then(function (r) {
                return r.json();
            }).then(function (json) {
                let emotes = Array.isArray(json) ? json : [];
                for (let i = 0; i < emotes.length; i++) {
                    let e = emotes[i];
                    results.push({ name: e.code, imageUrl: _bttvUrl(e.id), type: 'bttv_global', zeroWidth: false });
                }
                done();
            }).catch(function () { done(); });

            if (user) {
                // BTTV needs Twitch user ID — resolve it first
                pending++;
                fetch('/api/v1/twitch/users?login=' + encodeURIComponent(user)).then(function (r) { return r.json(); }).then(function (json) {
                    let users = json.data || [];
                    if (!users.length) { done(); return null; }
                    let userId = users[0].id;
                    return fetch('https://api.betterttv.net/3/cached/users/twitch/' + userId).then(function (r) { return r.json(); });
                }).then(function (json) {
                    if (!json) return;
                    let channelEmotes = json.channelEmotes || [];
                    let sharedEmotes = json.sharedEmotes || [];
                    let all = channelEmotes.concat(sharedEmotes);
                    for (let i = 0; i < all.length; i++) {
                        let e = all[i];
                        results.push({ name: e.code, imageUrl: _bttvUrl(e.id), type: 'bttv_channel', zeroWidth: e.modifier || false });
                    }
                    done();
                }).catch(function () { done(); });
            }
        }

        // ── FFZ emotes ────────────────────────────────────────────────────────
        function _fetchFFZEmotes(user, resolve, reject) {
            let results = [];
            let pending = 1;

            function done() {
                pending--;
                if (pending === 0) resolve(results);
            }

            function _ffzBestUrl(urls) {
                if (!urls) return null;
                return urls['4'] || urls['2'] || urls['1'] || null;
            }

            // FFZ global emotes
            fetch('https://api.frankerfacez.com/v1/set/global').then(function (r) {
                return r.json();
            }).then(function (json) {
                let sets = json.sets || {};
                let setKeys = Object.keys(sets);
                for (let s = 0; s < setKeys.length; s++) {
                    let emotes = sets[setKeys[s]].emoticons || [];
                    for (let i = 0; i < emotes.length; i++) {
                        let e = emotes[i];
                        results.push({ name: e.name, imageUrl: _ffzBestUrl(e.urls), type: 'ffz_global', zeroWidth: false });
                    }
                }
                done();
            }).catch(function () { done(); });

            if (user) {
                pending++;
                fetch('https://api.frankerfacez.com/v1/room/' + encodeURIComponent(user.toLowerCase())).then(function (r) {
                    return r.json();
                }).then(function (json) {
                    let sets = json.sets || {};
                    let setKeys = Object.keys(sets);
                    for (let s = 0; s < setKeys.length; s++) {
                        let emotes = sets[setKeys[s]].emoticons || [];
                        for (let i = 0; i < emotes.length; i++) {
                            let e = emotes[i];
                            results.push({ name: e.name, imageUrl: _ffzBestUrl(e.urls), type: 'ffz_channel', zeroWidth: false });
                        }
                    }
                    done();
                }).catch(function () { done(); });
            }
        }

        // ── Kick emotes ───────────────────────────────────────────────────────
        function _fetchKickEmotes(user, resolve, reject) {
            if (!user) {
                reject(new Error('WebSRC.getEmotes(): a username is required for Kick emotes.'));
                return;
            }
            fetch('https://kick.com/emotes/' + encodeURIComponent(user)).then(function (r) {
                return r.json();
            }).then(function (json) {
                let results = [];
                let sets = Array.isArray(json) ? json : (json.data || []);
                for (let s = 0; s < sets.length; s++) {
                    let set = sets[s];
                    let setId = set.id || '';
                    let setName = (set.name || '').toLowerCase();
                    let type;
                    if (setId === 'Global' || setName === 'global') {
                        type = 'kick_global';
                    } else if (setId === 'Emoji' || setName === 'emojis' || setName === 'emoji') {
                        type = 'kick_emoji';
                    } else {
                        type = 'kick_channel';
                    }
                    let emotes = set.emotes || [];
                    for (let i = 0; i < emotes.length; i++) {
                        let e = emotes[i];
                        if (!e.name || !e.id) continue;
                        results.push({
                            name: e.name,
                            imageUrl: 'https://files.kick.com/emotes/' + e.id + '/fullsize',
                            type: type,
                            zeroWidth: false,
                            subscribersOnly: e.subscribers_only || false
                        });
                    }
                }
                resolve(results);
            }).catch(function (err) { reject(err); });
        }
    }

    parseEmotes(text, emotes, options) {
        if (typeof text !== 'string' || !text) return text;

        // emotes param is optional — fall back to stored this.emotes
        if (typeof emotes === 'object' && !Array.isArray(emotes)) {
            options = emotes;
            emotes = null;
        }

        options = options || {};
        let imgClass = options.imgClass || 'websrc-emote';
        let imgHeight = options.imgHeight !== undefined ? options.imgHeight : 28;
        let imgAlt = options.imgAlt !== undefined ? options.imgAlt : true;
        let zeroWidthCss = 'position:absolute;margin-left:-' + imgHeight + 'px;';

        if (options.fragments && Array.isArray(options.fragments) && options.fragments.length) {
            let chars = text.split('');
            let frags = options.fragments.slice().sort(function (a, b) { return b.startIndex - a.startIndex; });
            for (let f = 0; f < frags.length; f++) {
                let frag = frags[f];
                if (frag.id === undefined && frag.imageUrl === undefined) continue;
                let imgUrl = frag.imageUrl || ('https://static-cdn.jtvnw.net/emoticons/v2/' + frag.id + '/default/dark/3.0');
                let altTxt = imgAlt ? ' alt="' + (frag.name || '') + '"' : '';
                let clsTxt = imgClass ? ' class="' + imgClass + '"' : '';
                let style = 'height:' + imgHeight + 'px;vertical-align:middle;display:inline-block;';
                let tag = '<img src="' + imgUrl + '" style="' + style + '"' + clsTxt + altTxt + '>';
                chars.splice(frag.startIndex, (frag.endIndex - frag.startIndex) + 1, tag);
            }
            text = chars.join('');
            if (!emotes || !emotes.length) emotes = this.emotes;
            if (!emotes || !emotes.length) return text;
        }

        if (!emotes || !emotes.length) emotes = this.emotes;
        if (!emotes || !emotes.length) return text;

        // Build lookup: name -> emote (last write wins for duplicates)
        let lookup = {};
        for (let i = 0; i < emotes.length; i++) {
            let e = emotes[i];
            if (e.name && e.imageUrl) {
                lookup[e.name] = e;
            }
        }

        // Sort emote names longest-first to avoid partial replacements
        let names = Object.keys(lookup).sort(function (a, b) { return b.length - a.length; });
        if (!names.length) return text;

        let tokens = text.split(' ');
        let output = [];

        for (let t = 0; t < tokens.length; t++) {
            let token = tokens[t];
            if (token.indexOf('<img') === 0) { output.push(token); continue; }
            let matched = false;

            for (let n = 0; n < names.length; n++) {
                if (token === names[n]) {
                    let emote = lookup[names[n]];
                    let style = 'height:' + imgHeight + 'px;vertical-align:middle;display:inline-block;';
                    if (emote.zeroWidth) style += zeroWidthCss;
                    let alt = imgAlt ? ' alt="' + emote.name + '"' : '';
                    let cls = imgClass ? ' class="' + imgClass + '"' : '';
                    output.push('<img src="' + emote.imageUrl + '" style="' + style + '"' + cls + alt + '>');
                    matched = true;
                    break;
                }
            }

            if (!matched) output.push(token);
        }

        return output.join(' ');
    }

    getBadges(platform, username) {
        let self = this;
        platform = (platform || 'twitch').toLowerCase();

        let cacheKey = 'badges:' + platform + ':' + (username || '');
        let cacheTTL = self._options.emotes.cacheTTL !== undefined ? self._options.emotes.cacheTTL : 600000;
        if (cacheTTL > 0 && self._badgeCache[cacheKey]) {
            let entry = self._badgeCache[cacheKey];
            if (Date.now() - entry.ts < cacheTTL) {
                console.debug('[WebSRC] getBadges: serving from cache for', cacheKey, '(' + entry.badges.length + ' badges)');
                self.badges = entry.badges;
                return Promise.resolve(entry.badges);
            }
        }

        function store(badges) {
            if (cacheTTL > 0) self._badgeCache[cacheKey] = { ts: Date.now(), badges: badges };
            console.debug('[WebSRC] getBadges: loaded', badges.length, 'badges for', cacheKey);
            self.badges = badges;
            return badges;
        }

        if (platform === 'twitch') {
            let results = [];
            let pending = 1;
            return new Promise(function (resolve, reject) {
                function done() {
                    pending--;
                    if (pending === 0) resolve(store(results));
                }

                // Global badges
                fetch('/api/v1/twitch/chat/badges/global').then(function (r) { return r.json(); }).then(function (json) {
                    let data = json.data || [];
                    for (let i = 0; i < data.length; i++) {
                        let badge = data[i];
                        let versions = badge.versions || [];
                        for (let v = 0; v < versions.length; v++) {
                            let ver = versions[v];
                            results.push({
                                setId: badge.set_id,
                                id: ver.id,
                                imageUrl: ver.image_url_4x || ver.image_url_2x || ver.image_url_1x,
                                title: ver.title || badge.set_id,
                                type: 'global'
                            });
                        }
                    }
                    done();
                }).catch(function () { done(); });

                // Channel badges
                if (username) {
                    pending++;
                    fetch('/api/v1/twitch/users?login=' + encodeURIComponent(username)).then(function (r) { return r.json(); }).then(function (json) {
                        let users = json.data || [];
                        if (!users.length) { done(); return null; }
                        let userId = users[0].id;
                        return fetch('/api/v1/twitch/chat/badges?broadcaster_id=' + userId).then(function (r) { return r.json(); });
                    }).then(function (json) {
                        if (!json) return;
                        let data = json.data || [];
                        for (let i = 0; i < data.length; i++) {
                            let badge = data[i];
                            let versions = badge.versions || [];
                            for (let v = 0; v < versions.length; v++) {
                                let ver = versions[v];
                                results.push({
                                    setId: badge.set_id,
                                    id: ver.id,
                                    imageUrl: ver.image_url_4x || ver.image_url_2x || ver.image_url_1x,
                                    title: ver.title || badge.set_id,
                                    type: 'channel'
                                });
                            }
                        }
                        done();
                    }).catch(function () { done(); });
                }
            });
        }

        return Promise.reject(new Error('WebSRC.getBadges(): no badge source available for platform "' + platform + '".'));
    }

    parseBadges(badgeList, badges, options) {
        if (!badgeList) return '';

        // badges param optional — fall back to stored this.badges
        if (typeof badges === 'object' && !Array.isArray(badges)) {
            options = badges;
            badges = null;
        }
        if (!badges || !badges.length) badges = this.badges;
        if (!badges || !badges.length) return '';

        options = options || {};
        let imgClass = options.imgClass || 'websrc-badge';
        let imgHeight = options.imgHeight !== undefined ? options.imgHeight : 18;
        let imgAlt = options.imgAlt !== undefined ? options.imgAlt : true;

        // Build lookup: setId:versionId -> badge
        let lookup = {};
        for (let i = 0; i < badges.length; i++) {
            let b = badges[i];
            lookup[b.setId + ':' + b.id] = b;
        }

        // Normalise badgeList into [{setId, id}] regardless of input format
        let pairs = [];
        if (Array.isArray(badgeList)) {
            pairs = badgeList;
        } else if (typeof badgeList === 'object') {
            let keys = Object.keys(badgeList);
            for (let k = 0; k < keys.length; k++) {
                pairs.push({ setId: keys[k], id: String(badgeList[keys[k]]) });
            }
        }

        let output = [];
        for (let p = 0; p < pairs.length; p++) {
            let key = pairs[p].setId + ':' + pairs[p].id;
            let badge = lookup[key];
            if (!badge || !badge.imageUrl) continue;
            let alt = imgAlt ? ' alt="' + badge.title + '"' : '';
            let cls = imgClass ? ' class="' + imgClass + '"' : '';
            let style = 'height:' + imgHeight + 'px;vertical-align:middle;display:inline-block;margin-right:2px;';
            output.push('<img src="' + badge.imageUrl + '" style="' + style + '"' + cls + alt + '>');
        }

        return output.join('');
    }

    relay(event, data = {}) {
        if (!this._clients['streamdeck']) {
            console.error('StreamDeck client is not initialized or supported. Relay functionality requires StreamDeck client.');
            return;
        }
        this._clients['streamdeck'].relay(event, data);
    }

    pub(event, data = {}) {
        if (!this._clients['relay']) {
            console.error('WebSRC.pub() requires a relay client to be connected.');
            return Promise.reject(new Error('Relay client not connected.'));
        }
        return this._clients['relay'].publish(event, data);
    }

    sub(event, handler) {
        if (!this._clients['relay']) {
            console.error('WebSRC.sub() requires a relay client to be connected.');
            return;
        }
        this._clients['relay'].subscribe(event, handler);
    }

    async getTwitchClipData(slug) {
        const GQL_URL = 'https://gql.twitch.tv/gql';
        const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

        const response = await fetch(GQL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Client-Id': CLIENT_ID,
            },
            body: JSON.stringify([{
                operationName: 'VideoAccessToken_Clip',
                variables: {
                    platform: 'web',
                    slug
                },
                extensions: {
                    persistedQuery: {
                        version: 1,
                        sha256Hash: '4f35f1ac933d76b1da008c806cd5546a7534dfaff83e033a422a81f24e5991b3'
                    }
                }
            },
            {
                operationName: 'FeedInteractionHook_GetClipBySlug',
                variables: {
                    slug
                },
                extensions: {
                    persistedQuery: {
                        version: 1,
                        sha256Hash: '8ed8cce33cf76b576a99dd8cd5db7cb6e7f0e6111bd1927b49c0cada0513d7b6'
                    }
                }
            }
            ])
        });

        if (!response.ok) throw new Error(`GQL request failed: ${response.status}`);

        const [accessData, metaData] = await response.json();
        const clip = accessData?.data?.clip;
        const meta = metaData?.data?.clip;

        if (!clip || !meta) throw new Error('Clip not found. Check the slug.');

        const {
            signature,
            value
        } = clip.playbackAccessToken;

        return {
            url: `${clip.videoQualities[0].sourceURL}?token=${encodeURIComponent(value)}&sig=${signature}`,
            qualities: clip.videoQualities.map(q => ({
                quality: q.quality,
                frameRate: Math.round(q.frameRate),
                url: `${q.sourceURL}?token=${encodeURIComponent(value)}&sig=${signature}`
            })),
            title: meta.title,
            broadcaster_name: meta.broadcaster.displayName,
            broadcaster_login: meta.broadcaster.login,
            game: meta.game?.displayName || null,
            thumbnail_url: meta.thumbnailURL,
            views: meta.viewCount,
            language: meta.language,
        };
    }

    async getRandomTwitchRaidClip(login, maxDuration = 30) {
        const GQL_URL = 'https://gql.twitch.tv/gql';
        const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

        const response = await fetch(GQL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Client-Id': CLIENT_ID,
            },
            body: JSON.stringify([{
                operationName: 'ClipsCards__User',
                variables: {
                    login: login,
                    limit: 20,
                    criteria: {
                        filter: 'ALL_TIME',
                        shouldFilterByDiscoverySetting: true
                    },
                    cursor: null
                },
                extensions: {
                    persistedQuery: {
                        version: 1,
                        sha256Hash: '1cd671bfa12cec480499c087319f26d21925e9695d1f80225aae6a4354f23088'
                    }
                }
            }])
        });

        if (!response.ok) throw new Error(`GQL request failed: ${response.status}`);

        const [data] = await response.json();
        const clips = data?.data?.user?.clips?.edges?.map(e => e.node);

        if (!clips || clips.length === 0) throw new Error(`No clips found for user: ${login}`);

        const shortClips = clips.filter(c => c.durationSeconds <= maxDuration);
        const pool = shortClips.length > 0 ? shortClips : clips;
        const clip = pool[Math.floor(Math.random() * pool.length)];

        return {
            id: clip.id,
            url: clip.slug,
            type: 'twitch',
            time: null,
            bits: false,
            videoDetails: {
                title: clip.title,
                broadcaster_name: clip.broadcaster.displayName,
                broadcaster_login: clip.broadcaster.login,
                thumbnail_url: clip.thumbnailURL,
                game: clip.game?.name || null,
                duration: clip.durationSeconds,
                viewCount: clip.viewCount,
                createdAt: clip.createdAt,
            }
        };
    }

    async getFinalUrl(shortUrl) {
        try {
            const response = await fetch(`https://www.theliveitup34.com/api/v1/utils/fetch_redirect_origin?url=${btoa(shortUrl)}&parent=${encodeURIComponent(window.location.host)}`);
            const data = await response.json();
            return data;
        } catch (error) {
            return null;
        }
    }

    /**
     * Toggle shared chat filtering on or off at runtime.
     * @param {boolean} [enabled] - Pass true to allow shared chat guests, false to filter them.
     *                              Omit to flip the current state.
     * @returns {boolean} The new state (true = shared chat allowed, false = filtered out)
     */
    toggleSharedChat(enabled) {
        if (enabled === undefined) {
            this._options.sharedChat = !this._options.sharedChat;
        } else {
            this._options.sharedChat = !!enabled;
        }
        console.debug('[WebSRC] Shared chat toggled:', this._options.sharedChat ? 'enabled (guests allowed)' : 'disabled (guests filtered)');
        return this._options.sharedChat;
    }

    /**
     * Returns whether shared chat messages from guest channels are currently allowed.
     * @returns {boolean}
     */
    isSharedChatEnabled() {
        return this._options.sharedChat === true;
    }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = WebSRC;
} else {
    window.WebSRC = WebSRC;
}