import { articleFormatBlocks, articleFormatMessage, type ArticleFormatIssue } from './articleFormat';
import { validateArticleAuthoringMarkdown } from './articleAuthoringFormat';
import { parseArticle } from './frontMatter';
import { createArticleSource, replaceArticleBody } from './frontMatter';
import type { ThemeConfig } from './types';
import { articleFormatPreviewStructure } from './articleFormat';
import { inspectArticleFormatReport } from './articleFormatReport';

export type ContentValidationResult = { issues: ArticleFormatIssue[]; errors: string[] };

export function contentFormatBlockingIssues(issues: readonly ArticleFormatIssue[]): ArticleFormatIssue[] {
  return issues.filter(issue => articleFormatBlocks(issue.tier) || issue.kind === 'engine');
}

export async function validateContentSource(kind: 'snippets' | 'templates', source: string, options: { theme?: ThemeConfig } = {}): Promise<ContentValidationResult> {
  const parsed = kind === 'templates' ? parseArticle(source) : null;
  const errors = parsed?.diagnostics.filter(item => item.level === 'error').map(item => item.message) ?? [];
  if (errors.length) return { issues: [], errors };
  const body = parsed ? parsed.body : source.replace('▌', '');
  const issues = options.theme && typeof document !== 'undefined'
    ? (await inspectArticleFormatReport(replaceArticleBody(createArticleSource('资源格式检查', options.theme.id), body), options.theme, articleFormatPreviewStructure(body))).body.issues
    : await validateArticleAuthoringMarkdown(body, kind === 'snippets' ? '片段正文' : '起稿模板正文');
  const blocking = contentFormatBlockingIssues(issues);
  return { issues, errors: blocking.length ? [articleFormatMessage(blocking)] : [] };
}
