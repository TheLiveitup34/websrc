/*
 *
 * @class Core
 * Defines the Render Pipeline
 *
 * Improvements over previous version:
 *  1. Apache detection uses a server-injected meta tag instead of a probe fetch
 *  2. checkFile no longer double-fetches — text is cached as a blob URL and
 *     reused directly by createImport, saving one full round-trip per load
 *  3. setTimeout(50) race condition replaced with proper async/await chaining
 *  4. Lightweight internal event bus replaces window/document global dispatch
 *
 */
export default class Core {

    // Default parameters for controllers
    options = {
        currentController: "Index",
        currentMethod: 'index',
        params: []
    };

    preset = [
        'Login',
        'Forgotpassword',
        'External',
        'Signup',
        'Signin'
    ];

    // ── IMPROVEMENT 4: Lightweight internal event bus ──────────────────────
    //
    // Usage from your init script:
    //
    //   import Core from '/libraries/Core.js';
    //   const core = new Core();
    //   core.on('ready', ({ controller, method, timestamp }) => {
    //       document.getElementById('preloader').classList.add('done');
    //   });
    //
    // The bus also still dispatches on window + document during the migration
    // period so your existing preloader listener keeps working unchanged.
    // Remove the window/document dispatches once fully switched over.
    //
    // ──────────────────────────────────────────────────────────────────────
    #listeners = {};

