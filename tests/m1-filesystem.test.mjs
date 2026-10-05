import assert from 'node:assert/strict';
import test from 'node:test';

const { createArticleSource: createBaseArticleSource, updateFrontMatter } = await import('../src/lib/frontMatter.ts');
const { getTheme } = await import('../src/lib/themes.ts');
const createArticleSource = (title, id) => updateFrontMatter(createBaseArticleSource(title, id), { theme: { id, version: getTheme(id).version } });
const { listStoredArticles, saveStoredArticle } = await import('../src/lib/fileSystem.ts');

class MemoryFileHandle {
  kind = 'file';

  constructor(name) {
    this.name = name;
    this.content = '';
  }

  async getFile() {
    const content = this.content;
    return { text: async () => content };
  }

  async createWritable() {
    return {
      write: async (content) => { this.content = String(content); },
      close: async () => {},
    };
  }
}

class MemoryDirectoryHandle {
  kind = 'directory';

  constructor(name) {
    this.name = name;
    this.children = new Map();
  }

  async getDirectoryHandle(name, options = {}) {
    const current = this.children.get(name);
    if (current) {
      if (current.kind !== 'directory') throw new Error(`${name} is not a directory`);
      return current;
    }
    if (!options.create) throw new Error(`missing directory: ${name}`);
    const created = new MemoryDirectoryHandle(name);
    this.children.set(name, created);
    return created;
  }

  async getFileHandle(name, options = {}) {
    const current = this.children.get(name);
    if (current) {
      if (current.kind !== 'file') throw new Error(`${name} is not a file`);
      return current;
    }
    if (!options.create) throw new Error(`missing file: ${name}`);
    const created = new MemoryFileHandle(name);
    this.children.set(name, created);
    return created;
  }

  async *entries() {
    for (const entry of this.children) yield entry;
  }
}

test('saving invalid YAML preserves article.md and protects the month index', async () => {
  const root = new MemoryDirectoryHandle('test-data');
  // Invalid YAML uses the parser's legacy fallback theme version.
  const theme = { ...getTheme('basic'), version: '1.0.0' };
  const source = '---\ntitle: [broken\n---\n# Keep this source';

  const result = await saveStoredArticle(root, source, theme);
  const monthDirectory = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(result.article.month);
  const articleDirectory = await monthDirectory.getDirectoryHandle(result.article.folder);
  const articleFile = await articleDirectory.getFileHandle('article.md');

  assert.equal(result.sourceSaved, true);
  assert.equal(result.indexUpdated, false);
  assert.match(result.indexError, /Front Matter/);
  assert.equal(await (await articleFile.getFile()).text(), source);
  await assert.rejects(() => monthDirectory.getFileHandle('index.json'));

  const listed = await listStoredArticles(root);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].themeValid, true);
  assert.equal(listed[0].parse.canCopy, false);
});

test('saving an existing article updates its fixed folder instead of renaming it', async () => {
  const root = new MemoryDirectoryHandle('test-data');
  const theme = getTheme('basic');
  const first = await saveStoredArticle(root, createArticleSource('固定目录', 'basic'), theme);
  const renamedSource = updateFrontMatter(first.article.source, { title: '标题已改' });
  const second = await saveStoredArticle(root, renamedSource, theme, first.article.folder, first.article.month);

  assert.equal(second.article.id, first.article.id);
  assert.equal(second.article.folder, first.article.folder);
  const monthDirectory = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(first.article.month);
  const folders = [...monthDirectory.children.entries()].filter(([, entry]) => entry.kind === 'directory').map(([name]) => name);
  assert.deepEqual(folders, [first.article.folder]);
  const listed = await listStoredArticles(root);
  assert.equal(listed[0].parse.metadata.title, '标题已改');
});

test('damaged theme snapshots stay damaged while source saves remain recoverable', async () => {
  const root = new MemoryDirectoryHandle('test-data');
  const basic = getTheme('basic');
  const rainy = getTheme('rainy');
  const first = await saveStoredArticle(root, createArticleSource('主题保护', 'basic'), basic);
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(first.article.month);
  const articleDirectory = await monthDirectory.getDirectoryHandle(first.article.folder);
  const themeFile = await articleDirectory.getFileHandle('theme.json');
  const indexFile = await monthDirectory.getFileHandle('index.json');
  const originalIndex = await (await indexFile.getFile()).text();

  themeFile.content = '{broken json';
  let listed = await listStoredArticles(root);
  assert.equal(listed[0].themeValid, false);
  assert.equal(listed[0].parse.canCopy, false);
  const invalidSave = await saveStoredArticle(root, updateFrontMatter(first.article.source, { title: '主题损坏仍可保存' }), basic, first.article.folder, first.article.month, { writeTheme: false });
  assert.equal(invalidSave.sourceSaved, true);
  assert.equal(invalidSave.indexUpdated, false);
  assert.equal(invalidSave.article.themeValid, false);
  assert.equal(themeFile.content, '{broken json');
  assert.equal(await (await indexFile.getFile()).text(), originalIndex);
  listed = await listStoredArticles(root);
  assert.equal(listed[0].parse.canCopy, false);

  themeFile.content = JSON.stringify(rainy, null, 2);
  listed = await listStoredArticles(root);
  assert.equal(listed[0].themeValid, false);
  assert.match(listed[0].parse.diagnostics.at(-1).message, /主题快照/);
  const mismatchSave = await saveStoredArticle(root, updateFrontMatter(invalidSave.article.source, { title: '主题错配仍可保存' }), basic, first.article.folder, first.article.month, { writeTheme: false });
  assert.equal(mismatchSave.sourceSaved, true);
  assert.equal(mismatchSave.indexUpdated, false);
  assert.equal(themeFile.content, JSON.stringify(rainy, null, 2));
  assert.equal(await (await indexFile.getFile()).text(), originalIndex);
  listed = await listStoredArticles(root);
  assert.equal(listed[0].parse.canCopy, false);

  articleDirectory.children.delete('theme.json');
  listed = await listStoredArticles(root);
  assert.equal(listed[0].themeValid, false);
  const missingSave = await saveStoredArticle(root, updateFrontMatter(mismatchSave.article.source, { title: '主题缺失仍可保存' }), basic, first.article.folder, first.article.month, { writeTheme: false });
  assert.equal(missingSave.sourceSaved, true);
  assert.equal(missingSave.indexUpdated, false);
  await assert.rejects(() => articleDirectory.getFileHandle('theme.json'));
  assert.equal(await (await indexFile.getFile()).text(), originalIndex);
  listed = await listStoredArticles(root);
  assert.equal(listed[0].themeValid, false);
  assert.equal(listed[0].parse.canCopy, false);
});
