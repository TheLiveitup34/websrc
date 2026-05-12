class Polling {
    constructor(options = {}) {
        this.pollInterval = (options.pollInterval || 60) * 1000; // 60 seconds
        this.apiUrl = options.apiUrl || '/path/to/polling-server';
        this.headers = options.headers || {};
        this.method = options.method || 'GET';
        this.body = options.body || null;
        this.onUpdate = options.onUpdate || null;
        this.onError = options.onError || null;
        this.onConnect = options.onConnect || null;

        
        this.pollTimer = null;
        this.isPolling = false;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    /**
     * Start polling
     */
    start() {
        if (this.isPolling) return;

        this.isPolling = true;

        // First poll immediately
        this.poll();

        // Then set up interval
        this.pollTimer = setInterval(() => this.poll(), this.pollInterval);

        if (this.onConnect) {
            this.onConnect();
        }   
    }

    /**
     * Stop polling
     */
    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.isPolling = false;
    }


    async poll() {
        try {
            const response = await fetch(this.apiUrl, {
                method: this.method,
                headers: {
                    'Content-Type': 'application/json',
                    ...this.headers
                },
                body: this.body || null,
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.errors) {
                throw new Error(data.errors);
            }

            this.retryCount = 0; // Reset retry count on success

            if (this.onUpdate && data.success) {
                this.onUpdate(data.data || data);
            }
        } catch (error) {
            this.retryCount++;

            if (this.onError) {
                this.onError(error, this.retryCount);
            }

            if (this.retryCount >= this.maxRetries) {
                this.stop();
            }
        } 
    }

    setInterval(newInterval) {
        this.pollInterval = newInterval;

        if (this.isPolling) {
            this.stop();
            this.start();
        }

    }
                
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = Polling;
} else {
    window.Polling = Polling;
}