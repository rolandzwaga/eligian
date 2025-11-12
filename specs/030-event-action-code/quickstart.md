# Quickstart: Event Action Code Completion

## Usage

1. Type `on event "` in .eligian file
2. Press Ctrl+Space inside quotes
3. Select event from list (43 events available)
4. Complete action skeleton inserted with camelCase naming
5. Cursor positioned inside action body

## Examples

Typing `on event "lang` + Ctrl+Space shows language-change event.
Selecting it generates:

```eligian
on event "language-change" action handleLanguageChange(languageCode: string) [
	[cursor here]
]
```

## Event Naming

All generated actions use camelCase with "handle" prefix:
- timeline-play -> handleTimelinePlay
- user-login -> handleUserLogin
- before-request-video-url -> handleBeforeRequestVideoUrl
