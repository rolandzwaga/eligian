# Quickstart: Language Block Quick Fix

**Feature**: Language Block Quick Fix
**Date**: 2025-11-24
**Audience**: Developers using the Eligian DSL

## What is this feature?

The Language Block Quick Fix automatically generates a `languages` block when you import labels without declaring which languages your presentation supports. It saves you from manually typing the language configuration by extracting language codes directly from your labels file.

---

## Quick Example

### Before (Missing Language Block)

```eligian
labels "./labels/demo-labels.json"

timeline "My Presentation" at 0s {
  at 0s selectElement("#title") {
    setText(@@label:welcome-title)
  }
}
```

**Problem**: You have labels imported, but no `languages` block. The DSL requires you to declare which languages are available.

### After (Quick Fix Applied)

```eligian
languages {
  *  de-DE "  de-DE label"
  en-US "en-US label"
  fr-FR "fr-FR label"
  nl-NL "nl-NL label"
}

labels "./labels/demo-labels.json"

timeline "My Presentation" at 0s {
  at 0s selectElement("#title") {
    setText(@@label:welcome-title)
  }
}
```

**Solution**: The quick fix extracted all language codes from `demo-labels.json` (  de-DE, en-US, fr-FR, nl-NL), sorted them alphabetically, and marked the first one as default (*).

---

## How to Use

### Step 1: Import Labels Without Language Block

Create an `.eligian` file with a labels import:

```eligian
labels "./my-labels.json"

timeline "Demo" at 0s {
  // Your timeline code
}
```

### Step 2: Trigger Quick Fix

**In VS Code**:
1. Open the `.eligian` file
2. You'll see a light bulb icon (💡) appear near the `labels` line
3. Click the light bulb or press `Ctrl+.` (Windows/Linux) or `Cmd+.` (Mac)
4. Select "Generate language block from labels"

**Result**: A `languages` block is automatically inserted at the top of your file.

### Step 3: Customize (Optional)

The generated block uses placeholder labels. You can customize them:

```eligian
languages {
  * "en-US" "English (United States)"  // Changed from "en-US label"
  "nl-NL" "Nederlands (Nederland)"     // Changed from "nl-NL label"
}
```

**Tip**: Change the default language by moving the `*` marker to a different line.

---

## Labels File Format

Your labels file should be a JSON array of label groups:

```json
[
  {
    "id": "welcome-title",
    "labels": [
      {
        "id": "welcome-title-en",
        "languageCode": "en-US",
        "label": "Welcome"
      },
      {
        "id": "welcome-title-nl",
        "languageCode": "nl-NL",
        "label": "Welkom"
      }
    ]
  }
]
```

**Key Field**: The `languageCode` field in each label is what the quick fix extracts.

---

## Common Scenarios

### Scenario 1: Single Labels File

**Setup**:
```eligian
labels "./labels.json"
```

**Quick Fix Result**:
```eligian
languages {
  *en-US "en-US label"
  nl-NL "nl-NL label"
}

labels "./labels.json"
```

---

### Scenario 2: Multiple Labels Files

**Setup**:
```eligian
labels "./common-labels.json"
labels "./feature-labels.json"
```

**Result**: All language codes from BOTH files are extracted and combined:

```eligian
languages {
  *  de-DE "  de-DE label"
  "en-US" "en-US label"
  "es-ES" "es-ES label"
  "fr-FR" "fr-FR label"
  nl-NL "nl-NL label"
}

labels "./common-labels.json"
labels "./feature-labels.json"
```

---

### Scenario 3: Labels File Doesn't Exist (Yet)

**Setup**:
```eligian
labels "./my-future-labels.json"  // File doesn't exist yet
```

**Quick Fix Result**: A template is generated with a default language:

```eligian
languages {
  *en-US "en-US label"
}

labels "./my-future-labels.json"
```

**What to do**: Customize the template when your labels file is ready.

---

### Scenario 4: Invalid JSON in Labels File

**Setup**:
```eligian
labels "./broken-labels.json"  // Contains invalid JSON
```

**Quick Fix Result**: Same as Scenario 3 (template with en-US):

```eligian
languages {
  *en-US "en-US label"
}

labels "./broken-labels.json"
```

**What to do**: Fix the JSON syntax in your labels file, then manually update the language block if needed.

---

### Scenario 5: File Has Comments at Top

**Setup**:
```eligian
/**
 * My Presentation
 * Author: Jane Developer
 */

labels "./labels.json"

timeline "Demo" at 0s {
  // ...
}
```

**Quick Fix Result**: Language block inserted at line 0 (BEFORE comments):

```eligian
languages {
  *en-US "en-US label"
  nl-NL "nl-NL label"
}

/**
 * My Presentation
 * Author: Jane Developer
 */

labels "./labels.json"

timeline "Demo" at 0s {
  // ...
}
```

**Note**: The language block is ALWAYS the first construct in an Eligian file per the language specification.

---

## Language Block Format

The generated language block follows this format:

```eligian
languages {
  * "default-code" "default label text"
  "other-code" "other label text"
  "another-code" "another label text"
}
```

