# WebSRC — Elite Custom Stream Tools

> **Your broadcast. Your widgets. Your way.**

WebSRC is a browser-based streamer widget toolkit built on the [PaperGrid](https://www.rkstudio.com) framework. It lets streamers run fully customizable overlay widgets — clip queues, alerts, filters, and more — directly inside OBS, Streamlabs, or any browser source, with a real-time configuration panel accessible from a separate browser tab.

[![DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/TheLiveitup34/websrc)

---

## Table of Contents

- [Overview](#overview)
- [Supported Platforms](#supported-platforms)
- [Core Systems](#core-systems)
- [Development](#development)

---

## Overview

WebSRC runs as a standard web app served over Apache. When loaded inside a streaming tool (OBS, Streamlabs, XSplit, Meld), it switches into **widget mode** — stripping the preloader and UI chrome — and runs the overlay directly. When opened in a regular browser, it shows the **Modify panel**, a live settings interface that lets you configure every widget parameter without touching code.

---

## Supported Platforms

| Platform | Clips | Live Chat |
|---|---|---|
| Twitch | ✅ | ✅ (IRC & Streamerbot) |
| Kick | ✅ | ✅ (WebSocket & Streamerbot) |
| YouTube | ✅ | ✅ (Streamerbot) |
| TikTok | ✅ | ✅ (Tikfinity) |
| Instagram | ✅ | — |
| Facebook | ✅ | — |

---

## Core Systems

### Widgets
Widgets run as browser sources inside OBS, Streamlabs, or any streaming tool. Each widget is fully configurable without touching code — all settings are exposed through the Modify panel and take effect in real time.

### Modify Panel
A live configuration UI accessible from a regular browser tab while a widget runs in your streaming tool. Changes reflect immediately without reloading the widget.

### Relay
A lightweight P2P mesh built on PeerJS that handles real-time communication between the Modify panel and active widgets across browser tabs.

### Broadcast System
Cross-tab messaging within the same origin using the browser's BroadcastChannel API, used alongside Relay for local tab-to-tab communication.

### Routing
URL path-based routing on Apache, with automatic fallback to hash routing for non-Apache environments. The server environment is detected automatically — no configuration needed.

---

## Development

No build step is required. Serve the project root from any local HTTP server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Set the env meta tag in `index.html` to get accurate devtools filenames and stack traces during development:

```html
<meta name="papergrid-env" content="development">
```

Remove before deploying.

---

*Built on [PaperGrid](https://www.rkstudio.com) by RKStudio.*