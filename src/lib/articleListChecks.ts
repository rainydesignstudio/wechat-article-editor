import { getFormatSnapshot } from './article-format/runtime';
import type { ArticleSummary, StoredArticle } from './types';
import type { ArticleFormatReport } from './articleFormatReport';
import { articleFormatReportCounts } from './articleFormatReport';

export type ArticleListCheck = {
  signature: string;
  checkedAt: string;
  state: 'checked' | 'failed' | 'stale';
  warning: number;
  error: number;
  message?: string;
};

export function articleSummarySignature(article: ArticleSummary): string {
  return JSON.stringify([article.id, article.parse.metadata.updatedAt, article.parse.metadata.theme, getFormatSnapshot().id]);
}

export function articleListCheckResult(article: StoredArticle, report: ArticleFormatReport): ArticleListCheck {
  const counts = articleFormatReportCounts(report);
  const metadataErrors = article.parse.diagnostics.filter(item => item.level === 'error').length;
  const metadataWarnings = article.parse.diagnostics.filter(item => item.level === 'warning').length;
  const engine = [...report.theme.issues, ...report.body.issues].find(item => item.kind === 'engine');
  return { signature: articleSummarySignature(article), checkedAt: new Date().toISOString(), state: engine ? 'failed' : 'checked', warning: counts.warning + metadataWarnings, error: counts.error + metadataErrors, ...(engine ? { message: engine.message } : {}) };
}

export function summarizeArticleListChecks(articles: ArticleSummary[], records: Record<string, ArticleListCheck>) {
  const total = { checked: 0, warning: 0, error: 0, unchecked: 0, stale: 0, failed: 0 };
  for (const article of articles) {
    const record = records[article.id];
    if (!record) { total.unchecked += 1; continue; }
    if (record.state === 'stale' || record.signature !== articleSummarySignature(article)) { total.stale += 1; continue; }
    if (record.state === 'failed') { total.failed += 1; continue; }
    total.checked += 1;
    if (record.warning) total.warning += 1;
    if (record.error) total.error += 1;
  }
  return total;
}
