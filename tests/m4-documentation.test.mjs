import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseEditorThemeJson, EDITOR_COLOR_ROLES } from '../src/lib/editorThemes.ts';
import { parseThemeConfigJson, validateThemeFormat } from '../src/lib/themeValidation.ts';
import { parseArticle, instantiateArticleTemplate } from '../src/lib/frontMatter.ts';
import { validateArticleAuthoringMarkdown } from '../src/lib/articleAuthoringFormat.ts';
import { contentFormatBlockingIssues } from '../src/lib/contentValidation.ts';
import { loadArticleSnippets, loadArticleTemplates, saveArticleSnippet, saveArticleTemplate } from '../src/lib/contentLibraries.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const documents = await Promise.all(['README.md', 'AGENT-GUIDE.md', 'THEME.md'].map(async file => ({ file, source: await readFile(path.join(root, file), 'utf8') })));
const themeDocument = documents.find(doc => doc.file === 'THEME.md').source;
const blocks = [...themeDocument.matchAll(/^```(json|markdown)\r?\n([\s\S]*?)^```\s*$/gm)].map(match => ({ type: match[1], source: match[2] }));
const records = blocks.filter(block => block.type === 'json').map(block => JSON.parse(block.source));
const editor = records.find(record => record.kind === 'editor-theme');
const article = records.find(record => record.kind === 'article-theme');
const snippet = records.find(record => record.trigger);
const markdown = blocks.filter(block => block.type === 'markdown');

test('documentation links and local headings resolve without maintainer paths', async () => {
  const slug = text => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
  for (const doc of documents) {
    assert.doesNotMatch(doc.source, /\/Users\/rainy|sandbox\/knowledge/);
    const withoutCode = doc.source.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
    for (const match of withoutCode.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^https?:\/\//.test(match[1])) continue;
      const [target, fragment] = match[1].split('#');
      const filename = target ? path.resolve(root, path.dirname(doc.file), target) : path.join(root, doc.file);
      const source = await readFile(filename, 'utf8');
      if (fragment) {
        const headings = [...source.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '').matchAll(/^#{1,6}\s+(.+)$/gm)].map(heading => slug(heading[1]));
        assert.ok(headings.includes(fragment), `${doc.file}: missing heading ${match[1]}`);
      }
    }
  }
});

test('complete editor and article theme examples pass the actual theme validators', () => {
  assert.ok(editor && article && snippet);
  const parsedEditor = parseEditorThemeJson(JSON.stringify(editor));
  assert.equal(parsedEditor.formatVersion, 4);
  assert.deepEqual(Object.keys(parsedEditor.colors.light).sort(), [...EDITOR_COLOR_ROLES].sort());
  assert.deepEqual(Object.keys(parsedEditor.colors.dark).sort(), [...EDITOR_COLOR_ROLES].sort());
  assert.equal(Object.keys(parsedEditor.fonts).length, 8);
  assert.equal(parseThemeConfigJson(JSON.stringify(article)).id, article.id);
  assert.deepEqual(validateThemeFormat(article), []);
});

test('starter and completed article examples preserve metadata and pass authoring gates', async () => {
  assert.equal(markdown.length, 2);
  for (const block of markdown) {
    const parsed = parseArticle(block.source);
    assert.equal(parsed.canCopy, true);
    assert.equal(parsed.metadata.theme.id, article.id);
    const issues = await validateArticleAuthoringMarkdown(parsed.body);
    assert.deepEqual(contentFormatBlockingIssues(issues), []);
    assert.ok(!issues.some(issue => issue.kind === 'engine'), 'style validation must execute');
  }
  const completed = markdown[1].source;
  assert.doesNotMatch(completed, /▌|\/\/guide-note|\[填写/);
  assert.ok(completed.indexOf('先把资料放好') < completed.indexOf('/article-sample.png'));
  assert.ok(completed.indexOf('/article-sample.png') < completed.indexOf('## 留下下一步'));
  const next = parseArticle(instantiateArticleTemplate(markdown[0].source, { theme: article }));
  assert.equal(next.metadata.theme.id, article.id);
  assert.notEqual(next.metadata.createdAt, parseArticle(markdown[0].source).metadata.createdAt);
});

class MemoryFile {
  kind = 'file';
  constructor(name) { this.name = name; this.content = ''; }
  async getFile() { const content = this.content; return { text: async () => content, size: content.length }; }
  async createWritable() { let pending = this.content; return { write: async content => { pending = content; }, close: async () => { this.content = pending; }, abort: async () => {} }; }
}
class MemoryDirectory {
  kind = 'directory';
  constructor(name) { this.name = name; this.children = new Map(); }
  async getDirectoryHandle(name, options = {}) { return this.get(name, 'directory', options); }
  async getFileHandle(name, options = {}) { return this.get(name, 'file', options); }
  get(name, kind, options) {
    if (!this.children.has(name) && options.create) this.children.set(name, kind === 'directory' ? new MemoryDirectory(name) : new MemoryFile(name));
    const item = this.children.get(name);
    if (!item) throw new DOMException(name, 'NotFoundError');
    if (item.kind !== kind) throw new DOMException(name, 'TypeMismatchError');
    return item;
  }
  async removeEntry(name) { this.children.delete(name); }
  async *entries() { yield* this.children.entries(); }
}

test('documentation snippet and starter save and reload through production library functions', async () => {
  const directory = new MemoryDirectory('documentation');
  await loadArticleSnippets(directory);
  await loadArticleTemplates(directory);
  await saveArticleSnippet(directory, { ...snippet, categoryId: 'default' }, null);
  await saveArticleTemplate(directory, 'guide-starter', markdown[0].source, null, 'default');
  const savedSnippet = (await loadArticleSnippets(directory)).snippets.find(item => item.id === snippet.id);
  const savedTemplate = (await loadArticleTemplates(directory)).templates.find(item => item.id === 'guide-starter');
  assert.equal(savedSnippet.content, snippet.content);
  assert.equal(savedSnippet.trigger, snippet.trigger);
  assert.equal(savedTemplate.source, markdown[0].source);
  await assert.rejects(saveArticleSnippet(directory, { ...snippet, categoryId: 'default' }, null), /已被其他片段占用/);
});
