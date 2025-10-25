# HTML Parser Comparison: Cheerio vs htmlparser2 vs parse5

**Context**: Building a DSL compiler that validates HTML syntax at compile time for the Eligian project.

**Requirements**:
- Validate HTML syntax (unclosed tags, mismatched tags, proper nesting)
- Extract all CSS classes and IDs from HTML for optimization/validation
- Running in Node.js (not browser)
- Good error reporting with line/column numbers
- Performance and bundle size considerations

---

## Executive Summary

**Recommendation: Use htmlparser2 directly + domhandler + domutils**

**Rationale**:
1. **Smallest bundle size** (33.7 kB minified+gzipped vs 92 kB for Cheerio)
2. **Best performance** - htmlparser2 is the fastest parser, Cheerio wraps it with overhead
3. **Access to location info** - Can enable `withStartIndices`/`withEndIndices` for error reporting
4. **Direct DOM access** - Use domutils for querying without jQuery API overhead
5. **Future-proof** - Core library that Cheerio itself depends on
6. **Sufficient API** - Don't need jQuery syntax for compiler validation tasks

**For strict HTML validation**: Consider parse5 as an additional validation pass if needed.

---

## Detailed Comparison

### 1. Bundle Size & Dependencies

| Library | Minified + Gzipped | Dependencies | Notes |
|---------|-------------------|--------------|-------|
| **htmlparser2** | **33.7 kB** | domhandler, entities | Core parser, minimal size |
| **Cheerio** | **92 kB** (v1.0.0) | htmlparser2 + parse5 + more | jQuery-like API wrapper |
| **parse5** | ~50 kB | None | Spec-compliant parser |

**Winner**: htmlparser2 (smallest by 63%)

---

### 2. HTML Validation Capabilities

#### htmlparser2
- **Philosophy**: "Parse input like browsers do" - **not a validator**
- **Unclosed tags**: Silently closes all remaining open tags at document end
- **Mismatched tags**: Ignores closing tags without matching open tags
- **Malformed HTML**: Gracefully handles without errors (lenient parsing)
- **Validation mode**: None (no strict mode available)

**Verdict**: ❌ **Not suitable for validation** - will parse invalid HTML without errors

#### Cheerio
- **Same as htmlparser2** (uses it under the hood)
- Can switch between htmlparser2 and parse5 backends
- **Validation**: None - focused on jQuery-like DOM manipulation

**Verdict**: ❌ **Not suitable for validation** - wraps htmlparser2's lenient parsing

#### parse5
- **Philosophy**: Strict WHATWG HTML spec compliance
- **Standards-compliant**: Parses like modern browsers (spec-accurate)
- **Error reporting**: Can track source locations via `sourceCodeLocation` option
- **Validation**: Does NOT report parse errors by default (see below)

**Important Limitation**: parse5 does not currently report parsing errors. It fixes the tree internally (incorrect self-closing tags, missing tags, etc.) and returns the corrected tree. Parse error reporting is blocked on upstream spec test suite issues.

**Verdict**: ⚠️ **Partially suitable** - provides location info but doesn't report errors

---

### 3. Error Reporting (Line/Column Numbers)

#### htmlparser2
```javascript
import * as htmlparser2 from "htmlparser2";

const dom = htmlparser2.parseDocument(html, {
  withStartIndices: true,  // Add startIndex to nodes
  withEndIndices: true,    // Add endIndex to nodes
});

// Access position info
dom.children.forEach(node => {
  console.log(`Tag: ${node.name}`);
  console.log(`Start: ${node.startIndex}, End: ${node.endIndex}`);
});
```

**Pros**:
- Provides character indices for each node
- Lightweight option flags

**Cons**:
- Character indices only (not line/column)
- No error callbacks for malformed HTML
- Must manually convert indices to line/column

**Verdict**: ⚠️ **Partial support** - indices available, but no validation errors

#### Cheerio
```javascript
import * as cheerio from 'cheerio';

const $ = cheerio.load(html, {
  xml: {
    withStartIndices: true,
    withEndIndices: true,
  }
});

// Access through underlying DOM
const dom = $.root()[0];
// Same as htmlparser2 - position info via indices
```

**Verdict**: ⚠️ **Same as htmlparser2** - passes options through

