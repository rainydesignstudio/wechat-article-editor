import { parseArticle } from './frontMatter';
import { sanitizeFolderName } from './fileSystem';
import { parseThemeConfigJson, validateThemeConfig } from './themeValidation';
import type { ParsedArticle, ThemeConfig } from './types';

export type ArticleHistoryKind = 'automatic' | 'manual' | 'before-restore' | 'before-theme-change';

export type ArticleHistorySnapshot = {
  id: string;
  createdAt: string;
  kind: ArticleHistoryKind;
  retained: boolean;
  title: string;
  source: string;
  theme: ThemeConfig;
  parsed: ParsedArticle;
  themeMatches: boolean;
};

export type ArticleHistoryIssue = { snapshotId: string; message: string };
export type ArticleHistoryListResult = { snapshots: ArticleHistorySnapshot[]; issues: ArticleHistoryIssue[] };
export type CreateArticleSnapshotOptions = {
  id?: string;
  kind: ArticleHistoryKind;
  retained?: boolean;
  maxAutoSnapshots?: number;
  now?: () => Date;
};
export type CreateArticleSnapshotResult = { snapshot: ArticleHistorySnapshot; created: boolean; cleanupIssues: string[] };

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function changedThemeSnapshotFields(previous: ThemeConfig, current: ThemeConfig): string[] {
  const labels: Record<string, string> = {
    id: 'ID',
    name: '主题名称',
    version: '版本',
    formatVersion: '数据格式',
    tokens: '排印 Token',
    css: '自定义 CSS',
    nodes: '节点排印',
  };
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return [...keys]
    .filter((key) => stableSerialize(previous[key as keyof ThemeConfig]) !== stableSerialize(current[key as keyof ThemeConfig]))
    .sort()
    .map((key) => labels[key] ?? key);
}

type SnapshotManifest = {
  owner: 'wechat-article-editor';
  version: 1;
  id: string;
  createdAt: string;
  kind: ArticleHistoryKind;
  retained: boolean;
};

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function assertArticleTarget(month: string, folder: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`文章年月目录无效：${month}；只接受 YYYY-MM。`);
  if (!folder || sanitizeFolderName(folder) !== folder || folder === '.' || folder === '..') {
    throw new Error('文章目录名不安全；已拒绝访问历史快照。');
  }
}

function assertSnapshotId(id: string): string {
  if (!/^snapshot-[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(id)) throw new Error('历史快照 ID 不安全。');
  return id;
}

async function ensurePermission(root: FileSystemDirectoryHandle): Promise<void> {
  const candidate = root as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (!candidate.queryPermission) return;
  const descriptor = { mode: 'readwrite' as const };
  let permission = await candidate.queryPermission(descriptor);
  if (permission !== 'granted' && candidate.requestPermission) permission = await candidate.requestPermission(descriptor);
  if (permission !== 'granted') throw new Error('资料目录没有读写权限；请重新授权后管理历史快照。');
}

async function getArticleDirectory(root: FileSystemDirectoryHandle, month: string, folder: string): Promise<FileSystemDirectoryHandle> {
  assertArticleTarget(month, folder);
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(month);
  return monthDirectory.getDirectoryHandle(folder);
}

async function writeNewText(directory: FileSystemDirectoryHandle, name: string, content: string): Promise<void> {
  let file: FileSystemFileHandle;
  try {
    await directory.getFileHandle(name);
    throw new Error(`快照内文件 ${name} 已存在；未覆盖。`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  file = await directory.getFileHandle(name, { create: true });
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* preserve the original failure */ }
    try { await directory.removeEntry(name); } catch { /* outer cleanup removes the incomplete snapshot */ }
    throw error;
  }
}

function manifestOf(value: unknown, directoryName: string): SnapshotManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('快照清单不是对象。');
  const candidate = value as Record<string, unknown>;
  if (candidate.owner !== 'wechat-article-editor' || candidate.version !== 1 || candidate.id !== directoryName || !['automatic', 'manual', 'before-restore', 'before-theme-change'].includes(String(candidate.kind)) || typeof candidate.retained !== 'boolean') {
    throw new Error('快照清单字段无效或与目录名不匹配。');
  }
  if (typeof candidate.createdAt !== 'string' || Number.isNaN(Date.parse(candidate.createdAt))) throw new Error('快照创建时间无效。');
  return {
    owner: 'wechat-article-editor',
    version: 1,
    id: candidate.id as string,
    createdAt: candidate.createdAt,
    kind: candidate.kind as ArticleHistoryKind,
    retained: candidate.retained,
  };
}

