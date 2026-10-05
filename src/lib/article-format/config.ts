import supportDefaults from './defaults/format-support.json' with { type: 'json' };
import validatorDefaults from './defaults/validator.json' with { type: 'json' };
import formatterDefaults from './defaults/formatter.json' with { type: 'json' };
import { VALIDATOR_CAPABILITIES, FORMATTER_CAPABILITIES, SOURCE_STRUCTURE_SELECTOR, record, shape, text, bool, number, strings, array, mapping, property, selector, choice, fail, type Guard } from './contracts';

export type RuleParameters = Record<string, unknown>;
export type FormatRule = { id: string; operator: string; enabled: boolean; stages: string[]; parameters: RuleParameters };
export type SupportRule = { id: string; section: string; title: string; severity: 'warning' | 'error'; source: string; validator: string; description?: string; anchor?: string };
export type FormatSupport = {
  schemaVersion: number;
  meta: { id: string; name: string; sources: Record<string, { url: string; version?: string; commit?: string }> };
  rules: SupportRule[];
  manualReview: { id: string; section: string; title: string; selector: string; description?: string; anchor?: string; source: string }[];
};
export type ProductThemeDefinition = {
  tokens: string[]; cssProperties: string[]; nodes: Record<string, string[]>;
  nodeProperties: Record<string, string>; wrapperProperties: string[];
  allowUnknownCssProperties: boolean; allowedDisplayValues: string[];
  limits: { id: number; name: number; value: number; css: number; json: number };
  formatVersion: number; kind: string; idPattern: string; versionPattern: string; valuePattern: string;
};
export type FormatValidator = { schemaVersion: number; meta: { id: string }; product: { theme: ProductThemeDefinition }; rules: FormatRule[] };
export type FormatFormatter = {
  schemaVersion: number; meta: { id: string };
  markdown: { softBreaks: 'space' | 'line-break'; preserveExtraBlankLines: boolean; betweenBlocks: number; atEdges: number };
  preview: {
    light: { background: string }; dark: { background: string; transform: string; options: Record<string, unknown> };
    fontFamily: string; color: string; stripThemeBackground: boolean;
  };
  output: {
    wrapperTag: string; dropCssProperties: string[]; inlineProperties: string[]; dimensionProperties: string[];
    preserveAutoDimensions: boolean; preserveAttributes: string[]; removeClasses: boolean;
    stripRootBackground: boolean; colorEncoding: 'rgb' | 'preserve';
    plainText: { maxConsecutiveNewlines: number; trim: boolean };
    visual: { width: number; pngBackground: string; pdfBackground: string; maxCanvasSide: number; pdfMargin: number };
  };
  css: { utilityPropertyAliases: Record<string, string> }; codeHighlight: { enabled: boolean; styles: { selectors: string[]; declarations: Record<string, string> }[] };
  codeWhitespace: { enabled: boolean; tabSize: number };
};
export type FormatBundle = { support: FormatSupport; validator: FormatValidator; formatter: FormatFormatter };

// A raw formatter is editable JSON; the resolved policy is an immutable engine input.
export type FormatterStep = { id: string; operator: string; enabled: boolean; parameters: RuleParameters };
export type RawFormatter = { schemaVersion: number; meta: { id: string }; steps: FormatterStep[] };
export type RawFormatBundle = { support: FormatSupport; validator: FormatValidator; formatter: RawFormatter };
export const DEFAULT_FORMAT_BUNDLE = { support: supportDefaults, validator: validatorDefaults, formatter: formatterDefaults } as unknown as RawFormatBundle;
export const FORMAT_OPERATORS = new Set(Object.keys(VALIDATOR_CAPABILITIES));

