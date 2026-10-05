import { BASE_EDITOR_THEME, parseEditorThemeJson, validateEditorTheme, type EditorTheme } from './editorThemes';
import { getThemeDirectory } from './themeDirectories';

export const EDITOR_THEME_DIRECTORY = 'themes/editor-themes';
export type EditorThemeIssue = { file: string; message: string };
export type EditorThemeLibrary = { themes: EditorTheme[]; issues: EditorThemeIssue[] };

function notFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function safeId(id: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) throw new Error('Editor theme ID 不安全。');
}

export async function loadEditorThemeLibrary(root: FileSystemDirectoryHandle): Promise<EditorThemeLibrary> {
  const themes: EditorTheme[] = [];
  const issues: EditorThemeIssue[] = [];
  const migrated = await getThemeDirectory(root, 'editor-themes');
  const directory = migrated.directory;
  issues.push(...migrated.issues);
  for await (const [filename, handle] of directory.entries()) {
    if (!filename.endsWith('.json')) continue;
    if (handle.kind !== 'file' || !/^[a-z0-9][a-z0-9-]{0,47}\.json$/.test(filename)) {
      issues.push({ file: filename, message: '文件名无效；须为安全的 <id>.json。' });
      continue;
    }
    try {
      const theme = parseEditorThemeJson(await (await handle.getFile()).text());
      if (theme.id !== filename.slice(0, -5)) throw new Error('文件名与主题 ID 不一致。');
      if (themes.some((item) => item.id === theme.id)) throw new Error('主题 ID 重复。');
      themes.push(theme);
    } catch (error) {
      issues.push({ file: filename, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { themes, issues };
}

type RenameHooks = { commit: () => Promise<void>; rollback: () => Promise<void> };

export async function saveEditorTheme(root: FileSystemDirectoryHandle, input: EditorTheme, previous?: EditorTheme, renameHooks?: RenameHooks): Promise<EditorTheme> {
  const errors = validateEditorTheme(input);
  if (errors.length) throw new Error(errors.join('；'));
  safeId(input.id);
  if (previous) safeId(previous.id);
  const { directory } = await getThemeDirectory(root, 'editor-themes');
  const filename = `${input.id}.json`;
  if (previous && previous.id !== input.id) {
    const preserveBase = previous.id === BASE_EDITOR_THEME.id;
    const oldName = `${previous.id}.json`;
    let oldRaw: string;
    try { oldRaw = await (await (await directory.getFileHandle(oldName)).getFile()).text(); }
    catch (error) { if (notFound(error)) throw new Error('要编辑的主题已被移除；原文件未改动。'); throw error; }
    const stored = parseEditorThemeJson(oldRaw);
    if (stored.id !== previous.id || JSON.stringify(stored) !== JSON.stringify(previous)) throw new Error('原主题已在外部改变；未改名。');
    try { await directory.getFileHandle(filename); throw new Error(`文件名 ${filename} 已存在；原文件未改动。`); }
    catch (error) { if (!notFound(error)) throw error; }
    if (input.version === stored.version) {
      const parts = stored.version.split('.').map(Number);
      parts[2]++;
      input = { ...input, version: parts.join('.') };
    }
    const target = await directory.getFileHandle(filename, { create: true });
    let committed = false;
    try {
      if ((await target.getFile()).size) throw new Error(`文件名 ${filename} 已存在；原文件未改动。`);
      const writable = await target.createWritable();
      try { await writable.write(JSON.stringify(input, null, 2)); await writable.close(); }
      catch (error) { try { await writable.abort(); } catch { /* retain failure */ } throw error; }
      if (!preserveBase) {
        if (renameHooks) { committed = true; await renameHooks.commit(); }
        if (await (await (await directory.getFileHandle(oldName)).getFile()).text() !== oldRaw) throw new Error('原主题已在外部改变；未移除原文件。');
        await directory.removeEntry(oldName);
      }
      return input;
    } catch (error) {
      const rollbackIssues: string[] = [];
      let keepNewForReferences = false;
      if (committed) try { await renameHooks?.rollback(); } catch (failure) { keepNewForReferences = true; rollbackIssues.push(`外观引用回滚失败，新文件 ${filename} 已保留以避免悬空引用：${failure instanceof Error ? failure.message : String(failure)}`); }
      if (!keepNewForReferences) try { await directory.removeEntry(filename); } catch (failure) { rollbackIssues.push(`新文件 ${filename} 清理失败：${failure instanceof Error ? failure.message : String(failure)}`); }
      throw new Error(`Editor theme 改名失败，原文件保留：${error instanceof Error ? error.message : String(error)}${rollbackIssues.length ? `；${rollbackIssues.join('；')}` : ''}`);
    }
  }
  let existingRaw: string | null = null;
  try {
    const existing = await directory.getFileHandle(filename);
    const current = await (await existing.getFile()).text();
    const stored = parseEditorThemeJson(current);
    if (JSON.stringify(stored) === JSON.stringify(input)) return stored;
    if (!previous || JSON.stringify(stored) !== JSON.stringify(previous)) throw new Error(`主题 ${input.id} 已存在或已被修改；原文件未覆盖。`);
    existingRaw = current;
    if (input.version === stored.version) {
      const parts = stored.version.split('.').map(Number);
      parts[2]++;
      input = { ...input, version: parts.join('.') };
    }
  } catch (error) {
    if (!notFound(error)) throw error;
    if (previous) throw new Error('要编辑的主题已被移除；未重新创建。');
  }
  const file = await directory.getFileHandle(filename, { create: true });
  if (existingRaw !== null && await (await file.getFile()).text() !== existingRaw) throw new Error('主题文件已在外部改变；未覆盖。');
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(JSON.stringify(input, null, 2));
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* retain original error */ }
    if (existingRaw === null) try { await directory.removeEntry(filename); } catch { /* retain original error */ }
    throw new Error(`Editor theme 保存失败：${error instanceof Error ? error.message : String(error)}`);
  }
  return input;
}

export async function deleteEditorTheme(root: FileSystemDirectoryHandle, id: string): Promise<void> {
  safeId(id);
  if (id === BASE_EDITOR_THEME.id) throw new Error('基础 Editor theme 不可删除。');
  const { directory } = await getThemeDirectory(root, 'editor-themes');
  const file = await directory.getFileHandle(`${id}.json`);
  const theme = parseEditorThemeJson(await (await file.getFile()).text());
  if (theme.id !== id) throw new Error('主题文件与 ID 不一致；没有删除。');
  await directory.removeEntry(`${id}.json`);
}
