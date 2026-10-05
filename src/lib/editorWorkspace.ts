import { loadSettingsDocument, updateSettingsDocument } from './settingsFile';
import type { ArticleSummary } from './types';
import { BASE_EDITOR_THEME, DEFAULT_EDITOR_THEME } from './editorThemes';

export const EDITOR_WORKSPACE_FILE = 'settings.json';
export const LEGACY_EDITOR_WORKSPACE_FILE = 'editor-workspace.json';
export const UNCLASSIFIED_GROUP = 'unclassified';

const LEGACY_PRESET_IDS = ['sea-glass', 'linen', 'mist'] as const;
const LEGACY_ACCENT_IDS = ['teal', 'moss', 'berry'] as const;
const LEGACY_FONT_IDS = ['sans', 'serif'] as const;

export const EDITOR_COLOR_MODES = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
] as const;

export type EditorColorMode = (typeof EDITOR_COLOR_MODES)[number]['id'];

export type EditorAppearance = {
  themeId: string;
  colorMode: EditorColorMode;
  custom: { colorThemeId: string; fontThemeId: string } | null;
};

export function replaceEditorAppearanceThemeId(appearance: EditorAppearance, previousId: string, nextId: string): EditorAppearance {
  const replace = (id: string) => id === previousId ? nextId : id;
  return {
    ...appearance,
    themeId: replace(appearance.themeId),
    custom: appearance.custom ? { colorThemeId: replace(appearance.custom.colorThemeId), fontThemeId: replace(appearance.custom.fontThemeId) } : null,
  };
}

export type LegacyEditorAppearance = {
  preset: (typeof LEGACY_PRESET_IDS)[number];
  accent: (typeof LEGACY_ACCENT_IDS)[number];
  font: (typeof LEGACY_FONT_IDS)[number];
  colorMode: EditorColorMode;
};

export type EditorProject = {
  id: string;
  name: string;
  pinned: boolean;
  collapsed: boolean;
};

export type ArticleOrganization = {
  projectId: string | null;
  archived: boolean;
};

export type EditorWorkspace = {
  version: 2;
  projects: EditorProject[];
  projectOrder: string[];
  articleOrganization: Record<string, ArticleOrganization>;
  articleOrder: Record<string, string[]>;
  appearance: EditorAppearance;
};

export type EditorWorkspaceLoadResult = {
  workspace: EditorWorkspace;
  issue: string | null;
  fileExists: boolean;
  rawContent: string | null;
  legacyAppearance?: LegacyEditorAppearance;
};

export type EditorWorkspaceSaveBase = Pick<EditorWorkspaceLoadResult, 'fileExists' | 'rawContent'>;

export const DEFAULT_EDITOR_APPEARANCE: Readonly<EditorAppearance> = Object.freeze({
  themeId: DEFAULT_EDITOR_THEME.id,
  colorMode: 'system',
  custom: null,
});

export function createDefaultEditorWorkspace(): EditorWorkspace {
  return {
    version: 2,
    projects: [],
    projectOrder: [],
    articleOrganization: {},
    articleOrder: {},
  appearance: { ...DEFAULT_EDITOR_APPEARANCE },
  };
}

export const DEFAULT_EDITOR_WORKSPACE: Readonly<EditorWorkspace> = createDefaultEditorWorkspace();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const unexpected = Object.keys(value).filter((key) => !expected.includes(key));
  if (unexpected.length) throw new Error(`${label} 含未知字段：${unexpected.join('、')}；为保护文件未自动改写。`);
}

function assertSafeProjectId(value: unknown, label = '项目 ID'): asserts value is string {
  if (typeof value !== 'string' || value === UNCLASSIFIED_GROUP || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(value)) {
    throw new Error(`${label}无效；只接受小写字母、数字和连字符。`);
  }
}

function assertSafeArticleId(value: string): void {
  const [month, folder, extra] = value.split('/');
  if (
    extra !== undefined ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '') ||
    !folder ||
    folder === '.' ||
    folder === '..' ||
    folder.includes('\\') ||
    /[\u0000-\u001f]/.test(folder)
  ) {
    throw new Error(`文章组织记录 ID 无效：${value}；未改写原文件。`);
  }
}

