class IRCClient {
    constructor(options = {}) {
        this.server = options.server || 'wss://irc-ws.chat.twitch.tv';
        this.nick = options.nick || 'justinfan' + Math.floor(Math.random() * 100000);
        this.channels = [];
        this.ws = null;
        this.connected = false;
        this.listeners = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 3000;
        this.autoReconnect = options.autoReconnect !== false;
    }

    // Event listener management
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        const index = this.listeners[event].indexOf(callback);
        if (index > -1) {
            this.listeners[event].splice(index, 1);
        }
    }

    emit(event, ...args) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(...args));
        }
    }

    // Connection methods
    connect() {
        return new Promise((resolve, reject) => {
            if (this.connected) {
                resolve();
                return;
            }

            try {
                this.ws = new WebSocket(this.server);

                this.ws.onopen = () => {
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.emit('connected');

                    // Don't send NICK/USER here for base class - let subclasses handle it
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onclose = (event) => {
                    this.connected = false;
                    this.emit('disconnected', event);

                    if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        setTimeout(() => {
                            this.reconnectAttempts++;
                            this.emit('reconnecting', this.reconnectAttempts);
                            this.connect();
                        }, this.reconnectDelay);
                    }
                };

                this.ws.onerror = (error) => {
                    this.emit('error', error);
                    reject(error);
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    disconnect() {
        this.autoReconnect = false;
        if (this.ws && this.connected) {
            this.ws.close();
        }
    }

    // Channel management
    join(channel) {
        const channelName = channel.startsWith('#') ? channel : `#${channel}`;
        this.sendRaw(`JOIN ${channelName}`);
        if (!this.channels.includes(channelName)) {
            this.channels.push(channelName);
        }
    }

    part(channel) {
        const channelName = channel.startsWith('#') ? channel : `#${channel}`;
        this.sendRaw(`PART ${channelName}`);
        const index = this.channels.indexOf(channelName);
        if (index > -1) {
            this.channels.splice(index, 1);
        }
    }

    // Send raw IRC command
    sendRaw(message) {
        if (this.connected && this.ws) {
            this.ws.send(message);
            this.emit('raw_sent', message);
        }
    }

    // Message handling
    handleMessage(rawMessage) {
        const messages = rawMessage.trim().split(/\r?\n/);

        messages.forEach(message => {
            if (!message) return;

            this.emit('raw_message', message);

            // Handle PING
            if (message.startsWith('PING')) {
                this.sendRaw(message.replace('PING', 'PONG'));
                return;
            }

            const parsed = this.parseIRCMessage(message);
            if (parsed) {
                this.emit('parsed_message', parsed);
                this.handleParsedMessage(parsed);
            }
        });
    }

    parseIRCMessage(message) {
        // Handle Twitch tags first if present
        let cleanMessage = message;
        let tags = null;

        if (message.startsWith('@')) {
            const tagEnd = message.indexOf(' :');
            if (tagEnd === -1) {
                // No prefix, tags end at first space
                const spaceIndex = message.indexOf(' ');
                const tagString = message.substring(1, spaceIndex);
                cleanMessage = message.substring(spaceIndex + 1);

                tags = {};
                tagString.split(';').forEach(tag => {
                    const [key, value] = tag.split('=');
                    const cleanValue = value ? value.replace(/\\s/g, ' ') : null;
                    // check if the value is numeric and parse it
                    if (cleanValue && /^\d+$/.test(cleanValue)) {
                        tags[key] = Number(cleanValue);
                    } else {
                        tags[key] = cleanValue;
                    }
                });
            } else {
                // Has prefix, extract tags before the ':'
                const tagString = message.substring(1, tagEnd);
                cleanMessage = message.substring(tagEnd + 1);

                tags = {};
                tagString.split(';').forEach(tag => {
                    const [key, value] = tag.split('=');
                    const cleanValue = value ? value.replace(/\\s/g, ' ') : null;
                    // check if the value is numeric and parse it
                    if (cleanValue && /^\d+$/.test(cleanValue)) {
                        tags[key] = Number(cleanValue);
                    } else {
                        tags[key] = cleanValue;
                    }
                });
            }
        }

        // Parse the IRC message: [prefix] command [params] [:trailing]
        const match = cleanMessage.match(/^(?::([^\s]+)\s)?([^\s]+)(?:\s+([^:]+?))?(?:\s+:(.+))?$/);
        if (!match) {
            return null;
        }

        const [, prefix, command, params, trailing] = match;

        let nick = null;
        let user = null;
        let host = null;

        if (prefix) {
            const prefixMatch = prefix.match(/^([^!]+)(?:!([^@]+))?(?:@(.+))?$/);
            if (prefixMatch) {
                [, nick, user, host] = prefixMatch;
            }
        }

        const parsed = {
            raw: message,
            prefix,
            nick,
            user,
            host,
            command,
            params: params ? params.trim().split(/\s+/) : [],
            trailing,
            timestamp: Date.now()
        };

        if (tags) {
            parsed.tags = tags;
        }

        return parsed;
    }

    handleParsedMessage(parsed) {
        const { command, nick, params, trailing } = parsed;
        switch (command) {
            case 'PRIVMSG':
            
                let temp = parsed.raw.split(' :')[0].replace("@", "").split(";");
                // loop through all the items and turn it into key value pairs and if the value has a , or / turn the key into a object with the values being key value pairs
                let tags = {};
                temp.forEach(tag => {
                    const [key, value] = tag.split('=');
                    if (value && (value.includes(','))) {
                        tags[key] = value.split(',').reduce((acc, curr) => {
                            const [k, v] = curr.split('/');
                            const cleanValue = v ? v.replace(/\\s/g, ' ') : null;
                            // check if the value of acc[k] is numeric and parse int
                            if (cleanValue && /^\d+$/.test(cleanValue)) {
                                acc[k] = Number(cleanValue);
                            } else {
                                acc[k] = cleanValue;
                            }
                            return acc;
                        }, {});
                    } else {
                        const cleanValue = value ? value.replace(/\\s/g, ' ') : null;
                        // check if the value is numeric and parse it
                        if (cleanValue && /^\d+$/.test(cleanValue)) {
                            tags[key] = Number(cleanValue);
                        } else {
                            tags[key] = cleanValue;
                        }
                    }
                    // check if the tags[key] is not a object and contains a / and split it based on the / to a keyvalue pair
                    if (typeof tags[key] === "string" && value.includes('/')) {
                        const [k, v] = tags[key].split('/');
                        const cleanValue = v ? v.replace(/\\s/g, ' ') : null;
                        tags[key] = {
                            [k]: cleanValue
                        };
                        // check if the value of tags[key][k] is numeric and parse int
                        if (tags[key][k] && /^\d+$/.test(tags[key][k])) {
                            tags[key][k] = Number(tags[key][k]);
                        }
                    }
                });
                this.emit('message', {
                    userData: tags,
                    channel: params[0],
                    nick,
                    displayname: tags['display-name'] || nick,
                    message: trailing,
                    timestamp: parsed.timestamp
                });
                break;

            case 'JOIN':
                this.emit('join', {
                    channel: trailing || params[0],
                    nick,
                    timestamp: parsed.timestamp
                });
                break;

            case 'PART':
                this.emit('part', {
                    channel: params[0],
                    nick,
                    reason: trailing,
                    timestamp: parsed.timestamp
                });
                break;

            case 'QUIT':
                this.emit('quit', {
                    nick,
                    reason: trailing,
                    timestamp: parsed.timestamp
                });
                break;

            case 'NICK':
                this.emit('nick_change', {
                    oldNick: nick,
                    newNick: trailing,
                    timestamp: parsed.timestamp
                });
                break;

            case '001': // Welcome message
                this.emit('welcome', trailing);
                break;

            case '353': // Names list
                this.emit('names', {
                    channel: params[2],
                    names: trailing.split(' ')
                });
                break;

            case '366': // End of names list
                this.emit('names_end', {
                    channel: params[1]
                });
                break;
            case '376':
                this.emit('ready');
                break;

            case 'NOTICE':
                this.emit('notice', {
                    from: nick,
                    target: params[0],
                    message: trailing,
                    timestamp: parsed.timestamp
                });
                break;
            case 'CLEARCHAT':
                this.emit('clearchat', {
                    channel: params[0],
                    user: trailing,
                    timestamp: parsed.timestamp
                });
                break;
            case 'CLEARMSG':
                this.emit('clearmsg', {
                    channel: params[0],
                    user: nick,
                    messageId: parsed.tags['target-msg-id'],
                    message: trailing,
                    details: parsed.tags,
                    timestamp: parsed.timestamp
                });
                break;
            default:
                // check if the command is a numeric reply or a known command to ignore
                if (!isNaN(command) || command === 'CAP' || command === 'PING' || command === 'PONG' || command === 'USERSTATE' || command === 'GLOBALUSERSTATE' || command === 'ROOMSTATE') {
                    return;
                }
                this.emit('unknown_command', parsed);
                break;
        }
    }

    // Utility methods
    isConnected() {
        return this.connected;
    }

    getChannels() {
        return [...this.channels];
    }

    getNick() {
        return this.nick;
    }
}

// Twitch-specific IRC client
class TwitchIRCClient extends IRCClient {
    constructor(options = {}) {
        super({
            server: 'wss://irc-ws.chat.twitch.tv',
            nick: options.nick || 'justinfan' + Math.floor(Math.random() * 100000),
            ...options
        });
        this.capabilities = ['twitch.tv/tags', 'twitch.tv/commands'];
        this.initialChannel = options.channel || null;
    }

    connect() {
        return super.connect().then(() => {
            // Request Twitch capabilities - membership is crucial for JOIN/PART messages
            this.sendRaw('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');

            // For anonymous connection
            this.sendRaw('PASS SCHMOOPIIE');
            this.sendRaw(`NICK ${this.nick}`);
            this.sendRaw(`USER ${this.nick} 0 * :${this.nick}`);
            if (this.initialChannel) {
                const onReady = () => {
                    this.join(this.initialChannel);
                    this.off('ready', onReady); // clean up listener
                };
                this.on('ready', onReady);
            }
        });
    }

    join(channel) {
        // Twitch channels must be lowercase with #
        const channelName = '#' + channel.toLowerCase().replace('#', '');
        this.sendRaw(`JOIN ${channelName}`);
        if (!this.channels.includes(channelName)) {
            this.channels.push(channelName);
        }
    }

}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IRCClient, TwitchIRCClient };
}
if (typeof window !== 'undefined') {
    window.IRCClient = IRCClient;
    window.TwitchIRCClient = TwitchIRCClient;
}