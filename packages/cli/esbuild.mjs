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

// Build CLI as ESM bundle (needed for top-level await)
const ctx = await esbuild.context({
    entryPoints: ['src/main.ts'],
    outfile: 'dist/cli.mjs',
    bundle: true,
    target: 'ES2022',  // ES2022 supports top-level await
    format: 'esm',  // ESM format required for top-level await and import.meta
    loader: { '.ts': 'ts' },
    // Don't bundle any node_modules dependencies - only bundle CLI source code
    packages: 'external',
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins
});

if (watch) {
    await ctx.watch();
} else {
    await ctx.rebuild();
    ctx.dispose();
}
