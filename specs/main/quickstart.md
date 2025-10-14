# Quickstart Guide: Eligius DSL

**Date**: 2025-10-14
**Audience**: Developers new to Eligius DSL

## Overview

This guide walks through setting up the Eligius DSL toolchain, writing your first DSL program, and compiling it to Eligius JSON configuration.

## Prerequisites

- **Node.js**: v20 or later (LTS recommended)
- **npm**: v10 or later
- **VS Code**: v1.80 or later (for extension)
- **Eligius Library**: v1.x (for running compiled configs)

## Installation

### 1. Install Compiler CLI

```bash
npm install -g @eligius/dsl-compiler

# Verify installation
eligius-dsl --version
# Output: Eligius DSL Compiler v1.0.0
```

### 2. Install VS Code Extension

**Option A: Marketplace** (when published):
```
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Eligius DSL"
4. Click Install
```

**Option B: From VSIX**:
```bash
# Download .vsix file
code --install-extension eligius-dsl-1.0.0.vsix
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

Create `src/presentation.eli`:

```
// Eligius DSL Example - Video Presentation

// Define timeline with video provider
timeline video from "presentation.mp4"

// Intro event (0-5 seconds)
event intro at 0..5 {
  show #title with fadeIn(500ms)
  show #subtitle with slideIn(300ms, "left")
}

// Main content (5-120 seconds)
event main-content at 5..120 {
  show #content-area
  trigger startAnimation on #diagram
}

// Outro (120-130 seconds)
event outro at 120..130 {
  hide #content-area with fadeOut(400ms)
  show #credits with slideIn(500ms, "bottom")
}
```

### Step 2: Compile to JSON

**Using CLI**:
```bash
eligius-dsl compile src/presentation.eli -o dist/config.json

# Output:
# ✓ Compiled successfully (45ms)
# Output written to dist/config.json (2.1 KB)
```

**Using VS Code**:
```
1. Open src/presentation.eli in VS Code
2. Press Ctrl+Shift+B (or Cmd+Shift+B on Mac)
3. Select "Eligius DSL: Compile Current File"
4. Check Output panel for results
```

### Step 3: Review Compiled JSON

Open `dist/config.json`:

```json
{
  "timeline": {
    "provider": "video",
    "source": "presentation.mp4"
  },
  "events": [
    {
      "id": "intro",
      "start": 0,
      "end": 5,
      "actions": [
        {
          "type": "show",
          "target": "#title",
          "properties": {
            "animation": "fadeIn",
            "duration": 500
          }
        },
        {
          "type": "show",
          "target": "#subtitle",
          "properties": {
            "animation": "slideIn",
            "duration": 300,
            "direction": "left"
          }
        }
      ]
    },
    {
      "id": "main-content",
      "start": 5,
      "end": 120,
      "actions": [
        {
          "type": "show",
          "target": "#content-area"
        },
        {
          "type": "trigger",
          "target": "#diagram",
          "properties": {
            "action": "startAnimation"
          }
        }
      ]
    },
    {
      "id": "outro",
      "start": 120,
      "end": 130,
      "actions": [
        {
          "type": "hide",
          "target": "#content-area",
          "properties": {
            "animation": "fadeOut",
            "duration": 400
          }
        },
        {
          "type": "show",
          "target": "#credits",
          "properties": {
            "animation": "slideIn",
            "duration": 500,
            "direction": "bottom"
          }
        }
      ]
    }
  ],
  "metadata": {
    "generatedBy": "Eligius DSL Compiler v1.0.0",
    "timestamp": "2025-10-14T12:00:00.000Z"
  }
}
```

### Step 4: Run with Eligius

Create `index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Eligius Presentation</title>
  <style>
    #title, #subtitle, #content-area, #credits { display: none; }
    video { width: 100%; }
  </style>
</head>
<body>
  <video id="video" src="presentation.mp4" controls></video>
  <div id="title">Welcome to Eligius</div>
  <div id="subtitle">Story Telling Engine</div>
  <div id="content-area">Main Content Here</div>
  <div id="credits">Created with Eligius DSL</div>

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

```
timeline <provider> from <source>
```

**Providers**:
- `video`: Video file timeline
- `audio`: Audio file timeline
- `raf`: RequestAnimationFrame loop
- `custom`: Custom provider (requires config)

**Examples**:
```
timeline video from "video.mp4"
timeline audio from "podcast.mp3"
timeline raf  // No source needed for RAF
```

### Event Declaration

```
event <id> at <start>..<end> {
  <actions>
}
```

**Examples**:
```
event intro at 0..5 { ... }
event outro at 120..130 { ... }
event continuous at 0..9999 { ... }
```

### Actions

**show** - Make element visible:
```
show #id
show #id with fadeIn(500ms)
show .class with slideIn(300ms, "left")
```

**hide** - Hide element:
```
hide #id
hide #id with fadeOut(400ms)
hide .class with slideOut(200ms, "right")
```

**animate** - Trigger animation:
```
animate #diagram
animate #logo with spin(1000ms)
```

**trigger** - Trigger custom action:
```
trigger startAnimation on #element
trigger playSound on #audio-player
```

### Time Ranges

```
at 0..5         // 0 to 5 seconds
at 10..20       // 10 to 20 seconds
at 0..9999      // Very long range
```

### Selectors

```
#id             // Element with ID
.class          // Elements with class
element         // Elements by tag name
```

