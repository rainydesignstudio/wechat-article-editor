export const SYSTEM_UI_FONT = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
export const SYSTEM_SERIF_FONT = '"Songti SC", SimSun, "Noto Serif CJK SC", "Source Han Serif SC", serif';
export const SYSTEM_CODE_FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

export const OPEN_FONT_ASSETS = [
  { family: 'Sen Local', file: 'sen-variable.ttf', license: 'sen-OFL.txt', weight: '400 800' },
  { family: 'Noto Sans SC Local', file: 'noto-sans-sc-variable.ttf', license: 'noto-sans-sc-OFL.txt', weight: '100 900' },
  { family: 'Roboto Mono Local', file: 'roboto-mono-variable.ttf', license: 'roboto-mono-OFL.txt', weight: '100 700' },
] as const;

const CATALOG = [
  { family: 'PingFang SC', label: '系统无衬线 · 苹方 / 微软雅黑', stack: SYSTEM_UI_FONT, code: false },
  { family: 'Songti SC', label: '系统宋体 · 宋体 / 中易宋体', stack: SYSTEM_SERIF_FONT, code: false },
  { family: 'SFMono-Regular', label: '系统代码字体 · SF Mono / Consolas', stack: SYSTEM_CODE_FONT, code: true },
  { family: 'Sen Local', label: 'Sen · 本地开源', stack: '"Sen Local", "Noto Sans SC Local", "PingFang SC", "Microsoft YaHei", sans-serif', code: false },
  { family: 'Noto Sans SC Local', label: 'Noto Sans SC · 本地开源', stack: '"Noto Sans SC Local", "PingFang SC", "Microsoft YaHei", sans-serif', code: false },
  { family: 'Roboto Mono Local', label: 'Roboto Mono · 本地开源代码字体', stack: '"Roboto Mono Local", "Noto Sans SC Local", monospace', code: true },
];

export function fontFamily(stack: string): string { return stack.split(',')[0].trim().replace(/^['"]|['"]$/g, ''); }
function catalogFont(stack: string) {
  const family = fontFamily(stack).toLowerCase();
  if (['system-ui', 'ui-sans-serif', 'sans-serif', 'microsoft yahei'].includes(family)) return CATALOG[0];
  if (['serif', 'simsun', 'ui-serif'].includes(family)) return CATALOG[1];
  if (['monospace', 'ui-monospace', 'consolas'].includes(family)) return CATALOG[2];
  return CATALOG.find(font => font.family.toLowerCase() === family);
}
export function canonicalFontStack(stack: string): string { return catalogFont(stack)?.stack ?? stack; }
export function codeFontStack(stack: string): string {
  const font = catalogFont(stack);
  return font?.code ? canonicalFontStack(stack) : !font && /\bmonospace\b/.test(stack) ? stack : SYSTEM_CODE_FONT;
}

// One option per family; fallback stacks are implementation details, not duplicate choices.
export function fontOptions(stacks: readonly string[], codeOnly = false) {
  const options = new Map(CATALOG.filter(font => !codeOnly || font.code).map(font => [font.family.toLowerCase(), { label: font.label, value: font.stack }]));
  for (const stack of stacks) {
    if (catalogFont(stack) || (codeOnly && !/\bmonospace\b/.test(stack))) continue;
    const family = fontFamily(stack);
    if (!options.has(family.toLowerCase())) options.set(family.toLowerCase(), { label: family, value: stack });
  }
  return [...options.values()];
}
