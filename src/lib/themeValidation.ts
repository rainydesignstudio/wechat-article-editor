import type { ThemeConfig } from './types';
import { articleFormatBlocks, articleFormatMessage, validateArticleFormatCss } from './articleFormat';

import { getFormatSnapshot } from './article-format/runtime';

function definition() { return getFormatSnapshot().bundle.validator.product.theme; }
const setOf = (values: readonly string[]) => new Set(values);

function hasUnsafeCssValue(value: string): boolean {
  return /(?:url\s*\(|expression\s*\(|javascript\s*:|data\s*:|@import|@font-face|behavior\s*:|-moz-binding|<|\\)/i.test(value);
}

function validValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= definition().limits.value &&
    new RegExp(definition().valuePattern, 'u').test(value) && !hasUnsafeCssValue(value) && !/[{};]/.test(value) &&
    [...value.matchAll(/var\(\s*--([\w-]+)/gi)].every(match => setOf(definition().tokens).has(match[1]));
}

function validateCss(css: string, errors: string[]): void {
  if (css.length > definition().limits.css) {
    errors.push(`主题 CSS 超过 ${definition().limits.css} 个字符。`);
    return;
  }
  if (hasUnsafeCssValue(css)) {
    errors.push('主题 CSS 含远程资源、可执行内容或不支持的 at-rule。');
    return;
  }

  const source = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!source) return;
  let cursor = 0;
  let rules = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    if (cursor >= source.length) break;
    const open = source.indexOf('{', cursor);
    const close = open < 0 ? -1 : source.indexOf('}', open + 1);
    if (open < 0 || close < 0 || source.slice(open + 1, close).includes('{')) {
      errors.push('主题 CSS 规则括号不完整或包含嵌套规则。');
      return;
    }
    const selectors = source.slice(cursor, open).split(',').map((selector) => selector.trim());
    const unsafeSelector = selectors.find((selector) => (selector !== '.article-preview' && !selector.startsWith('.article-preview .article-body')) ||
      !/^[\w\s.#:\[\]()='"*+>~,-]+$/.test(selector) || /:root|:host|:global|:has\(/i.test(selector));
    if (unsafeSelector) {
      errors.push(`主题 CSS 选择器必须限定在 .article-preview .article-body 内：${unsafeSelector}`);
      return;
    }
    const declarations = source.slice(open + 1, close).trim();
    for (const declaration of declarations.split(';').map((item) => item.trim()).filter(Boolean)) {
      const colon = declaration.indexOf(':');
      if (colon < 1) {
        errors.push('主题 CSS 含无法识别的声明。');
        return;
      }
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (selectors.includes('.article-preview') && !definition().wrapperProperties.includes('*') && !definition().wrapperProperties.includes(property)) {
        errors.push(`主题 CSS 的文章外层不支持此声明：${property || '未知属性'}。`);
        return;
      }
      if ((!definition().allowUnknownCssProperties && !definition().cssProperties.includes(property)) || !validValue(value)) {
        errors.push(`主题 CSS 声明不受支持或不安全：${property || '未知属性'}。`);
        return;
      }
      if (property === 'display' && definition().allowedDisplayValues.length && !definition().allowedDisplayValues.includes(value)) {
        errors.push('主题 CSS 的 display 仅支持文章排版所需的静态值。');
        return;
      }
    }
    rules += 1;
    cursor = close + 1;
  }
  if (!rules) errors.push('主题 CSS 没有可识别的文章样式规则。');
}

export function validateThemeCss(css: string): string[] {
  const errors: string[] = [];
  validateCss(css, errors);
  if (!errors.length) {
    // Structured reads stay separate from configured authoring/write diagnostics.
    const formatIssues = validateArticleFormatCss(css).filter(issue => articleFormatBlocks(issue.tier) || issue.kind === 'engine');
    if (formatIssues.length) errors.push(articleFormatMessage(formatIssues));
  }
  return errors;
}

// Existing themes and snapshots remain readable. Authoring and publishing
// gates apply current library rules separately.
export function validateThemeFormat(theme: ThemeConfig): string[] {
  const issues = validateArticleFormatCss(theme.css);
  const blocking = issues.filter(issue => articleFormatBlocks(issue.tier) || issue.kind === 'engine');
  return blocking.length ? [articleFormatMessage(blocking)] : [];
}

export function validateThemeConfig(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['主题 JSON 顶层必须是对象。'];
  const theme = value as Partial<ThemeConfig>;
  if (theme.kind !== undefined && theme.kind !== definition().kind) errors.push(`文章主题 kind 必须是 ${definition().kind}。`);
  if (typeof theme.id !== 'string' || theme.id.length > definition().limits.id || !new RegExp(definition().idPattern).test(theme.id)) errors.push('主题 ID 仅支持小写字母、数字和连字符，且不能包含路径。');
  if (typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > definition().limits.name) errors.push(`主题名称不能为空且不能超过 ${definition().limits.name} 个字符。`);
  if (typeof theme.version !== 'string' || !new RegExp(definition().versionPattern).test(theme.version)) errors.push('主题版本须为数字版本号，例如 1.0.0。');
  if (theme.formatVersion !== definition().formatVersion) errors.push(`不支持的主题 formatVersion；当前为 ${definition().formatVersion}。`);
  if (!theme.tokens || typeof theme.tokens !== 'object' || Array.isArray(theme.tokens)) {
    errors.push('主题 tokens 必须是对象。');
  } else {
    const tokens = theme.tokens as Record<string, unknown>;
    for (const key of definition().tokens) if (!(key in tokens)) errors.push(`缺少必需 token：${key}。`);
    for (const [key, token] of Object.entries(tokens)) {
      if (!definition().tokens.includes(key) || !validValue(token)) errors.push(`主题 token 不受支持或不安全：${key}。`);
    }
  }
  if (typeof theme.css !== 'string') errors.push('主题 CSS 必须是文本。');
  else validateCss(theme.css, errors);
  if (theme.nodes !== undefined) {
    if (!theme.nodes || typeof theme.nodes !== 'object' || Array.isArray(theme.nodes)) {
      errors.push('主题 nodes 必须是对象。');
    } else {
      for (const [node, rules] of Object.entries(theme.nodes)) {
        if (!(Object.hasOwn(definition().nodes, node)) || !rules || typeof rules !== 'object' || Array.isArray(rules)) {
          errors.push(`主题节点不受支持：${node}。`);
          continue;
        }
        for (const [property, ruleValue] of Object.entries(rules)) {
          if (!(Object.hasOwn(definition().nodeProperties, property)) || !validValue(ruleValue)) {
            errors.push(`主题节点 ${node} 含不受支持或不安全的规则：${property}。`);
          }
        }
      }
    }
  }
  return errors;
}

export function parseThemeConfigJson(source: string): ThemeConfig {
  let parsed: unknown;
  try {
    if (source.length > definition().limits.json) throw new Error(`文件超过 ${definition().limits.json} 个字符。`);
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`主题 JSON 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
  const errors = validateThemeConfig(parsed);
  if (errors.length) throw new Error(`主题配置校验失败：${errors.join('；')}`);
  return parsed as ThemeConfig;
}
