/**
 * Project starters for `eligian init` and the extension's "Eligian: New
 * Presentation…" command (audit idea #12).
 *
 * Each starter is a small, complete project that checks without errors or
 * warnings (the CLI test suite checks every one): main.eligian, layout.html,
 * styles.css, a locales file with its `languages` block, a package.json with
 * check / build / fmt scripts, and a README. Shared by the CLI and the
 * extension, so both write the same files.
 */

export type StarterName = 'blank' | 'chapters' | 'video' | 'library';

export interface Starter {
  readonly name: StarterName;
  /** Short label for a picker */
  readonly label: string;
  readonly description: string;
  /** Things the author still has to do (printed after the files are written) */
  readonly notes: readonly string[];
}

export interface StarterOptions {
  /** The presentation's title (default: "My Presentation") */
  readonly title?: string;
  /** The npm package name (default: derived from the title) */
  readonly packageName?: string;
}

/** The file the starters' scripts check and build. */
export const STARTER_ENTRY = 'main.eligian';

export const STARTERS: readonly Starter[] = [
  {
    name: 'blank',
    label: 'Blank',
    description: 'One timeline with a title, a few timed events and play / pause buttons',
    notes: [],
  },
  {
    name: 'chapters',
    label: 'Chapters',
    description:
      'A hub that links to two chapters: on enter / on leave, navigate, key presses and labels',
    notes: [],
  },
  {
    name: 'video',
    label: 'Video',
    description: 'A timeline driven by a video, with captions and play / pause buttons',
    notes: ['Add your video as media/intro.mp4 (or change the path in main.eligian).'],
  },
  {
    name: 'library',
    label: 'Library',
    description: 'A presentation whose reusable actions live in a library file',
    notes: [],
  },
];

/** The starter called `name`, if there is one. */
export function findStarter(name: string): Starter | undefined {
  return STARTERS.find(starter => starter.name === name);
}

/** An npm package name from a title: "My Talk!" → "my-talk". */
export function packageNameFor(title: string): string {
  const name = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name || 'presentation';
}

/**
 * The files of a starter, by relative path (forward slashes), ready to be
 * written into an empty directory.
 */
export function starterFiles(
  name: StarterName,
  options: StarterOptions = {}
): Record<string, string> {
  const title = options.title?.trim() || 'My Presentation';
  const packageName = options.packageName ?? packageNameFor(title);
  const common = {
    'package.json': packageJson(packageName),
    'README.md': readme(title, name),
  };
  switch (name) {
    case 'blank':
      return { ...common, ...blank(title) };
    case 'chapters':
      return { ...common, ...chapters(title) };
    case 'video':
      return { ...common, ...video(title) };
    case 'library':
      return { ...common, ...library(title) };
  }
}

// ---------------------------------------------------------------------------
// Shared files
// ---------------------------------------------------------------------------

function packageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      scripts: {
        check: `eligian check ${STARTER_ENTRY}`,
        build: `eligian ${STARTER_ENTRY} --bundle --force`,
        fmt: `eligian fmt --write ${STARTER_ENTRY}`,
      },
      devDependencies: {
        '@eligian/cli': '*',
      },
    },
    null,
    2
  )}\n`;
}

function readme(title: string, name: StarterName): string {
  const starter = findStarter(name);
  return `# ${title}

An [Eligian](https://github.com/rolandzwaga/eligian) presentation (starter: ${starter?.label}).

- \`main.eligian\` — the presentation: timelines, actions and events
- \`layout.html\` — the HTML the presentation runs in
- \`styles.css\` — the styles (the editor checks class names and selectors against it)
- \`locales.json\` — the texts, per language${name === 'library' ? '\n- `lib/effects.eligian` — reusable actions, imported by main.eligian' : ''}${name === 'video' ? '\n- `media/intro.mp4` — the video (add your own)' : ''}

## Commands

\`\`\`
npm run check   # report errors and warnings
npm run build   # bundle into main.bundle/ (index.html + bundle.js)
npm run fmt     # format main.eligian
\`\`\`

In VS Code with the Eligian extension, *Eligian: Preview Timeline* (Ctrl+K V) shows the
presentation next to the source.
`;
}

const LANGUAGES = `languages {
  * "en-US" "English"
    "nl-NL" "Nederlands"
}`;

const HEADER = `${LANGUAGES}

layout "./layout.html"
styles "./styles.css"
locales "./locales.json"`;

function locales(en: Record<string, unknown>, nl: Record<string, unknown>): string {
  return `${JSON.stringify({ 'en-US': en, 'nl-NL': nl }, null, 2)}\n`;
}