const identifier: Guard = (value, path) => { text(value, path); if (!/^[a-z0-9][a-z0-9._-]*$/i.test(String(value))) fail(path, '无效ID'); };
const pattern: Guard = (value, path) => { text(value, path); if (String(value).length > 512) fail(path, '正则过长'); try { new RegExp(String(value), 'u'); } catch { fail(path, '无效正则'); } };
const sourceGuard = shape({ url: text }, { version: text, commit: text });
const themeGuard = shape({
  tokens: strings, cssProperties: array(property), nodes: mapping(array(selector, 1), identifier),
  nodeProperties: mapping(property, identifier), wrapperProperties: strings, allowUnknownCssProperties: bool,
  allowedDisplayValues: strings, limits: shape({ id: number(1, 10000, true), name: number(1, 10000, true), value: number(1, 100000, true), css: number(1, 10000000, true), json: number(1, 10000000, true) }),
  formatVersion: number(1, 1, true), kind: choice('article-theme'), idPattern: pattern, versionPattern: pattern, valuePattern: pattern,
});
export function validateFormatBundle(input: unknown): RawFormatBundle {
  shape({ support: shape({ schemaVersion: number(1, 1, true), meta: shape({ id: identifier, name: text, sources: mapping(sourceGuard, identifier) }),
    rules: array(shape({ id: identifier, section: text, title: text, severity: choice('warning', 'error'), source: identifier, validator: identifier }, { description: text, anchor: text })),
    manualReview: array(shape({ id: identifier, section: text, title: text, selector, source: identifier }, { description: text, anchor: text })),
  }), validator: shape({ schemaVersion: number(1, 1, true), meta: shape({ id: identifier }), product: shape({ theme: themeGuard }),
    rules: array(shape({ id: identifier, operator: text, enabled: bool, stages: array(choice('authoring', 'rendered'), 1), parameters: (value, path) => { record(value, path); } })),
  }), formatter: shape({ schemaVersion: number(1, 1, true), meta: shape({ id: identifier }), steps: array(shape({ id: identifier, operator: text, enabled: bool, parameters: (value, path) => { record(value, path); } })) }),
  })(input, '格式三件套');
  const bundle = input as RawFormatBundle;
  if (new Set([bundle.support.meta.id, bundle.validator.meta.id, bundle.formatter.meta.id]).size !== 1) fail('meta.id', '三份配置不一致，不能混配');
  const unique = (values: string[], path: string) => { if (new Set(values).size !== values.length) fail(path, 'ID或值重复'); };
  unique([...bundle.support.rules, ...bundle.support.manualReview].map(rule => rule.id), 'format-support规则ID');
  unique(bundle.support.rules.map(rule => rule.validator), 'format-support校验引用');
  unique(bundle.validator.rules.map(rule => rule.id), 'validator规则ID');
  unique(bundle.formatter.steps.map(step => step.id), 'formatter步骤ID');
  for (const rule of bundle.support.rules) {
    if (!Object.hasOwn(bundle.support.meta.sources, rule.source)) fail(rule.id, '规范来源不存在');
    if (!bundle.validator.rules.some(item => item.id === rule.validator)) fail(rule.id, '校验引用不存在');
  }
  for (const rule of bundle.support.manualReview) if (!Object.hasOwn(bundle.support.meta.sources, rule.source)) fail(rule.id, '人工核对项来源不存在');
  for (const rule of bundle.validator.rules) {
    if (!bundle.support.rules.some(item => item.validator === rule.id)) fail(rule.id, '校验未对应规范条目');
    if (!Object.hasOwn(VALIDATOR_CAPABILITIES, rule.operator)) fail(rule.id, `未知校验能力${rule.operator}`);
    const contract = VALIDATOR_CAPABILITIES[rule.operator];
    contract.parameters(rule.parameters, `validator.${rule.id}.parameters`);
    unique(rule.stages, `${rule.id}.stages`);
    if (['dom.leaf-content', 'dom.nodeleaf-content'].includes(rule.operator) && rule.stages.includes('authoring') && !SOURCE_STRUCTURE_SELECTOR.test(String(rule.parameters.selector))) fail(rule.id, '源码结构检查仅支持标签或标签[属性]选择器，复杂选择器需用rendered阶段');
    if (rule.stages.some(stage => !contract.stages.includes(stage))) fail(rule.id, '能力不支持指定阶段');
    if (rule.operator.startsWith('style.') && rule.parameters.selector && rule.stages.includes('authoring')) fail(rule.id, '选择器限定需在rendered阶段使用');
  }
  const used = new Set<string>();
  for (const step of bundle.formatter.steps) {
    if (!Object.hasOwn(FORMATTER_CAPABILITIES, step.operator)) fail(step.id, `未知格式化能力${step.operator}`);
    const contract = FORMATTER_CAPABILITIES[step.operator];
    contract.parameters(step.parameters, `formatter.${step.id}.parameters`);
    if (step.enabled && used.has(step.operator) && !contract.multiple) fail(step.id, '同一能力有多个启用步骤，会产生冲突');
    if (step.enabled) used.add(step.operator);
  }
  return bundle;
}

