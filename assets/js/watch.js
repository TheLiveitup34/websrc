let player;
let syncPlaybutton = false;
let errorKillState;
let version = "WATCH - v0.9.0";
document.querySelector('#statusContainer .version').textContent = version;
const ws = new WebSRC({ scripts: ['playback'], streamerbot: { actions: ["1ea3742d-c90e-422b-bbed-7e49b86b9b93"], disableOnTwitchChat: true }, relay: { autoConnect: true } });
ws.get("_mod_filter_header", null, "string", { uiType: "header", label: "Troll filter", desc: "Block clips based on keywords in their title or description.", category: "mod", urlSkip: true });
ws.get("_playback_platforms_header", null, "string", { uiType: "header", label: "Allowed platforms", desc: "Disable collection of videos from specific platforms.", category: "playback", urlSkip: true });
const state = {
    enabled: true,
    autoPlay: false,
    filter: !ws.get("trollfilter", false, "boolean", {
        label: "Troll filter", desc: "Enable filtering of videos based on keywords in their title or description. This can help block out unwanted videos like rickrolls or gnomes.", category: "mod"
    }),
    filterKeywords: ["rickroll", "rick roll", "rick astley", "never gonna give you up", "never gonna let you down", "never gonna run around and desert you", "never gonna make you cry", "never gonna say goodbye", "never gonna tell a lie and hurt you", "rickrolled", "rick-rolled", "gnome", ...ws.get("filterkeywords", "", "string", { label: "Filter Keywords", desc: "Comma-separated list of keywords to filter out.", category: "mod", placeholder: "Keyword1, keyword2..."}).split(',').map(k => k.trim()).filter(k => k.length > 0)],
    filterThreshold: ws.get("trollthreashold", 70, "float", {
       uiType: "range", label: "Troll filter threshold", default: 70, value: 70, desc: "How accurate the troll filter should be in detecting unwanted content.", category: "mod"
    }) / 100,
    playbackTypes: {
        youtube: !ws.get("youtube", false, "boolean", {
            uiType: "toggle", label: "YouTube", desc: "Disallow playback of YouTube videos and Youtube Shorts.", category: "playback"
        }),
        twitch: !ws.get("twitchclips", false, "boolean", {
            uiType: "toggle", label: "Twitch", desc: "Disallow playback of Twitch clips.", category: "playback"
        }),
        tiktok: !ws.get("tiktokclips", false, "boolean", {
            uiType: "toggle", label: "TikTok", desc: "Disallow playback of TikTok clips.", category: "playback"
        }),
        kick: !ws.get("kickclips", false, "boolean", {
            uiType: "toggle", label: "Kick", desc: "Disallow playback of Kick clips.", category: "playback"
        }),
        instagram: !ws.get("instagram", false, "boolean", {
            uiType: "toggle", label: "Instagram", desc: "Disallow playback of Instagram reels.", category: "playback"
        }),
        facebook: !ws.get("facebook", false, "boolean", {
            uiType: "toggle", label: "Facebook", desc: "Disallow playback of Facebook reels.", category: "playback"
        })
    },
    volumes: {
        youtube: 100,
        twitch: 100,
        tiktok: 100,
        kick: 100,
        instagram: 100,
        facebook: 100
    },
    currentVideo: null,
    playbackQueue: [],
    historyQueue: [],
    lastDuration: 0
}

ws.get("_mod_raid_header", null, "string", { uiType: "header", label: "Raid/Shoutout Modifiers", desc: "Settings related to raid and shoutout modifiers.", category: "mod", urlSkip: true });
state.isRaid = false;
state.isRaidTimeout = null;
state.isRaidUser = null;
state.isRaidTimeoutDuration = ws.get("raidTimeoutDuration", 3, "number", { label: "Raid/Shoutout Timeout Duration", desc: "Duration of the raid/shoutout event/command will be ignored per person in seconds.", category: "mod" }) * 1000;

if (localStorage.getItem('websrc.watchState')) {
    Object.assign(state, JSON.parse(localStorage.getItem('websrc.watchState')));
    if (state.currentVideo !== null) {
        state.currentVideo.time = state.lastDuration;
        // play the video that was playing before the reload/close if there was one, starting at the time it was at before
        setTimeout(() => {
            startPlayback(true);
        }, 2000);
    }
}

window.addEventListener('beforeunload', () => {
    ws.call('streamDeck.playPauseUpdateState', { state: false }, ['streamdeck']);
    state.lastDuration = player ? player.getCurrentTime() : 0;
    localStorage.setItem('websrc.watchState', JSON.stringify(state));
});


