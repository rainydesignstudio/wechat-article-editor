import { DEFAULT_FORMAT_BUNDLE, validateFormatBundle, type RawFormatBundle } from './config';
import { activateFormatBundle, invalidateFormatBundle, type FormatSnapshot } from './runtime';

export const FORMAT_FILES = ['format-support.json', 'validator.json', 'formatter.json'] as const;
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export type FormatLibraryResult = { bundle: RawFormatBundle | null; source: 'built-in' | 'library' | 'invalid'; message: string | null };
export async function readLibraryFormat(root: FileSystemDirectoryHandle): Promise<FormatLibraryResult> {
  let directory: FileSystemDirectoryHandle;
  try { directory = await root.getDirectoryHandle('format'); }
  catch (error) { if (missing(error)) return { bundle: DEFAULT_FORMAT_BUNDLE, source: 'built-in', message: '资料库没有format目录，当前明示使用内置默认配置。' }; throw error; }
  const texts: (string | null)[] = [];
  for (const name of FORMAT_FILES) {
    try { const file = await (await directory.getFileHandle(name)).getFile(); if (file.size > 1_000_000) throw new Error(`${name}过大。`); texts.push(await file.text()); }
    catch (error) { if (missing(error)) texts.push(null); else throw error; }
  }
  if (texts.every(value => value === null)) return { bundle: DEFAULT_FORMAT_BUNDLE, source: 'built-in', message: 'format目录为空，当前明示使用内置默认配置。' };
  if (texts.some(value => value === null)) return { bundle: null, source: 'invalid', message: `格式三件套不完整：${FORMAT_FILES.filter((_, i) => texts[i] === null).join('、')}缺失。请先修复或迁移，不会混用默认文件。` };
  try {
    const [support, validator, formatter] = texts.map(value => JSON.parse(value!));
    return { bundle: validateFormatBundle({ support, validator, formatter }), source: 'library', message: null };
  } catch (error) { return { bundle: null, source: 'invalid', message: `资料库格式配置不可用：${error instanceof Error ? error.message : String(error)}` }; }
}
export async function activateLibraryFormat(root: FileSystemDirectoryHandle, isCurrent: () => boolean): Promise<{ snapshot: FormatSnapshot | null; message: string | null }> {
  const result = await readLibraryFormat(root);
  if (!isCurrent()) return { snapshot: null, message: null };
  const snapshot = result.bundle ? activateFormatBundle(result.bundle, root.name, result.source === 'library' ? 'library' : 'built-in') : invalidateFormatBundle(root.name, result.message!);
  return { snapshot, message: result.message };
}
export async function initializeLibraryFormat(root: FileSystemDirectoryHandle): Promise<void> {
  // Initialization is additive. Existing or partial configurations require an explicit repair.
  const directory = await root.getDirectoryHandle('format', { create: true });
  for (const name of FORMAT_FILES) {
    try { await directory.getFileHandle(name); return; } catch (error) { if (!missing(error)) throw error; }
  }
  const values = [DEFAULT_FORMAT_BUNDLE.support, DEFAULT_FORMAT_BUNDLE.validator, DEFAULT_FORMAT_BUNDLE.formatter];
  for (let i = 0; i < FORMAT_FILES.length; i++) {
    const handle = await directory.getFileHandle(FORMAT_FILES[i], { create: true });
    const writable = await handle.createWritable();
    try { await writable.write(JSON.stringify(values[i], null, 2) + '\n'); await writable.close(); }
    catch (error) { try { await writable.abort(); } catch { /* retain original failure */ } throw error; }
  }
}
