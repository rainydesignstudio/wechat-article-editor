import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import parseInlineStyle from 'inline-style-parser';
import postcss from 'postcss';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { validateArticleMarkup } from './articleMarkupValidation';
import { getFormatSnapshot } from './article-format/runtime';
import { articleMarkdownPlugins, articleHtmlPlugins } from './article-format/pipeline';
import type { FormatRule } from './article-format/config';
import { inspectSourceStructure } from './article-format/sourceStructure';

type ElementNode = DefaultTreeAdapterMap['element'];
type TreeNode = DefaultTreeAdapterMap['node'];
type MarkdownNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: MarkdownNode[]; position?: { start?: { line?: number; offset?: number }; end?: { offset?: number } } };
export type ArticleFormatTier = 'safe' | 'usable' | 'conditional' | 'lowPriority' | 'danger' | 'notAllowed' | 'unknown' | 'warning' | 'error';
export type ArticleFormatSeverity = 'safe' | 'warning' | 'error';
export type ArticleFormatIssue = { kind: 'element' | 'attribute' | 'style' | 'value' | 'engine'; name: string; source: string; tier: ArticleFormatTier; line?: number; lines?: number[]; message: string; ruleId?: string; reference?: string; domain?: 'standard' | 'product' };
type Sink = { issues: ArticleFormatIssue[]; passed: Set<string> };
type StyleDeclaration = { property: string; value: string; important?: boolean };
export type ArticleStyleContext = { element: string; declarations: ReadonlyMap<string, string> };
const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw);
export function articleFormatSeverity(tier: ArticleFormatTier): ArticleFormatSeverity {
  return ['error', 'danger', 'notAllowed', 'unknown'].includes(tier) ? 'error' : ['warning', 'conditional', 'lowPriority'].includes(tier) ? 'warning' : 'safe';
}
export function articleFormatBlocks(tier: ArticleFormatTier): boolean { return ['error', 'danger', 'notAllowed'].includes(tier); }
export function articleFormatTierLabel(tier: ArticleFormatTier): string {
  return articleFormatSeverity(tier) === 'safe' ? '检查通过' : tier === 'unknown' ? '未完成核对' : articleFormatSeverity(tier) === 'error' ? '需处理' : '建议核对';
}
export function articleFormatTierMessage(tier: ArticleFormatTier): string { return articleFormatTierLabel(tier); }
// An unmentioned HTML/CSS name is not an official permission or prohibition.
export function articleFormatTierOfTag(_tag: string): ArticleFormatTier { return 'unknown'; }
export function articleFormatTierOfAttribute(_attribute: string): ArticleFormatTier { return 'unknown'; }
export function articleFormatTierOfProperty(_property: string): ArticleFormatTier { return 'unknown'; }
export function articleFormatTierOfValue(_property: string, _value: string, _context?: ArticleStyleContext): ArticleFormatTier { return 'unknown'; }
export function articleFormatAllowsCssProperty(property: string, _value?: string): boolean {
  return !getFormatSnapshot().bundle.formatter.output.dropCssProperties.includes(property.trim().toLowerCase());
}
export function articleStyleContext(element: string | undefined, declarations: Iterable<StyleDeclaration>): ArticleStyleContext | undefined {
  if (!element) return undefined;
  const effective = new Map<string, { value: string; important: boolean }>();
  for (const declaration of declarations) {
    const name = declaration.property.toLowerCase().trim(); const important = Boolean(declaration.important || /!\s*important\s*$/i.test(declaration.value));
    if (!effective.get(name)?.important || important) effective.set(name, { value: declaration.value.replace(/!\s*important\s*$/i, '').trim(), important });
  }
  return { element: element.toLowerCase(), declarations: new Map([...effective].map(([key, value]) => [key, value.value])) };
}
export function standardFormatIssue(rule: FormatRule, source: string, line?: number, detail?: string): ArticleFormatIssue {
  const support = getFormatSnapshot().bundle.support.rules.find(item => item.validator === rule.id);
  const origin = support ? getFormatSnapshot().bundle.support.meta.sources[support.source]?.url : undefined;
  return { kind: rule.operator.startsWith('style.') ? 'style' : 'element', name: support?.title ?? rule.id, source, tier: support?.severity ?? 'warning', message: detail ?? support?.description ?? support?.title ?? rule.id, ruleId: rule.id, domain: 'standard', reference: origin ? `${origin}${support?.anchor ? `#${encodeURIComponent(support.anchor)}` : ''}` : undefined, ...(line ? { line } : {}) };
}
function configurationIssue(source: string): ArticleFormatIssue | null {
  const error = getFormatSnapshot().error;
  return error ? { kind: 'engine', name: '资料库格式配置', source, tier: 'unknown', message: error, domain: 'product' } : null;
}
function transparent(value: string): boolean {
  return value.trim().toLowerCase() === 'transparent' || /rgba?\([^)]*[,/]\s*0(?:\.0+)?%?\s*\)$/i.test(value);
}
function checkCss(sink: Sink, property: string, value: string, source: string, line?: number): void {
  if (/(?:expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding)/i.test(value)) sink.issues.push({ kind: 'style', name: property, source, tier: 'error', message: '样式含产品安全边界禁止的可执行内容。', domain: 'product', ...(line ? { line } : {}) });
  const name = property.trim().toLowerCase(); const text = value.replace(/!\s*important\s*$/i, '').trim().toLowerCase();
  for (const rule of getFormatSnapshot().bundle.validator.rules.filter(item => item.enabled && item.stages.includes('authoring') && item.operator.startsWith('style.'))) {
    const matchesProperty = rule.parameters.property === name;
    const violation = rule.operator === 'style.present' ? matchesProperty
      : rule.operator === 'style.values' ? matchesProperty && Array.isArray(rule.parameters.values) && rule.parameters.values.includes(text)
      : rule.operator === 'style.transparent' ? matchesProperty && transparent(text)
      : rule.operator === 'style.important' ? /!\s*important\s*$/i.test(value) : false;
    if (violation) sink.issues.push(standardFormatIssue(rule, source, line));
    else if (matchesProperty) sink.passed.add(`规则 ${rule.id}`);
  }
}
function checkStyleText(sink: Sink, style: string, source: string, line?: number): void {
  try { for (const entry of parseInlineStyle(style).filter(item => item.type === 'declaration')) checkCss(sink, entry.property, entry.value, source, line === undefined ? undefined : line + entry.position.start.line - 1); }
  catch { sink.issues.push({ kind: 'style', name: 'style', source, tier: 'error', message: '内联CSS语法无法解析。', domain: 'product', ...(line ? { line } : {}) }); }
}
function checkElement(sink: Sink, tag: string, attributes: Record<string, string>, source: string, line?: number, _authoringClasses = false, locations?: Map<string, { name: number; value: number }>): void {
  if (attributes.style) checkStyleText(sink, attributes.style, source, locations?.get('style')?.value ?? line);
  if (['script', 'iframe', 'object', 'embed', 'base'].includes(tag.toLowerCase()) || Object.keys(attributes).some(name => /^on/i.test(name))) sink.issues.push({ kind: 'element', name: tag, source, tier: 'error', message: '原稿包含产品安全边界禁止的可执行或嵌入内容。', domain: 'product', ...(line ? { line } : {}) });
}
export function articleFormatPreviewStructure(body: string): HTMLElement {
  const inert = document.implementation.createHTMLDocument('格式检查');
  const root = inert.createElement('section'); root.className = 'article-preview';
  const content = inert.createElement('div'); content.className = 'article-body'; root.append(content); inert.body.append(root);
  const processor = unified().use(remarkParse).use(articleMarkdownPlugins()).use(remarkRehype, { allowDangerousHtml: true }).use(articleHtmlPlugins());
  const tree = processor.runSync(processor.parse(body), { value: body }) as MarkdownNode;
  const append = (node: MarkdownNode, parent: HTMLElement) => {
    if (node.type === 'text') { parent.append(inert.createTextNode(node.value ?? '')); return; }
    if (!node.tagName) { node.children?.forEach(child => append(child, parent)); return; }
    if (['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base'].includes(node.tagName)) return;
    const svg = node.tagName === 'svg' || parent.namespaceURI === 'http://www.w3.org/2000/svg';
    const element = svg ? inert.createElementNS('http://www.w3.org/2000/svg', node.tagName) as unknown as HTMLElement : inert.createElement(node.tagName);
    for (const [name, value] of Object.entries(node.properties ?? {})) {
      const attribute = name === 'className' ? 'class' : name === 'dataSourceLine' ? 'data-source-line' : svg ? name : name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
      if (attribute === 'src') { if (typeof value === 'string') element.setAttribute('data-inspection-src', value); continue; }
      if (attribute.startsWith('on') || ['srcset', 'poster', 'data', 'action', 'formaction', 'srcdoc'].includes(attribute)) continue;
      if (value !== undefined && value !== null && value !== false) element.setAttribute(attribute, Array.isArray(value) ? value.join(' ') : value === true ? '' : String(value));
    }
    node.children?.forEach(child => append(child, element)); parent.append(element);
  };
  append(tree, content); return root;
}