const BASE_CSS = `/* The element the presentation runs in */
#stage {
  position: relative;
  width: 100%;
  min-height: 100vh;
  margin: 0;
  font-family: system-ui, sans-serif;
  color: #1d2433;
  background: #f6f7fb;
}

.title {
  margin: 0;
  padding: 2rem 2rem 0;
  font-size: 2.5rem;
}

/* Hidden until an event adds .is-visible */
.beat {
  margin: 1rem 2rem;
  font-size: 1.5rem;
  opacity: 0;
  transform: translateY(0.5rem);
  transition: opacity 0.4s, transform 0.4s;
}

.is-visible {
  opacity: 1;
  transform: none;
}

.controls {
  position: absolute;
  right: 2rem;
  bottom: 2rem;
  display: flex;
  gap: 0.5rem;
}

.controls button {
  padding: 0.5rem 1rem;
  font: inherit;
}
`;

// ---------------------------------------------------------------------------
// blank
// ---------------------------------------------------------------------------

function blank(title: string): Record<string, string> {
  return {
    'main.eligian': `${HEADER}

/** Show an element: selects it and adds .is-visible */
action reveal(selector: string) [
  selectElement(selector)
  addClass("is-visible")
]

/** Hide an element again */
action conceal(selector: string) [
  selectElement(selector)
  removeClass("is-visible")
]

timeline "${title}" in "#stage" using raf {
  // Runs once when the timeline starts: texts and the playback buttons
  on enter [
    selectElement("#title")
    addController("LabelController", "title")
    on click "#play" toggle
    on click "#restart" seek 0s
  ]

  // Each beat is shown from its start to its end
  at 1s..6s [ reveal("#beat-1") ] [ conceal("#beat-1") ]
  at +0s for 5s [ reveal("#beat-2") ] [ conceal("#beat-2") ]
  at +0s for 5s [ reveal("#beat-3") ] [ conceal("#beat-3") ]
}
`,
    'layout.html': `<div id="stage">
  <h1 id="title" class="title"></h1>
  <p id="beat-1" class="beat">Every event has a start and an end time.</p>
  <p id="beat-2" class="beat">Its start operations run at the start…</p>
  <p id="beat-3" class="beat">…and its end operations at the end.</p>
  <div class="controls">
    <button id="play">Play / pause</button>
    <button id="restart">Restart</button>
  </div>
</div>
`,
    'styles.css': BASE_CSS,
    'locales.json': locales({ title }, { title }),
  };
}

// ---------------------------------------------------------------------------
// chapters
// ---------------------------------------------------------------------------

function chapters(title: string): Record<string, string> {
  return {
    'main.eligian': `${HEADER}

/** Show a view: selects it and adds .is-active */
action showView(selector: string) [
  selectElement(selector)
  addClass("is-active")
]

/** Hide a view again */
action hideView(selector: string) [
  selectElement(selector)
  removeClass("is-active")
]

action reveal(selector: string) [
  selectElement(selector)
  addClass("is-visible")
]

action conceal(selector: string) [
  selectElement(selector)
  removeClass("is-visible")
]

// The hub: a menu of chapters. It has no timed events, so it waits for a click.
timeline "Hub" in "#stage" using raf {
  on enter [
    showView("#hub")
    selectElement("#hub-title")
    addController("LabelController", "hub.title")
    on click "#card-1" navigate "Chapter 1"
    on click "#card-2" navigate "Chapter 2"
  ]
  on leave [ hideView("#hub") ]
}

timeline "Chapter 1" in "#stage" using raf {
  on enter [
    showView("#chapter-1")
    on click "#back-1" navigate "Hub"
    on key "Escape" navigate "Hub"
    // The right arrow skips to the second beat (a label of this timeline)
    on key "ArrowRight" seek second.start
  ]
  on leave [ hideView("#chapter-1") ]

  at 0s for 4s as first [ reveal("#c1-beat-1") ] [ conceal("#c1-beat-1") ]
  at first.end for 4s as second [ reveal("#c1-beat-2") ] [ conceal("#c1-beat-2") ]
}

timeline "Chapter 2" in "#stage" using raf {
  on enter [
    showView("#chapter-2")
    on click "#back-2" navigate "Hub"
    on key "Escape" navigate "Hub"
  ]
  on leave [ hideView("#chapter-2") ]

  at 0s for 4s [ reveal("#c2-beat-1") ] [ conceal("#c2-beat-1") ]
}
`,
    'layout.html': `<div id="stage">
  <section id="hub" class="view">
    <h1 id="hub-title" class="title"></h1>
    <div class="cards">
      <button id="card-1" class="card">Chapter 1</button>
      <button id="card-2" class="card">Chapter 2</button>
    </div>
  </section>

  <section id="chapter-1" class="view">
    <h1 class="title">Chapter 1</h1>
    <p id="c1-beat-1" class="beat">Press → to skip to the next beat.</p>
    <p id="c1-beat-2" class="beat">Press Esc to go back to the hub.</p>
    <div class="controls"><button id="back-1">Back to the hub</button></div>
  </section>

  <section id="chapter-2" class="view">
    <h1 class="title">Chapter 2</h1>
    <p id="c2-beat-1" class="beat">Each chapter is a timeline of its own.</p>
    <div class="controls"><button id="back-2">Back to the hub</button></div>
  </section>
</div>
`,
    'styles.css': `${BASE_CSS}
/* One view at a time: a timeline shows its own view on enter */
.view {
  display: none;
}

.is-active {
  display: block;
}

.cards {
  display: flex;
  gap: 1rem;
  padding: 2rem;
}

.card {
  padding: 2rem 3rem;
  font: inherit;
  font-size: 1.25rem;
  cursor: pointer;
}
`,
    'locales.json': locales({ hub: { title } }, { hub: { title } }),
  };
}