function assertUniqueStrings(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label}不能包含重复项。`);
}

function validateStringArray(value: unknown, label: string, validateItem: (item: string) => void): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${label}必须是字符串数组。`);
  const items = value as string[];
  assertUniqueStrings(items, label);
  items.forEach(validateItem);
  return [...items];
}

export function validateEditorWorkspace(value: unknown): EditorWorkspace {
  if (!isRecord(value)) throw new Error(`${EDITOR_WORKSPACE_FILE} 顶层必须是对象。`);
  assertOnlyKeys(value, ['version', 'projects', 'projectOrder', 'articleOrganization', 'articleOrder', 'appearance'], EDITOR_WORKSPACE_FILE);
  if (value.version !== 1 && value.version !== 2) throw new Error(`${EDITOR_WORKSPACE_FILE} 版本不受支持；为保护文件未自动改写。`);
  if (!Array.isArray(value.projects)) throw new Error('项目列表必须是数组。');

  const projects: EditorProject[] = value.projects.map((item, index) => {
    if (!isRecord(item)) throw new Error(`第 ${index + 1} 个项目必须是对象。`);
    assertOnlyKeys(item, ['id', 'name', 'pinned', 'collapsed'], `项目 ${index + 1}`);
    assertSafeProjectId(item.id, `项目 ${index + 1} ID`);
    if (typeof item.name !== 'string' || item.name.trim().length < 1 || item.name.trim().length > 48) {
      throw new Error(`项目 ${index + 1} 名称必须为 1–48 个字符。`);
    }
    if (typeof item.pinned !== 'boolean' || typeof item.collapsed !== 'boolean') {
      throw new Error(`项目「${item.name}」的置顶和折叠状态必须是布尔值。`);
    }
    return { id: item.id, name: item.name.trim(), pinned: item.pinned, collapsed: item.collapsed };
  });

  const projectIds = projects.map((project) => project.id);
  assertUniqueStrings(projectIds, '项目 ID');
  const projectOrder = validateStringArray(value.projectOrder, '项目顺序', (id) => assertSafeProjectId(id));
  if (projectOrder.length !== projectIds.length || projectIds.some((id) => !projectOrder.includes(id))) {
    throw new Error('项目顺序必须且只能包含当前项目；为保护文件未自动补项。');
  }

  if (!isRecord(value.articleOrganization)) throw new Error('文章组织信息必须是对象。');
  const articleOrganization: Record<string, ArticleOrganization> = {};
  for (const [articleId, item] of Object.entries(value.articleOrganization)) {
    assertSafeArticleId(articleId);
    if (!isRecord(item)) throw new Error(`文章「${articleId}」的组织信息必须是对象。`);
    assertOnlyKeys(item, ['projectId', 'archived'], `文章「${articleId}」组织信息`);
    const projectId = item.projectId;
    if (projectId !== null) {
      assertSafeProjectId(projectId, `文章「${articleId}」项目 ID`);
      if (!projectIds.includes(projectId)) throw new Error(`文章「${articleId}」指向不存在的项目「${projectId}」；为保护文件未自动改写。`);
    }
    if (typeof item.archived !== 'boolean') throw new Error(`文章「${articleId}」的归档状态必须是布尔值。`);
    articleOrganization[articleId] = { projectId, archived: item.archived };
  }

  if (!isRecord(value.articleOrder)) throw new Error('文章顺序必须是对象。');
  const articleOrder: Record<string, string[]> = {};
  for (const [groupId, orderedIds] of Object.entries(value.articleOrder)) {
    if (groupId !== UNCLASSIFIED_GROUP) {
      assertSafeProjectId(groupId, '文章顺序项目 ID');
      if (!projectIds.includes(groupId)) throw new Error(`文章顺序指向不存在的项目「${groupId}」；为保护文件未自动改写。`);
    }
    articleOrder[groupId] = validateStringArray(orderedIds, `「${groupId}」文章顺序`, assertSafeArticleId);
  }

  if (!isRecord(value.appearance)) throw new Error('编辑器外观必须是对象。');
  const rawAppearance = value.appearance;
  const colorModeIds = EDITOR_COLOR_MODES.map((item) => item.id) as readonly string[];
  if (typeof rawAppearance.colorMode !== 'string' || !colorModeIds.includes(rawAppearance.colorMode)) throw new Error('编辑器深浅模式选项不受支持。');
  let appearance: EditorAppearance;
  if (value.version === 1) {
    assertOnlyKeys(rawAppearance, ['preset', 'accent', 'font', 'colorMode'], '旧版编辑器外观');
    if (typeof rawAppearance.preset !== 'string' || !(LEGACY_PRESET_IDS as readonly string[]).includes(rawAppearance.preset)) throw new Error('旧版编辑器主题预设不受支持。');
    if (typeof rawAppearance.accent !== 'string' || !(LEGACY_ACCENT_IDS as readonly string[]).includes(rawAppearance.accent)) throw new Error('旧版编辑器强调色不受支持。');
    if (typeof rawAppearance.font !== 'string' || !(LEGACY_FONT_IDS as readonly string[]).includes(rawAppearance.font)) throw new Error('旧版编辑器字体选项不受支持。');
    const isDefault = rawAppearance.preset === 'sea-glass' && rawAppearance.accent === 'teal' && rawAppearance.font === 'sans';
    appearance = {
      themeId: isDefault ? BASE_EDITOR_THEME.id : `legacy-${rawAppearance.preset}-${rawAppearance.accent}-${rawAppearance.font}`,
      colorMode: rawAppearance.colorMode as EditorColorMode,
      custom: null,
    };
  } else {
    assertOnlyKeys(rawAppearance, ['themeId', 'colorMode', 'custom'], '编辑器外观');
    if (typeof rawAppearance.themeId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(rawAppearance.themeId)) throw new Error('编辑器主题 ID 不安全。');
    let custom: EditorAppearance['custom'] = null;
    if (rawAppearance.custom !== null) {
      if (!isRecord(rawAppearance.custom)) throw new Error('自定义主题来源必须是对象或null。');
      assertOnlyKeys(rawAppearance.custom, ['colorThemeId', 'fontThemeId'], '自定义主题来源');
      const { colorThemeId, fontThemeId } = rawAppearance.custom;
      if (typeof colorThemeId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(colorThemeId) ||
          typeof fontThemeId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(fontThemeId)) throw new Error('自定义主题来源 ID 不安全。');
      custom = { colorThemeId, fontThemeId };
    }
    appearance = { themeId: rawAppearance.themeId, colorMode: rawAppearance.colorMode as EditorColorMode, custom };
  }

  return {
    version: 2,
    projects,
    projectOrder,
    articleOrganization,
    articleOrder,
    appearance,
  };
}

