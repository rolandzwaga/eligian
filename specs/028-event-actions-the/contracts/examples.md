# Event Action Configuration Examples

This document provides concrete examples of how Eligian DSL event actions compile to Eligius JSON configuration.

## Example 1: Basic Event Action with Single Parameter

### Eligian DSL

```eligian
on event "language-change" action HandleLanguageChange(languageCode) [
  selectElement(".language-display")
  setTextContent(languageCode)
]
```

### Compiled JSON

```json
{
  "eventActions": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "HandleLanguageChange",
      "eventName": "language-change",
      "startOperations": [
        {
          "id": "op-1",
          "systemName": "selectElement",
          "operationData": {
            "selector": ".language-display"
          }
        },
        {
          "id": "op-2",
          "systemName": "setTextContent",
          "operationData": {
            "textContent": "$operationData.eventArgs[0]"
          }
        }
      ]
    }
  ]
}
```

### Notes

- Parameter `languageCode` maps to `$operationData.eventArgs[0]`
- No `eventTopic` specified (optional field omitted)
- Each operation has unique UUID v4 `id`

---

## Example 2: Event Action with Topic Namespacing

### Eligian DSL

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

### Compiled JSON

```json
{
  "eventActions": [
    {
      "id": "nav-click-uuid",
      "name": "HandleNavClick",
      "eventName": "click",
      "eventTopic": "navigation",
      "startOperations": [
        {
          "id": "op-3",
          "systemName": "selectElement",
          "operationData": {
            "selector": "$operationData.eventArgs[0]"
          }
        },
        {
          "id": "op-4",
          "systemName": "addClass",
          "operationData": {
            "className": "active"
          }
        }
      ]
    },
    {
      "id": "form-click-uuid",
      "name": "HandleFormClick",
      "eventName": "click",
      "eventTopic": "form",
      "startOperations": [
        {
          "id": "op-5",
          "systemName": "selectElement",
          "operationData": {
            "selector": "$operationData.eventArgs[0]"
          }
        },
        {
          "id": "op-6",
          "systemName": "submitForm",
          "operationData": {}
        }
      ]
    }
  ]
}
```

### Notes

- Both actions handle `"click"` event but with different topics
- Runtime: `"click:navigation"` and `"click:form"` are registered separately
- Enables context-specific handling of same event name

---

## Example 3: Multiple Parameters

### Eligian DSL

```eligian
on event "user-interaction" action TrackInteraction(element, timestamp, userId) [
  logEvent(element, timestamp, userId)
  updateAnalytics(userId, element)
]
```

### Compiled JSON

```json
{
  "eventActions": [
    {
      "id": "interaction-uuid",
      "name": "TrackInteraction",
      "eventName": "user-interaction",
      "startOperations": [
        {
          "id": "op-7",
          "systemName": "logEvent",
          "operationData": {
            "element": "$operationData.eventArgs[0]",
            "timestamp": "$operationData.eventArgs[1]",
            "userId": "$operationData.eventArgs[2]"
          }
        },
        {
          "id": "op-8",
          "systemName": "updateAnalytics",
          "operationData": {
            "userId": "$operationData.eventArgs[2]",
            "element": "$operationData.eventArgs[0]"
          }
        }
      ]
    }
  ]
}
```

### Notes

- Parameters maintain their index mapping across operations
- `element` → `eventArgs[0]`, `timestamp` → `eventArgs[1]`, `userId` → `eventArgs[2]`
- Order of parameters in DSL determines array indices

---

## Example 4: Zero-Parameter Event Action

### Eligian DSL

```eligian
on event "timeline-complete" action OnComplete [
  selectElement("#completion-message")
  removeClass("hidden")
  addClass("visible")
]
```

### Compiled JSON

```json
{
  "eventActions": [
    {
      "id": "complete-uuid",
      "name": "OnComplete",
      "eventName": "timeline-complete",
      "startOperations": [
        {
          "id": "op-9",
          "systemName": "selectElement",
          "operationData": {
            "selector": "#completion-message"
          }
        },
        {
          "id": "op-10",
          "systemName": "removeClass",
          "operationData": {
            "className": "hidden"
          }
        },
        {
          "id": "op-11",
          "systemName": "addClass",
          "operationData": {
            "className": "visible"
          }
        }
      ]
    }
  ]
}
```

