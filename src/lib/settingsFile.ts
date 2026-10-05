import { DEFAULT_ARTICLE_SETTINGS, validateArticleSettings, type ArticleSettings } from './articleSettings';
import { createDefaultEditorWorkspace, validateEditorWorkspace, type EditorWorkspace, type LegacyEditorAppearance } from './editorWorkspace';

export const SETTINGS_FILE = 'settings.json';
const LEGACY_WORKSPACE = 'editor-workspace.json';
type SettingsDocument = {
  settings: ArticleSettings;
  workspace: EditorWorkspace;
  fileExists: boolean;
  rawContent: string | null;
  workspaceExists: boolean;
  workspaceRaw: string | null;
  legacyAppearance?: LegacyEditorAppearance;
};
const loading = new WeakMap<FileSystemDirectoryHandle, Promise<SettingsDocument>>();
const writes = new WeakMap<FileSystemDirectoryHandle, Promise<unknown>>();
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
const defaults = () => structuredClone(DEFAULT_ARTICLE_SETTINGS);

async function textFile(root: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try { return await (await (await root.getFileHandle(name)).getFile()).text(); }
  catch (error) { if (missing(error)) return null; throw error; }
}

function contentOf(document: SettingsDocument): string {
  const { version: _settingsVersion, ...settings } = document.settings;
  const { version: _workspaceVersion, ...workspace } = document.workspace;
  return JSON.stringify({ version: 2, ...settings, ...workspace, appearance: document.legacyAppearance ?? workspace.appearance }, null, 2);
}

async function replaceFile(root: FileSystemDirectoryHandle, content: string, expected: string | null) {
  if (await textFile(root, SETTINGS_FILE) !== expected) throw new Error('settings.json 已在外部变化；本次没有覆盖。请刷新后重试。');
  const file = await root.getFileHandle(SETTINGS_FILE, { create: true });
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable(); await writable.write(content); await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* retain failure */ }
    if (expected === null) try { await root.removeEntry(SETTINGS_FILE); } catch { /* retain failure */ }
    throw new Error(`settings.json 保存失败：${error instanceof Error ? error.message : String(error)}。原文件保留。`);
  }
}

async function readDocument(root: FileSystemDirectoryHandle): Promise<SettingsDocument> {
  const rawContent = await textFile(root, SETTINGS_FILE);
  const parsed = rawContent === null ? null : JSON.parse(rawContent);
  if (rawContent !== null && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('settings.json 顶层必须是对象。');
  let settings = defaults();
  let workspace = createDefaultEditorWorkspace();
  let workspaceExists = false;
  let legacyAppearance: LegacyEditorAppearance | undefined;
  if (parsed?.version === 2) {
    const keys = ['version', 'defaultArticleThemeId', 'autoSave', 'autoSnapshot', 'projects', 'projectOrder', 'articleOrganization', 'articleOrder', 'appearance'];
    if (Object.keys(parsed).some(key => !keys.includes(key))) throw new Error('settings.json 含未知字段；原文件未改写。');
    settings = validateArticleSettings({ version: 1, defaultArticleThemeId: parsed.defaultArticleThemeId, autoSave: parsed.autoSave, autoSnapshot: parsed.autoSnapshot });
    const legacy = parsed.appearance && typeof parsed.appearance === 'object' && 'preset' in parsed.appearance;
    workspace = validateEditorWorkspace({ version: legacy ? 1 : 2, projects: parsed.projects, projectOrder: parsed.projectOrder, articleOrganization: parsed.articleOrganization, articleOrder: parsed.articleOrder, appearance: parsed.appearance });
    if (legacy) legacyAppearance = parsed.appearance;
    workspaceExists = true;
  } else {
    if (parsed !== null) settings = validateArticleSettings(parsed);
    const legacyRaw = await textFile(root, LEGACY_WORKSPACE);
    if (legacyRaw !== null) {
      const legacy = JSON.parse(legacyRaw);
      workspace = validateEditorWorkspace(legacy);
      workspaceExists = true;
      if (legacy.version === 1) legacyAppearance = legacy.appearance;
    }
    // Validated old files are retained as recovery copies. Future reads use only settings.json.
    if (rawContent !== null || legacyRaw !== null) {
      const migrated: SettingsDocument = { settings, workspace, fileExists: true, rawContent, workspaceExists, workspaceRaw: JSON.stringify(workspace), legacyAppearance };
      const content = contentOf(migrated);
      await replaceFile(root, content, rawContent);
      return { ...migrated, rawContent: content, workspaceExists: true };
    }
  }
  return { settings, workspace, fileExists: rawContent !== null, rawContent, workspaceExists, workspaceRaw: workspaceExists ? JSON.stringify(workspace) : null, legacyAppearance };
}

export function loadSettingsDocument(root: FileSystemDirectoryHandle): Promise<SettingsDocument> {
  const active = loading.get(root);
  if (active) return active;
  const pending = readDocument(root).finally(() => loading.delete(root));
  loading.set(root, pending);
  return pending;
}

export async function updateSettingsDocument(root: FileSystemDirectoryHandle, update: (current: SettingsDocument) => SettingsDocument): Promise<SettingsDocument> {
  const before = writes.get(root) ?? Promise.resolve();
  const pending = before.catch(() => {}).then(async () => {
    const current = await loadSettingsDocument(root);
    const next = update(current);
    const content = contentOf(next);
    if (content !== current.rawContent) await replaceFile(root, content, current.rawContent);
    return { ...next, fileExists: true, rawContent: content, workspaceExists: true, workspaceRaw: JSON.stringify(next.workspace) };
  });
  writes.set(root, pending);
  try { return await pending; }
  finally { if (writes.get(root) === pending) writes.delete(root); }
}
