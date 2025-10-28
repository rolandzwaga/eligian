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

// Build language package as CommonJS bundle (for VS Code extension - REQUIRED)
const ctxCjs = await esbuild.context({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.cjs',
    bundle: true,
    target: 'ES2017',
    format: 'cjs',
    loader: { '.ts': 'ts', '.json': 'json' },
    // Bundle everything except vscode and problematic ESM packages
    external: ['vscode', 'css-tree'],
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins
});

// Build errors module as separate CommonJS bundle (Feature 018 - US1)
const ctxErrors = await esbuild.context({
    entryPoints: ['src/errors/index.ts'],
    outfile: 'dist/errors/index.cjs',
    bundle: true,
    target: 'ES2017',
    format: 'cjs',
    loader: { '.ts': 'ts', '.json': 'json' },
    external: ['vscode', '@eligian/shared-utils'],
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins
});

if (watch) {
    await Promise.all([ctxCjs.watch(), ctxErrors.watch()]);
} else {
    await Promise.all([ctxCjs.rebuild(), ctxErrors.rebuild()]);
    ctxCjs.dispose();
    ctxErrors.dispose();
}
