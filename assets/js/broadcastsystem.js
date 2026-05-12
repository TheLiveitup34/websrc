/**
 * Broadcast System
 * Uses the browser's BroadcastChannel API for communication across browser tabs/windows
 */

class BroadcastSystem {
    constructor() {
        // Store channels: { channelId: { channel: BroadcastChannel, events: Map } }
        this.channels = new Map();

        // Check if BroadcastChannel is supported
        this.isSupported = typeof BroadcastChannel !== 'undefined';

        if (!this.isSupported) {
            console.warn('BroadcastChannel API is not supported in this environment');
        }
    }

    /**
     * Get or create a channel for cross-tab communication
     * @param {string} channelId - The channel identifier
     * @returns {Object} Channel interface with on() and call() methods
     */
    channel(channelId) {
        if (!this.isSupported) {
            throw new Error('BroadcastChannel API is not supported in this environment');
        }

        // Create channel if it doesn't exist
        if (!this.channels.has(channelId)) {
            const broadcastChannel = new BroadcastChannel(channelId);
            const events = new Map(); // eventName -> [callbacks]

            // Set up message handler for incoming messages
            broadcastChannel.onmessage = (event) => {
                const { eventName, data } = event.data;

                if (events.has(eventName)) {
                    const callbacks = events.get(eventName);

                    for (const callback of callbacks) {
                        try {
                            callback(data);
                        } catch (error) {
                            console.error(`Error in listener for "${eventName}" on channel "${channelId}":`, error);
                        }
                    }
                }
            };

            this.channels.set(channelId, {
                channel: broadcastChannel,
                events: events
            });
        }

        const channelData = this.channels.get(channelId);

        return {
            /**
             * Register an event listener
             * @param {string} eventName - Name of the event (e.g., "app.function")
             * @param {Function} callback - Function to call when event is received
             * @returns {Function} Unsubscribe function
             */
            on: (eventName, callback) => {
                if (!channelData.events.has(eventName)) {
                    channelData.events.set(eventName, []);
                }

                channelData.events.get(eventName).push(callback);

                // Return unsubscribe function
                return () => {
                    const callbacks = channelData.events.get(eventName);
                    const index = callbacks.indexOf(callback);
                    if (index > -1) {
                        callbacks.splice(index, 1);
                    }
                };
            },

            /**
             * Broadcast an event to ALL tabs (including current tab)
             * @param {string} eventName - Name of the event to trigger
             * @param {*} data - Data to send (must be structured-cloneable)
             */
            call: (eventName, data) => {
                try {
                    // Post message to all other tabs
                    channelData.channel.postMessage({
                        eventName,
                        data
                    });

                    // Also trigger locally in this tab
                    if (channelData.events.has(eventName)) {
                        const callbacks = channelData.events.get(eventName);

                        for (const callback of callbacks) {
                            try {
                                callback(data);
                            } catch (error) {
                                console.error(`Error in local listener for "${eventName}":`, error);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error broadcasting message on "${channelId}":`, error);
                    throw error;
                }
            },

            /**
             * Broadcast to other tabs only (exclude current tab)
             * @param {string} eventName - Name of the event to trigger
             * @param {*} data - Data to send
             */
            callOthers: (eventName, data) => {
                try {
                    channelData.channel.postMessage({
                        eventName,
                        data
                    });
                } catch (error) {
                    console.error(`Error broadcasting message on "${channelId}":`, error);
                    throw error;
                }
            },

            /**
             * Remove all listeners for a specific event or all events
             * @param {string} [eventName] - Optional event name to clear
             */
            clear: (eventName) => {
                if (eventName) {
                    channelData.events.delete(eventName);
                } else {
                    channelData.events.clear();
                }
            },

            /**
             * Get the number of listeners for an event in this tab
             * @param {string} eventName - Name of the event
             * @returns {number} Number of registered listeners
             */
            listenerCount: (eventName) => {
                return channelData.events.has(eventName)
                    ? channelData.events.get(eventName).length
                    : 0;
            },

            /**
             * Close this channel and stop receiving messages
             */
            close: () => {
                channelData.channel.close();
                this.channels.delete(channelId);
            }
        };
    }

    /**
     * Remove an entire channel and close the BroadcastChannel
     * @param {string} channelId - The channel identifier to remove
     */
    removeChannel(channelId) {
        if (this.channels.has(channelId)) {
            const channelData = this.channels.get(channelId);
            channelData.channel.close();
            this.channels.delete(channelId);
        }
    }

    /**
     * Get all active channel IDs
     * @returns {Array<string>} Array of channel IDs
     */
    getChannels() {
        return Array.from(this.channels.keys());
    }

    /**
     * Close all channels and clean up
     */
    closeAll() {
        for (const [channelId, channelData] of this.channels) {
            channelData.channel.close();
        }
        this.channels.clear();
    }

    /**
     * Check if BroadcastChannel API is supported
     * @returns {boolean}
     */
    get supported() {
        return this.isSupported;
    }
}



// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BroadcastSystem;

}

if (typeof window !== 'undefined') {
    window.BroadcastSystem = BroadcastSystem;
}
