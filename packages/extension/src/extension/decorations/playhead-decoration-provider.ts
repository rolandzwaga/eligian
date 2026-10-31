/**
 * Live playhead in the editor (audit feature idea #14): while the preview
 * plays, the timeline events (`at` events, sequence items, stagger items) that
 * run at the current position are marked in the .eligian editor.
 *
 * The preview posts the playhead about four times a second; the Eligian map of
 * the latest compile says which timeline actions cover that position and where
 * they are in the source. Open-ended actions (`on enter` / `on leave`) run all
 * the time and are not marked. Setting `eligian.preview.highlightActiveEvents`.
 */
import { activeTimelineActions, type EligianMap } from '@eligian/language';
import * as vscode from 'vscode';

/** The line ranges (0-based, inclusive) of the events running at `position`. */
export function activeEventLines(
  map: EligianMap | undefined,
  timelineUri: string,
  position: number
): Array<{ readonly line: number; readonly label: string }> {
  if (!map) return [];
  const lines = new Map<number, string>();
  for (const action of activeTimelineActions(map, timelineUri, position)) {
    const location = action.location;
    // Only events of the previewed file itself (library actions are not timeline events)
    if (!location || location.file) continue;
    const { start, end } = action.duration ?? { start: 0 };
    lines.set(location.line - 1, `▶ ${round(start)}s..${round(end ?? start)}s`);
  }
  return [...lines.entries()].sort(([a], [b]) => a - b).map(([line, label]) => ({ line, label }));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export class PlayheadDecorator implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.rangeHighlightForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });
  private lines: Array<{ readonly line: number; readonly label: string }> = [];
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly documentUri: vscode.Uri) {
    // A newly shown editor of the document gets the current marks
    this.disposables.push(vscode.window.onDidChangeVisibleTextEditors(() => this.apply()));
  }

  /** Mark the events running at `position` of `timelineUri` (as compiled); null clears. */
  update(map: EligianMap | undefined, playhead: { timelineUri: string; position: number } | null) {
    const enabled = vscode.workspace
      .getConfiguration('eligian')
      .get<boolean>('preview.highlightActiveEvents', true);
    const next =
      enabled && playhead ? activeEventLines(map, playhead.timelineUri, playhead.position) : [];
    if (
      next.length === this.lines.length &&
      next.every(
        (entry, i) => entry.line === this.lines[i].line && entry.label === this.lines[i].label
      )
    ) {
      return; // unchanged: most updates are
    }
    this.lines = next;
    this.apply();
  }

  private apply(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() !== this.documentUri.toString()) continue;
      editor.setDecorations(
        this.decoration,
        this.lines
          .filter(({ line }) => line < editor.document.lineCount)
          .map(({ line, label }) => ({
            // The whole line, so the `after` label sits at its end
            range: editor.document.lineAt(line).range,
            renderOptions: {
              after: {
                contentText: `  ${label}`,
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
              },
            },
          }))
      );
    }
  }

  dispose(): void {
    this.decoration.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }
}
