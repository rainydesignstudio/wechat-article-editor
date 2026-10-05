import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { saveStoredArticle, listArticleSummaries, readStoredArticleById, rebuildArticleIndexes, writeArticleSummaryBatch } from '../src/lib/fileSystem.ts';
import { createArticleSource, updateFrontMatter } from '../src/lib/frontMatter.ts';
import { getTheme } from '../src/lib/themes.ts';
import { removeArticleCategories } from '../src/lib/articleCategoryMutation.ts';
import { summarizeArticleListChecks, articleSummarySignature } from '../src/lib/articleListChecks.ts';

class File {
  kind = 'file';
  constructor(name, counts, content = '') { this.name = name; this.counts = counts; this.content = content; }
  async getFile() { this.counts.read[this.name] = (this.counts.read[this.name] ?? 0) + 1; const content = this.content; return { text: async () => content }; }
  async createWritable() { let content = this.content; return { write: async value => { content = String(value); }, close: async () => { this.content = content; this.counts.write[this.name] = (this.counts.write[this.name] ?? 0) + 1; } }; }
}
class Directory {
  kind = 'directory';
  constructor(name, counts = { read: {}, write: {} }) { this.name = name; this.counts = counts; this.children = new Map(); }
  async getDirectoryHandle(name, options = {}) { return this.get(name, 'directory', options); }
  async getFileHandle(name, options = {}) { return this.get(name, 'file', options); }
  get(name, kind, options) { if (!this.children.has(name) && options.create) this.children.set(name, kind === 'directory' ? new Directory(name, this.counts) : new File(name, this.counts)); const item = this.children.get(name); if (!item) throw new DOMException(name, 'NotFoundError'); if (item.kind !== kind) throw new DOMException(name, 'TypeMismatchError'); return item; }
  async *entries() { yield* this.children.entries(); }
}
const theme = getTheme('basic');
const source = title => updateFrontMatter(createArticleSource(title, theme.id), { theme: { id: theme.id, version: theme.version }, categories: ['教程'], description: '摘要' });
const reset = root => { root.counts.read = {}; root.counts.write = {}; };

for (const size of [100, 1000]) test(`${size} indexed articles load summaries without reading body or theme snapshots`, async t => {
  const root = new Directory('test');
  const saved = await saveStoredArticle(root, source('样稿'), theme);
  const month = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(saved.article.month);
  const template = JSON.parse(month.children.get('index.json').content)[saved.article.folder];
  month.children.delete(saved.article.folder);
  const index = {};
  for (let n = 0; n < size; n++) {
    const folder = `文稿-${n}`;
    index[folder] = { ...template, title: folder };
    const child = new Directory(folder, root.counts);
    child.children.set('article.md', new File('article.md', root.counts, source(folder)));
    child.children.set('theme.json', new File('theme.json', root.counts, JSON.stringify(theme)));
    month.children.set(folder, child);
  }
  month.children.get('index.json').content = JSON.stringify(index);
  reset(root);
  const start = performance.now();
  const result = await listArticleSummaries(root);
  const elapsed = performance.now() - start;
  assert.equal(result.articles.length, size);
  assert.deepEqual(result.issues, []);
  assert.equal(root.counts.read['article.md'] ?? 0, 0);
  assert.equal(root.counts.read['theme.json'] ?? 0, 0);
  assert.equal(root.counts.read['index.json'], 1);
  assert.equal(result.articles[0].source, undefined);
  assert.equal(result.articles[0].theme.css, undefined);
  assert.deepEqual(result.articles[0].parse.metadata.categories, ['教程']);
  t.diagnostic(JSON.stringify({ fixture: 'in-memory FSA, not physical disk timing', articles: size, milliseconds: elapsed, reads: root.counts.read }));
  reset(root);
  const opened = await readStoredArticleById(root, saved.article.month, '文稿-0');
  assert.equal(opened.parse.metadata.title, '文稿-0');
  assert.equal(root.counts.read['article.md'], 1);
  assert.equal(root.counts.read['theme.json'], 1);
});

test('ordinary save synchronizes categories and descriptive fields with one monthly index write', async () => {
  const root = new Directory('test');
  const first = await saveStoredArticle(root, source('文章'), theme);
  reset(root);
  const changed = updateFrontMatter(first.article.source, { categories: ['新的分类'], description: '新的摘要' });
  await saveStoredArticle(root, changed, theme, first.article.folder, first.article.month);
  assert.equal(root.counts.write['index.json'], 1);
  const summaries = await listArticleSummaries(root);
  assert.deepEqual(summaries.articles[0].parse.metadata.categories, ['新的分类']);
  assert.equal(summaries.articles[0].parse.metadata.description, '新的摘要');
});

test('batch source saves leave index unchanged until one commit per month; external edits are protected', async () => {
  const root = new Directory('test');
  const first = await saveStoredArticle(root, source('甲'), theme);
  const second = await saveStoredArticle(root, source('乙'), theme);
  reset(root);
  const successful = [];
  for (const original of [first.article, second.article]) {
    const result = await saveStoredArticle(root, updateFrontMatter(original.source, { categories: [] }), original.theme, original.folder, original.month, { writeTheme: false, updateIndex: false, expectedSource: original.source });
    successful.push(result.article);
  }
  assert.equal(root.counts.write['index.json'] ?? 0, 0);
  assert.deepEqual(await writeArticleSummaryBatch(root, successful), []);
  assert.equal(root.counts.write['index.json'], 1);
  assert.ok((await listArticleSummaries(root)).articles.every(item => item.parse.metadata.categories.length === 0));
  await assert.rejects(saveStoredArticle(root, first.article.source, theme, first.article.folder, first.article.month, { writeTheme: false, updateIndex: false, expectedSource: first.article.source }), /外部变化/);
});

