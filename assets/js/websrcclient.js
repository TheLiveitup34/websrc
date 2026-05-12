class WebsrcClient {
    constructor(options = {}) {
        this.host = options.host || 'localhost';
        this.port = options.port || 3080;
        this.secure = options.secure || false;
        this.autoConnect = options.autoConnect !== undefined ? options.autoConnect : true;
        this.autoReconnect = options.autoReconnect !== undefined ? options.autoReconnect : true;
        this.reconnectInterval = options.reconnectInterval || 3000;
        this.maxReconnectAttempts = options.maxReconnectAttempts || Infinity;
        this.pingInterval = options.pingInterval || 30000;
        this.pongTimeout = options.pongTimeout || 5000;
        this.serverVersion = 'unknown'; // 'old' or 'new'
        this.serverDetected = false;

        this.ws = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.pongTimer = null;
        this.handlers = new Map(); // RPC handlers
        this.pendingCalls = new Map();
        this.eventListeners = new Map(); // Event listeners
        this.messageId = 0;
        this.isConnected = false;
        this.isReconnecting = false;
        this.isReady = false;

        // Stats tracking
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            reconnectCount: 0,
            lastConnected: null,
            lastDisconnected: null
        };

        // Reserved event names (these are NOT RPC handlers)
        this.reservedEvents = new Set([
            'ready', 'connect', 'disconnect', 'connecting', 'reconnecting',
            'reconnectAttempt', 'reconnectFailed', 'error', 'message', 'rawMessage',
            'send', 'call', 'callSuccess', 'callError', 'callTimeout',
            'remoteCall', 'remoteCallSuccess', 'remoteCallError',
            'ping', 'pong', 'pongTimeout', 'handlerRegistered', 'handlerUnregistered',
            'manualDisconnect', 'connectionUpdated', 'statsCleared'
        ]);

        if (this.autoConnect) {
            this.connect();
        }
    }

    /**
 * Detect if server is old or new version
 * @returns {Promise<'old'|'new'>}
 */
    async detectServerVersion(timeout = 5000) {
        if (this.serverDetected) {
            return this.serverVersion;
        }

        return new Promise((resolve) => {
            const startTime = Date.now();

            // Method 1: Try ping/pong
            const pingTest = () => {
                this.send({ type: 'ping', timestamp: Date.now() });

                const pongHandler = () => {
                    this.serverVersion = 'new';
                    this.serverDetected = true;
                    this.off('pong', pongHandler);
                    clearTimeout(timeoutTimer);
                    resolve('new');
                };

                this.once('pong', pongHandler);
            };

            // Method 2: Try RPC call
            const rpcTest = async () => {
                try {
                    // Try to get clients list (only new server has this)
                    const result = await this.call('relay.getClients', {}, 2000);
                    this.serverVersion = 'new';
                    this.serverDetected = true;
                    clearTimeout(timeoutTimer);
                    resolve('new');
                } catch (error) {
                    // RPC failed, might be old server
                }
            };

            // Timeout fallback
            const timeoutTimer = setTimeout(() => {
                if (!this.serverDetected) {
                    this.serverVersion = 'old';
                    this.serverDetected = true;
                    console.warn('⚠️ Detected older version of Websrc Server. Some features may be unavailable. Please consider upgrading your server for the best experience.');
                    resolve('old');
                }
            }, timeout);

            // Run tests
            if (this.isConnected) {
                pingTest();
                setTimeout(rpcTest, 100); // Try RPC after ping
            } else {
                this.once('connect', () => {
                    setTimeout(pingTest, 100);
                    setTimeout(rpcTest, 200);
                });
            }
        });
    }

    /**
     * Get server capabilities based on version
     */
    getServerCapabilities() {
        if (this.serverVersion === 'old') {
            return {
                version: 'old',
                features: {
                    basicMessaging: true,
                    eventEmitter: true,
                    broadcast: true,
                    rpc: false,
                    relay: false,
                    pingPong: false,
                    clientTracking: false
                },
                compatibilityMode: true
            };
        } else if (this.serverVersion === 'new') {
            return {
                version: 'new',
                features: {
                    basicMessaging: true,
                    eventEmitter: true,
                    broadcast: true,
                    rpc: true,
                    relay: true,
                    pingPong: true,
                    clientTracking: true
                },
                compatibilityMode: false
            };
        } else {
            return {
                version: 'unknown',
                features: {},
                compatibilityMode: true
            };
        }
    }


    // ========================================
    // MERGED EVENT/RPC REGISTRATION
    // ========================================

    /**
     * Register event listener OR RPC handler
     * @param {string} event - Event name or RPC route (e.g., "ready" or "client.getInfo")
     * @param {Function} callback - Handler function
     * 
     * @example
     * // Event listener (reserved events)
     * client.on('ready', () => console.log('Ready!'));
     * client.on('connect', () => console.log('Connected!'));
     * 
     * @example
     * // RPC handler (dot notation = server can call this)
     * client.on('client.getInfo', async (payload) => {
     *   return { userAgent: navigator.userAgent };
     * });
     * 
     * @example
     * // RPC handler (namespace.method)
     * client.on('ui.showNotification', async (payload) => {
     *   alert(payload.message);
     *   return { displayed: true };
     * });
     */
    on(event, callback) {
        // Check if this is a reserved event name (event listener)
        if (this.reservedEvents.has(event)) {
            // Register as event listener
            if (!this.eventListeners.has(event)) {
                this.eventListeners.set(event, []);
            }
            this.eventListeners.get(event).push(callback);
        } else if (event.includes('.')) {
            // Has a dot = RPC handler (e.g., "client.getInfo")
            this.handlers.set(event, callback);
            this.emit('handlerRegistered', { route: event });
        } else {
            // No dot and not reserved = probably meant to be an RPC handler
            console.warn(`Event "${event}" is not a reserved event. Did you mean to use dot notation for an RPC handler? (e.g., "namespace.${event}")`);
            // Register as event listener anyway
            if (!this.eventListeners.has(event)) {
                this.eventListeners.set(event, []);
            }
            this.eventListeners.get(event).push(callback);
        }

        return this; // Allow chaining
    }

    /**
     * Register a one-time event listener or RPC handler
     */
    once(event, callback) {
        const wrappedCallback = (...args) => {
            callback(...args);
            this.off(event, wrappedCallback);
        };
        return this.on(event, wrappedCallback);
    }

    /**
     * Remove event listener or RPC handler
     */
    off(event, callback) {
        // Check if it's a reserved event (event listener)
        if (this.reservedEvents.has(event)) {
            if (!this.eventListeners.has(event)) return this;

            if (!callback) {
                this.eventListeners.delete(event);
            } else {
                const listeners = this.eventListeners.get(event);
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
                if (listeners.length === 0) {
                    this.eventListeners.delete(event);
                }
            }
        } else if (event.includes('.')) {
            // RPC handler
            if (callback) {
                // Only remove if the callback matches
                if (this.handlers.get(event) === callback) {
                    this.handlers.delete(event);
                    this.emit('handlerUnregistered', { route: event });
                }
            } else {
                // Remove regardless of callback
                this.handlers.delete(event);
                this.emit('handlerUnregistered', { route: event });
            }
        } else {
            // Try to remove from event listeners
            if (!this.eventListeners.has(event)) return this;

            if (!callback) {
                this.eventListeners.delete(event);
            } else {
                const listeners = this.eventListeners.get(event);
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        }

        return this;
    }

    /**
     * Emit an event (internal use)
     */
    emit(event, ...args) {
        if (!this.eventListeners.has(event)) return;

        const listeners = this.eventListeners.get(event).slice();
        listeners.forEach(callback => {
            try {
                callback(...args);
            } catch (error) {
                console.error(`Error in event listener for '${event}':`, error);
            }
        });
    }

    /**
     * Legacy register method (still works for backwards compatibility)
     * @deprecated Use .on() instead
     */
    register(routeOrNamespace, methodOrHandler, handler) {
        console.warn('register() is deprecated. Use .on() instead.');

        let handlerKey;
        let handlerFunc;

        if (typeof methodOrHandler === 'function') {
            handlerKey = routeOrNamespace;
            handlerFunc = methodOrHandler;

            if (!handlerKey.includes('.')) {
                throw new Error(
                    `Invalid route format: "${handlerKey}". Expected "namespace.method" (e.g., "client.getInfo")`
                );
            }
        } else {
            if (!handler) {
                throw new Error("Handler function is required");
            }
            handlerKey = `${routeOrNamespace}.${methodOrHandler}`;
            handlerFunc = handler;
        }

        this.handlers.set(handlerKey, handlerFunc);
        this.emit('handlerRegistered', { route: handlerKey });
        return this;
    }

    /**
     * Legacy unregister method
     * @deprecated Use .off() instead
     */
    unregister(routeOrNamespace, method) {
        console.warn('unregister() is deprecated. Use .off() instead.');
        const handlerKey = method ? `${routeOrNamespace}.${method}` : routeOrNamespace;
        this.handlers.delete(handlerKey);
        this.emit('handlerUnregistered', { route: handlerKey });
        return this;
    }

    // ========================================
    // CONNECTION METHODS (unchanged)
    // ========================================

    getUrl() {
        const protocol = this.secure ? 'wss' : 'ws';
        return `${protocol}://${this.host}:${this.port}`;
    }

    connect() {
        try {
            this.emit('connecting', { url: this.getUrl(), attempt: this.reconnectAttempts });

            this.ws = new WebSocket(this.getUrl());

            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onclose = this.handleClose.bind(this);
            this.ws.onerror = this.handleError.bind(this);
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.emit('error', { type: 'connection', error });
            this.scheduleReconnect();
        }
    }

    handleOpen() {
        console.log('WebSocket connected to', this.getUrl());
        this.isConnected = true;
        this.isReconnecting = false;
        this.stats.reconnectCount = this.reconnectAttempts;
        this.reconnectAttempts = 0;
        this.stats.lastConnected = new Date();

        this.emit('connect', { url: this.getUrl(), timestamp: this.stats.lastConnected });

        this.startHeartbeat();

        setTimeout(() => {
            this.isReady = true;
            this.emit('ready', { timestamp: new Date() });
        }, 100);
    }

    handleMessage(event) {
        this.stats.messagesReceived++;
        this.emit('rawMessage', { data: event.data, timestamp: new Date() });

        try {
            const message = JSON.parse(event.data);

            if (message.type === 'pong') {
                this.handlePong();
                return;
            }

            if (message.type === 'ping') {
                this.send({ type: 'pong', timestamp: Date.now() });
                return;
            }

            if (message.type === 'rpc_response' && message.id !== undefined) {
                const pending = this.pendingCalls.get(message.id);
                if (pending) {
                    clearTimeout(pending.timeoutId);
                    this.pendingCalls.delete(message.id);
                    if (message.success) {
                        pending.resolve(message.result);
                        this.emit('callSuccess', { id: message.id, result: message.result });
                    } else {
                        const error = new Error(message.error || 'Unknown error');
                        pending.reject(error);
                        this.emit('callError', { id: message.id, error: message.error });
                    }
                }
                return;
            }

            if (message.type === 'rpc' && message.namespace && message.method) {
                if (message.direction === 'client' || !message.direction) {
                    this.handleRemoteCall(message);
                    return;
                }
            }

            this.emit('message', message);

            if (message.type) {
                this.emit(message.type, message.payload || message);
            }

        } catch (error) {
            console.error('Error handling message:', error);
            this.emit('error', { type: 'message', error, data: event.data });
        }
    }

    async handleRemoteCall(message) {
        const key = `${message.namespace}.${message.method}`;
        const handler = this.handlers.get(key);

        this.emit('remoteCall', {
            namespace: message.namespace,
            method: message.method,
            payload: message.payload,
            id: message.id
        });

        const response = {
            type: 'rpc_response',
            id: message.id,
            success: false,
            result: undefined,
            error: undefined
        };

        if (handler) {
            try {
                const result = await handler(message.payload || {});
                response.success = true;
                response.result = result;

                this.emit('remoteCallSuccess', {
                    namespace: message.namespace,
                    method: message.method,
                    result
                });
            } catch (error) {
                response.success = false;
                response.error = error.message;

                this.emit('remoteCallError', {
                    namespace: message.namespace,
                    method: message.method,
                    error: error.message
                });
            }
        } else {
            response.success = false;
            response.error = `Method ${key} not found`;

            this.emit('remoteCallError', {
                namespace: message.namespace,
                method: message.method,
                error: 'Method not found'
            });
        }

        this.send(response);
    }

    handleClose(event) {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isConnected = false;
        this.isReady = false;
        this.stats.lastDisconnected = new Date();

        this.stopHeartbeat();

        this.pendingCalls.forEach((pending, id) => {
            clearTimeout(pending.timeoutId);
            pending.reject(new Error('Connection closed'));
        });
        this.pendingCalls.clear();

        this.emit('disconnect', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            timestamp: this.stats.lastDisconnected
        });

        if (this.autoReconnect && !this.isReconnecting) {
            this.scheduleReconnect();
        }
    }

    handleError(error) {
        console.error('WebSocket error:', error);
        this.emit('error', { type: 'websocket', error });
    }

    scheduleReconnect() {
        if (!this.autoReconnect) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            this.emit('reconnectFailed', { attempts: this.reconnectAttempts });
            return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;

        console.log(`Reconnecting in ${this.reconnectInterval}ms (attempt ${this.reconnectAttempts})`);

        this.emit('reconnecting', {
            attempt: this.reconnectAttempts,
            delay: this.reconnectInterval
        });

        this.reconnectTimer = setTimeout(() => {
            console.log('Attempting to reconnect...');
            this.emit('reconnectAttempt', { attempt: this.reconnectAttempts });
            this.connect();
        }, this.reconnectInterval);
    }

    // ========================================
    // HEARTBEAT METHODS (unchanged)
    // ========================================

    startHeartbeat() {
        if (!this.pingInterval) return;

        this.pingTimer = setInterval(() => {
            if (this.isConnected) {
                this.sendPing();
            }
        }, this.pingInterval);
    }

    stopHeartbeat() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
        if (this.pongTimer) {
            clearTimeout(this.pongTimer);
            this.pongTimer = null;
        }
    }

    sendPing() {
        this.send({ type: 'ping', timestamp: Date.now() });
        this.emit('ping');

        this.pongTimer = setTimeout(() => {
            console.warn('Pong timeout - connection may be dead');
            this.emit('pongTimeout');

            if (this.ws) {
                this.ws.close();
            }
        }, this.pongTimeout);
    }

    handlePong() {
        if (this.pongTimer) {
            clearTimeout(this.pongTimer);
            this.pongTimer = null;
        }
        this.emit('pong');
    }

    // ========================================
    // RPC METHODS (unchanged)
    // ========================================

    /**
    * Override call method to handle old server
    */
    async call(route, methodOrPayload, payloadOrTimeout, timeout) {
        // Check server version first
        if (!this.serverDetected) {
            await this.detectServerVersion();
        }

        if (this.serverVersion === 'old') {
            throw new Error('RPC calls not supported on old server version. Please upgrade server.');
        }

        // Continue with normal call for new server
        let namespace, method, payload, actualTimeout;

        if (route.includes('.')) {
            [namespace, method] = route.split('.');
            payload = typeof methodOrPayload === 'object' ? methodOrPayload : {};
            actualTimeout = typeof payloadOrTimeout === 'number' ? payloadOrTimeout : 30000;
        } else {
            namespace = route;
            method = methodOrPayload;
            payload = typeof payloadOrTimeout === 'object' ? payloadOrTimeout : {};
            actualTimeout = typeof timeout === 'number' ? timeout : 30000;
        }

        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('WebSocket is not connected'));
                return;
            }

            const id = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;

            const message = {
                type: 'rpc',
                id: id,
                namespace: namespace,
                method: method,
                payload: payload,
                direction: 'server'
            };

            const timeoutId = setTimeout(() => {
                if (this.pendingCalls.has(id)) {
                    this.pendingCalls.delete(id);
                    const error = new Error(`Call timeout: ${namespace}.${method}`);
                    reject(error);
                    this.emit('callTimeout', { id, namespace, method });
                }
            }, actualTimeout);

            this.pendingCalls.set(id, { resolve, reject, timeoutId });
            this.send(message);

            this.emit('call', { id, namespace, method, payload });
        });
    }
    /**
     * Safe call - automatically falls back for old server
     */
    async safeCall(route, payload = {}) {
        if (!this.serverDetected) {
            await this.detectServerVersion();
        }

        if (this.serverVersion === 'old') {
            console.warn(`RPC call "${route}" not available on old server. Falling back to basic messaging.`);

            // Send as basic message instead
            const [namespace, method] = route.includes('.') ? route.split('.') : [route, ''];
            this.send({
                type: namespace,
                payload: { method, ...payload }
            });

            return { fallback: true, sent: true };
        }

        return this.call(route, payload);
    }

    /**
     * Override relay to handle old server
     */
    async relay(route, payloadOrIncludeOrigin, includeOrigin, timeout) {
        if (!this.serverDetected) {
            await this.detectServerVersion();
        }

        if (this.serverVersion === 'old') {
            throw new Error('Relay not supported on old server version. Please upgrade server.');
        }

        // Continue with normal relay for new server
        let namespace, method, payload, actualIncludeOrigin, actualTimeout;

        if (route.includes('.')) {
            [namespace, method] = route.split('.');
            payload = typeof payloadOrIncludeOrigin === 'object' ? payloadOrIncludeOrigin : {};
            actualIncludeOrigin = typeof includeOrigin === 'boolean' ? includeOrigin : false;
            actualTimeout = typeof timeout === 'number' ? timeout : 30000;
        } else {
            namespace = route;
            method = payloadOrIncludeOrigin;
            payload = typeof includeOrigin === 'object' ? includeOrigin : {};
            actualIncludeOrigin = typeof timeout === 'boolean' ? timeout : false;
            actualTimeout = 30000;
        }

        return this.call("relay.call", {
            namespace,
            method,
            data: payload,
            includeOrigin: actualIncludeOrigin
        }, actualTimeout);
    }

    async broadcast(route, payloadOrIncludeOrigin, includeOrigin) {
        let namespace, method, payload, actualIncludeOrigin;

        if (route.includes('.')) {
            [namespace, method] = route.split('.');
            payload = typeof payloadOrIncludeOrigin === 'object' ? payloadOrIncludeOrigin : {};
            actualIncludeOrigin = typeof includeOrigin === 'boolean' ? includeOrigin : false;
        } else {
            namespace = route;
            method = payloadOrIncludeOrigin;
            payload = typeof includeOrigin === 'object' ? includeOrigin : {};
            actualIncludeOrigin = false;
        }

        return this.call("relay.broadcast", {
            namespace,
            method,
            data: payload,
            includeOrigin: actualIncludeOrigin
        });
    }

    async getClients() {
        return this.call("relay.getClients");
    }

    async relayToClients(targetIds, route, payload) {
        let namespace, method;

        if (route.includes('.')) {
            [namespace, method] = route.split('.');
        } else {
            throw new Error('relayToClients requires dot notation route');
        }

        return this.call("relay.targeted", {
            namespace,
            method,
            data: payload,
            targetIds
        });
    }

    // ========================================
    // UTILITY METHODS (unchanged)
    // ========================================

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            this.stats.messagesSent++;
            this.emit('send', { message });
        } else {
            console.error('Cannot send message: WebSocket is not open');
            this.emit('error', { type: 'send', error: 'WebSocket not open', message });
        }
    }

    sendRaw(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
            this.stats.messagesSent++;
            this.emit('send', { message: data });
        } else {
            console.error('Cannot send message: WebSocket is not open');
            this.emit('error', { type: 'send', error: 'WebSocket not open' });
        }
    }

    disconnect() {
        this.autoReconnect = false;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.stopHeartbeat();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.isReconnecting = false;
        this.isReady = false;

        this.emit('manualDisconnect');
    }

    updateConnection(host, port, secure) {
        this.host = host;
        this.port = port;
        if (secure !== undefined) {
            this.secure = secure;
        }

        this.emit('connectionUpdated', { host, port, secure: this.secure });

        if (this.isConnected) {
            this.disconnect();
            this.autoReconnect = true;
            this.reconnectAttempts = 0;
            this.connect();
        }
    }

    getState() {
        return {
            isConnected: this.isConnected,
            isReconnecting: this.isReconnecting,
            isReady: this.isReady,
            reconnectAttempts: this.reconnectAttempts,
            pendingCalls: this.pendingCalls.size,
            registeredHandlers: this.handlers.size,
            url: this.getUrl(),
            stats: { ...this.stats }
        };
    }

    getStats() {
        return { ...this.stats };
    }

    clearStats() {
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            reconnectCount: 0,
            lastConnected: this.stats.lastConnected,
            lastDisconnected: this.stats.lastDisconnected
        };
        this.emit('statsCleared');
    }

    whenReady(timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (this.isReady) {
                resolve();
                return;
            }

            const timeoutId = setTimeout(() => {
                this.off('ready', readyHandler);
                reject(new Error('Ready timeout'));
            }, timeout);

            const readyHandler = () => {
                clearTimeout(timeoutId);
                resolve();
            };

            this.once('ready', readyHandler);
        });
    }

    getRegisteredHandlers() {
        return Array.from(this.handlers.keys());
    }

    hasHandler(routeOrNamespace, method) {
        const handlerKey = method ? `${routeOrNamespace}.${method}` : routeOrNamespace;
        return this.handlers.has(handlerKey);
    }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = WebsrcClient;
} else {
    window.WebsrcClient = WebsrcClient;
}