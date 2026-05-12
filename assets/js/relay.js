/**
 * Relay v7.1 — Lightweight P2P Mesh
 *
 * Changes from v7:
 * - All silent error swallows now emit('system', ...) and emit('error', ...)
 * - New 'error' event type for structured error reporting
 * - _send failures surface via emit
 * - publish() routing failures surface via emit
 * - emit() handler exceptions surface via emit('error')
 * - RPC timeouts surface via emit
 * - Offline queue flush failures surface via emit
 * - _shutdown close/destroy failures surface via emit
 * - PeerJS load failure surfaces via emit
 * - Pub/Sub callback errors surface via emit
 * - conn.close() in _removePeer surfaces via emit
 */

class Relay {
    constructor(config = {}) {
        this._detectBrowser();

        // ── Identity ──────────────────────────────────────────
        this.pseudoname = null;
        this.peer = null;

        // ── Connections ───────────────────────────────────────
        this.conns = {};
        this.lastSeen = {};

        // ── Event handlers ────────────────────────────────────
        this.handlers = {
            message: [], system: [], ready: [], peerChange: [],
            presence: [], fileProgress: [], fileReceived: [],
            error: []   // ← new structured error event
        };

        // ── RPC ───────────────────────────────────────────────
        this.services = {};
        this._rpcHandlers = new Map();
        this.pendingRPC = new Map();

        // ── Routing ───────────────────────────────────────────
        this.routingTable = new Map();
        this.neighborPeers = new Set();
        this.ROUTING_UPDATE_INTERVAL = 20000;
        this.ROUTING_TIMEOUT = 60000;
        this.MAX_HOPS = 6;
        this._routingUpdateHandle = null;

        // ── Pub/Sub ───────────────────────────────────────────
        this.topics = new Map();
        this.topicSubscribers = new Map();

        // ── Presence ──────────────────────────────────────────
        this.presenceData = new Map();
        this.myPresence = { status: 'online', activity: null, metadata: {} };

        // ── Message dedup ─────────────────────────────────────
        this.msgCache = new Map();
        this.MSG_TTL = 2 * 60 * 1000;
        this._pruneCacheHandle = null;

        // ── File transfers ────────────────────────────────────
        this.fileTransfers = new Map();
        this.FILE_CHUNK_SIZE = 64 * 1024;

        // ── Offline queue ─────────────────────────────────────
        this.offlineQueue = new Map();
        this.OFFLINE_QUEUE_MAX = 200;

        // ── Auto-reconnect ────────────────────────────────────
        this.autoReconnect = config.autoReconnect !== false;
        this.reconnectAttempts = new Map();
        this.reconnectTimers = new Map();
        this.disconnectedPeers = new Set(); // Tracks intentionally disconnected peers
        this.lastPesterAt = new Map(); // Tracks the last time a blocked peer tried to reach us
        this.QUIET_PERIOD = 5000;      // 5 seconds of silence required
        this.MAX_RECONNECT_ATTEMPTS = config.maxReconnectAttempts
            ?? (this.isSafari ? 6 : this.isFirefox ? 9 : 12);
        this._baseReconnectDelay = config.reconnectDelay
            ?? (this.isSafari ? 6000 : this.isFirefox ? 4000 : 3000);

        // ── Limits & intervals ────────────────────────────────
        this.MAX_CONNECTIONS = config.maxConnections || 150;
        this.HEARTBEAT_INTERVAL = 45000;
        this.STALE_THRESHOLD = 120000;
        this.PRESENCE_INTERVAL = 30000;
        this.RPC_TIMEOUT = config.rpcTimeout || 20000;

        // ── Outbound send queue (per peer) ────────────────────
        this._sendQueues = new Map();

        this._unloadHandler = () => this._shutdown();
    }

    // ═══════════════════════════════════════════════════════════
    // BROWSER DETECTION
    // ═══════════════════════════════════════════════════════════

    _detectBrowser() {
        const ua = navigator.userAgent;
        const lc = ua.toLowerCase();

        this.isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        this.isFirefox = lc.includes('firefox');
        this.isChrome = lc.includes('chrome') && !this.isSafari;
        this.isEdge = lc.includes('edg/');
        this.isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(lc);
        this.isIOS = /iphone|ipad|ipod/.test(lc);

        if (this.isSafari) {
            const m = ua.match(/Version\/(\d+\.\d+)/);
            this.safariVersion = m ? parseFloat(m[1]) : 0;
            this.isOldSafari = this.safariVersion < 15;
        }

        this.maybePrivateBrowsing = false;
        try {
            if (this.isSafari && !window.indexedDB) this.maybePrivateBrowsing = true;
        } catch { this.maybePrivateBrowsing = true; }
    }

    // ═══════════════════════════════════════════════════════════
    // ERROR HELPERS
    // ═══════════════════════════════════════════════════════════

