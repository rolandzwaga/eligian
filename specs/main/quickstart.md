# Quickstart Guide: Eligian DSL

**Date**: 2025-10-16 (Updated)
**Audience**: Developers new to Eligian DSL

## Overview

This guide walks through setting up the Eligian DSL toolchain, writing your first DSL program, and compiling it to Eligius JSON configuration.

## Prerequisites

- **Node.js**: v20 or later (LTS recommended)
- **pnpm**: v8 or later (package manager)
- **VS Code**: v1.80 or later (for extension)
- **Eligius Library**: v1.x (for running compiled configs)

## Installation

### 1. Install Compiler CLI

```bash
npm install -g @eligian/cli

# Verify installation
eligian --version
# Output: Eligian CLI v1.0.0
```

### 2. Install VS Code Extension

**Option A: Marketplace** (when published):
```
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Eligian"
4. Click Install
```

**Option B: From VSIX**:
```bash
# Download .vsix file
code --install-extension eligian-1.0.0.vsix
```

### 3. Project Setup

```bash
# Create new project
mkdir my-eligius-presentation
cd my-eligius-presentation

# Initialize npm project
npm init -y

# Install Eligius library
npm install eligius

# Create project structure
mkdir src dist
```

## Your First DSL Program

### Step 1: Create DSL File

Create `src/presentation.eligian`:

```eligian
// Eligius DSL Example - Video Presentation

// Define reusable endable actions
endable action showTitle [
  selectElement("#title")
  addClass("visible")
  setStyle({opacity: 0})
  animate({opacity: 1}, 500)
] [
  animate({opacity: 0}, 500)
  removeClass("visible")
]

endable action showSubtitle [
  selectElement("#subtitle")
  addClass("visible")
  setStyle({opacity: 0, transform: "translateX(-20px)"})
  animate({opacity: 1, transform: "translateX(0px)"}, 300)
] [
  animate({opacity: 0}, 300)
  removeClass("visible")
]

endable action showContent [
  selectElement("#content-area")
  addClass("visible")
] [
  removeClass("visible")
]

// Define timeline with video provider
timeline "main" using video from "presentation.mp4" {
  // Intro (0-5 seconds)
  at 0s..5s {
    showTitle()
  }

  at 0s..5s {
    showSubtitle()
  }

  // Main content (5-120 seconds)
  at 5s..120s {
    showContent()
  }

  at 5s..120s [
    selectElement("#diagram")
    addClass("ready")
  ] [
    removeClass("ready")
  ]

  // Outro (120-130 seconds)
  at 120s..130s [
    selectElement("#credits")
    addClass("visible")
    setStyle({transform: "translateY(30px)", opacity: 0})
    animate({transform: "translateY(0px)", opacity: 1}, 500)
  ] [
    removeClass("visible")
  ]
}
```

### Step 2: Compile to JSON

**Using CLI**:
```bash
eligian compile src/presentation.eligian -o dist/config.json

# Output:
# ✓ Compiled successfully (45ms)
# Output written to dist/config.json (2.1 KB)
```

**Using VS Code**:
```
1. Open src/presentation.eligian in VS Code
2. Right-click and select "Compile Eligian File"
3. Check Output panel for results
```

### Step 3: Run with Eligius

Create `index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Eligius Presentation</title>
  <style>
    #title, #subtitle, #content-area, #credits { display: none; opacity: 0; }
    video { width: 100%; }
  </style>
</head>
<body>
  <video id="video" src="presentation.mp4" controls></video>
  <div id="title">Welcome to Eligius</div>
  <div id="subtitle">Story Telling Engine</div>
  <div id="content-area">Main Content Here</div>
  <div id="diagram">Diagram Area</div>
  <div id="credits">Created with Eligian DSL</div>

  <script type="module">
    import { Eligius } from './node_modules/eligius/dist/index.js'
    import config from './dist/config.json' assert { type: 'json' }

    const eligius = new Eligius(config)
    eligius.start()
  </script>
</body>
</html>
```

Open `index.html` in browser and play the video. Elements will appear/disappear at specified times!

## DSL Syntax Overview

### Timeline Declaration

```eligian
timeline <NAME_STRING> using <provider> from <source> {
  // timeline events
}
```

**Providers**:
- `video`: Video file timeline
- `audio`: Audio file timeline
- `raf`: RequestAnimationFrame loop
- `custom`: Custom provider (requires config)

