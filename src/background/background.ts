// background.ts — service worker
// Handles transcript fetch, OpenRouter alignment checks, settings/usage persistence, quiz generation

import { loadEnv } from '../utils/env_reader';

declare const browser: any;

let ENV_VARS: Record<string, string> = {};
loadEnv().then(e => { ENV_VARS = e; }).catch((err: any) => { console.error('Failed to load .env variables', err); });

const STORAGE_KEYS = { SETTINGS: 'ss_settings', USAGE: 'ss_usage' };

const DEFAULT_SETTINGS = {
    goals: [] as string[],
    funLimitMinutes: 30,
    blockingEnabled: true,
    blockShorts: true,
};

async function getSettings(): Promise<any> {
    const data = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
    return data[STORAGE_KEYS.SETTINGS] || { ...DEFAULT_SETTINGS };
}

async function saveSettings(settings: any): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

async function getUsage(): Promise<any> {
    const data = await browser.storage.local.get(STORAGE_KEYS.USAGE);
    return data[STORAGE_KEYS.USAGE] || {};
}

function todayKey(): string {
    return new Date().toISOString().slice(0, 10);
}

async function addUsage(domain: string, seconds: number): Promise<void> {
    const usage = await getUsage();
    const today = todayKey();
    usage[today] = usage[today] || {};
    usage[today][domain] = (usage[today][domain] || 0) + seconds;
    await browser.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });
}

async function getUsageForDomainToday(domain: string): Promise<number> {
    const usage = await getUsage();
    const today = todayKey();
    return usage[today]?.[domain] || 0;
}

async function fetchTranscript(videoId: string): Promise<string | null> {
    const url = `https://r.jina.ai/http://youtube.com/watch?v=${videoId}`;
    console.log('[API] fetchTranscript →', url);
    try {
        const resp = await fetch(url);
        console.log('[API] fetchTranscript ←', resp.status, resp.statusText);
        if (!resp.ok) throw new Error('r.jina.ai fetch failed');
        const text = await resp.text();
        console.log('[API] fetchTranscript body length:', text.length);
        return text;
    } catch (err) {
        console.warn('[API] fetchTranscript error:', err);
        return null;
    }
}

async function callRouterClassify(prompt: string, model = 'gpt-4o-mini'): Promise<any> {
    const key = ENV_VARS.OPENROUTER_API_KEY;
    const routerUrl = ENV_VARS.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
    console.log('[API] callRouterClassify → POST', routerUrl, '| model:', model, '| prompt length:', prompt.length);
    if (!key) {
        console.warn('[API] callRouterClassify: no API key, aborting');
        return { error: 'no_api_key' };
    }

    try {
        const resp = await fetch(routerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
        });
        console.log('[API] callRouterClassify ←', resp.status, resp.statusText);
        if (!resp.ok) {
            const detail = await resp.text();
            console.error('[API] callRouterClassify error body:', detail);
            return { error: 'router_error', detail };
        }

        const data = await resp.json();
        let out = '';
        if (Array.isArray(data.output)) {
            out = data.output.map((o: any) => (o.content || '').toString()).join('\n');
        } else if (data.choices?.[0]) {
            out = data.choices[0].message?.content || data.choices[0].text || '';
        } else if (data.result?.output_text) {
            out = data.result.output_text;
        }
        console.log('[API] callRouterClassify response text length:', out.length);
        return { text: out };
    } catch (err: any) {
        console.error('[API] callRouterClassify exception:', err.message);
        return { error: 'router_exception', detail: err.message };
    }
}

function extractGoals(settings: any): string[] {
    if (Array.isArray(settings.goals)) return settings.goals;
    return settings.goal ? [settings.goal] : [];
}

function extractJson(text: string, opener: string, closer: string): string {
    const start = text.indexOf(opener);
    const end = text.lastIndexOf(closer);
    return start >= 0 && end >= 0 ? text.slice(start, end + 1) : text;
}