### Notes

- No parameters in event action definition
- No `eventArgs` references in operations (self-contained logic)
- Valid use case: event acts as a trigger without passing data

---

## Example 5: Complex Event Action with Mixed References

### Eligian DSL

```eligian
const DEFAULT_LANGUAGE = "en-US"

on event "language-change" action AdvancedLanguageHandler(newLanguage, oldLanguage) [
  logMessage("Language changing from", oldLanguage, "to", newLanguage)
  selectElement(".language-selector")
  setAttribute("data-previous", oldLanguage)
  setAttribute("data-current", newLanguage)
  if (newLanguage == DEFAULT_LANGUAGE) {
    addClass("default-language")
  } else {
    removeClass("default-language")
  }
]
```

### Compiled JSON

```json
{
  "eventActions": [
    {
      "id": "advanced-lang-uuid",
      "name": "AdvancedLanguageHandler",
      "eventName": "language-change",
      "startOperations": [
        {
          "id": "op-12",
          "systemName": "logMessage",
          "operationData": {
            "message": [
              "Language changing from",
              "$operationData.eventArgs[1]",
              "to",
              "$operationData.eventArgs[0]"
            ]
          }
        },
        {
          "id": "op-13",
          "systemName": "selectElement",
          "operationData": {
            "selector": ".language-selector"
          }
        },
        {
          "id": "op-14",
          "systemName": "setAttribute",
          "operationData": {
            "attributeName": "data-previous",
            "attributeValue": "$operationData.eventArgs[1]"
          }
        },
        {
          "id": "op-15",
          "systemName": "setAttribute",
          "operationData": {
            "attributeName": "data-current",
            "attributeValue": "$operationData.eventArgs[0]"
          }
        },
        {
          "id": "op-16",
          "systemName": "if",
          "operationData": {
            "condition": "$operationData.eventArgs[0] == 'en-US'",
            "thenOperations": [
              {
                "id": "op-17",
                "systemName": "addClass",
                "operationData": {
                  "className": "default-language"
                }
              }
            ],
            "elseOperations": [
              {
                "id": "op-18",
                "systemName": "removeClass",
                "operationData": {
                  "className": "default-language"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

### Notes

- Constant `DEFAULT_LANGUAGE` is inlined during compilation (`"en-US"`)
- Parameters `newLanguage` and `oldLanguage` map to `eventArgs[0]` and `eventArgs[1]`
- Control flow (`if/else`) is compiled to nested operations
- Demonstrates mixing event parameters, constants, and control flow

---

## Parameter Mapping Reference

| DSL Parameter Position | JSON eventArgs Index | Example DSL | Example JSON |
|------------------------|----------------------|-------------|--------------|
| 1st parameter | `eventArgs[0]` | `action Foo(first)` | `$operationData.eventArgs[0]` |
| 2nd parameter | `eventArgs[1]` | `action Foo(first, second)` | `$operationData.eventArgs[1]` |
| 3rd parameter | `eventArgs[2]` | `action Foo(first, second, third)` | `$operationData.eventArgs[2]` |
| Nth parameter | `eventArgs[N-1]` | `action Foo(..., nth)` | `$operationData.eventArgs[N-1]` |

---

## Event Topic Combinations

| Event Name | Event Topic | Runtime Key | Use Case |
|------------|-------------|-------------|----------|
| `"click"` | `undefined` | `"click"` | Generic click handler |
| `"click"` | `"navigation"` | `"click:navigation"` | Navigation-specific click |
| `"click"` | `"form"` | `"click:form"` | Form-specific click |
| `"language-change"` | `undefined` | `"language-change"` | Generic language change |
| `"language-change"` | `"user-selection"` | `"language-change:user-selection"` | User-initiated language change |

**Note**: Topics use `:` delimiter internally (Eligius implementation detail). DSL uses clean `topic "name"` syntax.

---

## Validation Examples

### Valid Event Actions

```eligian
// Valid: Basic event action
on event "my-event" action Handler(arg) [ logMessage(arg) ]

