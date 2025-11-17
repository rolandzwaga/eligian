# Quickstart: Label Imports

**Feature**: Label Imports for Multi-Language Support
**Status**: Implementation Phase
**Date**: 2025-11-17

## What Are Label Imports?

Label imports allow you to load multi-language text translations from JSON files into your Eligian programs. This enables creating presentations, timelines, and interactive content that adapt to different languages based on user preferences.

## Basic Usage

### 1. Create a Labels JSON File

Create a file named `labels.json` with your label translations:

```json
[
  {
    "id": "welcomeMessage",
    "labels": [
      {
        "id": "1",
        "languageCode": "en-US",
        "label": "Welcome to our presentation!"
      },
      {
        "id": "2",
        "languageCode": "nl-NL",
        "label": "Welkom bij onze presentatie!"
      }
    ]
  },
  {
    "id": "continueButton",
    "labels": [
      {
        "id": "3",
        "languageCode": "en-US",
        "label": "Click to continue"
      },
      {
        "id": "4",
        "languageCode": "nl-NL",
        "label": "Klik om door te gaan"
      }
    ]
  }
]
```

### 2. Import Labels in Your Eligian Program

Add the labels import at the top of your `.eligian` file:

```eligian
// Import label translations
labels './labels.json'

// Your timeline code
timeline "Multi-Language Presentation" at 0s {
  at 0s..5s selectElement("#message") {
    // Labels will be available in Eligius runtime
  }
}
```

### 3. Compile Your Program

```bash
node packages/cli/bin/cli.js my-presentation.eligian
```

The compiled Eligius configuration will include your labels in the `labels` property, ready for use with the `LabelController`.

## Complete Example

### `labels.json`

```json
[
  {
    "id": "mainTitle",
    "labels": [
      {"id": "101", "languageCode": "en-US", "label": "Product Features"},
      {"id": "102", "languageCode": "nl-NL", "label": "Productkenmerken"},
      {"id": "103", "languageCode": "fr-FR", "label": "Caractéristiques du produit"}
    ]
  },
  {
    "id": "feature1",
    "labels": [
      {"id": "201", "languageCode": "en-US", "label": "Fast Performance"},
      {"id": "202", "languageCode": "nl-NL", "label": "Snelle Prestaties"},
      {"id": "203", "languageCode": "fr-FR", "label": "Performance Rapide"}
    ]
  },
  {
    "id": "feature2",
    "labels": [
      {"id": "301", "languageCode": "en-US", "label": "Easy to Use"},
      {"id": "302", "languageCode": "nl-NL", "label": "Gebruiksvriendelijk"},
      {"id": "303", "languageCode": "fr-FR", "label": "Facile à Utiliser"}
    ]
  }
]
```

### `presentation.eligian`

```eligian
// Import multi-language labels
labels './labels.json'

// Import CSS for styling
styles './styles.css'

// Define timeline with language-switchable content
timeline "Product Presentation" at 0s {
  // Title appears
  at 0s..3s selectElement("#title") {
    addClass("fade-in")
    // LabelController will display appropriate language
  }

  // Feature 1
  at 3s..6s selectElement("#feature1") {
    addClass("slide-in-left")
  }

  // Feature 2
  at 6s..9s selectElement("#feature2") {
    addClass("slide-in-right")
  }
}
```

## Label JSON Structure

### Required Fields

Each label group MUST have:
- `id` (string): Unique identifier for the label group
- `labels` (array): At least one translation

Each translation MUST have:
- `id` (string): Unique identifier for this translation
- `languageCode` (string): Language code (e.g., `"en-US"`, `"nl-NL"`)
- `label` (string): The translated text

### Optional Fields

You can include additional fields for future compatibility:

```json
[
  {
    "id": "greeting",
    "category": "user-interface",
    "labels": [
      {
        "id": "1",
        "languageCode": "en-US",
        "label": "Hello",
        "pronunciation": "heh-loh",
        "audioFile": "./audio/hello-en.mp3"
      }
    ]
  }
]
```

These extra fields are preserved in the compiled configuration and may be used by future Eligius features.

## Using Labels with Eligius LabelController

Once your labels are compiled into the Eligius configuration, they can be accessed using the `LabelController` at runtime.

**Example** (conceptual Eligius runtime code):

```typescript
// Eligius engine initialization
const config = loadEligiusConfig('./presentation.json');
const engine = new ChronoTriggerEngine(config);

// Access labels via LabelController
const labelController = engine.getLabelController();

// Get label for specific language
const titleEN = labelController.getLabel("mainTitle", "en-US");
// Returns: "Product Features"

const titleNL = labelController.getLabel("mainTitle", "nl-NL");
// Returns: "Productkenmerken"

// Update UI with current language
function updateLanguage(lang: string) {
  document.getElementById("title").textContent =
    labelController.getLabel("mainTitle", lang);
  document.getElementById("feature1").textContent =
    labelController.getLabel("feature1", lang);
}
```

**Note**: See Eligius documentation for the actual `LabelController` API.

## Common Errors and Solutions

### Error: Cannot find labels file

