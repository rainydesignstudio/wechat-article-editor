// Capability contracts describe engine inputs. Platform decisions belong to library JSON.
export type Guard = (value: unknown, path: string) => void;
export const record = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}必须是对象。`);
  return value as Record<string, unknown>;
};
export const fail = (path: string, detail: string): never => { throw new Error(`${path}：${detail}。`); };
export const text: Guard = (value, path) => { if (typeof value !== 'string' || !value.trim()) fail(path, '必须是非空字符串'); };
export const bool: Guard = (value, path) => { if (typeof value !== 'boolean') fail(path, '必须是布尔值'); };
export const number = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER, integer = false): Guard => (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || integer && !Number.isInteger(value)) fail(path, `数值需在${minimum}至${maximum}之间${integer ? '且为整数' : ''}`);
};
export const choice = (...values: string[]): Guard => (value, path) => { if (!values.includes(String(value))) fail(path, `仅支持${values.join('／')}`); };
export const array = (guard: Guard, minimum = 0): Guard => (value, path) => {
  if (!Array.isArray(value) || value.length < minimum) fail(path, '数组缺失或长度不足');
  (value as unknown[]).forEach((item, index) => guard(item, `${path}[${index}]`));
};
export const strings = array(text);
export const mapping = (guard: Guard, keyGuard: Guard = text): Guard => (value, path) => {
  Object.entries(record(value, path)).forEach(([key, item]) => { keyGuard(key, `${path}键名`); guard(item, `${path}.${key}`); });
};
export const shape = (required: Record<string, Guard>, optional: Record<string, Guard> = {}): Guard => (value, path) => {
  const object = record(value, path);
  for (const name of Object.keys(object)) if (!Object.hasOwn(required, name) && !Object.hasOwn(optional, name)) fail(`${path}.${name}`, '未知字段');
  for (const [name, guard] of Object.entries(required)) { if (!Object.hasOwn(object, name)) fail(`${path}.${name}`, '缺少必需字段'); guard(object[name], `${path}.${name}`); }
  for (const [name, guard] of Object.entries(optional)) if (Object.hasOwn(object, name)) guard(object[name], `${path}.${name}`);
};
export const SOURCE_STRUCTURE_SELECTOR = /^([a-z][a-z0-9-]*)(?:\[([a-z][a-z0-9-]*)\])?$/;
export const property: Guard = (value, path) => { text(value, path); if (!/^(?:--|-)?[a-z][a-z0-9-]*$/.test(String(value))) fail(path, '无效CSS属性'); };
export const attribute: Guard = (value, path) => { text(value, path); if (!/^[a-z][a-z0-9-]*$/.test(String(value)) || /^on/i.test(String(value)) || ['srcdoc', 'style', 'class'].includes(String(value))) fail(path, '不可保留此属性'); };
export const cssValue: Guard = (value, path) => { text(value, path); if (/[;{}<>\\]|url\s*\(|expression\s*\(|javascript:/i.test(String(value))) fail(path, '不是安全CSS值'); };
export const selector: Guard = (value, path) => { text(value, path); if (typeof document !== 'undefined') { try { document.createDocumentFragment().querySelector(String(value)); } catch { fail(path, '选择器语法无效'); } } if (/[{}<]|@/.test(String(value))) fail(path, '无效选择器'); };
export const tag: Guard = (value, path) => { text(value, path); if (!/^[a-z][a-z0-9-]*$/.test(String(value)) || ['script', 'style', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'area', 'br', 'col', 'hr', 'img', 'input', 'param', 'source', 'track', 'wbr', 'svg', 'body', 'html'].includes(String(value))) fail(path, '无效或不安全的容器标签'); };
export const darkOptions = shape({}, {
  mode: choice('dark'), defaultDarkTextColor: cssValue, needJudgeFirstPage: bool, noEmit: bool,
  whitelist: shape({}, { attribute: array(attribute), tagName: strings }),
});

export const VALIDATOR_CAPABILITIES: Record<string, { stages: string[]; parameters: Guard }> = {
  'style.present': { stages: ['authoring', 'rendered'], parameters: shape({ property }, { selector }) },
  'style.values': { stages: ['authoring', 'rendered'], parameters: shape({ property, values: strings }, { selector }) },
  'style.transparent': { stages: ['authoring', 'rendered'], parameters: shape({ property }, { selector }) },
  'style.important': { stages: ['authoring', 'rendered'], parameters: shape({}, { selector }) },
  'dom.opacity-overlay': { stages: ['rendered'], parameters: shape({ property, value: number(0, 1), overlaySelector: selector }) },
  'dom.text-overlap': { stages: ['rendered'], parameters: shape({ property, singleLineExempt: bool, imageOnlyExempt: bool, sameLineOverlap: number(0, 1), inkHeightFactor: number(0, 1) }) },
  'dom.responsive-width': { stages: ['rendered'], parameters: shape({ widths: array(number(1, 10000, true), 2), ignoreAttribute: attribute, widthDifference: number(), ratioDifference: number(0, 1), overflowTolerance: number(), imageLoadTimeoutMs: number(1, 10000, true), responsiveFillTolerance: number(0, 1), constrainMaxWidth: bool, excludeCenteredOverflow: bool, candidateSelector: selector, paragraphSelector: selector, dimensionProperty: property, ignoredWidthValues: strings, exemptElements: strings }) },
  'dom.height-overflow': { stages: ['rendered'], parameters: shape({ property, zero: number(), svgExempt: bool, imageOnlyExempt: bool, scrollExempt: bool, ignoreSelector: selector }) },
  'dom.animation-begin': { stages: ['rendered'], parameters: shape({ selector, touch: text, click: text }) },
  'dom.pre-text': { stages: ['rendered'], parameters: shape({ selector, codeExempt: bool }) },
  'dom.redundant-nesting': { stages: ['rendered'], parameters: shape({ limit: number(1, 1000, true), mediaExempt: strings }) },
  'dom.leaf-content': { stages: ['authoring', 'rendered'], parameters: shape({ selector, blockElements: strings }) },
  'dom.nodeleaf-content': { stages: ['authoring', 'rendered'], parameters: shape({ selector, allowedElements: strings, disallowedElements: strings, unknownComponents: choice('review', 'violation') }) },
  'official.dark-contrast': { stages: ['rendered'], parameters: shape({ minimum: number(1, 21), ignoreAttribute: attribute, ignoreValue: text }) },
  'official.dark-gradient': { stages: ['rendered'], parameters: shape({ ignoreAttribute: attribute, ignoreValue: text }) },
};

export const FORMATTER_CAPABILITIES: Record<string, { phase: string; multiple?: boolean; parameters: Guard }> = {
  'markdown.soft-breaks': { phase: 'markdown', parameters: shape({ mode: choice('space', 'line-break') }) },
  'markdown.blank-lines': { phase: 'markdown', parameters: shape({ preserve: bool, betweenBlocks: number(1, 100, true), atEdges: number(1, 100, true) }) },
  'markdown.code-highlight': { phase: 'markdown', parameters: shape({ styles: array(shape({ selectors: array(selector, 1), declarations: mapping(cssValue, property) })) }) },
  'markdown.code-whitespace': { phase: 'markdown', parameters: shape({ tabSize: number(1, 16, true) }) },
  'preview.surface': { phase: 'preview', parameters: shape({ lightBackground: cssValue, darkBackground: cssValue, fontFamily: cssValue, color: cssValue, stripThemeBackground: bool }) },
  'preview.dark-mode': { phase: 'preview', parameters: shape({ transform: choice('preserve', 'mp-darkmode'), options: darkOptions }) },
  'css.drop-properties': { phase: 'css', multiple: true, parameters: shape({ properties: array(property) }) },
  'css.utility-aliases': { phase: 'css', parameters: shape({ aliases: mapping(property, property) }) },
  'output.css': { phase: 'output', parameters: shape({ inlineProperties: array(property), dimensionProperties: array(property), preserveAutoDimensions: bool, colorEncoding: choice('rgb', 'preserve') }) },
  'output.html': { phase: 'output', parameters: shape({ wrapperTag: tag, preserveAttributes: array(attribute), removeClasses: bool, stripRootBackground: bool }) },
  'output.text': { phase: 'output', parameters: shape({ maxConsecutiveNewlines: number(1, 100, true), trim: bool }) },
  'output.visual': { phase: 'output', parameters: shape({ width: number(1, 10000, true), pngBackground: cssValue, pdfBackground: cssValue, maxCanvasSide: number(1, 32767, true), pdfMargin: number() }) },
};
