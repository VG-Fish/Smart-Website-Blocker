// content_script.ts — injected into YouTube pages
// Intercepts video play, checks usage limits & goal alignment, shows overlay, tracks watch time

declare const browser: any;

// Polyfill: Firefox exposes `browser`, Chrome exposes `chrome`. Normalise to `browser`.
if ((globalThis as any).browser === undefined) (globalThis as any).browser = (globalThis as any).chrome;

function sendMsg(msg: any): Promise<any> {
    return browser.runtime.sendMessage(msg);
}

// --- Overlay UI ---

// Attaches an overlay element to a player container, or falls back to fixed positioning over the video.
function attachOverlayToPlayer(overlay: HTMLElement, videoEl: HTMLVideoElement, playerId: string, bg: string): void {
    const player = document.getElementById(playerId) || videoEl.parentElement;
    if (player) {
        Object.assign(overlay.style, {
            position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
            background: bg, color: 'white', zIndex: '2147483647',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        });
        player.appendChild(overlay);
    } else {
        const rect = videoEl.getBoundingClientRect();
        Object.assign(overlay.style, {
            position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
            width: `${rect.width}px`, height: `${rect.height}px`,
            background: bg, color: 'white', zIndex: '2147483647',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        });
        document.documentElement.appendChild(overlay);
    }
}

// Creates an overlay scoped to the YouTube video player, not the full page.
function createOverlay(videoEl: HTMLVideoElement): void {
    if (document.getElementById('ss-blocker-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'ss-blocker-overlay';
    overlay.innerHTML = `<div style="max-width:500px;padding:20px;text-align:center;
    font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial">
    <h2 id="ss-title">Checking video alignment with your goal…</h2>
    <p id="ss-body">Please wait — we are fetching the transcript and checking if this video helps your goal.</p>
    <div id="ss-spinner" style="margin-top:20px">Checking Video Content...</div></div>`;
    attachOverlayToPlayer(overlay, videoEl, 'movie_player', 'rgba(0,0,0,0.9)');
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

// --- YouTube transcript extraction (DOM-based) ---

// Track whether we already tried (and failed) to open the transcript for this video
let transcriptAttemptedForVideo: string | null = null;

// Waits for a CSS selector to appear in the DOM, using a MutationObserver.
function waitForSelector(selector: string, timeout: number): Promise<boolean> {
    if (document.querySelector(selector)) return Promise.resolve(true);
    return new Promise(resolve => {
        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(true);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); resolve(false); }, timeout);
    });
}

// Clicks the "...more" button in the video description to expand it, revealing the transcript button.
async function expandDescription(): Promise<void> {
    const moreElement = Array.from(document.querySelectorAll('tp-yt-paper-button, button, span')).find(
        (el) => el.textContent?.trim() === '...more' && el instanceof HTMLElement
    ) as HTMLElement | undefined;
    if (moreElement) {
        moreElement.click();
        console.log('[SmartBlocker] Clicked "...more" to expand description');
        // Wait for the description to expand and transcript button to appear
        await waitForSelector('[aria-label="Show transcript"]', 3000);
    }
}

// Attempts to open the YouTube transcript panel so that segment elements are in the DOM.
async function openTranscriptPanel(): Promise<boolean> {
    const SEG_SELECTOR = '#segments-container';
    const SEG_RENDERER = 'ytd-transcript-segment-renderer';
    if (document.querySelector(SEG_SELECTOR)?.hasChildNodes() || document.querySelector(SEG_RENDERER)) return true;

    // Step 1: Expand the description to reveal the transcript button.
    await expandDescription();

    // Method 1: Click the "Show transcript" button by aria-label.
    const transcriptBtn = document.querySelector('[aria-label="Show transcript"]') as HTMLElement | null;
    if (transcriptBtn) {
        transcriptBtn.click();
        console.log('[SmartBlocker] Clicked "Show transcript" (aria-label)');
        if (await waitForSelector(SEG_SELECTOR, 2000) || await waitForSelector(SEG_RENDERER, 2000)) return true;
    }

    // Method 2: Click the transcript button in the description section.
    const descBtn = document.querySelector(
        'ytd-video-description-transcript-section-renderer button'
    ) as HTMLElement | null;
    if (descBtn) {
        descBtn.click();
        if (await waitForSelector(SEG_SELECTOR, 2000) || await waitForSelector(SEG_RENDERER, 2000)) return true;
    }

    // Method 3: Scan all visible buttons for one whose label contains "transcript".
    const allButtons = Array.from(document.querySelectorAll(
        'button, ytd-button-renderer, tp-yt-paper-button'
    ));
    for (const btn of allButtons) {
        const label = (btn.textContent || '').toLowerCase();
        if (label.includes('transcript') && !label.includes('search')) {
            (btn as HTMLElement).click();
            if (await waitForSelector(SEG_SELECTOR, 2000) || await waitForSelector(SEG_RENDERER, 2000)) return true;
        }
    }

    return false;
}

