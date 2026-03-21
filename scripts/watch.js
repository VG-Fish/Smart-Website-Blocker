#!/usr/bin/env node
// Watch runner (Node.js) - uses esbuild watch API to rebuild on changes and copies static files
// Usage:
//   node scripts/watch.js         -> run watcher (long-running)
//   node scripts/watch.js --once  -> build once and exit
//   node scripts/watch.js --overwrite-root -> also overwrite root runtime files

const esbuild = require('esbuild');
const fs = require('fs').promises;
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');
const distRoot = path.join(projectRoot, 'dist');

const builds = [
    { entry: path.join(srcRoot, 'background', 'background.ts'), outfile: path.join(distRoot, 'background.js') },
    { entry: path.join(srcRoot, 'content', 'content_script.ts'), outfile: path.join(distRoot, 'content_script.js') },
    { entry: path.join(srcRoot, 'ui', 'popup.ts'), outfile: path.join(distRoot, 'popup.js') },
    { entry: path.join(srcRoot, 'ui', 'options.ts'), outfile: path.join(distRoot, 'options.js') }
];

async function copyStatic() {
    const staticFiles = [
        { src: path.join(srcRoot, 'ui', 'popup.html'), dest: path.join(distRoot, 'popup.html') },
        { src: path.join(srcRoot, 'ui', 'options.html'), dest: path.join(distRoot, 'options.html') },
        { src: path.join(srcRoot, 'ui', 'styles.css'), dest: path.join(distRoot, 'styles.css') }
    ];
    await fs.mkdir(distRoot, { recursive: true });
    for (const f of staticFiles) {
        try {
            await fs.copyFile(f.src, f.dest);
            console.log(`Copied static: ${path.relative(projectRoot, f.src)} -> ${path.relative(projectRoot, f.dest)}`);
        } catch (err) {
            console.warn('Skipping static copy (missing?):', f.src, err && err.message);
        }
    }
}

async function buildOnce(overwriteRoot) {
    for (const b of builds) {
        try {
            await esbuild.build({
                entryPoints: [b.entry],
                bundle: true,
                platform: 'browser',
                target: ['es2020'],
                format: 'iife',
                sourcemap: true,
                outfile: b.outfile,
                define: { 'process.env.NODE_ENV': '"development"' }
            });
            console.log(`Built: ${path.relative(projectRoot, b.entry)} -> ${path.relative(projectRoot, b.outfile)}`);
            if (overwriteRoot) {
                const rootDest = path.join(projectRoot, path.basename(b.outfile));
                await fs.copyFile(b.outfile, rootDest);
                console.log(`Also copied to root: ${path.relative(projectRoot, rootDest)}`);
            }
        } catch (err) {
            console.error('esbuild failed for', b.entry, err && err.message);
        }
    }
    await copyStatic();
}

async function main() {
    const args = process.argv.slice(2);
    const overwriteRoot = args.includes('--overwrite-root');
    const once = args.includes('--once');

    if (once) {
        await buildOnce(overwriteRoot);
        console.log('\nWatch: ran --once and exiting.');
        process.exit(0);
    }

    // Start watch builds using esbuild's watch API
    console.log('Starting watch (esbuild) for TypeScript sources...');
    for (const b of builds) {
        esbuild.build({
            entryPoints: [b.entry],
            bundle: true,
            platform: 'browser',
            target: ['es2020'],
            format: 'iife',
            sourcemap: true,
            outfile: b.outfile,
            define: { 'process.env.NODE_ENV': '"development"' },
            watch: {
                onRebuild(error, result) {
                    if (error) console.error('Watch build failed:', error);
                    else console.log(`Rebuilt: ${path.relative(projectRoot, b.entry)} -> ${path.relative(projectRoot, b.outfile)}`);
                }
            }
        }).catch(e => console.error('Failed to start watch for', b.entry, e && e.message));
    }

    // Copy static files once and then watch for changes via the esbuild watch above
    await copyStatic();
}

main().catch(err => {
    console.error('Watcher failed:', err && err.message);
    process.exit(1);
});