function htmlAttributes(properties: Record<string, unknown>): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    const name = key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : /^(?:on[A-Z]|rowSpan$|colSpan$|srcSet$)/.test(key) ? key.toLowerCase()
      : key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).toLowerCase();
    attributes[name] = Array.isArray(value) ? value.join(' ') : String(value ?? '');
  }
  return attributes;
}

function rawHtmlRanges(root: MarkdownNode): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const visit = (node: MarkdownNode) => {
    if (node.type === 'html' && node.position?.start?.offset !== undefined && node.position.end?.offset !== undefined) {
      ranges.push([node.position.start.offset, node.position.end.offset]);
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return ranges;
}

function rawAttributeLocations(source: string, offset: number, startLine: number): { attributes: Map<string, { name: number; value: number }>; classes: Map<string, number[]> } {
  const attributes = new Map<string, { name: number; value: number }>();
  const classes = new Map<string, number[]>();
  if (source[offset] !== '<') return { attributes, classes };
  let quote = '';
  let end = offset;
  for (; end < source.length; end += 1) {
    const char = source[end];
    if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '>') { end += 1; break; }
  }
  const opening = source.slice(offset, end);
  const lineAt = (index: number) => startLine + (opening.slice(0, index).match(/\n/g)?.length ?? 0);
  let cursor = 1;
  while (cursor < opening.length && !/[\s/>]/.test(opening[cursor])) cursor += 1;
  while (cursor < opening.length) {
    while (/\s/.test(opening[cursor] ?? '')) cursor += 1;
    if (opening[cursor] === '/' || opening[cursor] === '>' || cursor >= opening.length) break;
    const nameStart = cursor;
    while (cursor < opening.length && !/[\s=/>]/.test(opening[cursor])) cursor += 1;
    if (cursor === nameStart) { cursor += 1; continue; }
    const name = opening.slice(nameStart, cursor).toLowerCase();
    while (/\s/.test(opening[cursor] ?? '')) cursor += 1;
    if (opening[cursor] !== '=') {
      attributes.set(name, { name: lineAt(nameStart), value: lineAt(nameStart) });
      continue;
    }
    cursor += 1;
    while (/\s/.test(opening[cursor] ?? '')) cursor += 1;
    const delimiter = opening[cursor] === '"' || opening[cursor] === "'" ? opening[cursor++] : '';
    const valueStart = cursor;
    if (delimiter) {
      while (cursor < opening.length && opening[cursor] !== delimiter) cursor += 1;
    } else {
      while (cursor < opening.length && !/[\s>]/.test(opening[cursor])) cursor += 1;
    }
    const value = opening.slice(valueStart, cursor);
    if (delimiter && opening[cursor] === delimiter) cursor += 1;
    attributes.set(name, { name: lineAt(nameStart), value: lineAt(valueStart) });
    if (name === 'class') for (const token of value.matchAll(/\S+/g)) {
      const lines = classes.get(token[0]) ?? [];
      const line = lineAt(valueStart + (token.index ?? 0));
      if (!lines.includes(line)) lines.push(line);
      classes.set(token[0], lines);
    }
  }
  return { attributes, classes };
}

