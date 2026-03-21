// background.ts — service worker (converted to TypeScript)
// Responsibilities:
// - Handle transcript fetch + OpenRouter alignment checks
// - Persist settings and usage data
// - Generate quizzes (via OpenRouter if key is present)

// If bundling, import loadEnv from utils; kept as a normal import here.
import { loadEnv } from '../utils/env_reader';

declare const browser: any;

// Background loads .env when available. .env should be in the extension root and is ignored by git.
let ENV_VARS: Record<string, string> = {};
loadEnv().then(e => { ENV_VARS = e; }).catch(() => { });

const STORAGE_KEYS = {
    SETTINGS: 'ss_settings',
    USAGE: 'ss_usage'
};

async function getSettings(): Promise<any> {
    const data = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
    return data[STORAGE_KEYS.SETTINGS] || {
        goals: [],
        isEducationalGoal: false,
        funLimitMinutes: 30,
        blockingEnabled: true,
        // API keys should be provided via local .env (OPENROUTER_API_KEY / OPENROUTER_URL)
    };
}

async function saveSettings(settings: any): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

async function getUsage(): Promise<any> {
    const data = await browser.storage.local.get(STORAGE_KEYS.USAGE);
    return data[STORAGE_KEYS.USAGE] || {};
}

async function addUsage(domain: string, seconds: number): Promise<void> {
    const usage = await getUsage();
    const today = new Date().toISOString().slice(0, 10);
    usage[today] = usage[today] || {};
    usage[today][domain] = (usage[today][domain] || 0) + seconds;
    await browser.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });
}

async function getUsageForDomainToday(domain: string): Promise<number> {
    const usage = await getUsage();
    const today = new Date().toISOString().slice(0, 10);
    return (usage[today] && usage[today][domain]) || 0;
}