console.log("WebSRC initialized, waiting for connection...");
ws.on("ready", () => {
    ws.call('streamDeck.playPauseUpdateState', { state: false }, ['streamdeck']);
    player = new Playback(document.querySelector('.video-container'), {
        facebook_app_id: "1506106630423968",
        volumes: state.volumes
    });
    player.on('ended', async () => {
        console.log("Video ended:", state.currentVideo);
        await new Promise(r => setTimeout(r, ws.get("endDelay", 1, "Number") * 1000)); // slight delay to ensure the end event fully processes before starting the next video
        state.currentVideo = null;
    });
    player.on('ready', async () => {
        console.log("Player is ready.");
        syncPlaybutton = false;
        errorKillState = setTimeout(() => {
            player.stop();
        }, 5000);
        await new Promise(r => setTimeout(r, 200)); // slight delay to ensure everything is fully ready
        if (player.isPlaying() == false) {
            player.play();
        }
    });
    player.on('play', () => {
        clearTimeout(errorKillState);
        if (syncPlaybutton == false) {
            ws.call('streamDeck.playPauseUpdateState', { state: true }, ['streamdeck']);
            syncPlaybutton = true;
            if (state.currentVideo.time) {
                player.seekTo(Number(state.currentVideo.time));
            }
        }

    });
    ws.postSchemaToParent({
        meta: { app: "Watch Overlay", version: "1.0.0" },
        features: { streamerbot: true, streamdeck: true },
        nav: [
            {
                group: "SETUP", items: [
                    { id: "start", label: "Get started", icon: "sparkle" },
                    { id: "integrations", label: "Connections", icon: "network" },
                    { id: 'communication', label: "Communication", icon: "transfer" }
                ]
            },
            {
                group: "APP SETTINGS", items: [
                    { id: "cmd", label: "Chat commands", icon: "chat" },
                    { id: "monetize", label: "Monetize", icon: "monetize" },
                    { id: "playback", label: "Playback", icon: "play" },
                    { id: "mod", label: "Moderation", icon: "shield" },
                ]
            }
        ]
    });
});


// ── Moderation / Who can use it ──────────────────────────────────────────────
ws.get("_mod_role_header", null, "string", { uiType: "header", label: "Role Lock", desc: "Limits viewer commands based on role.", category: "mod", urlSkip: true });
let roles = ["user", "subscriber", "vip", "moderator", "broadcaster"];
roles = roles.slice(roles.indexOf(ws.get("role", "user", "string", {
    label: "Minimum role", category: "mod",
    desc: "Minimum role required to run viewer commands.",
    uiType: "radio",
    options: [
        { value: "user", label: "Everyone", sub: "Any chatter" },
        { value: "subscriber", label: "Subscribers", sub: "Subs & up" },
        { value: "vip", label: "Vips", sub: "Vips & up" },
        { value: "moderator", label: "Moderators", sub: "Mods & up" },
        { value: "broadcaster", label: "Just me", sub: "Broadcaster only" }
    ]
})));
const prefix = ws.get("prefix", "!", "string", {
    label: "Command prefix",
    desc: "The character before every command. Almost always !",
    category: "cmd",
    uiType: "text",
    placeholder: "!"
});

