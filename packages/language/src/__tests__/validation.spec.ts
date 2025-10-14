import { describe, test, expect, beforeAll } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Eligian Grammar - Validation', () => {
    let services: ReturnType<typeof createEligianServices>;
    let parse: ReturnType<typeof parseHelper<Program>>;

    beforeAll(async () => {
        services = createEligianServices(EmptyFileSystem);
        parse = parseHelper<Program>(services.Eligian);
    });

    /**
     * Helper: Parse DSL code and return validation diagnostics
     */
    async function parseAndValidate(code: string) {
        const document = await parse(code);

        // Manually trigger validation
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        return {
            document,
            diagnostics: document.diagnostics ?? [],
            validationErrors: document.diagnostics?.filter(d => d.severity === 1) ?? [] // 1 = Error
        };
    }

    /**
     * Helper: Load fixture file
     */
    function loadFixture(filename: string): string {
        const path = join(__dirname, '__fixtures__', 'invalid', filename);
        return readFileSync(path, 'utf-8');
    }

    describe('Timeline validation (T036, T042, T043)', () => {
        test('should require exactly one timeline declaration', async () => {
            const code = `
                event test at 0..5 {
                    show #element
                }
            `;
            const { validationErrors } = await parseAndValidate(code);

            expect(validationErrors.length).toBeGreaterThan(0);
            expect(validationErrors.some(e =>
                e.message.includes('timeline declaration is required')
            )).toBe(true);
        });

        test('should reject multiple timeline declarations', async () => {
            const code = loadFixture('multiple-timelines.eligian');
            const { validationErrors } = await parseAndValidate(code);

            expect(validationErrors.length).toBeGreaterThan(0);
            expect(validationErrors.some(e =>
                e.message.includes('Only one timeline declaration is allowed')
            )).toBe(true);
        });

        test('should accept valid timeline providers', async () => {
            const validProviders = ['video', 'audio', 'raf', 'custom'];

            for (const provider of validProviders) {
                const code = provider === 'video' || provider === 'audio'
                    ? `timeline ${provider} from "test.mp4"\nevent test at 0..5 { show #el }`
                    : `timeline ${provider}\nevent test at 0..5 { show #el }`;

                const { validationErrors } = await parseAndValidate(code);

                // Should not have provider-related errors
                const providerErrors = validationErrors.filter(e =>
                    e.message.includes('Invalid timeline provider')
                );
                expect(providerErrors.length).toBe(0);
            }
        });

        test('should reject invalid timeline provider', async () => {
            const code = loadFixture('invalid-provider.eligian');
            const { validationErrors } = await parseAndValidate(code);

            expect(validationErrors.length).toBeGreaterThan(0);
            expect(validationErrors.some(e =>
                e.message.includes('Invalid timeline provider')
            )).toBe(true);
        });

        test('should require source for video provider', async () => {
            const code = `
                timeline video
                event test at 0..5 { show #el }
            `;
            const { validationErrors } = await parseAndValidate(code);

            expect(validationErrors.length).toBeGreaterThan(0);
            expect(validationErrors.some(e =>
                e.message.includes('requires a source file')
            )).toBe(true);
        });

        test('should require source for audio provider', async () => {
            const code = `
                timeline audio
                event test at 0..5 { show #el }
            `;
            const { validationErrors } = await parseAndValidate(code);

            expect(validationErrors.length).toBeGreaterThan(0);
            expect(validationErrors.some(e =>
                e.message.includes('requires a source file')
            )).toBe(true);
        });

        test('should not require source for raf provider', async () => {
            const code = `
                timeline raf
                event test at 0..5 { show #el }
            `;
            const { validationErrors } = await parseAndValidate(code);

            // Should not have source-related errors
            const sourceErrors = validationErrors.filter(e =>
                e.message.includes('requires a source')
            );
            expect(sourceErrors.length).toBe(0);
        });
    });

    describe('Event validation (T037, T038, T039)', () => {
        test('should reject duplicate event IDs', async () => {
            const code = loadFixture('duplicate-event-ids.eligian');
            const { validationErrors } = await parseAndValidate(code);

            expect(validationErrors.length).toBeGreaterThan(0);
            expect(validationErrors.some(e =>
                e.message.includes('Duplicate event ID')
            )).toBe(true);
        });

        test('should accept unique event IDs', async () => {
            const code = `
                timeline raf
                event intro at 0..5 { show #el1 }
                event main at 5..10 { show #el2 }
                event outro at 10..15 { show #el3 }
            `;
            const { validationErrors } = await parseAndValidate(code);

            // Should not have duplicate ID errors
            const duplicateErrors = validationErrors.filter(e =>
                e.message.includes('Duplicate event ID')
            );
            expect(duplicateErrors.length).toBe(0);
        });

        test('should reject invalid time range (start >= end)', async () => {
            const code = loadFixture('invalid-time-range.eligian');
            const { validationErrors } = await parseAndValidate(code);

            expect(validationErrors.length).toBeGreaterThan(0);
            expect(validationErrors.some(e =>
                e.message.includes('start time') && e.message.includes('must be less than')
            )).toBe(true);
        });

        test('should accept valid time range (start < end)', async () => {
            const code = `
                timeline raf
                event test at 0..10 { show #el }
            `;
            const { validationErrors } = await parseAndValidate(code);

            // Should not have time range errors
            const timeRangeErrors = validationErrors.filter(e =>
                e.message.includes('start time') && e.message.includes('must be less than')
            );
            expect(timeRangeErrors.length).toBe(0);
        });

        test('should reject negative start time', async () => {
            const code = loadFixture('negative-times.eligian');
            const { document } = await parseAndValidate(code);

            // Note: Negative numbers are syntax errors in our grammar (NUMBER terminal doesn't support negatives)
            // So this is caught at parse time, not validation time
            expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
        });

        test('should reject negative end time', async () => {
            const code = loadFixture('negative-times.eligian');
            const { document } = await parseAndValidate(code);

            // Note: Negative numbers are syntax errors in our grammar (NUMBER terminal doesn't support negatives)
            // So this is caught at parse time, not validation time
            expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
        });

        test('should accept non-negative times', async () => {
            const code = `
                timeline raf
                event test at 0..10 { show #el }
                event test2 at 100..200 { show #el2 }
            `;
            const { validationErrors } = await parseAndValidate(code);

            // Should not have negative time errors
            const negativeErrors = validationErrors.filter(e =>
                e.message.includes('cannot be negative')
            );
            expect(negativeErrors.length).toBe(0);
        });
    });

    describe('Action validation (T041)', () => {
        test('should require target for show action', async () => {
            const code = `
                timeline raf
                event test at 0..5 {
                    show
                }
            `;
            const { document } = await parseAndValidate(code);

            // Note: Missing target is a parse error, not a validation error
            // The grammar doesn't allow show without a target
            expect(document.parseResult.lexerErrors.length + document.parseResult.parserErrors.length).toBeGreaterThan(0);
        });

        test('should require target for hide action', async () => {
            const code = `
                timeline raf
                event test at 0..5 {
                    hide
                }
            `;
            const { document } = await parseAndValidate(code);

            // Note: Missing target is a parse error, not a validation error
            expect(document.parseResult.lexerErrors.length + document.parseResult.parserErrors.length).toBeGreaterThan(0);
        });

        test('should require target for animate action', async () => {
            const code = `
                timeline raf
                event test at 0..5 {
                    animate
                }
            `;
            const { document } = await parseAndValidate(code);

            // Note: Missing target is a parse error, not a validation error
            expect(document.parseResult.lexerErrors.length + document.parseResult.parserErrors.length).toBeGreaterThan(0);
        });

        test('should accept actions with valid targets', async () => {
            const code = `
                timeline raf
                event test at 0..5 {
                    show #element
                    hide .class
                    animate #diagram with spin(1000)
                }
            `;
            const { validationErrors, document } = await parseAndValidate(code);

            expect(document.parseResult.lexerErrors.length).toBe(0);
            expect(document.parseResult.parserErrors.length).toBe(0);
            expect(validationErrors.length).toBe(0);
        });

        test('should accept trigger action without target', async () => {
            const code = `
                timeline raf
                event test at 0..5 {
                    trigger myAction
                }
            `;
            const { validationErrors, document } = await parseAndValidate(code);

            expect(document.parseResult.lexerErrors.length).toBe(0);
            expect(document.parseResult.parserErrors.length).toBe(0);
            // Trigger doesn't require a target, so should be valid
            expect(validationErrors.length).toBe(0);
        });
    });

    describe('Comprehensive validation', () => {
        test('should validate complex valid program', async () => {
            const code = `
                timeline video from "presentation.mp4"

                event intro at 0..5 {
                    show #title with fadeIn(500)
                    show #subtitle with slideIn(300, "left")
                }

                event main at 5..120 {
                    show #content
                    trigger startAnimation on #diagram
                }

                event outro at 120..130 {
                    hide #content with fadeOut(400)
                    show #credits with slideIn(500, "bottom")
                }
            `;
            const { validationErrors, document } = await parseAndValidate(code);

            expect(document.parseResult.lexerErrors.length).toBe(0);
            expect(document.parseResult.parserErrors.length).toBe(0);
            expect(validationErrors.length).toBe(0);
        });

        test('should accumulate multiple validation errors', async () => {
            const code = `
                // Missing timeline

                // Duplicate event IDs
                event test at 0..5 { show #el1 }
                event test at 10..15 { show #el2 }

                // Invalid time range
                event bad at 20..10 { show #el3 }
            `;
            const { validationErrors } = await parseAndValidate(code);

            // Should have multiple errors
            expect(validationErrors.length).toBeGreaterThan(2);

            // Check for each type of validation error
            expect(validationErrors.some(e => e.message.includes('timeline'))).toBe(true);
            expect(validationErrors.some(e => e.message.includes('Duplicate'))).toBe(true);
            expect(validationErrors.some(e => e.message.includes('must be less than'))).toBe(true);
        });
    });
});
