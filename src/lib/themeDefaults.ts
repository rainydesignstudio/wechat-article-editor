import { BUILTIN_EDITOR_THEMES } from './editorThemes';
import { THEMES } from '../themes/article-themes/index';
import { getThemeDirectory } from './themeDirectories';

const MARKER = 'default-themes.loaded';
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export type ThemeDefaultResult = { added: number; skipped: number; issues: { file: string; message: string }[] };

export async function copyDefaultThemes(root: FileSystemDirectoryHandle, kind: 'article-themes' | 'editor-themes'): Promise<ThemeDefaultResult> {
  const { directory } = await getThemeDirectory(root, kind);
  const result: ThemeDefaultResult = { added: 0, skipped: 0, issues: [] };
  const defaults = kind === 'article-themes' ? THEMES : BUILTIN_EDITOR_THEMES;
  for (const theme of defaults) {
    const name = `${theme.id}.json`;
    try {
      try { await directory.getFileHandle(name); result.skipped++; continue; }
      catch (error) { if (!missing(error)) throw error; }
      const file = await directory.getFileHandle(name, { create: true });
      let writable: FileSystemWritableFileStream | undefined;
      try { writable = await file.createWritable(); await writable.write(JSON.stringify(theme, null, 2)); await writable.close(); }
      catch (error) { try { await writable?.abort(); } catch { /* retain failure */ } try { await directory.removeEntry(name); } catch { /* retain failure */ } throw error; }
      result.added++;
    } catch (error) { result.issues.push({ file: name, message: error instanceof Error ? error.message : String(error) }); }
  }
  return result;
}

// One-time directory initialization. Explicit "load defaults" remains additive;
// normal reloads never restore a theme the user chose to remove.
export async function initializeThemeDefaults(root: FileSystemDirectoryHandle): Promise<void> {
  const themes = await root.getDirectoryHandle('themes', { create: true });
  try { await themes.getFileHandle(MARKER); return; }
  catch (error) { if (!missing(error)) throw error; }
  const article = await copyDefaultThemes(root, 'article-themes');
  const editor = await copyDefaultThemes(root, 'editor-themes');
  if (article.issues.length || editor.issues.length) throw new Error([...article.issues, ...editor.issues].map(issue => `${issue.file}：${issue.message}`).join('；'));
  const file = await themes.getFileHandle(MARKER, { create: true });
  let writable: FileSystemWritableFileStream | undefined;
  try { writable = await file.createWritable(); await writable.write(JSON.stringify({ version: 1 })); await writable.close(); }
  catch (error) { try { await writable?.abort(); } catch { /* retain failure */ } try { await themes.removeEntry(MARKER); } catch { /* retain failure */ } throw error; }
}