function keywordAlign(goals: string[], text: string): boolean {
    if (!goals || goals.length === 0 || !text) return false;
    const haystack = text.toLowerCase();
    return goals.some(goal => {
        const words = goal.toLowerCase().split(/\s+/).filter(Boolean);
        if (words.length === 0) return false;
        const required = Math.max(1, Math.floor(words.length / 3));
        const matches = words.reduce((count, w) => {
            if (w.length <= 2) return count;
            return haystack.includes(w) ? count + 1 : count;
        }, 0);
        return matches >= required;
    });
}

async function checkAlignment(transcript: string, settings: any, videoUrl?: string): Promise<any> {
    const goals = extractGoals(settings);
    if (goals.length === 0) return { ok: true, aligned: false, score: 0, reasons: 'no goals set' };

    const transcriptText = transcript || '';

    const goalsList = goals.map((g: string, i: number) => `${i + 1}. ${g}`).join('\n');
    const urlLine = videoUrl ? `\n\nVideo URL: ${videoUrl}` : '';
    const prompt = `You are given a user's learning goals (they may have several). Decide whether the following YouTube video (URL and transcript) satisfies at least one of the goals. Consider both the video URL (which may contain the title/topic) and the transcript content. Reply ONLY in JSON with keys: aligned (true/false), score (0-1), matchedGoal (index starting at 0 if matched), reasons (short string). Goals:\n${goalsList}${urlLine}\n\nTranscript:\n\n${transcript}`;

    const routerResp = await callRouterClassify(prompt);
    if (routerResp.error) return { ok: false, error: routerResp.error, detail: routerResp.detail };

    try {
        const parsed = JSON.parse(extractJson(routerResp.text, '{', '}'));
        if (parsed?.aligned) {
            return { ok: true, aligned: true, score: parsed.score || 0, matchedGoal: parsed.matchedGoal, reasons: parsed.reasons || '' };
        }
        if (keywordAlign(goals, transcriptText)) {
            return { ok: true, aligned: true, score: parsed?.score || 0.55, matchedGoal: parsed?.matchedGoal ?? 0, reasons: 'fallback transcript keyword match' };
        }
        return { ok: true, aligned: false, score: parsed?.score || 0, matchedGoal: parsed?.matchedGoal, reasons: parsed?.reasons || 'not aligned' };
    } catch (err: any) {
        console.error('[API] checkAlignment JSON parse error:', err.message);
        // Fallback: keyword matching
        if (keywordAlign(goals, transcriptText)) {
            return { ok: true, aligned: true, score: 0.5, matchedGoal: 0, reasons: 'fallback keyword match' };
        }
        return { ok: true, aligned: false, score: 0.1, reasons: 'no keyword matches' };
    }
}

function fallbackQuiz(goal: string): any[] {
    return [
        { question: 'What is your learning goal? (short answer)', answer_choices: [] },
        { question: `Name one core topic related to: ${goal}`, answer_choices: [] },
        { question: 'Why is this goal valuable?', answer_choices: [] },
        { question: `Give one resource you could use to learn ${goal}`, answer_choices: [] },
        { question: `How will you practice what you learn about ${goal}?`, answer_choices: [] },
    ];
}

async function generateQuiz(settings: any): Promise<any> {
    const goals = extractGoals(settings);
    const goal = goals[0] || 'your stated goal';
    if (!ENV_VARS.OPENROUTER_API_KEY) return fallbackQuiz(goal);

    const modelName = 'nvidia/nemotron-3-super-120b-a12b:free';
    const goalsList = goals.map((g: string, i: number) => `${i + 1}. ${g}`).join('\n');
    const basePrompt = `You are an assistant that MUST reply ONLY with a JSON array (no surrounding text) of exactly 5 items. Each item must be an object with the keys: question (string), answer_choices (array). For multiple-choice questions supply 3-4 answer_choices objects with choice (string) and isCorrect (true/false). For short-answer questions, return answer_choices as an empty array. Make a mix of easy to hard questions derived from the user's goals. Do NOT include explanations or extra text. Output EXACTLY valid JSON.\nGoals: ${goalsList}\nGenerate 5 questions now as an array.`;

    for (let attempt = 0; attempt < 3; attempt++) {
        const prompt = attempt === 0
            ? basePrompt
            : `INVALID OUTPUT DETECTED. Reply ONLY with a valid JSON array using this exact shape: [{"question":"...","answer_choices":[{"choice":"..","isCorrect":true}, ...]}, ...]. Nothing else. Generate 5 items based on the goals: ${goals.join(' | ')}.`;

        const routerResp = await callRouterClassify(prompt, modelName);
        if (routerResp.error) return fallbackQuiz(goal);

        try {
            const parsed = JSON.parse(extractJson(routerResp.text || '', '[', ']'));
            if (Array.isArray(parsed) && parsed.length >= 1 &&
                parsed.every((it: any) => typeof it.question === 'string' && Array.isArray(it.answer_choices))) {
                return parsed;
            }
        } catch (err: any) {
            console.error('[API] generateQuiz JSON parse error:', err.message);
        }
    }

    return fallbackQuiz(goal);
}

