#!/usr/bin/env node
// Build runner (Node.js) - bundles TypeScript sources with esbuild and copies static files
// Usage: node scripts/build.js [--overwrite-root]

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

async function ensureDir(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

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

async function buildAll(overwriteRoot) {
    await fs.mkdir(distRoot, { recursive: true });

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
                define: { 'process.env.NODE_ENV': '"production"' }
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
    if (overwriteRoot) {
        try {
            await fs.copyFile(path.join(distRoot, 'popup.html'), path.join(projectRoot, 'popup.html'));
            await fs.copyFile(path.join(distRoot, 'options.html'), path.join(projectRoot, 'options.html'));
            await fs.copyFile(path.join(distRoot, 'styles.css'), path.join(projectRoot, 'styles.css'));
        } catch (_) { /* ignore */ }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const overwriteRoot = args.includes('--overwrite-root');
    await buildAll(overwriteRoot);
    console.log('\nBuild complete.');
}

main().catch(err => {
    console.error('Build script failed:', err && err.message);
    process.exit(1);
});
