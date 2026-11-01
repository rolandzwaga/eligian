/**
 * new-presentation.ts - "Eligian: New Presentation…" (audit idea #12)
 *
 * Picks a starter, a folder and a title, writes the starter's files (the same
 * ones `eligian init` writes, from @eligian/language), opens main.eligian and
 * the preview. Existing files are only overwritten after confirmation.
 */

import * as path from 'node:path';
import { STARTER_ENTRY, STARTERS, type StarterName, starterFiles } from '@eligian/language';
import * as vscode from 'vscode';

/** Register the `eligian.newPresentation` command. */
export function registerNewPresentationCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('eligian.newPresentation', newPresentation);
}

/** "my-talk" → "My Talk" */
export function titleFromFolder(folderPath: string): string {
  const words = path
    .basename(folderPath)
    .split(/[-_\s]+/)
    .filter(Boolean);
  return (
    words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'My Presentation'
  );
}

export async function newPresentation(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    STARTERS.map(starter => ({
      label: starter.label,
      description: starter.description,
      name: starter.name,
    })),
    { title: 'Eligian: New Presentation', placeHolder: 'Choose a starter' }
  );
  if (!picked) return;

  const folders = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Create Presentation Here',
    title: 'Folder for the new presentation',
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  const folder = folders?.[0];
  if (!folder) return;

  const title = await vscode.window.showInputBox({
    title: 'Eligian: New Presentation',
    prompt: 'Title of the presentation',
    value: titleFromFolder(folder.fsPath),
  });
  if (title === undefined) return;

  const starter = STARTERS.find(s => s.name === picked.name);
  const files = starterFiles(picked.name as StarterName, { title });
  const existing: string[] = [];
  for (const file of Object.keys(files)) {
    if (await exists(vscode.Uri.joinPath(folder, ...file.split('/')))) existing.push(file);
  }
  if (existing.length > 0) {
    const overwrite = await vscode.window.showWarningMessage(
      `These files already exist in ${path.basename(folder.fsPath)}: ${existing.join(', ')}`,
      { modal: true },
      'Overwrite'
    );
    if (overwrite !== 'Overwrite') return;
  }

  try {
    for (const [file, content] of Object.entries(files)) {
      const uri = vscode.Uri.joinPath(folder, ...file.split('/'));
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Eligian: could not create the presentation: ${error}`);
    return;
  }

  const entry = vscode.Uri.joinPath(folder, STARTER_ENTRY);
  await vscode.window.showTextDocument(entry);
  // The video starter has no video yet: its preview would only show a load error
  if (picked.name !== 'video') {
    await vscode.commands.executeCommand('eligian.preview');
  }

  const inWorkspace = vscode.workspace.getWorkspaceFolder(entry) !== undefined;
  const notes = starter?.notes.join(' ') ?? '';
  const message = `Created the ${picked.label} presentation in ${path.basename(folder.fsPath)}.${notes ? ` ${notes}` : ''}`;
  if (inWorkspace) {
    vscode.window.showInformationMessage(message);
    return;
  }
  const action = await vscode.window.showInformationMessage(message, 'Open Folder');
  if (action === 'Open Folder') {
    await vscode.commands.executeCommand('vscode.openFolder', folder);
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
