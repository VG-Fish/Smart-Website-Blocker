#!/usr/bin/env node
// Build runner — TypeScript check + esbuild bundle + static copy + SonarCloud scan
// Usage: node scripts/build.js [--overwrite-root] [--target=chrome|firefox] [--skip-sonar] [--check-sonar-only]

const esbuild = require('esbuild');
const fs = require('fs').promises;
const fsSync = require('fs');
const https = require('https');
const path = require('path');
const child_process = require('child_process');
const { projectRoot, distRoot, builds, esbuildOptions, copyStatic, copyToRoot } = require('./shared');

/** Read a single key from a .env file (no third-party dep needed). */
function readEnvKey(envPath, key) {
    try {
        const lines = fsSync.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
            const [k, ...rest] = trimmed.split('=');
            if (k.trim() === key) return rest.join('=').trim();
        }
    } catch (err) {
        console.warn(`Could not read ${envPath}:`, err?.message);
    }
    return null;
}

/** Read a key from sonar-project.properties (gitignored, local only). */
function readSonarProp(key) {
    try {
        const lines = fsSync.readFileSync(path.join(projectRoot, 'sonar-project.properties'), 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
            const [k, ...rest] = trimmed.split('=');
            if (k.trim() === key) return rest.join('=').trim();
        }
    } catch (err) { console.warn('Could not read sonar-project.properties:', err?.message); }
    return null;
}

/** Fetch open SonarCloud issues and print a summary. Token read from env/`.env` only. */
async function checkSonarIssues() {
    const token = process.env.SONAR_TOKEN || readEnvKey(path.join(projectRoot, '.env'), 'SONAR_TOKEN');
    const projectKey = readSonarProp('sonar.projectKey');

    if (!token) { console.error('[sonar:check] SONAR_TOKEN not set (add to .env or environment).'); process.exit(1); }
    if (!projectKey) { console.error('[sonar:check] sonar.projectKey not found in sonar-project.properties.'); process.exit(1); }

    const url = `https://sonarcloud.io/api/issues/search?projectKeys=${encodeURIComponent(projectKey)}&resolved=false&ps=100`;
    const auth = Buffer.from(`${token}:`).toString('base64');

    const body = await new Promise((resolve, reject) => {
        https.get(url, { headers: { Authorization: `Basic ${auth}` } }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });

    let parsed;
    try { parsed = JSON.parse(body); } catch { console.error('[sonar:check] Failed to parse API response.'); process.exit(1); }

    const issues = parsed.issues || [];
    if (issues.length === 0) {
        console.log('\n[sonar:check] No open issues — quality gate clean.');
        return;
    }

    const bySeverity = {};
    for (const issue of issues) {
        const sev = issue.severity || 'UNKNOWN';
        bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    }
    const order = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
    const summary = order.filter(s => bySeverity[s]).map(s => `${s}: ${bySeverity[s]}`).join('  ');
    console.log(`\n[sonar:check] ${issues.length} open issue(s) — ${summary}`);

    for (const issue of issues) {
        const file = (issue.component || '').split(':').pop();
        const line = issue.line ? `:${issue.line}` : '';
        console.log(`  [${issue.severity}] ${file}${line} — ${issue.message}`);
    }
    console.log('');
}

async function runSonar() {
    // Prefer SONAR_TOKEN already in environment; fall back to .env file
    const sonarToken = process.env.SONAR_TOKEN
        || readEnvKey(path.join(projectRoot, '.env'), 'SONAR_TOKEN');
    const env = { ...process.env };
    if (sonarToken) env.SONAR_TOKEN = sonarToken;
    console.log('Running SonarCloud scan…');
    try {
        child_process.execSync(
            'npx @sonar/scan' +
            ' -Dsonar.nodejs.executable=' + process.execPath +
            ' -Dsonar.javascript.node.maxspace=4096',
            { stdio: 'inherit', cwd: projectRoot, env }
        );
        console.log('SonarCloud scan complete.');
    } catch (err) {
        console.error('SonarCloud scan failed:', err?.message);
        process.exit(err.status || 1);
    }
}

async function buildAll(overwriteRoot, target, skipSonar, debug = false) {
    // TypeScript check first
    try {
        console.log('Running TypeScript compiler…');
        child_process.execSync('npx tsc', { stdio: 'inherit', cwd: projectRoot });
        console.log('TypeScript OK.');
    } catch (err) {
        console.error('TypeScript compilation failed. Aborting.');
        process.exit(err.status || 1);
    }

    await fs.mkdir(distRoot, { recursive: true });

    // Bundle
    for (const b of builds) {
        try {
            await esbuild.build(esbuildOptions(b, 'production', debug));
            console.log(`Built: ${path.relative(projectRoot, b.entry)} -> ${path.relative(projectRoot, b.outfile)}`);
            if (overwriteRoot) await copyToRoot(b.outfile);
        } catch (err) {
            console.error('esbuild failed for', b.entry, err?.message);
            process.exit(1);
        }
    }

    await copyStatic();

    // Copy manifest for target
    const manifestName = target === 'firefox' ? 'manifest.json' : 'manifest.dev.json';
    const manifestSrc = path.join(projectRoot, manifestName);
    try {
        await fs.copyFile(manifestSrc, path.join(distRoot, 'manifest.json'));
        console.log(`Copied manifest (${target}): ${manifestName}`);
        if (overwriteRoot) await copyToRoot(path.join(distRoot, 'manifest.json'));
    } catch (err) {
        console.warn('Could not copy manifest:', err?.message);
    }

    if (overwriteRoot) {
        for (const ext of ['popup.html', 'options.html', 'styles.css']) {
            try { await copyToRoot(path.join(distRoot, ext)); } catch (err) { console.warn('Could not copy file:', err?.message); }
        }
    }

    if (!skipSonar) {
        await runSonar();
        await checkSonarIssues();
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--check-sonar-only')) {
        await checkSonarIssues();
        return;
    }

    const overwriteRoot = args.includes('--overwrite-root');
    const skipSonar = args.includes('--skip-sonar');
    const debug = args.includes('--debug');
    const targetArg = args.find(a => a.startsWith('--target='));
    const target = targetArg ? targetArg.split('=')[1] : 'chrome';
    await buildAll(overwriteRoot, target, skipSonar, debug);
    console.log('\nBuild complete.');
}

main().catch(err => {
    console.error('Build failed:', err?.message);
    process.exit(1);
});