### Comments

```
// Single-line comment

/* Multi-line
   comment */
```

## Common Use Cases

### 1. Video Annotation

```
timeline video from "tutorial.mp4"

event step1 at 0..10 {
  show #annotation1 with fadeIn(300ms)
}

event step2 at 10..25 {
  hide #annotation1 with fadeOut(200ms)
  show #annotation2 with fadeIn(300ms)
}
```

### 2. Presentation Slides

```
timeline raf

event slide1 at 0..5000 {
  show #slide1
}

event slide2 at 5000..10000 {
  hide #slide1 with fadeOut(500ms)
  show #slide2 with fadeIn(500ms)
}
```

### 3. Interactive Infographic

```
timeline audio from "narration.mp3"

event intro at 0..3 {
  show #chart-title with fadeIn(400ms)
}

event data-point-1 at 3..8 {
  show #point1 with slideIn(300ms, "bottom")
  animate #point1-highlight
}

event data-point-2 at 8..13 {
  show #point2 with slideIn(300ms, "bottom")
  animate #point2-highlight
}
```

## Development Workflow

### 1. Write DSL with VS Code

Benefits:
- **Syntax highlighting**: Keywords, selectors, literals
- **Autocompletion**: Actions, properties, selectors
- **Real-time validation**: Errors as you type
- **Quick fixes**: Automatic error corrections

### 2. Compile and Test

```bash
# Compile once
eligius-dsl compile src/presentation.eli -o dist/config.json

# Watch mode (recompile on save)
eligius-dsl compile src/presentation.eli -o dist/config.json --watch
```

### 3. Debug

Check Output panel for:
- Compilation errors
- Type errors
- Validation warnings

Use VS Code's Problems panel (Ctrl+Shift+M) to see all issues.

### 4. Optimize

```bash
# Enable minification
eligius-dsl compile src/presentation.eli -o dist/config.json --minify

# Skip optimization (for debugging)
eligius-dsl compile src/presentation.eli -o dist/config.json --no-optimize
```

## Project Configuration

Create `eligius.config.json`:

```json
{
  "compilerOptions": {
    "minify": false,
    "sourcemap": true,
    "optimize": true,
    "target": "eligius-1.0"
  },
  "include": ["src/**/*.eli"],
  "exclude": ["**/*.test.eli"],
  "output": "dist/"
}
```

Now run without specifying options:
```bash
eligius-dsl compile src/presentation.eli
# Uses settings from eligius.config.json
```

## Tips and Best Practices

### 1. Event Organization

Group related events:
```
// Good: Clear sections
event intro-title at 0..5 { ... }
event intro-subtitle at 0..5 { ... }

event main-section1 at 5..15 { ... }
event main-section2 at 15..30 { ... }
```

### 2. Consistent Timing

Use consistent durations:
```
// Good: All fades are 500ms
show #title with fadeIn(500ms)
hide #title with fadeOut(500ms)
show #content with fadeIn(500ms)
```

### 3. Comments for Complex Logic

```
// Show title at start of video
event intro at 0..5 {
  // Fade in over 500ms
  show #title with fadeIn(500ms)

  // Subtitle appears after title
  show #subtitle with slideIn(300ms, "left")
}
```

### 4. Test Incrementally

Start simple, add complexity:
```
// v1: Just show/hide
event intro at 0..5 {
  show #title
}

// v2: Add animations
event intro at 0..5 {
  show #title with fadeIn(500ms)
}

// v3: Add more actions
event intro at 0..5 {
  show #title with fadeIn(500ms)
  show #subtitle with slideIn(300ms, "left")
}
```

## Troubleshooting

### Compilation Errors

**Error**: "Expected number, got string"
```
// ❌ Wrong
event intro at "5"..10 { ... }

// ✓ Correct
event intro at 5..10 { ... }
```

**Error**: "Duplicate event ID"
```
// ❌ Wrong
event intro at 0..5 { ... }
event intro at 10..15 { ... }  // Same ID!

// ✓ Correct
event intro at 0..5 { ... }
event main at 10..15 { ... }  // Different ID
```

### VS Code Issues

**Extension not activating**:
1. Check file extension is `.eli`
2. Reload window (Ctrl+Shift+P → "Reload Window")
3. Check extension is enabled

**No autocompletion**:
1. Check `eligius-dsl.completion.enabled` setting
2. Trigger manually with `Ctrl+Space`
3. Check language server is running (Output → "Eligius DSL")

### Performance Issues

**Slow compilation**:
- Use `--no-optimize` for development
- Split large files into smaller ones
- Check file size (<5000 lines recommended)

## Next Steps

1. **Explore Examples**: See `examples/` directory for more complex use cases
2. **Read Docs**: Full DSL reference at `docs/syntax-reference.md`
3. **API Usage**: Programmatic compilation guide at `docs/api-usage.md`
4. **Contributing**: See `CONTRIBUTING.md` for development setup

## Resources

- **Eligius Library**: https://github.com/rolandzwaga/eligius
- **DSL Repository**: https://github.com/rolandzwaga/eligius-dsl-spec
- **Issues**: https://github.com/rolandzwaga/eligius-dsl-spec/issues
- **Discussions**: https://github.com/rolandzwaga/eligius-dsl-spec/discussions

---

**Quickstart Complete!** You're ready to build Eligius presentations with DSL.

**Next**: Try the advanced examples in `examples/` directory.