export function compileFormatBundle(input: RawFormatBundle): FormatBundle {
  const raw = validateFormatBundle(input);
  // Neutral engine behavior is used when a capability is disabled. These are not platform rules.
  const formatter: FormatFormatter = {
    schemaVersion: raw.formatter.schemaVersion, meta: raw.formatter.meta,
    markdown: { softBreaks: 'space', preserveExtraBlankLines: false, betweenBlocks: 2, atEdges: 1 },
    preview: { light: { background: 'transparent' }, dark: { background: 'transparent', transform: 'preserve', options: {} }, fontFamily: 'inherit', color: 'inherit', stripThemeBackground: false },
    output: { wrapperTag: 'section', dropCssProperties: [], inlineProperties: [], dimensionProperties: [], preserveAutoDimensions: true, preserveAttributes: [], removeClasses: false, stripRootBackground: false, colorEncoding: 'preserve', plainText: { maxConsecutiveNewlines: 100, trim: false }, visual: { width: 750, pngBackground: 'transparent', pdfBackground: '#ffffff', maxCanvasSide: 16000, pdfMargin: 36 } },
    css: { utilityPropertyAliases: {} }, codeHighlight: { enabled: false, styles: [] }, codeWhitespace: { enabled: false, tabSize: 4 },
  };
  for (const step of raw.formatter.steps) {
    if (!step.enabled) continue;
    const p = step.parameters;
    switch (step.operator) {
      case 'markdown.soft-breaks': formatter.markdown.softBreaks = p.mode as 'space' | 'line-break'; break;
      case 'markdown.blank-lines': Object.assign(formatter.markdown, { preserveExtraBlankLines: p.preserve, betweenBlocks: p.betweenBlocks, atEdges: p.atEdges }); break;
      case 'markdown.code-highlight': Object.assign(formatter.codeHighlight, { enabled: true, styles: p.styles }); break;
      case 'markdown.code-whitespace': Object.assign(formatter.codeWhitespace, { enabled: true, tabSize: p.tabSize }); break;
      case 'preview.surface': Object.assign(formatter.preview, { light: { background: p.lightBackground }, fontFamily: p.fontFamily, color: p.color, stripThemeBackground: p.stripThemeBackground }); formatter.preview.dark.background = p.darkBackground as string; break;
      case 'preview.dark-mode': Object.assign(formatter.preview.dark, p); break;
      case 'css.drop-properties': formatter.output.dropCssProperties.push(...p.properties as string[]); break;
      case 'css.utility-aliases': formatter.css.utilityPropertyAliases = p.aliases as Record<string, string>; break;
      case 'output.css': case 'output.html': Object.assign(formatter.output, p); break;
      case 'output.text': Object.assign(formatter.output.plainText, p); break;
      case 'output.visual': Object.assign(formatter.output.visual, p); break;
      default: fail(step.id, '能力没有执行实现');
    }
  }
  formatter.output.dropCssProperties = [...new Set(formatter.output.dropCssProperties)];
  return { support: raw.support, validator: raw.validator, formatter };
}

export function canonicalFormatJson(value: unknown): string {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize)
    : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, normalize(val)])) : item;
  return JSON.stringify(normalize(value));
}
export function formatFingerprint(value: unknown): string {
  const text = canonicalFormatJson(value); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function freezeFormatBundle<T>(bundle: T): T {
  const freeze = (value: unknown): void => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  const copy = JSON.parse(JSON.stringify(bundle)) as T; freeze(copy); return copy;
}