test('missing and old indexes report repair needs without scanning, and explicit rebuild retains damaged documents', async () => {
  const root = new Directory('test');
  const first = await saveStoredArticle(root, source('正常文章'), theme);
  const month = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(first.article.month);
  const indexFile = month.children.get('index.json');
  const entry = JSON.parse(indexFile.content)[first.article.folder];
  indexFile.content = JSON.stringify({ [first.article.folder]: { title: entry.title, categories: entry.categories, updatedAt: entry.updatedAt, theme: entry.theme } });
  reset(root);
  let result = await listArticleSummaries(root);
  assert.equal(result.articles[0].indexState, 'repair-needed');
  assert.equal(result.issues.length, 1);
  assert.equal(root.counts.read['article.md'] ?? 0, 0);
  month.children.delete('index.json');
  reset(root);
  result = await listArticleSummaries(root);
  assert.equal(result.issues.length, 1);
  assert.equal(root.counts.read['article.md'] ?? 0, 0);
  const damaged = new Directory('损坏文章', root.counts);
  damaged.children.set('article.md', new File('article.md', root.counts, '---\ntitle: [broken\n---\n保留原稿'));
  month.children.set('损坏文章', damaged);
  await rebuildArticleIndexes(root, [first.article.month]);
  result = await listArticleSummaries(root);
  assert.equal(result.articles.length, 2);
  assert.ok(result.articles.find(item => item.folder === '损坏文章').parse.diagnostics.some(item => item.level === 'error'));
  assert.equal(damaged.children.get('article.md').content, '---\ntitle: [broken\n---\n保留原稿');
});

test('category mutation isolates archive, partial failures and unrelated metadata/body while batching the successful index rows', async () => {
  const root = new Directory('test');
  const first = await saveStoredArticle(root, updateFrontMatter(source('甲'), { categories: ['移除', '保留'], author: '作者', customField: '保留字段' }), theme);
  const archived = await saveStoredArticle(root, updateFrontMatter(source('归档'), { categories: ['移除'] }), theme);
  const broken = await saveStoredArticle(root, updateFrontMatter(source('损坏'), { categories: ['移除'] }), theme);
  const month = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(first.article.month);
  const brokenDir = await month.getDirectoryHandle(broken.article.folder);
  brokenDir.children.get('theme.json').content = '{broken json';
  reset(root);
  const result = await removeArticleCategories(root, [first.article, archived.article, broken.article], ['移除'], { isCurrent: () => true, isArchived: id => id === archived.article.id });
  assert.equal(result.changed.length, 1);
  assert.equal(result.failures.length, 2);
  assert.deepEqual(result.changed[0].parse.metadata.categories, ['保留']);
  assert.equal(result.changed[0].parse.metadata.author, '作者');
  assert.equal(result.changed[0].parse.metadata.customField, '保留字段');
  assert.equal(result.changed[0].parse.body, first.article.parse.body);
  assert.equal(root.counts.write['index.json'], 1);
  assert.equal(root.counts.write['theme.json'] ?? 0, 0);
  assert.equal((await month.getDirectoryHandle(archived.article.folder)).children.get('article.md').content, archived.article.source);
  assert.equal(brokenDir.children.get('article.md').content, broken.article.source);
});

test('failed batch index commit reports source saved without erasing the old index', async () => {
  const root = new Directory('test');
  const first = await saveStoredArticle(root, updateFrontMatter(source('甲'), { categories: ['移除'] }), theme);
  const month = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(first.article.month);
  const index = month.children.get('index.json');
  const before = index.content;
  index.createWritable = async () => { throw new Error('拒绝写入索引'); };
  const result = await removeArticleCategories(root, [first.article], ['移除'], { isCurrent: () => true, isArchived: () => false });
  assert.equal(result.changed.length, 1);
  assert.equal(result.indexIssues.length, 1);
  assert.match(result.indexIssues[0].message, /原文已保存/);
  assert.equal(index.content, before);
  assert.deepEqual((await readStoredArticleById(root, first.article.month, first.article.folder)).parse.metadata.categories, []);
});

test('scope aggregation separates unchecked, failed, changed and warning/error document counts', () => {
  const summaries = ['甲', '乙', '丙', '丁'].map(folder => ({ id: folder, month: '2026-10', folder, filePath: '', theme: { id: theme.id, name: theme.name, version: theme.version }, parse: { metadata: { updatedAt: '2026-10-03', theme: { id: theme.id, version: theme.version } }, diagnostics: [] } }));
  const base = summary => ({ signature: articleSummarySignature(summary), checkedAt: 'now', state: 'checked', warning: 0, error: 0 });
  const records = { 甲: { ...base(summaries[0]), warning: 3, error: 2 }, 乙: { ...base(summaries[1]), state: 'failed' }, 丙: { ...base(summaries[2]), signature: 'old' }, 其他组: { ...base(summaries[3]), error: 90 } };
  assert.deepEqual(summarizeArticleListChecks(summaries, records), { checked: 1, warning: 1, error: 1, unchecked: 1, stale: 1, failed: 1 });
  assert.deepEqual(summarizeArticleListChecks([], records), { checked: 0, warning: 0, error: 0, unchecked: 0, stale: 0, failed: 0 });
});
