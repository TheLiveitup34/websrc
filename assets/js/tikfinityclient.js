/**
 * TikFinityClient.js
 *
 * A WebSocket client for TikFinity with EventEmitter-style .on() API,
 * automatic reconnection, and pre-built TikTok Live event support.
 *
 * Default connection: ws://localhost:21213
 *
 * Control Events:
 *   connected, disconnected, error, reconnecting, rawData
 *
 * TikTok Message Events (mirrors TikTok-Live-Connector):
 *   chat, gift, member, like, social, follow, share, emote,
 *   envelope, questionNew, linkMicBattle, linkMicArmies,
 *   liveIntro, streamEnd, roomUser, superFan, superFanBox,
 *   goalUpdate, roomMessage, captionMessage, imDelete,
 *   inRoomBanner, rankUpdate, pollMessage, rankText,
 *   linkMicBattlePunishFinish, linkMicBattleTask,
 *   linkMicFanTicketMethod, linkMicMethod, unauthorizedMember,
 *   oecLiveShopping, msgDetect, linkMessage, roomVerify,
 *   linkLayer, roomPin
 *
 * Usage:
 *   const client = new TikFinityClient();
 *   client.on('chat', (data) => console.log(data));
 *   client.on('gift', (data) => console.log(data));
 *   client.on('connected', () => console.log('Connected!'));
 *   client.on('disconnected', () => console.log('Disconnected!'));
 *   client.on('error', (err) => console.error(err));
 *   client.connect();
 */

class TikFinityClient {
    /**
     * @param {Object} options
     * @param {string}  [options.host='localhost']        WebSocket host
     * @param {number}  [options.port=21213]              WebSocket port
     * @param {string}  [options.path='']                 WebSocket path (e.g. '/ws')
     * @param {boolean} [options.secure=false]            Use wss:// instead of ws://
     * @param {boolean} [options.autoReconnect=true]      Automatically reconnect on disconnect/error
     * @param {number}  [options.reconnectDelay=2000]     Initial delay in ms before reconnect attempt
     * @param {number}  [options.maxReconnectDelay=30000] Maximum delay cap in ms (exponential backoff)
     * @param {number}  [options.reconnectFactor=1.5]     Exponential backoff multiplier
     * @param {number}  [options.maxReconnectAttempts=0]  0 = unlimited
     */
    constructor(options = {}) {
        this._options = {
            host: options.host ?? 'localhost',
            port: options.port ?? 21213,
            path: options.path ?? '',
            secure: options.secure ?? false,
            autoReconnect: options.autoReconnect ?? true,
            reconnectDelay: options.reconnectDelay ?? 2000,
            maxReconnectDelay: options.maxReconnectDelay ?? 30000,
            reconnectFactor: options.reconnectFactor ?? 1.5,
            maxReconnectAttempts: options.maxReconnectAttempts ?? 0,
        };

        /** @type {Map<string, Function[]>} */
        this._listeners = new Map();

        /** @type {WebSocket|null} */
        this._ws = null;

        this._reconnectAttempts = 0;
        this._currentReconnectDelay = this._options.reconnectDelay;
        this._manualDisconnect = false;
        this._reconnectTimer = null;
        this._isConnected = false;
        this._isConnecting = false;
    }

    // ─── Public Getters ────────────────────────────────────────────────────────

    get isConnected() { return this._isConnected; }
    get isConnecting() { return this._isConnecting; }
    get reconnectAttempts() { return this._reconnectAttempts; }

    /** Returns the computed WebSocket URL based on current options */
    get url() {
        const { secure, host, port, path } = this._options;
        const scheme = secure ? 'wss' : 'ws';
        return `${scheme}://${host}:${port}${path}`;
    }

    // ─── Configuration ─────────────────────────────────────────────────────────

    /**
     * Update connection parameters. Takes effect on the next connect() call.
     * @param {Partial<typeof this._options>} params
     */
    setConnectionParams(params = {}) {
        Object.assign(this._options, params);
    }

    // ─── EventEmitter Interface ────────────────────────────────────────────────

