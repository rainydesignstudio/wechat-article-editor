import { inspectArticleFormatMarkdown, type ArticleFormatIssue } from './articleFormat';
import { validateArticleUtilityClasses } from './tailwind';

export async function validateArticleAuthoringMarkdown(source: string, label = '正文', passed?: Set<string>): Promise<ArticleFormatIssue[]> {
  const inspection = inspectArticleFormatMarkdown(source, label, true, passed);
  try {
    return [...inspection.issues, ...await validateArticleUtilityClasses(inspection.classes, label, passed, inspection.classLines)];
  } catch (error) {
    return [...inspection.issues, { kind: 'engine', name: 'Tailwind', source: label, tier: 'unknown', message: `无法核对工具类的最终样式：${error instanceof Error ? error.message : String(error)}` }];
  }
}
