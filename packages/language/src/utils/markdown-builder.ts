/**
 * Markdown Builder Utilities
 *
 * This module provides a fluent builder for constructing markdown content,
 * eliminating duplicated array-based markdown building patterns.
 */

/**
 * Fluent builder for constructing markdown strings.
 *
 * This utility consolidates the repeated pattern of:
 * ```typescript
 * const lines: string[] = [];
 * lines.push('# Heading');
 * lines.push('');
 * lines.push('Content');
 * return lines.join('\n');
 * ```
 *
 * @example
 * ```typescript
 * // Before:
 * const lines: string[] = [];
 * lines.push('### Heading');
 * lines.push('');
 * lines.push('Some content');
 * lines.push('```code```');
 * return lines.join('\n');
 *
 * // After:
 * const markdown = new MarkdownBuilder()
 *   .heading(3, 'Heading')
 *   .blank()
 *   .text('Some content')
 *   .codeBlock('code')
 *   .build();
 * ```
 *
 * @example
 * ```typescript
 * // Complex markdown with lists and code blocks:
 * const markdown = new MarkdownBuilder()
 *   .heading(2, 'Operation Name')
 *   .blank()
 *   .text('Description here')
 *   .blank()
 *   .text('**Parameters:**')
 *   .list(['param1: string', 'param2: number'])
 *   .blank()
 *   .codeBlock('function example() {}', 'typescript')
 *   .build();
 * ```
 */
export class MarkdownBuilder {
  private lines: string[] = [];

  /**
   * Add a heading at the specified level (1-6).
   *
   * @param level - Heading level (1-6, where 1 is `#` and 6 is `######`)
   * @param text - Heading text
   * @returns This builder for method chaining
   *
   * @example
   * ```typescript
   * builder.heading(1, 'Title');        // # Title
   * builder.heading(3, 'Subsection');   // ### Subsection
   * ```
   */
  heading(level: number, text: string): this {
    const hashes = '#'.repeat(Math.max(1, Math.min(6, level)));
    this.lines.push(`${hashes} ${text}`);
    return this;
  }

  /**
   * Add a text line.
   *
   * @param content - Text content (can include markdown formatting)
   * @returns This builder for method chaining
   *
   * @example
   * ```typescript
   * builder.text('Plain text');
   * builder.text('**Bold text**');
   * builder.text('Text with `code`');
   * ```
   */
  text(content: string): this {
    this.lines.push(content);
    return this;
  }

  /**
   * Add a blank line.
   *
   * @returns This builder for method chaining
   *
   * @example
   * ```typescript
   * builder.text('Paragraph 1').blank().text('Paragraph 2');
   * ```
   */
  blank(): this {
    this.lines.push('');
    return this;
  }

  /**
   * Add a list of items (unordered by default).
   *
   * @param items - Array of list items
   * @param ordered - If true, creates numbered list (default: false)
   * @returns This builder for method chaining
   *
   * @example
   * ```typescript
   * // Unordered list:
   * builder.list(['Item 1', 'Item 2']);
   * // - Item 1
   * // - Item 2
   *
   * // Ordered list:
   * builder.list(['First', 'Second'], true);
   * // 1. First
   * // 2. Second
   * ```
   */
  list(items: string[], ordered = false): this {
    for (let i = 0; i < items.length; i++) {
      const prefix = ordered ? `${i + 1}.` : '-';
      this.lines.push(`${prefix} ${items[i]}`);
    }
    return this;
  }

  /**
   * Add a fenced code block.
   *
   * @param code - Code content
   * @param language - Optional language identifier (e.g., 'typescript', 'css')
   * @returns This builder for method chaining
   *
   * @example
   * ```typescript
   * builder.codeBlock('const x = 42;', 'typescript');
   * // ```typescript
   * // const x = 42;
   * // ```
   *
   * builder.codeBlock('div { color: red; }', 'css');
   * // ```css
   * // div { color: red; }
   * // ```
   * ```
   */
  codeBlock(code: string, language?: string): this {
    this.lines.push(`\`\`\`${language || ''}`);
    this.lines.push(code);
    this.lines.push('```');
    return this;
  }

  /**
   * Build the final markdown string.
   *
   * Joins all lines with newline characters and returns the result.
   *
   * @returns Final markdown string
   *
   * @example
   * ```typescript
   * const markdown = new MarkdownBuilder()
   *   .heading(1, 'Title')
   *   .text('Content')
   *   .build();
   * // Returns: "# Title\nContent"
   * ```
   */
  build(): string {
    return this.lines.join('\n');
  }
}