```
Error: Cannot find labels file: './labels.json'
Hint: Ensure the file exists and the path is correct
```

**Solution**: Check that `labels.json` exists in the same directory as your `.eligian` file. Use relative paths only.

### Error: Invalid JSON syntax

```
Error: Invalid JSON syntax in labels file: Unexpected token } in JSON at position 123
Hint: Check for missing commas, unclosed brackets, or trailing commas
```

**Solution**: Validate your JSON using a JSON validator. Common issues:
- Trailing commas: `{"id": "test",}` ❌ → `{"id": "test"}` ✅
- Missing commas: `{"id": "test" "label": "..."}` ❌ → `{"id": "test", "label": "..."}` ✅
- Unclosed brackets: `[{"id": "test"}` ❌ → `[{"id": "test"}]` ✅

### Error: Missing required property

```
Error: Missing required property "id" in label group
```

**Solution**: Ensure all label groups have an `id` field:

```json
// ❌ Wrong - missing id
[
  {
    "labels": [...]
  }
]

// ✅ Correct
[
  {
    "id": "myLabel",
    "labels": [...]
  }
]
```

### Error: Label group must have at least one translation

```
Error: Label group "mainTitle" must have at least one translation
```

**Solution**: Each label group must have at least one translation in the `labels` array:

```json
// ❌ Wrong - empty labels array
{
  "id": "mainTitle",
  "labels": []
}

// ✅ Correct - at least one translation
{
  "id": "mainTitle",
  "labels": [
    {"id": "1", "languageCode": "en-US", "label": "Title"}
  ]
}
```

### Error: Only one labels import allowed

```
Error: Only one labels import allowed per program
Hint: Remove duplicate labels import statements
```

**Solution**: Use only ONE labels import per `.eligian` file:

```eligian
// ❌ Wrong - duplicate imports
labels './labels-en.json'
labels './labels-nl.json'

// ✅ Correct - single import with all languages
labels './labels.json'
```

**Alternative**: Combine all labels into a single JSON file with multiple translations per label group.

### Error: Labels import must use relative path

```
Error: Labels import must use relative path, not absolute
Hint: Use './labels.json' instead of absolute paths
```

**Solution**: Use relative paths only:

```eligian
// ❌ Wrong - absolute path
labels '/Users/username/project/labels.json'
labels 'C:\\Users\\username\\project\\labels.json'

// ✅ Correct - relative path
labels './labels.json'
labels '../shared/labels.json'
```

## Best Practices

### 1. Organize Labels by Category

Group related labels together with consistent naming:

```json
[
  {
    "id": "ui.buttons.continue",
    "labels": [...]
  },
  {
    "id": "ui.buttons.cancel",
    "labels": [...]
  },
  {
    "id": "content.welcome.title",
    "labels": [...]
  }
]
```

### 2. Use Consistent Language Codes

Stick to standard BCP 47 language codes:
- `"en-US"` (English - United States)
- `"en-GB"` (English - United Kingdom)
- `"nl-NL"` (Dutch - Netherlands)
- `"fr-FR"` (French - France)
- `"de-DE"` (German - Germany)

### 3. Keep Labels Concise

Labels should be short and focused:

```json
// ✅ Good - concise
{"id": "1", "languageCode": "en-US", "label": "Click here"}

// ⚠️  Less ideal - verbose
{"id": "1", "languageCode": "en-US", "label": "Please click on this button to continue to the next section of the presentation"}
```

### 4. Version Control Your Labels

Commit `labels.json` to version control alongside your `.eligian` files to track translation changes over time.

### 5. Validate Before Commit

Use a JSON validator or IDE plugin to catch syntax errors before committing:

```bash
# Validate JSON syntax
cat labels.json | python -m json.tool > /dev/null
```

## Advanced Usage

### Multiple Language Variants

Support regional language variants:

```json
{
  "id": "dateFormat",
  "labels": [
    {"id": "1", "languageCode": "en-US", "label": "MM/DD/YYYY"},
    {"id": "2", "languageCode": "en-GB", "label": "DD/MM/YYYY"},
    {"id": "3", "languageCode": "en-AU", "label": "DD/MM/YYYY"}
  ]
}
```

### Future-Proof with Additional Properties

Add custom metadata for future features:

```json
{
  "id": "audioLabel",
  "labels": [
    {
      "id": "1",
      "languageCode": "en-US",
      "label": "Play audio",
      "audioFile": "./audio/en-play.mp3",
      "voiceGender": "female"
    }
  ]
}
```

## Next Steps

1. Create your `labels.json` file with your translations
2. Add `labels './labels.json'` import to your `.eligian` program
3. Compile with the Eligian CLI
4. Use the `LabelController` in your Eligius runtime to switch languages
5. Test with different language codes to verify translations

## Additional Resources

- **Feature Specification**: [spec.md](spec.md)
- **Data Model**: [data-model.md](data-model.md)
- **JSON Schema**: [contracts/labels-schema.json](contracts/labels-schema.json)
- **Eligius Documentation**: (link to Eligius LabelController docs)

## Feedback

Found an issue or have a suggestion? Please file an issue on the Eligian repository.