async function readSnapshot(directory: FileSystemDirectoryHandle, directoryName: string): Promise<ArticleHistorySnapshot> {
  const manifestText = await (await directory.getFileHandle('snapshot.json')).getFile().then((file) => file.text());
  const manifest = manifestOf(JSON.parse(manifestText), directoryName);
  const source = await (await directory.getFileHandle('article.md')).getFile().then((file) => file.text());
  const theme = parseThemeConfigJson(await (await directory.getFileHandle('theme.json')).getFile().then((file) => file.text()));
  const themeErrors = validateThemeConfig(theme);
  if (themeErrors.length) throw new Error(`主题快照无效：${themeErrors.join('；')}`);
  const parsed = parseArticle(source);
  const themeMatches = parsed.metadata.theme?.id === theme.id && parsed.metadata.theme?.version === theme.version;
  return {
    ...manifest,
    title: parsed.metadata.title || '未命名文稿',
    source,
    theme,
    parsed,
    themeMatches,
  };
}

export async function listArticleHistory(
  root: FileSystemDirectoryHandle,
  month: string,
  folder: string,
): Promise<ArticleHistoryListResult> {
  await ensurePermission(root);
  const articleDirectory = await getArticleDirectory(root, month, folder);
  let historyDirectory: FileSystemDirectoryHandle;
  try {
    historyDirectory = await articleDirectory.getDirectoryHandle('history');
  } catch (error) {
    if (isNotFound(error)) return { snapshots: [], issues: [] };
    throw error;
  }

  const snapshots: ArticleHistorySnapshot[] = [];
  const issues: ArticleHistoryIssue[] = [];
  for await (const [name, entry] of historyDirectory.entries()) {
    if (entry.kind !== 'directory' || !name.startsWith('snapshot-')) continue;
    try {
      snapshots.push(await readSnapshot(await historyDirectory.getDirectoryHandle(name), name));
    } catch (error) {
      issues.push({ snapshotId: name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  return { snapshots, issues };
}

async function cleanupAutomaticSnapshots(
  historyDirectory: FileSystemDirectoryHandle,
  snapshots: ArticleHistorySnapshot[],
  maximum: number,
): Promise<string[]> {
  const removable = snapshots
    .filter((snapshot) => snapshot.kind === 'automatic' && !snapshot.retained)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const issues: string[] = [];
  while (removable.length > maximum) {
    const oldest = removable.shift()!;
    try {
      await historyDirectory.removeEntry(oldest.id, { recursive: true });
    } catch (error) {
      issues.push(`无法清理自动快照 ${oldest.id}：${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
  return issues;
}

function generatedSnapshotId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z');
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12) ?? Math.random().toString(36).slice(2, 14);
  return `snapshot-${timestamp}-${random}`;
}

export async function createArticleSnapshot(
  root: FileSystemDirectoryHandle,
  month: string,
  folder: string,
  source: string,
  theme: ThemeConfig,
  options: CreateArticleSnapshotOptions,
): Promise<CreateArticleSnapshotResult> {
  await ensurePermission(root);
  const themeErrors = validateThemeConfig(theme);
  if (themeErrors.length) throw new Error(`主题快照校验失败：${themeErrors.join('；')}`);
  if (!['automatic', 'manual', 'before-restore', 'before-theme-change'].includes(options.kind)) throw new Error('历史快照类型无效。');
  const parsed = parseArticle(source);
  const articleDirectory = await getArticleDirectory(root, month, folder);
  const existing = await listArticleHistory(root, month, folder);
  const serializedTheme = JSON.stringify(theme);
  const duplicate = options.kind === 'automatic'
    ? existing.snapshots.find((snapshot) => snapshot.source === source && JSON.stringify(snapshot.theme) === serializedTheme)
    : undefined;
  const maxAutoSnapshots = options.maxAutoSnapshots ?? 20;
  if (!Number.isInteger(maxAutoSnapshots) || maxAutoSnapshots < 1 || maxAutoSnapshots > 100) {
    throw new Error('自动快照保留数必须是 1–100 之间的整数。');
  }
  if (duplicate) {
    const historyDirectory = await articleDirectory.getDirectoryHandle('history');
    const cleanupIssues = await cleanupAutomaticSnapshots(historyDirectory, existing.snapshots, maxAutoSnapshots);
    return { snapshot: duplicate, created: false, cleanupIssues };
  }
  const historyDirectory = await articleDirectory.getDirectoryHandle('history', { create: true });
  const now = options.now?.() ?? new Date();
  const id = assertSnapshotId(options.id ?? generatedSnapshotId(now));
  try {
    await historyDirectory.getDirectoryHandle(id);
    throw new Error(`历史快照目录 ${id} 已存在；未覆盖。`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const retained = options.kind === 'automatic' ? options.retained ?? false : true;
  const manifest: SnapshotManifest = { owner: 'wechat-article-editor', version: 1, id, createdAt: now.toISOString(), kind: options.kind, retained };
  const snapshotDirectory = await historyDirectory.getDirectoryHandle(id, { create: true });
  try {
    await writeNewText(snapshotDirectory, 'article.md', source);
    await writeNewText(snapshotDirectory, 'theme.json', JSON.stringify(theme, null, 2));
    // The manifest is written last; readers never expose a partial snapshot.
    await writeNewText(snapshotDirectory, 'snapshot.json', JSON.stringify(manifest, null, 2));
    const snapshot = await readSnapshot(snapshotDirectory, id);
    const allSnapshots = [...existing.snapshots, snapshot];
    const cleanupIssues = await cleanupAutomaticSnapshots(historyDirectory, allSnapshots, maxAutoSnapshots);
    return { snapshot, created: true, cleanupIssues };
  } catch (error) {
    try { await historyDirectory.removeEntry(id, { recursive: true }); } catch (cleanupError) {
      throw new Error(`历史快照写入失败：${error instanceof Error ? error.message : String(error)}；未完成目录回收失败：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}。`);
    }
    throw new Error(`历史快照写入失败：${error instanceof Error ? error.message : String(error)}；原文未改动。`);
  }
}

export async function setArticleSnapshotRetained(
  root: FileSystemDirectoryHandle,
  month: string,
  folder: string,
  id: string,
  retained: boolean,
): Promise<ArticleHistorySnapshot> {
  await ensurePermission(root);
  assertArticleTarget(month, folder);
  assertSnapshotId(id);
  const history = await listArticleHistory(root, month, folder);
  const snapshot = history.snapshots.find((item) => item.id === id);
  if (!snapshot) throw new Error(`找不到完整历史快照「${id}」；未改写任何文件。`);
  if (snapshot.kind !== 'automatic') {
    if (!retained) throw new Error('手动与恢复前快照始终受保护，不能取消保护。');
    return snapshot;
  }
  if (snapshot.retained === retained) return snapshot;

  const articleDirectory = await getArticleDirectory(root, month, folder);
  const historyDirectory = await articleDirectory.getDirectoryHandle('history');
  const snapshotDirectory = await historyDirectory.getDirectoryHandle(id);
  const manifest = manifestOf(
    JSON.parse(await (await snapshotDirectory.getFileHandle('snapshot.json')).getFile().then((file) => file.text())),
    id,
  );
  const nextManifest = { ...manifest, retained };
  const file = await snapshotDirectory.getFileHandle('snapshot.json');
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(JSON.stringify(nextManifest, null, 2));
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* preserve the original write failure */ }
    throw new Error(`快照保护状态保存失败：${error instanceof Error ? error.message : String(error)}；原状态未改动。`);
  }
  return { ...snapshot, retained };
}
