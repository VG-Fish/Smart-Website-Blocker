#!/usr/bin/env node
// Watch runner — esbuild watch API for rapid rebuilds
// Usage: node scripts/watch.js [--once] [--overwrite-root]

const esbuild = require('esbuild');
const path = require('path');
const { projectRoot, builds, esbuildOptions, copyStatic, copyToRoot } = require('./shared');

async function buildOnce(overwriteRoot) {
    for (const b of builds) {
        try {
            await esbuild.build(esbuildOptions(b, 'development'));
            console.log(`Built: ${path.relative(projectRoot, b.entry)} -> ${path.relative(projectRoot, b.outfile)}`);
            if (overwriteRoot) await copyToRoot(b.outfile);
        } catch (err) {
            console.error('esbuild failed for', b.entry, err?.message);
        }
    }
    await copyStatic();
}

async function main() {
    const args = process.argv.slice(2);
    const overwriteRoot = args.includes('--overwrite-root');

    if (args.includes('--once')) {
        await buildOnce(overwriteRoot);
        console.log('\nWatch: ran --once and exiting.');
        process.exit(0);
    }

    console.log('Starting watch (esbuild) for TypeScript sources…');
    for (const b of builds) {
        esbuild.build({
            ...esbuildOptions(b, 'development'),
            watch: {
                onRebuild(error) {
                    if (error) console.error('Watch build failed:', error);
                    else console.log(`Rebuilt: ${path.relative(projectRoot, b.entry)} -> ${path.relative(projectRoot, b.outfile)}`);
                },
            },
        }).catch(e => console.error('Failed to start watch for', b.entry, e?.message));
    }

    await copyStatic();
}

main().catch(err => {
    console.error('Watcher failed:', err?.message);
    process.exit(1);
});