// Message handler — dispatch table
const handlers: Record<string, (msg: any) => Promise<any>> = {
    async fetchTranscriptAndCheck(msg) {
        const settings = await getSettings();
        // Use transcript from content script (YouTube captions) if available, else fall back to jina.ai
        const transcript = msg.transcript || await fetchTranscript(msg.videoId);
        if (!transcript) {
            // Without transcript, we should not permissively allow playback. Keep blocking behavior.
            return { ok: false, error: 'no_transcript' };
        }
        const videoUrl = `https://www.youtube.com/watch?v=${msg.videoId}`;
        return checkAlignment(transcript, settings, videoUrl);
    },

    async addUsage(msg) {
        await addUsage(msg.domain, msg.seconds);
        return { ok: true };
    },

    async getRemainingFun() {
        const settings = await getSettings();
        const usedSeconds = await getUsageForDomainToday('youtube.com');
        const limitSeconds = (settings.funLimitMinutes || 0) * 60;
        return { usedSeconds, limitSeconds };
    },

    async getSettings() {
        return getSettings();
    },

    async saveSettings(msg) {
        await saveSettings(msg.settings);
        return { ok: true };
    },

    async validateGoalNemotron(msg) {
        const goal = msg.goal || '';
        const modelName = 'nvidia/nemotron-3-super-120b-a12b:free';
        const prompt = `Decide whether the following user learning goal is educational and sufficiently descriptive for a learning plan. Reply ONLY with a single capital letter on the first line: Y (yes, it's educational/descriptive) or N (no). On the second line provide a very short reason (max 30 words). No other text.\n\nGoal:\n${goal}`;
        const routerResp = await callRouterClassify(prompt, modelName);
        if (routerResp.error) return { ok: false, error: routerResp.error };

        const text = (routerResp.text || '').trim();
        const lines = text.split(/\n+/);
        const letter = (lines[0]?.trim().charAt(0) || '').toUpperCase();
        const reason = lines.slice(1).join(' ').trim();

        if (letter === 'Y' || letter === 'N') return { ok: true, result: letter, reason };

        // Fallback heuristic
        if (!goal || goal.length < 20) return { ok: true, result: 'N', reason: 'Too short' };
        if (goal.split(/\s+/).filter(Boolean).length < 6) return { ok: true, result: 'N', reason: 'Too few words' };
        return { ok: true, result: 'Y', reason: 'Looks ok' };
    },

    async generateQuiz() {
        const settings = await getSettings();
        return generateQuiz(settings);
    },
};

browser.runtime.onMessage.addListener(async (msg: any) => {
    const handler = msg?.type && handlers[msg.type];
    if (handler) return handler(msg);
});

// Open settings page in a new tab when the extension toolbar icon is clicked
function openOptionsInNewTab() {
    // Prefer the options page declared in the manifest (covers dev vs dist layouts)
    const manifest = browser.runtime.getManifest?.();
    const optionsPage = manifest?.options_ui?.page || 'dist/options.html';
    browser.tabs.create({ url: browser.runtime.getURL(optionsPage) });
}

if (browser.browserAction?.onClicked) {
    browser.browserAction.onClicked.addListener(openOptionsInNewTab);
} else if (browser.action?.onClicked) {
    browser.action.onClicked.addListener(openOptionsInNewTab);
}

browser.commands.onCommand.addListener((command: string) => {
    if (command === 'open-settings') openOptionsInNewTab();
});

console.log('Smart Site Blocker background worker loaded');

