// shared.js — common config for build and watch scripts

const path = require('path');
const fs = require('fs').promises;

const projectRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');
const distRoot = path.join(projectRoot, 'dist');

const entryPoints = [
    { entry: 'background/background.ts', out: 'background.js' },
    { entry: 'content/content_script.ts', out: 'content_script.js' },
    { entry: 'ui/popup.ts', out: 'popup.js' },
    { entry: 'ui/options.ts', out: 'options.js' },
];

const builds = entryPoints.map(e => ({
    entry: path.join(srcRoot, e.entry),
    outfile: path.join(distRoot, e.out),
}));

const staticFiles = [
    { src: path.join(srcRoot, 'ui', 'popup.html'), dest: path.join(distRoot, 'popup.html') },
    { src: path.join(srcRoot, 'ui', 'options.html'), dest: path.join(distRoot, 'options.html') },
    { src: path.join(srcRoot, 'ui', 'styles.css'), dest: path.join(distRoot, 'styles.css') },
];

function esbuildOptions(b, env = 'production') {
    return {
        entryPoints: [b.entry],
        bundle: true,
        platform: 'browser',
        target: ['es2020'],
        format: 'iife',
        sourcemap: true,
        outfile: b.outfile,
        define: { 'process.env.NODE_ENV': `"${env}"` },
    };
}

async function copyStatic() {
    await fs.mkdir(distRoot, { recursive: true });
    for (const f of staticFiles) {
        try {
            await fs.copyFile(f.src, f.dest);
            console.log(`Copied: ${path.relative(projectRoot, f.src)} -> ${path.relative(projectRoot, f.dest)}`);
        } catch (err) {
            console.warn('Skipping (missing?):', f.src, err?.message);
        }
    }
}

async function copyToRoot(filePath) {
    const dest = path.join(projectRoot, path.basename(filePath));
    await fs.copyFile(filePath, dest);
    console.log(`Copied to root: ${path.relative(projectRoot, dest)}`);
}

module.exports = { projectRoot, srcRoot, distRoot, builds, staticFiles, esbuildOptions, copyStatic, copyToRoot };
