
class WebSocketHandler {
    constructor(url, options = {}) {
        this.url = url;
        this.options = {
            reconnectInterval: 3000,
            maxReconnectAttempts: 5,
            ...options
        };

        this.ws = null;
        this.callbacks = new Map();
        this.reconnectAttempts = 0;
        this.shouldReconnect = true;
        this.connectionState = 'disconnected';
    }

    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
        return this;
    }

    off(event, callback = null) {
        if (!this.callbacks.has(event)) return this;

        if (callback) {
            const callbacks = this.callbacks.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        } else {
            this.callbacks.delete(event);
        }
        return this;
    }

    emit(event, data = null) {
        if (this.callbacks.has(event)) {
            this.callbacks.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} callback:`, error);
                }
            });
        }
    }

    connect() {
        return new Promise((resolve, reject) => {
            if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
                resolve();
                return;
            }

            this.connectionState = 'connecting';
            this.emit('connecting');

            try {
                this.ws = new WebSocket(this.url);
                this.setupEventHandlers(resolve, reject);
            } catch (error) {
                this.connectionState = 'disconnected';
                this.emit('error', error);
                reject(error);
            }
        });
    }

    setupEventHandlers(resolve = null, reject = null) {
        this.ws.onopen = (event) => {
            this.connectionState = 'connected';
            this.reconnectAttempts = 0;
            this.emit('open', event);
            this.emit('connected');
            if (resolve) resolve();
        };

        this.ws.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (error) {
                data = event.data;
            }

            this.emit('message', data);

            // Handle Pusher-specific events
            if (data && typeof data === 'object') {
                if (data.event) {
                    this.emit(data.event, data);
                }
                if (data.type) {
                    this.emit(data.type, data);
                }
            }
        };

        this.ws.onclose = (event) => {
            this.connectionState = 'disconnected';
            this.emit('close', event);
            this.emit('disconnected', event);

            if (this.shouldReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
                this.attemptReconnect();
            }
        };

        this.ws.onerror = (error) => {
            this.emit('error', error);
            if (reject) reject(error);
        };
    }

    send(data) {
        if (this.connectionState !== 'connected') {
            console.warn('WebSocket is not connected. Message not sent:', data);
            return false;
        }

        try {
            const message = typeof data === 'object' ? JSON.stringify(data) : data;
            this.ws.send(message);
            this.emit('sent', data);
            return true;
        } catch (error) {
            this.emit('error', error);
            return false;
        }
    }

    attemptReconnect() {
        if (!this.shouldReconnect) return;

        this.reconnectAttempts++;
        this.emit('reconnecting', this.reconnectAttempts);

        setTimeout(() => {
            if (this.shouldReconnect && this.connectionState === 'disconnected') {
                this.connect();
            }
        }, this.options.reconnectInterval);
    }

    disconnect() {
        this.shouldReconnect = false;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        this.connectionState = 'disconnected';
    }

    getState() {
        return this.connectionState;
    }

    isConnected() {
        return this.connectionState === 'connected';
    }
}

class KickClient extends WebSocketHandler {
    constructor(username, options = {}) {
        const url = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false";
        super(url, options);
        this.username = username;
        this.chatroomId = null;
        this.isSubscribed = false;

        // Set up event handlers for Pusher protocol
        this.setupPusherHandlers();
    }

    async initialize() {
        try {
            this.chatroomId = await this.GetKickChatroomId(this.username);
            return this.chatroomId;
        } catch (error) {
            console.error("Failed to get chatroom ID:", error);
            throw error;
        }
    }

    async GetKickChatroomId(username) {
        try {
            const response = await fetch(`https://kick.com/api/v2/channels/${username}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.chatroom.id;
        } catch (error) {
            console.error("Error fetching chatroom ID:", error);
            throw error;
        }
    }

    setupPusherHandlers() {
        // Handle Pusher connection established
        this.on('pusher:connection_established', (data) => {
            this.subscribeToChannels();
        });

        // Handle subscription success
        this.on('pusher_internal:subscription_succeeded', (data) => {
            this.isSubscribed = true;
        });

        // Handle subscription errors
        this.on('pusher:subscription_error', (data) => {
            console.error('Subscription error:', data);
        });

        // Handle chat messages
        this.on('App\\Events\\ChatMessageEvent', (data) => {
            data.data = JSON.parse(data.data);
            let message = {
                user: data.data.sender.username,
                message: data.data.content,
                messageId: data.data.id|| null,
                role: "user"
            };

            if (Array.isArray(data.data.sender.identity.badges)) {
                let badges = data.data.sender.identity.badges;
                for (let i = 0; i < badges.length; i++) {
                    if (badges[i].type === "broadcaster") {
                        message.role = "broadcaster";
                        break;
                    }
                    if (badges[i].type === "moderator") {
                        message.role = "moderator";
                        break;
                    }
                    if (badges[i].type === "vip") {
                        message.role = "vip";
                        break;
                    }
                    if (badges[i].type === "subscriber") {
                        message.role = "subscriber";
                        break;
                    }
                }
            }
            
            this.emit('chatMessage', message);
            this.emit('chatMessageRaw', data.data);
        });

        // Handle other Kick-specific events
        this.on('App\\Events\\UserBannedEvent', (data) => {
            this.emit('userBanned', data.data);
        });

        this.on('App\\Events\\UserUnbannedEvent', (data) => {
            this.emit('userUnbanned', data.data);
        });

        this.on('App\\Events\\UserTimeoutEvent', (data) => {
            this.emit('userTimeout', data.data);
        });
        this.on('App\\Events\\UserUntimeoutEvent', (data) => {
            this.emit('userUntimeout', data.data);
        });
        this.on("App\\Events\\MessageDeletedEvent", (data) => {
            this.emit("messageDeleted", JSON.parse(data.data));
        });
        this.on("App\\Events\\LivestreamUpdated", (data) => {
            this.emit("livestreamUpdated", JSON.parse(data.data));
        });
        this.on("App\\Events\\PinnedMessageDeletedEvent", (data) => {
            this.emit("pinnedMessageDeleted", JSON.parse(data.data));
        });
        this.on("App\\Events\\PinnedMessageCreatedEvent", (data) => {
            this.emit("pinnedMessageCreated", JSON.parse(data.data));
        });
        this.on("App\\Events\\SubscriptionEvent", (data) => {
            this.emit("subscription", JSON.parse(data.data));
        });
        this.on("App\\Events\\PollUpdateEvent", (data) => {
            this.emit("pollUpdate", JSON.parse(data.data));
        });
        this.on("App\\Events\\PollDeleteEvent", (data) => {
            this.emit("pollDelete", JSON.parse(data.data));
        });
        this.on("App\\Events\\ChatroomClearEvent", (data) => {
            this.emit("chatroomClear", JSON.parse(data.data));
        });
        this.on("App\\Events\\StreamHostedEvent", (data) => {
            this.emit("streamHosted", JSON.parse(data.data));
        });
        this.on("App\\Events\\StreamerIsLive", (data) => {
            this.emit("streamerIsLive", JSON.parse(data.data));
        });
        this.on("App\\Events\\StopStreamBroadcast", (data) => {
            this.emit("stopStreamBroadcast", JSON.parse(data.data));
        });
        this.on("App\\Events\\GiftSubscriptionEvent", (data) => {
            this.emit("giftSubscription", JSON.parse(data.data));
        });
        this.on("App\\Events\\ChatroomUpdatedEvent", (data) => {
            this.emit("chatroomUpdated", JSON.parse(data.data));
        });

        // Handle generic Kick events
        this.on('message', (data) => {
            if (data && data.event && data.event.startsWith('App\\Events\\')) {
                this.emit('kickEvent', data);
            }
        });
    }

    async connect() {
        if (!this.chatroomId) {
            await this.initialize();
        }

        return super.connect();
    }

    subscribeToChannels() {
        if (!this.chatroomId) {
            console.error('Cannot subscribe: chatroom ID not available');
            return;
        }


        // Subscribe to main chat channel
        this.send({
            event: 'pusher:subscribe',
            data: {
                channel: `chatrooms.${this.chatroomId}.v2`
            }
        });

        // Subscribe to additional channels
        this.send({
            event: 'pusher:subscribe',
            data: {
                channel: `chatroom.${this.chatroomId}`
            }
        });
    }

    // Send a chat message (if the API supports it)
    sendMessage(message) {
        if (!this.isConnected() || !this.isSubscribed) {
            console.warn('Cannot send message: not connected or not subscribed');
            return false;
        }

        return this.send({
            event: 'client-message',
            data: {
                message: message,
                chatroom_id: this.chatroomId
            }
        });
    }

    // Utility method to get channel subscription status
    getSubscriptionStatus() {
        return {
            connected: this.isConnected(),
            subscribed: this.isSubscribed,
            chatroomId: this.chatroomId
        };
    }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = KickClient;
}
if (typeof window !== 'undefined') {
    window.KickClient = KickClient;
}