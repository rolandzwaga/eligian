# Data Model: Event Action Code Completion

Event metadata from timeline-events.generated.ts transforms to skeleton templates then to LSP completion items. camelCase naming: split hyphens, lowercase first word, capitalize rest, add handle prefix. Example: language-change becomes handleLanguageChange. Uses existing type system for parameter checking.
