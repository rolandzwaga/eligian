# Quickstart: Event Actions in Eligian

**Goal**: Write your first event-triggered action in under 5 minutes.

## What Are Event Actions?

Event actions execute automatically when events are broadcast through the Eligius eventbus. They enable interactive presentations that respond to user actions, timeline events, or custom triggers.

**Example Use Cases**:
- Respond to language changes
- Handle user clicks on navigation elements
- React to timeline completion events
- Process form submissions

## Basic Syntax

```eligian
on event "<eventName>" action <ActionName>(<parameters>) [
  <operations>
]
```

## Your First Event Action (2 minutes)

### Step 1: Define an Event Action

Create a new `.eligian` file or add to an existing one:

```eligian
on event "language-change" action UpdateLanguageDisplay(languageCode) [
  selectElement(".language-display")
  setTextContent(languageCode)
]
```

**What this does**:
- Listens for the `"language-change"` event
- When triggered, receives `languageCode` as a parameter
- Selects the `.language-display` element
- Updates its text content with the new language code

### Step 2: Compile to JSON

Run the Eligian compiler:

```bash
pnpm run compile my-presentation.eligian
```

This generates:

```json
{
  "eventActions": [
    {
      "id": "uuid-generated-by-compiler",
      "name": "UpdateLanguageDisplay",
      "eventName": "language-change",
      "startOperations": [
        {
          "id": "op-uuid-1",
          "systemName": "selectElement",
          "operationData": { "selector": ".language-display" }
        },
        {
          "id": "op-uuid-2",
          "systemName": "setTextContent",
          "operationData": { "textContent": "$operationData.eventArgs[0]" }
        }
      ]
    }
  ]
}
```

### Step 3: Trigger the Event

In your JavaScript code, broadcast the event:

```javascript
import { createEngine } from 'eligius';

const engine = await createEngine(config);
engine.eventbus.broadcast('language-change', ['fr-FR']);
```

**Result**: The language display updates to `"fr-FR"`!

## Adding Event Topics (1 minute)

Topics namespace events of the same name:

```eligian
on event "click" topic "navigation" action HandleNavClick(target) [
  selectElement(target)
  addClass("active")
]

on event "click" topic "form" action HandleFormClick(formId) [
  selectElement(formId)
  submitForm()
]
```

**Triggering with topics**:

```javascript
// Triggers HandleNavClick
engine.eventbus.broadcastForTopic('click', 'navigation', ['#nav-button']);

// Triggers HandleFormClick
engine.eventbus.broadcastForTopic('click', 'form', ['#my-form']);
```

## Multiple Parameters (1 minute)

Event actions support any number of parameters:

```eligian
on event "user-interaction" action TrackInteraction(element, timestamp, userId) [
  logEvent(element, timestamp, userId)
  updateAnalytics(userId)
]
```

**How parameters work**:
- First parameter (`element`) → `eventArgs[0]`
- Second parameter (`timestamp`) → `eventArgs[1]`
- Third parameter (`userId`) → `eventArgs[2]`

**Broadcasting**:

```javascript
engine.eventbus.broadcast('user-interaction', [
  '#button',
  Date.now(),
  'user-123'
]);
```

## Common Patterns

### Pattern 1: Timeline Completion Handler

```eligian
on event "timeline-complete" action ShowCompletionMessage [
  selectElement("#completion-overlay")
  removeClass("hidden")
  addClass("visible")
]
```

**No parameters needed** - the event acts as a simple trigger.

### Pattern 2: Language Selector

```eligian
const SUPPORTED_LANGUAGES = ["en-US", "fr-FR", "de-DE"]

on event "language-change" action ValidateAndSetLanguage(newLang, oldLang) [
  if (SUPPORTED_LANGUAGES.includes(newLang)) {
    selectElement(".lang-code")
    setTextContent(newLang)
    setAttribute("data-previous-lang", oldLang)
  } else {
    logMessage("Unsupported language:", newLang)
  }
]
```

**Combines**: Constants, parameters, and control flow.

### Pattern 3: Click Handler with Data

```eligian
on event "element-clicked" topic "navigation" action NavigateToSection(sectionId) [
  selectElement(sectionId)
  scrollIntoView()
  addClass("active")

  // Remove active class from siblings
  selectAll(".nav-section")
  removeClass("active")
]
```

**Demonstrates**: Topic namespacing for context-specific handling.

## IDE Support

### Autocomplete

Type `on event "` in VS Code to trigger autocomplete for known Eligius event names:
- `timeline-play`
- `timeline-pause`
- `timeline-complete`
- `language-change`
- Custom events (defined in your application)

### Hover Documentation

Hover over event action definitions to see:
- Parameter names and positions
- Event name documentation (if available)
- Compilation details

### Error Highlighting

The IDE highlights errors in real-time:
- **Red underline**: Syntax errors, invalid event names, empty action bodies
- **Yellow underline**: Warnings (duplicate handlers, unused parameters)

## Validation Rules

### Valid Event Actions

```eligian
✅ Basic event action
on event "my-event" action Handler(arg) [
  logMessage(arg)
]

✅ Multiple parameters
on event "multi-param" action MultiHandler(a, b, c) [
  doSomething(a, b, c)
]

✅ Zero parameters
on event "no-params" action NoParamHandler [
  showMessage()
]

✅ With topic
on event "event" topic "topic" action TopicHandler(x) [
  process(x)
]
```