async function ensurePermission(root: FileSystemDirectoryHandle, mode: 'read' | 'readwrite'): Promise<void> {
  const candidate = root as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (!candidate.queryPermission) return;
  const descriptor = { mode };
  let permission = await candidate.queryPermission(descriptor);
  if (permission !== 'granted' && mode === 'readwrite' && candidate.requestPermission) {
    permission = await candidate.requestPermission(descriptor);
  }
  if (permission !== 'granted') throw new Error(`资料目录没有${mode === 'read' ? '读取' : '读写'}权限；请重新授权后重试。`);
}

export async function loadEditorWorkspace(root: FileSystemDirectoryHandle): Promise<EditorWorkspaceLoadResult> {
  try {
    await ensurePermission(root, 'read');
    const result = await loadSettingsDocument(root);
    return { workspace: result.workspace, issue: null, fileExists: result.workspaceExists, rawContent: result.workspaceRaw, legacyAppearance: result.legacyAppearance };
  } catch (error) {
    return { workspace: createDefaultEditorWorkspace(), issue: `settings.json 或旧工作区无效：${error instanceof Error ? error.message : String(error)}。原文件未改写。`, fileExists: true, rawContent: null };
  }
}

export async function saveEditorWorkspace(root: FileSystemDirectoryHandle, input: EditorWorkspace, base: EditorWorkspaceSaveBase): Promise<EditorWorkspaceLoadResult> {
  await ensurePermission(root, 'readwrite');
  const workspace = validateEditorWorkspace(input);
  const result = await updateSettingsDocument(root, current => {
    const untouchedDefault = !base.fileExists && base.rawContent === null && current.workspaceRaw === JSON.stringify(createDefaultEditorWorkspace());
    if (!untouchedDefault && (current.workspaceExists !== base.fileExists || current.workspaceRaw !== base.rawContent)) throw new Error('settings.json 工作区已在外部变化；本次没有覆盖。请刷新资料库后重试。');
    return { ...current, workspace, legacyAppearance: undefined };
  });
  return { workspace, issue: null, fileExists: true, rawContent: result.workspaceRaw };
}

