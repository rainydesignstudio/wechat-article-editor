import { compile } from 'tailwindcss';
import postcss from 'postcss';
import { getFormatSnapshot, assertFormatReady, assertCurrentFormat } from './article-format/runtime';
import { extractMarkdownClassCandidates } from './render';
import { BASIC_THEME, themeToCss } from './themes';
import { validateThemeConfig } from './themeValidation';
import { validateArticleFormatCss, type ArticleFormatIssue } from './articleFormat';
import type { ThemeConfig } from './types';
import { TAILWIND_THEME_CSS, TAILWIND_UTILITIES_CSS } from './tailwind-assets';

type Compiler = Awaited<ReturnType<typeof compile>>;

function stylesheetLoader(id: string, base: string) {
  const normalized = id.replace(/\.css$/, '');
  if (normalized === 'tailwindcss/theme' || normalized === './theme' || normalized === 'tailwindcss') {
    return { path: 'virtual:tailwindcss/theme.css', base, content: TAILWIND_THEME_CSS };
  }
  if (normalized === 'tailwindcss/utilities' || normalized === './utilities') {
    return { path: 'virtual:tailwindcss/utilities.css', base, content: TAILWIND_UTILITIES_CSS };
  }
  throw new Error(`M1 浏览器编译器拒绝未知 @import：${id}`);
}

async function createCompiler(theme: ThemeConfig): Promise<Compiler> {
  const errors = validateThemeConfig(theme);
  if (errors.length) throw new Error(`主题配置校验失败：${errors.join('；')}`);
  return compile(
    `@layer theme, base, components, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities);\n${themeToCss(theme)}`,
    { base: '/', loadStylesheet: async (id, base) => stylesheetLoader(id, base) },
  );
}

export async function compileArticleStyles(markdown: string, theme: ThemeConfig) {
  const snapshot = getFormatSnapshot(); assertFormatReady(snapshot);
  // Tailwind's compiler retains candidate state after build(). A fresh compiler
  // keeps an article/theme compile isolated from previous content and themes.
  const compiler = await createCompiler(theme);
  const candidates = extractMarkdownClassCandidates(markdown);
  const built = compiler.build(['article-preview', 'article-body', ...candidates]);
  // Keep the authored source for diagnostics, but never let unsupported fonts
  // change the article that readers see or the DOM used for clipboard export.
  const dropped = snapshot.bundle.formatter.output.dropCssProperties;
  const sheet = dropped.length ? postcss.parse(built) : null;
  sheet?.walkDecls(declaration => { if (dropped.includes(declaration.prop.toLowerCase())) declaration.remove(); });
  assertCurrentFormat(snapshot);
  const css = sheet?.toString() ?? built;
  return { css, candidates };
}

function compiledRules(css: string): Set<string> {
  const rules = new Set<string>();
  postcss.parse(css).walkRules(rule => { rules.add(rule.toString()); });
  return rules;
}

// A class is an authoring convenience only when Tailwind compiles it to
// CSS that the current formatter can serialize. The clipboard exporter removes the class.
export async function validateArticleUtilityClasses(classes: string[], _label: string, passed?: Set<string>, classLines?: Map<string, number[]>): Promise<ArticleFormatIssue[]> {
  if (!classes.length) return [];
  const compiler = await createCompiler(BASIC_THEME);
  const checked: string[] = [];
  let previous = compiledRules(compiler.build(['article-preview', 'article-body']));
  const issues: ArticleFormatIssue[] = [];
  for (const candidate of classes) {
    const lines = classLines?.get(candidate);
    const atSource = (issue: ArticleFormatIssue): ArticleFormatIssue => {
      const { line: _compiledLine, lines: _compiledLines, ...rest } = issue;
      return { ...rest, ...(lines?.length ? { line: lines[0], lines } : {}) };
    };
    checked.push(candidate);
    const current = compiledRules(compiler.build(['article-preview', 'article-body', ...checked]));
    const added = [...current].filter(rule => !previous.has(rule) && (() => {
      let paintsElement = false;
      postcss.parse(rule).walkDecls(declaration => { if (!declaration.prop.startsWith('--')) paintsElement = true; });
      return paintsElement;
    })());
    previous = current;
    if (!added.length) {
      issues.push(atSource({ kind: 'value', name: candidate, source: `工具类 ${candidate}`, tier: 'unknown', message: `工具类 ${candidate} 无法由 Tailwind 编译，未生成可用样式。` }));
      continue;
    }
    const portable = postcss.parse(added.join('\n'));
    portable.walkDecls(declaration => {
      if (declaration.prop.startsWith('--tw-')) declaration.remove();
      else declaration.prop = getFormatSnapshot().bundle.formatter.css.utilityPropertyAliases[declaration.prop] ?? declaration.prop;
    });
    issues.push(...validateArticleFormatCss(portable.toString(), `工具类 ${candidate}`, passed).map(atSource));
  }
  return issues;
}

let inspectionUtilities: Promise<string> | undefined;
// Same official utilities as the tool UI, isolated to the article iframe.
export function compileThemeInspectionUtilities(): Promise<string> {
  return inspectionUtilities ??= compile('@layer theme, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities);',
    { base: '/', loadStylesheet: async (id, base) => stylesheetLoader(id, base) })
    .then(compiler => compiler.build(['transition-opacity', 'duration-300', 'data-[theme-inspection-dim=true]:opacity-50']));
}
