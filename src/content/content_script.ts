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
    const url = new URL(window.location.href);
    if (url.hostname.includes('youtube.com')) return url.searchParams.get('v');
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    return null;
}

// --- Usage timer ---

let playStart: number | null = null;
let usageInterval: number | null = null;

function startUsageTimer(): void {
    if (usageInterval) return;
    playStart = Date.now();
    usageInterval = window.setInterval(async () => {
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

    const res = await sendMsg({ type: 'fetchTranscriptAndCheck', videoId });
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
    if (existing) hookVideoElement(existing as HTMLVideoElement);

    const observer = new MutationObserver(() => {
        const video = document.querySelector('video');
        if (video && video !== hookedVideo) hookVideoElement(video as HTMLVideoElement);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}

// Clean up overlay on SPA navigation
window.addEventListener('yt-navigate-finish', () => {
    removeOverlay();
    stopUsageTimer();
    // Re-check for new video element after navigation
    const video = document.querySelector('video');
    if (video && video !== hookedVideo) hookVideoElement(video as HTMLVideoElement);
});
window.addEventListener('popstate', () => removeOverlay());

observeForVideo();

export { };