// Valid: Multiple parameters
on event "multi-param" action MultiHandler(a, b, c) [ doSomething(a, b, c) ]

// Valid: Zero parameters
on event "no-params" action NoParamHandler [ showMessage() ]

// Valid: With topic
on event "event" topic "topic" action TopicHandler(x) [ process(x) ]
```

### Invalid Event Actions

```eligian
// ❌ ERROR: Event name must be string literal
const EVENT_NAME = "my-event"
on event EVENT_NAME action Handler [...]

// ❌ ERROR: Empty action body
on event "my-event" action EmptyHandler []

// ❌ ERROR: Reserved keyword as parameter
on event "my-event" action BadParams(if, for) [...]

// ❌ ERROR: Duplicate parameter names
on event "my-event" action DuplicateParams(foo, foo) [...]

// ❌ ERROR: Event topic must be string literal
const TOPIC = "my-topic"
on event "my-event" topic TOPIC action Handler [...]
```

### Warnings

```eligian
// ⚠️ WARNING: Duplicate event/topic combination
on event "click" action Handler1 [...]
on event "click" action Handler2 [...]  // Same event name, both will execute

// ⚠️ WARNING: Unused parameter
on event "my-event" action UnusedParam(arg) [
  // 'arg' is never used in operations
  showMessage()
]
```

---

## Integration with Existing Eligius Configuration

### Full Configuration Example

```json
{
  "id": "presentation-uuid",
  "engine": { "systemName": "EligiusEngine" },
  "containerSelector": "#app",
  "cssFiles": ["styles.css"],
  "language": "en-US",
  "layoutTemplate": "<div id='container'></div>",
  "availableLanguages": [
    { "code": "en-US", "label": "English" },
    { "code": "nl-NL", "label": "Nederlands" }
  ],
  "initActions": [
    /* init actions here */
  ],
  "actions": [
    /* regular actions here */
  ],
  "eventActions": [
    {
      "id": "event-action-uuid",
      "name": "HandleLanguageChange",
      "eventName": "language-change",
      "startOperations": [
        /* operations here */
      ]
    }
  ],
  "timelines": [
    /* timeline configurations here */
  ],
  "labels": []
}
```

**Note**: `eventActions` is a top-level array in the configuration, separate from `actions` and `initActions`.

---

## Runtime Behavior Examples

### Scenario 1: Event Dispatched with Arguments

```typescript
// Runtime: Broadcast event with arguments
eventbus.broadcast("language-change", ["fr-FR", "en-US"]);

// Eligius runtime behavior:
// 1. Look up handlers for "language-change"
// 2. Create operationData: { eventArgs: ["fr-FR", "en-US"] }
// 3. Execute action.start(operationData)
// 4. Operations access eventArgs[0] = "fr-FR", eventArgs[1] = "en-US"
```

### Scenario 2: Event with Topic

```typescript
// Runtime: Broadcast event with topic
eventbus.broadcastForTopic("click", "navigation", ["#nav-button"]);

// Eligius runtime behavior:
// 1. Combine to "click:navigation"
// 2. Look up handlers for "click:navigation"
// 3. Create operationData: { eventArgs: ["#nav-button"] }
// 4. Execute matching action(s)
```

### Scenario 3: Multiple Handlers for Same Event

```typescript
// Configuration has:
// - Handler1 for "click"
// - Handler2 for "click"

// Runtime: Broadcast "click" event
eventbus.broadcast("click", ["#button"]);

// Eligius runtime behavior:
// 1. Look up ALL handlers for "click"
// 2. Execute Handler1.start({ eventArgs: ["#button"] })
// 3. Execute Handler2.start({ eventArgs: ["#button"] })
// Both handlers execute in registration order
```

---

## Summary

These examples demonstrate:
- Parameter mapping from DSL → JSON (`eventArgs[n]`)
- Topic namespacing for event organization
- Zero-parameter event actions (valid use case)
- Integration with existing Eligius configuration structure
- Validation rules (valid vs. invalid syntax)
- Runtime behavior with eventbus

All examples follow the JSON schema defined in `event-action-configuration.json`.
