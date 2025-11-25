# Feature Specification: Standalone Bundle Compilation

**Feature Branch**: `040-standalone-bundle`
**Created**: 2025-01-25
**Status**: Draft
**Input**: User description: "Add standalone bundle compilation mode that produces a self-contained Eligius presentation with all assets, runtime, and compiled config bundled together for deployment without build tooling"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Basic Bundle Creation (Priority: P1)

A developer has created an Eligian presentation and wants to deploy it to a static hosting service (like GitHub Pages, Netlify, or a simple web server) without requiring any build tools or server-side processing at the deployment target.

**Why this priority**: This is the core value proposition - creating a deployable artifact is the primary reason for the bundle feature. Without this, the feature has no value.

**Independent Test**: Can be fully tested by running the CLI with the bundle flag on a valid .eligian file and verifying the output folder contains all necessary files to run the presentation in a browser.

**Acceptance Scenarios**:

1. **Given** a valid .eligian file with CSS imports and a layout template, **When** the user runs `eligian presentation.eligian --bundle`, **Then** the system creates an output folder containing index.html, a JavaScript bundle, and all referenced assets.

2. **Given** the bundle output folder, **When** the user opens index.html in a browser, **Then** the Eligius presentation loads and runs correctly without any network requests to external resources (except for explicitly external media like videos).

3. **Given** a .eligian file with no imports, **When** the user runs the bundle command, **Then** the system creates a minimal bundle with just the runtime and compiled configuration.

---

### User Story 2 - Asset Collection and Organization (Priority: P2)

A developer's presentation references multiple CSS files, images, fonts, and potentially video/audio files. They need all these assets to be collected, organized, and have their references updated so the bundle works as a cohesive unit.

**Why this priority**: Asset handling is essential for real-world presentations but builds on the core bundle functionality. A presentation with broken asset references is unusable.

**Independent Test**: Can be tested by creating a presentation with various asset types (CSS with background images, fonts, media files) and verifying all assets are copied and references are correctly rewritten.

**Acceptance Scenarios**:

1. **Given** a .eligian file with CSS imports containing `url()` references to images, **When** bundled, **Then** the images are copied to the assets folder and CSS references are rewritten to point to the new relative paths.

2. **Given** a .eligian file with a layout template containing image tags, **When** bundled, **Then** the images are copied to the assets folder and HTML src attributes are updated.

3. **Given** a .eligian file referencing a video file as timeline provider, **When** bundled, **Then** the video is copied to the assets folder (not inlined) and the configuration references the relative path.

---

### User Story 3 - Image Inlining for Small Assets (Priority: P3)

A developer wants small images (icons, logos, small graphics) to be embedded directly into the CSS or HTML as data URIs to reduce HTTP requests and simplify deployment.

**Why this priority**: Image inlining is an optimization that improves load performance and simplifies deployment but is not essential for the bundle to function.

**Independent Test**: Can be tested by including images of various sizes and verifying that images below the threshold are converted to base64 data URIs while larger images remain as external files.

**Acceptance Scenarios**:

1. **Given** a CSS file referencing an image smaller than 50KB, **When** bundled with default settings, **Then** the image is converted to a base64 data URI and embedded in the CSS.

2. **Given** a CSS file referencing an image larger than 50KB, **When** bundled with default settings, **Then** the image is copied to the assets folder and referenced by path.

3. **Given** a custom inlining threshold of 100KB, **When** bundled, **Then** images up to 100KB are inlined and larger images are copied.

4. **Given** inlining disabled via configuration, **When** bundled, **Then** all images are copied to the assets folder regardless of size.

---

### User Story 4 - Bundle Output Customization (Priority: P4)

A developer wants control over the bundle output, including the output directory name, whether to minify the output, and configuration of asset handling.

**Why this priority**: Customization options enhance the developer experience but are not required for basic functionality.

**Independent Test**: Can be tested by running the bundle command with various options and verifying the output matches the specified configuration.

**Acceptance Scenarios**:

1. **Given** the command `eligian presentation.eligian --bundle -o my-output`, **When** executed, **Then** the bundle is created in the `my-output` directory.