export function editorArticleGroupKey(projectId: string | null): string {
  return projectId ?? UNCLASSIFIED_GROUP;
}

export function getArticleOrganization(workspace: EditorWorkspace, articleId: string): ArticleOrganization {
  return workspace.articleOrganization[articleId] ?? { projectId: null, archived: false };
}

export function createEditorProject(workspace: EditorWorkspace, name: string, id: string): EditorWorkspace {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 48) throw new Error('项目名称必须为 1–48 个字符。');
  assertSafeProjectId(id);
  if (workspace.projects.some((project) => project.id === id)) throw new Error('项目 ID 冲突；请重试。');
  return {
    ...workspace,
    projects: [...workspace.projects, { id, name: cleanName, pinned: false, collapsed: false }],
    projectOrder: [...workspace.projectOrder, id],
  };
}

export function renameEditorProject(workspace: EditorWorkspace, id: string, name: string): EditorWorkspace {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 48) throw new Error('项目名称必须为 1–48 个字符。');
  if (!workspace.projects.some((project) => project.id === id)) throw new Error('找不到要修改的项目。');
  return { ...workspace, projects: workspace.projects.map((project) => project.id === id ? { ...project, name: cleanName } : project) };
}

export function setEditorProjectCollapsed(workspace: EditorWorkspace, id: string, collapsed: boolean): EditorWorkspace {
  if (!workspace.projects.some((project) => project.id === id)) throw new Error('找不到要折叠的项目。');
  return { ...workspace, projects: workspace.projects.map((project) => project.id === id ? { ...project, collapsed } : project) };
}

export function setEditorProjectPinned(workspace: EditorWorkspace, id: string, pinned: boolean): EditorWorkspace {
  if (!workspace.projects.some((project) => project.id === id)) throw new Error('找不到要置顶的项目。');
  return { ...workspace, projects: workspace.projects.map((project) => project.id === id ? { ...project, pinned } : project) };
}

export function reorderPinnedEditorProjects(workspace: EditorWorkspace, pinnedIds: string[]): EditorWorkspace {
  const expected = workspace.projects.filter((project) => project.pinned).map((project) => project.id);
  assertUniqueStrings(pinnedIds, '置顶项目顺序');
  if (pinnedIds.length !== expected.length || expected.some((id) => !pinnedIds.includes(id))) {
    throw new Error('置顶顺序必须且只能包含当前置顶项目。');
  }
  const pinned = new Set(expected);
  return { ...workspace, projectOrder: [...pinnedIds, ...workspace.projectOrder.filter((id) => !pinned.has(id))] };
}

export function deleteEditorProject(workspace: EditorWorkspace, id: string, articleIds: string[]): EditorWorkspace {
  if (!workspace.projects.some((project) => project.id === id)) throw new Error('找不到要删除的项目。');
  const articleOrganization = { ...workspace.articleOrganization };
  for (const articleId of articleIds) {
    const current = getArticleOrganization(workspace, articleId);
    if (current.projectId === id) articleOrganization[articleId] = { ...current, projectId: null };
  }
  const projects = workspace.projects.filter((project) => project.id !== id);
  const projectOrder = workspace.projectOrder.filter((projectId) => projectId !== id);
  const articleOrder = { ...workspace.articleOrder };
  const returned = articleIds.filter((articleId) => articleOrganization[articleId]?.projectId === null);
  if (articleOrder[UNCLASSIFIED_GROUP] || returned.length) {
    const current = articleOrder[UNCLASSIFIED_GROUP] ?? [];
    articleOrder[UNCLASSIFIED_GROUP] = [...returned, ...current.filter((articleId) => !returned.includes(articleId))];
  }
  delete articleOrder[id];
  return { ...workspace, projects, projectOrder, articleOrganization, articleOrder };
}

