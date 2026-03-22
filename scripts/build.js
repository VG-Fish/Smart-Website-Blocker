#!/usr/bin/env node
// Build runner — TypeScript check + esbuild bundle + static copy
// Usage: node scripts/build.js [--overwrite-root] [--target=chrome|firefox]

const esbuild = require('esbuild');
const fs = require('fs').promises;
const path = require('path');
const child_process = require('child_process');
const { projectRoot, distRoot, builds, esbuildOptions, copyStatic, copyToRoot } = require('./shared');

async function buildAll(overwriteRoot, target) {
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
            await esbuild.build(esbuildOptions(b, 'production'));
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
            try { await copyToRoot(path.join(distRoot, ext)); } catch { /* skip */ }
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const overwriteRoot = args.includes('--overwrite-root');
    const targetArg = args.find(a => a.startsWith('--target='));
    const target = targetArg ? targetArg.split('=')[1] : 'chrome';
    await buildAll(overwriteRoot, target);
    console.log('\nBuild complete.');
}

main().catch(err => {
    console.error('Build failed:', err?.message);
    process.exit(1);
});