export function inspectArticleFormatMarkdown(source: string, label = '正文', authoringClasses = false, passed?: Set<string>): { issues: ArticleFormatIssue[]; classes: string[]; classLines: Map<string, number[]> } {
  const invalid = configurationIssue(label); if (invalid) return { issues: [invalid], classes: [], classLines: new Map() };
  let parsed: MarkdownNode;
  try {
    const markdownTree = markdown.parse(source);
    const rawRanges = rawHtmlRanges(markdownTree as MarkdownNode);
    parsed = markdown.runSync(markdownTree) as MarkdownNode;
    const sink: Sink = { issues: [...validateArticleMarkup(source, markdownTree as MarkdownNode, label).map(issue => ({ ...issue, domain: 'product' as const })), ...inspectSourceStructure(source, markdownTree as MarkdownNode, label)], passed: new Set<string>() };
    const classes = new Set<string>();
    const classLines = new Map<string, number[]>();
    const visit = (node: MarkdownNode) => {
      if (node.type === 'element' && node.tagName) {
        const position = node.position?.start;
        const raw = position?.offset !== undefined && rawRanges.some(([start, end]) => position.offset! >= start && position.offset! < end);
        const attributes = raw ? htmlAttributes(node.properties ?? {}) : {};
        const locations = raw && position?.offset !== undefined && position.line !== undefined ? rawAttributeLocations(source, position.offset, position.line) : undefined;
        checkElement(sink, node.tagName, attributes, label, position?.line, authoringClasses, locations?.attributes);
        if (authoringClasses && raw && attributes.class) {
          attributes.class.split(/\s+/).filter(Boolean).forEach(value => {
            classes.add(value);
            const lines = classLines.get(value) ?? [];
            for (const line of locations?.classes.get(value) ?? (position?.line ? [position.line] : [])) {
              if (!lines.includes(line)) lines.push(line);
            }
            classLines.set(value, lines);
          });
        }
      }
      node.children?.forEach(visit);
    };
    visit(parsed);
    if (passed) for (const name of sink.passed) passed.add(name);
    return { issues: sink.issues, classes: [...classes], classLines };
  } catch (error) {
    return { issues: [{ kind: 'engine', name: 'Markdown', source: label, tier: 'unknown', message: `无法检查文章结构：${error instanceof Error ? error.message : String(error)}` }], classes: [], classLines: new Map() };
  }
}

