/**
 * HTML Metadata Generator
 *
 * Build-time script that extracts HTML element and attribute metadata from
 * TypeScript's lib.dom.d.ts using the TypeScript Compiler API.
 *
 * Run with: pnpm generate:html-metadata
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AttributeMetadata {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  enumValues?: string[];
}

interface ElementMetadata {
  tagName: string;
  interfaceName: string;
  attributes: AttributeMetadata[];
}

// Event handler properties to exclude
const EVENT_HANDLER_PATTERN = /^on[A-Z]/;

// Properties to exclude (methods, readonly internals, etc.)
const EXCLUDED_PROPERTIES = new Set([
  // Methods and internal properties
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'appendChild',
  'removeChild',
  'insertBefore',
  'replaceChild',
  'cloneNode',
  'contains',
  'getAttribute',
  'setAttribute',
  'removeAttribute',
  'hasAttribute',
  'getAttributeNode',
  'setAttributeNode',
  'removeAttributeNode',
  'getElementsByTagName',
  'getElementsByClassName',
  'querySelector',
  'querySelectorAll',
  'closest',
  'matches',
  'webkitMatchesSelector',
  'scrollIntoView',
  'focus',
  'blur',
  'click',
  'animate',
  'getAnimations',
  'getBoundingClientRect',
  'getClientRects',
  'scroll',
  'scrollTo',
  'scrollBy',
  // Readonly internal properties
  'tagName',
  'nodeName',
  'nodeType',
  'nodeValue',
  'textContent',
  'innerHTML',
  'outerHTML',
  'innerText',
  'outerText',
  'parentNode',
  'parentElement',
  'childNodes',
  'children',
  'firstChild',
  'lastChild',
  'firstElementChild',
  'lastElementChild',
  'nextSibling',
  'previousSibling',
  'nextElementSibling',
  'previousElementSibling',
  'ownerDocument',
  'baseURI',
  'isConnected',
  'namespaceURI',
  'prefix',
  'localName',
  'attributes',
  'classList',
  'dataset',
  'style',
  'shadowRoot',
  'assignedSlot',
  'offsetParent',
  'offsetTop',
  'offsetLeft',
  'offsetWidth',
  'offsetHeight',
  'clientTop',
  'clientLeft',
  'clientWidth',
  'clientHeight',
  'scrollTop',
  'scrollLeft',
  'scrollWidth',
  'scrollHeight',
  'form',
  'validity',
  'validationMessage',
  'willValidate',
  'labels',
  'list',
  'options',
  'selectedOptions',
  'files',
  'selectionStart',
  'selectionEnd',
  'selectionDirection',
  'valueAsDate',
  'valueAsNumber',
  // Constructor and prototype
  'constructor',
  'prototype',
  // ARIA attributes (handled separately if needed)
  'role',
]);

// Common HTMLElement attributes that apply to all elements
const COMMON_ATTRIBUTES: AttributeMetadata[] = [
  { name: 'id', type: 'string' },
  { name: 'className', type: 'string' },
  { name: 'style', type: 'string' },
  { name: 'title', type: 'string' },
  { name: 'lang', type: 'string' },
  { name: 'dir', type: 'enum', enumValues: ['ltr', 'rtl', 'auto'] },
  { name: 'hidden', type: 'boolean' },
  { name: 'tabIndex', type: 'number' },
  { name: 'accessKey', type: 'string' },
  { name: 'draggable', type: 'boolean' },
  { name: 'spellcheck', type: 'boolean' },
  { name: 'contentEditable', type: 'enum', enumValues: ['true', 'false', 'inherit'] },
  { name: 'translate', type: 'boolean' },
  { name: 'slot', type: 'string' },
];

/**
 * Well-known string/boolean attributes inherited from mixin interfaces that TypeScript
 * doesn't include in the direct interface members. These are commonly used attributes
 * that should be available in completion.
 * Map structure: { elementName: { attributeName: type } }
 */
