import { getFormatSnapshot } from './article-format/runtime';
import type { ThemeConfig, ThemeNodeKey } from './types';

export type ColorBinding = { key: string; label: string; token: string; kind?: 'color' | 'node' | 'css'; node?: ThemeNodeKey; start?: number; end?: number; value?: string; hidden?: boolean };
export const ARTICLE_COLOR_LABELS: Record<string, string> = {
  'color-article-ink': '正文文字', 'color-article-heading': '标题文字', 'color-article-muted': '辅助文字',
  'color-article-quote-surface': '引用底色', 'color-article-line': '分隔线', 'color-article-accent': '强调色',
  'color-article-link': '代码关键字', 'color-article-tint': '引用背景', 'color-article-code': '代码文字',
  'color-article-code-surface': '代码块背景', 'color-article-code-tint': '行内代码背景',
};
export function getArticleNodeSelectors(): Record<string, string> {
  return Object.fromEntries(Object.entries(getFormatSnapshot().bundle.validator.product.theme.nodes).map(([key, selectors]) => [key, selectors.join(',')]));
}
export const INSPECTION_CLASSES = ['transition-opacity', 'duration-300', 'data-[theme-inspection-dim=true]:opacity-50'];

export function uniqueBindings(bindings: ColorBinding[]): ColorBinding[] {
  return bindings.filter((binding, index) => bindings.findIndex(item => item.key === binding.key) === index);
}

// Keep ancestors opaque, but do not assume every descendant uses its parent's
// paint: an opaque card can cover that background with another token.
export function inspectionDimmedElements<T extends { parentElement: T | null; contains(other: T): boolean }>(elements: T[], hits: T[]): Set<T> {
  if (!hits.length) return new Set(elements.filter(element => !elements.includes(element.parentElement!)));
  const related = (element: T) => hits.some(hit => element.contains(hit));
  return new Set(elements.filter(element => !related(element) && (!element.parentElement || !elements.includes(element.parentElement) || related(element.parentElement))));
}

export function animateInspectionScroll(row: HTMLElement): () => void {
  let container = row.parentElement;
  const view = row.ownerDocument.defaultView;
  if (!view) return () => {};
  while (container && !(container.scrollHeight > container.clientHeight && /auto|scroll/.test(view.getComputedStyle(container).overflowY))) container = container.parentElement;
  if (!container) return () => {};
  const start = container.scrollTop;
  const bounds = container.getBoundingClientRect(), target = row.getBoundingClientRect();
  const end = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, start + target.top - bounds.top - (container.clientHeight - target.height) / 2));
  const began = view.performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const progress = Math.min(1, (now - began) / 300);
    container!.scrollTop = start + (end - start) * (1 - (1 - progress) ** 3);
    if (progress < 1) frame = view.requestAnimationFrame(tick);
  };
  frame = view.requestAnimationFrame(tick);
  return () => view.cancelAnimationFrame(frame);
}

const TRACE_PROPERTIES = ['text', 'background', 'image', 'border-top', 'border-right', 'border-bottom', 'border-left', 'decoration', 'accent'] as const;
const trace = (property: string) => `--theme-inspection-${property}`;
function affectedProperties(property: string): string[] {
  if (property === 'color') return ['text'];
  if (property === 'background') return ['background', 'image'];
  if (property === 'background-color') return ['background'];
  if (property === 'background-image') return ['image'];
  if (property === 'border' || property === 'border-color') return ['border-top', 'border-right', 'border-bottom', 'border-left'];
  const border = property.match(/^(border-(?:top|right|bottom|left))(?:-color)?$/);
  if (border) return [border[1]];
  if (property === 'text-decoration' || property === 'text-decoration-color') return ['decoration'];
  if (property === 'accent-color') return ['accent'];
  return [];
}

function colorAlpha(value: string): number {
  if (value === 'transparent') return 0;
  const alpha = value.match(/\/\s*([\d.]+)(%)?\s*\)$/) ?? value.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)(%)?\)$/);
  return alpha ? Number(alpha[1]) / (alpha[2] ? 100 : 1) : 1;
}