// Cleans transcript text from a container element, stripping timestamps and extra whitespace.
function cleanTranscriptText(container: Element): string {
    return container.textContent
        ?.trim()
        .replace(/[\n\r0-9:]+/g, '')
        .replace(/\s+/g, ' ')
        .trim() || '';
}

// Extracts transcript text from the DOM transcript panel segments.
async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
    try {
        // Skip DOM clicking if we already failed for this video
        if (transcriptAttemptedForVideo === videoId) {
            console.log('[SmartBlocker] Transcript already attempted for this video, skipping');
            return null;
        }
        transcriptAttemptedForVideo = videoId;

        const panelOpened = await openTranscriptPanel();
        if (!panelOpened) {
            console.warn('[SmartBlocker] Could not open transcript panel');
            return null;
        }

        // Primary: read from #segments-container (bulk extraction, strips timestamps)
        const container = document.getElementById('segments-container');
        if (container?.textContent?.trim()) {
            const text = cleanTranscriptText(container);
            if (text) {
                console.log(`[SmartBlocker] Extracted transcript from segments-container (${text.length} chars)`);
                return text;
            }
        }

        // Fallback: collect text from individual ytd-transcript-segment-renderer elements
        const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
        if (segments.length === 0) return null;

        const lines: string[] = [];
        segments.forEach(seg => {
            const textEl = seg.querySelector('yt-formatted-string.segment-text')
                || seg.querySelector('yt-formatted-string');
            const text = textEl?.textContent?.trim();
            if (text) lines.push(text);
        });

        console.log(`[SmartBlocker] Extracted ${lines.length} transcript segments from DOM`);
        return lines.length > 0 ? lines.join(' ') : null;
    } catch (err: any) {
        console.error('[SmartBlocker] fetchYouTubeTranscript DOM error:', err.message);
        return null;
    }
}

// --- Usage timer ---

let playStart: number | null = null;
let usageInterval: ReturnType<typeof globalThis.setInterval> | null = null;

async function startUsageTimer(): Promise<void> {
    if (usageInterval) return;
    playStart = Date.now();

    // Scale the reporting interval to the remaining time so small limits react quickly
    const { usedSeconds, limitSeconds } = await sendMsg({ type: 'getRemainingFun' });
    const remaining = Math.max(0, limitSeconds - usedSeconds);
    const intervalMs = remaining <= 10 ? 1000 : 5000;
    const flushThreshold = remaining <= 10 ? 1 : 10;

    usageInterval = globalThis.setInterval(async () => {
        const elapsed = Math.floor((Date.now() - (playStart as number)) / 1000);
        if (elapsed >= flushThreshold) {
            await sendMsg({ type: 'addUsage', domain: 'youtube.com', seconds: elapsed });
            playStart = Date.now();

            // Check if the limit was just reached and trigger a video check
            const rem = await sendMsg({ type: 'getRemainingFun' });
            if (rem.limitSeconds > 0 && rem.usedSeconds >= rem.limitSeconds) {
                stopUsageTimer();
                const video = document.querySelector('video');
                if (video && !video.paused) {
                    await muteCheckAndRestore(video);
                }
            }
        }
    }, intervalMs);
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

// Document-level capture listener — pauses ANY video that tries to play while blocked.
document.addEventListener('play', (e) => {
    if (e.target instanceof HTMLVideoElement &&
        (shortsBlockerActive || document.getElementById('ss-blocker-overlay'))) {
        e.target.pause();
    }
}, true);

// Block spacebar (and k key) from toggling playback while an overlay is active.
document.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'k') &&
        (document.getElementById('ss-blocker-overlay') || document.getElementById('ss-shorts-overlay'))) {
        e.stopPropagation();
        e.preventDefault();
    }
}, true);

function blockShortsPage(): void {
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
        attachOverlayToPlayer(overlay, videoEl, 'shorts-player', 'rgba(0,0,0,0.92)');
    }
}

function deactivateShortsBlocker(): void {
    shortsBlockerActive = false;
    document.getElementById('ss-shorts-overlay')?.remove();
}

// --- Play interception helpers ---

// Mutes a video, runs the play-attempt check, then restores mute or pauses.
async function muteCheckAndRestore(video: HTMLVideoElement): Promise<void> {
    isPlayAttemptInProgress = true;
    const wasMuted = video.muted;
    video.muted = true;
    const allowed = await onPlayAttempt(video);
    if (allowed) {
        video.muted = wasMuted;
    } else {
        video.pause();
    }
    isPlayAttemptInProgress = false;
}

function updateOverlayMessage(message: string): void {
    const body = document.getElementById('ss-body');
    const spinner = document.getElementById('ss-spinner');
    if (body) body.textContent = message;
    if (spinner) spinner.remove();
}