const INHERITED_ATTRIBUTES: Record<string, Record<string, 'string' | 'number' | 'boolean'>> = {
  a: {
    href: 'string',
    protocol: 'string',
    host: 'string',
    hostname: 'string',
    port: 'string',
    pathname: 'string',
    search: 'string',
    hash: 'string',
  },
  area: {
    href: 'string',
    protocol: 'string',
    host: 'string',
    hostname: 'string',
    port: 'string',
    pathname: 'string',
    search: 'string',
    hash: 'string',
  },
  img: {
    src: 'string',
    alt: 'string',
    width: 'number',
    height: 'number',
  },
  input: {
    value: 'string',
    placeholder: 'string',
    disabled: 'boolean',
    required: 'boolean',
    readOnly: 'boolean',
    checked: 'boolean',
    min: 'string',
    max: 'string',
    step: 'string',
    pattern: 'string',
    minLength: 'number',
    maxLength: 'number',
    size: 'number',
  },
  button: {
    disabled: 'boolean',
    value: 'string',
    name: 'string',
  },
  textarea: {
    value: 'string',
    placeholder: 'string',
    disabled: 'boolean',
    required: 'boolean',
    readOnly: 'boolean',
    rows: 'number',
    cols: 'number',
    minLength: 'number',
    maxLength: 'number',
  },
  select: {
    value: 'string',
    disabled: 'boolean',
    required: 'boolean',
    multiple: 'boolean',
    size: 'number',
  },
  option: {
    value: 'string',
    selected: 'boolean',
    disabled: 'boolean',
  },
  form: {
    action: 'string',
    name: 'string',
    target: 'string',
    noValidate: 'boolean',
  },
  video: {
    src: 'string',
    poster: 'string',
    width: 'number',
    height: 'number',
    autoplay: 'boolean',
    controls: 'boolean',
    loop: 'boolean',
    muted: 'boolean',
    playsInline: 'boolean',
  },
  audio: {
    src: 'string',
    autoplay: 'boolean',
    controls: 'boolean',
    loop: 'boolean',
    muted: 'boolean',
  },
  source: {
    src: 'string',
    type: 'string',
    srcset: 'string',
    sizes: 'string',
    media: 'string',
  },
  track: {
    src: 'string',
    srclang: 'string',
    label: 'string',
    default: 'boolean',
  },
  iframe: {
    src: 'string',
    srcdoc: 'string',
    name: 'string',
    width: 'string',
    height: 'string',
    allow: 'string',
    allowFullscreen: 'boolean',
  },
  script: {
    src: 'string',
    async: 'boolean',
    defer: 'boolean',
    noModule: 'boolean',
    integrity: 'string',
  },
  link: {
    href: 'string',
    type: 'string',
    media: 'string',
    integrity: 'string',
    as: 'string',
  },
  label: {
    htmlFor: 'string',
  },
  table: {
    border: 'string',
  },
  td: {
    colSpan: 'number',
    rowSpan: 'number',
  },
  th: {
    colSpan: 'number',
    rowSpan: 'number',
  },
  canvas: {
    width: 'number',
    height: 'number',
  },
  progress: {
    value: 'number',
    max: 'number',
  },
  meter: {
    value: 'number',
    min: 'number',
    max: 'number',
    low: 'number',
    high: 'number',
    optimum: 'number',
  },
};

/**
 * Well-known enum values for HTML attributes that TypeScript doesn't expose as union types.
 * These are hardcoded because the DOM types use general 'string' type for these attributes.
 * Map structure: { elementName: { attributeName: enumValues[] } }
 */
