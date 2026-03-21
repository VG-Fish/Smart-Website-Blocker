// content_script.ts — injected into YouTube pages (converted to TypeScript)

function formatSeconds(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
}

// Overlay UI
function createOverlay(): void {
    if (document.getElementById('ss-blocker-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'ss-blocker-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.color = 'white';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.innerHTML = `<div style="max-width:900px;padding:20px;text-align:center;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;">
    <h2 id="ss-title">Checking video alignment with your goal…</h2>
    <p id="ss-body">Please wait — we are fetching the transcript and checking if this video helps your goal.</p>
    <div id="ss-spinner" style="margin-top:20px">Loading…</div>
  </div>`;
    document.documentElement.appendChild(overlay);
}

function removeOverlay(): void {
    const el = document.getElementById('ss-blocker-overlay');
    if (el) el.remove();
}

// Utility: extract YouTube video ID from page
function getYouTubeVideoId(): string | null {
    const url = new URL(window.location.href);
    if (url.hostname.includes('youtube.com')) return url.searchParams.get('v');
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    return null;
}

// Track playing time to count toward fun time (only while under limit)
let playing = false;
let playStart: number | null = null;
let usageInterval: number | null = null as any;

async function startUsageTimer(): Promise<void> {
    if (usageInterval) return;
    playStart = Date.now();
    usageInterval = window.setInterval(async () => {
        const now = Date.now();
        const elapsed = Math.floor((now - (playStart as number)) / 1000);
        // every 10 seconds, send usage to background and reset playStart
        if (elapsed >= 10) {
            // @ts-ignore
            await (window as any).browser.runtime.sendMessage({ type: 'addUsage', domain: 'youtube.com', seconds: elapsed });
            playStart = Date.now();
        }
    }, 5000);
}

async function stopUsageTimer(): Promise<void> {
    if (!usageInterval) return;
    clearInterval(usageInterval as number);
    usageInterval = null;
    if (playStart) {
        const now = Date.now();
        const elapsed = Math.floor((now - playStart) / 1000);
        if (elapsed > 0) await (window as any).browser.runtime.sendMessage({ type: 'addUsage', domain: 'youtube.com', seconds: elapsed });
        playStart = null;
    }
}

async function onPlayAttempt(videoEl: HTMLVideoElement): Promise<boolean> {
    const settings = await (window as any).browser.runtime.sendMessage({ type: 'getSettings' });
    if (!settings || !settings.blockingEnabled) return true; // allow play

    // Check today's usage and limit
    const { usedSeconds, limitSeconds } = await (window as any).browser.runtime.sendMessage({ type: 'getRemainingFun' });
    if (usedSeconds < limitSeconds) {
        // still within fun time — allow play and start tracking
        startUsageTimer();
        return true;
    }

    // Fun time exceeded — allow only educational content
    const videoId = getYouTubeVideoId();
    if (!videoId) {
        // conservative: block
        videoEl.pause();
        createOverlay();
        const body = document.getElementById('ss-body');
        if (body) body.textContent = 'Cannot determine video identity; blocked.';
        return false;
    }

    // pause playback and show overlay while checking
    videoEl.pause();
    createOverlay();

    // Ask background to fetch transcript and check alignment
    const res = await (window as any).browser.runtime.sendMessage({ type: 'fetchTranscriptAndCheck', videoId });
    if (!res || !res.ok) {
        const body = document.getElementById('ss-body');
        if (body) body.textContent = 'Transcript unavailable — video blocked.';
        return false;
    }

    if (res.aligned) {
        // allow playback (educational)
        removeOverlay();
        videoEl.play().catch(() => { });
        // educational videos after limit should NOT count against fun time
        return true;
    } else {
        const body = document.getElementById('ss-body');
        if (body) body.textContent = 'This video is not aligned with your current goal, so playback is blocked.';
        return false;
    }
}

function hookVideoElement(videoEl: HTMLVideoElement | null): void {
    if (!videoEl) return;

    videoEl.addEventListener('play', async () => {
        // when play is attempted, decide
        const allowed = await onPlayAttempt(videoEl as HTMLVideoElement);
        if (!allowed) {
            // ensure paused
            videoEl.pause();
        } else {
            playing = true;
            startUsageTimer();
        }
    });

    videoEl.addEventListener('pause', () => {
        playing = false;
        stopUsageTimer();
    });
}

// Observe for YouTube video tag
function waitForVideoThenHook(): void {
    const tryFind = () => {
        const video = document.querySelector('video');
        if (video) {
            hookVideoElement(video as HTMLVideoElement);
        } else {
            // for SPA navigation, keep trying
            setTimeout(tryFind, 1500);
        }
    };
    tryFind();
}

// Clean up overlay on navigation
window.addEventListener('yt-navigate-finish', () => removeOverlay());
window.addEventListener('popstate', () => removeOverlay());

waitForVideoThenHook();

export { };