// ---------------------------------------------------------------------------
// video
// ---------------------------------------------------------------------------

function video(title: string): Record<string, string> {
  return {
    'main.eligian': `${HEADER}

action caption(key: string) [
  selectElement("#caption")
  addController("LabelController", key)
  addClass("is-visible")
]

action clearCaption() [
  selectElement("#caption")
  removeClass("is-visible")
]

// The video plays in #player; its playback position drives the events
timeline "${title}" in "#player" using video from "./media/intro.mp4" {
  on enter [
    on click "#play" toggle
    on click "#restart" seek 0s
    on key "space" toggle
  ]

  at 1s..4s [ caption("captions.first") ] [ clearCaption() ]
  at 5s..8s [ caption("captions.second") ] [ clearCaption() ]
}
`,
    'layout.html': `<div id="stage">
  <div id="player"></div>
  <p id="caption" class="beat caption"></p>
  <div class="controls">
    <button id="play">Play / pause</button>
    <button id="restart">Restart</button>
  </div>
</div>
`,
    'styles.css': `${BASE_CSS}
/* Eligius renders a <video class="eligius-video"> into #player; give it a size */
#player .eligius-video {
  display: block;
  width: 100%;
  height: auto;
}

.caption {
  position: absolute;
  left: 2rem;
  bottom: 5rem;
  padding: 0.5rem 1rem;
  color: #fff;
  background: rgb(0 0 0 / 60%);
}
`,
    'locales.json': locales(
      { captions: { first: 'The video drives the timeline.', second: 'Captions follow it.' } },
      { captions: { first: 'De video stuurt de tijdlijn.', second: 'Ondertitels volgen hem.' } }
    ),
  };
}

// ---------------------------------------------------------------------------
// library
// ---------------------------------------------------------------------------

function library(title: string): Record<string, string> {
  return {
    'main.eligian': `${HEADER}

// Actions from a library file: reusable across presentations
import { reveal, conceal } from "./lib/effects.eligian"

timeline "${title}" in "#stage" using raf {
  on enter [
    selectElement("#title")
    addController("LabelController", "title")
    on click "#play" toggle
  ]

  at 1s..5s [ reveal("#beat-1") ] [ conceal("#beat-1") ]
  at +0s for 4s [ reveal("#beat-2") ] [ conceal("#beat-2") ]
}
`,
    'lib/effects.eligian': `library effects

/** Show an element (adds .is-visible) */
action reveal(selector: string) [
  setClass(selector, "is-visible", true)
]

/** Hide an element again */
action conceal(selector: string) [
  setClass(selector, "is-visible", false)
]

/**
 * A private helper: callable inside this library only. It selects the element
 * itself, because what an action selects stays in that action.
 */
private action setClass(selector: string, className: string, visible: boolean) [
  selectElement(selector)
  if (visible) {
    addClass(className)
  } else {
    removeClass(className)
  }
]
`,
    'layout.html': `<div id="stage">
  <h1 id="title" class="title"></h1>
  <p id="beat-1" class="beat">reveal and conceal come from lib/effects.eligian.</p>
  <p id="beat-2" class="beat">A library holds only actions.</p>
  <div class="controls"><button id="play">Play / pause</button></div>
</div>
`,
    'styles.css': BASE_CSS,
    'locales.json': locales({ title }, { title }),
  };
}