2. **Given** the command with `--minify` flag, **When** executed, **Then** the JavaScript bundle and CSS are minified.

3. **Given** the command with `--inline-threshold 0`, **When** executed, **Then** no images are inlined (all copied to assets).

---

### Edge Cases

- What happens when a referenced asset file does not exist? The system should report a clear error with the file path and source location.
- What happens when the output directory already exists? The system should overwrite existing files or provide an error with a `--force` flag option.
- What happens when an image format is not supported for base64 encoding? The system should copy the file instead and log a warning.
- What happens when CSS contains external URLs (https://...)? External URLs should be preserved as-is, not modified.
- What happens when the presentation has no layout template? The system should generate a minimal HTML wrapper.
- What happens when circular asset references exist? The system should detect and handle gracefully without infinite loops.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `--bundle` CLI flag that triggers standalone bundle compilation mode.
- **FR-002**: System MUST create an output folder containing all files needed to run the presentation.
- **FR-003**: System MUST generate an `index.html` file that bootstraps the Eligius presentation.
- **FR-004**: System MUST bundle the Eligius runtime library into a browser-compatible JavaScript file.
- **FR-005**: System MUST embed the compiled configuration JSON into the JavaScript bundle.
- **FR-006**: System MUST collect all CSS files from `styles` imports and include them in the bundle.
- **FR-007**: System MUST copy all referenced assets (images, fonts, media) to an assets subfolder.
- **FR-008**: System MUST rewrite all asset references in CSS and HTML to use correct relative paths.
- **FR-009**: System MUST inline images smaller than a configurable threshold (default: 50KB) as base64 data URIs.
- **FR-010**: System MUST preserve external URLs (http://, https://) without modification.
- **FR-011**: System MUST support video and audio files by copying them to the assets folder (never inline).
- **FR-012**: System MUST generate a working presentation when the output folder is served by any static web server.
- **FR-013**: System MUST provide clear error messages when referenced assets cannot be found.
- **FR-014**: System MUST support the `-o, --output` option to specify the output directory name.
- **FR-015**: System MUST support the `--minify` flag to minify JavaScript and CSS output.
- **FR-016**: System MUST support the `--inline-threshold` option to configure the image inlining size limit.
- **FR-017**: System MUST generate a minimal HTML wrapper when no layout template is specified.
- **FR-018**: System MUST include the layout template HTML content in the generated index.html when specified.

### Key Entities

- **Bundle Output**: The folder containing all generated files (index.html, bundle.js, assets/)
- **Asset Manifest**: Internal tracking of all collected assets, their original paths, and new relative paths
- **Runtime Bundle**: The browser-compatible JavaScript containing Eligius runtime and compiled configuration
- **Inline Threshold**: Configuration value (in bytes) determining which images get embedded vs copied

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bundle creation completes in under 10 seconds for a typical presentation with up to 10 CSS files and 50 assets.
- **SC-002**: The generated bundle runs correctly in all modern browsers (Chrome, Firefox, Safari, Edge - latest 2 versions).
- **SC-003**: Users can deploy the bundle to a static hosting service by simply uploading the output folder with no additional configuration.
- **SC-004**: 100% of presentations that compile successfully to JSON also bundle successfully (no bundle-specific failures for valid presentations).
- **SC-005**: The generated index.html loads the presentation without any console errors related to missing assets or broken references.
- **SC-006**: Image inlining reduces the number of HTTP requests by converting small images to data URIs without increasing total bundle size by more than 33% (base64 overhead).

## Assumptions

- The Eligius runtime library can be bundled into a browser-compatible IIFE (Immediately Invoked Function Expression) format.
- jQuery and lottie-web dependencies (required by Eligius) can be included in the runtime bundle.
- Video and audio files are always treated as external assets due to their size.
- The default image inlining threshold of 50KB provides a good balance between request reduction and bundle size.
- Users have Node.js installed (required for running the CLI) but deployment targets may not.
- The output folder structure (index.html at root, assets/ subfolder) works with all common static hosting services.
