/**
 * Playback — Universal Multi-Platform Video Controller
 *
 * Supported platforms:
 *   youtube   — YouTube IFrame Player API (iframe)
 *   facebook  — Facebook Embedded Video Player SDK (iframe/div)
 *   tiktok    — TikTok Embed Player via postMessage (iframe)
 *   kick      — VideoJS + HLS (.m3u8)
 *   twitch    — VideoJS + MP4 (.mp4)
 *   instagram — VideoJS + MP4 (Instagram CDN direct URL)
 *
 * Quick-start:
 *   const player = new Playback(document.getElementById("player-root"), {
 *     facebook_app_id: "YOUR_APP_ID"
 *   });
 *   await player._init();
 *   player.loadVideo("youtube", "dQw4w9WgXcQ");
 *   player.play();
 *
 * Docs referenced:
 *   YouTube  — https://developers.google.com/youtube/iframe_api_reference
 *   Facebook — https://developers.facebook.com/docs/plugins/embedded-video-player/api/
 *   TikTok   — https://developers.tiktok.com/doc/embed-player
 *   VideoJS  — https://videojs.com/guides/
 */
class Playback {
    requirements = [
        "https://vjs.zencdn.net/8.18.1/video.min.js",
        "https://vjs.zencdn.net/8.18.1/video-js.css",
        "https://connect.facebook.net/en_US/sdk.js",
        "https://www.youtube.com/iframe_api"
    ];

    // ─── Internal State ──────────────────────────────────────────────────────
    #players = {};   // { platform: playerInstance }
    #active = null; // currently active platform key
    #events = {};   // { eventName: [callbacks] }
    #readyFlags = { youtube: false, facebook: false, videojs: false };
    #autoplay = false;
    #vjsCSSLoaded = false;
    #enabled = new Set(["youtube", "facebook", "tiktok", "kick", "twitch", "instagram"]); // active platforms
    /**
     * Per-platform initial volumes (0.0 – 1.0).
     * TikTok only supports mute/unmute — its entry here is treated as a
     * mute threshold: 0 = muted, anything above 0 = unmuted.
     * Defaults applied at player init; overridden by options.volumes.
     */
    #volumes = { youtube: 1, facebook: 1, tiktok: 1, kick: 1, twitch: 1, instagram: 1 };
    #pending = [];     // { platform, source } queued before _init() completes
    #initDone = false;  // true once _init() resolves