ws.command({
    command: ws.get("watch", "watch", "string", {
        label: "Watch", prefix: "!", placeholder: "watch",
        desc: "Use !watch [link] or just !watch to play the next video in the queue. ",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: roles, roleModifiable: true
}, async data => {
    if (!state.enabled) {
        return;
    }
    if (player.isPlaying()) {
        return;
    }
    await new Promise(async resolve => {
        if (data.args.length > 0) {
            while (state.playbackQueue.length == 0) {
                await new Promise(r => setTimeout(r, 100));
            }
        }
        resolve();
    });

    startPlayback();
});
ws.command({
    command: ws.get('link', 'link', 'string', {
        label: "Link", prefix: "!", placeholder: "link", desc: "Use !link to get the link of the currently playing video. ",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: roles, roleModifiable: true
}, data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring link command.");
        return;
    }
    // return link of the currently playing video
    console.log("Current video link:", state.currentVideo.origin);
});
ws.command({
    command: ws.get('so', 'so', 'string', {
        label: "Shoutout", prefix: "!", placeholder: "so", desc: "Use !so [username] to play a random clip from twitch or kick user's channel from the perspective platform.",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"], argsRequired: true
}, async data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring shoutout command.");
        return;
    }

    if (data.args.length === 0) {
        console.log("No username provided for shoutout command.");
        return;
    }
    console.log("Received shoutout command with data:", data);
    if (data.args[0].startsWith('@')) {
        data.args[0] = data.args[0].replace('@', '');
    }
    channelAdvertisement(data.platform, data.args[0]);
});

ws.command({
    command: ws.get('play', 'play', 'string', {
        label: "Play command", desc: "Resumes a paused clip.",
        prefix: "!", placeholder: "play",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"]
}, data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring play command.");
        return;
    }
    console.log("Received play command with data:", data);
    player.play();
});

ws.command({
    command: ws.get('pause', 'pause', 'string', {
        label: "Pause command", desc: "Pauses the currently playing clip.",
        prefix: "!", placeholder: "pause",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"]
}, data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring pause command.");
        return;
    }
    console.log("Received pause command with data:", data);
    player.pause();
});

ws.command({
    command: ws.get('stop', 'stop', 'string', {
        label: "Stop command", desc: "Stops the current clip and clears the player.",
        prefix: "!", placeholder: "stop",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"]
}, data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring stop command.");
        return;
    }
    console.log("Received stop command with data:", data);
    player.stop();
    state.currentVideo = null;
});




ws.command({
    command: ws.get('skip', 'skip', 'string', {
        label: "Skip command", desc: "Skips the current clip and plays the next one in the queue.",
        prefix: "!", placeholder: "skip",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"]
}, data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring skip command.");
        return;
    }
    player.stop();
    state.currentVideo = null;
    console.log("Received skip command with data:", data);
    if (state.playbackQueue.length === 0) {
        console.log("Playback queue is empty. No video to skip to.");
        return;
    }
    startPlayback();

});

ws.command({
    command: ws.get('replay', 'replay', 'string', {
        label: "Replay command", desc: "Replays the current or most recently played clip.",
        prefix: "!", placeholder: "replay",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"]
}, data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring replay command.");
        return;
    }
    console.log("Received replay command with data:", data);
    let replayResult = player.replay();
    if (replayResult == true) {
        state.currentVideo = state.historyQueue[state.historyQueue.length - 1] || state.currentVideo; // replay the current video or the last video if current is null
        ws.call('streamDeck.playPauseUpdateState', { state: true }, ['streamdeck']);
    } else {
        if (state.historyQueue.length > 0 || state.currentVideo != null) {
            state.playbackQueue.unshift(state.historyQueue[state.historyQueue.length - 1] || state.currentVideo); // if replay failed, push the current video back to the front of the queue
            state.currentVideo = null;
            startPlayback();
        }
    }
});

ws.command({
    command: ws.get('autoplay', 'autoplay', 'string', {
        label: "Autoplay toggle command", desc: "Toggles autoplay on or off from chat.",
        prefix: "!", placeholder: "autoplay",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"]
}, async data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring autoplay command.");
        return;
    }
    console.log("Received autoplay command with data:", data);
    state.autoPlay = !state.autoPlay;
    while (state.autoPlay) {
        if (!player.isPlaying() && state.playbackQueue.length > 0 && state.currentVideo == null) {
            startPlayback();
        }
        await new Promise(r => setTimeout(r, 1000));
    }
});

ws.command({
    command: ws.get('enable', 'enablewatch', 'string', {
        label: "Enable command", desc: "Re-enables the overlay after it has been disabled.",
        prefix: "!", placeholder: "enablewatch",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"]
}, data => {
    console.log("Received enable command with data:", data);
    state.enabled = true;
});

ws.command({
    command: ws.get('disable', 'disablewatch', 'string', {
        label: "Disable command", desc: "Disables the overlay so no commands are processed.",
        prefix: "!", placeholder: "disablewatch",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"]
}, data => {
    console.log("Received disable command with data:", data);
    state.enabled = false;
});

ws.command({
    command: ws.get('reload', 'reloadwatch', 'string', {
        label: "Reload command", desc: "Reloads the browser source — useful if the overlay gets stuck.",
        prefix: "!", placeholder: "reloadwatch",
        sanitize: "alphanumeric", category: "cmd"
    }), prefix: prefix, allowedRoles: ["moderator", "broadcaster"]
}, data => {
    console.log("Received reload command with data:", data);
    // check if in obs browser source and inject a meta refresh to reload the page
    if (navigator.userAgent.toLowerCase().indexOf('obs') > -1 || navigator.userAgent.toLowerCase().indexOf('xsplit') > -1 || navigator.userAgent.toLowerCase().indexOf('meld') > -1) {
        console.log("Detected OBS/XSplit/Meld browser source. Reloading page.");
        const meta = document.createElement('meta');
        meta.httpEquiv = "refresh";
        meta.content = "0";
        document.head.appendChild(meta);
    } else {
        window.location.reload(true);
    }
});


/*
*
* Stream Deck integration
*
*/
ws.on('streamdeck.streamDeck.playPause', async data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring Stream Deck play/pause event.");
        await new Promise(r => setTimeout(r, 200)); // slight delay to ensure any ongoing state changes have settled
        ws.call('streamDeck.playPauseUpdateState', { state: false }, ['streamdeck']);
        return;
    }

    if (state.playbackQueue.length === 0 && state.currentVideo == null) {
        await new Promise(r => setTimeout(r, 200)); // slight delay to ensure any ongoing state changes have settled
        ws.call('streamDeck.playPauseUpdateState', { state: false }, ['streamdeck']);
        console.log("Play/Pause button pressed but no video is in the queue. Ignoring play/pause event.");
        return;
    }

    if (data.state && state.currentVideo == null) {
        startPlayback();
        return;
    }
    if (data.state == false && state.currentVideo == null) {
        await new Promise(r => setTimeout(r, 200)); // slight delay to ensure any ongoing state changes have settled
        ws.call('streamDeck.playPauseUpdateState', { state: false }, ['streamdeck']);
        return;
    }
    if (data.state) {
        player.play();
    } else {
        player.pause();
    }
});

ws.on('streamdeck.streamDeck.stop', async data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring Stream Deck stop event.");
        return;
    }
    player.stop();
    state.currentVideo = null;
    await new Promise(r => setTimeout(r, 200));
    ws.call('streamDeck.playPauseUpdateState', { state: false }, ['streamdeck']);
});

ws.on('streamdeck.streamDeck.skip', async data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring Stream Deck skip event.");
        return;
    }
    player.stop();
    state.currentVideo = null;
    await new Promise(r => setTimeout(r, 200));
    ws.call('streamDeck.playPauseUpdateState', { state: false }, ['streamdeck']);
    startPlayback();
});

