---
id: assets-and-host-modules
title: "Assets and host modules"
kind: workflow
use_cases:
  - "media files, images, placeholders"
see:
  - "host-modules-contract"
  - "provider-choice"
  - "map-imports-and-assets"
  - "project-layout"
card: "Where media, images and HTML fragments go, placeholders, and when to write a host module."
---

# Assets and host modules

## Where each asset is referenced

| Asset | Lives in | Referenced by | Bundled as |
| --- | --- | --- | --- |
| video / audio | `media/` | `using video from "./media/intro.mp4"` | copied, never inlined |
| images in the layout | `assets/` | `<img src="./assets/poster.svg">` in `layout.html` | copied, or inlined when small |
| images in CSS | `assets/` | `url("./assets/bg.png")` in `styles.css` | copied, or inlined when small |
| HTML fragments | next to the program | `import hint from "./hint.html"`, used as `setElementContent(@hint)` | inlined into the configuration at compile time |
| texts | `locales.json` | `locales "./locales.json"`, `LabelController` keys | in the configuration |

Every path is relative to the file that names it: `from` and imports to the `.eligian` file, `src` to `layout.html`, `url()` to the CSS file. No absolute paths or URLs.

## How missing files are reported

`eligian_project` lists every file with `exists`, and its `assets.problems` names what is missing, each with a code, the path and the source position:

- `media-file-missing`: a `from` file of a video or audio timeline does not exist;
- `media-from-duplicate`: two media timelines play the same file;
- `timeline-container-not-in-layout`: a timeline's container is not in `layout.html`;
- `import_file_not_found`: a named import's file does not exist.

`eligian_check` reports the first three as review warnings, so a project with a missing media file does not reach 0 warnings. A missing media file, or a missing image in the layout or the CSS, fails `--bundle` ("Asset not found"), and with it `eligian dev`, which serves the same bundle.

## Placeholders for media you cannot create

When the presentation needs a video, a narration or an image that does not exist yet, do not leave the reference dangling and do not invent a URL. Make a placeholder with the real file name and say in your reply that it must be replaced:

- **Silent audio** (with `ffmpeg` installed): `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 30 -c:a libmp3lame -q:a 9 media/narration.mp3`. Make it as long as the timeline's last beat.
- **A black video with a silent track**: `ffmpeg -f lavfi -i color=c=black:s=1280x720:r=30:d=30 -f lavfi -i anullsrc=r=44100:cl=stereo -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac media/intro.mp4`.
- **An image**: write an SVG file (it is text) with the right aspect ratio and a label, for example `assets/poster.svg` with a `viewBox="0 0 1280 720"`, a filled `rect` and a `text` "Poster placeholder".

Without `ffmpeg`, keep the `from` path, tell the user which file to add, and expect `media-file-missing` (and a failing bundle) until they do. Smoke skips media timelines anyway; the rest of the presentation can be checked and smoked.

A poster before playback is an image in the layout over the player, hidden by a state class when the media timeline's `on enter` runs: Eligian has no `poster` option.

## Controllers that need a package

`LottieController` loads `lottie-web` at runtime, which the presentation project must install: `npm install lottie-web` next to the presentation. Without it, check warns `lottie-web-not-installed`. The other built-in controllers need nothing extra (`controllers` lists them with their status).

## When to write a host module

A host module (`extensions "./host.ts" { … }`) is JavaScript or TypeScript of your own that the presentation calls like a built-in operation or controller. Write one only when no operation does the job:

- **Yes**: reporting to analytics, fetching or computing data the page shows, formatting a value, wrapping a third-party widget (a chart, a map) in a controller.
- **No**: showing, hiding, moving or animating elements (classes and CSS), changing text (`setElementContent`, `LabelController`), timing (ranges on the timeline), navigation (interactions), anything `operations-index` already lists.

Read `operations-index` first; a host module is user code that the checker cannot see into (`host-modules-contract`).

The module is bundled by esbuild for `--bundle`, `eligian dev` and `eligian smoke`; the VS Code preview bundles it only in a trusted workspace. `eligian_smoke` runs smoke in a child process, so the module is executed there, never in the MCP server. A declared name the module does not export is reported by smoke as `smoke-host-export-missing`.

## Order of work

1. Put every asset file in place (or its placeholder) before the timelines reference it.
2. Run `eligian_project`: `assets.problems` is empty, `files` shows every file with `exists: true`.
3. Write the timelines; `eligian_check` keeps the references honest from then on.

see: host-modules-contract, provider-choice, map-imports-and-assets, project-layout
