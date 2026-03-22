// content_script.ts — injected into YouTube pages
// Intercepts video play, checks usage limits & goal alignment, shows overlay, tracks watch time

declare const browser: any;

function sendMsg(msg: any): Promise<any> {
    return browser.runtime.sendMessage(msg);
}

// --- Overlay UI ---

function createOverlay(): void {
    if (document.getElementById('ss-blocker-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'ss-blocker-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.85)', color: 'white', zIndex: '2147483647',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    });
    overlay.innerHTML = `<div style="max-width:900px;padding:20px;text-align:center;
    font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial">
    <h2 id="ss-title">Checking video alignment with your goal…</h2>
    <p id="ss-body">Please wait — we are fetching the transcript and checking if this video helps your goal.</p>
    <div id="ss-spinner" style="margin-top:20px">Loading…</div></div>`;
    document.documentElement.appendChild(overlay);
}

function removeOverlay(): void {
    document.getElementById('ss-blocker-overlay')?.remove();
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
        try { captionsObj = JSON.parse(match[1]); } catch { return null; }

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
    } catch {
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

// --- Play interception ---

async function onPlayAttempt(videoEl: HTMLVideoElement): Promise<boolean> {
    const settings = await sendMsg({ type: 'getSettings' });
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
        createOverlay();
        const body = document.getElementById('ss-body');
        if (body) body.textContent = 'Cannot determine video identity; blocked.';
        return false;
    }

    videoEl.pause();
    createOverlay();

    // Try to get transcript directly from YouTube's captions
    const localTranscript = await fetchYouTubeTranscript(videoId);
    const res = await sendMsg({ type: 'fetchTranscriptAndCheck', videoId, transcript: localTranscript });
    if (!res?.ok) {
        const body = document.getElementById('ss-body');
        if (body) body.textContent = 'Transcript unavailable — video blocked.';
        return false;
    }

    if (res.aligned) {
        removeOverlay();
        videoEl.play().catch(() => { });
        return true;
    }

    const body = document.getElementById('ss-body');
    if (body) body.textContent = 'This video is not aligned with your current goal, so playback is blocked.';
    return false;
}

// --- Video element hooking ---

let hookedVideo: HTMLVideoElement | null = null;

function hookVideoElement(videoEl: HTMLVideoElement): void {
    if (hookedVideo === videoEl) return;
    hookedVideo = videoEl;

    videoEl.addEventListener('play', async () => {
        const allowed = await onPlayAttempt(videoEl);
        if (!allowed) videoEl.pause();
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
    stopUsageTimer();
    // Re-check for new video element after navigation
    const video = document.querySelector('video');
    if (video && video !== hookedVideo) hookVideoElement(video);
    // Restart usage tracking after SPA navigation
    (async () => {
        try {
            const settings = await sendMsg({ type: 'getSettings' });
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
                createOverlay();
                const title = document.getElementById('ss-title');
                const body = document.getElementById('ss-body');
                if (title) title.textContent = 'Fun time limit reached';
                if (body) body.textContent = 'Your daily fun time limit has been exceeded. YouTube browsing is blocked.';
                const spinner = document.getElementById('ss-spinner');
                if (spinner) spinner.style.display = 'none';
            }
        } else {
            // Track browsing time on YouTube (even without video)
            startUsageTimer();
        }
    } catch (err) {
        console.error('[SmartBlocker] initialization failed:', err);
    }
})();