// Attempt to fetch a transcript for a YouTube video ID.
// Fallback: use a light HTML fetch via r.jina.ai to extract page text.
async function fetchTranscript(videoId: string): Promise<string | null> {
    try {
        const url = `https://r.jina.ai/http://youtube.com/watch?v=${videoId}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('r.jina.ai fetch failed');
        const text = await resp.text();
        return text;
    } catch (err) {
        console.warn('Transcript fetch failed', err);
        return null;
    }
}

async function callRouterClassify(prompt: string, settings: any): Promise<any> {
    const key = ENV_VARS.OPENROUTER_API_KEY || null;
    const routerUrl = ENV_VARS.OPENROUTER_URL || 'https://api.openrouter.ai/v1/responses';
    if (!key) return { error: 'no_api_key' };

    try {
        const body = {
            model: 'gpt-4o-mini',
            input: prompt
        };

        const resp = await fetch(routerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(body)
        });
        if (!resp.ok) {
            const text = await resp.text();
            return { error: 'router_error', detail: text };
        }
        const data = await resp.json();
        let out = '';
        if (data.output && Array.isArray(data.output)) {
            out = data.output.map((o: any) => (o.content || '').toString()).join('\n');
        } else if (data.choices && data.choices[0]) {
            out = data.choices[0].message?.content || data.choices[0].text || '';
        } else if (data?.result?.output_text) {
            out = data.result.output_text;
        }
        return { text: out };
    } catch (err: any) {
        return { error: 'router_exception', detail: err.message };
    }
}

async function checkAlignment(videoId: string, transcript: string, settings: any): Promise<any> {
    const goals = Array.isArray(settings.goals) ? settings.goals : (settings.goal ? [settings.goal] : []);
    if (goals.length === 0) return { ok: true, aligned: false, score: 0, reasons: 'no goals set' };

    const goalsList = goals.map((g: string, i: number) => `${i + 1}. ${g}`).join('\n');
    const prompt = `You are given a user's learning goals (they may have several). Decide whether the following YouTube video transcript satisfies at least one of the goals. Reply ONLY in JSON with keys: aligned (true/false), score (0-1), matchedGoal (index starting at 0 if matched), reasons (short string). Goals:\n${goalsList}\n\nTranscript:\n\n${transcript}`;

    const routerResp = await callRouterClassify(prompt, settings);
    if (routerResp.error) return { ok: false, error: routerResp.error, detail: routerResp.detail };

    try {
        const jsonStart = routerResp.text.indexOf('{');
        const jsonEnd = routerResp.text.lastIndexOf('}');
        const jsonStr = jsonStart >= 0 && jsonEnd >= 0 ? routerResp.text.slice(jsonStart, jsonEnd + 1) : routerResp.text;
        const parsed = JSON.parse(jsonStr);
        return { ok: true, aligned: !!parsed.aligned, score: parsed.score || 0, matchedGoal: parsed.matchedGoal, reasons: parsed.reasons || '' };
    } catch (err) {
        const lc = (transcript || '').toLowerCase();
        for (let i = 0; i < goals.length; i++) {
            const goal = (goals[i] || '').toLowerCase();
            const goalWords = goal.split(/\s+/).filter(Boolean);
            const matches = goalWords.filter((w: string) => lc.includes(w)).length;
            const threshold = Math.max(1, Math.floor(goalWords.length / 2));
            if (matches >= threshold) {
                return { ok: true, aligned: true, score: 0.6, matchedGoal: i, reasons: 'fallback keyword match' };
            }
        }
        return { ok: true, aligned: false, score: 0.1, reasons: 'no keyword matches' };
    }
}

async function generateQuiz(settings: any): Promise<any> {
    const goals = Array.isArray(settings.goals) ? settings.goals : (settings.goal ? [settings.goal] : []);
    const goal = goals.length > 0 ? goals[0] : 'your stated goal';
    if (!ENV_VARS.OPENROUTER_API_KEY) {
        return {
            questions: [
                { q: `What is your learning goal? (short answer)`, type: 'short' },
                { q: `Name one core topic related to: ${goal}`, type: 'short' },
                { q: `Why is this goal valuable?`, type: 'short' },
                { q: `Give one resource you could use to learn ${goal}`, type: 'short' },
                { q: `How will you practice what you learn about ${goal}?`, type: 'short' }
            ]
        };
    }
    const prompt = `Create 5 short quiz questions (mix of multiple-choice and short answer) about the learning goal: "${goal}". For each question return JSON with keys: q, type (mc or short), options (if mc). Return as JSON: {"questions":[...]}.`;
    const routerResp = await callRouterClassify(prompt, settings);
    if (routerResp.error) return { questions: [] };
    try {
        const jsonStart = routerResp.text.indexOf('{');
        const jsonEnd = routerResp.text.lastIndexOf('}');
        const jsonStr = jsonStart >= 0 && jsonEnd >= 0 ? routerResp.text.slice(jsonStart, jsonEnd + 1) : routerResp.text;
        const parsed = JSON.parse(jsonStr);
        return parsed;
    } catch (err) {
        return { questions: [] };
    }
}

// Message handler
browser.runtime.onMessage.addListener(async (msg: any, sender: any) => {
    if (msg && msg.type === 'fetchTranscriptAndCheck') {
        const { videoId } = msg;
        const settings = await getSettings();
        const transcript = await fetchTranscript(videoId);
        if (!transcript) return { ok: false, error: 'no_transcript' };
        const result = await checkAlignment(videoId, transcript, settings);
        return result;
    }

    if (msg && msg.type === 'addUsage') {
        const { domain, seconds } = msg;
        await addUsage(domain, seconds);
        return { ok: true };
    }

    if (msg && msg.type === 'getRemainingFun') {
        const settings = await getSettings();
        const usedSeconds = await getUsageForDomainToday('youtube.com');
        const limitSeconds = (settings.funLimitMinutes || 0) * 60;
        return { usedSeconds, limitSeconds };
    }

    if (msg && msg.type === 'getSettings') {
        const s = await getSettings();
        return s;
    }

    if (msg && msg.type === 'saveSettings') {
        await saveSettings(msg.settings);
        return { ok: true };
    }

    if (msg && msg.type === 'generateQuiz') {
        const settings = await getSettings();
        const quiz = await generateQuiz(settings);
        return quiz;
    }
});

// Quick startup
console.log('Smart Site Blocker background worker (src copy) loaded');

export { };