const WELL_KNOWN_ENUM_VALUES: Record<string, Record<string, string[]>> = {
  input: {
    type: [
      'button',
      'checkbox',
      'color',
      'date',
      'datetime-local',
      'email',
      'file',
      'hidden',
      'image',
      'month',
      'number',
      'password',
      'radio',
      'range',
      'reset',
      'search',
      'submit',
      'tel',
      'text',
      'time',
      'url',
      'week',
    ],
    inputMode: ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'],
    autocomplete: ['on', 'off'],
  },
  a: {
    target: ['_self', '_blank', '_parent', '_top'],
    rel: [
      'alternate',
      'author',
      'bookmark',
      'external',
      'help',
      'license',
      'next',
      'nofollow',
      'noopener',
      'noreferrer',
      'prev',
      'search',
      'tag',
    ],
    referrerPolicy: [
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ],
  },
  img: {
    loading: ['eager', 'lazy'],
    decoding: ['sync', 'async', 'auto'],
    crossOrigin: ['anonymous', 'use-credentials'],
    referrerPolicy: [
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ],
  },
  button: {
    type: ['submit', 'reset', 'button'],
  },
  form: {
    method: ['get', 'post', 'dialog'],
    enctype: ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
    autocomplete: ['on', 'off'],
  },
  iframe: {
    loading: ['eager', 'lazy'],
    sandbox: [
      'allow-downloads',
      'allow-forms',
      'allow-modals',
      'allow-orientation-lock',
      'allow-pointer-lock',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-presentation',
      'allow-same-origin',
      'allow-scripts',
      'allow-top-navigation',
    ],
    referrerPolicy: [
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ],
  },
  video: {
    preload: ['none', 'metadata', 'auto'],
    crossOrigin: ['anonymous', 'use-credentials'],
  },
  audio: {
    preload: ['none', 'metadata', 'auto'],
    crossOrigin: ['anonymous', 'use-credentials'],
  },
  track: {
    kind: ['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'],
  },
  textarea: {
    wrap: ['hard', 'soft', 'off'],
    autocomplete: ['on', 'off'],
  },
  select: {
    autocomplete: ['on', 'off'],
  },
  script: {
    type: ['module', 'text/javascript'],
    crossOrigin: ['anonymous', 'use-credentials'],
    referrerPolicy: [
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ],
  },
  link: {
    rel: [
      'alternate',
      'author',
      'canonical',
      'dns-prefetch',
      'help',
      'icon',
      'license',
      'manifest',
      'modulepreload',
      'next',
      'pingback',
      'preconnect',
      'prefetch',
      'preload',
      'prerender',
      'prev',
      'search',
      'stylesheet',
    ],
    crossOrigin: ['anonymous', 'use-credentials'],
    referrerPolicy: [
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ],
  },
  th: {
    scope: ['row', 'col', 'rowgroup', 'colgroup'],
  },
  td: {
    scope: ['row', 'col', 'rowgroup', 'colgroup'],
  },
  area: {
    target: ['_self', '_blank', '_parent', '_top'],
    rel: [
      'alternate',
      'author',
      'bookmark',
      'external',
      'help',
      'license',
      'next',
      'nofollow',
      'noopener',
      'noreferrer',
      'prev',
      'search',
      'tag',
    ],
    referrerPolicy: [
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ],
  },
  base: {
    target: ['_self', '_blank', '_parent', '_top'],
  },
};

/**
 * Main generator function
 */
function generateHTMLMetadata(): void {
  console.log('Generating HTML element metadata...');

  // Create a TypeScript program with lib.dom.d.ts
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    lib: ['lib.dom.d.ts', 'lib.es2020.d.ts'],
    noEmit: true,
  };

  // Create a virtual source file that references the types we need
  const sourceFile = ts.createSourceFile(
    'virtual.ts',
    `
    type TagMap = HTMLElementTagNameMap;
    type AnchorElement = HTMLAnchorElement;
    `,
    ts.ScriptTarget.ESNext,
    true
  );

  // Create a compiler host that includes the virtual file
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile;
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (fileName === 'virtual.ts') {
      return sourceFile;
    }
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const program = ts.createProgram(['virtual.ts'], options, host);
  const checker = program.getTypeChecker();

  // Find HTMLElementTagNameMap
  const elementMap = findHTMLElementTagNameMap(program, checker);
  if (!elementMap) {
    console.error('Could not find HTMLElementTagNameMap');
    process.exit(1);
  }

  // Extract element metadata
  const elements: Map<string, ElementMetadata> = new Map();

  for (const [tagName, interfaceName] of elementMap) {
    const attributes = extractElementAttributes(program, checker, interfaceName, tagName);
    elements.set(tagName, {
      tagName,
      interfaceName,
      attributes,
    });
  }

  // Generate the output file
  const outputPath = path.resolve(
    __dirname,
    '../packages/language/src/completion/html-elements.generated.ts'
  );

  const output = generateOutputFile(elements);
  fs.writeFileSync(outputPath, output, 'utf-8');

  console.log(`Generated ${outputPath}`);
  console.log(`  - ${elements.size} elements`);
  console.log(`  - ${COMMON_ATTRIBUTES.length} common attributes`);

  let totalSpecificAttrs = 0;
  for (const elem of elements.values()) {
    totalSpecificAttrs += elem.attributes.length;
  }
  console.log(`  - ${totalSpecificAttrs} element-specific attributes`);
}

