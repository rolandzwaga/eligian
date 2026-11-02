import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePath } from '@eligian/shared-utils';
import type { IEngineConfiguration } from 'eligius';
import * as vscode from 'vscode';

type MediaType = 'video' | 'audio' | 'image';

/**
 * Media reference found in compiled Eligius configuration
 */
interface MediaReference {
  /** JSONPath to the property containing the media reference */
  path: string[];
  /** Original media path value */
  originalValue: string;
  /** Type of media file */
  type: MediaType;
}

/**
 * Media file extensions we recognize and need to resolve
 */
const MEDIA_EXTENSIONS: Readonly<Record<MediaType, readonly string[]>> = {
  video: ['.mp4', '.webm', '.ogg', '.mov', '.avi'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
};

/**
 * Property names that hold media references in Eligius configs (lower case).
 * `uri` is where the compiler puts a timeline's `from "..."` source.
 */
const MEDIA_PROPERTY_NAMES = [
  'src',
  'url',
  'uri',
  'source',
  'file',
  'path',
  'poster',
  'videosrc',
  'audiosrc',
  'imagesrc',
];

/** A URL scheme prefix such as `https:`, `data:` or `blob:` (but not a `C:` drive letter). */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_DRIVE = /^[a-z]:[\\/]/i;

/**
 * Resolves media file paths in Eligius configurations to webview-accessible URIs.
 *
 * This service walks through compiled configurations, finds media references
 * (video, audio, image files), resolves their paths relative to the document
 * directory, and converts them to webview URIs that can be loaded in the preview panel.
 *
 * Only values of media properties (see MEDIA_PROPERTY_NAMES, exact or as a
 * camelCase suffix such as `posterSrc`) that are local paths with a media
 * extension are rewritten. Other strings ending in `.png` and the like (label
 * text, templates, selectors) are left untouched, as are http(s) and other URLs.
 *
 * Path resolution features (delegated to shared-utils):
 * - Supports parent directory navigation (../) for flexible project structures
 * - Consistent with HTML/CSS import path model
 */
export class MediaResolver {
  private readonly webview: vscode.Webview;
  private readonly documentUri: vscode.Uri;
  private readonly missingFiles: string[] = [];

  constructor(webview: vscode.Webview, documentUri: vscode.Uri) {
    this.webview = webview;
    this.documentUri = documentUri;
  }

  /**
   * Resolve all media paths in an Eligius configuration to webview URIs.
   *
   * This method:
   * 1. Walks the config object recursively to find media references
   * 2. For each reference, resolves the path against the document directory
   * 3. Records referenced files that do not exist ({@link getMissingFiles})
   * 4. Returns a modified config with webview URIs
   *
   * @param config - The compiled Eligius configuration (not mutated)
   * @returns Modified configuration with resolved media URIs
   */
  public resolveMediaPaths(config: IEngineConfiguration): IEngineConfiguration {
    // Reset missing files tracker
    this.missingFiles.length = 0;

    // Deep clone config to avoid mutation
    const resolvedConfig = JSON.parse(JSON.stringify(config)) as IEngineConfiguration;

    for (const ref of this.findMediaReferences(resolvedConfig)) {
      const resolvedUri = this.resolveMediaPath(ref.originalValue);
      if (resolvedUri) {
        this.setValueAtPath(resolvedConfig, ref.path, resolvedUri.toString());
      }
    }

    return resolvedConfig;
  }

  /**
   * Get list of media files that do not exist on disk
   *
   * @returns Array of missing file paths (as written in the config)
   */
  public getMissingFiles(): string[] {
    return [...this.missingFiles];
  }

  /**
   * Walk config object recursively to find all media references.
   *
   * @param obj - Object to search
   * @param currentPath - Current JSONPath (for tracking location)
   * @param arrayOwner - Property name owning `obj` when it is an array
   *   (so `sources: ['./a.mp4', './b.webm']` is recognized)
   */
  private findMediaReferences(
    obj: unknown,
    currentPath: string[] = [],
    arrayOwner?: string
  ): MediaReference[] {
    const references: MediaReference[] = [];

    if (typeof obj !== 'object' || obj === null) {
      return references;
    }

    const entries: Array<[string, unknown, string | undefined]> = Array.isArray(obj)
      ? obj.map((value, i): [string, unknown, string | undefined] => [String(i), value, arrayOwner])
      : Object.entries(obj).map(([key, value]): [string, unknown, string | undefined] => [
          key,
          value,
          key,
        ]);

    for (const [key, value, propertyName] of entries) {
      const newPath = [...currentPath, key];

      if (typeof value === 'string') {
        const mediaType =
          propertyName !== undefined && this.isMediaProperty(propertyName)
            ? this.getLocalMediaType(value)
            : null;
        if (mediaType) {
          references.push({ path: newPath, originalValue: value, type: mediaType });
        }
      } else if (typeof value === 'object' && value !== null) {
        references.push(
          ...this.findMediaReferences(
            value,
            newPath,
            Array.isArray(value) ? propertyName : undefined
          )
        );
      }
    }

    return references;
  }

  /**
   * Check if a property holds media references: a media property name
   * (case-insensitive, singular or plural such as `sources`) or a camelCase
   * name ending in one (`posterSrc`, `imageUrl`).
   */
  private isMediaProperty(propertyName: string): boolean {
    const singular =
      propertyName.length > 1 && propertyName.endsWith('s')
        ? propertyName.slice(0, -1)
        : propertyName;
    return [propertyName, singular].some(candidate => {
      const lower = candidate.toLowerCase();
      return MEDIA_PROPERTY_NAMES.some(name => {
        if (lower === name) {
          return true;
        }
        if (!lower.endsWith(name)) {
          return false;
        }
        const boundary = candidate.charAt(candidate.length - name.length);
        return boundary !== boundary.toLowerCase();
      });
    });
  }

  /**
   * Media type of a local file path, or null when `value` is not a local media
   * path (no media extension, or a URL such as https:, data: or blob:).
   */
  private getLocalMediaType(value: string): MediaType | null {
    if (URL_SCHEME.test(value) && !WINDOWS_DRIVE.test(value)) {
      return null; // http(s) and other URLs pass through unchanged
    }

    const lowerValue = value.toLowerCase();
    for (const [type, extensions] of Object.entries(MEDIA_EXTENSIONS)) {
      if (extensions.some(ext => lowerValue.endsWith(ext))) {
        return type as MediaType;
      }
    }

    return null;
  }

  /**
   * Resolve a single local media path to a webview URI, relative to the
   * document's directory (supports "../" via shared-utils). A file that does
   * not exist is recorded in {@link getMissingFiles}; it is still rewritten so
   * the preview requests the same location the author wrote.
   *
   * @param mediaPath - Original media path from config
   * @returns Resolved webview URI or null if conversion failed
   */
  private resolveMediaPath(mediaPath: string): vscode.Uri | null {
    const absolutePath = resolvePath(mediaPath, path.dirname(this.documentUri.fsPath));

    if (!fs.existsSync(absolutePath)) {
      this.missingFiles.push(mediaPath);
    }

    try {
      return this.webview.asWebviewUri(vscode.Uri.file(absolutePath));
    } catch (error) {
      console.warn(`[MediaResolver] Failed to convert to webview URI: ${mediaPath}`, error);
      return null;
    }
  }

  /**
   * Set a value in an object at the given JSONPath.
   *
   * @param obj - Object to modify
   * @param path - JSONPath array (e.g., ['timelines', '0', 'uri'])
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
