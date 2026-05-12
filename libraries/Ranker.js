export default class Ranker {
    version = "1.0.1";

    async seo(data) {
        document.head.appendChild(document.createComment(` Ranker Tags SEO Start ${this.version} `));
        this.tags(data);
        document.head.appendChild(document.createComment(" Ranker Tags SEO End "));

        // Fix: app.js and app.css can be null — guard before calling .forEach()
        // Also: .match() returns an array; extract [0] to get the domain string
        if (data.app.js !== null) {
            const jsList = Array.isArray(data.app.js) ? data.app.js : [data.app.js];
            jsList.forEach(js => {
                // Strip pipe-separated integrity suffix before extracting domain
                const src = js.indexOf('|') > -1 ? js.split('|')[0] : js;
                const domainMatch = src.match(/^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n]+)/m);
                const domain = domainMatch ? domainMatch[0] : null;
                if (domain === null) return;

                // Fix: domain was an array, so querySelector comparison always failed
                const exists = document.querySelector(`link[href="${domain}"]`);
                // Fix: domain != '.' check was comparing array to string — always true
                // Now correctly checks that the domain isn't just the local path character
                if (exists === null && domain !== '.' && !domain.startsWith(window.location.origin)) {
                    this.createElement('link', { modify: "attr", args: [["rel", "dns-prefetch"], ["href", domain]] });
                    this.createElement('link', { modify: "attr", args: [["rel", "preconnect"], ["href", domain]] });
                }
            });
        }

        if (data.app.css !== null) {
            const cssList = Array.isArray(data.app.css) ? data.app.css : [data.app.css];
            cssList.forEach(css => {
                const domainMatch = css.match(/^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n]+)/m);
                const domain = domainMatch ? domainMatch[0] : null;
                if (domain === null) return;

                const exists = document.querySelector(`link[href="${domain}"]`);
                if (exists === null && domain !== '.' && !domain.startsWith(window.location.origin)) {
                    this.createElement('link', { modify: "attr", args: [["rel", "dns-prefetch"], ["href", domain]] });
                    this.createElement('link', { modify: "attr", args: [["rel", "preconnect"], ["href", domain]] });
                }
            });
        }
    }

    tags(data) {

        let isHomepage = (
            (window.location.pathname.length > 1 &&
                localStorage.getItem('papergrid.origin') !== `${window.location.origin}${window.location.pathname}`)
            || window.location.hash.length > 1
        ) ? false : true;

        const title = isHomepage
            ? data.app.templates.titles.home.replace('{{NAME}}', data.app.name)
            : data.app.templates.titles.other.replace('{{NAME}}', data.app.name).replace('{{PAGE_TITLE}}', data.meta.title);

        const image = (data.meta.image.indexOf("http") > -1)
            ? data.meta.image
            : `${window.location.origin}/${data.meta.image.replace('./', '')}`;

        const description = data.meta.description.length > 160
            ? `${data.meta.description.substring(0, 157)}...`
            : data.meta.description;

        // HTML tag setup
        this.createElement('html', { modify: 'attr', args: [["dir", "ltr"], ["lang", data.meta.language], ["prefix", "og: http://ogp.me/ns#"]] });

        // Title tag setup
        this.createElement("title", { modify: "innerText", args: title });

        // Link rel tag setup
        this.createElement('link', { modify: "attr", args: [["rel", "canonical"], ["href", window.location.href]] });
        this.createElement('link', { modify: "attr", args: [["rel", "home"], ["href", window.location.origin]] });
        this.createElement('link', { modify: "attr", args: [["rel", "shortlink"], ["href", window.location.origin]] });

        // Icon tag setup
        this.createElement('link', { modify: "attr", args: [["rel", "icon"], ["href", data.meta.icon]] });

        // Fix: missing `name` meta tags for standard description/keywords —
        // OG tags were present but the plain <meta name="description"> was never written,
        // meaning standard crawlers (non-OG) would see no description at all.
        this.createElement('meta', { modify: "attr", args: [["name", "description"], ["content", description]] });
        this.createElement('meta', { modify: "attr", args: [["name", "keywords"], ["content", data.meta.keywords]] });

        // Meta OG tag setup
        this.createElement('meta', { modify: "attr", args: [["property", "og:locale"], ["content", data.meta.language]] });
        this.createElement('meta', { modify: "attr", args: [["property", "og:type"], ["content", "website"]] });
        this.createElement('meta', { modify: "attr", args: [["property", "og:title"], ["content", title]] });
        this.createElement('meta', { modify: "attr", args: [["property", "og:description"], ["content", description]] });
        this.createElement('meta', { modify: "attr", args: [["property", "og:image"], ["content", image]] });
        this.createElement('meta', { modify: "attr", args: [["property", "og:site_name"], ["content", data.app.name]] });
        this.createElement('meta', { modify: "attr", args: [["property", "og:url"], ["content", window.location.href]] });

        // Meta Twitter tag setup
        // Fix: Twitter meta tags use `name`, not `property` — using `property` means
        // Twitter's crawler ignores them entirely
        this.createElement('meta', { modify: "attr", args: [["name", "twitter:card"], ["content", "summary"]] });
        this.createElement('meta', { modify: "attr", args: [["name", "twitter:title"], ["content", title]] });
        this.createElement('meta', { modify: "attr", args: [["name", "twitter:description"], ["content", description]] });
        this.createElement('meta', { modify: "attr", args: [["name", "twitter:image"], ["content", image]] });

        // Meta robots tag setup
        // Fix: "allow,index,follow" is not valid robots syntax — correct values are "index,follow"
        // "deny" and "no-index" are also invalid; correct are "noindex,nofollow"
        const robots = data.meta.index ? "index,follow" : "noindex,nofollow";
        this.createElement('meta', { modify: "attr", args: [["name", "robots"], ["content", robots]] });
    }

    schema() {
        // Fix: `return` before the schema code means it is unreachable dead code.
        // Removed the early return so schema actually runs.
        // TODO: populate schema fields from real page data
        let schema = {
            "@context": "https://schema.org",
            // Fix: "$schema" and "$id" are JSON Schema Draft keywords, not JSON-LD.
            // JSON-LD structured data uses "@context" and "@type" instead.
            "@type": "WebPage",
            "name": document.title,
            "url": window.location.href
        };

        const schemaTag = this.createElement('script', { modify: "attr", args: [["type", "application/ld+json"]] });
        schemaTag.textContent = JSON.stringify(schema, null, 2);
        // Fix: used textContent instead of innerHTML — innerHTML can mangle characters
        // like < and > inside JSON strings, corrupting the structured data
    }

    createElement(elm, att) {
        const header = document.head;
        let exists = false;
        let tag;

        if (elm === 'html' || elm === 'body' || elm === 'head') {
            tag = document.querySelector(elm);
            exists = true;
        } else {
            tag = document.createElement(elm);
        }

        switch (att.modify) {
            case "innerText":
                tag.innerText = att.args;
                break;

            case "attr":
                att.args.forEach(arg => {
                    tag.setAttribute(arg[0], arg[1]);
                });
                break;
        }

        if (!exists) {
            header.appendChild(tag);
        }

        return tag;
    }
}