import { loadSettingsDocument, updateSettingsDocument } from './settingsFile';
export type ArticleSettings = {
  version: 1;
  defaultArticleThemeId: string | null;
  autoSave: {
    enabled: boolean;
    intervalSeconds: number;
  };
  autoSnapshot: {
    enabled: boolean;
    intervalMinutes: number;
    maxCount: number;
  };
};

export type ArticleSettingsLoadResult = {
  settings: ArticleSettings;
  issue: string | null;
  fileExists: boolean;
};

export const DEFAULT_ARTICLE_SETTINGS: ArticleSettings = Object.freeze({
  version: 1,
  defaultArticleThemeId: null,
  autoSave: Object.freeze({ enabled: true, intervalSeconds: 60 }),
  autoSnapshot: Object.freeze({ enabled: true, intervalMinutes: 30, maxCount: 20 }),
}) as ArticleSettings;

function defaultSettings(): ArticleSettings {
  return {
    version: DEFAULT_ARTICLE_SETTINGS.version,
    defaultArticleThemeId: DEFAULT_ARTICLE_SETTINGS.defaultArticleThemeId,
    autoSave: { ...DEFAULT_ARTICLE_SETTINGS.autoSave },
    autoSnapshot: { ...DEFAULT_ARTICLE_SETTINGS.autoSnapshot },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const unexpected = Object.keys(value).filter((key) => !expected.includes(key));
  if (unexpected.length) throw new Error(`${label} 含未知字段：${unexpected.join('、')}；为保护文件未自动改写。`);
}

function assertInterval(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label}必须是 ${minimum}–${maximum} 之间的整数间隔。`);
  }
}

export function validateArticleSettings(value: unknown): ArticleSettings {
  if (!isRecord(value)) throw new Error('settings.json 顶层必须是对象。');
  assertOnlyKeys(value, ['version', 'defaultArticleThemeId', 'autoSave', 'autoSnapshot'], 'settings.json');
  if (value.version !== 1) throw new Error('settings.json 版本不受支持；为保护文件未自动改写。');
  if (value.defaultArticleThemeId !== undefined && value.defaultArticleThemeId !== null &&
      (typeof value.defaultArticleThemeId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(value.defaultArticleThemeId))) {
    throw new Error('默认文章主题 ID 无效；为保护文件未自动改写。');
  }
  if (!isRecord(value.autoSave)) throw new Error('settings.json 的 autoSave 必须是对象。');
  if (!isRecord(value.autoSnapshot)) throw new Error('settings.json 的 autoSnapshot 必须是对象。');
  assertOnlyKeys(value.autoSave, ['enabled', 'intervalSeconds'], 'autoSave');
  assertOnlyKeys(value.autoSnapshot, ['enabled', 'intervalMinutes', 'maxCount'], 'autoSnapshot');
  if (typeof value.autoSave.enabled !== 'boolean') throw new Error('自动保存开关必须是布尔值。');
  if (typeof value.autoSnapshot.enabled !== 'boolean') throw new Error('自动快照开关必须是布尔值。');
  assertInterval(value.autoSave.intervalSeconds, '自动保存间隔', 1, 86_400);
  assertInterval(value.autoSnapshot.intervalMinutes, '自动快照间隔', 1, 10_080);
  assertInterval(value.autoSnapshot.maxCount, '自动快照保留数', 1, 100);
  return {
    version: 1,
    defaultArticleThemeId: value.defaultArticleThemeId ?? null,
    autoSave: { enabled: value.autoSave.enabled, intervalSeconds: value.autoSave.intervalSeconds },
    autoSnapshot: {
      enabled: value.autoSnapshot.enabled,
      intervalMinutes: value.autoSnapshot.intervalMinutes,
      maxCount: value.autoSnapshot.maxCount,
    },
  };
}

async function ensureReadWritePermission(root: FileSystemDirectoryHandle): Promise<void> {
  const candidate = root as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (!candidate.queryPermission) return;
  const descriptor = { mode: 'readwrite' as const };
  let permission = await candidate.queryPermission(descriptor);
  if (permission !== 'granted' && candidate.requestPermission) permission = await candidate.requestPermission(descriptor);
  if (permission !== 'granted') throw new Error('资料目录没有读写权限；请重新授权后再管理设置。');
}

export async function loadArticleSettings(root: FileSystemDirectoryHandle): Promise<ArticleSettingsLoadResult> {
  await ensureReadWritePermission(root);
  try {
    const result = await loadSettingsDocument(root);
    return { settings: result.settings, issue: null, fileExists: result.fileExists };
  } catch (error) {
    return { settings: defaultSettings(), issue: `settings.json 无效或无法读取：${error instanceof Error ? error.message : String(error)}。原文件未改写。`, fileExists: true };
  }
}

export async function saveArticleSettings(root: FileSystemDirectoryHandle, input: ArticleSettings): Promise<ArticleSettings> {
  await ensureReadWritePermission(root);
  const settings = validateArticleSettings(input);
  const saved = await updateSettingsDocument(root, current => ({ ...current, settings }));
  return saved.settings;
}
