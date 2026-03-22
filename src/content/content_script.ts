// content_script.ts — injected into YouTube pages
// Intercepts video play, checks usage limits & goal alignment, shows overlay, tracks watch time

declare const browser: any;

function sendMsg(msg: any): Promise<any> {
    return browser.runtime.sendMessage(msg);
}

// --- Overlay UI ---

// Creates an overlay scoped to the YouTube video player, not the full page.
function createOverlay(videoEl: HTMLVideoElement): void {
    if (document.getElementById('ss-blocker-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'ss-blocker-overlay';
    overlay.innerHTML = `<div style="max-width:500px;padding:20px;text-align:center;
    font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial">
    <h2 id="ss-title">Checking video alignment with your goal…</h2>
    <p id="ss-body">Please wait — we are fetching the transcript and checking if this video helps your goal.</p>
    <div id="ss-spinner" style="margin-top:20px">Loading…</div></div>`;

    // Attach inside the YouTube player container so only the video is covered.
    const player = document.getElementById('movie_player') || videoEl.parentElement;
    if (player) {
        Object.assign(overlay.style, {
            position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.9)', color: 'white', zIndex: '2147483647',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        });
        player.appendChild(overlay);
    } else {
        // Fallback: position over the video element using fixed coords.
        const rect = videoEl.getBoundingClientRect();
        Object.assign(overlay.style, {
            position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
            width: `${rect.width}px`, height: `${rect.height}px`,
            background: 'rgba(0,0,0,0.9)', color: 'white', zIndex: '2147483647',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        });
        document.documentElement.appendChild(overlay);
    }
}

// Shows a small non-blocking banner at the top of the page (for non-video pages).
function createBanner(title: string, body: string): void {
    if (document.getElementById('ss-blocker-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'ss-blocker-banner';
    Object.assign(banner.style, {
        position: 'fixed', top: '0', left: '0', width: '100%',
        background: '#c0392b', color: 'white', zIndex: '2147483647',
        padding: '10px 16px', boxSizing: 'border-box',
        fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial",
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    });
    banner.innerHTML = `<span><strong>${title}</strong> — ${body}</span>
    <button id="ss-banner-close" style="background:none;border:1px solid white;color:white;cursor:pointer;padding:2px 8px;border-radius:3px;margin-left:16px;font-size:14px">✕</button>`;
    document.documentElement.appendChild(banner);
    document.getElementById('ss-banner-close')?.addEventListener('click', () => banner.remove());
}

function removeOverlay(): void {
    document.getElementById('ss-blocker-overlay')?.remove();
    document.getElementById('ss-blocker-banner')?.remove();
}

// --- Video ID extraction ---

function getYouTubeVideoId(): string | null {
    const url = new URL(globalThis.location.href);
    if (url.hostname.includes('youtube.com')) return url.searchParams.get('v');
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    return null;
}

// --- YouTube transcript extraction ---

async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
    try {
        // Fetch the watch page to extract caption track URL from ytInitialPlayerResponse
        const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        if (!pageResp.ok) return null;
        const html = await pageResp.text();

        // Extract captions JSON from ytInitialPlayerResponse
        const match = /"captions":\s*(\{.*?\})\s*,\s*"videoDetails"/s.exec(html);
        if (!match) return null;

        let captionsObj: any;
        try {
            captionsObj = JSON.parse(match[1]);
        } catch (err: any) {
            console.error('[YouTube transcript] JSON parse error:', err);
            return null;
        }

        const tracks = captionsObj?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!Array.isArray(tracks) || tracks.length === 0) return null;

        // Prefer English, fall back to first available
        const enTrack = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
        const captionUrl = enTrack?.baseUrl;
        if (!captionUrl) return null;

        // Fetch the timed text XML
        const xmlResp = await fetch(captionUrl);
        if (!xmlResp.ok) return null;
        const xmlText = await xmlResp.text();

        // Parse XML and extract text content
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');
        const textNodes = doc.querySelectorAll('text');
        const lines: string[] = [];
        textNodes.forEach(node => {
            const t = (node.textContent || '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            if (t.trim()) lines.push(t.trim());
        });

        return lines.length > 0 ? lines.join(' ') : null;
    } catch (err: any) {
        console.error('[API] fetchYouTubeTranscript error:', err.message);
        return null;
    }
}

// --- Usage timer ---

let playStart: number | null = null;
let usageInterval: ReturnType<typeof globalThis.setInterval> | null = null;

function startUsageTimer(): void {
    if (usageInterval) return;
    playStart = Date.now();
    usageInterval = globalThis.setInterval(async () => {
        const elapsed = Math.floor((Date.now() - (playStart as number)) / 1000);
        if (elapsed >= 10) {
            await sendMsg({ type: 'addUsage', domain: 'youtube.com', seconds: elapsed });
            playStart = Date.now();
        }
    }, 5000);
}

function stopUsageTimer(): void {
    if (!usageInterval) return;
    clearInterval(usageInterval);
    usageInterval = null;
    if (playStart) {
        const elapsed = Math.floor((Date.now() - playStart) / 1000);
        if (elapsed > 0) sendMsg({ type: 'addUsage', domain: 'youtube.com', seconds: elapsed });
        playStart = null;
    }
}

// --- Shorts detection & blocking ---

function isYouTubeShorts(): boolean {
    return globalThis.location.pathname.startsWith('/shorts/');
}

let shortsBlockerActive = false;

// Document-level capture listener — pauses ANY video that tries to play while Shorts are blocked.
document.addEventListener('play', (e) => {
    if (shortsBlockerActive && e.target instanceof HTMLVideoElement) {
        e.target.pause();
    }
}, true);

function blockShortsPage(): void {
    if (shortsBlockerActive) return;
    shortsBlockerActive = true;

    // Pause every video currently on the page
    document.querySelectorAll('video').forEach(v => v.pause());

    // Overlay only the video portion, not the full page
    if (!document.getElementById('ss-shorts-overlay')) {
        const videoEl = document.querySelector('video');
        if (!videoEl) return;

        const overlay = document.createElement('div');
        overlay.id = 'ss-shorts-overlay';
        overlay.innerHTML = `<div style="max-width:500px;padding:20px;text-align:center;
        font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial">
        <h2>Shorts Blocked</h2>
        <p>YouTube Shorts are blocked by your settings.</p></div>`;

        const player = document.getElementById('shorts-player') || videoEl.parentElement;
        if (player) {
            player.style.position = 'relative';
            Object.assign(overlay.style, {
                position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.92)', color: 'white', zIndex: '2147483647',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            });
            player.appendChild(overlay);
        } else {
            const rect = videoEl.getBoundingClientRect();
            Object.assign(overlay.style, {
                position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
                width: `${rect.width}px`, height: `${rect.height}px`,
                background: 'rgba(0,0,0,0.92)', color: 'white', zIndex: '2147483647',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            });
            document.documentElement.appendChild(overlay);
        }
    }
}

function deactivateShortsBlocker(): void {
    shortsBlockerActive = false;
    document.getElementById('ss-shorts-overlay')?.remove();
}

// --- Play interception ---

async function onPlayAttempt(videoEl: HTMLVideoElement): Promise<boolean> {
    const settings = await sendMsg({ type: 'getSettings' });

    // Block Shorts unconditionally when the setting is on
    if (isYouTubeShorts() && settings?.blockShorts) {
        blockShortsPage();
        return false;
    }

    if (!settings?.blockingEnabled) return true;

    const { usedSeconds, limitSeconds } = await sendMsg({ type: 'getRemainingFun' });
    if (usedSeconds < limitSeconds) {
        startUsageTimer();
        return true;
    }

    // Fun time exceeded — allow only educational content
    const videoId = getYouTubeVideoId();
    if (!videoId) {
        videoEl.pause();
        createOverlay(videoEl);
        const body = document.getElementById('ss-body');
        if (body) body.textContent = 'Cannot determine video identity; blocked.';
        return false;
    }

    videoEl.pause();
    createOverlay(videoEl);

    // Try to get transcript directly from YouTube's captions
    const localTranscript = await fetchYouTubeTranscript(videoId);
    const res = await sendMsg({ type: 'fetchTranscriptAndCheck', videoId, transcript: localTranscript, videoTitle: document.title });
    if (!res?.ok) {
        const body = document.getElementById('ss-body');
        if (body) body.textContent = 'Transcript unavailable — video blocked.';
        return false;
    }

    if (res.aligned) {
        removeOverlay();
        return true;
    }

    const body = document.getElementById('ss-body');
    if (body) body.textContent = 'This video is not aligned with your current goal, so playback is blocked.';
    return false;
}

// --- Video element hooking ---

let hookedVideo: HTMLVideoElement | null = null;
let isPlayAttemptInProgress = false;

function hookVideoElement(videoEl: HTMLVideoElement): void {
    if (hookedVideo === videoEl) return;
    hookedVideo = videoEl;

    videoEl.addEventListener('play', async () => {
        if (isPlayAttemptInProgress) return;
        isPlayAttemptInProgress = true;
        const allowed = await onPlayAttempt(videoEl);
        if (!allowed) videoEl.pause();
        isPlayAttemptInProgress = false;
    });

    videoEl.addEventListener('pause', () => stopUsageTimer());
}

// Use MutationObserver instead of polling to detect video elements
function observeForVideo(): void {
    const existing = document.querySelector('video');
    if (existing) hookVideoElement(existing);

    const observer = new MutationObserver(() => {
        const video = document.querySelector('video');
        if (video && video !== hookedVideo) hookVideoElement(video);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}

// Clean up overlay on SPA navigation
globalThis.addEventListener('yt-navigate-finish', () => {
    removeOverlay();
    deactivateShortsBlocker();
    stopUsageTimer();
    // Re-check for new video element after navigation
    const video = document.querySelector('video');
    if (video && video !== hookedVideo) hookVideoElement(video);
    // Block Shorts on SPA navigation, then handle normal usage tracking
    (async () => {
        try {
            const settings = await sendMsg({ type: 'getSettings' });
            if (isYouTubeShorts() && settings?.blockShorts) {
                blockShortsPage();
                return;
            }
            if (!settings?.blockingEnabled) return;
            const { usedSeconds, limitSeconds } = await sendMsg({ type: 'getRemainingFun' });
            if (usedSeconds < limitSeconds) startUsageTimer();
        } catch (err) {
            console.error('[SmartBlocker] yt-navigate-finish handler failed:', err);
        }
    })();
});
globalThis.addEventListener('popstate', () => removeOverlay());

observeForVideo();

console.log('[SmartBlocker] content script loaded');

// --- Start usage tracking on youtube.com even without video playback ---
(async () => {
    try {
        const settings = await sendMsg({ type: 'getSettings' });
        console.log('[SmartBlocker] settings:', settings);

        // Block Shorts on initial page load
        if (isYouTubeShorts() && settings?.blockShorts) {
            blockShortsPage();
            return;
        }

        if (!settings?.blockingEnabled) {
            console.log('[SmartBlocker] blocking disabled, not tracking');
            return;
        }

        const { usedSeconds, limitSeconds } = await sendMsg({ type: 'getRemainingFun' });
        console.log('[SmartBlocker] usage:', usedSeconds, '/', limitSeconds, 'seconds');
        if (usedSeconds >= limitSeconds) {
            // Fun time exceeded on youtube.com — block if no video is playing (homepage/browse)
            const videoId = getYouTubeVideoId();
            if (!videoId) {
                createBanner('Fun time limit reached', 'Your daily fun time limit has been exceeded. Video playback is restricted.');
            }
        } else {
            // Track browsing time on YouTube (even without video)
            startUsageTimer();
        }
    } catch (err) {
        console.error('[SmartBlocker] initialization failed:', err);
    }
})();

