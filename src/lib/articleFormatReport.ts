import { inspectLocalArticleImages } from './mediaManagement';
import type { ThemeConfig } from './types';
import { parseArticle } from './frontMatter';
import { themeAuthoredCss } from './themes';
import { articleFormatSeverity, standardFormatIssue, validateRenderedArticleCss, type ArticleFormatIssue } from './articleFormat';
import { assertCurrentFormat, getFormatSnapshot } from './article-format/runtime';
import { inspectRenderedFormat } from './article-format/frame';
import { prepareInspectionAssets } from './article-format/inspectionAssets';
import { compileArticleStyles } from './tailwind';
import { validateArticleAuthoringMarkdown } from './articleAuthoringFormat';

export type FormatCheckSection = { passed: string[]; issues: ArticleFormatIssue[] };
export type ArticleFormatReport = { theme: FormatCheckSection; body: FormatCheckSection; complete?: boolean; formatId?: string };

export function finalizeFormatSection(section: FormatCheckSection, failedRules = new Set(section.issues.flatMap(issue => issue.ruleId ? [issue.ruleId] : []))): FormatCheckSection {
  const seen = new Set<string>();
  const issues = section.issues.filter(issue => {
    const key = issue.ruleId ? JSON.stringify([issue.ruleId, issue.line, issue.tier]) : JSON.stringify([issue.kind, issue.name, issue.source, issue.line, issue.tier]);
    if (seen.has(key)) return false; seen.add(key); return true;
  });
  return { passed: section.passed.filter(name => ![...failedRules].some(id => name === `规则 ${id}`)), issues };
}

export function articleFormatReportCounts(report: ArticleFormatReport): { pass: number; warning: number; error: number } {
  const counts = { pass: report.theme.passed.length + report.body.passed.length, warning: 0, error: 0 };
  for (const issue of [...report.theme.issues, ...report.body.issues]) {
    const severity = articleFormatSeverity(issue.tier);
    if (severity === 'warning' || severity === 'error') counts[severity] += 1;
  }
  return counts;
}

export function compiledArticleFormatStatus(report: ArticleFormatReport, revision: number, classes: number): { label: string; tone: 'success' | 'warning' | 'error'; formatRevision: number } {
  const counts = articleFormatReportCounts(report);
  const tone = counts.error ? 'error' : counts.warning ? 'warning' : 'success';
  const label = `revision ${revision} · ${classes} 个类 · ${counts.pass} 个 pass · ${counts.warning} 个 warning · ${counts.error} 个 error`;
  return { label: `${tone === 'success' ? '样式已生成 · ' : ''}${label}${report.complete === false ? ' · 布局与深色未完成核对' : ''}`, tone, formatRevision: revision };
}

export function hasFormatConcerns(report: ArticleFormatReport): boolean {
  return [...report.theme.issues, ...report.body.issues].some(issue => articleFormatSeverity(issue.tier) !== 'safe');
}

export async function inspectArticleFormatReport(source: string, theme: ThemeConfig, preview: HTMLElement | null, media?: { root: FileSystemDirectoryHandle | null; month: string | null; folder: string | null }, options: { deep?: boolean; signal?: AbortSignal } = {}): Promise<ArticleFormatReport> {
  options.signal?.throwIfAborted();
  const snapshot = getFormatSnapshot();
  const body = parseArticle(source).body;
  const bodyPassed = new Set<string>();
  const bodyIssues = await validateArticleAuthoringMarkdown(body, '当前文章正文', bodyPassed);
  if (media) bodyIssues.push(...await inspectLocalArticleImages(body, media.root, media.month, media.folder));
  const themePassed = new Set<string>();
  let themeIssues: ArticleFormatIssue[] = [];
  // An empty document uses no article formatting. The theme library checks all rules when edited;
  // the article report checks only rules that affect the loaded article.
  if (body.trim()) {
    themeIssues = preview
      ? validateRenderedArticleCss(preview, themeAuthoredCss(theme), themePassed)
      : [{ kind: 'engine', name: '主题预览', source: '当前文章主题', tier: 'unknown', message: '预览尚未就绪，无法核对当前文章使用的主题规则。' }];
    const cssLines = theme.css.split(/\r?\n/).length;
    themeIssues = themeIssues.map(issue => issue.line && issue.line > cssLines
      ? { ...issue, source: '主题节点样式', line: undefined }
      : { ...issue, source: issue.kind === 'engine' ? issue.source : '主题 CSS' });
  }
  let complete = !body.trim() && !snapshot.error;
  if (body.trim() && options.deep !== false && preview) {
    try {
      const shadow = preview.getRootNode();
      const css = shadow instanceof ShadowRoot ? shadow.querySelector('style')?.textContent ?? '' : (await compileArticleStyles(body, theme)).css;
      const assets = await prepareInspectionAssets(preview, media, snapshot, options.signal);
      let checked;
      try { checked = await inspectRenderedFormat(assets.root, css, snapshot, options.signal); }
      finally { assets.dispose(); }
      for (const id of checked.checked) bodyPassed.add(`规则 ${id}`);
      for (const finding of checked.issues) {
        const rule = snapshot.bundle.validator.rules.find(item => item.id === finding.ruleId);
        if (!rule) continue;
        const issue = standardFormatIssue(rule, '当前正文实际渲染', finding.line, finding.detail);
        if (finding.outcome === 'incomplete') { issue.kind = 'engine'; issue.tier = 'unknown'; }
        if (finding.outcome === 'review') issue.tier = 'warning';
        bodyIssues.push(issue);
      }
      for (const id of checked.manual) {
        const review = snapshot.bundle.support.manualReview.find(item => item.id === id);
        if (review) bodyIssues.push({ kind: 'value', name: review.title, source: '人工核对项', tier: 'warning', message: review.title, ruleId: review.id, reference: `${snapshot.bundle.support.meta.sources[review.source]?.url ?? ''}${review.anchor ? `#${encodeURIComponent(review.anchor)}` : ''}`, domain: 'standard' });
      }
      complete = !checked.issues.some(item => item.outcome === 'incomplete');
    } catch (error) {
      bodyIssues.push({ kind: 'engine', name: '实际布局／转换检查', source: '当前正文', tier: 'unknown', message: error instanceof Error ? error.message : String(error), domain: 'product' });
    }
  }
  options.signal?.throwIfAborted();
  assertCurrentFormat(snapshot);
  const failedRules = new Set([...themeIssues, ...bodyIssues].flatMap(issue => issue.ruleId ? [issue.ruleId] : []));
  return {
    theme: finalizeFormatSection({ passed: [...themePassed], issues: themeIssues }, failedRules),
    body: finalizeFormatSection({ passed: [...bodyPassed], issues: bodyIssues }, failedRules),
    complete, formatId: snapshot.id,
  };
}
