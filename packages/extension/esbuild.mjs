//@ts-check
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const success = watch ? 'Watch build succeeded' : 'Build succeeded';

function getTime() {
    const date = new Date();
    return `[${`${padZeroes(date.getHours())}:${padZeroes(date.getMinutes())}:${padZeroes(date.getSeconds())}`}] `;
}

function padZeroes(i) {
    return i.toString().padStart(2, '0');
}

const plugins = [{
    name: 'watch-plugin',
    setup(build) {
        build.onEnd(result => {
            if (result.errors.length === 0) {
                console.log(getTime() + success);
            }
        });
    },
}];

// Build extension and language server (Node.js)
const ctx = await esbuild.context({
    // Entry points for the vscode extension and the language server
    entryPoints: ['src/extension/main.ts', 'src/language/main.ts'],
    outdir: 'out',
    bundle: true,
    target: "ES2017",
    // VSCode's extension host is still using cjs, so we need to transform the code
    format: 'cjs',
    // To prevent confusing node, we explicitly use the `.cjs` extension
    outExtension: {
        '.js': '.cjs'
    },
    loader: { '.ts': 'ts' },
    external: ['vscode', 'css-tree'],
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins
});

// Build webview script (Browser)
const webviewCtx = await esbuild.context({
    entryPoints: ['media/preview.ts'],
    outdir: 'out/media',
    bundle: true,
    target: 'es2020',
    format: 'iife',
    platform: 'browser',
    sourcemap: !minify,
    minify,
    // Provide empty stubs for Node.js modules (not used in browser context)
    alias: {
        'node:fs': './media/empty-stub.ts',
        'node:path': './media/empty-stub.ts'
    },
    plugins
});

if (watch) {
    await ctx.watch();
    await webviewCtx.watch();
} else {
    await ctx.rebuild();
    await webviewCtx.rebuild();
    ctx.dispose();
    webviewCtx.dispose();
}