**Examples**:
```eligian
timeline "main" using video from "video.mp4" { ... }
timeline "audio-sync" using audio from "podcast.mp3" { ... }
timeline "presentation" using raf { ... }  // No source needed for RAF
```

### Endable Action Definitions

Endable actions have **start operations** (what happens when the action begins) and **end operations** (what happens when it ends):

```eligian
endable action <actionName> [
  // start operations
] [
  // end operations
]
```

**Example**:
```eligian
endable action fadeInElement [
  selectElement(".target")
  addClass("visible")
  setStyle({opacity: 0})
  animate({opacity: 1}, 500)
] [
  animate({opacity: 0}, 500)
  removeClass("visible")
]
```

### Timeline Events

Timeline events use time ranges and can invoke endable actions:

```eligian
at <start>..<end> {
  actionName()
}

// OR inline endable action
at <start>..<end> [
  // start operations
] [
  // end operations
]
```

**Examples**:
```eligian
// Named action invocation
at 0s..5s {
  fadeInElement()
}

// Inline endable action
at 10s..15s [
  selectElement("#box")
  addClass("visible")
] [
  removeClass("visible")
]
```

### Time Expressions

Time values require units:

```eligian
at 0s..5s      // 0 to 5 seconds
at 100ms..500ms // 100 to 500 milliseconds
at 0s..3m      // 0 to 3 minutes
at 1s..1.5s    // 1 to 1.5 seconds (decimal allowed)
```

**Units**: `ms` (milliseconds), `s` (seconds), `m` (minutes), `h` (hours)

### Operation Calls

All operations use function-style syntax with parentheses:

```eligian
selectElement(".selector")
addClass("className")
animate({opacity: 1}, 500)
wait(200)  // delay in milliseconds
```

### Property Chain References

Access runtime data with `$` prefix:

```eligian
$scope.currentItem
$operationdata.selectedElement
$globaldata.userSettings
```

**Example**:
```eligian
when($operationdata.count > 5)
  setStyle({color: $globaldata.theme.primaryColor})
endWhen()
```

### Comments

```eligian
// Single-line comment

/* Multi-line
   comment */
```

## Common Use Cases

### 1. Video Annotation

```eligian
endable action showAnnotation [
  selectElement(".annotation")
  addClass("visible")
  setStyle({opacity: 0})
  animate({opacity: 1}, 300)
] [
  animate({opacity: 0}, 300)
  removeClass("visible")
]

timeline "tutorial" using video from "tutorial.mp4" {
  at 0s..10s {
    showAnnotation()
  }

  at 10s..25s [
    selectElement("#annotation2")
    addClass("visible")
  ] [
    removeClass("visible")
  ]
}
```

### 2. Presentation Slides

```eligian
endable action showSlide [
  selectElement(".slide")
  addClass("active")
] [
  removeClass("active")
]

timeline "presentation" using raf {
  at 0s..5s {
    showSlide()
  }

  at 5s..10s [
    selectElement("#slide2")
    addClass("active")
    setStyle({opacity: 0})
    animate({opacity: 1}, 500)
  ] [
    removeClass("active")
  ]
}
```

### 3. Interactive Infographic

```eligian
endable action highlightDataPoint [
  selectElement(".data-point")
  addClass("highlighted")
  setStyle({transform: "scale(1)"})
  animate({transform: "scale(1.2)"}, 300)
] [
  animate({transform: "scale(1)"}, 300)
  removeClass("highlighted")
]

timeline "infographic" using audio from "narration.mp3" {
  at 0s..3s [
    selectElement("#chart-title")
    addClass("visible")
  ] [
    removeClass("visible")
  ]

  at 3s..8s {
    highlightDataPoint()
  }
}
```

## Development Workflow

### 1. Write DSL with VS Code

Benefits:
- **Syntax highlighting**: Keywords, selectors, literals
- **Autocompletion**: Operations, properties (via Language Server)
- **Real-time validation**: Errors as you type
- **Diagnostics**: Problems panel shows all issues

### 2. Compile and Test

```bash
# Compile once
eligian compile src/presentation.eligian -o dist/config.json

# Check syntax only (no output)
eligian compile src/presentation.eligian --check

# Verbose output for debugging
eligian compile src/presentation.eligian -o dist/config.json --verbose
```

### 3. Debug