ws.on('streamdeck.streamDeck.replay', async data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring Stream Deck replay event.");
        return;
    }
    if (state.historyQueue.length === 0 && state.currentVideo == null) {
        await new Promise(r => setTimeout(r, 200)); // slight delay to ensure any ongoing state changes have settled
        ws.call('streamDeck.playPauseUpdateState', { state: false }, ['streamdeck']);
        console.log("Replay button pressed but no video is in the queue. Ignoring replay event.");
        return;
    }

    let replayResult = player.replay();
    if (replayResult == true) {
        state.currentVideo = state.historyQueue[state.historyQueue.length - 1] || state.currentVideo; // replay the current video or the last video if current is null
        ws.call('streamDeck.playPauseUpdateState', { state: true }, ['streamdeck']);
    } else {
        if (state.historyQueue.length > 0 || state.currentVideo != null) {
            state.playbackQueue.unshift(state.historyQueue[state.historyQueue.length - 1] || state.currentVideo); // if replay failed, push the current video back to the front of the queue
            state.currentVideo = null;
            startPlayback();
        }
    }

});

ws.on('streamdeck.streamDeck.seekBackward', async data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring Stream Deck seek backward event.");
        return;
    }
    if (state.currentVideo == null) {
        console.log("Seek backward button pressed but no video is currently playing. Ignoring seek backward event.");
        return;
    }
    player.seek(data.incrementBy * -1);
});

ws.on('streamdeck.streamDeck.seekForward', async data => {
    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring Stream Deck seek forward event.");
        return;
    }
    if (state.currentVideo == null) {
        console.log("Seek forward button pressed but no video is currently playing. Ignoring seek forward event.");
        return;
    }
    player.seek(data.incrementBy);
});