    constructor(element, options = {}) {
        this.element = typeof element === "string"
            ? document.querySelector(element)
            : element;
        this.options = options;

        /** Detect streaming-software user agents (OBS, XSplit, Meld) */
        this.#autoplay = /OBS|XSplitBroadcaster|Meld/i.test(navigator.userAgent);

        /**
         * Platform allow-list. Accepts two shapes:
         *
         *   // Explicit allow-list — only these platforms initialise:
         *   platforms: ["youtube", "kick"]
         *
         *   // Start with all six enabled, then disable specific ones:
         *   platforms: { disable: ["twitch", "facebook"] }
         *
         * Omitting `platforms` entirely keeps all six enabled (default).
         */
        if (options.platforms) {
            const p = options.platforms;
            if (Array.isArray(p)) {
                this.#enabled = new Set(p.map(s => s.toLowerCase()));
            } else if (p.disable) {
                p.disable.forEach(s => this.#enabled.delete(s.toLowerCase()));
            }
        }

        /**
         * Per-platform starting volumes. Any key supplied in options.volumes
         * overrides the default of 1.0 for that platform.
         *
         *   volumes: { youtube: 0.8, kick: 0.5, twitch: 0.5, facebook: 0.9, tiktok: 0, instagram: 0.8 }
         *
         * TikTok note: volume is binary — 0 = muted, >0 = unmuted.
         * kick / twitch / instagram share VideoJS instances but track separate
         * saved volumes; whichever is active receives its own stored level.
         */
        if (options.volumes) {
            Object.entries(options.volumes).forEach(([platform, vol]) => {
                const key = platform.toLowerCase();
                if (key in this.#volumes) {
                    this.#volumes[key] = Math.min(1, Math.max(0, Number(vol)));
                }
            });
        }

        this._init();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PUBLIC API
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Load and initialise all platform SDKs.
     * Must be awaited before calling any other method.
     */
    async _init() {
        await this.#loadScripts();
        this.#setupContainer();
        if (this.#enabled.has("tiktok")) this.#listenTikTokMessages();
        this.#initDone = true;
        // Flush any loadVideo calls that arrived before init completed
        this.#pending.forEach(({ platform, source }) => this.loadVideo(platform, source));
        this.#pending = [];
    }

    /**
     * Load a video from the given platform.
     * @param {"youtube"|"facebook"|"tiktok"|"kick"|"twitch"|"instagram"} platform
     * @param {string} source  Video ID or direct URL depending on platform
     *
     * Platform → source mapping:
     *   youtube   — YouTube video ID
     *   facebook  — Facebook video URL
     *   tiktok    — TikTok video ID
     *   kick      — .m3u8 stream URL  (VideoJS + HLS)
     *   twitch    — .mp4 video URL    (VideoJS)
     *   instagram — Instagram CDN direct .mp4 URL (VideoJS)
     */
    loadVideo(platform, source) {
        platform = platform.toLowerCase();

        if (!this.#enabled.has(platform)) {
            console.warn(`[Playback] Platform "${platform}" is disabled. Enable it via options.platforms.`);
            return;
        }

        // Queue the call if _init() hasn't finished yet — lazy-load on ready
        if (!this.#initDone) {
            this.#pending.push({ platform, source });
            return;
        }

        this.#active = platform;

        switch (platform) {
            case "youtube": return this.#loadYouTube(source);
            case "facebook": return this.#loadFacebook(source);
            case "tiktok": return this.#loadTikTok(source);
            case "kick": return this.#loadVideoJS(source, "hls");
            case "twitch": return this.#loadVideoJS(source, "mp4");
            case "instagram": return this.#loadVideoJS(source, "mp4", "instagram");
            default:
                console.warn(`[Playback] Unknown platform: "${platform}"`);
        }
    }

    /** @returns {boolean} true if any player is currently playing */
    isPlaying() {
        const p = this.#active ? this.#players[this.#active] : null;
        if (!p) return false;
        return p.__isPlaying === true;
    }

    /** Play the active player (or all if none selected) */
    play(platform) {
        this.#dispatch(platform, "play");
    }

    /** Pause the active player */
    pause(platform) {
        this.#dispatch(platform, "pause");
    }

    /**
     * Stop and hide the active player.
     * For VideoJS this unloads the source; for iframes it removes them.
     */
    stop(platform) {
        this.#dispatch(platform, "stop");
    }

    /**
     * Set volume for a specific platform or the currently active one.
     * Volume is stored per-platform so swapping between kick/twitch/instagram
     * retains each player's own level.
     *
     * @param {number}      volume    0.0 – 1.0  (0 = mute, 1 = full)
     * @param {string|null} platform  target platform, or omit for active player
     *
     * Platform notes:
     *   tiktok    — no level control; 0 = muted, >0 = unmuted (API limitation)
     *   kick      — VideoJS HLS; full range supported
     *   twitch    — VideoJS MP4; full range supported; volume is independent of kick
     *   instagram — VideoJS MP4; full range supported; volume is independent of others
     */
    setVolume(volume, platform) {
        volume = Math.min(1, Math.max(0, Number(volume)));
        this.#dispatch(platform, "setVolume", volume);
    }

    /**
     * Seek relative to the current position.
     * Positive values skip forward, negative values skip back.
     * Clamped to 0 and the video duration automatically.
     * @param {number}      seconds   positive = forward, negative = backward
     * @param {string|null} platform  target platform, or omit for active player
     */
    seek(seconds, platform) {
        const target = (platform || this.#active || "").toLowerCase();
        const current = this.getCurrentTime(target) ?? 0;
        const duration = this.getDuration(target); // null = metadata not yet loaded
        const clampMax = (duration != null && isFinite(duration)) ? duration : Infinity;
        const clamped = Math.max(0, Math.min(clampMax, current + seconds));
        if (!isFinite(clamped)) return; // guard: don't dispatch NaN/Infinity
        this.#dispatch(target, "seek", clamped);
    }

    /**
     * Seek to an absolute position in seconds.
     * seekTo(120) jumps to exactly the 2 minute mark.
     * Clamped to 0 and the video duration automatically.
     * @param {number}      seconds   absolute time in seconds
     * @param {string|null} platform  target platform, or omit for active player
     */
    seekTo(seconds, platform) {
        const target = (platform || this.#active || "").toLowerCase();
        if (!isFinite(seconds) || seconds < 0) return; // guard: reject bad input early
        const duration = this.getDuration(target);
        const clampMax = (duration != null && isFinite(duration)) ? duration : seconds; // if unknown, trust the caller
        const clamped = Math.max(0, Math.min(clampMax, seconds));
        if (!isFinite(clamped)) return;
        this.#dispatch(target, "seek", clamped);
    }

    /**
     * Toggle mute on the active player (or a specific platform).
     * For TikTok this sends mute/unmute; for all others it uses the native API.
     * Returns the new muted state: true = muted, false = unmuted.
     * @param {string|null} platform  target platform, or omit for active player
     * @returns {boolean}
     */
    mute(platform) {
        const target = (platform || this.#active || "").toLowerCase();
        const inst = this.#players[target];
        if (!inst) return false;

        const isMuted = this.#isMuted(target);
        this.#dispatch(target, "mute", !isMuted);
        return !isMuted; // new muted state
    }

    /**
     * Returns whether the given platform (or active player) is currently muted.
     * @param {string|null} platform
     * @returns {boolean}
     */
    isMuted(platform) {
        return this.#isMuted((platform || this.#active || "").toLowerCase());
    }

    /**
     * Returns the stored volume for the given platform (or active player).
     * For TikTok this reflects the last setVolume value, not a live level.
     * @param {string|null} platform
     * @returns {number}  0.0 – 1.0
     */
    getVolume(platform) {
        const key = (platform || this.#active || "").toLowerCase();
        return this.#volumes[key] ?? 1;
    }

    /**
     * Returns the current playback position in seconds, or null if unavailable.
     * @param {string|null} platform
     * @returns {number|null}
     */
    getCurrentTime(platform) {
        const target = (platform || this.#active || "").toLowerCase();
        const inst = this.#players[target];
        if (!inst) return null;
        if (inst.__vjs) return inst.__vjs.currentTime();
        if (inst.__ytPlayer) return inst.__ytPlayer.getCurrentTime();
        if (inst.__fbApi) return inst.__fbApi.getCurrentPosition();
        if (inst.__iframe && target === "tiktok") return inst.__currentTime ?? null; // TikTok has no duration API — use stored time from onCurrentTime messages
        return null; // TikTok has no synchronous time getter
    }

    /**
     * Returns the total duration in seconds, or null if unavailable.
     * @param {string|null} platform
     * @returns {number|null}
     */
    getDuration(platform) {
        const target = (platform || this.#active || "").toLowerCase();
        const inst = this.#players[target];
        if (!inst) return null;
        if (inst.__vjs) {
            const d = inst.__vjs.duration();
            return (isFinite(d) && d > 0) ? d : null;
        }
        if (inst.__ytPlayer) {
            // getDuration() is only valid after onReady fires — guard with __ytReady flag
            if (!inst.__ytReady) return null;
            try {
                const d = inst.__ytPlayer.getDuration();
                return (isFinite(d) && d > 0) ? d : null;
            } catch (_) { return null; }
        }
        if (inst.__fbApi) return inst.__fbApi.getDuration();
        if (inst.__iframe && target === "tiktok") return inst.__duration ?? null;
        return null;
    }

    /**
     * Replay the active video from the beginning.
     * Re-shows the player slot if it was hidden after ending or stopping.
     * @param {string|null} platform  target platform, or omit for active player
     */
    replay(platform) {
        const target = (platform || this.#active || "").toLowerCase();
        const inst = this.#players[target];
        if (!inst) return false;

        // Reveal the slot — it may be hidden after end/stop
        inst.__el.style.display = "block";

        // TikTok: iframe was blanked on end/stop — restore src and autoplay
        if (inst.__iframe && inst.__iframe.src === "about:blank") {
            const src = inst.__lastSrc || "";
            if (!src) return false;
            inst.__iframe.src = src;
            inst.__iframe.onload = () => {
                this.#tiktokCommand("play");
                inst.__isPlaying = true;
                this.#emit("play", "tiktok");
            };
            return true;
        }

        // YouTube: iframe was blanked — loadVideoById restores + plays from start
        if (inst.__ytPlayer && inst.__lastVideoId) {
            inst.__ytPlayer.loadVideoById(inst.__lastVideoId);
            return true;
        }

        // VideoJS + Facebook: seek to 0 and play
        this.#dispatch(target, "seek", 0);
        this.#dispatch(target, "play");
        return true;
    }

    /**
     * Subscribe to playback events across all platforms.
     * @param {string}   event     "play"|"pause"|"ended"|"error"|"ready"|"timeupdate"|"buffering"|"volumechange"
     * @param {Function} callback  ({ platform, event, data }) => void
     */
    on(event, callback) {
        if (!this.#events[event]) this.#events[event] = [];
        this.#events[event].push(callback);
        return this; // chainable
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PRIVATE — Script Loading
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /** Map each requirement URL to the platform(s) it belongs to */
    #urlPlatforms(url) {
        if (url.includes("youtube.com")) return ["youtube"];
        if (url.includes("facebook.net")) return ["facebook"];
        // VideoJS serves kick, twitch, and instagram — skip only if ALL THREE are disabled
        if (url.includes("vjs.zencdn")) return ["kick", "twitch", "instagram"];
        return []; // no platform association — always load
    }

    #loadScripts() {
        const CALLBACK_TIMEOUT_MS = 10000; // 10 s for SDK callback AFTER script has loaded

        /**
         * Wraps the post-load SDK init callback in a timeout.
         * The clock only starts once the <script> tag fires onload — so a slow
         * network never causes a false timeout on a script that is still
         * downloading. The timeout only guards against the SDK calling its own
         * init callback (onYouTubeIframeAPIReady, fbAsyncInit, etc.) late or
         * never after the file has already arrived.
         */
        const withCallbackTimeout = (scriptEl, initPromise, label, affectedPlatforms) => {
            return new Promise(resolve => {
                scriptEl.addEventListener("load", () => {
                    // Script is on the page — now race the SDK init callback
                    const timer = setTimeout(() => {
                        console.error(`[Playback] SDK callback timed out after script loaded: ${label}. Disabling: ${affectedPlatforms.join(", ")}`);
                        affectedPlatforms.forEach(p => this.#enabled.delete(p));
                        resolve();
                    }, CALLBACK_TIMEOUT_MS);

                    initPromise.then(() => {
                        clearTimeout(timer);
                        resolve();
                    });
                });
                // If the script itself fails to load, onerror handles it and
                // resolve() is called there — the timer never starts.
            });
        };

        const loads = this.requirements.map(url => {
            // Skip this script if every platform it belongs to is disabled
            const belongs = this.#urlPlatforms(url);
            if (belongs.length && belongs.every(p => !this.#enabled.has(p))) {
                return Promise.resolve();
            }

            const onError = (label, platforms) => {
                console.error(`[Playback] Failed to load script: ${label}. Disabling: ${platforms.join(", ")}`);
                platforms.forEach(p => this.#enabled.delete(p));
            };

            // CSS link tags — no SDK callback, just wait for onload
            if (url.endsWith(".css")) {
                if (document.querySelector(`link[href="${url}"]`)) return Promise.resolve();
                return new Promise(resolve => {
                    const link = document.createElement("link");
                    link.rel = "stylesheet";
                    link.href = url;
                    link.onload = resolve;
                    link.onerror = () => { onError(url, belongs); resolve(); };
                    document.head.appendChild(link);
                });
            }

            // YouTube API — script loads then fires onYouTubeIframeAPIReady
            if (url.includes("youtube.com/iframe_api")) {
                if (window.YT && window.YT.Player) {
                    this.#readyFlags.youtube = true;
                    return Promise.resolve();
                }
                const s = this.#injectScript(url);
                s.onerror = () => { onError("YouTube API", ["youtube"]); };

                const initPromise = new Promise(resolve => {
                    const prev = window.onYouTubeIframeAPIReady;
                    window.onYouTubeIframeAPIReady = () => {
                        this.#readyFlags.youtube = true;
                        if (prev) prev();
                        resolve();
                    };
                });

                return withCallbackTimeout(s, initPromise, "YouTube API", ["youtube"]);
            }

            // Facebook SDK — script loads then fires fbAsyncInit
            if (url.includes("facebook.net")) {
                if (window.FB) {
                    this.#readyFlags.facebook = true;
                    return Promise.resolve();
                }
                const s = this.#injectScript(url);
                s.onerror = () => { onError("Facebook SDK", ["facebook"]); };

                const initPromise = new Promise(resolve => {
                    window.fbAsyncInit = () => {
                        FB.init({
                            appId: this.options.facebook_app_id || "",
                            xfbml: true,
                            version: "v3.2"
                        });
                        this.#readyFlags.facebook = true;
                        resolve();
                    };
                });

                return withCallbackTimeout(s, initPromise, "Facebook SDK", ["facebook"]);
            }

            // VideoJS — no async callback, resolves directly on script onload
            if (url.includes("vjs.zencdn")) {
                if (window.videojs) {
                    this.#readyFlags.videojs = true;
                    return Promise.resolve();
                }
                return new Promise(resolve => {
                    const s = this.#injectScript(url);
                    s.onload = () => { this.#readyFlags.videojs = true; resolve(); };
                    s.onerror = () => { onError("VideoJS", ["kick", "twitch", "instagram"]); resolve(); };
                });
            }

            return Promise.resolve();
        });

        return Promise.all(loads);
    }

    #injectScript(src) {
        if (document.querySelector(`script[src="${src}"]`)) return document.querySelector(`script[src="${src}"]`);
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        document.head.appendChild(s);
        return s;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PRIVATE — Container Setup
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    #setupContainer() {
        Object.assign(this.element.style, {
            position: "relative",
            width: this.element.style.width || "100%",
            height: this.element.style.height || "100%",
            minHeight: "100vh"
        });
    }

    #hideAll() {
        Object.keys(this.#players).forEach(p => {
            const inst = this.#players[p];
            if (!inst) return;
            if (inst.__el) inst.__el.style.display = "none";
        });
    }

    /** Set an iframe src to about:blank so stale content is not visible. */
    #blankIframe(inst) {
        if (inst?.__iframe) inst.__iframe.src = "about:blank";
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PRIVATE — YouTube
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    #loadYouTube(videoId) {
        if (!this.#readyFlags.youtube) {
            console.warn("[Playback] YouTube API not ready. Did you await _init()?");
            return;
        }

        // Reuse existing player if possible
        if (this.#players.youtube && this.#players.youtube.__ytPlayer) {
            const yt = this.#players.youtube.__ytPlayer;
            yt.loadVideoById(videoId);
            this.#players.youtube.__lastVideoId = videoId;
            this.#showSlot("youtube");
            return;
        }

        const div = this.#makeSlot("youtube");
        const ytDiv = document.createElement("div");
        ytDiv.id = `pb-yt-${Date.now()}`;
        div.appendChild(ytDiv);

        const yt = new YT.Player(ytDiv.id, {
            width: "100%",
            height: "100%",
            videoId,
            playerVars: {
                autoplay: 0,   // we trigger play manually in onReady
                mute: 0,   // never mute via playerVars — control via API only
                controls: 0,   // hide all player controls per YouTube docs
                playsinline: 1
            },
            events: {
                onReady: () => {
                    // Mark the player as ready before any getDuration/seek calls
                    this.#players.youtube.__ytReady = true;
                    yt.setVolume(this.#volumes.youtube * 100);
                    this.#emit("ready", "youtube");
                    // Streaming browsers (OBS etc.) always allow autoplay — play directly.
                    // Normal browsers: attempt unmuted play, fall back to muted autoplay
                    // only, then immediately restore volume so audio works once user interacts.
                    if (this.#autoplay) {
                        yt.playVideo();
                    } else {
                        try {
                            const p = yt.playVideo();
                            if (p && typeof p.catch === "function") {
                                p.catch(() => {
                                    yt.mute();
                                    yt.playVideo();
                                    // Unmute as soon as the user interacts with the page
                                    const unmute = () => {
                                        yt.unMute();
                                        yt.setVolume(this.#volumes.youtube * 100);
                                        document.removeEventListener("click", unmute);
                                        document.removeEventListener("keydown", unmute);
                                    };
                                    document.addEventListener("click", unmute, { once: true });
                                    document.addEventListener("keydown", unmute, { once: true });
                                });
                            }
                        } catch (_) { yt.mute(); yt.playVideo(); }
                    }
                },
                onStateChange: (e) => this.#onYTStateChange(e)
            }
        });

        this.#players.youtube = { __ytPlayer: yt, __el: div, __isPlaying: false, __lastVideoId: videoId, __ytReady: false };
        this.#showSlot("youtube");
    }

    #onYTStateChange(event) {
        const state = event.data;
        const p = this.#players.youtube;
        if (!p) return;

        // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
        if (state === YT.PlayerState.PLAYING) {
            p.__isPlaying = true;
            this.#emit("play", "youtube");
        } else if (state === YT.PlayerState.PAUSED) {
            p.__isPlaying = false;
            this.#emit("pause", "youtube");
        } else if (state === YT.PlayerState.ENDED) {
            p.__isPlaying = false;
            this.#emit("ended", "youtube");
            p.__el.style.display = "none";
            this.#blankIframe(p);
        } else if (state === YT.PlayerState.BUFFERING) {
            this.#emit("buffering", "youtube");
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PRIVATE — Facebook
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    #loadFacebook(videoUrl) {
        if (!this.#readyFlags.facebook) {
            console.warn("[Playback] Facebook SDK not ready. Did you await _init()?");
            return;
        }

        const slot = this.#makeSlot("facebook");
        slot.innerHTML = "";

        // FB requires a wrapper div with the fb-video class
        const fbDiv = document.createElement("div");
        fbDiv.className = "fb-video";
        fbDiv.dataset.href = videoUrl;
        fbDiv.dataset.width = this.element.clientWidth || 640;
        fbDiv.dataset.height = this.element.clientHeight || 360;
        fbDiv.dataset.allowfullscreen = "true";
        fbDiv.dataset.autoplay = this.#autoplay ? "true" : "false";
        slot.appendChild(fbDiv);

        // xfbml.ready fires globally for ALL FB videos on the page.
        // Capture and immediately unsubscribe to prevent duplicate callbacks
        // when loadVideo("facebook", ...) is called more than once.
        const onFbReady = (msg) => {
            if (msg.type !== "video") return;
            FB.Event.unsubscribe("xfbml.ready", onFbReady);

            // Pause any existing FB player before replacing it
            if (this.#players.facebook?.__fbApi) {
                try { this.#players.facebook.__fbApi.pause(); } catch (_) { }
            }

            const api = msg.instance;
            this.#players.facebook = { __fbApi: api, __el: slot, __isPlaying: false };
            this.#showSlot("facebook");

            api.subscribe("startedPlaying", () => {
                this.#players.facebook.__isPlaying = true;
                this.#emit("play", "facebook");
            });
            api.subscribe("paused", () => {
                this.#players.facebook.__isPlaying = false;
                this.#emit("pause", "facebook");
            });
            api.subscribe("finishedPlaying", () => {
                this.#players.facebook.__isPlaying = false;
                this.#emit("ended", "facebook");
                slot.style.display = "none";
            });
            api.subscribe("error", (err) => {
                this.#emit("error", "facebook", err);
            });
            api.subscribe("startedBuffering", () => {
                this.#emit("buffering", "facebook");
            });

            const fbVol = this.#volumes.facebook;
            api.setVolume(fbVol);
            if (fbVol === 0) api.mute(); else api.unmute();
            this.#emit("ready", "facebook");
            try { api.play(); } catch (_) { }
        };

        FB.Event.subscribe("xfbml.ready", onFbReady);
        FB.XFBML.parse(slot);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PRIVATE — TikTok (postMessage iframe API)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    #loadTikTok(videoId) {
        const slot = this.#makeSlot("tiktok");
        slot.innerHTML = "";

        const iframe = document.createElement("iframe");
        // TikTok embed URL — postMessage channel is opened by appending the origin
        // controls=0 hides the progress bar and all control buttons per TikTok docs.
        // volume_control=0 only hides the UI — mute/unmute postMessage still works.
        // Never use muted=1 URL param — it locks volume and blocks API mute control.
        const tiktokSrc = `https://www.tiktok.com/player/v1/${videoId}?autoplay=${this.#autoplay ? 1 : 0}&music_info=0&description=0&rel=0&controls=0&progress_bar=0&play_button=0&volume_control=0&fullscreen_button=0&timestamp=0&closed_caption=0&native_context_menu=0`;
        iframe.src = tiktokSrc;
        iframe.width = "100%";
        iframe.height = "100%";
        iframe.allow = "autoplay; fullscreen";
        iframe.style.border = "none";

        slot.appendChild(iframe);

        this.#players.tiktok = { __iframe: iframe, __el: slot, __isPlaying: false, __lastSrc: tiktokSrc };
        this.#showSlot("tiktok");

        // TikTok does not fire a ready event — use load event as proxy.
        // Apply initial mute state based on stored volume (TikTok has no level control).
        iframe.onload = () => {
            if (this.#volumes.tiktok === 0) {
                this.#tiktokCommand("mute");
            } else {
                this.#tiktokCommand("unMute");
            }
            this.#emit("ready", "tiktok");
        };
    }

    /**
     * TikTok communicates via window.postMessage.
     * Docs: https://developers.tiktok.com/doc/embed-player
     */
    #listenTikTokMessages() {
        window.addEventListener("message", (e) => {
            if (!e.origin.includes("tiktok.com")) return;
            const p = this.#players.tiktok;
            if (!p) return;

            const data = typeof e.data === "string" ? (() => {
                try { return JSON.parse(e.data); } catch { return {}; }
            })() : e.data;

            // TikTok docs: onStateChange values: -1=init, 0=ended, 1=playing, 2=paused, 3=buffering
            switch (data.type) {
                case "onPlayerReady":
                    // Send volume state before play so audio is correct from first frame.
                    // unmute must arrive before play — postMessage is ordered so this is safe.
                    if (this.#volumes.tiktok === 0) {
                        this.#tiktokCommand("mute");
                    } else {
                        this.#tiktokCommand("unMute");  // TikTok API uses "unMute" not "unmute"
                    }
                    this.#tiktokCommand("play");
                    break;
                case "onStateChange":
                    switch (data.value) {
                        case 1: // playing
                            p.__isPlaying = true;
                            this.#emit("play", "tiktok", data);
                            break;
                        case 2: // paused
                            p.__isPlaying = false;
                            this.#emit("pause", "tiktok", data);
                            break;
                        case 0: // ended — hide and blank per onStateChange value 0
                            p.__isPlaying = false;
                            this.#emit("ended", "tiktok", data);
                            p.__el.style.display = "none";
                            this.#blankIframe(p);
                            break;
                        case 3: // buffering
                            this.#emit("buffering", "tiktok", data);
                            break;
                    }
                    break;
                case "onPlayerPlay":  // legacy fallback
                    p.__isPlaying = true;
                    this.#emit("play", "tiktok", data);
                    break;
                case "onPlayerPause":  // legacy fallback
                    p.__isPlaying = false;
                    this.#emit("pause", "tiktok", data);
                    break;
                case "onPlayerComplete":  // legacy fallback
                    p.__isPlaying = false;
                    this.#emit("ended", "tiktok", data);
                    p.__el.style.display = "none";
                    this.#blankIframe(p);
                    break;
                case "onCurrentTime":
                    this.#emit("timeupdate", "tiktok", { currentTime: data.value.currentTime, duration: data.value.duration });
                    // store current time for seekTo() since TikTok has no sync getter
                    p.__currentTime = data.value.currentTime;
                    p.__duration = data.value.duration; // store duration as well since TikTok has no getter
                    break;
                case "onPlayerError":
                    this.#emit("error", "tiktok", data);
                    break;
            }
        });
    }

    /** Send a postMessage command to the TikTok iframe */
    #tiktokCommand(type, value) {
        const p = this.#players.tiktok;
        if (!p || !p.__iframe) return;
        const msg = { type, "x-tiktok-player": true, ...(value !== undefined ? { value } : {}) };
        p.__iframe.contentWindow.postMessage(msg, "https://www.tiktok.com");
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PRIVATE — VideoJS  (Kick = HLS .m3u8 | Twitch-style = .mp4 | Instagram = .mp4)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * @param {string} src       URL to load
     * @param {"hls"|"mp4"} type MIME type hint
     * @param {string} [platformOverride]  Explicit platform key (e.g. "instagram").
     *                                     When omitted, "hls" → "kick", "mp4" → "twitch".
     */
    #loadVideoJS(src, type /* "hls" | "mp4" */, platformOverride) {
        if (!this.#readyFlags.videojs) {
            console.warn("[Playback] VideoJS not ready. Did you await _init()?");
            return;
        }

        // Resolve the platform key — instagram passes itself explicitly so it
        // gets its own slot and volume bucket instead of sharing with twitch.
        const platform = platformOverride
            ? platformOverride
            : (type === "hls" ? "kick" : "twitch");

        // Save the outgoing VJS platform's current volume before switching.
        // For instagram we treat kick/twitch as "other VJS" peers; save all
        // active VJS players that aren't this one.
        const vjsPeers = ["kick", "twitch", "instagram"].filter(p => p !== platform);
        vjsPeers.forEach(peer => {
            if (this.#players[peer]?.__vjs) {
                this.#volumes[peer] = this.#players[peer].__vjs.volume();
            }
        });

        const slot = this.#makeSlot(platform);
        slot.innerHTML = "";

        const videoEl = document.createElement("video");
        videoEl.className = "video-js";
        videoEl.style.width = "100%";
        videoEl.style.height = "100%";
        videoEl.style.maxHeight = "100vh";
        if (this.#autoplay) {
            videoEl.autoplay = true;
            videoEl.muted = true;
        }
        slot.appendChild(videoEl);

        const mime = type === "hls" ? "application/x-mpegURL" : "video/mp4";

        const vjs = videojs(videoEl, {
            controls: false,  // hide all native VideoJS controls per VideoJS docs
            autoplay: this.#autoplay,
            muted: this.#autoplay,
            fluid: false,
            fill: true,
            sources: [{ src, type: mime }]
        });

        vjs.on("play", () => { this.#players[platform].__isPlaying = true; this.#emit("play", platform); });
        vjs.on("pause", () => { this.#players[platform].__isPlaying = false; this.#emit("pause", platform); });
        vjs.on("ended", () => {
            this.#players[platform].__isPlaying = false;
            this.#emit("ended", platform);
            this.#players[platform].__el.style.display = "none";
        });
        vjs.on("timeupdate", () => this.#emit("timeupdate", platform, { currentTime: vjs.currentTime(), duration: vjs.duration() }));
        vjs.on("error", () => this.#emit("error", platform, vjs.error()));
        vjs.on("ready", () => this.#emit("ready", platform));
        vjs.on("waiting", () => this.#emit("buffering", platform));
        vjs.on("volumechange", () => this.#emit("volumechange", platform, { volume: vjs.volume(), muted: vjs.muted() }));

        // Apply volume on ready, then autoplay on canplay when source is actually loaded
        vjs.ready(() => {
            const vol = this.#volumes[platform];
            vjs.volume(vol);
            vjs.muted(vol === 0);
        });

        vjs.one("canplay", () => {
            // In streaming browsers autoplay is always permitted — skip mute-retry.
            if (this.#autoplay) {
                vjs.play();
            } else {
                const pp = vjs.play();
                if (pp && typeof pp.catch === "function") {
                    pp.catch(() => { vjs.muted(true); vjs.play(); });
                }
            }
        });

        this.#players[platform] = { __vjs: vjs, __el: slot, __isPlaying: false };
        this.#showSlot(platform);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PRIVATE — Command Dispatcher
    // Knows the logic of each platform and calls the right internal method
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Route a command to a single platform or all active ones.
     * @param {string|null} platform  target platform or null → active
     * @param {string}      cmd       "play" | "pause" | "stop" | "setVolume" | "seek"
     * @param {*}           arg       optional argument (volume / time)
     */
    #dispatch(platform, cmd, arg) {
        const targets = platform
            ? [platform]
            : (this.#active ? [this.#active] : Object.keys(this.#players));

        targets.forEach(p => this.#runCommand(p, cmd, arg));
    }

    #runCommand(platform, cmd, arg) {
        const inst = this.#players[platform];
        if (!inst) return;

        // ── VideoJS platforms (kick, twitch, instagram) ───────────────────────
        if (inst.__vjs) {
            const vjs = inst.__vjs;
            switch (cmd) {
                case "play":
                    // check if the instance is hiding and reveal it before play, otherwise some browsers won't start playback
                    if (inst.__el.style.display === "none") {
                        inst.__el.style.display = "block";
                    }
                    vjs.play(); break;
                case "pause": vjs.pause(); break;
                case "stop":
                    vjs.pause();
                    vjs.currentTime(0);
                    inst.__el.style.display = "none";
                    inst.__isPlaying = false;
                    break;
                case "setVolume":
                    this.#volumes[platform] = arg;
                    vjs.volume(arg);
                    vjs.muted(arg === 0);
                    this.#emit("volumechange", platform, { volume: arg, muted: arg === 0 });
                    break;
                case "mute":
                    // arg = true → mute, false → unmute
                    vjs.muted(arg);
                    if (!arg && vjs.volume() === 0) vjs.volume(this.#volumes[platform] || 1);
                    this.#emit("volumechange", platform, { volume: vjs.volume(), muted: arg });
                    break;
                case "seek":
                    // readyState < 1 means metadata not yet loaded — currentTime(n) would throw
                    if (vjs.readyState() >= 1 && isFinite(arg)) vjs.currentTime(arg);
                    break;
            }
            return;
        }

        // ── YouTube ───────────────────────────────────────────────────
        if (inst.__ytPlayer) {
            const yt = inst.__ytPlayer;
            switch (cmd) {
                case "play":
                    // check if the instance is hiding and reveal it before play, otherwise some browsers won't start playback
                    if (inst.__el.style.display === "none") {
                        inst.__el.style.display = "block";
                    }
                    yt.playVideo(); break;
                case "pause": yt.pauseVideo(); break;
                case "stop":
                    yt.stopVideo();
                    inst.__el.style.display = "none";
                    inst.__isPlaying = false;
                    this.#blankIframe(inst);
                    break;
                case "setVolume":
                    this.#volumes.youtube = arg;
                    yt.setVolume(arg * 100);
                    if (arg === 0) yt.mute(); else yt.unMute();
                    this.#emit("volumechange", "youtube", { volume: arg, muted: arg === 0 });
                    break;
                case "mute":
                    arg ? yt.mute() : yt.unMute();
                    if (!arg && yt.getVolume() === 0) yt.setVolume((this.#volumes.youtube || 1) * 100);
                    this.#emit("volumechange", "youtube", { volume: yt.getVolume() / 100, muted: arg });
                    break;
                case "seek":
                    // Only seek if the player is ready and the value is valid
                    if (inst.__ytReady && isFinite(arg)) yt.seekTo(arg, true);
                    break;
            }
            return;
        }

        // ── Facebook ──────────────────────────────────────────────────
        if (inst.__fbApi) {
            const fb = inst.__fbApi;
            switch (cmd) {
                case "play":
                    if (inst.__el.style.display === "none") {
                        inst.__el.style.display = "block";
                    }
                    fb.play(); break;
                case "pause": fb.pause(); break;
                case "stop":
                    fb.pause();
                    fb.seek(0);
                    inst.__el.style.display = "none";
                    inst.__isPlaying = false;
                    break;
                case "setVolume":
                    this.#volumes.facebook = arg;
                    fb.setVolume(arg);
                    if (arg === 0) fb.mute(); else fb.unmute();
                    this.#emit("volumechange", "facebook", { volume: arg, muted: arg === 0 });
                    break;
                case "mute":
                    arg ? fb.mute() : fb.unmute();
                    if (!arg && this.#volumes.facebook === 0) {
                        this.#volumes.facebook = 1;
                        fb.setVolume(1);
                    }
                    this.#emit("volumechange", "facebook", { volume: this.#volumes.facebook, muted: arg });
                    break;
                case "seek": fb.seek(arg); break;
            }
            return;
        }

        // ── TikTok (postMessage) ──────────────────────────────────────
        if (inst.__iframe) {
            switch (cmd) {
                case "play":
                    if (inst.__el.style.display === "none") {
                        inst.__el.style.display = "block";
                    }
                    this.#tiktokCommand("play"); break;
                case "pause": this.#tiktokCommand("pause"); break;
                case "stop":
                    this.#tiktokCommand("pause");
                    this.#tiktokCommand("seekTo", 0);
                    inst.__el.style.display = "none";
                    inst.__isPlaying = false;
                    this.#blankIframe(inst);
                    break;
                case "setVolume":
                    // TikTok API has no volume level — map to mute/unMute only.
                    this.#volumes.tiktok = arg;
                    this.#tiktokCommand(arg === 0 ? "mute" : "unMute");
                    this.#emit("volumechange", "tiktok", { volume: arg, muted: arg === 0 });
                    break;
                case "mute":
                    this.#tiktokCommand(arg ? "mute" : "unMute");
                    if (!arg && this.#volumes.tiktok === 0) this.#volumes.tiktok = 1;
                    this.#emit("volumechange", "tiktok", { volume: this.#volumes.tiktok, muted: arg });
                    break;
                case "seek": this.#tiktokCommand("seekTo", arg); break;
            }
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PRIVATE — Helpers
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /** Internal mute state query — used by public mute() and isMuted() */
    #isMuted(platform) {
        const inst = this.#players[platform];
        if (!inst) return false;
        if (inst.__vjs) return inst.__vjs.muted();
        if (inst.__ytPlayer) return inst.__ytPlayer.isMuted();
        if (inst.__fbApi) return this.#volumes[platform] === 0;
        if (inst.__iframe) return this.#volumes.tiktok === 0; // TikTok: inferred
        return false;
    }

    /**
     * Create (or re-use) an absolutely-positioned slot div for a platform.
     */
    #makeSlot(platform) {
        const id = `pb-slot-${platform}`;
        let el = this.element.querySelector(`#${id}`);
        if (!el) {
            el = document.createElement("div");
            el.id = id;
            Object.assign(el.style, {
                position: "absolute",
                inset: "0",
                width: "100%",
                height: "100%",
                display: "none"  // hidden by default; revealed by #showSlot
            });
            this.element.appendChild(el);
        }
        return el;
    }

    /** Show one slot, hide all others — prevents stacking. */
    #showSlot(platform) {
        this.element.querySelectorAll("[id^='pb-slot-']").forEach(el => {
            el.style.display = el.id === `pb-slot-${platform}` ? "block" : "none";
        });
    }

    /**
     * Fire internal event listeners.
     */
    #emit(event, platform, data = null) {
        if (this.#players[platform]) {
            if (event === "play") this.#players[platform].__isPlaying = true;
            if (event === "pause" || event === "ended" || event === "stop")
                this.#players[platform].__isPlaying = false;
        }

        const listeners = this.#events[event] || [];
        listeners.forEach(cb => {
            try { cb({ platform, event, data }); }
            catch (e) { console.error("[Playback] Event callback error:", e); }
        });
    }
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = Playback;
} else {
    window.Playback = Playback;
}

/* ─── Usage Example ─────────────────────────────────────────────────────────

const player = new Playback(document.getElementById("player-root"), {
    facebook_app_id: "YOUR_APP_ID",         // required only for Facebook

    // ── Platform filtering (optional) ──────────────────────────────────────
    // Allow-list: only these platforms will init and accept loadVideo calls
    //   platforms: ["youtube", "kick", "instagram"],

    // Blocklist: disable specific platforms, keep the rest
    //   platforms: { disable: ["twitch", "facebook", "tiktok"] }

    // ── Per-platform starting volumes (optional, 0.0 – 1.0) ───────────────
    // TikTok: volume is binary — 0 = muted, anything > 0 = unmuted.
    // kick / twitch / instagram: each remembers its own level when you swap.
    volumes: { youtube: 1, facebook: 1, tiktok: 1, kick: 0.8, twitch: 0.8, instagram: 1 }
});

await player._init();                        // loads all SDKs

// Load any platform:
player.loadVideo("youtube",   "dQw4w9WgXcQ");
player.loadVideo("facebook",  "https://www.facebook.com/facebook/videos/...");
player.loadVideo("tiktok",    "7241546523821445419");
player.loadVideo("kick",      "https://example.m3u8");                     // HLS stream
player.loadVideo("twitch",    "https://example.mp4");                      // MP4 file
player.loadVideo("instagram", "https://scontent-den2-1.cdninstagram.com/o1/v/...mp4"); // Instagram CDN MP4

// loadVideo can be called BEFORE _init() — it queues and runs when ready:
player.loadVideo("instagram", "https://scontent-...mp4"); // queued immediately, plays once SDK loads
await player._init();                          // SDKs load; queued video fires automatically

// Universal controls — player knows what's loaded:
player.play();
player.pause();
player.stop();
player.setVolume(0.8);    // 0.0 – 1.0 (TikTok: 0 = muted, >0 = unmuted)
player.seek(30);          // skip forward 30 seconds from current position
player.seek(-10);         // skip back 10 seconds from current position
player.seekTo(120);       // jump to exactly 2:00 (absolute position)
player.replay();          // restart from beginning; re-shows player if hidden after end/stop
player.mute();            // toggle mute on active player → returns new muted state (bool)
player.isMuted();         // → true / false
player.getVolume();       // → 0.0 – 1.0 (last known value for TikTok)
player.getCurrentTime();  // → seconds | null (TikTok has no sync getter)
player.getDuration();     // → seconds | null (TikTok has no sync getter)
player.isPlaying();       // → true / false

// Event bus — platform-agnostic:
player.on("play",         ({ platform }) => console.log(platform, "started"));
player.on("pause",        ({ platform }) => console.log(platform, "paused"));
player.on("ended",        ({ platform }) => console.log(platform, "ended"));
player.on("buffering",    ({ platform }) => console.log(platform, "buffering"));
player.on("timeupdate",   ({ platform, data }) => console.log(platform, data.currentTime, "/", data.duration));
player.on("volumechange", ({ platform, data }) => console.log(platform, "vol:", data.volume, "muted:", data.muted));
player.on("error",        ({ platform, data }) => console.error(platform, data));
player.on("ready",        ({ platform }) => console.log(platform, "ready"));

─────────────────────────────────────────────────────────────────────────── */