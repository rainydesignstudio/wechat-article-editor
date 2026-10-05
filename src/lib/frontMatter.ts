import { parseDocument } from 'yaml';
import type { ArticleDiagnostic, ArticleMeta, ParsedArticle, ThemeConfig } from './types';

const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const FRONT_MATTER_START_PATTERN = /^---\r?\n/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultMeta(title = '未命名文稿', themeId = 'basic'): ArticleMeta {
  const now = nowIso();
  return {
    title,
    description: '',
    author: '',
    categories: [],
    createdAt: now,
    updatedAt: now,
    theme: { id: themeId, version: '1.0.0' },
  };
}

function typeDiagnostic(field: string, expected: string): ArticleDiagnostic {
  return { level: 'error', message: `Front Matter 字段「${field}」类型错误，应为 ${expected}。` };
}

function readString(
  record: Record<string, unknown>,
  field: string,
  fallback: string,
  diagnostics: ArticleDiagnostic[],
): string {
  const value = record[field];
  if (value === undefined) return fallback;
  if (typeof value === 'string') return value;
  diagnostics.push(typeDiagnostic(field, '字符串'));
  return fallback;
}

function readCategories(record: Record<string, unknown>, diagnostics: ArticleDiagnostic[]): string[] {
  const value = record.categories;
  if (value === undefined) return [];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return [...value];
  diagnostics.push(typeDiagnostic('categories', '字符串数组'));
  return [];
}

function readTheme(record: Record<string, unknown>, diagnostics: ArticleDiagnostic[]): { id: string; version: string } {
  const value = record.theme;
  if (value === undefined) return { id: 'basic', version: '1.0.0' };
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic('theme', '包含 id/version 的对象'));
    return { id: 'basic', version: '1.0.0' };
  }
  return {
    id: readString(value, 'id', 'basic', diagnostics),
    version: readString(value, 'version', '1.0.0', diagnostics),
  };
}

export function normalizeMeta(
  value: unknown,
  fallbackTitle = '未命名文稿',
  diagnostics: ArticleDiagnostic[] = [],
): ArticleMeta {
  const record = isRecord(value) ? value : {};
  if (!isRecord(value)) diagnostics.push({ level: 'error', message: 'Front Matter 必须解析为对象。' });
  return {
    ...record,
    title: readString(record, 'title', fallbackTitle, diagnostics) || fallbackTitle,
    description: readString(record, 'description', '', diagnostics),
    author: readString(record, 'author', '', diagnostics),
    categories: readCategories(record, diagnostics),
    createdAt: readString(record, 'createdAt', nowIso(), diagnostics),
    updatedAt: readString(record, 'updatedAt', nowIso(), diagnostics),
    theme: readTheme(record, diagnostics),
  };
}

function yamlDiagnostics(error: unknown): ArticleDiagnostic[] {
  if (!error) return [];
  const candidate = error as { message?: unknown; linePos?: Array<{ line?: number }> };
  const message = error instanceof Error ? error.message : typeof candidate.message === 'string' ? candidate.message : String(error);
  const line = candidate.linePos?.[0]?.line;
  const lineMatch = message.match(/line (\d+)/i);
  return [{ level: 'error', message, line: typeof line === 'number' ? line : lineMatch ? Number(lineMatch[1]) : undefined }];
}

function uncertainFrontMatter(source: string): ParsedArticle {
  return {
    source,
    body: '',
    metadata: defaultMeta(),
    hasFrontMatter: true,
    frontMatterRange: { start: 0, end: source.length },
    diagnostics: [{ level: 'error', message: '检测到 Front Matter 起始边界，但没有找到闭合的 ---；为避免误把元数据写入正文，预览与复制已阻止。' }],
    canCopy: false,
  };
}

export function parseArticle(source: string): ParsedArticle {
  const match = source.match(FRONT_MATTER_PATTERN);
  if (!match) {
    if (FRONT_MATTER_START_PATTERN.test(source)) return uncertainFrontMatter(source);
    return {
      source,
      body: source,
      metadata: defaultMeta(),
      hasFrontMatter: false,
      frontMatterRange: null,
      diagnostics: [{ level: 'warning', message: '未发现完整 Front Matter；首次明确保存会补齐最小元数据，正文保持不重排。' }],
      canCopy: true,
    };
  }

  const header = match[1];
  const diagnostics: ArticleDiagnostic[] = [];
  try {
    const document = parseDocument(header, { schema: 'core', uniqueKeys: true });
    if (document.errors.length > 0) {
      return {
        source,
        body: source.slice(match[0].length),
        metadata: defaultMeta(),
        hasFrontMatter: true,
        frontMatterRange: { start: 0, end: match[0].length },
        diagnostics: document.errors.flatMap(yamlDiagnostics),
        canCopy: false,
      };
    }
    if (document.warnings.length > 0) {
      diagnostics.push(...document.warnings.flatMap(yamlDiagnostics).map((item) => ({ ...item, level: 'warning' as const })));
    }
    const value = document.toJS({ maxAliasCount: 0 });
    const metadata = normalizeMeta(value, '未命名文稿', diagnostics);
    return {
      source,
      body: source.slice(match[0].length),
      metadata,
      hasFrontMatter: true,
      frontMatterRange: { start: 0, end: match[0].length },
      diagnostics,
      canCopy: !diagnostics.some((item) => item.level === 'error'),
    };
  } catch (error) {
    return {
      source,
      body: source.slice(match[0].length),
      metadata: defaultMeta(),
      hasFrontMatter: true,
      frontMatterRange: { start: 0, end: match[0].length },
      diagnostics: yamlDiagnostics(error),
      canCopy: false,
    };
  }
}