#### parse5
```javascript
import * as parse5 from 'parse5';

const document = parse5.parse(html, {
  sourceCodeLocationInfo: true
});

// Location info includes line/column
function traverse(node) {
  if (node.sourceCodeLocation) {
    console.log(`Tag: ${node.tagName}`);
    console.log(`Start: Line ${node.sourceCodeLocation.startLine}, ` +
                `Column ${node.sourceCodeLocation.startCol}`);
  }

  if (node.childNodes) {
    node.childNodes.forEach(traverse);
  }
}

traverse(document);
```

**Pros**:
- Provides **line and column numbers** (not just indices)
- More detailed location info (start/end tags separately)
- Spec-compliant position tracking

**Cons**:
- Still doesn't report **validation errors** (just positions)
- Larger bundle size

**Verdict**: ✅ **Best location tracking** - line/column numbers available

---

### 4. DOM Querying & Traversal

#### htmlparser2 + domutils
```javascript
import * as htmlparser2 from "htmlparser2";
import * as domutils from "domutils";

const dom = htmlparser2.parseDocument(html);

// Find all elements with classes
const elementsWithClasses = domutils.findAll(
  elem => elem.attribs && elem.attribs.class,
  dom.children
);

const allClasses = new Set();
const allIds = new Set();

domutils.findAll(elem => {
  if (elem.attribs) {
    if (elem.attribs.class) {
      elem.attribs.class.split(/\s+/).forEach(cls => allClasses.add(cls));
    }
    if (elem.attribs.id) {
      allIds.add(elem.attribs.id);
    }
  }
  return false; // Continue traversal
}, dom.children);

console.log('Classes:', Array.from(allClasses));
console.log('IDs:', Array.from(allIds));
```

**API Style**: Functional (filter, map, find)
**Performance**: Fast - direct DOM access
**Learning Curve**: Moderate - need to learn domutils API

#### Cheerio
```javascript
import * as cheerio from 'cheerio';

const $ = cheerio.load(html);

// jQuery-style selectors
const allClasses = new Set();
const allIds = new Set();

$('[class]').each((i, elem) => {
  const classes = $(elem).attr('class').split(/\s+/);
  classes.forEach(cls => allClasses.add(cls));
});

$('[id]').each((i, elem) => {
  allIds.add($(elem).attr('id'));
});

console.log('Classes:', Array.from(allClasses));
console.log('IDs:', Array.from(allIds));
```

**API Style**: jQuery-like (familiar to many developers)
**Performance**: Slower - wraps htmlparser2 + additional abstraction
**Learning Curve**: Easy - familiar jQuery syntax

**Verdict**:
- **htmlparser2 + domutils**: Better performance, smaller bundle
- **Cheerio**: Better DX if team knows jQuery

---

### 5. Performance Characteristics

#### htmlparser2
- **Fastest HTML parser** for Node.js
- Streaming parser (low memory usage)
- Direct callback-based or DOM building
- Optimized for large documents

**Benchmarks**: Consistently 2-3x faster than alternatives

#### Cheerio
- Uses htmlparser2 under the hood
- Adds jQuery wrapper overhead
- Good performance but slower than raw htmlparser2
- Can switch to parse5 backend (slower but more spec-compliant)

