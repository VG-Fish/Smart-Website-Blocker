// env_reader.ts — lightweight .env loader for the extension
// Usage: const vars = await loadEnv();

declare const browser: any;

async function loadEnv(): Promise<Record<string, string>> {
    try {
        const resp = await fetch(browser.runtime.getURL('.env'));
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

export { loadEnv };