export function validateArticleFormatMarkdown(source: string, label = '正文'): ArticleFormatIssue[] {
  return inspectArticleFormatMarkdown(source, label).issues;
}

export function validateArticleFormatCss(css: string, label = '文章主题 CSS', passed?: Set<string>): ArticleFormatIssue[] {
  const invalid = configurationIssue(label); if (invalid) return [invalid];
  try {
    const sink: Sink = { issues: [], passed: new Set() };
    postcss.parse(css).walkDecls(declaration => checkCss(sink, declaration.prop, `${declaration.value}${declaration.important ? ' !important' : ''}`, label, declaration.source?.start?.line));
    passed?.add('CSS语法'); for (const rule of sink.passed) passed?.add(rule); return sink.issues;
  } catch (error) { return [{ kind: 'style', name: 'CSS', source: label, tier: 'error', message: `CSS无法解析：${error instanceof Error ? error.message : String(error)}`, domain: 'product' }]; }
}
export function validateRenderedArticleCss(root: HTMLElement, css: string, passed?: Set<string>): ArticleFormatIssue[] {
  const invalid = configurationIssue('当前文章'); if (invalid) return [invalid];
  try {
    const used: string[] = [];
    postcss.parse(css).walkRules(rule => {
      try { const selector = rule.selector.replace(/::[\w-]+(?:\([^)]*\))?/g, ''); if (root.matches(selector) || root.querySelector(selector)) used.push(rule.toString()); } catch { /* a non-DOM selector is not certified */ }
    });
    return validateArticleFormatCss(used.join('\n'), '当前文章使用的样式', passed);
  } catch (error) { return [{ kind: 'engine', name: 'CSS', source: '当前文章', tier: 'unknown', message: String(error), domain: 'product' }]; }
}
export function validateArticleFormatHtml(html: string, label = '复制内容', passed?: Set<string>): ArticleFormatIssue[] {
  const invalid = configurationIssue(label); if (invalid) return [invalid];
  const sink: Sink = { issues: [], passed: new Set() };
  const visit = (node: TreeNode) => { if ('tagName' in node) { const el = node as ElementNode; checkElement(sink, el.tagName, Object.fromEntries(el.attrs.map(attr => [attr.name, attr.value])), label); } if ('childNodes' in node) node.childNodes.forEach(visit); };
  parseFragment(html).childNodes.forEach(visit); for (const key of sink.passed) passed?.add(key); return sink.issues;
}

