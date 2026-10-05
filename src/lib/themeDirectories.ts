type ThemeDirectoryIssue = { file: string; message: string };
const MIGRATION_MARKER = 'legacy-migration.done';
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';

async function writeNewFile(directory: FileSystemDirectoryHandle, name: string, content: string) {
  const file = await directory.getFileHandle(name, { create: true });
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* retain the failure */ }
    try { await directory.removeEntry(name); } catch { /* retain the failure */ }
    throw error;
  }
}

// Copy once, retain legacy originals, and never replace a file in the new layout.
export async function getThemeDirectory(root: FileSystemDirectoryHandle, kind: 'article-themes' | 'editor-themes') {
  const themes = await root.getDirectoryHandle('themes', { create: true });
  const directory = await themes.getDirectoryHandle(kind, { create: true });
  const issues: ThemeDirectoryIssue[] = [];
  try {
    await directory.getFileHandle(MIGRATION_MARKER);
    return { directory, issues, legacyFiles: 0 };
  } catch (error) { if (!missing(error)) throw error; }

  let legacy: FileSystemDirectoryHandle | null = kind === 'article-themes' ? themes : null;
  if (kind === 'editor-themes') {
    try { legacy = await root.getDirectoryHandle('editor-themes'); }
    catch (error) { if (!missing(error)) throw error; }
  }
  let legacyFiles = 0;
  let complete = true;
  if (legacy) for await (const [name, entry] of legacy.entries()) {
    if (entry.kind !== 'file' || !name.endsWith('.json')) continue;
    legacyFiles += 1;
    if (!/^[a-z0-9][a-z0-9-]{0,47}\.json$/.test(name)) {
      issues.push({ file: name, message: '旧主题文件名不安全；未复制，原文件保留。' });
      continue;
    }
    try {
      try { await directory.getFileHandle(name); continue; }
      catch (error) { if (!missing(error)) throw error; }
      const raw = await (await (entry as FileSystemFileHandle).getFile()).text();
      await writeNewFile(directory, name, raw);
    } catch (error) {
      complete = false;
      issues.push({ file: name, message: `主题迁移失败；原文件保留：${error instanceof Error ? error.message : String(error)}` });
    }
  }
  if (complete) await writeNewFile(directory, MIGRATION_MARKER, JSON.stringify({ version: 1, legacyFiles }));
  return { directory, issues, legacyFiles };
}