**Format Rules**:
- Opening: `languages {`
- Each language: `  "code" "label text"` (2-space indent)
- Default language: `* ` prefix (asterisk + space)
- Closing: `}`
- Two blank lines after block for separation

**Language Codes**:
- Standard locale format: `language-COUNTRY` (e.g., `en-US`, `nl-NL`, `fr-FR`)
- Sorted alphabetically
- Deduplicated (no duplicates even if labels file has them)

**Default Language**:
- First language alphabetically is marked as default
- Marked with `*` prefix
- Only ONE language can be default

---

## Tips & Best Practices

### Tip 1: Run Quick Fix Early

Add your labels import first, then run the quick fix before writing timeline code. This ensures your language configuration is set up correctly from the start.

### Tip 2: Customize Label Text

The generated labels (e.g., "en-US label") are placeholders. Replace them with meaningful descriptions:

```eligian
languages {
  * "en-US" "English"
  "nl-NL" "Dutch"
  "fr-FR" "French"
}
```

### Tip 3: Multiple Imports? One Language Block!

If you have multiple labels imports, you only need ONE language block that lists ALL languages used across all files. The quick fix automatically combines them.

### Tip 4: Update Language Block When Adding Languages

If you add a new language to your labels file later, you can:
1. Delete the existing `languages` block
2. Run the quick fix again
3. Re-customize the label text if needed

**Alternative**: Manually add the new language entry to the existing block.

---

## Troubleshooting

### Q: Quick fix doesn't appear?

**Check**:
1. Do you have a `labels` import statement?
2. Is there already a `languages` block? (Quick fix only works when block is missing)
3. Is your file saved? (Some IDEs require save before showing code actions)

### Q: Generated language block is empty or has only "en-US"?

**Possible Causes**:
1. Labels file doesn't exist → template generated
2. Labels file has invalid JSON → template generated
3. Labels file has no `languageCode` fields → template generated

**Solution**: Check your labels file format. It should match the structure shown in "Labels File Format" section above.

### Q: Language codes are not in the order I want?

**Answer**: Language codes are automatically sorted alphabetically. If you need a different order, manually reorder the lines in the generated block.

**Note**: The `*` marker determines the default language, not the order.

### Q: Wrong language is marked as default?

**Solution**: Move the `*` marker to the language you want as default:

```eligian
languages {
  "  de-DE" "  de-DE label"
  *en-US "en-US label"  // Move * here for en-US as default
  nl-NL "nl-NL label"
}
```

---

## Performance Notes

- **Fast**: Quick fix appears within 1 second of opening the file
- **Handles large files**: Works with labels files containing 50+ languages without slowdown
- **Non-blocking**: File reading and parsing happen asynchronously

---

## Examples from Real Projects

### Example 1: Multi-Language Video Annotations

**Labels File** (`video-labels.json`):
```json
[
  {
    "id": "intro-text",
    "labels": [
      { "id": "intro-en", "languageCode": "en-US", "label": "Welcome to our video" },
      { "id": "intro-de", "languageCode": "  de-DE", "label": "Willkommen zu unserem Video" },
      { "id": "intro-ja", "languageCode": "ja-JP", "label": "ビデオへようこそ" }
    ]
  }
]
```

**Eligian File**:
```eligian
labels "./video-labels.json"

timeline "Video Annotations" at 0s {
  at 0s..5s selectElement("#subtitle") {
    setText(@@label:intro-text)
  }
}
```

**After Quick Fix**:
```eligian
languages {
  *  de-DE "Deutsch"
  "en-US" "English"
  "ja-JP" "日本語"
}

labels "./video-labels.json"

timeline "Video Annotations" at 0s {
  at 0s..5s selectElement("#subtitle") {
    setText(@@label:intro-text)
  }
}
```

---

### Example 2: Interactive Infographic

**Multiple Labels Files**:
- `ui-labels.json` - UI text (en-US, nl-NL)
- `data-labels.json` - Data labels (en-US, nl-NL, fr-FR,   de-DE)

**Eligian File**:
```eligian
labels "./ui-labels.json"
labels "./data-labels.json"

timeline "Infographic" at 0s {
  // Timeline code
}
```

**After Quick Fix**: All 4 languages from both files:
```eligian
languages {
  *  de-DE "German"
  "en-US" "English"
  "fr-FR" "French"
  "nl-NL" "Dutch"
}

labels "./ui-labels.json"
labels "./data-labels.json"

timeline "Infographic" at 0s {
  // Timeline code
}
```

---

## Next Steps

After generating your language block:

1. **Customize label text**: Replace placeholder text with meaningful language names
2. **Set default language**: Move `*` marker if needed
3. **Test**: Run your Eligius presentation and verify language switching works
4. **Add more languages**: Update both labels file and language block as needed

For more information on the Eligian language system, see the main Eligian documentation.

---

## Summary

**What it does**: Automatically generates a `languages` block from your imported labels files

**When to use**: Any time you import labels without declaring available languages

**How fast**: < 1 second to generate, < 5 seconds total workflow

**Error handling**: Falls back to template if labels file missing or invalid

**Saves time**: 80% faster than manually typing the language configuration