function serializeNewFrontMatter(meta: ArticleMeta, body: string): string {
  const header = [
    '---',
    `title: ${JSON.stringify(meta.title)}`,
    `description: ${JSON.stringify(meta.description)}`,
    `author: ${JSON.stringify(meta.author)}`,
    `categories: ${JSON.stringify(meta.categories)}`,
    `createdAt: ${JSON.stringify(meta.createdAt)}`,
    `updatedAt: ${JSON.stringify(meta.updatedAt)}`,
    'theme:',
    `  id: ${JSON.stringify(meta.theme.id)}`,
    `  version: ${JSON.stringify(meta.theme.version)}`,
    '---',
    '',
  ].join('\n');
  return `${header}${body}`;
}

function applyDocumentPatch(document: ReturnType<typeof parseDocument>, patch: Partial<ArticleMeta>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'theme' && isRecord(value)) {
      const existing = document.get('theme');
      if (isRecord(existing)) {
        if (typeof value.id === 'string') document.setIn(['theme', 'id'], value.id);
        if (typeof value.version === 'string') document.setIn(['theme', 'version'], value.version);
      } else {
        document.set('theme', { id: value.id, version: value.version });
      }
      continue;
    }
    document.set(key, value);
  }
}

export function updateFrontMatter(source: string, patch: Partial<ArticleMeta>, omitKeys: readonly string[] = []): string {
  const parsed = parseArticle(source);
  const match = source.match(FRONT_MATTER_PATTERN);
  if (!match) {
    if (FRONT_MATTER_START_PATTERN.test(source)) return source;
    const merged = normalizeMeta({ ...parsed.metadata, ...patch, theme: patch.theme ?? parsed.metadata.theme });
    for (const key of omitKeys) delete merged[key];
    return serializeNewFrontMatter(merged, source);
  }
  if (parsed.diagnostics.some((item) => item.level === 'error')) return source;

  try {
    const document = parseDocument(match[1], { schema: 'core', uniqueKeys: true });
    if (document.errors.length > 0) return source;
    applyDocumentPatch(document, patch);
    for (const key of omitKeys) document.delete(key);
    const eol = match[1].includes('\r\n') ? '\r\n' : '\n';
    const rendered = document.toString().replace(/\r?\n/g, eol).replace(new RegExp(`${eol}$`), '');
    const body = source.slice(match[0].length);
    const separator = body.length > 0 || match[0].endsWith(eol) ? eol : '';
    return `---${eol}${rendered}${eol}---${separator}${body}`;
  } catch {
    return source;
  }
}

export function replaceArticleBody(source: string, body: string): string {
  const parsed = parseArticle(source);
  const errors = parsed.diagnostics.filter((item) => item.level === 'error');
  if (errors.length) throw new Error(`Front Matter 有误，正文未写入：${errors.map((item) => item.message).join('；')}`);
  const bodyStart = source.length - parsed.body.length;
  return `${source.slice(0, bodyStart)}${body}`;
}

export function createArticleSource(title = '未命名技术文稿', themeId = 'basic'): string {
  return updateFrontMatter('\n', defaultMeta(title, themeId));
}

export function instantiateArticleTemplate(
  source: string,
  options: { now?: string; theme: Pick<ThemeConfig, 'id' | 'version'> },
): string {
  const before = parseArticle(source);
  const errors = before.diagnostics.filter((item) => item.level === 'error');
  if (errors.length) throw new Error(`模板 Front Matter 有误：${errors.map((item) => item.message).join('；')}`);

  const now = options.now ?? nowIso();
  const result = updateFrontMatter(source, {
    createdAt: now,
    updatedAt: now,
    theme: { id: options.theme.id, version: options.theme.version },
  }, ['templateIcon']);
  const after = parseArticle(result);
  if (!after.hasFrontMatter || after.diagnostics.some((item) => item.level === 'error')) {
    throw new Error('模板 Front Matter 无法安全更新；未创建新稿。');
  }
  if (after.metadata.createdAt !== now || after.metadata.updatedAt !== now ||
      after.metadata.theme.id !== options.theme.id || after.metadata.theme.version !== options.theme.version) {
    throw new Error('模板时间或主题绑定无法验证；未创建新稿。');
  }
  if (Object.hasOwn(after.metadata, 'templateIcon')) throw new Error('模板图标未能从新稿移除；未创建新稿。');
  return result;
}
