//@ts-check
// The `eligian` command (dist/cli.mjs), the one file the npm package runs.
//
// The workspace packages (@eligian/language, @eligian/shared-utils) are not
// published: they are bundled in, from their TypeScript sources, together with
// their own dependencies (Langium, Typir, PostCSS, ...). Only this package's
// `dependencies` stay external: npm installs them, and some must be real files
// at runtime (esbuild's binary; eligius and jquery, which `--bundle` bundles
// into a presentation).
//
//   node esbuild.mjs               development: source maps
//   node esbuild.mjs --production  npm (prepack): minified, names kept, no source maps
//   node esbuild.mjs --watch
import { readFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
const minify = production || process.argv.includes('--minify');

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf-8'));

/** The workspace packages, by import specifier: their TypeScript entry points */
const WORKSPACE_SOURCES = {
  '@eligian/language': '../language/src/index.ts',
  '@eligian/language/eligius-lint': '../language/src/compiler/eligius-lint.ts',
  '@eligian/language/errors': '../language/src/errors/index.ts',
  '@eligian/shared-utils': '../shared-utils/src/index.ts',
};

/** @type {esbuild.Plugin} */
const workspaceSources = {
  name: 'workspace-sources',
  setup(build) {
    build.onResolve({ filter: /^@eligian\// }, args => {
      const source = WORKSPACE_SOURCES[args.path];
      if (!source) {
        return { errors: [{ text: `No source entry for the workspace import '${args.path}'` }] };
      }
      return { path: path.join(here, source) };
    });
  },
};

const success = watch ? 'Watch build succeeded' : 'Build succeeded';

function getTime() {
  const date = new Date();
  return `[${`${padZeroes(date.getHours())}:${padZeroes(date.getMinutes())}:${padZeroes(date.getSeconds())}`}] `;
}

function padZeroes(i) {
  return i.toString().padStart(2, '0');
}

const plugins = [
  workspaceSources,
  {
    name: 'watch-plugin',
    setup(build) {
      build.onEnd(result => {
        if (result.errors.length === 0) {
          console.log(getTime() + success);
        }
      });
    },
  },
];

// Nothing stale (an old source map) in a published package
if (production) rmSync(path.join(here, 'dist'), { recursive: true, force: true });

const cliCtx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/cli.mjs',
  bundle: true,
  target: 'ES2022', // ES2022 supports top-level await
  format: 'esm', // ESM format required for top-level await and import.meta
  loader: { '.ts': 'ts' },
  platform: 'node',
  // This package's dependencies and their subpaths (eligius/lint, ...)
  external: Object.keys(pkg.dependencies ?? {}).flatMap(name => [name, `${name}/*`]),
  // Bundled CommonJS dependencies may call require() for Node built-ins
  banner: {
    js: "import { createRequire as __eligianCreateRequire } from 'node:module';\nconst require = __eligianCreateRequire(import.meta.url);",
  },
  sourcemap: !minify,
  minify,
  // Readable error messages and stack traces from the minified build
  keepNames: minify,
  plugins,
});

if (watch) {
  await cliCtx.watch();
} else {
  await cliCtx.rebuild();
  cliCtx.dispose();
}