/**
 * Find HTMLElementTagNameMap and extract tag → interface mappings
 */
function findHTMLElementTagNameMap(
  program: ts.Program,
  checker: ts.TypeChecker
): Map<string, string> | null {
  const result = new Map<string, string>();

  // Look through all source files for the type
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) continue;

    ts.forEachChild(sourceFile, node => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === 'HTMLElementTagNameMap') {
        for (const member of node.members) {
          if (ts.isPropertySignature(member) && member.name && member.type) {
            const tagName = getPropertyName(member.name);
            if (tagName && ts.isTypeReferenceNode(member.type)) {
              const interfaceName = member.type.typeName.getText();
              result.set(tagName, interfaceName);
            }
          }
        }
      }
    });
  }

  return result.size > 0 ? result : null;
}

/**
 * Extract attributes from an HTML element interface
 */
function extractElementAttributes(
  program: ts.Program,
  checker: ts.TypeChecker,
  interfaceName: string,
  tagName: string
): AttributeMetadata[] {
  const attributes: AttributeMetadata[] = [];
  const seenNames = new Set<string>();

  // Find the interface in declaration files
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) continue;

    ts.forEachChild(sourceFile, node => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
        for (const member of node.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const name = getPropertyName(member.name);
            if (!name || seenNames.has(name)) continue;
            if (shouldExcludeProperty(name)) continue;

            const attr = extractAttributeMetadata(name, member, checker);
            if (attr) {
              attributes.push(attr);
              seenNames.add(name);
            }
          }
        }
      }
    });
  }

  // Merge inherited attributes from mixin interfaces
  const inheritedAttrs = INHERITED_ATTRIBUTES[tagName];
  if (inheritedAttrs) {
    for (const [attrName, attrType] of Object.entries(inheritedAttrs)) {
      if (!seenNames.has(attrName)) {
        attributes.push({
          name: attrName,
          type: attrType,
        });
        seenNames.add(attrName);
      }
    }
  }

  // Merge well-known enum values that TypeScript doesn't expose
  const wellKnownAttrs = WELL_KNOWN_ENUM_VALUES[tagName];
  if (wellKnownAttrs) {
    for (const [attrName, enumValues] of Object.entries(wellKnownAttrs)) {
      // Find existing attribute or create a new one
      const existingAttr = attributes.find(a => a.name === attrName);
      if (existingAttr) {
        // Upgrade to enum type with values
        existingAttr.type = 'enum';
        existingAttr.enumValues = [...enumValues].sort();
      } else if (!seenNames.has(attrName)) {
        // Add new attribute with enum values
        attributes.push({
          name: attrName,
          type: 'enum',
          enumValues: [...enumValues].sort(),
        });
        seenNames.add(attrName);
      }
    }
  }

  // Sort alphabetically
  attributes.sort((a, b) => a.name.localeCompare(b.name));
  return attributes;
}

/**
 * Extract metadata for a single attribute
 */
function extractAttributeMetadata(
  name: string,
  member: ts.PropertySignature,
  checker: ts.TypeChecker
): AttributeMetadata | null {
  if (!member.type) return null;

  const type = checker.getTypeAtLocation(member.type);
  const typeString = checker.typeToString(type);

  // Check for string literal union (enum)
  if (type.isUnion()) {
    const enumValues: string[] = [];
    let allStrings = true;

    for (const subType of type.types) {
      if (subType.isStringLiteral()) {
        enumValues.push(subType.value);
      } else if ((subType.flags & ts.TypeFlags.String) !== 0) {
        // Union includes general string type - not a pure enum
        allStrings = false;
      } else {
        allStrings = false;
      }
    }

    if (allStrings && enumValues.length > 0) {
      return { name, type: 'enum', enumValues: enumValues.sort() };
    }
  }

  // Check for boolean
  if (
    (type.flags & ts.TypeFlags.Boolean) !== 0 ||
    (type.flags & ts.TypeFlags.BooleanLiteral) !== 0 ||
    typeString === 'boolean'
  ) {
    return { name, type: 'boolean' };
  }

  // Check for number
  if (
    (type.flags & ts.TypeFlags.Number) !== 0 ||
    (type.flags & ts.TypeFlags.NumberLiteral) !== 0 ||
    typeString === 'number'
  ) {
    return { name, type: 'number' };
  }

  // Check for string
  if (
    (type.flags & ts.TypeFlags.String) !== 0 ||
    (type.flags & ts.TypeFlags.StringLiteral) !== 0 ||
    typeString === 'string'
  ) {
    return { name, type: 'string' };
  }

  // Default to string for other types we can represent
  return { name, type: 'string' };
}

