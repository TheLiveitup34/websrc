/*
 *
 * @class Controller
 * Loads @model and @view
 *
 * Improvement over previous version:
 *   Exposes `this.__ready` — a Promise that resolves once #updateProperties
 *   and _constructor have both completed. Core.js awaits this instead of using
 *   setTimeout(50) to guess when setup is done.
 *
 */
import Ranker from './Ranker.js';

export default class Controller {

    defaults = {
        app: {
            name: "PaperGrid",
            templates: {
                titles: {
                    home: "{{NAME}}",
                    other: "{{PAGE_TITLE}} - {{NAME}}"
                },
                pages: {
                    header: 'header.html',
                    footer: 'footer.html'
                }
            },
            js: null,
            css: null,
            manifest: "./manifest.json"
        },
        meta: {
            index: true,
            language: "en-US",
            title: "Page has been loaded!",
            description: "Website design | Global Reach | SEO | Local SEO | Listings | Reviews",
            keywords: "Page has been loaded!",
            image: "./img/icons/icon-64.png",
            icon: "./img/icons/icon-64.png"
        },
        site: {
            origin: window.location.origin,
            year: new Date().getFullYear()
        },
        externalLinks: true,
        header: true,
        footer: true
    };

    js = [];
    templates = [];
    user = false;

    // ── IMPROVEMENT 3 (Controller side) ────────────────────────────────────
    // __ready is a public Promise that resolves once #updateProperties and
    // _constructor have both finished. Core.js awaits this before calling the
    // route method, replacing the old setTimeout(50) hack entirely.
    // ────────────────────────────────────────────────────────────────────────
    __ready;

    constructor() {
        this.__ready = this.#updateProperties();
    }

    // Default error page if route method doesn't exist
    async notFound(name) {
        if (name === undefined) name = "Page";
        this.defaults.header = false;
        this.defaults.footer = false;
        this.defaults.app.css = ["https://fonts.googleapis.com/css?family=Monoton","/assets/css/error.css"];
        this.defaults.app.js = [];
        this.defaults.app.templates.titles.home = `Error ${name} has not been found - {{NAME}}`;
        this.defaults.message = `${name} has not been found`;
        await this.view('errors/404');
    }

    async modify() {
        this.defaults.header = false;
        this.defaults.footer = false;
        this.defaults.app.css = ['/assets/css/modify.css' + `?v=${Date.now()}`];
        this.defaults.app.js = ['/assets/js/modify.js' + `?v=${Date.now()}`];
        this.defaults.app.templates.titles.home = `Page has been modified - {{NAME}}`;
        await this.view('modify');
    }

    // @model - loads model for API communication
    async model(model) {
        const { default: ModelClass } = await import(`${localStorage.getItem('papergrid.origin')}models/${model}.js`);
        return new ModelClass(this);
    }