    /**
     * Emit a structured error. Always fires both:
     * emit('error', { code, message, context })   ← for programmatic use
     * emit('system', '[ERROR:code] message')       ← for log feeds
     */
    _emitError(code, message, context = {}) {
        const payload = { code, message, context, ts: Date.now() };
        // Call handlers directly to avoid the emit() wrapper catching its own errors
        (this.handlers['error'] || []).forEach(cb => {
            try { cb(payload); } catch (e) { console.error('[Relay] error handler threw:', e); }
        });
        (this.handlers['system'] || []).forEach(cb => {
            try { cb(`[ERROR:${code}] ${message}`); } catch (e) { console.error('[Relay] system handler threw:', e); }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // PUBLIC API — EVENT SYSTEM
    // ═══════════════════════════════════════════════════════════

    on(eventOrMethod, cb) {
        if (eventOrMethod.includes('.')) {
            const [ns, method] = eventOrMethod.split('.');
            if (!this._rpcHandlers.has(eventOrMethod))
                this._rpcHandlers.set(eventOrMethod, []);
            this._rpcHandlers.get(eventOrMethod).push(cb);

            if (!this.services[ns]) this.services[ns] = {};
            const prev = this.services[ns][method];
            this.services[ns][method] = async (params, fromPeer) => {
                let result;
                if (typeof prev === 'function') result = await prev(params, fromPeer);
                for (const h of this._rpcHandlers.get(eventOrMethod) || []) {
                    try {
                        const r = await h(params, fromPeer);
                        if (r !== undefined) result = r;
                    } catch (e) {
                        this._emitError('RPC_HANDLER', `Handler error [${eventOrMethod}]: ${e.message}`, { method: eventOrMethod, error: e.message });
                    }
                }
                return result ?? { ok: true };
            };
        } else {
            if (this.handlers[eventOrMethod])
                this.handlers[eventOrMethod].push(cb);
        }
        return this;
    }

    registerService(namespace, methods) {
        if (!this.services[namespace]) this.services[namespace] = {};
        for (const [method, fn] of Object.entries(methods)) {
            const key = `${namespace}.${method}`;
            const onHandlers = this._rpcHandlers.get(key) || [];
            const prevRegistered = this.services[namespace][method];

            this.services[namespace][method] = async (params, fromPeer) => {
                let result;
                try {
                    if (typeof prevRegistered === 'function')
                        result = await prevRegistered(params, fromPeer);
                    result = await fn(params, fromPeer);
                } catch (e) {
                    for (const h of onHandlers) {
                        try { await h(params, fromPeer); } catch { }
                    }
                    throw e;
                }
                for (const h of onHandlers) {
                    try {
                        const r = await h(params, fromPeer);
                        if (r !== undefined) result = r;
                    } catch (e) {
                        this._emitError('SERVICE_HANDLER', `on() handler error [${key}]: ${e.message}`, { key, error: e.message });
                    }
                }
                return result;
            };
        }
        return this;
    }

    emit(event, ...args) {
        (this.handlers[event] || []).forEach(cb => {
            try {
                cb(...args);
            } catch (e) {
                // Don't recurse if the error event itself throws — use console only
                if (event !== 'error' && event !== 'system') {
                    this._emitError('EMIT_HANDLER', `Handler for '${event}' threw: ${e.message}`, { event, error: e.message });
                } else {
                    console.error(`[Relay] ${event} handler threw:`, e);
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════

    async init(preferredId = null, pseudoname = null) {
        this.pseudoname = pseudoname || `Node-${Math.random().toString(36).slice(2, 8)}`;

        if (this.isOldSafari)
            console.warn('[Relay] Safari < 15 — WebRTC support may be limited.');
        if (this.maybePrivateBrowsing)
            console.warn('[Relay] Private browsing detected — some features may be restricted.');

        this._registerBuiltInServices();

        try {
            await this._loadPeerJS();
        } catch (e) {
            this._emitError('PEERJS_LOAD', `Failed to load PeerJS: ${e.message}`, { error: e.message });
            throw e; // still rethrow so init() callers know it failed
        }

        this.peer = new Peer(preferredId || crypto.randomUUID());
        window.addEventListener('beforeunload', this._unloadHandler);

        this.peer.on('open', id => {
            this.emit('ready', id);
            this._startHeartbeat();
            this._startPresenceBroadcast();
            this._startRoutingUpdates();
            this._startCachePruning();

            for (const topic of this.topics.keys())
                this._announceSubscription(topic, true);
        });

        this.peer.on('connection', conn => {
            if (this.disconnectedPeers.has(conn.peer)) {
                this.lastPesterAt.set(conn.peer, Date.now());
                this.emit('system', `Blocked peer ${conn.peer.slice(0, 8)} attempted to reconnect`);
                conn.close();
                return;
            }
            conn._isInitiator = false;
            this._setup(conn);
        });

        this.peer.on('disconnected', () => {
            this.emit('system', 'PeerJS server disconnected — attempting reconnect');
            if (this.autoReconnect && !this.peer.destroyed) {
                setTimeout(() => this.peer.reconnect(), this._baseReconnectDelay);
            }
        });

        this.peer.on('error', err => {
            this._emitError('PEER', `PeerJS error: ${err.type} — ${err.message || ''}`, { type: err.type, message: err.message });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // CONNECTION MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    connectToPeer(pid) {
        if (this.disconnectedPeers.has(pid)) {
            const lastAttempt = this.lastPesterAt.get(pid) || 0;
            const timeSinceLastCall = Date.now() - lastAttempt;

            if (timeSinceLastCall > this.QUIET_PERIOD) {
                this.disconnectedPeers.delete(pid);
                this.lastPesterAt.delete(pid);
                this.emit('system', `Unblocking peer ${pid.slice(0, 8)} after quiet period`);
            } else {
                this.lastPesterAt.set(pid, Date.now());
                return;
            }
        }

        if (!this.peer || this.peer.destroyed) {
            this._emitError('CONNECT', `Cannot connect to ${pid.slice(0, 8)}: peer destroyed or not initialised`);
            return;
        }
        if (Object.keys(this.conns).length >= this.MAX_CONNECTIONS) {
            this._emitError('CONNECT', `Cannot connect to ${pid.slice(0, 8)}: MAX_CONNECTIONS (${this.MAX_CONNECTIONS}) reached`);
            return;
        }
        if (this.conns[pid] || pid === this.peer.id) return;
        const conn = this.peer.connect(pid, { reliable: true, serialization: 'json' });
        conn._isInitiator = true;
        this._setup(conn);
    }

    _setup(conn) {
        conn.on('open', () => {
            if (Object.keys(this.conns).length >= this.MAX_CONNECTIONS) {
                this._emitError('CONNECT', `Rejected incoming connection from ${conn.peer?.slice(0, 8)}: at capacity`);
                conn.close();
                return;
            }

            if (this.conns[conn.peer]) {
                const keepNew = conn._isInitiator && this.peer.id < conn.peer;
                if (!keepNew) { conn.close(); return; }
                this.conns[conn.peer].close();
            }

            this.conns[conn.peer] = conn;
            this.lastSeen[conn.peer] = Date.now();
            this._clearReconnectTimer(conn.peer);
            this.neighborPeers.add(conn.peer);
            this._syncRoutingEntry(conn.peer);

            this._send(conn.peer, {
                type: '__hello',
                name: this.pseudoname,
                known: Object.keys(this.conns).filter(p => p !== conn.peer).slice(0, 10),
                topics: Array.from(this.topics.keys()),
                presence: { ...this.myPresence, name: this.pseudoname }
            });

            this.emit('peerChange', this.getAllPeers());
            this._broadcastRoutingTable();
        });

        conn.on('data', data => {
            this.lastSeen[conn.peer] = Date.now();
            if (data?.type === '__ping') return;
            this._dispatch(conn.peer, data);
        });

        conn.on('close', () => this._removePeer(conn.peer));

        conn.on('error', err => {
            this._emitError('CONN', `Connection error [${conn.peer?.slice(0, 8)}]: ${err.message}`, {
                peer: conn.peer,
                error: err.message
            });
            this._removePeer(conn.peer);
        });
    }

    _removePeer(pid) {
        const conn = this.conns[pid];
        if (conn) {
            try { conn.close(); } catch (e) {
                this._emitError('CONN_CLOSE', `Failed to close connection to ${pid?.slice(0, 8)}: ${e.message}`, { peer: pid, error: e.message });
            }
        }
        delete this.conns[pid];
        delete this.lastSeen[pid];
        this.neighborPeers.delete(pid);

        this.routingTable.delete(pid);
        for (const [dest, info] of this.routingTable.entries()) {
            if (info.nextHop === pid) this.routingTable.delete(dest);
        }

        this._cleanSendQueue(pid);
        this._setupAutoReconnect(pid);
        this.emit('peerChange', this.getAllPeers());
    }

    getAllPeers() {
        const peers = new Set([...this.neighborPeers, ...this.routingTable.keys()]);
        return Array.from(peers);
    }

    // ═══════════════════════════════════════════════════════════
    // SEND
    // ═══════════════════════════════════════════════════════════

    _send(pid, obj) {
        const tail = (this._sendQueues.get(pid) || Promise.resolve())
            .then(() => {
                const conn = this.conns[pid];
                if (conn && conn.open) conn.send(obj);
            })
            .catch(err => {
                this._emitError('SEND', `Send to ${pid?.slice(0, 8)} failed: ${err.message}`, {
                    peer: pid,
                    msgType: obj?.type || '(unknown)',
                    error: err.message
                });
            });
        this._sendQueues.set(pid, tail);
    }

    _cleanSendQueue(pid) {
        this._sendQueues.delete(pid);
    }

    async sendTo(pid, obj) {
        if (this.conns[pid]) {
            this._send(pid, this._wrap(obj));
        } else if (this.autoReconnect && !this.disconnectedPeers.has(pid)) {
            // Prevent offline queueing if we intentionally disconnected from this peer
            this._queueOffline(pid, obj);
        } else {
            this._emitError('SEND_NO_ROUTE', `sendTo: no connection to ${pid?.slice(0, 8)} and autoReconnect is off (or peer explicitly disconnected)`, { peer: pid });
        }
    }

    async sendToWithRouting(pid, obj) {
        const route = this._findRoute(pid);
        if (!route) {
            const err = new Error(`No route to ${pid.slice(0, 8)}`);
            this._emitError('NO_ROUTE', `No route to ${pid.slice(0, 8)}`, { peer: pid });
            throw err;
        }
        const envelope = {
            type: '__routed',
            dest: pid,
            origin: this.peer.id,
            hops: 0,
            maxHops: this.MAX_HOPS,
            payload: obj
        };
        this._send(route.nextHop, envelope);
    }

    broadcast(obj) {
        const wrapped = this._wrap(obj);
        for (const pid in this.conns) this._send(pid, wrapped);
    }

    _wrap(obj) {
        return { ...obj, __mid: crypto.randomUUID(), __ts: Date.now() };
    }

    reply(pid, requestId, result, isError = false) {
        this.sendTo(pid, {
            jsonrpc: '2.0',
            id: requestId,
            [isError ? 'error' : 'result']: result
        });
    }

    // ═══════════════════════════════════════════════════════════
    // DISPATCH
    // ═══════════════════════════════════════════════════════════

    _dispatch(pid, data) {
        if (!data || typeof data !== 'object') return;

        if (data.__mid) {
            if (this.msgCache.has(data.__mid)) return;
            this.msgCache.set(data.__mid, Date.now() + this.MSG_TTL);
        }

        const { type } = data;

        if (type === '__hello') { this._handleHello(pid, data); return; }
        if (type === '__routed') { this._handleRouted(data, pid); return; }
        if (type === '__routing_update') { this._updateRoutingTable(data.routes, pid); return; }
        if (type === '__topic_sub') { this._handleTopicSub(pid, data.topic, data.subscribed); return; }
        if (type === '__presence') { this._handlePresence(pid, data.presence); return; }
        if (type === '__disconnect') { this._removePeer(pid); return; }
        if (type === 'file_start') { this._handleFileStart(pid, data); return; }
        if (type === 'file_chunk') { this._handleFileChunk(pid, data); return; }
        if (type === 'file_complete') { this._handleFileComplete(pid, data); return; }

        if (type === '__pubsub') { this._deliverToTopic(data.topic, data.data, data.from); return; }

        if (data.jsonrpc === '2.0') { this._handleRPC(pid, data); return; }

        this.emit('message', pid, data);
    }

    // ═══════════════════════════════════════════════════════════
    // HELLO
    // ═══════════════════════════════════════════════════════════

    _handleHello(pid, data) {
        if (data.name) {
            const existing = this.presenceData.get(pid) || {};
            this.presenceData.set(pid, { ...existing, name: data.name });
        }

        if (data.presence) this._handlePresence(pid, { ...data.presence, id: pid });

        if (data.known?.length) {
            const now = Date.now();
            const available = this.MAX_CONNECTIONS - Object.keys(this.conns).length;

            const toConnect = data.known.filter(id => {
                // 1. Skip if already connected or if it's us
                if (this.conns[id] || id === this.peer.id) return false;

                // 2. Check if peer is in the Penalty Box
                if (this.disconnectedPeers.has(id)) {
                    const lastPester = this.lastPesterAt.get(id) || 0;
                    if (now - lastPester > this.QUIET_PERIOD) {
                        // They've been quiet! Let them back in.
                        this.disconnectedPeers.delete(id);
                        this.lastPesterAt.delete(id);
                        return true;
                    } else {
                        // Still "pestering" via discovery. Reset their timer and skip.
                        this.lastPesterAt.set(id, now);
                        return false;
                    }
                }
                return true; // Not blocked, safe to connect
            }).slice(0, Math.min(5, available));

            toConnect.forEach(id => this.connectToPeer(id));

            if (toConnect.length)
                this.emit('system', `Discovered ${toConnect.length} peer(s) via ${pid.slice(0, 8)}`);
        }

        if (data.topics?.length) {
            for (const topic of data.topics)
                this._handleTopicSub(pid, topic, true);
        }

        let delay = 0;
        for (const topic of this.topics.keys()) {
            setTimeout(() => this._announceSubscription(topic, true, pid), delay);
            delay += 15;
        }

        this._flushOfflineQueue(pid);
        this.emit('system', `Peer joined: ${data.name || pid.slice(0, 8)}`);
    }

    // ═══════════════════════════════════════════════════════════
    // ROUTING
    // ═══════════════════════════════════════════════════════════

    _syncRoutingEntry(pid) {
        this.routingTable.set(pid, { nextHop: pid, distance: 1, lastUpdate: Date.now() });
    }

    _updateRoutingTable(routes, fromPeer) {
        if (!routes) return;
        let updated = false;
        for (const [dest, info] of Object.entries(routes)) {
            if (dest === this.peer.id) continue;
            const newDist = info.distance + 1;
            const existing = this.routingTable.get(dest);
            if (!existing || existing.distance > newDist) {
                this.routingTable.set(dest, { nextHop: fromPeer, distance: newDist, lastUpdate: Date.now() });
                updated = true;
            }
        }
        if (updated) this.emit('system', `Routes updated via ${fromPeer.slice(0, 8)}`);
    }

    _broadcastRoutingTable() {
        const routes = {};
        for (const [dest, info] of this.routingTable.entries()) {
            if (info.distance < this.MAX_HOPS)
                routes[dest] = { distance: info.distance };
        }
        for (const pid of this.neighborPeers) {
            this._send(pid, { type: '__routing_update', routes });
        }
    }

    _cleanStaleRoutes() {
        const now = Date.now();
        for (const [pid, info] of this.routingTable.entries()) {
            if (now - info.lastUpdate > this.ROUTING_TIMEOUT) {
                this.routingTable.delete(pid);
                this.emit('system', `Expired stale route to ${pid.slice(0, 8)}`);
            }
        }
    }

    _startRoutingUpdates() {
        this._routingUpdateHandle = setInterval(() => {
            this._cleanStaleRoutes();
            this._broadcastRoutingTable();
        }, this.ROUTING_UPDATE_INTERVAL);
    }

    _findRoute(pid) {
        if (this.conns[pid]) return { nextHop: pid, distance: 1 };
        return this.routingTable.get(pid) || null;
    }

    _handleRouted(envelope, fromPeer) {
        if (envelope.hops >= envelope.maxHops) {
            this._emitError('MAX_HOPS', `Routed message from ${envelope.origin?.slice(0, 8)} to ${envelope.dest?.slice(0, 8)} exceeded max hops (${envelope.maxHops})`, {
                origin: envelope.origin,
                dest: envelope.dest,
                hops: envelope.hops
            });
            return;
        }
        envelope.hops++;

        if (envelope.dest === this.peer.id) {
            this._dispatch(envelope.origin, envelope.payload);
            return;
        }

        const route = this._findRoute(envelope.dest);
        if (route) {
            this._send(route.nextHop, envelope);
        } else {
            this._emitError('NO_ROUTE', `Cannot forward routed message: no route to ${envelope.dest?.slice(0, 8)}`, {
                dest: envelope.dest,
                origin: envelope.origin
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PUB/SUB
    // ═══════════════════════════════════════════════════════════

    subscribe(topic, callback) {
        if (!this.topics.has(topic)) this.topics.set(topic, new Set());
        this.topics.get(topic).add(callback);
        if (this.peer?.id) this._announceSubscription(topic, true);
        return this;
    }

    unsubscribe(topic, callback) {
        const subs = this.topics.get(topic);
        if (!subs) return this;
        subs.delete(callback);
        if (subs.size === 0) {
            this.topics.delete(topic);
            if (this.peer?.id) this._announceSubscription(topic, false);
        }
        return this;
    }

    publish(topic, data) {
        const msg = {
            type: '__pubsub',
            topic,
            data,
            from: this.peer.id,
            timestamp: Date.now()
        };
        this._deliverToTopic(topic, data, this.peer.id);
        const subscribers = this.topicSubscribers.get(topic) || new Set();
        for (const pid of subscribers) {
            if (this.conns[pid]) {
                this._send(pid, msg);
            } else {
                try {
                    this.sendToWithRouting(pid, msg);
                } catch (e) {
                    this._emitError('PUBSUB_NO_ROUTE', `publish('${topic}'): no route to subscriber ${pid.slice(0, 8)}`, {
                        topic,
                        peer: pid,
                        error: e.message
                    });
                }
            }
        }
    }

    _deliverToTopic(topic, data, from) {
        (this.topics.get(topic) || new Set()).forEach(cb => {
            try {
                cb(data, from);
            } catch (e) {
                this._emitError('PUBSUB_CB', `Subscriber callback error for topic '${topic}': ${e.message}`, {
                    topic,
                    from,
                    error: e.message
                });
            }
        });
    }

    _announceSubscription(topic, subscribed, targetPeer = null) {
        const msg = { type: '__topic_sub', topic, subscribed, peer: this.peer.id };
        if (targetPeer) {
            if (this.conns[targetPeer]) this._send(targetPeer, msg);
            return;
        }
        for (const pid of this.getAllPeers()) {
            if (this.conns[pid]) this._send(pid, msg);
        }
    }

    _handleTopicSub(pid, topic, subscribed) {
        if (!this.topicSubscribers.has(topic))
            this.topicSubscribers.set(topic, new Set());
        const set = this.topicSubscribers.get(topic);
        subscribed ? set.add(pid) : set.delete(pid);
    }

    // ═══════════════════════════════════════════════════════════
    // PRESENCE
    // ═══════════════════════════════════════════════════════════

    setPresence(status, activity = null, metadata = {}) {
        this.myPresence = { status, activity, metadata, lastSeen: Date.now() };
        this._broadcastPresence();
        return this;
    }

    getPresence(pid) { return this.presenceData.get(pid) || null; }

    getAllPresence() {
        return Array.from(this.presenceData.entries()).map(([id, p]) => ({
            id, name: p.name || id.slice(0, 8), ...p
        }));
    }

    _broadcastPresence() {
        const msg = {
            type: '__presence',
            presence: { ...this.myPresence, name: this.pseudoname, id: this.peer.id, lastSeen: Date.now() }
        };
        for (const pid in this.conns) this._send(pid, msg);
    }

    _handlePresence(pid, presence) {
        const existing = this.presenceData.get(pid) || {};
        this.presenceData.set(pid, { ...existing, ...presence, lastSeen: Date.now() });
        this.emit('presence', this.getAllPresence());
    }

    _startPresenceBroadcast() {
        setInterval(() => {
            this._broadcastPresence();
            const now = Date.now();
            let changed = false;
            for (const [pid, p] of this.presenceData.entries()) {
                const age = now - (p.lastSeen || 0);
                if (age > this.STALE_THRESHOLD && p.status !== 'offline') {
                    p.status = 'offline'; changed = true;
                } else if (age > 60000 && p.status === 'online') {
                    p.status = 'away'; changed = true;
                }
            }
            if (changed) this.emit('presence', this.getAllPresence());
        }, this.PRESENCE_INTERVAL);
    }

    // ═══════════════════════════════════════════════════════════
    // RPC
    // ═══════════════════════════════════════════════════════════

    call(pid, fullMethod, params = {}) {
        const callId = crypto.randomUUID();
        const payload = { jsonrpc: '2.0', method: fullMethod, params, id: callId };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRPC.delete(callId);
                const msg = `RPC timeout: ${fullMethod} → ${pid.slice(0, 8)} (${this.RPC_TIMEOUT}ms)`;
                this._emitError('RPC_TIMEOUT', msg, { method: fullMethod, peer: pid, callId });
                reject(new Error(msg));
            }, this.RPC_TIMEOUT);

            this.pendingRPC.set(callId, { resolve, reject, timeout });
            this.sendTo(pid, payload);
        });
    }

    async callAll(fullMethod, params = {}) {
        const peers = Object.keys(this.conns);
        if (!peers.length) return [];
        return Promise.all(peers.map(pid =>
            this.call(pid, fullMethod, params)
                .then(result => ({ peer: pid, result, error: null }))
                .catch(err => ({ peer: pid, result: null, error: err.message }))
        ));
    }

    async _handleRPC(pid, data) {
        if (data.method) {
            const [ns, method] = data.method.split('.');
            const svc = this.services[ns]?.[method];
            if (typeof svc === 'function') {
                try {
                    const result = await svc(data.params, pid);
                    this.reply(pid, data.id, result);
                } catch (e) {
                    this._emitError('RPC_EXEC', `RPC '${data.method}' from ${pid.slice(0, 8)} threw: ${e.message}`, {
                        method: data.method,
                        peer: pid,
                        error: e.message
                    });
                    this.reply(pid, data.id, e.message, true);
                }
            } else {
                this.emit('system', `Unhandled RPC '${data.method}' from ${pid.slice(0, 8)}`);
                if (data.id) this.reply(pid, data.id, `Method not found: ${data.method}`, true);
                this.emit('message', pid, data);
            }
        } else if (data.id) {
            const pending = this.pendingRPC.get(data.id);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRPC.delete(data.id);
                if (data.error) {
                    this._emitError('RPC_REMOTE_ERR', `RPC error response from ${pid.slice(0, 8)}: ${data.error}`, {
                        peer: pid,
                        error: data.error,
                        callId: data.id
                    });
                    pending.reject(data.error);
                } else {
                    pending.resolve(data.result);
                }
            }
        }
    }

    waitForPeer(peerId, timeout) {
        timeout = timeout ?? (this.isSafari ? 40000 : this.isFirefox ? 30000 : 25000);
        return new Promise((resolve, reject) => {
            if (this.conns[peerId]) return resolve();
            const deadline = setTimeout(() => {
                clearInterval(check);
                const msg = `waitForPeer timeout: ${peerId.slice(0, 8)} (${timeout}ms)`;
                this._emitError('WAIT_PEER_TIMEOUT', msg, { peer: peerId, timeout });
                reject(new Error(msg));
            }, timeout);
            const check = setInterval(() => {
                if (this.conns[peerId]) {
                    clearInterval(check);
                    clearTimeout(deadline);
                    resolve();
                }
            }, 100);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // FILE TRANSFER
    // ═══════════════════════════════════════════════════════════

    async sendFile(pid, file, options = {}) {
        if (!this.conns[pid]) {
            const msg = `sendFile: peer ${pid.slice(0, 8)} not connected`;
            this._emitError('FILE_SEND', msg, { peer: pid, file: file.name });
            throw new Error(msg);
        }
        const transferId = crypto.randomUUID();
        const totalChunks = Math.ceil(file.size / this.FILE_CHUNK_SIZE);

        this._send(pid, {
            type: 'file_start',
            transferId,
            metadata: { name: file.name, size: file.size, type: file.type, totalChunks }
        });

        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.FILE_CHUNK_SIZE;
            const chunk = file.slice(start, start + this.FILE_CHUNK_SIZE);
            try {
                const buf = await chunk.arrayBuffer();
                const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                this._send(pid, { type: 'file_chunk', transferId, chunkIndex: i, data: b64 });
            } catch (e) {
                this._emitError('FILE_CHUNK', `File chunk ${i}/${totalChunks} failed for '${file.name}': ${e.message}`, {
                    peer: pid,
                    transferId,
                    chunkIndex: i,
                    error: e.message
                });
                throw e;
            }

            const pct = Math.round(((i + 1) / totalChunks) * 100);
            options.onProgress?.(pct, i + 1, totalChunks);
            this.emit('fileProgress', { transferId, peer: pid, direction: 'send', percent: pct });

            if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
        }

        this._send(pid, { type: 'file_complete', transferId });
    }

    _handleFileStart(pid, data) {
        this.fileTransfers.set(data.transferId, {
            metadata: data.metadata,
            chunks: new Array(data.metadata.totalChunks),
            received: 0,
            from: pid
        });
        this.emit('system', `Receiving: ${data.metadata.name} (${Math.round(data.metadata.size / 1024)} KB)`);
    }

    _handleFileChunk(pid, data) {
        const transfer = this.fileTransfers.get(data.transferId);
        if (!transfer) {
            this._emitError('FILE_CHUNK_ORPHAN', `Received chunk for unknown transfer ${data.transferId?.slice(0, 8)} from ${pid.slice(0, 8)}`, {
                peer: pid,
                transferId: data.transferId,
                chunkIndex: data.chunkIndex
            });
            return;
        }
        try {
            const raw = atob(data.data);
            transfer.chunks[data.chunkIndex] = Uint8Array.from(raw, c => c.charCodeAt(0));
            transfer.received++;
            const pct = Math.round((transfer.received / transfer.metadata.totalChunks) * 100);
            this.emit('fileProgress', { transferId: data.transferId, peer: pid, direction: 'receive', percent: pct });
        } catch (e) {
            this._emitError('FILE_DECODE', `Failed to decode chunk ${data.chunkIndex} of transfer ${data.transferId?.slice(0, 8)}: ${e.message}`, {
                peer: pid,
                transferId: data.transferId,
                chunkIndex: data.chunkIndex,
                error: e.message
            });
        }
    }

    _handleFileComplete(pid, data) {
        const transfer = this.fileTransfers.get(data.transferId);
        if (!transfer) {
            this._emitError('FILE_COMPLETE_ORPHAN', `file_complete for unknown transfer ${data.transferId?.slice(0, 8)} from ${pid.slice(0, 8)}`, {
                peer: pid,
                transferId: data.transferId
            });
            return;
        }
        try {
            const blob = new Blob(transfer.chunks, { type: transfer.metadata.type });
            const file = new File([blob], transfer.metadata.name, { type: transfer.metadata.type });
            this.emit('fileReceived', { file, from: pid, transferId: data.transferId, metadata: transfer.metadata });
        } catch (e) {
            this._emitError('FILE_ASSEMBLE', `Failed to assemble file '${transfer.metadata.name}': ${e.message}`, {
                peer: pid,
                transferId: data.transferId,
                error: e.message
            });
        }
        this.fileTransfers.delete(data.transferId);
    }

    // ═══════════════════════════════════════════════════════════
    // OFFLINE QUEUE
    // ═══════════════════════════════════════════════════════════

    _queueOffline(pid, obj) {
        if (!this.offlineQueue.has(pid)) this.offlineQueue.set(pid, []);
        const q = this.offlineQueue.get(pid);
        if (q.length >= this.OFFLINE_QUEUE_MAX) {
            q.shift();
            this._emitError('QUEUE_FULL', `Offline queue for ${pid.slice(0, 8)} full (${this.OFFLINE_QUEUE_MAX}) — oldest message dropped`, {
                peer: pid,
                queueSize: this.OFFLINE_QUEUE_MAX
            });
        }
        q.push(obj);
    }

    _flushOfflineQueue(pid) {
        const q = this.offlineQueue.get(pid);
        if (!q?.length) return;
        this.offlineQueue.delete(pid);
        let delay = 0;
        for (const msg of q) {
            setTimeout(() => {
                if (this.conns[pid]) {
                    this._send(pid, this._wrap(msg));
                } else {
                    this._emitError('QUEUE_FLUSH_MISS', `Offline queue flush: ${pid.slice(0, 8)} disconnected before message delivered`, {
                        peer: pid
                    });
                }
            }, delay);
            delay += 5;
        }
        this.emit('system', `Flushed ${q.length} queued message(s) to ${pid.slice(0, 8)}`);
    }

    // ═══════════════════════════════════════════════════════════
    // AUTO-RECONNECT
    // ═══════════════════════════════════════════════════════════

    _setupAutoReconnect(pid) {
        if (!this.autoReconnect) return;
        if (this.disconnectedPeers.has(pid)) return; // Don't reconnect to intentionally disconnected peers

        const attempt = this.reconnectAttempts.get(pid) || 0;
        if (attempt >= this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts.delete(pid);
            this._emitError('RECONNECT_FAILED', `Gave up reconnecting to ${pid.slice(0, 8)} after ${attempt} attempts`, {
                peer: pid,
                attempts: attempt
            });
            return;
        }
        const base = this._baseReconnectDelay * Math.pow(1.5, attempt);
        const jitter = base * (0.8 + Math.random() * 0.4);
        const delay = Math.min(jitter, 90000);

        const timer = setTimeout(() => {
            if (!this.conns[pid]) {
                this.reconnectAttempts.set(pid, attempt + 1);
                this.emit('system', `Reconnect attempt ${attempt + 1}/${this.MAX_RECONNECT_ATTEMPTS} to ${pid.slice(0, 8)}`);
                this.connectToPeer(pid);
            }
        }, delay);
        this.reconnectTimers.set(pid, timer);
    }

    _clearReconnectTimer(pid) {
        const t = this.reconnectTimers.get(pid);
        if (t) clearTimeout(t);
        this.reconnectTimers.delete(pid);
        this.reconnectAttempts.delete(pid);
    }

    // ═══════════════════════════════════════════════════════════
    // HEARTBEAT
    // ═══════════════════════════════════════════════════════════

    _startHeartbeat() {
        setInterval(() => {
            const now = Date.now();
            const pids = Object.keys(this.conns);
            pids.forEach((pid, i) => {
                setTimeout(() => {
                    const conn = this.conns[pid];
                    if (!conn || !conn.open) return;

                    if (this.lastSeen[pid] && now - this.lastSeen[pid] > this.STALE_THRESHOLD) {
                        this._emitError('STALE_PEER', `Dropping stale peer ${pid.slice(0, 8)} — no data for ${Math.round((now - this.lastSeen[pid]) / 1000)}s`, {
                            peer: pid,
                            lastSeen: this.lastSeen[pid],
                            staleDuration: now - this.lastSeen[pid]
                        });
                        this._removePeer(pid);
                        return;
                    }

                    conn.send({ type: '__ping' });
                }, i * 150);
            });
        }, this.HEARTBEAT_INTERVAL);
    }

    // ═══════════════════════════════════════════════════════════
    // MESSAGE CACHE PRUNING
    // ═══════════════════════════════════════════════════════════

    _startCachePruning() {
        this._pruneCacheHandle = setInterval(() => {
            const now = Date.now();
            for (const [mid, expiry] of this.msgCache.entries()) {
                if (now > expiry) this.msgCache.delete(mid);
            }
        }, 60000);
    }

    // ═══════════════════════════════════════════════════════════
    // BUILT-IN SERVICES
    // ═══════════════════════════════════════════════════════════

    _registerBuiltInServices() {
        this.registerService('monitor', {
            getStats: () => ({
                name: this.pseudoname,
                id: this.peer?.id || null,
                uptime: Math.floor(performance.now() / 1000) + 's',
                directPeers: Object.keys(this.conns).length,
                knownPeers: this.getAllPeers().length,
                routingTableSize: this.routingTable.size,
                topics: this.topics.size,
                presence: this.presenceData.size,
                msgCacheSize: this.msgCache.size,
                offlineQueued: Array.from(this.offlineQueue.values()).reduce((a, q) => a + q.length, 0)
            }),
            ping: () => ({ pong: true, timestamp: Date.now(), name: this.pseudoname }),
            getRoutingTable: () => {
                const out = {};
                for (const [pid, info] of this.routingTable.entries())
                    out[pid] = { nextHop: info.nextHop, distance: info.distance };
                return out;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════

    async _loadPeerJS() {
        if (window.Peer) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Failed to load PeerJS from CDN'));
            document.head.appendChild(s);
        });
    }

    async _shutdown() {
        if (this._routingUpdateHandle) clearInterval(this._routingUpdateHandle);
        if (this._pruneCacheHandle) clearInterval(this._pruneCacheHandle);
        for (const pid in this.conns) {
            try { this.conns[pid].close(); } catch (e) {
                // Shutdown path — emit but don't rethrow
                this._emitError('SHUTDOWN_CLOSE', `Error closing connection to ${pid.slice(0, 8)} during shutdown: ${e.message}`, {
                    peer: pid, error: e.message
                });
            }
        }
        if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch (e) {
                this._emitError('SHUTDOWN_DESTROY', `Error destroying peer during shutdown: ${e.message}`, { error: e.message });
            }
        }
    }

    reset() {
        window.removeEventListener('beforeunload', this._unloadHandler);
        location.reload();
    }

    disconnect(pid) {
        // Mark as intentionally disconnected and clear any pending timers
        this.disconnectedPeers.add(pid);
        this._clearReconnectTimer(pid);

        // Send a disconnect notice to the peer so well-behaved peers can clean up immediately
        if (this.conns[pid]) {
            try {
                this._send(pid, { type: '__disconnect', peer: this.peer.id });
            } catch (e) {
                this._emitError('DISCONNECT_NOTICE', `Failed to send disconnect notice to ${pid?.slice(0, 8)}: ${e.message}`, { peer: pid, error: e.message });
            }
        }

        // Let the existing cleanup method handle all the routing and state teardown safely
        this._removePeer(pid);
    }

    disconnectAll() {
        for (const pid of Object.keys(this.conns)) {
            this.disconnect(pid);
        }
        
        this.routingTable.clear();      // Clears the map of known peers
        this.presenceData.clear();      // Clears names/statuses of old peers
        this.neighborPeers.clear();     // Clears the set of direct neighbors
        this.msgCache.clear();          // Optional: Resets the duplicate-message filter


        this.lastSeen = {};

        this.emit('system', 'Network history cleared. Ready for clean context switch.');
        this.emit('peerChange', []);
    }
}

// ── Export ────────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Relay;
} else {
    window.Relay = Relay;
}