// env_reader.ts (source copy, converted to TypeScript)
// Lightweight .env loader for the extension. No dependencies.
// Usage: call `await loadEnv()` from background/service worker or other extension scripts.

declare const browser: any;

async function loadEnv(): Promise<Record<string, string>> {
    try {
        const url = browser.runtime.getURL('.env');
        const resp = await fetch(url);
        if (!resp.ok) return {};
        const text = await resp.text();
        const obj: Record<string, string> = {};
        for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const idx = trimmed.indexOf('=');
            if (idx === -1) continue;
            const key = trimmed.slice(0, idx).trim();
            let val = trimmed.slice(idx + 1).trim();
            // remove optional surrounding quotes
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            obj[key] = val;
        }
        return obj;
    } catch (err) {
        console.warn('loadEnv failed', err);
        return {};
    }
}

// expose in global scope when included directly in a worker via bundling or copy
// (if used as a module, export it instead)
export { loadEnv };