ws.link(async data => {

    if (!state.enabled) {
        console.log("Watch module is currently disabled. Ignoring link command.");
        return;
    }
    if (roles.indexOf(data.role) === -1) {
        console.log(`User role "${data.role}" is not allowed to use the link command. Ignoring.`);
        return;
    }
    if (!data.urls || data.urls.length === 0) {
        console.log("No URLs provided in the link command.");
        return;
    }
    let link = data.urls[0];

    // Define regex patterns for supported platforms
    let youtubeUrlPattern = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    let twitchClipPattern = /(https?:\/\/)?(www\.)?(clips\.twitch\.tv|twitch\.tv)\/.+$/;
    let tiktokPattern = /(https?:\/\/)?(www\.)?(tiktok\.com)\/.+$/;
    let kickPattern = /(https?:\/\/)?(www\.)?(kick\.com)\/.+$/;
    let instagramPattern = /(https?:\/\/)?(www\.)?(instagram\.com)\/.+$/;
    let facebookPattern = /(https?:\/\/)?(www\.)?(facebook\.com)\/.+$/;

    let id = null;
    let time = null;

    // extract and implement logic for each platform
    // {platform: "platform name", id: "video id or clip link", time: "start time if available", author: "video author if available", origin: "original URL", title: "video title if available", thumbnail: "thumbnail url if available", troll: "boolean indicating if the video is likely a troll based on filter keywords", approved: "boolean indicating if the video has been approved by a moderator (default false)"}
    if (youtubeUrlPattern.test(link)) {
        if (state.playbackTypes.youtube === false) {
            console.log("YouTube playback is disabled. Ignoring YouTube URL:", link);
            return;
        }
        if (link.includes('/shorts/')) {
            console.log("YouTube Shorts URL detected:", link);
            id = link.split('/shorts/')[1].split(/[?&]/)[0];
            time = link.split('/shorts/')[1].split(/[?&]/)[1]?.split('=')[1] || null;
        }
        if (link.includes('/live/')) {
            console.log("YouTube Live URL detected:", link);
            id = link.split('/live/')[1].split(/[?&]/)[0];
            time = link.split('/live/')[1].split(/[?&]/)[1]?.split('=')[1] || null;
        }
        if (link.includes('/embed/')) {
            console.log("YouTube Embed URL detected:", link);
            id = link.split('/embed/')[1].split(/[?&]/)[0];
            time = link.split('/embed/')[1].split(/[?&]/)[1]?.split('=')[1] || null;
        }
        if (link.includes('youtu.be/')) {
            console.log("YouTube Shortened URL detected:", link);
            id = link.split('youtu.be/')[1].split(/[?&]/)[0];
            time = link.split('youtu.be/')[1].split(/[?&]/)[1]?.split('=')[1] || null;
        }
        if (link.includes('youtube.com/watch')) {
            console.log("YouTube Video URL detected:", link);
            const urlParams = new URLSearchParams(link.split('?')[1]);
            id = urlParams.get('v');
            time = urlParams.get('t') || null;
        }

        // check if the link is already currently playing, if so we can skip the data fetching
        if (state.currentVideo && state.currentVideo.origin === link) {
            console.log("The linked video is currently playing. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is already in the playback queue, if so we can skip the data fetching
        let playbackItem = state.playbackQueue.find(item => item.origin === link);
        if (playbackItem) {
            console.log("The linked video is already in the playback queue. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is in history queue, if so we can skip the data fetching and just re-approve it
        let historyItem = state.historyQueue.find(item => item.origin === link);
        if (historyItem && historyItem.expires && historyItem.expires > Date.now()) {
            historyItem.approved = true;
            state.playbackQueue.push(historyItem);
            console.log("Re-approving video from history:", historyItem);
            return;
        }

        let res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
        let data = {};
        if (res.ok) {
            data = await res.json();
            if (data.error) {
                console.log("Error fetching YouTube video data:", data.error);
                data = {};
            }
        } else {
            console.log("Failed to fetch YouTube video data for ID:", id);
        }
        if (Object.keys(data).length === 0) {
            console.log("No data found for YouTube video ID:", id);
            return;
        }
        let resDesc = await fetch(`https://www.theliveitup34.com/api/v1/youtube/get_video_details?id=${id}&parent=${encodeURIComponent(window.location.host)}`);
        descData = {};
        if (resDesc.ok) {
            descData = await resDesc.json();
            if (descData.errors) {
                console.log("Error fetching YouTube video details:", descData.errors);
                descData = {};
            }
        } else {
            console.log("Failed to fetch YouTube video details for ID:", id);
        }
        if (Object.keys(descData).length === 0) {
            console.log("No description data found for YouTube video ID:", id);
            return;
        }
        let search = new Search([data.title, descData.description]);
        let isTroll = false;
        state.filterKeywords.forEach(keyword => {
            let res = search.search(keyword);
            if (res.length > 0) {
                for (let r of res) {
                    if (r.score > state.filterThreshold) {
                        isTroll = true;
                        console.log(`Keyword "${keyword}" matched with a score of ${r.score}. Marking video as potential troll content.`);
                    }
                }
            }
        });
        let videoData = {
            platform: "youtube",
            id: id,
            time: time,
            author: data.author_name,
            origin: link,
            title: data.title,
            thumbnail: data.thumbnail_url,
            troll: isTroll,
            approved: false,
            timestamp: Date.now()
        };
        state.playbackQueue.push(videoData);
        return;
    }

    if (twitchClipPattern.test(link)) {
        if (state.playbackTypes.twitch === false) {
            console.log("Twitch Clip playback is disabled. Ignoring Twitch Clip URL:", link);
            return;
        }
        let query = new URLSearchParams(link.split('?')[1]) || '';
        if (!link.includes('clip')) {
            return;
        }
        // check if the link is already currently playing, if so we can skip the data fetching
        if (state.currentVideo && state.currentVideo.origin === link) {
            console.log("The linked video is currently playing. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is already in the playback queue, if so we can skip the data fetching
        let playbackItem = state.playbackQueue.find(item => item.origin === link);
        if (playbackItem) {
            console.log("The linked video is already in the playback queue. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is in history queue, if so we can skip the data fetching and just re-approve it
        let historyItem = state.historyQueue.find(item => item.origin === link);
        if (historyItem && historyItem.expires && historyItem.expires > Date.now()) {
            historyItem.approved = true;
            state.playbackQueue.push(historyItem);
            console.log("Re-approving video from history:", historyItem);
            return;
        }

        id = link.split('/').pop().split('?')[0];
        time = query.get('t') || null;
        const data = await ws.getTwitchClipData(id);
        console.log("Twitch clip data:", data);
        let search = new Search([data.title]);
        let isTroll = false;
        state.filterKeywords.forEach(keyword => {
            let res = search.search(keyword);
            if (res.length > 0) {
                for (let r of res) {
                    if (r.score > state.filterThreshold) {
                        isTroll = true;
                        console.log(`Keyword "${keyword}" matched with a score of ${r.score}. Marking clip as potential troll content.`);
                    }
                }
            }
        });
        let videoData = {
            platform: "twitch",
            id: data.url,
            time: time,
            author: data.broadcaster_name,
            origin: link,
            title: data.title,
            thumbnail: data.thumbnail_url,
            troll: isTroll,
            approved: false,
            expires: getTwitchExpiry(data.url),
            timestamp: Date.now()
        };
        state.playbackQueue.push(videoData);
        return;
    }

    if (tiktokPattern.test(link)) {
        await new Promise(async resolve => {
            if (!link.includes('/t/')) return resolve();
            await ws.getFinalUrl(link).then(finalData => {
                if (!finalData || !finalData.redirectUrl) {
                    return resolve();
                }
                link = finalData.redirectUrl;
            });
            return resolve();
        });
        if (!link.includes('tiktok.com/@') || !link.includes('/video/')) {
            console.log("Invalid TikTok URL format after redirection:", link);
            return;
        }

        // check if the link is already currently playing, if so we can skip the data fetching
        if (state.currentVideo && state.currentVideo.origin === link) {
            console.log("The linked video is currently playing. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is already in the playback queue, if so we can skip the data fetching
        let playbackItem = state.playbackQueue.find(item => item.origin === link);
        if (playbackItem) {
            console.log("The linked video is already in the playback queue. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is in history queue, if so we can skip the data fetching and just re-approve it
        let historyItem = state.historyQueue.find(item => item.origin === link);
        if (historyItem && historyItem.expires && historyItem.expires > Date.now()) {
            historyItem.approved = true;
            state.playbackQueue.push(historyItem);
            console.log("Re-approving video from history:", historyItem);
            return;
        }
        let username = link.split('tiktok.com/@')[1]?.split('/')[0];
        let videoId = link.split('/video/')[1]?.split('?')[0];

        let res = await fetch(`https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${username}/video/${videoId}`);
        let data = {};
        if (res.ok) {
            data = await res.json();
            if (data.error) {
                console.log("Error fetching TikTok video data:", data.error);
                data = {};
            }
        } else {
            console.log("Failed to fetch TikTok video data for ID:", videoId);
        }
        if (Object.keys(data).length === 0) {
            console.log("No data found for TikTok video ID:", videoId);
            return;
        }
        let search = new Search([data.title]);
        let isTroll = false;
        state.filterKeywords.forEach(keyword => {
            let res = search.search(keyword);
            if (res.length > 0) {
                for (let r of res) {
                    if (r.score > state.filterThreshold) {
                        isTroll = true;
                        console.log(`Keyword "${keyword}" matched with a score of ${r.score}. Marking video as potential troll content.`);
                    }
                }
            }
        });
        let videoData = {
            platform: "tiktok",
            id: videoId,
            time: time,
            author: data.author_name,
            origin: link,
            title: data.title,
            thumbnail: data.thumbnail_url,
            troll: isTroll,
            approved: false,
            timestamp: Date.now()
        };
        state.playbackQueue.push(videoData);
        return;
    }
    if (kickPattern.test(link)) {
        if (state.playbackTypes.kick === false) {
            console.log("Kick Clip playback is disabled. Ignoring Kick Clip URL:", link);
            return;
        }
        console.log("Kick URL detected:", link);
        if (!link.includes('/clips/')) {
            console.log("Invalid Kick URL format:", link);
            return;
        }
        // check if the link is already currently playing, if so we can skip the data fetching
        if (state.currentVideo && state.currentVideo.origin === link) {
            console.log("The linked video is currently playing. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is already in the playback queue, if so we can skip the data fetching
        let playbackItem = state.playbackQueue.find(item => item.origin === link);
        if (playbackItem) {
            console.log("The linked video is already in the playback queue. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is in history queue, if so we can skip the data fetching and just re-approve it
        let historyItem = state.historyQueue.find(item => item.origin === link);
        if (historyItem && historyItem.expires && historyItem.expires > Date.now()) {
            historyItem.approved = true;
            state.playbackQueue.push(historyItem);
            console.log("Re-approving video from history:", historyItem);
            return;
        }
        let clipId = link.split('/clips/')[1]?.split('?')[0];
        let time = new URLSearchParams(link.split('?')[1]).get('t') || null;
        console.log("Extracted Kick clip ID:", clipId);
        let res = await fetch(`https://kick.com/api/v2/clips/${clipId}`);
        let data = {};
        if (res.ok) {
            data = await res.json();
            if (data.error) {
                console.log("Error fetching Kick clip data:", data.error);
                data = {};
            }
            data = data.clip || {};
        } else {
            console.log("Failed to fetch Kick clip data for ID:", clipId);
        }
        if (Object.keys(data).length === 0) {
            console.log("No data found for Kick clip ID:", clipId);
            return;
        }
        let search = new Search([data.title]);
        let isTroll = false;
        state.filterKeywords.forEach(keyword => {
            let res = search.search(keyword);
            if (res.length > 0) {
                for (let r of res) {
                    if (r.score > state.filterThreshold) {
                        isTroll = true;
                        console.log(`Keyword "${keyword}" matched with a score of ${r.score}. Marking clip as potential troll content.`);
                    }
                }
            }
        });
        let videoData = {
            platform: "kick",
            id: data.clip_url,
            time: time,
            author: data.author_name,
            origin: link,
            title: data.title,
            thumbnail: data.thumbnail_url,
            troll: isTroll,
            approved: false,
            timestamp: Date.now()
        };
        state.playbackQueue.push(videoData);
        return;
    }
    if (instagramPattern.test(link)) {
        if (state.playbackTypes.instagram === false) {
            console.log("Instagram playback is disabled. Ignoring Instagram URL:", link);
            return;
        }
        // check if the link is already currently playing, if so we can skip the data fetching
        if (state.currentVideo && state.currentVideo.origin === link) {
            console.log("The linked video is currently playing. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is already in the playback queue, if so we can skip the data fetching
        let playbackItem = state.playbackQueue.find(item => item.origin === link);
        if (playbackItem) {
            console.log("The linked video is already in the playback queue. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is in history queue, if so we can skip the data fetching and just re-approve it
        let historyItem = state.historyQueue.find(item => item.origin === link);
        if (historyItem && historyItem.expires && historyItem.expires > Date.now()) {
            historyItem.approved = true;
            console.log("Re-approving video from history:", historyItem);
            state.playbackQueue.push(historyItem);
            return;
        }
        let data = await ws.getFinalUrl(link);
        let query = new URLSearchParams(link.split('?')[1]) || '';

        if (data.video_versions && data.video_versions.length == 0) {
            console.log("No video versions found for Instagram URL:", link);
            return;
        }
        let search = new Search([data.title || '']);
        let isTroll = false;
        state.filterKeywords.forEach(keyword => {
            let res = search.search(keyword);
            if (res.length > 0) {
                for (let r of res) {
                    if (r.score > state.filterThreshold) {
                        isTroll = true;
                        console.log(`Keyword "${keyword}" matched with a score of ${r.score}. Marking content as potential troll content.`);
                    }
                }
            }
        });
        let videoData = {
            platform: "instagram",
            id: data.video_versions[0].url || null,
            time: query.get('t') || null,
            author: data.username || null,
            origin: link,
            title: data.title || null,
            thumbnail: data.preview_image || null,
            troll: isTroll,
            approved: false,
            expires: getInstagramExpiry(data.video_versions[0].url),
            timestamp: Date.now()
        };
        state.playbackQueue.push(videoData);
        return;
    }
    if (facebookPattern.test(link)) {
        if (state.playbackTypes.facebook === false) {
            console.log("Facebook playback is disabled. Ignoring Facebook URL:", link);
            return;
        }
        if (!link.includes('facebook.com/') || (!link.includes('/videos/') && !link.includes('/reel/'))) {
            console.log("Invalid Facebook URL format:", link);
            return;
        }
        // check if the link is already currently playing, if so we can skip the data fetching
        if (state.currentVideo && state.currentVideo.origin === link) {
            console.log("The linked video is currently playing. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is already in the playback queue, if so we can skip the data fetching
        let playbackItem = state.playbackQueue.find(item => item.origin === link);
        if (playbackItem) {
            console.log("The linked video is already in the playback queue. Ignoring duplicate link:", link);
            return;
        }
        // check if the link is in history queue, if so we can skip the data fetching and just re-approve it
        let historyItem = state.historyQueue.find(item => item.origin === link);
        if (historyItem) {
            historyItem.approved = true;
            state.playbackQueue.push(historyItem);
            console.log("Re-approving video from history:", historyItem);
            return;
        }


        let query = new URLSearchParams(link.split('?')[1]) || '';
        let data = await ws.getFinalUrl(link);

        let search = new Search([data.title || '']);
        let isTroll = false;
        state.filterKeywords.forEach(keyword => {
            let res = search.search(keyword);
            if (res.length > 0) {
                for (let r of res) {
                    if (r.score > state.filterThreshold) {
                        isTroll = true;
                        console.log(`Keyword "${keyword}" matched with a score of ${r.score}. Marking content as potential troll content.`);
                    }
                }
            }
        });
        let videoData = {
            platform: "facebook",
            id: data.source_id || null,
            time: query.get('t') || null,
            author: data.author || null,
            origin: link,
            title: data.title || null,
            thumbnail: data.preview_image || null,
            troll: isTroll,
            approved: false,
            timestamp: Date.now()
        };
        state.playbackQueue.push(videoData);
        return;
    }

});


function startPlayback(reload = false) {
    // for(let i = 0; i < state.playbackQueue.length; i++) {
    //     if (state.playbackQueue[i].approved === false) {
    //         state.currentVideo = state.playbackQueue.splice(i, 1)[0];
    //         break;
    //     }
    // }
    if (state.playbackQueue.length === 0 && state.currentVideo == null) {
        console.log("Playback queue is empty. No video to play.");
        return;
    }
    if (state.currentVideo == null) {
        state.currentVideo = state.playbackQueue.shift();
    }
    console.log("Current video set to:", state.currentVideo);
    if (!state.currentVideo && reload == false) {
        state.currentVideo = null;
        console.log("Playback queue is empty. No video to play.");
        return;
    }
    state.historyQueue.push(state.currentVideo);
    console.log("Starting playback of video:", state.currentVideo);
    player.loadVideo(state.currentVideo.platform, state.currentVideo.id);

}

function getTwitchExpiry(url) {
    const token = JSON.parse(decodeURIComponent(new URL(url).searchParams.get("token")));
    return token.expires * 1000; // plain Unix timestamp in seconds
}
function getInstagramExpiry(url) {
    const oe = new URL(url).searchParams.get("oe");
    if (!oe) return null;
    return parseInt(oe, 16) * 1000; // hex → ms timestamp
}

async function channelAdvertisement(platform, username) {

    if (state.isRaid && state.isRaidUser === username.toLowerCase()) {
        clearTimeout(state.isRaidTimeout);
        state.isRaidTimeout = setTimeout(() => {
            state.isRaid = false;
            state.isRaidUser = null;
            console.log("Raid timeout expired. Resetting raid state.");
        }, state.isRaidTimeoutDuration);

        return;
    } else {
        state.isRaid = true;
        state.isRaidUser = username.toLowerCase();
        state.isRaidTimeout = setTimeout(() => {
            state.isRaid = false;
            state.isRaidUser = null;
            console.log("Raid timeout expired. Resetting raid state.");
        }, state.isRaidTimeoutDuration);
    }

    if (platform === "twitch") {
        let res = await ws.getRandomTwitchRaidClip(username);
        let clip = await ws.getTwitchClipData(res.url);
        console.log("Shoutout Twitch clip data:", clip);
        let videoData = {
            platform: "twitch",
            id: clip.url,
            time: null,
            author: clip.author_name,
            origin: clip.url,
            title: clip.title,
            thumbnail: clip.thumbnail_url,
            troll: false,
            approved: true,
            expires: getTwitchExpiry(clip.url),
            timestamp: Date.now()
        };
        // push to the front of the queue
        state.playbackQueue.unshift(videoData);
        await new Promise(async resolve => {
            while (player.isPlaying()) {
                await new Promise(r => setTimeout(r, 100));
            }
            resolve();
        })
        startPlayback();
    }

    if (platform === "kick") {
        let res = await fetch(`https://kick.com/api/v2/channels/${username}/clips`);
        let json = await res.json();
        if (!json || !json.clips || json.clips.length === 0) {
            console.log("No clips found for Kick channel:", username);
            return;
        }
        let clip = json.clips[Math.floor(Math.random() * json.clips.length)];
        let videoData = {
            platform: "kick",
            id: clip.clip_url,
            time: null,
            author: clip.channel.username,
            origin: `https://kick.com/${clip.channel.slug}/clips/${clip.id}`,
            title: clip.title,
            thumbnail: clip.thumbnail_url,
            troll: false,
            approved: true,
            timestamp: Date.now()
        };
        // push to the front of the queue
        state.playbackQueue.unshift(videoData);
        await new Promise(async resolve => {
            while (player.isPlaying()) {
                await new Promise(r => setTimeout(r, 100));
            }
            resolve();
        })
        startPlayback();
    }

}