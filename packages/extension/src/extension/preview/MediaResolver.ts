import { resolvePath } from '@eligian/shared-utils';
import type { IEngineConfiguration } from 'eligius';
import * as vscode from 'vscode';

/**
 * Media reference found in compiled Eligius configuration
 */
interface MediaReference {
  /** JSONPath to the property containing the media reference */
  path: string[];
  /** Original media path/URL value */
  originalValue: string;
  /** Type of media file */
  type: 'video' | 'audio' | 'image';
}

/**
 * Resolves media file paths in Eligius configurations to webview-accessible URIs.
 *
 * This service walks through compiled configurations, finds media references
 * (video, audio, image files), resolves their paths relative to the document
 * directory, and converts them to webview URIs that can be loaded in the preview panel.
 *
 * Security features (delegated to shared-utils):
 * - Rejects absolute paths (security risk)
 * - Prevents path traversal attacks (../)
 * - Only resolves paths within document directory boundaries
 * - Consistent with HTML/CSS import security model
 */
export class MediaResolver {
  private readonly webview: vscode.Webview;
  private readonly documentUri: vscode.Uri;
  private readonly missingFiles: string[] = [];

  /**
   * Media file extensions we recognize and need to resolve
   */
  private readonly mediaExtensions = {
    video: ['.mp4', '.webm', '.ogg', '.mov', '.avi'],
    audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac'],
    image: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
  };

  /**
   * Property names that commonly contain media references in Eligius configs
   */
  private readonly mediaPropertyNames = [
    'src',
    'url',
    'source',
    'file',
    'path',
    'videoSrc',
    'audioSrc',
    'imageSrc',
  ];

  constructor(webview: vscode.Webview, documentUri: vscode.Uri) {
    this.webview = webview;
    this.documentUri = documentUri;
  }

  /**
   * Resolve all media paths in an Eligius configuration to webview URIs.
   *
   * This method:
   * 1. Walks the config object recursively to find media references
   * 2. For each reference, attempts to resolve the path
   * 3. Converts resolved paths to webview URIs
   * 4. Returns a modified config with resolved URIs
   *
   * @param config - The compiled Eligius configuration
   * @returns Modified configuration with resolved media URIs
   */
  public resolveMediaPaths(config: IEngineConfiguration): IEngineConfiguration {
    // Reset missing files tracker
    this.missingFiles.length = 0;

    // Deep clone config to avoid mutation
    const resolvedConfig = JSON.parse(JSON.stringify(config)) as IEngineConfiguration;

    // Walk config and find all media references
    const mediaRefs = this.findMediaReferences(resolvedConfig);

    // Resolve each reference
    for (const ref of mediaRefs) {
      const resolvedUri = this.resolveMediaPath(ref.originalValue);
      if (resolvedUri) {
        // Update the config with resolved URI
        this.setValueAtPath(resolvedConfig, ref.path, resolvedUri.toString());
      }
    }

    return resolvedConfig;
  }

  /**
   * Get list of media files that couldn't be resolved
   *
   * @returns Array of missing file paths
   */
  public getMissingFiles(): string[] {
    return [...this.missingFiles];
  }

  /**
   * Walk config object recursively to find all media references.
   *
   * @param obj - Object to search
   * @param currentPath - Current JSONPath (for tracking location)
   * @returns Array of media references found
   */
  private findMediaReferences(obj: unknown, currentPath: string[] = []): MediaReference[] {
    const references: MediaReference[] = [];

    if (typeof obj !== 'object' || obj === null) {
      return references;
    }

    if (Array.isArray(obj)) {
      // Handle arrays
      for (let i = 0; i < obj.length; i++) {
        references.push(...this.findMediaReferences(obj[i], [...currentPath, String(i)]));
      }
    } else {
      // Handle objects
      for (const [key, value] of Object.entries(obj)) {
        const newPath = [...currentPath, key];

        // Check if this property might contain a media reference
        if (typeof value === 'string' && this.isMediaProperty(key, value)) {
          const mediaType = this.getMediaType(value);
          if (mediaType) {
            references.push({
              path: newPath,
              originalValue: value,
              type: mediaType,
            });
          }
        }

        // Recurse into nested objects/arrays
        if (typeof value === 'object' && value !== null) {
          references.push(...this.findMediaReferences(value, newPath));
        }
      }
    }

    return references;
  }

  /**
   * Check if a property likely contains a media reference.
   *
   * @param propertyName - Name of the property
   * @param value - Value of the property
   * @returns True if this property might contain media
   */
  private isMediaProperty(propertyName: string, value: string): boolean {
    // Check property name
    const nameMatch = this.mediaPropertyNames.some(name =>
      propertyName.toLowerCase().includes(name.toLowerCase())
    );

    if (nameMatch) {
      return true;
    }

    // Check file extension
    return this.getMediaType(value) !== null;
  }

  /**
   * Determine media type from file path/URL.
   *
   * @param value - File path or URL
   * @returns Media type or null if not recognized
   */
  private getMediaType(value: string): 'video' | 'audio' | 'image' | null {
    const lowerValue = value.toLowerCase();

    for (const [type, extensions] of Object.entries(this.mediaExtensions)) {
      if (extensions.some(ext => lowerValue.endsWith(ext))) {
        return type as 'video' | 'audio' | 'image';
      }
    }

    return null;
  }

  /**
   * Resolve a single media path to a webview URI.
   *
   * Resolution strategy:
   * 1. HTTPS URLs → pass through unchanged
   * 2. Relative paths → resolve relative to document directory using shared-utils
   * 3. Convert resolved path to webview URI
   *
   * @param mediaPath - Original media path from config
   * @returns Resolved webview URI or null if resolution failed
   */
  private resolveMediaPath(mediaPath: string): vscode.Uri | null {
    // HTTPS URLs pass through unchanged
    if (mediaPath.startsWith('https://') || mediaPath.startsWith('http://')) {
      try {
        return vscode.Uri.parse(mediaPath);
      } catch {
        return null;
      }
    }

    // Use shared-utils to resolve path relative to document directory
    // This ensures consistent security validation (no path traversal, no absolute paths)
    const result = resolvePath(mediaPath, this.documentUri.fsPath);

    if (!result.success) {
      // Path resolution failed (security violation, invalid path, etc.)
      console.warn(`[MediaResolver] Path resolution failed: ${result.error.message}`);
      this.missingFiles.push(mediaPath);
      return null;
    }

    // Convert resolved absolute path to webview URI
    try {
      const fileUri = vscode.Uri.file(result.absolutePath);
      return this.webview.asWebviewUri(fileUri);
    } catch (error) {
      console.warn(`[MediaResolver] Failed to convert to webview URI: ${mediaPath}`, error);
      this.missingFiles.push(mediaPath);
      return null;
    }
  }

  /**
   * Set a value in an object at the given JSONPath.
   *
   * @param obj - Object to modify
   * @param path - JSONPath array (e.g., ['timelines', '0', 'source'])
   * @param value - Value to set
   */
  private setValueAtPath(obj: any, path: string[], value: string): void {
    let current = obj;

    // Navigate to parent of target
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current)) {
        return; // Path doesn't exist
      }
      current = current[key];
    }

    // Set value at final key
    const finalKey = path[path.length - 1];
    if (finalKey in current) {
      current[finalKey] = value;
    }
  }
}