/**
 * Check if a property should be excluded
 */
function shouldExcludeProperty(name: string): boolean {
  if (EXCLUDED_PROPERTIES.has(name)) return true;
  if (EVENT_HANDLER_PATTERN.test(name)) return true;
  if (name.startsWith('aria')) return true;
  return false;
}

/**
 * Get property name as string
 */
function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name)) {
    return name.text;
  }
  return null;
}

/**
 * Generate the output TypeScript file
 */
function generateOutputFile(elements: Map<string, ElementMetadata>): string {
  const sortedTags = Array.from(elements.keys()).sort();

  let output = `/**
 * HTML Element Metadata (AUTO-GENERATED)
 *
 * DO NOT EDIT - This file is generated by scripts/generate-html-metadata.ts
 * Run: pnpm generate:html-metadata
 *
 * Generated: ${new Date().toISOString()}
 * Elements: ${elements.size}
 */

import type { HTMLAttributeMetadata, HTMLElementMetadata } from '../html/metadata-types.js';

/**
 * All valid HTML element tag names
 */
export const HTML_ELEMENT_NAMES = [
${sortedTags.map(tag => `  '${tag}',`).join('\n')}
] as const;

/**
 * HTML element name type
 */
export type HTMLElementName = (typeof HTML_ELEMENT_NAMES)[number];

/**
 * Common attributes inherited from HTMLElement (apply to all elements)
 */
export const COMMON_HTML_ATTRIBUTES: readonly HTMLAttributeMetadata[] = [
${COMMON_ATTRIBUTES.map(attr => `  ${JSON.stringify(attr)},`).join('\n')}
];

/**
 * Element-specific attributes
 */
export const HTML_ELEMENT_ATTRIBUTES: Readonly<Record<HTMLElementName, HTMLElementMetadata>> = {
`;

  for (const tag of sortedTags) {
    const elem = elements.get(tag)!;
    output += `  '${tag}': {\n`;
    output += `    tagName: '${elem.tagName}',\n`;
    output += `    interfaceName: '${elem.interfaceName}',\n`;
    output += `    attributes: [\n`;
    for (const attr of elem.attributes) {
      output += `      ${JSON.stringify(attr)},\n`;
    }
    output += `    ],\n`;
    output += `  },\n`;
  }

  output += `};

/**
 * Get element metadata by tag name
 */
export function getElementMetadata(tagName: string): HTMLElementMetadata | undefined {
  const normalizedTag = tagName.toLowerCase();
  return HTML_ELEMENT_ATTRIBUTES[normalizedTag as HTMLElementName];
}

/**
 * Get all attributes for an element (specific + common)
 */
export function getElementAttributes(tagName: string): readonly HTMLAttributeMetadata[] {
  const metadata = getElementMetadata(tagName);
  if (!metadata) {
    // Unknown element - return only common attributes
    return COMMON_HTML_ATTRIBUTES;
  }
  // Combine element-specific and common attributes
  return [...metadata.attributes, ...COMMON_HTML_ATTRIBUTES];
}

/**
 * Get enum values for an attribute
 */
export function getAttributeEnumValues(
  tagName: string,
  attributeName: string
): readonly string[] | undefined {
  const attributes = getElementAttributes(tagName);
  const attr = attributes.find(a => a.name === attributeName);
  if (attr?.type === 'enum' && attr.enumValues) {
    return attr.enumValues;
  }
  return undefined;
}

/**
 * Check if a tag name is a valid HTML element
 */
export function isValidHTMLElement(tagName: string): boolean {
  return HTML_ELEMENT_NAMES.includes(tagName.toLowerCase() as HTMLElementName);
}
`;

  return output;
}

// Run the generator
generateHTMLMetadata();
