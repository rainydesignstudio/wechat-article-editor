import DOMPurify from 'dompurify';
import parseInlineStyle from 'inline-style-parser';
import { defaultSchema } from 'rehype-sanitize';
import { getFormatSnapshot } from './runtime';

type HastNode = {
  type: string;
  value?: unknown;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const FORBID_TAGS = ['base', 'embed', 'form', 'iframe', 'link', 'meta', 'object', 'script', 'style'];
const FORBID_ATTR = ['onerror', 'onload', 'onclick', 'onmouseover', 'srcdoc'];
const SVG_TAGS = ['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'image', 'use', 'animate', 'animateTransform'];
const SVG_ATTRIBUTES = ['viewBox', 'xmlns', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fillOpacity', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'strokeOpacity', 'transform', 'opacity', 'offset', 'stopColor', 'stopOpacity', 'gradientUnits', 'gradientTransform', 'clipPath', 'mask', 'patternUnits', 'patternTransform', 'preserveAspectRatio', 'attributeName', 'from', 'to', 'values', 'dur', 'begin', 'end', 'repeatCount', 'keyTimes', 'calcMode', 'additive', 'type'];
const EXTRA_TAGS = ['article', 'aside', 'caption', 'col', 'colgroup', 'figcaption', 'figure', 'footer', 'header', 'main', 'mark', 'small', 'u'];
type AttributeDefinition = NonNullable<NonNullable<typeof defaultSchema.attributes>>['*'][number];

function allowArbitraryClass(attributes: ReadonlyArray<AttributeDefinition> | undefined): AttributeDefinition[] {
  return [...(attributes ?? []).filter((attribute) => (typeof attribute === 'string' ? attribute : attribute[0]) !== 'className'), 'className'];
}

export const SAFE_REHYPE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...EXTRA_TAGS, ...SVG_TAGS],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style', 'colSpan', 'rowSpan', 'data*', 'leaf', 'nodeleaf', ...SVG_ATTRIBUTES],
    a: allowArbitraryClass(defaultSchema.attributes?.a),
    code: allowArbitraryClass(defaultSchema.attributes?.code),
    h2: allowArbitraryClass(defaultSchema.attributes?.h2),
    li: allowArbitraryClass(defaultSchema.attributes?.li),
    ol: allowArbitraryClass(defaultSchema.attributes?.ol),
    section: allowArbitraryClass(defaultSchema.attributes?.section),
    ul: allowArbitraryClass(defaultSchema.attributes?.ul),
  },
  strip: [...(defaultSchema.strip ?? []), ...FORBID_TAGS],
};

export function sanitizeStyleValue(value: string): string {
  const safe = value
    .replace(/@import/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/-moz-binding\s*:/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/url\s*\(\s*(['"]?)(?!https?:|data:image\/(?:gif|jpe?g|png|webp|svg\+xml);|blob:|[./#])[^)]*\1\s*\)/gi, '')
    .replace(/(?:javascript|vbscript)\s*:/gi, '')
    .replace(/data:(?!image\/(?:gif|jpe?g|png|webp|svg\+xml);)/gi, '');
  const dropped = getFormatSnapshot().bundle.formatter.output.dropCssProperties;
  if (!dropped.some(property => safe.toLowerCase().includes(property))) return safe;
  try {
    return parseInlineStyle(safe)
      .flatMap(entry => entry.type === 'declaration' && !dropped.includes(entry.property.trim().toLowerCase()) ? [`${entry.property}:${entry.value}`] : [])
      .join(';');
  } catch {
    return '';
  }
}

export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    ADD_TAGS: ['animate', 'animateTransform'],
    ADD_ATTR: ['class', 'style', 'rowspan', 'colspan', 'target', 'rel', 'checked', 'disabled', 'data-theme', ...getFormatSnapshot().bundle.formatter.output.preserveAttributes],
    FORBID_TAGS,
    FORBID_ATTR,
  });
}

export function rehypeSafeStyles() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      if (node.tagName === 'animate' || node.tagName === 'animateTransform') {
        const name = String(node.properties?.attributeName ?? '');
        if (!/^(?:opacity|fill|stroke|transform|x|y|cx|cy|r|rx|ry|width|height|stroke-width)$/.test(name)) { node.tagName = 'span'; node.properties = {}; node.children = []; }
      }
      if (node.properties?.style && typeof node.properties.style === 'string') {
        const safe = sanitizeStyleValue(node.properties.style);
        if (safe) node.properties.style = safe;
        else delete node.properties.style;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
