# Quickstart: Missing Label Entry Quick Fix

**Feature**: 041-label-entry-quickfix
**Date**: 2025-11-29

## What This Feature Does

When you use a label ID in your Eligian code that doesn't exist in the imported labels file, VS Code will offer a quick fix to create the label entry automatically.

## Prerequisites

1. An Eligian file with a valid labels import:
   ```eligian
   labels "./labels.json"
   ```

2. The labels file must exist and contain valid JSON (can be empty array `[]`)

3. (Optional) A languages block to define available languages:
   ```eligian
   languages {
     *"en-US" "English"
     "nl-NL" "Dutch"
   }
   ```

## Usage

### Step 1: Use an Undefined Label ID

```eligian
languages {
  *"en-US" "English"
  "nl-NL" "Dutch"
}

labels "./labels.json"

timeline "Demo" at 0s {
  at 0s..5s setLabel("#title", "welcomeMessage")  // ⚠️ welcomeMessage doesn't exist
}
```

### Step 2: Hover Over the Error

When you hover over `"welcomeMessage"`, you'll see an error:
> Unknown label ID: 'welcomeMessage'. Available label IDs: ...

### Step 3: Apply the Quick Fix

1. Click the lightbulb icon (💡) or press `Ctrl+.` / `Cmd+.`
2. Select **"Create label entry 'welcomeMessage'"**

### Step 4: Labels File Updated

The labels file is automatically updated:

```json
[
  {
    "id": "welcomeMessage",
    "labels": [
      { "id": "550e8400-e29b-41d4-a716-446655440000", "languageCode": "en-US", "label": "" },
      { "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8", "languageCode": "nl-NL", "label": "" }
    ]
  }
]
```

### Step 5: Fill in Translations

Open the labels file in the Label Editor and fill in the translations:

```json
{
  "id": "welcomeMessage",
  "labels": [
    { "id": "...", "languageCode": "en-US", "label": "Welcome!" },
    { "id": "...", "languageCode": "nl-NL", "label": "Welkom!" }
  ]
}
```

## Behavior Details

### With Languages Block

If your Eligian file has a languages block, the quick fix creates translations for ALL defined languages:

```eligian
languages {
  *"en-US" "English"
  "nl-NL" "Dutch"
  "fr-FR" "French"
}
```

Result:
```json
{
  "id": "myLabel",
  "labels": [
    { "id": "...", "languageCode": "en-US", "label": "" },
    { "id": "...", "languageCode": "nl-NL", "label": "" },
    { "id": "...", "languageCode": "fr-FR", "label": "" }
  ]
}
```

### Without Languages Block

If no languages block is defined, the quick fix defaults to `en-US`:

```json
{
  "id": "myLabel",
  "labels": [
    { "id": "...", "languageCode": "en-US", "label": "" }
  ]
}
```

### Existing Labels Preserved

The quick fix appends new entries without modifying existing ones:

**Before:**
```json
[
  { "id": "existingLabel", "labels": [...] }
]
```

**After:**
```json
[
  { "id": "existingLabel", "labels": [...] },
  { "id": "newLabel", "labels": [...] }
]
```

## When Quick Fix is NOT Available

The quick fix will NOT appear when:

1. **No labels import** - The Eligian file doesn't have a `labels` import statement
2. **Labels file doesn't exist** - Use the "Create labels file" quick fix instead (Feature 039)
3. **Invalid JSON** - The labels file contains syntax errors
4. **Label already exists** - The label ID is already defined in the labels file

## Troubleshooting

### Quick Fix Not Appearing

1. Ensure you have a valid `labels` import statement
2. Check that the labels file exists
3. Verify the labels file contains valid JSON (even just `[]`)
4. Save the Eligian file to trigger validation

### Error: Cannot Modify Labels File

Check file permissions. The extension needs write access to the labels file.

### Translations Empty After Creation

This is expected! The quick fix creates empty translations that you fill in manually using the Label Editor.

## Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Show Quick Fix | `Ctrl+.` | `Cmd+.` |
| Show All Fixes | `Ctrl+Shift+.` | `Cmd+Shift+.` |

## Related Features

- **Feature 033**: Label imports (`labels "./file.json"`)
- **Feature 037**: Languages syntax (`languages { ... }`)
- **Feature 039**: Create missing labels FILE (not entry)
- **Feature 036**: Label Editor for visual translation management