    on(event, fn) {
        if (!this.#listeners[event]) this.#listeners[event] = [];
        this.#listeners[event].push(fn);
        return this; // chainable: core.on('ready', fn).on('error', fn2)
    }

    off(event, fn) {
        if (!this.#listeners[event]) return this;
        this.#listeners[event] = this.#listeners[event].filter(f => f !== fn);
        return this;
    }

    #emit(event, detail = {}) {
        // Internal bus
        (this.#listeners[event] || []).forEach(fn => fn(detail));

        // Backwards-compat: keep dispatching on window + document so any
        // existing window.addEventListener('websrc:ready') still fires.
        const ev = new CustomEvent(`websrc:${event}`, { detail });
        window.dispatchEvent(ev);
        document.dispatchEvent(new CustomEvent(`websrc:${event}`, { detail }));

        // Late-listener flag so deferred module scripts can check synchronously
        window[`__websrc_${event}`] = detail;
    }

    constructor(cb = null) {
        (cb != null)
            ? localStorage.setItem('papergrid.cb', cb.toString().match(/function (.*)\(/)[1])
            : localStorage.removeItem('papergrid.cb');
        document.querySelector('script[data-init]').remove();
        this.setupCore();
    }

    async setupCore() {
        const url = await this.getUrl();

        // ── IMPROVEMENT 2: single fetch, no double round-trip ──────────────
        // checkFile now returns a blobUrl built from the already-downloaded
        // text. createImport imports that blob directly instead of fetching
        // the controller JS a second time over the network.
        // ──────────────────────────────────────────────────────────────────
        let file = (url.length > 0)
            ? await this.checkFile(url[0])
            : { exists: false, text: '', blobUrl: null };

        if (file.exists) {
            this.options.currentController = url[0];
            url.shift();
        } else {
            if (url[0] !== undefined && this.preset.includes(url[0])) {
                this.options.currentController = url[0];
                url.shift();
            }
            file = await this.checkFile('Index');
        }

        if (url.length > 0) {
            let isComment = false;
            const comments = file.text.match(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm);

            if (comments !== null) {
                for (let i = 0; i < comments.length; i++) {
                    if (comments[i].indexOf(`${url[0]}(`) > -1) isComment = true;
                }
            }

            const methodName = url[0];
            console.log("Checking method:", methodName, "isComment:", isComment);
            if (
                file.text.indexOf(`${methodName}(`) > -1 &&
                !isComment &&
                file.text.indexOf(`#${methodName}(`) === -1 &&
                file.text.indexOf(`_${methodName}(`) === -1
            ) {
                this.options.currentMethod = methodName.toLowerCase();
                url.shift();
            } else {
                this.options.currentMethod = "index";
            }
        }

        this.options.params = (url.length > 0) ? url : [];

        // Pass the already-fetched blob URL through so createImport
        // doesn't need to fetch the controller file again
        await this.createImport(
            this.options.currentController,
            this.options.currentMethod,
            this.options.params,
            file.blobUrl
        );
    }

    async getUrl() {
        let url, isApache;

        if (localStorage.getItem('papergrid.origin') === null) {
            localStorage.setItem('papergrid.origin', `${window.location.origin}/`);
        }

        // ── IMPROVEMENT 1: Server-injected meta tag instead of probe fetch ─
        //
        // Add this to your HTML <head> on Apache-served deployments:
        //   <meta name="papergrid-server" content="apache">
        //
        // On hash-routing / non-Apache deployments, omit it or set:
        //   <meta name="papergrid-server" content="hash">
        //
        // This eliminates the /signin probe fetch on every cold session load.
        // Falls back to the probe if the tag is absent so existing deployments
        // keep working without any server-side changes required.
        //
        // ──────────────────────────────────────────────────────────────────
        const serverMeta = document.querySelector('meta[name="papergrid-server"]');

        if (serverMeta !== null) {
            // Server told us directly — no network request needed
            isApache = serverMeta.getAttribute('content') === 'apache';
            localStorage.setItem('papergrid.apache', isApache ? 'true' : 'false');
        } else if (localStorage.getItem('papergrid.apache') === null) {
            // No meta tag, no cached value — fall back to probe
            let statusCode;
            try {
                const res = await fetch(`${window.location.origin}/signin`);
                statusCode = res.status;
            } catch {
                statusCode = 0;
            }
            localStorage.setItem('papergrid.apache', statusCode === 200 ? 'true' : 'false');
        }

        isApache = localStorage.getItem('papergrid.apache') === 'true';

        url = isApache ? window.location.pathname : window.location.hash;
        url = url.replace(/\?(.*)/g, '');

        if (isApache) {
            switch (url) {
                case "/index.html":
                case "/index":
                    window.location.href = window.location.origin;
                    return [];

                case "/":
                    url = [];
                    break;

                default:
                    url = url.split('/').filter(item => item !== "");
                    break;
            }
        } else {
            if (window.location.pathname.indexOf('index') > -1) {
                window.location.href = window.location.origin;
                return [];
            }

            switch (url) {
                case "":
                    url = [];
                    break;

                default:
                    url = url.replace('#', '').split(':').filter(item => item !== "");
                    break;
            }
        }

        if (!url.includes('external')) {
            localStorage.removeItem('papergrid.link');
            localStorage.removeItem('papergrid.src');
        }

        return url;
    }

    // ── IMPROVEMENT 2 (continued): returns blobUrl alongside text ──────────
    // The fetched JS is turned into an object URL so the browser can import()
    // it without issuing a second network request for the same file.
    // ────────────────────────────────────────────────────────────────────────
    // #isDev is evaluated once at instantiation from the meta tag.
    // Add <meta name="papergrid-env" content="development"> in dev,
    // omit or set content="production" in production.
    #isDev = document.querySelector('meta[name="papergrid-env"]')
        ?.getAttribute('content') === 'development';

    async checkFile(name) {
        const origin = localStorage.getItem('papergrid.origin');
        const controllerName = this.ucWord(name);
        const response = await fetch(`${origin}controllers/${controllerName}.js`);
        const contentType = response.headers.get('Content-Type') || '';
        const exists = (
            contentType.toLowerCase().includes("application/javascript") ||
            contentType.toLowerCase().includes("text/javascript")
        ) && response.status === 200;

        const text = await response.text();

        // Dev mode — return null blobUrl so createImport uses the real URL.
        // This means hard refresh always picks up changes, devtools shows real
        // filenames, stack traces are correct, and console.log works normally.
        if (!exists || this.#isDev) {
            return { text, exists, blobUrl: null };
        }

        // Production — blob URL avoids the second network fetch.
        // sourceURL comment gives devtools the real filename for stack traces.
        const blob = new Blob(
            [text + `
//# sourceURL=${origin}controllers/${controllerName}.js`],
            { type: 'text/javascript' }
        );
        return { text, exists, blobUrl: URL.createObjectURL(blob) };
    }

    // ── IMPROVEMENT 3: Proper async chaining, no setTimeout ────────────────
    //
    // Previously:
    //   import(...).then(({ default: C }) => {
    //       const c = new C();
    //       setTimeout(() => c[method](), 50); // hoped _constructor finished
    //   });
    //
    // Now:
    //   We await the import, await the controller's __ready promise (which
    //   Controller sets once #updateProperties + _constructor complete), then
    //   call the method. No arbitrary delay, no race.
    //
    // Controller base class should expose:
    //   this.__ready = this.#updateProperties().then(() => this._constructor?.());
    //
    // See Controller.js for the corresponding change.
    // ────────────────────────────────────────────────────────────────────────
    async createImport(currentController, currentMethod, params, blobUrl = null) {
        currentController = this.ucWord(currentController);
        const origin = localStorage.getItem('papergrid.origin');

        // Prefer the cached blob URL — fall back to a normal network import
        const importUrl = blobUrl ?? `${origin}controllers/${currentController}.js`;

        try {
            const { default: ControllerClass } = await import(importUrl);
            const controller = new ControllerClass();

            // Wait for the controller's async setup to finish before calling
            // the route method. Controller exposes this.__ready for exactly this.
            if (controller.__ready instanceof Promise) {
                await controller.__ready;
            }

            if (typeof controller[currentMethod] === 'function') {
                await controller[currentMethod](...params);
            } else {
                console.warn(`[Core] Method "${currentMethod}" not found on "${currentController}".`);
            }

            // Emit through the event bus — preloader, analytics, anything listening
            this.#emit('ready', {
                timestamp: Date.now(),
                controller: currentController,
                method: currentMethod
            });

        } catch (err) {
            console.error(`[Core] Failed to import controller "${currentController}":`, err);
        } finally {
            // Always clean up the blob URL regardless of success or failure
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        }
    }

    ucWord(str) {
        str = str.toLowerCase();
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}