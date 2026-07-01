export default class Ranker {
    version = "3.0.0";

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    // All head tags we manage — keyed so seo() is safe to call on SPA navigations
    #managed = new Map();

    // Cross-origin domains we've already written preconnect/dns-prefetch for
    #seenDomains = new Set();

    // CWV PerformanceObserver handles — stored so we can disconnect on demand
    #observers = [];

    // Whether we're in dev mode — read from the meta tag Core.js already uses
    #isDev = document.querySelector('meta[name="papergrid-env"]')
        ?.getAttribute('content') === 'development';

    // Whether seo() has run at least once — gates one-time-only setup
    #initialized = false;

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Main entry point — called by Controller.view() on every route.
     * Safe to call multiple times on SPA navigations; updates tags in place.
     *
     * @param {object} data - controller.defaults
     */
    async seo(data) {
        if (!this.#validate(data)) return;

        this.#tags(data);
        this.#prefetchAssets(data.app.js);
        this.#prefetchAssets(data.app.css);
        // this.#manifest(data.app.manifest);

        // One-time setup — only runs on the first seo() call per page load
        if (!this.#initialized) {
            this.#initialized = true;
            this.#measureCWV();
            this.#watchRouteChange(data);
        }

        // Dev-only audit — zero cost in production
        if (this.#isDev) {
            // Defer so the DOM has settled before we inspect it
            requestIdleCallback
                ? requestIdleCallback(() => this.#audit(data))
                : setTimeout(() => this.#audit(data), 300);
        }
    }

    /**
     * Inject JSON-LD structured data.
     * Called by Controller.view() after the page template is rendered.
     *
     * @param {object} data - controller.defaults (passed through from view())
     */
    schema(data = {}) {
        // Remove stale schema on SPA navigations
        document.querySelectorAll('script[type="application/ld+json"]')
            .forEach(el => el.remove());

        const schemas = [];

        // ── WebPage (always) ──────────────────────────────────────────────
        const isHomepage = this.#isHomepage();
        const title = this.#resolveTitle(data, isHomepage);
        const description = this.#truncateDescription(data.meta?.description ?? '');
        const image = this.#resolveImage(data.meta?.image ?? '');

        const webPage = {
            "@context": "https://schema.org",
            "@type": data?.schema?.type ?? "WebPage",
            "name": title,
            "url": this.#cleanUrl(window.location.href),
            ...(description && { "description": description }),
            ...(image && { "image": image }),
            "inLanguage": data.meta?.language ?? "en-US",
        };

        // BreadcrumbList auto-built from URL path
        const crumbs = this.#buildBreadcrumbs();
        if (crumbs) webPage["breadcrumb"] = crumbs;

        schemas.push(webPage);

        // ── SoftwareApplication (homepage only — describes WebSRC itself) ─
        // This unlocks the "App" rich result panel in Google Search which shows
        // the app name, rating, and platform directly on the SERP.
        if (isHomepage) {
            schemas.push({
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": data.app?.name ?? "WebSRC",
                "applicationCategory": "MultimediaApplication",
                "operatingSystem": "Web",
                "url": window.location.origin,
                "description": description,
                ...(image && { "image": image }),
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD"
                }
            });

            // ── Organization ──────────────────────────────────────────────
            // Helps Google associate the site with a named entity, improving
            // Knowledge Panel eligibility and brand search accuracy.
            schemas.push({
                "@context": "https://schema.org",
                "@type": "Organization",
                "name": data.app?.name ?? "WebSRC",
                "url": window.location.origin,
                ...(image && { "logo": image }),
                // sameAs links social profiles so Google cross-references them
                // Add your actual social URLs here:
                // "sameAs": [
                //     "https://twitter.com/websrc",
                //     "https://www.twitch.tv/websrc"
                // ]
            });
        }

        // ── Widget page (e.g. /widget/watch) ──────────────────────────────
        // Detected from the URL — Widget controller routes to /:controller/:widget
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        if (pathParts[0]?.toLowerCase() === 'widget' && pathParts[1]) {
            schemas.push({
                "@context": "https://schema.org",
                "@type": "WebApplication",
                "name": `${pathParts[1].charAt(0).toUpperCase() + pathParts[1].slice(1)} Widget`,
                "applicationCategory": "MultimediaApplication",
                "url": window.location.href,
                "isPartOf": {
                    "@type": "WebSite",
                    "name": data.app?.name ?? "WebSRC",
                    "url": window.location.origin
                }
            });
        }

        // Emit all schemas — one <script> block per type so Google can parse them
        // independently. textContent avoids innerHTML mangling < > & in JSON strings.
        schemas.forEach(s => {
            const tag = document.createElement('script');
            tag.type = "application/ld+json";
            tag.textContent = JSON.stringify(s, null, 2);
            document.head.appendChild(tag);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private — tags
    // ─────────────────────────────────────────────────────────────────────────

    #tags(data) {
        const isHomepage = this.#isHomepage();
        const title = this.#resolveTitle(data, isHomepage);
        const description = this.#truncateDescription(data.meta?.description ?? '');
        const image = this.#resolveImage(data.meta?.image ?? '');
        const robots = data.meta?.index === false ? "noindex,nofollow" : "index,follow";

        // ── <html> attributes ─────────────────────────────────────────────
        this.#setAttr(document.documentElement, {
            dir: "ltr",
            lang: data.meta?.language ?? "en",
            prefix: "og: http://ogp.me/ns#"
        });

        // ── Foundational — charset and viewport (index.html already has
        //    these but Ranker manages them idempotently for any page) ───────
        this.#findOrCreate('meta', 'charset', { charset: 'UTF-8' });
        this.#findOrCreate('meta', 'viewport', { name: 'viewport', content: 'width=device-width, initial-scale=1' });

        // ── Title ─────────────────────────────────────────────────────────
        this.#findOrCreate('title', '__title__', {}, el => { el.innerText = title; });

        // ── Canonical — cleaned URL strips tracking params ─────────────────
        // utm_*, fbclid, gclid etc. cause duplicate-content issues if indexed
        this.#findOrCreate('link', 'canonical', { rel: 'canonical', href: this.#cleanUrl(window.location.href) });
        this.#findOrCreate('link', 'home', { rel: 'home', href: window.location.origin });
        this.#findOrCreate('link', 'shortlink', { rel: 'shortlink', href: window.location.origin });

        // ── Favicon ───────────────────────────────────────────────────────
        if (data.meta?.icon) {
            this.#findOrCreate('link', 'icon', { rel: 'icon', href: data.meta.icon });
        }

        // ── Theme color — pulled from manifest.json's theme_color ─────────
        // manifest.json has "#3367D6" — exposed here for mobile browser chrome
        const themeColor = data.meta?.themeColor ?? '#3367D6';
        this.#findOrCreate('meta', 'theme-color', { name: 'theme-color', content: themeColor });

        // ── Standard meta ─────────────────────────────────────────────────
        this.#findOrCreate('meta', 'description', { name: 'description', content: description });
        this.#findOrCreate('meta', 'keywords', { name: 'keywords', content: data.meta?.keywords ?? '' });
        this.#findOrCreate('meta', 'robots', { name: 'robots', content: robots });

        // ── Author / generator ────────────────────────────────────────────
        // manifest.json identifies "RKStudio" as author
        this.#findOrCreate('meta', 'author', { name: 'author', content: 'RKStudio' });
        this.#findOrCreate('meta', 'generator', { name: 'generator', content: 'PaperGrid' });

        // ── Open Graph ────────────────────────────────────────────────────
        this.#findOrCreate('meta', 'og:locale', { property: 'og:locale', content: data.meta?.language ?? 'en_US' });
        this.#findOrCreate('meta', 'og:type', { property: 'og:type', content: 'website' });
        this.#findOrCreate('meta', 'og:title', { property: 'og:title', content: title });
        this.#findOrCreate('meta', 'og:description', { property: 'og:description', content: description });
        this.#findOrCreate('meta', 'og:image', { property: 'og:image', content: image });
        this.#findOrCreate('meta', 'og:site_name', { property: 'og:site_name', content: data.app?.name ?? '' });
        this.#findOrCreate('meta', 'og:url', { property: 'og:url', content: this.#cleanUrl(window.location.href) });

        // Image dimensions avoid a scrape-delay on first FB/LinkedIn unfurl
        if (data.meta?.imageWidth) this.#findOrCreate('meta', 'og:image:width', { property: 'og:image:width', content: String(data.meta.imageWidth) });
        if (data.meta?.imageHeight) this.#findOrCreate('meta', 'og:image:height', { property: 'og:image:height', content: String(data.meta.imageHeight) });

        // ── Twitter / X ───────────────────────────────────────────────────
        // Twitter requires `name` not `property` — `property` is silently ignored
        this.#findOrCreate('meta', 'twitter:card', { name: 'twitter:card', content: 'summary_large_image' });
        this.#findOrCreate('meta', 'twitter:title', { name: 'twitter:title', content: title });
        this.#findOrCreate('meta', 'twitter:description', { name: 'twitter:description', content: description });
        this.#findOrCreate('meta', 'twitter:image', { name: 'twitter:image', content: image });
        if (data.meta?.twitterSite) this.#findOrCreate('meta', 'twitter:site', { name: 'twitter:site', content: data.meta.twitterSite });
        if (data.meta?.twitterCreator) this.#findOrCreate('meta', 'twitter:creator', { name: 'twitter:creator', content: data.meta.twitterCreator });

        // ── hreflang alternates ───────────────────────────────────────────
        if (Array.isArray(data.meta?.alternates)) {
            data.meta.alternates.forEach(({ lang, href }) => {
                this.#findOrCreate('link', `hreflang:${lang}`, { rel: 'alternate', hreflang: lang, href });
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private — resource hints
    // ─────────────────────────────────────────────────────────────────────────

    #prefetchAssets(assets) {
        if (!assets) return;
        const list = Array.isArray(assets) ? assets : [assets];

        list.forEach(asset => {
            if (typeof asset !== 'string') return;

            // Strip pipe-separated integrity hash suffix
            const src = asset.indexOf('|') > -1 ? asset.split('|')[0] : asset;

            let origin;
            try {
                origin = new URL(src, window.location.href).origin;
            } catch {
                return;
            }

            // Skip same-origin — preconnect only helps cross-origin
            if (origin === window.location.origin) return;
            if (this.#seenDomains.has(origin)) return;
            this.#seenDomains.add(origin);

            this.#findOrCreate('link', `dns-prefetch:${origin}`, { rel: 'dns-prefetch', href: origin });

            // crossorigin="" is required for CORS domains (fonts, CDN scripts)
            // Without it the browser won't pre-negotiate TLS+ALPN for CORS fetches
            const pc = this.#findOrCreate('link', `preconnect:${origin}`, { rel: 'preconnect', href: origin });
            pc.setAttribute('crossorigin', '');
        });
    }

    #manifest(href) {
        // manifest.json is defined in Controller.defaults — wire it up automatically
        const src = href ?? './manifest.json';
        this.#findOrCreate('link', 'manifest', { rel: 'manifest', href: src });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private — Core Web Vitals instrumentation
    // ─────────────────────────────────────────────────────────────────────────

    // Thresholds from https://web.dev/vitals/ (Google's "Good" boundaries)
    static #CWV_THRESHOLDS = {
        LCP: { good: 2500, poor: 4000 },  // ms
        INP: { good: 200, poor: 500 },  // ms
        CLS: { good: 0.10, poor: 0.25 },  // unitless score
    };

    #measureCWV() {
        if (!('PerformanceObserver' in window)) return;

        const report = (metric, value, rating) => {
            // In dev mode, surface to the console so it's easy to act on
            if (this.#isDev) {
                const emoji = rating === 'good' ? '✅' : rating === 'poor' ? '🔴' : '🟡';
                console[rating === 'poor' ? 'warn' : 'log'](
                    `[Ranker CWV] ${emoji} ${metric}: ${typeof value === 'number' ? value.toFixed(2) : value} (${rating})`
                );
            }

            // Fire a custom event so any telemetry/analytics layer can consume it
            // without coupling this library to a specific analytics vendor
            window.dispatchEvent(new CustomEvent('ranker:cwv', {
                detail: { metric, value, rating, url: window.location.href }
            }));
        };

        const rate = (metric, value) => {
            const t = Ranker.#CWV_THRESHOLDS[metric];
            if (!t) return 'unknown';
            if (value <= t.good) return 'good';
            if (value <= t.poor) return 'needs-improvement';
            return 'poor';
        };

        // LCP — Largest Contentful Paint
        try {
            const lcpObs = new PerformanceObserver(list => {
                const entries = list.getEntries();
                const last = entries[entries.length - 1];
                const value = last.startTime;
                report('LCP', value, rate('LCP', value));
            });
            lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
            this.#observers.push(lcpObs);
        } catch { }

        // INP — Interaction to Next Paint (replaces FID in 2024)
        try {
            const inpObs = new PerformanceObserver(list => {
                list.getEntries().forEach(entry => {
                    if (entry.interactionId) {
                        const value = entry.duration;
                        report('INP', value, rate('INP', value));
                    }
                });
            });
            inpObs.observe({ type: 'event', buffered: true, durationThreshold: 40 });
            this.#observers.push(inpObs);
        } catch { }

        // CLS — Cumulative Layout Shift
        try {
            let clsValue = 0;
            let clsEntries = [];
            const clsObs = new PerformanceObserver(list => {
                list.getEntries().forEach(entry => {
                    if (!entry.hadRecentInput) {
                        clsEntries.push(entry);
                        clsValue += entry.value;
                    }
                });
                report('CLS', clsValue, rate('CLS', clsValue));
            });
            clsObs.observe({ type: 'layout-shift', buffered: true });
            this.#observers.push(clsObs);
        } catch { }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private — SPA route-change watcher
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Subscribes to the Core.js event bus so Ranker auto-updates tags on
     * every SPA navigation without being wired up manually in each controller.
     *
     * Core emits `websrc:ready` after every route render — Ranker just
     * listens and refreshes the canonical + OG url + schema to match.
     */
    #watchRouteChange(data) {
        window.addEventListener('websrc:ready', () => {
            // Only the URL-sensitive tags need refreshing on navigation
            // (title, description etc. are re-set by Controller calling seo() again)
            const cleanHref = this.#cleanUrl(window.location.href);
            this.#findOrCreate('link', 'canonical', { rel: 'canonical', href: cleanHref });
            this.#findOrCreate('meta', 'og:url', { property: 'og:url', content: cleanHref });

            // Re-emit schema for the new route using the same data reference
            this.schema(data);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private — dev audit
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Scores the current state of SEO tags and logs actionable warnings.
     * Only runs in dev (meta[name="papergrid-env"] content="development").
     * Zero runtime cost in production.
     */
    #audit(data) {
        const issues = [];
        const warn = (msg) => issues.push(msg);

        const title = document.title;
        const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
        const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '';
        const robots = document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';

        // Title
        if (!title) warn('⚠️  <title> is empty');
        if (title.length > 60) warn(`⚠️  <title> is ${title.length} chars — Google typically truncates at 60`);
        if (title.length < 10) warn(`⚠️  <title> is very short (${title.length} chars)`);

        // Description
        if (!description) warn('⚠️  <meta name="description"> is empty');
        if (description.length > 160) warn(`⚠️  description is ${description.length} chars — truncated to 160 by Google`);
        if (description.length < 50) warn(`⚠️  description is very short (${description.length} chars) — aim for 120–160`);

        // Canonical
        if (!canonical) warn('⚠️  No canonical URL set');
        if (canonical && canonical.includes('?')) warn('⚠️  Canonical URL contains query string — consider stripping tracking params');
        if (canonical && canonical.includes('#')) warn('⚠️  Canonical URL contains a hash fragment — should point to the clean URL');

        // Image
        if (!ogImage) warn('⚠️  No og:image set — social shares will have no preview image');
        if (ogImage && !ogImage.startsWith('http')) warn('⚠️  og:image is a relative URL — must be absolute for social crawlers');
        if (!data.meta?.imageWidth || !data.meta?.imageHeight)
            warn('⚠️  og:image:width / og:image:height missing — Facebook/LinkedIn delay their first unfurl without them');

        // Schema
        const schemas = document.querySelectorAll('script[type="application/ld+json"]');
        if (schemas.length === 0) warn('⚠️  No JSON-LD schema found — call ranker.schema() after view renders');

        // Robots
        if (robots.includes('noindex') && data.meta?.index !== false)
            warn('⚠️  Page is noindexed but data.meta.index is not false — check your defaults');

        // Manifest
        if (!document.querySelector('link[rel="manifest"]'))
            warn('⚠️  No <link rel="manifest"> — PWA install prompt will not work');

        // Theme color
        if (!document.querySelector('meta[name="theme-color"]'))
            warn('⚠️  No <meta name="theme-color"> — mobile browser chrome won\'t be themed');

        // Twitter card
        const twitterCard = document.querySelector('meta[name="twitter:card"]');
        if (!twitterCard) warn('⚠️  No twitter:card meta tag');

        // Sitemap check (one HEAD request, cached for the session)
        if (!Ranker._sitemapChecked) {
            Ranker._sitemapChecked = true;
            fetch(`${window.location.origin}/sitemap.xml`, { method: 'HEAD' })
                .then(r => { if (!r.ok) console.warn('[Ranker Audit] ⚠️  /sitemap.xml not found (HTTP ' + r.status + ')'); })
                .catch(() => console.warn('[Ranker Audit] ⚠️  /sitemap.xml unreachable'));

            fetch(`${window.location.origin}/robots.txt`, { method: 'HEAD' })
                .then(r => { if (!r.ok) console.warn('[Ranker Audit] ⚠️  /robots.txt not found (HTTP ' + r.status + ')'); })
                .catch(() => console.warn('[Ranker Audit] ⚠️  /robots.txt unreachable'));
        }

        // Report
        if (issues.length === 0) {
            console.log('%c[Ranker Audit] ✅ All SEO checks passed', 'color: #2fa36a; font-weight: bold');
        } else {
            console.groupCollapsed(`%c[Ranker Audit] ${issues.length} issue(s) found on ${window.location.pathname}`, 'color: #e85d3b; font-weight: bold');
            issues.forEach(i => console.warn(i));
            console.groupEnd();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private — helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Find-or-create a managed head element.
     * Second call with same key updates attributes in-place — no duplicates.
     */
    #findOrCreate(tag, key, attrs, extra) {
        let el = this.#managed.get(key);

        if (!el) {
            if (tag === 'title') {
                // Reuse existing <title> if present (index.html might have one)
                el = document.querySelector('title') ?? document.createElement('title');
            } else {
                el = document.createElement(tag);
            }
            this.#managed.set(key, el);
            document.head.appendChild(el);
        }

        this.#setAttr(el, attrs);
        if (extra) extra(el);
        return el;
    }

    #setAttr(el, attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            el.setAttribute(k, v);
        }
    }

    /** Resolve image path to an absolute URL — safe startsWith, not indexOf */
    #resolveImage(image) {
        if (!image) return '';
        if (image.startsWith('http://') || image.startsWith('https://')) return image;
        return `${window.location.origin}/${image.replace(/^\.\//, '')}`;
    }

    /**
     * Strip known tracking query params so canonical URLs are clean.
     * Removes utm_*, fbclid, gclid, ref, and hash fragments.
     */
    #cleanUrl(href) {
        try {
            const url = new URL(href);
            const STRIP = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                'utm_term', 'fbclid', 'gclid', 'ref', 'mc_cid', 'mc_eid'];
            STRIP.forEach(p => url.searchParams.delete(p));
            url.hash = '';
            return url.toString();
        } catch {
            return href;
        }
    }

    /**
     * Homepage detection — derived from URL only, no localStorage coupling.
     * Also handles hash-routing (PaperGrid non-Apache mode uses # URLs).
     */
    #isHomepage() {
        const isApache = localStorage.getItem('papergrid.apache') === 'true';

        if (isApache) {
            return window.location.pathname === '/' || window.location.pathname === '';
        } else {
            // Hash-routing: homepage is no hash or just '#'
            const hash = window.location.hash;
            return hash === '' || hash === '#' || hash === '#!';
        }
    }

    /** Resolve the correct title string for this route */
    #resolveTitle(data, isHomepage) {
        return isHomepage
            ? (data.app?.templates?.titles?.home ?? '{{NAME}}')
                .replace('{{NAME}}', data.app?.name ?? '')
            : (data.app?.templates?.titles?.other ?? '{{PAGE_TITLE}} - {{NAME}}')
                .replace('{{NAME}}', data.app?.name ?? '')
                .replace('{{PAGE_TITLE}}', data.meta?.title ?? '');
    }

    /** Truncate description at a word boundary — never mid-word */
    #truncateDescription(raw) {
        if (!raw) return '';
        if (raw.length <= 160) return raw;
        const cut = raw.lastIndexOf(' ', 157);
        return (cut > 0 ? raw.substring(0, cut) : raw.substring(0, 157)) + '...';
    }

    /**
     * Auto-build a BreadcrumbList from the current URL path.
     * Works for both Apache path routing and hash/colon routing.
     * e.g. /widget/watch → Home > Widget > Watch
     */
    #buildBreadcrumbs() {
        const isApache = localStorage.getItem('papergrid.apache') === 'true';
        let parts;

        if (isApache) {
            parts = window.location.pathname.split('/').filter(Boolean);
        } else {
            // Hash routing uses ':' as separator (see Controller.#modifyLinks)
            const hash = window.location.hash.replace(/^#/, '');
            parts = hash ? hash.split(':').filter(Boolean) : [];
        }

        if (parts.length === 0) return null;

        const humanize = str => str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        const items = [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": window.location.origin },
            ...parts.map((part, i) => ({
                "@type": "ListItem",
                "position": i + 2,
                "name": humanize(part),
                "item": isApache
                    ? `${window.location.origin}/${parts.slice(0, i + 1).join('/')}`
                    : `${window.location.origin}/#${parts.slice(0, i + 1).join(':')}`
            }))
        ];

        return { "@type": "BreadcrumbList", "itemListElement": items };
    }

    /** Input guard — warns clearly if data is malformed */
    #validate(data) {
        if (!data || typeof data !== 'object') {
            console.warn('[Ranker] seo() requires a data object.');
            return false;
        }
        if (!data.app || typeof data.app !== 'object') { console.warn('[Ranker] data.app is missing.'); return false; }
        if (!data.meta || typeof data.meta !== 'object') { console.warn('[Ranker] data.meta is missing.'); return false; }
        return true;
    }
}