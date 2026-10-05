import { readStoredArticleById, saveStoredArticle, writeArticleSummaryBatch } from './fileSystem';
import { updateFrontMatter } from './frontMatter';
import type { ArticleSummary, StoredArticle } from './types';

export async function removeArticleCategories(root: FileSystemDirectoryHandle, targets: ArticleSummary[], labels: string[], options: {
  isCurrent: () => boolean;
  isArchived: (id: string) => boolean;
}) {
  const changed: StoredArticle[] = [];
  const failures: { id: string; message: string }[] = [];
  const skipped: string[] = [];
  const selected = new Set(labels);
  for (const target of [...new Map(targets.map(item => [item.id, item])).values()]) {
    if (!options.isCurrent()) break;
    try {
      if (options.isArchived(target.id)) throw new Error('归档文章为只读；请先取消归档。');
      const stored = await readStoredArticleById(root, target.month, target.folder);
      if (!options.isCurrent()) break;
      if (stored.parse.diagnostics.some(item => item.level === 'error') || !stored.themeValid) throw new Error('元数据或主题快照有误，未修改原稿。');
      const categories = stored.parse.metadata.categories.filter(label => !selected.has(label));
      if (categories.length === stored.parse.metadata.categories.length) { skipped.push(target.id); continue; }
      if (options.isArchived(target.id)) throw new Error('文章已归档；未修改原稿。');
      const source = updateFrontMatter(stored.source, { categories, updatedAt: new Date().toISOString() });
      const saved = await saveStoredArticle(root, source, stored.theme, stored.folder, stored.month, { writeTheme: false, updateIndex: false, expectedSource: stored.source });
      changed.push(saved.article);
    } catch (error) {
      failures.push({ id: target.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  // Even cancellation after a source write must leave its successful rows indexed.
  const indexIssues = await writeArticleSummaryBatch(root, changed);
  return { changed, failures, skipped, indexIssues };
}