    /**
     * Register an event listener.
     * @param {string}   event
     * @param {Function} callback
     * @returns {this}
     */
    on(event, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError(`Listener for "${event}" must be a function`);
        }
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);
        return this;
    }

    /**
     * Register a one-time event listener.
     * @param {string}   event
     * @param {Function} callback
     * @returns {this}
     */
    once(event, callback) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            callback(...args);
        };
        wrapper._original = callback;
        return this.on(event, wrapper);
    }

    /**
     * Remove a specific listener, or all listeners for an event.
     * @param {string}    event
     * @param {Function} [callback]
     * @returns {this}
     */
    off(event, callback) {
        if (!callback) {
            this._listeners.delete(event);
            return this;
        }
        const listeners = this._listeners.get(event);
        if (listeners) {
            const filtered = listeners.filter(
                (fn) => fn !== callback && fn._original !== callback
            );
            if (filtered.length) {
                this._listeners.set(event, filtered);
            } else {
                this._listeners.delete(event);
            }
        }
        return this;
    }

    /**
     * Remove ALL listeners for ALL events.
     * @returns {this}
     */
    removeAllListeners() {
        this._listeners.clear();
        return this;
    }

    /**
     * Emit an event to all registered listeners.
     * @param {string} event
     * @param {...*}   args
     */
    emit(event, ...args) {
        const listeners = this._listeners.get(event);
        if (listeners && listeners.length) {
            listeners.forEach((fn) => {
                try {
                    fn(...args);
                } catch (err) {
                    // Prevent a bad listener from breaking others
                    console.error(`[TikFinityClient] Error in listener for "${event}":`, err);
                }
            });
        }
    }

    // ─── Connection ────────────────────────────────────────────────────────────

    /**
     * Establish a WebSocket connection.
     * @returns {this}
     */
    connect() {
        if (this._isConnected || this._isConnecting) {
            console.warn('[TikFinityClient] Already connected or connecting.');
            return this;
        }

        this._manualDisconnect = false;
        this._isConnecting = true;
        this._openWebSocket();
        return this;
    }

    /**
     * Manually disconnect. Disables auto-reconnect until connect() is called again.
     */
    disconnect() {
        this._manualDisconnect = true;
        this._clearReconnectTimer();
        this._closeWebSocket(1000, 'Manual disconnect');
    }

    // ─── Internal WebSocket Lifecycle ─────────────────────────────────────────

    _openWebSocket() {
        const wsUrl = this.url;
        console.log(`[TikFinityClient] Connecting to ${wsUrl}…`);

        try {
            this._ws = new WebSocket(wsUrl);
        } catch (err) {
            this._isConnecting = false;
            this.emit('error', { info: 'Failed to create WebSocket', exception: err });
            this._scheduleReconnect();
            return;
        }

        this._ws.onopen = () => {
            console.log('[TikFinityClient] Connected.');
            this._isConnected = true;
            this._isConnecting = false;
            this._reconnectAttempts = 0;
            this._currentReconnectDelay = this._options.reconnectDelay;
            this.emit('connected', { url: this.url });
        };

        this._ws.onclose = (event) => {
            const wasConnected = this._isConnected;
            this._isConnected = false;
            this._isConnecting = false;
            this._ws = null;

            if (wasConnected || this._reconnectAttempts > 0) {
                console.log(`[TikFinityClient] Disconnected. Code: ${event.code}, Reason: ${event.reason || 'none'}`);
                this.emit('disconnected', { code: event.code, reason: event.reason });
            }

            if (!this._manualDisconnect && this._options.autoReconnect) {
                this._scheduleReconnect();
            }
        };

        this._ws.onerror = (event) => {
            console.error('[TikFinityClient] WebSocket error.');
            this.emit('error', {
                info: 'WebSocket error event',
                exception: event.error ?? event,
            });
            // onclose will fire next and handle reconnect scheduling
        };

        this._ws.onmessage = (messageEvent) => {
            this._handleMessage(messageEvent);
        };
    }

    _closeWebSocket(code = 1000, reason = '') {
        if (this._ws) {
            try {
                this._ws.close(code, reason);
            } catch (_) { /* ignore */ }
            this._ws = null;
        }
        this._isConnected = false;
        this._isConnecting = false;
    }

    // ─── Reconnect Logic ───────────────────────────────────────────────────────

    _scheduleReconnect() {
        const { maxReconnectAttempts, reconnectFactor, maxReconnectDelay } = this._options;

        if (maxReconnectAttempts > 0 && this._reconnectAttempts >= maxReconnectAttempts) {
            console.error(`[TikFinityClient] Max reconnect attempts (${maxReconnectAttempts}) reached. Giving up.`);
            this.emit('error', {
                info: `Max reconnect attempts (${maxReconnectAttempts}) reached`,
                exception: null,
            });
            return;
        }

        this._reconnectAttempts++;
        const delay = Math.min(this._currentReconnectDelay, maxReconnectDelay);
        console.log(
            `[TikFinityClient] Reconnecting in ${delay}ms… (attempt ${this._reconnectAttempts}${maxReconnectAttempts ? '/' + maxReconnectAttempts : ''})`
        );
        this.emit('reconnecting', { attempt: this._reconnectAttempts, delay });

        this._reconnectTimer = setTimeout(() => {
            this._isConnecting = true;
            this._openWebSocket();
        }, delay);

        // Exponential backoff
        this._currentReconnectDelay = Math.min(
            this._currentReconnectDelay * reconnectFactor,
            maxReconnectDelay
        );
    }

    _clearReconnectTimer() {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    // ─── Message Parsing & Dispatch ────────────────────────────────────────────

    /**
     * Parses an incoming WebSocket message and dispatches the appropriate event.
     * TikFinity sends JSON messages shaped as: { event: string, data: object }
     * @param {MessageEvent} messageEvent
     */
    _handleMessage(messageEvent) {
        const raw = messageEvent.data;
        this.emit('rawData', raw);

        let parsed;
        try {
            parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (err) {
            this.emit('error', { info: 'Failed to parse message', exception: err });
            return;
        }

        // Normalise: TikFinity may send { event, data } or { type, data } or { action, data }
        const eventName = parsed.event ?? parsed.type ?? parsed.action ?? null;
        const data = parsed.data ?? parsed;

        if (eventName && TikFinityClient.KNOWN_EVENTS.has(eventName)) {
            this.emit(eventName, data);
        } else if (eventName) {
            // Unknown / custom event — emit it anyway so users can handle it
            this.emit(eventName, data);
        } else {
            // No event field — emit the whole payload as generic 'message'
            this.emit('message', data);
        }
    }

    // ─── Send ──────────────────────────────────────────────────────────────────

    /**
     * Send a raw string or object (auto-serialised to JSON) to the server.
     * @param {string|Object} payload
     * @returns {boolean} true if sent, false if not connected
     */
    send(payload) {
        if (!this._isConnected || !this._ws) {
            this.emit('error', { info: 'Cannot send — not connected', exception: null });
            return false;
        }
        const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
        try {
            this._ws.send(message);
            return true;
        } catch (err) {
            this.emit('error', { info: 'Failed to send message', exception: err });
            return false;
        }
    }
}

// ─── Known Event Registry ──────────────────────────────────────────────────

/**
 * Control Events — connection lifecycle
 */
TikFinityClient.ControlEvent = Object.freeze({
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting',
    ERROR: 'error',
    RAW_DATA: 'rawData',
    MESSAGE: 'message',
});

/**
 * TikTok Webcast Events — mirrors TikTok-Live-Connector WebcastEvent names
 */
TikFinityClient.WebcastEvent = Object.freeze({
    CHAT: 'chat',
    GIFT: 'gift',
    MEMBER: 'member',
    LIKE: 'like',
    SOCIAL: 'social',
    FOLLOW: 'follow',
    SHARE: 'share',
    EMOTE: 'emote',
    ENVELOPE: 'envelope',
    QUESTION_NEW: 'questionNew',
    LINK_MIC_BATTLE: 'linkMicBattle',
    LINK_MIC_ARMIES: 'linkMicArmies',
    LIVE_INTRO: 'liveIntro',
    STREAM_END: 'streamEnd',
    ROOM_USER: 'roomUser',
    SUPER_FAN: 'superFan',
    SUPER_FAN_BOX: 'superFanBox',
    GOAL_UPDATE: 'goalUpdate',
    ROOM_MESSAGE: 'roomMessage',
    CAPTION_MESSAGE: 'captionMessage',
    IM_DELETE: 'imDelete',
    IN_ROOM_BANNER: 'inRoomBanner',
    RANK_UPDATE: 'rankUpdate',
    POLL_MESSAGE: 'pollMessage',
    RANK_TEXT: 'rankText',
    LINK_MIC_BATTLE_PUNISH_FINISH: 'linkMicBattlePunishFinish',
    LINK_MIC_BATTLE_TASK: 'linkMicBattleTask',
    LINK_MIC_FAN_TICKET_METHOD: 'linkMicFanTicketMethod',
    LINK_MIC_METHOD: 'linkMicMethod',
    UNAUTHORIZED_MEMBER: 'unauthorizedMember',
    OEC_LIVE_SHOPPING: 'oecLiveShopping',
    MSG_DETECT: 'msgDetect',
    LINK_MESSAGE: 'linkMessage',
    ROOM_VERIFY: 'roomVerify',
    LINK_LAYER: 'linkLayer',
    ROOM_PIN: 'roomPin',
});

/** Flat set of all known event names for fast lookup in _handleMessage */
TikFinityClient.KNOWN_EVENTS = new Set([
    ...Object.values(TikFinityClient.ControlEvent),
    ...Object.values(TikFinityClient.WebcastEvent),
]);

// ─── Export ────────────────────────────────────────────────────────────────

// CommonJS (Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TikFinityClient };
}