### Common Errors

```eligian
❌ ERROR: Event name must be string literal
const EVENT_NAME = "my-event"
on event EVENT_NAME action Handler [...]
// Fix: Use "my-event" directly

❌ ERROR: Empty action body
on event "my-event" action EmptyHandler []
// Fix: Add at least one operation

❌ ERROR: Reserved keyword as parameter
on event "my-event" action BadParams(if, for) [...]
// Fix: Use different parameter names (condition, loopVar)

❌ ERROR: Duplicate parameter names
on event "my-event" action DuplicateParams(foo, foo) [...]
// Fix: Rename one parameter to foo2 or similar
```

## Best Practices

### 1. Use Descriptive Event Names

```eligian
✅ Good
on event "user-login-success" action ShowDashboard [...]
on event "form-validation-error" action DisplayErrors(errors) [...]

❌ Avoid
on event "event1" action Handler [...]
on event "click" action DoStuff [...]  // Too generic
```

### 2. Namespace with Topics for Clarity

```eligian
✅ Good - Clear context
on event "submit" topic "contact-form" action HandleContactSubmit [...]
on event "submit" topic "newsletter-form" action HandleNewsletterSubmit [...]

❌ Avoid - Ambiguous
on event "submit" action HandleSubmit [...]  // Which form?
```

### 3. Keep Event Actions Focused

```eligian
✅ Good - Single responsibility
on event "language-change" action UpdateLanguageUI(lang) [
  selectElement(".lang-display")
  setTextContent(lang)
]

on event "language-change" action SaveLanguagePreference(lang) [
  saveToLocalStorage("language", lang)
]

❌ Avoid - Doing too much
on event "language-change" action DoEverything(lang) [
  // 50 lines of mixed concerns
]
```

### 4. Document Parameter Purpose with JSDoc

```eligian
/**
 * Handles language change events by updating the UI display
 * @param languageCode The new language code (e.g., "fr-FR", "en-US")
 */
on event "language-change" action UpdateLanguageDisplay(languageCode) [
  selectElement(".language-display")
  setTextContent(languageCode)
]
```

## Troubleshooting

### Event Action Not Executing

**Symptom**: Event action defined but doesn't run when event is broadcast.

**Checklist**:
1. ✅ Event name matches exactly (case-sensitive)
2. ✅ Topic matches (if using topics)
3. ✅ Event is actually being broadcast (check JavaScript code)
4. ✅ Eligius configuration loaded correctly
5. ✅ No compilation errors in event action

**Debug**:

```javascript
// Add logging to verify event broadcast
engine.eventbus.broadcast('my-event', ['arg1']);
console.log('Event broadcast complete');
```

### Parameter Undefined in Operations

**Symptom**: Operation receives `undefined` for event parameter.

**Causes**:
1. **Mismatch in parameter count**: Event broadcasts 1 argument, action expects 2
2. **Wrong parameter order**: Arguments passed in different order than expected

**Fix**:

```javascript
// Ensure argument count matches
engine.eventbus.broadcast('my-event', ['arg1', 'arg2']);  // 2 arguments

// Event action must have 2 parameters
on event "my-event" action Handler(arg1, arg2) [...]
```

### Duplicate Handler Warning

**Symptom**: Warning about multiple event actions for same event.

**Explanation**: This is expected behavior if you want multiple handlers.

**Intentional**:

```eligian
// Both execute when "click" is broadcast
on event "click" action LogClick(target) [
  logMessage("Click:", target)
]

on event "click" action TrackClick(target) [
  sendAnalytics("click", target)
]
```

**Unintentional**:

```eligian
// If you only want one, remove the other or use topics
on event "click" topic "logging" action LogClick [...]
on event "click" topic "tracking" action TrackClick [...]
```

## Next Steps

### Explore Advanced Features

1. **Control Flow in Event Actions**:
   ```eligian
   on event "user-action" action ConditionalHandler(action) [
     if (action == "submit") {
       submitForm()
     } else if (action == "cancel") {
       resetForm()
     }
   ]
   ```

2. **Loop Through Event Data**:
   ```eligian
   on event "process-items" action ProcessEach(items) [
     for (item in items) {
       processItem(@@currentItem)
     }
   ]
   ```

3. **Call Other Actions**:
   ```eligian
   action ShowNotification(message) [
     selectElement("#notification")
     setTextContent(message)
     addClass("visible")
   ]

   on event "error" action HandleError(errorMsg) [
     ShowNotification(errorMsg)  // Call regular action
     logError(errorMsg)
   ]
   ```

### Read Full Documentation

- **Language Specification**: `LANGUAGE_SPEC.md` - Complete syntax reference
- **Data Model**: `specs/028-event-actions-the/data-model.md` - Entity definitions
- **Examples**: `specs/028-event-actions-the/contracts/examples.md` - More examples

## Summary

You learned:
- ✅ Basic event action syntax
- ✅ Parameter mapping to `eventArgs`
- ✅ Topic namespacing for event organization
- ✅ Common patterns and best practices
- ✅ Validation rules and error handling
- ✅ Troubleshooting tips

**Time to write your first event action**: ~5 minutes ✨

---

**Questions?** Check the spec documentation or open an issue in the Eligian repository.