    // @view - renders elements for the client
    async view(view, data = {}) {

        const ranker = new Ranker();
        await ranker.seo(this.defaults);

        document.head.appendChild(document.createComment(' Stylesheets Implemented by PaperGrid '));

        if (this.defaults.app.css !== null) {
            if (!Array.isArray(this.defaults.app.css)) this.defaults.app.css = [this.defaults.app.css];

            this.defaults.app.css.forEach(css => {
                let link = document.createElement('link');
                link.rel = "stylesheet";
                link.href = css;
                document.head.appendChild(link);
            });
        }

        document.head.appendChild(document.createComment(' Scripts Implemented by PaperGrid '));


        if (this.defaults.header) {
            const header = await this.#checkFile(`view/common/${this.defaults.app.templates.pages.header}`);
            if (header.exists) document.body.appendChild(await this.#parser(header.text, data));
        }

        const file = await this.#checkFile(`view/${view}.html`);
        if (file.exists) document.body.appendChild(await this.#parser(file.text, data));

        if (this.defaults.footer) {
            const footer = await this.#checkFile(`view/common/${this.defaults.app.templates.pages.footer}`);
            if (footer.exists) document.body.appendChild(await this.#parser(footer.text, data));
        }

        this.#externalLinks();

        if (window.location.hash !== "" && window.location.hash !== "#!") {
            const elm = document.getElementById(window.location.hash.replace('#', ''));
            if (elm !== null && elm !== undefined) this.#template(elm);
        }

        window.addEventListener('hashchange', e => {
            if (window.location.hash === "#!") { e.preventDefault(); return; }
            const elm = document.getElementById(location.hash.replace('#', ''));
            if (elm == null || elm == undefined) location.reload();
        });

        ranker.schema();

        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await this.injectScripts(this.defaults.app.js);
    }

    get(query) {
        let search = window.location.search.slice(1);
        if (window.location.hash.indexOf('?') > -1) {
            search = window.location.hash.replace(/\#(.*)\?/g, '');
        }
        if (search === "") return false;

        search = search.split('&');
        let info = null;
        search.forEach(elm => {
            if (elm.indexOf(query) > -1) info = elm;
        });

        if (info === null) return false;
        if (info.indexOf("=") > -1) return decodeURIComponent(info.split('=')[1]);

        return null;
    }

    async injectScripts(scripts) {
        if (scripts !== null) {
            if (!Array.isArray(scripts)) scripts = [scripts];

            for (let s = 0; s < scripts.length; s++) {
                const domainMatch = scripts[s].match(/^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n]+)/m);
                const domain = domainMatch ? domainMatch[0] : null;

                let integrity = null;
                if (scripts[s].indexOf('|') > -1) {
                    integrity = scripts[s].split('|')[1];
                    scripts[s] = scripts[s].split('|')[0];
                }

                let script = document.createElement('script');
                script.type = "text/javascript";

                script.defer = true;
                script.src = scripts[s];

                if (integrity !== null) {
                    script.integrity = integrity;
                }

                if (domain !== null && !scripts[s].startsWith(window.location.origin)) {
                    script.crossOrigin = "anonymous";
                }

                document.head.appendChild(script);
                this.js[s] = script;
                await new Promise((resolve, reject) => {
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error(`Failed to load script: ${scripts[s]}`));
                });
            }
        }
    }

    internalRedirect(src) {
        const isApache = JSON.parse(localStorage.getItem('papergrid.apache'));
        if (isApache) {
            window.location.href = src;
            return;
        }
        src = "#" + src.substring(1);
        if (src.indexOf('/') > -1) src = src.split('/').join(':');
        if (src[src.length - 1] === ":") src = src.substring(0, src.length - 1);

        window.location.href = src;
        window.location.reload();
    }

    externalRedirect(src, elm) {
        const isApache = JSON.parse(localStorage.getItem('papergrid.apache'));
        const link = this.get('link');

        if (link !== false) return;
        if (this.defaults.externalLinks === false) { window.location.href = src; return; }

        if (isApache) {
            window.location.href = `/external?link=${encodeURIComponent(src)}&src=${encodeURIComponent(window.location.href.replace(/\?(.*)/, ''))}&t=${Date.now().toString()}`;
            return;
        }

        localStorage.setItem('papergrid.link', src);
        localStorage.setItem('papergrid.src', window.location.href.replace(/\?(.*)/, ''));
        window.location.href = `/#external`;
        location.reload();
    }

    async encrypt(algorithm, text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest(algorithm, data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }


    /*
    *   Private Functions
    *   These functions are important for the framework to work
    */

    // ── IMPROVEMENT 3 (Controller side) ────────────────────────────────────
    // #updateProperties is now fully async and calls _constructor() at the end.
    // Its returned Promise is stored as this.__ready so Core.js can await it
    // before invoking the route method — no more setTimeout(50) guesswork.
    // ────────────────────────────────────────────────────────────────────────
    async #updateProperties() {
        const data = await (await fetch(`${localStorage.getItem('papergrid.origin')}properties.json`)).json();
        for (const prop in data) {
            if (typeof data[prop] === "object" && data[prop] !== null) {
                this.#subProperties(data[prop], [prop]);
            } else {
                this.defaults[prop] = data[prop];
            }
        }

        // Call _constructor synchronously or await it if the subclass made it async
        if (typeof this._constructor === 'function') {
            await this._constructor();
        }
    }

    #subProperties(modify, parent) {
        for (const prop in modify) {
            if (typeof modify[prop] === "object" && modify[prop] !== null) {
                this.#subProperties(modify[prop], [...parent, prop]);
            } else {
                let target = this.defaults;
                for (const key of parent) {
                    if (target[key] === undefined) target[key] = {};
                    target = target[key];
                }
                target[prop] = modify[prop];
            }
        }
    }