Check Output panel (or terminal) for:
- Parse errors (syntax issues)
- Validation errors (semantic issues)
- Operation validation errors (unknown operations, wrong parameters)

VS Code's Problems panel (Ctrl+Shift+M) shows all issues with locations.

### 4. Optimize

```bash
# Enable minification
eligian compile src/presentation.eligian -o dist/config.json --minify

# Skip optimization (for debugging)
eligian compile src/presentation.eligian -o dist/config.json --no-optimize
```

## Tips and Best Practices

### 1. Define Reusable Endable Actions

```eligian
// ✅ Good: Reusable endable action
endable action fadeInElement [
  selectElement(".target")
  addClass("visible")
  setStyle({opacity: 0})
  animate({opacity: 1}, 500)
] [
  animate({opacity: 0}, 500)
  removeClass("visible")
]

timeline "main" using raf {
  at 0s..5s {
    fadeInElement()  // Reuse it
  }
}
```

### 2. Use Explicit Time Units

```eligian
// ✅ Correct
at 0s..5s { ... }
at 100ms..500ms { ... }

// ❌ Wrong: Missing units
at 0..5 { ... }
```

### 3. Name Your Timelines

```eligian
// ✅ Good: Descriptive name
timeline "main-presentation" using video from "video.mp4" { ... }

// ❌ Wrong: Missing name
timeline using video from "video.mp4" { ... }  // Parse error!
```

### 4. Comment Complex Logic

```eligian
// Show title at start of video
endable action showTitle [
  selectElement("#main-title")
  // Fade in over 500ms
  setStyle({opacity: 0})
  animate({opacity: 1}, 500)
] [
  // Fade out when ending
  animate({opacity: 0}, 500)
]
```

## Troubleshooting

### Compilation Errors

**Error**: `Expecting token of type STRING but found raf`
```eligian
// ❌ Wrong: Missing timeline name
timeline raf { ... }

// ✅ Correct: Timeline needs name string
timeline "presentation" using raf { ... }
```

**Error**: `Expecting 'using' keyword`
```eligian
// ❌ Wrong: Missing 'using' keyword
timeline "main" video from "video.mp4" { ... }

// ✅ Correct
timeline "main" using video from "video.mp4" { ... }
```

**Error**: `Time expression must have units`
```eligian
// ❌ Wrong: Missing units
at 0..5 { ... }

// ✅ Correct
at 0s..5s { ... }
```

**Error**: `Unknown operation: fadeIn`
```eligian
// ❌ Wrong: fadeIn is not a built-in operation
timeline "main" using raf {
  at 0s..5s {
    fadeIn()  // Error!
  }
}

// ✅ Correct: Define it first as an endable action
endable action fadeIn [
  setStyle({opacity: 0})
  animate({opacity: 1}, 500)
] [
  animate({opacity: 0}, 500)
]

timeline "main" using raf {
  at 0s..5s {
    fadeIn()  // Now it works
  }
}
```

### VS Code Issues

**Extension not activating**:
1. Check file extension is `.eligian` (not `.eli`)
2. Reload window (Ctrl+Shift+P → "Reload Window")
3. Check extension is enabled

**No syntax highlighting**:
1. Verify `.eligian` file association
2. Check language mode (bottom right) shows "Eligian"
3. Restart VS Code

**No diagnostics/errors showing**:
1. Check language server is running (Output → "Eligian Language Server")
2. Wait a few seconds after opening file
3. Check for parse errors in Output panel

## Next Steps

1. **Explore Examples**: See `examples/` directory for complete use cases
   - [examples/presentation.eligian](../../../examples/presentation.eligian) - Interactive slides
   - [examples/video-annotation.eligian](../../../examples/video-annotation.eligian) - Video annotations
2. **Read Grammar Reference**: Full syntax at `DSL_SYNTAX_REFERENCE.md`
3. **API Usage**: Programmatic compilation guide in compiler docs
4. **Contributing**: See `CONTRIBUTING.md` for development setup

## Resources

- **Eligius Library**: https://github.com/rolandzwaga/eligius
- **Eligian Repository**: https://github.com/rolandzwaga/eligian
- **Issues**: File bug reports and feature requests
- **Discussions**: Ask questions and share examples

---

**Quickstart Complete!** You're ready to build Eligius presentations with Eligian DSL.

**Next**: Try the advanced examples in `examples/` directory or read the full grammar reference.