export type ArticleFormatMessagePart = { text: string; emphasis?: boolean };

const SEVERITY_ORDER: ArticleFormatSeverity[] = ['error', 'warning', 'safe'];
const SEVERITY_HEADING: Record<ArticleFormatSeverity, string> = {
  error: '以下内容需处理',
  warning: '以下内容有风险',
  safe: '以下内容已通过',
};

// Findings are stated once per severity rather than once per entry, so a clause reads
// `以下内容需处理 第 27 行：th；第 35 行：figure；…`. The heading is its own part so a UI can set it
// in a heavier weight; `articleFormatMessage` flattens the same parts. Entries are joined with `；`,
// so a trailing stop would read `。；` and is dropped.
export function articleFormatMessageParts(issues: ArticleFormatIssue[], limit = 5): ArticleFormatMessagePart[] {
  // Repeated structural mistakes need each location, even when their descriptions match.
  const unique = issues.filter((item, index) => issues.findIndex(other => other.kind === item.kind && other.name === item.name && other.source === item.source && (!item.source.endsWith('HTML 标签结构') || other.line === item.line)) === index);
  const groups = new Map<ArticleFormatSeverity, ArticleFormatIssue[]>();
  for (const item of unique) {
    const severity = articleFormatSeverity(item.tier);
    groups.set(severity, [...(groups.get(severity) ?? []), item]);
  }
  const parts: ArticleFormatMessagePart[] = [];
  for (const severity of SEVERITY_ORDER) {
    const items = groups.get(severity);
    if (!items?.length) continue;
    const shown = items.slice(0, limit).map(item => `${item.line ? `第 ${item.line} 行：` : ''}${item.name}`);
    parts.push({ text: `${SEVERITY_HEADING[severity]} `, emphasis: true });
    parts.push({ text: `${shown.join('；')}${items.length > limit ? `；另有 ${items.length - limit} 项` : ''}；` });
  }
  const last = parts.at(-1);
  if (last) last.text = `${last.text.slice(0, -1)}。`;
  return parts;
}

export function articleFormatMessage(issues: ArticleFormatIssue[], limit = 5): string {
  return articleFormatMessageParts(issues, limit).map(part => part.text).join('');
}