function authoredColor(style: CSSStyleDeclaration, property: string, value: string, target: string): string {
  // CSSOM supplies implicit currentColor for static border/decoration shorthands.
  // Pending var() shorthands have empty longhands: retain their authored tokens.
  if (target !== 'text' && (/\bcurrentcolor\b/i.test(value) || /^currentcolor$/i.test(style.getPropertyValue(target === 'decoration' ? 'text-decoration-color' : `${target}-color`)))) return 'currentcolor';
  return value;
}

function colorDeclarations(style: CSSStyleDeclaration): Array<{ property: string; value: string }> {
  // CSSOM enumerates empty longhands for a shorthand with pending var() substitution.
  // Its serialized authored declarations retain the actual shorthand and token.
  return [...style.cssText.matchAll(/([a-z-]+)\s*:\s*([^;]+);?/gi)]
    .map(match => ({ property: match[1], value: match[2].trim() }))
    .filter(entry => affectedProperties(entry.property).length > 0);
}

// The browser performs specificity, !important, source-order and inheritance
// for these private provenance properties. Actual article colors are untouched.
export function createArticleColorInspection(root: HTMLElement, theme: ThemeConfig, css: string, inlineSources?: HTMLElement[]) {
  const doc = root.ownerDocument;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const rules = Array.from(sheet.cssRules).filter((rule): rule is CSSStyleRule => 'selectorText' in rule);
  const bindings = new Map<string, ColorBinding[]>();
  const inlineSourcesByValue = new Map<string, string>();
  const nodes = Object.entries(theme.nodes ?? {}).filter(([, values]) => Object.keys(values).length) as Array<[ThemeNodeKey, Record<string, string>]>;
  const scope = rules[0]?.selectorText.replace(/\s+\.article-preview.*$/, '') ?? '';
  let counter = 0;
  const authored = theme.css.replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length));
  const sourceRules = [...authored.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const compact = (value: string) => value.replace(/\s+/g, ' ').trim();
  const declarations = (selector: string, property: string, value: string, node?: ThemeNodeKey) => {
    if (!value.trim()) return 'none';
    if (/^(?:inherit|unset)$/i.test(value)) return 'inherit';
    if (/^currentcolor$/i.test(value)) return property === 'color' ? 'inherit' : `var(${trace('text')})`;
    if (/^(?:transparent|none|initial|0)$/i.test(value)) return 'none';
    const inlineKey = selector ? null : `${property}:${value}`;
    const cached = inlineKey ? inlineSourcesByValue.get(inlineKey) : undefined;
    if (cached) return cached;
    const tokens = [...value.matchAll(/var\(\s*--(color-article-[a-z-]+)/g)].map(match => match[1]);
    const entries: ColorBinding[] = tokens.map(token => ({ key: token, label: ARTICLE_COLOR_LABELS[token] ?? token, token: `--${token}`, kind: 'color', value }));
    if (node) entries.unshift({ key: `node:${node}`, label: `${node} · 节点文字色`, token: `nodes.${node}.color`, kind: 'node', node, value });
    if (!entries.length) {
      const normalizedSelector = compact(selector.replaceAll(`${scope} `, ''));
      const candidates = sourceRules.filter(match => compact(match[1]).split(/\s*,\s*/).join(', ') === normalizedSelector.split(/\s*,\s*/).join(', ')).flatMap(rule =>
        [...rule[2].matchAll(/([a-z-]+)\s*:\s*([^;]+);?/gi)].filter(match => match[1] === property).map(match => ({
          start: rule.index! + rule[0].indexOf('{') + 1 + match.index!, length: match[0].length,
          value: compact(match[2].replace(/\s*!important\s*$/i, '')),
        })));
      const original = candidates.findLast(candidate => candidate.value === compact(value)) ?? candidates.at(-1);
      const start = original?.start;
      entries.push({ key: `css:${start ?? 'generated'}:${property}`, label: '固定色值', token: start === undefined ? '主题生成样式' : `CSS · 第 ${theme.css.slice(0, start).split('\n').length} 行`, kind: 'css', start, end: original ? original.start + original.length : undefined, value });
    }
    const id = `source-${counter++}`;
    bindings.set(id, uniqueBindings(entries));
    if (inlineKey) inlineSourcesByValue.set(inlineKey, id);
    return id;
  };
  const generated = rules.map((rule, index) => {
    const nodeEntry = index >= rules.length - nodes.length ? nodes[index - (rules.length - nodes.length)] : undefined;
    const result: string[] = [];
    for (const { property, value } of colorDeclarations(rule.style)) {
      const targets = affectedProperties(property);
      const sources = new Map<string, string>();
      for (const target of targets) {
        const color = authoredColor(rule.style, property, value, target);
        let provenance = sources.get(color);
        if (!provenance) { provenance = declarations(rule.selectorText, property, color, property === 'color' ? nodeEntry?.[0] : undefined); sources.set(color, provenance); }
        result.push(`${trace(target)}:${provenance}${rule.style.getPropertyPriority(property) ? ' !important' : ''};`);
      }
    }
    return result.length ? `${rule.selectorText}{${result.join('')}}` : '';
  }).join('\n');
  const style = doc.createElement('style');
  style.dataset.themeInspectionTrace = 'true';
  style.textContent = `${scope} :where(.article-preview,.article-preview *){${TRACE_PROPERTIES.filter(key => key !== 'text').map(key => `${trace(key)}:none;`).join('')}}\n${generated}`;
  root.parentElement!.append(style);
  const elements = [root, ...root.querySelectorAll<HTMLElement>('*')];
  const authoredInline = new Map(elements.map((element, index) => [element, inlineSources?.[index]?.style ?? element.style]));
  const sourceFor = (element: HTMLElement, property: string): string => {
    const source = doc.defaultView!.getComputedStyle(element).getPropertyValue(trace(property)).trim();
    let cursor: HTMLElement | null = element;
    while (cursor && root.contains(cursor)) {
      const ownStyle = authoredInline.get(cursor) ?? cursor.style;
      const inline = colorDeclarations(ownStyle).findLast(entry => affectedProperties(entry.property).includes(property));
      if (inline) {
        const value = authoredColor(ownStyle, inline.property, inline.value, property);
        if (/^(?:inherit|unset|currentcolor)$/i.test(value)) {
          if (property !== 'text' && /^currentcolor$/i.test(value)) return sourceFor(cursor, 'text');
          if (cursor.parentElement && root.contains(cursor.parentElement)) return sourceFor(cursor.parentElement, property);
        } else return declarations('', inline.property, value);
      }
      const parent: HTMLElement | null = cursor.parentElement;
      if (property !== 'text' || !parent || !root.contains(parent) || doc.defaultView!.getComputedStyle(parent).getPropertyValue(trace(property)).trim() !== source) break;
      cursor = parent;
    }
    return source;
  };
  const read = (element: HTMLElement): ColorBinding[] => {
    const computed = doc.defaultView!.getComputedStyle(element);
    const output: ColorBinding[] = [];
    const append = (source: string) => output.push(...(bindings.get(source) ?? []));
    const ownText = Array.from(element.childNodes).some(node => node.nodeType === 3 && Boolean(node.textContent?.trim())) || element.matches('input,textarea,select,svg,path');
    for (const property of TRACE_PROPERTIES) {
      if (property === 'background' || property === 'image') continue;
      if (property === 'text' && !ownText) continue;
      if (property.startsWith('border-') && (parseFloat(computed.getPropertyValue(`${property}-width`)) === 0 || computed.getPropertyValue(`${property}-style`) === 'none')) continue;
      if (property === 'decoration' && computed.textDecorationLine === 'none') continue;
      if (property === 'accent' && !element.matches('input[type=checkbox]:checked,input[type=radio]:checked,input[type=range],progress')) continue;
      append(sourceFor(element, property));
    }
    // An opaque child covers ancestor paint. Transparent/partial backgrounds
    // retain the exposed ancestor's contribution, including background images.
    for (let painter: HTMLElement | null = element; painter && root.contains(painter); painter = painter.parentElement) {
      const paint = doc.defaultView!.getComputedStyle(painter);
      const source = sourceFor(painter, 'background');
      const alpha = colorAlpha(paint.backgroundColor ?? paint.getPropertyValue('background-color'));
      if (alpha > 0) append(source);
      if (paint.backgroundImage && paint.backgroundImage !== 'none') append(sourceFor(painter, 'image'));
      if (alpha === 1 && source && source !== 'none') break;
    }
    for (const [node, selector] of Object.entries(getArticleNodeSelectors())) {
      if (element.matches(selector)) output.push({ key: `node:${node}`, label: '', token: '', hidden: true });
    }
    return uniqueBindings(output);
  };
  return { read, dispose: () => style.remove() };
}