export function setArticleProject(workspace: EditorWorkspace, articleId: string, projectId: string | null): EditorWorkspace {
  assertSafeArticleId(articleId);
  if (projectId !== null && !workspace.projects.some((project) => project.id === projectId)) throw new Error('目标项目不存在。');
  const current = getArticleOrganization(workspace, articleId);
  return { ...workspace, articleOrganization: { ...workspace.articleOrganization, [articleId]: { ...current, projectId } } };
}

export function setArticleArchived(workspace: EditorWorkspace, articleId: string, archived: boolean): EditorWorkspace {
  assertSafeArticleId(articleId);
  const current = getArticleOrganization(workspace, articleId);
  return { ...workspace, articleOrganization: { ...workspace.articleOrganization, [articleId]: { ...current, archived } } };
}

export function setArticleGroupOrder(workspace: EditorWorkspace, projectId: string | null, articleIds: string[]): EditorWorkspace {
  const groupId = editorArticleGroupKey(projectId);
  if (projectId !== null && !workspace.projects.some((project) => project.id === projectId)) throw new Error('文章项目不存在。');
  const nextIds = validateStringArray(articleIds, '文章手动顺序', assertSafeArticleId);
  return { ...workspace, articleOrder: { ...workspace.articleOrder, [groupId]: nextIds } };
}

export function moveArticleToProject(
  workspace: EditorWorkspace,
  articleId: string,
  projectId: string | null,
  orderedTargetIds: string[],
): EditorWorkspace {
  assertSafeArticleId(articleId);
  if (projectId !== null && !workspace.projects.some((project) => project.id === projectId)) throw new Error('目标项目不存在。');
  const current = getArticleOrganization(workspace, articleId);
  const next = setArticleProject(workspace, articleId, projectId);
  const articleOrder = { ...next.articleOrder };
  const sourceKey = editorArticleGroupKey(current.projectId);
  if (sourceKey !== editorArticleGroupKey(projectId)) {
    articleOrder[sourceKey] = (articleOrder[sourceKey] ?? []).filter((id) => id !== articleId);
  }
  const targetKey = editorArticleGroupKey(projectId);
  const targetIds = orderedTargetIds.filter((id) => id !== articleId);
  assertUniqueStrings(targetIds, '目标组文章列表');
  targetIds.forEach(assertSafeArticleId);
  articleOrder[targetKey] = [articleId, ...targetIds];
  return { ...next, articleOrder };
}

export function orderArticlesForGroup<T extends ArticleSummary>(
  articles: T[],
  workspace: EditorWorkspace,
  projectId: string | null,
  archived = false,
): T[] {
  const members = articles.filter((article) => {
    const organization = getArticleOrganization(workspace, article.id);
    return organization.projectId === projectId && organization.archived === archived;
  });
  const manual = workspace.articleOrder[editorArticleGroupKey(projectId)];
  const recent = [...members].sort((left, right) => right.parse.metadata.updatedAt.localeCompare(left.parse.metadata.updatedAt));
  if (!manual) return recent;
  const rank = new Map(manual.map((id, index) => [id, index]));
  return recent.sort((left, right) => {
    const leftRank = rank.get(left.id);
    const rightRank = rank.get(right.id);
    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return -1;
    if (rightRank === undefined) return 1;
    return leftRank - rightRank;
  });
}

export function orderEditorProjects(workspace: EditorWorkspace, articles: ArticleSummary[]): EditorProject[] {
  const rank = new Map(workspace.projectOrder.map((id, index) => [id, index]));
  const recent = new Map<string, string>();
  for (const article of articles) {
    const organization = getArticleOrganization(workspace, article.id);
    if (organization.archived) continue;
    const projectId = organization.projectId;
    if (!projectId) continue;
    const date = article.parse.metadata.updatedAt;
    if (!recent.has(projectId) || date > recent.get(projectId)!) recent.set(projectId, date);
  }
  return [...workspace.projects].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (left.pinned) return (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    return (recent.get(right.id) ?? '').localeCompare(recent.get(left.id) ?? '');
  });
}

export function setEditorAppearance(workspace: EditorWorkspace, appearance: EditorAppearance): EditorWorkspace {
  return { ...workspace, appearance: { ...appearance, custom: appearance.custom ? { ...appearance.custom } : null } };
}

export function resetEditorAppearance(workspace: EditorWorkspace): EditorWorkspace {
  return setEditorAppearance(workspace, { ...DEFAULT_EDITOR_APPEARANCE });
}