    #modifyLinks(isApache, links) {
        links.forEach(link => {
            if (link.href === "" || (link.href[0] !== '/' && link.href[0] !== 'h')) return;

            if (
                link.href.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi) &&
                link.href.indexOf(window.location.origin) === -1
            ) {
                link.addEventListener('click', e => {
                    e.preventDefault();
                    this.externalRedirect(link.href, link);
                });
                return;
            }

            let href = link.href.replace(localStorage.getItem('papergrid.origin').slice(0, -1), '');

            switch (href) {
                case "/":
                    break;
                case "/#":
                    link.addEventListener('click', e => {
                        e.preventDefault();
                        window.scrollTo(document.body.offsetLeft, document.body.offsetTop);
                    });
                    break;
                case "/#!":
                    link.addEventListener('click', e => {
                        e.preventDefault();
                    });
                    break;
                default:
                    if (isApache) break;

                    let modifiedHref = (link.href.indexOf('#') > -1)
                        ? link.href.replace(localStorage.getItem('papergrid.origin'), '')
                        : link.href.replace(`${window.location.origin}/`, '#');

                    if (modifiedHref.indexOf('/') > -1) modifiedHref = modifiedHref.split('/').join(':');
                    link.href = modifiedHref;

                    link.addEventListener('click', e => {
                        const key = modifiedHref.replace('#', '');
                        const elm = document.getElementById(key);

                        if (key in this.templates) {
                            this.#template(this.templates[key]);
                            return;
                        }

                        if (elm == null || elm == undefined) {
                            setTimeout(() => { window.location.reload(); }, 50);
                            return;
                        }

                        e.preventDefault();
                        window.scrollTo(elm.offsetLeft, elm.offsetTop);
                    });
                    break;
            }
        });
    }

    #externalLinks() {
        const links = document.querySelectorAll('a:not(.disabled)');
        const isApache = JSON.parse(localStorage.getItem('papergrid.apache'));
        this.#modifyLinks(isApache, links);

        for (let k in this.templates) {
            this.#modifyLinks(isApache, this.templates[k].content.querySelectorAll('a:not(.disabled)'));
        }
    }

    #template(elm) {
        const method = (elm.dataset.type !== undefined && elm.dataset.type !== null)
            ? elm.dataset.type.toLowerCase()
            : undefined;

        switch (method) {
            case "append":
                document.querySelector(elm.dataset.target).append(elm.content);
                break;
            case "appendchild":
                document.querySelector(elm.dataset.target).appendChild(elm.content);
                break;
            case "innerhtml":
                document.querySelector(elm.dataset.target).innerHTML = elm.innerHTML;
                break;
            case "innertext":
                document.querySelector(elm.dataset.target).innerText = elm.innerHTML;
                break;
            case "prepend":
                document.querySelector(elm.dataset.target).prepend(elm.content);
                break;
            default:
                document.querySelector(elm.dataset.target).appendChild(elm.content);
                break;
        }
    }

    async #checkFile(name) {
        let response;
        try {
            response = await fetch(`${localStorage.getItem('papergrid.origin')}${name}`);
        } catch (e) {
            console.error(`[Controller] Failed to fetch "${name}":`, e);
            return { text: '', exists: false };
        }
        const text = await response.text();
        return { text, exists: response.ok };
    }

    async #parser(elm, site = {}) {
        const defaults = this.defaults;
        site = { ...site, ...defaults };
        const regex = /{{(.*?)}}/g;
        let interactive = elm.match(regex);

        if (interactive !== null) {
            interactive.forEach(express => {
                let extract = express.replace('{{', '').replace('}}', '');

                if (extract.slice(-6) === ",false") {
                    extract = extract.slice(0, extract.length - 6);
                    elm = elm.replace(express, '');
                    return;
                }

                let resolved;
                try {
                    resolved = extract.split('.').reduce((obj, key) => obj?.[key], site);
                    if (resolved === undefined) resolved = '';
                } catch {
                    resolved = '';
                }

                if (resolved instanceof HTMLElement) resolved = resolved.outerHTML;

                elm = elm.replace(express, resolved ?? '');
            });
        }

        const parser = new DOMParser();
        let template = parser.parseFromString(`<body><template>${elm}</template></body>`, "text/html");
        const selector = template.querySelector('template').content;

        let templates = selector.querySelectorAll('template');
        for (let i = 0; i < templates.length; i++) {
            this.templates[templates[i].id] = templates[i];
            templates[i].remove();
        }

        return selector;
    }
}