// ESM / Browser global fallback
if (typeof window !== 'undefined') {
    window.TikFinityClient = TikFinityClient;
}

// ─── Usage Example (uncomment to run) ────────────────────────────────────

/*
const { TikFinityClient } = require('./TikFinityClient');

const client = new TikFinityClient({
  host: 'localhost',
  port: 21213,
  autoReconnect: true,
  reconnectDelay: 2000,
  maxReconnectDelay: 30000,
});

// Control events
client.on(TikFinityClient.ControlEvent.CONNECTED,    ()    => console.log('✅ Connected to TikFinity'));
client.on(TikFinityClient.ControlEvent.DISCONNECTED, (e)   => console.log('❌ Disconnected:', e.code, e.reason));
client.on(TikFinityClient.ControlEvent.RECONNECTING, (e)   => console.log(`🔄 Reconnecting… attempt ${e.attempt}`));
client.on(TikFinityClient.ControlEvent.ERROR,        (e)   => console.error('⚠️ Error:', e.info, e.exception));

// TikTok message events
client.on(TikFinityClient.WebcastEvent.CHAT,     (data) => console.log(`💬 ${data.user?.uniqueId}: ${data.comment}`));
client.on(TikFinityClient.WebcastEvent.GIFT,     (data) => console.log(`🎁 ${data.user?.uniqueId} sent gift ${data.giftId}`));
client.on(TikFinityClient.WebcastEvent.MEMBER,   (data) => console.log(`👋 ${data.user?.uniqueId} joined`));
client.on(TikFinityClient.WebcastEvent.LIKE,     (data) => console.log(`❤️ ${data.user?.uniqueId} liked`));
client.on(TikFinityClient.WebcastEvent.FOLLOW,   (data) => console.log(`➕ ${data.user?.uniqueId} followed`));
client.on(TikFinityClient.WebcastEvent.SHARE,    (data) => console.log(`📤 ${data.user?.uniqueId} shared`));
client.on(TikFinityClient.WebcastEvent.STREAM_END, ()   => console.log('🔴 Stream ended'));

// You can also use raw string event names
client.on('chat',   (data) => { /* same as WebcastEvent.CHAT * / });
client.on('connected', () => { /* same as ControlEvent.CONNECTED * / });

// Change host/port at runtime (takes effect on next connect())
client.setConnectionParams({ host: '192.168.1.10', port: 9000 });

client.connect();

// Manual disconnect after 60 seconds
setTimeout(() => client.disconnect(), 60_000);
*/