async function fetchTranscriptFromBackend(videoId: string): Promise<string | null> {
    try {
        const resp = await fetch(`https://youtube-transcript-api-one-eta.vercel.app/api/transcript?v=${encodeURIComponent(videoId)}`);
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.ok && data.transcript) {
            console.log(`[SmartBlocker] Got transcript from backend (${data.transcript.length} chars)`);
            return data.transcript;
        }
        return null;
    } catch (err: any) {
        console.warn('[SmartBlocker] Backend transcript fetch failed:', err.message);
        return null;
    }
}

async function checkVideoAlignment(videoId: string): Promise<any> {
    let transcript = await fetchYouTubeTranscript(videoId);
    if (!transcript) {
        console.log('[SmartBlocker] DOM scraping failed, trying backend fallback');
        transcript = await fetchTranscriptFromBackend(videoId);
    }
    return sendMsg({ type: 'fetchTranscriptAndCheck', videoId, transcript, videoTitle: document.title });
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
        updateOverlayMessage('Cannot determine video identity; blocked.');
        return false;
    }

    // Skip re-checking if this video was already approved
    if (approvedVideoId === videoId) {
        startUsageTimer();
        return true;
    }

    videoEl.pause();
    createOverlay(videoEl);

    // Check alignment and handle result
    const res = await checkVideoAlignment(videoId);
    if (!res?.ok) {
        updateOverlayMessage('Transcript unavailable — video blocked.');
        return false;
    }

    if (res.aligned) {
        approvedVideoId = videoId;
        removeOverlay();
        startUsageTimer();
        videoEl.play();
        return true;
    }

    updateOverlayMessage('This video is not aligned with your current goal, so playback is blocked.');
    return false;
}

// --- Video element hooking ---

let hookedVideo: HTMLVideoElement | null = null;
let isPlayAttemptInProgress = false;
let approvedVideoId: string | null = null;

function hookVideoElement(videoEl: HTMLVideoElement): void {
    if (hookedVideo === videoEl) return;
    hookedVideo = videoEl;

    videoEl.addEventListener('play', async () => {
        if (isPlayAttemptInProgress) return;
        await muteCheckAndRestore(videoEl);
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
    approvedVideoId = null;
    transcriptAttemptedForVideo = null;
    // Re-check for new video element after navigation
    const video = document.querySelector('video');
    if (video && video !== hookedVideo) hookVideoElement(video);
    // Block Shorts immediately on SPA navigation; async check below may unblock if setting is off.
    if (isYouTubeShorts()) blockShortsPage();
    (async () => {
        try {
            const settings = await sendMsg({ type: 'getSettings' });
            if (isYouTubeShorts()) {
                if (!settings?.blockShorts) deactivateShortsBlocker();
                return;
            }
            if (!settings?.blockingEnabled) return;
            // Timer starts only when a video play event fires (via hookVideoElement → onPlayAttempt)
        } catch (err) {
            console.error('[SmartBlocker] yt-navigate-finish handler failed:', err);
        }
    })();
});
globalThis.addEventListener('popstate', () => removeOverlay());

// Block Shorts immediately (before async settings fetch); unblocked below if setting is off.
if (isYouTubeShorts()) blockShortsPage();
observeForVideo();

// --- React to settings changes (e.g. blocking re-enabled while video is playing) ---

browser.storage.onChanged.addListener((changes: any) => {
    const settingsChange = changes[STORAGE_KEYS_SETTINGS];
    if (!settingsChange) return;
    const newSettings = settingsChange.newValue;
    const oldSettings = settingsChange.oldValue;
    if (!newSettings) return;

    // Blocking was just enabled — re-check the current video
    if (newSettings.blockingEnabled && !oldSettings?.blockingEnabled) {
        approvedVideoId = null;
        const video = document.querySelector('video');
        if (video && !video.paused) {
            muteCheckAndRestore(video);
        }
    }

    // Blocking was just disabled — remove any active overlays
    if (!newSettings.blockingEnabled && oldSettings?.blockingEnabled) {
        removeOverlay();
    }

    // Shorts blocking toggled
    if (isYouTubeShorts()) {
        if (newSettings.blockShorts && !oldSettings?.blockShorts) {
            blockShortsPage();
        } else if (!newSettings.blockShorts && oldSettings?.blockShorts) {
            deactivateShortsBlocker();
        }
    }
});

const STORAGE_KEYS_SETTINGS = 'ss_settings';

console.log('[SmartBlocker] content script loaded');

// --- Start usage tracking on youtube.com even without video playback ---
(async () => {
    try {
        const settings = await sendMsg({ type: 'getSettings' });
        console.log('[SmartBlocker] settings:', settings);

        // Shorts were already blocked synchronously above; unblock here if setting is off.
        if (isYouTubeShorts()) {
            if (!settings?.blockShorts) deactivateShortsBlocker();
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
        }
    } catch (err) {
        console.error('[SmartBlocker] initialization failed:', err);
    }
})();