**Benchmarks**:
- With htmlparser2 backend: Good performance
- With parse5 backend: ~50% slower (GitHub issue #1259)

#### parse5
- Spec-compliant parser (follows WHATWG exactly)
- Slower than htmlparser2 (spec compliance has cost)
- Still performant for most use cases

**Verdict**: htmlparser2 > Cheerio (htmlparser2 mode) > parse5

---

### 6. API Complexity & Learning Curve

#### htmlparser2
```javascript
// Callback-based (streaming)
const parser = new htmlparser2.Parser({
  onopentag(name, attributes) { /* ... */ },
  ontext(text) { /* ... */ },
  onclosetag(tagname) { /* ... */ }
});
parser.write(html);
parser.end();

// DOM-based (simpler)
const dom = htmlparser2.parseDocument(html);
// Use domutils for querying
```

**Complexity**: Medium
- Two APIs: callback (streaming) or DOM (simpler)
- Need to learn domutils for querying
- Less familiar than jQuery

#### Cheerio
```javascript
const $ = cheerio.load(html);
$('div.class').text();
$('#id').attr('data-foo');
```

**Complexity**: Low
- Familiar jQuery API
- Chainable methods
- Easy for developers with jQuery experience

#### parse5
```javascript
const document = parse5.parse(html);
// Standard DOM-like structure
// Need to manually traverse or use separate query lib
```

**Complexity**: Medium-High
- More verbose API
- Manual tree traversal often needed
- No built-in query utilities

**Verdict**: Cheerio (easiest) > htmlparser2 (medium) > parse5 (harder)

---

### 7. Maintenance & Ecosystem

| Library | GitHub Stars | Weekly Downloads | Last Updated | Maintenance |
|---------|-------------|------------------|--------------|-------------|
| **htmlparser2** | 4.3k | 27M+ | Active (2024) | ✅ Active |
| **Cheerio** | 28k | 12M+ | Active (2024) | ✅ Active |
| **parse5** | 3.5k | 35M+ | Active (2024) | ✅ Active |

All three are actively maintained with large user bases.

**Ecosystem**:
- **htmlparser2**: Core dependency for many parsers
- **Cheerio**: Most popular jQuery-like library
- **parse5**: Used by jsdom, Angular, Lit

**Verdict**: All are safe choices for production

---

## Practical Code Examples

### Example 1: Basic HTML Validation (Detect Unclosed Tags)

Since none of the parsers provide validation out-of-the-box, we need to build our own validator:

```javascript
import * as htmlparser2 from "htmlparser2";

function validateHTML(html) {
  const errors = [];
  const openTags = [];
  let currentLine = 1;
  let currentCol = 1;
  let position = 0;

  const parser = new htmlparser2.Parser({
    onopentagname(name) {
      const location = { line: currentLine, col: currentCol, pos: position };
      openTags.push({ name, location });
    },

    onclosetag(name) {
      const lastOpen = openTags.pop();

      if (!lastOpen) {
        errors.push({
          type: 'UNEXPECTED_CLOSE_TAG',
          tag: name,
          message: `Unexpected closing tag &lt;/${name}&gt; at line ${currentLine}`,
          line: currentLine,
          col: currentCol
        });
      } else if (lastOpen.name !== name) {
        errors.push({
          type: 'MISMATCHED_TAGS',
          opening: lastOpen.name,
          closing: name,
          message: `Mismatched tags: &lt;${lastOpen.name}&gt; at line ${lastOpen.location.line} ` +
                   `closed by &lt;/${name}&gt; at line ${currentLine}`,
          openingLine: lastOpen.location.line,
          closingLine: currentLine
        });
      }
    },

    onend() {
      // Check for unclosed tags
      openTags.reverse().forEach(tag => {
        errors.push({
          type: 'UNCLOSED_TAG',
          tag: tag.name,
          message: `Unclosed tag &lt;${tag.name}&gt; starting at line ${tag.location.line}`,
          line: tag.location.line,
          col: tag.location.col
        });
      });
    }
  }, {
    // Enable self-closing tag recognition
    recognizeSelfClosing: true
  });

  // Track line/column as we parse
  for (let i = 0; i < html.length; i++) {
    if (html[i] === '\n') {
      currentLine++;
      currentCol = 1;
    } else {
      currentCol++;
    }
    position = i;
  }

  try {
    parser.write(html);
    parser.end();
  } catch (err) {
    errors.push({
      type: 'PARSE_ERROR',
      message: err.message,
      error: err
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Usage
const result = validateHTML(`
  &lt;div&gt;
    &lt;p&gt;Paragraph
    &lt;span&gt;Text&lt;/span&gt;
  &lt;/div&gt;
`);

if (!result.valid) {
  result.errors.forEach(err => {
    console.error(`${err.type}: ${err.message}`);
  });
}
```

### Example 2: Extract All Classes and IDs (htmlparser2 + domutils)

```javascript
import * as htmlparser2 from "htmlparser2";
import * as domutils from "domutils";

function extractClassesAndIds(html) {
  const dom = htmlparser2.parseDocument(html, {
    withStartIndices: true,
    withEndIndices: true
  });

  const classes = new Map(); // class -> [{element, line, col}]
  const ids = new Map();     // id -> {element, line, col}

  // Helper to convert character index to line/col
  function indexToLineCol(html, index) {
    let line = 1;
    let col = 1;
    for (let i = 0; i < index && i < html.length; i++) {
      if (html[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    return { line, col };
  }

  // Traverse all elements
  domutils.findAll(elem => {
    if (elem.type === 'tag' && elem.attribs) {
      const location = elem.startIndex
        ? indexToLineCol(html, elem.startIndex)
        : null;

      // Extract classes
      if (elem.attribs.class) {
        const classNames = elem.attribs.class.trim().split(/\s+/).filter(Boolean);
        classNames.forEach(className => {
          if (!classes.has(className)) {
            classes.set(className, []);
          }
          classes.get(className).push({
            element: elem.name,
            location
          });
        });
      }

      // Extract ID
      if (elem.attribs.id) {
        const id = elem.attribs.id.trim();
        if (id) {
          if (ids.has(id)) {
            // Duplicate ID warning
            console.warn(`Duplicate ID "${id}" found at ${location?.line}:${location?.col}`);
          } else {
            ids.set(id, {
              element: elem.name,
              location
            });
          }
        }
      }
    }
    return false; // Continue traversal
  }, dom.children);

  return {
    classes: Object.fromEntries(classes),
    ids: Object.fromEntries(ids)
  };
}

// Usage
const html = `
  &lt;div class="container main"&gt;
    &lt;h1 id="title" class="header"&gt;Hello&lt;/h1&gt;
    &lt;p class="text main"&gt;Content&lt;/p&gt;
  &lt;/div&gt;
`;

const { classes, ids } = extractClassesAndIds(html);

console.log('Classes:');
Object.entries(classes).forEach(([className, usages]) => {
  console.log(`  ${className}:`);
  usages.forEach(({ element, location }) => {
    console.log(`    - &lt;${element}&gt; at ${location?.line}:${location?.col}`);
  });
});

console.log('\nIDs:');
Object.entries(ids).forEach(([id, { element, location }]) => {
  console.log(`  ${id}: &lt;${element}&gt; at ${location?.line}:${location?.col}`);
});
```

### Example 3: Extract Classes and IDs (Cheerio version)

```javascript
import * as cheerio from 'cheerio';

function extractClassesAndIds(html) {
  const $ = cheerio.load(html);

  const classes = new Map();
  const ids = new Map();

  // Extract classes
  $('[class]').each((i, elem) => {
    const classAttr = $(elem).attr('class');
    if (classAttr) {
      const classNames = classAttr.trim().split(/\s+/).filter(Boolean);
      classNames.forEach(className => {
        if (!classes.has(className)) {
          classes.set(className, []);
        }
        classes.get(className).push({
          element: elem.name,
          html: $.html(elem).split('\n')[0] // First line only
        });
      });
    }
  });

  // Extract IDs
  $('[id]').each((i, elem) => {
    const id = $(elem).attr('id').trim();
    if (id) {
      if (ids.has(id)) {
        console.warn(`Duplicate ID "${id}" found`);
      } else {
        ids.set(id, {
          element: elem.name,
          html: $.html(elem).split('\n')[0]
        });
      }
    }
  });

  return {
    classes: Object.fromEntries(classes),
    ids: Object.fromEntries(ids)
  };
}
```

**Note**: Cheerio version is simpler but doesn't provide line/column numbers easily.

---

## Recommendation for Eligian Compiler

### Primary Recommendation: **htmlparser2 + domutils + Custom Validator**

```javascript
// Installation
npm install htmlparser2 domutils domhandler
```

**Architecture**:
```
1. Parse with htmlparser2 (callback mode) → Build custom validation
2. Parse with htmlparser2.parseDocument() → DOM tree
3. Query DOM with domutils → Extract classes/IDs
4. Track positions via withStartIndices option → Convert to line/col
```

**Pros**:
- ✅ Smallest bundle size (33.7 kB)
- ✅ Best performance (fastest parser)
- ✅ Full control over validation logic
- ✅ Direct access to position info
- ✅ Minimal dependencies
- ✅ Core library (won't be deprecated)

**Cons**:
- ❌ Need to build custom validator (extra work)
- ❌ Must convert character indices to line/col manually
- ❌ Less familiar API than jQuery

### Alternative: **Cheerio** (If Team Prefers jQuery API)

```javascript
npm install cheerio
```

**Use Case**: If your team is more comfortable with jQuery syntax and bundle size isn't critical.

**Pros**:
- ✅ Familiar jQuery-like API
- ✅ Easy to learn and use
- ✅ Good documentation

**Cons**:
- ❌ Larger bundle (92 kB vs 33.7 kB)
- ❌ Slower than raw htmlparser2
- ❌ Still need custom validator for HTML errors
- ❌ Harder to access position info

### Supplementary: **parse5** (For Strict Validation Layer)

```javascript
npm install parse5
```

**Use Case**: Add as a secondary validation pass if you need strict spec compliance checking.

**Strategy**:
1. Primary parse with htmlparser2 (fast, extract data)
2. Secondary validation with parse5 (catch spec violations)
3. Compare DOMs to detect differences → those are errors

**Pros**:
- ✅ Spec-compliant parsing
- ✅ Line/column numbers available
- ✅ Can detect subtle HTML spec violations

**Cons**:
- ❌ Doubles parsing time (run twice)
- ❌ Larger bundle if included
- ❌ Still doesn't report errors (just parses correctly)

---

## Implementation Strategy

### Phase 1: Basic HTML Validation (htmlparser2)

```javascript
// src/compiler/html-validator.ts
import * as htmlparser2 from "htmlparser2";

export interface HTMLError {
  type: 'UNCLOSED_TAG' | 'MISMATCHED_TAGS' | 'UNEXPECTED_CLOSE_TAG';
  message: string;
  line: number;
  col: number;
  tag?: string;
}

export function validateHTML(html: string): { valid: boolean; errors: HTMLError[] } {
  // Implementation from Example 1 above
}
```

### Phase 2: Extract Classes/IDs (htmlparser2 + domutils)

```javascript
// src/compiler/html-analyzer.ts
import * as htmlparser2 from "htmlparser2";
import * as domutils from "domutils";

export interface ClassUsage {
  element: string;
  location: { line: number; col: number };
}

export interface IdUsage {
  element: string;
  location: { line: number; col: number };
}

export function extractClassesAndIds(html: string): {
  classes: Map&lt;string, ClassUsage[]&gt;;
  ids: Map&lt;string, IdUsage&gt;;
} {
  // Implementation from Example 2 above
}
```

### Phase 3: Integration with Eligian Compiler

```javascript
// src/compiler/ast-transformer.ts (existing file)
import { validateHTML } from './html-validator';
import { extractClassesAndIds } from './html-analyzer';

// In your HTML content transformation
function transformHTMLContent(htmlNode: HTMLNode): EligiusIR {
  const html = htmlNode.content;

  // Validate HTML
  const validation = validateHTML(html);
  if (!validation.valid) {
    // Report errors via Langium diagnostics
    validation.errors.forEach(err => {
      reportError(err.message, htmlNode, err.line, err.col);
    });
  }

  // Extract classes/IDs for optimization
  const { classes, ids } = extractClassesAndIds(html);

  // TODO: Use extracted classes/ids for:
  // - Dead CSS elimination
  // - Selector validation
  // - Animation target validation

  return {
    // ... transform to Eligius format
  };
}
```

---

## Future-Proofing Considerations

### Maintenance
- **htmlparser2**: Core library with 27M+ weekly downloads, won't go away
- **Cheerio**: Popular library with 12M+ weekly downloads, actively maintained
- **parse5**: Used by major projects (jsdom, Angular), stable

**All three are safe long-term bets.**

### Flexibility
- **htmlparser2**: Easy to swap for another parser if needed (DOM is standard)
- **Cheerio**: Harder to swap due to jQuery API coupling
- **parse5**: Easy to swap (standard DOM)

**Winner**: htmlparser2 (most flexible)

### Performance Scaling
- **htmlparser2**: Streaming parser scales to any size document
- **Cheerio**: DOM-based, limited by memory for huge documents
- **parse5**: DOM-based, limited by memory

**Winner**: htmlparser2 (streaming capability)

### Bundle Size Future
- **htmlparser2**: Unlikely to grow significantly (focused library)
- **Cheerio**: May grow with new features (already grew 2x from v0.22 to v1.0)
- **parse5**: Moderate size, unlikely to change much

**Winner**: htmlparser2 (most predictable)

---

## Conclusion

**For the Eligian compiler, use htmlparser2 directly with domutils.**

This provides:
1. Best performance for compilation speed
2. Smallest bundle size for CLI distribution
3. Full control over validation logic (required for DSL errors)
4. Direct access to position info for error reporting
5. Foundation for future CSS optimization features

The additional effort to build a custom validator is worthwhile given:
- Need for DSL-specific error messages
- Integration with Langium validation system
- Performance benefits for large timeline files
- Smallest footprint for CLI tool distribution

**Start simple** with basic validation (unclosed tags), then iterate based on real-world DSL usage patterns.
