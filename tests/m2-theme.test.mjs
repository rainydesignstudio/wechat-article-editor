import { validateArticleFormatCss } from '../src/lib/articleFormat.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const { initializeThemeDefaults } = await import('../src/lib/themeDefaults.ts');
const { BASIC_THEME, RAINY_THEME, THEMES } = await import('../src/lib/themes.ts');
const { themePreviewCss, themeToCss } = await import('../src/lib/themes.ts');
const { refreshRootSession } = await import('../src/lib/rootSession.ts');
const { parseThemeConfigJson, validateThemeConfig, validateThemeFormat } = await import('../src/lib/themeValidation.ts');
const { createArticleSource: createBaseArticleSource, updateFrontMatter } = await import('../src/lib/frontMatter.ts');
const createArticleSource = (title, id) => updateFrontMatter(createBaseArticleSource(title, id), { theme: { id, version: THEMES.find(theme => theme.id === id).version } });
const { copyStoredArticle, deleteThemeLibraryTheme, listStoredArticles, loadThemeLibrary, saveStoredArticle, saveThemeLibraryTheme } = await import('../src/lib/fileSystem.ts');

class MemoryFileHandle {
  kind = 'file';
  constructor(name) { this.name = name; this.content = ''; this.failWrite = false; }
  async getFile() {
    const content = this.content;
    const bytes = new TextEncoder().encode(content);
    return { text: async () => content, arrayBuffer: async () => bytes.slice().buffer };
  }
  async createWritable() {
    let staged = this.content;
    return {
      write: async (content) => {
        if (this.failWrite) {
          this.failWrite = false;
          throw new Error('fixture write failure');
        }
        staged = typeof content === 'string'
          ? content
          : new TextDecoder().decode(content instanceof ArrayBuffer ? new Uint8Array(content) : content);
      },
      close: async () => { this.content = staged; },
      abort: async () => {},
    };
  }
}

class MemoryDirectoryHandle {
  kind = 'directory';
  constructor(name) { this.name = name; this.children = new Map(); }
  async getDirectoryHandle(name, options = {}) {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'directory') throw new DOMException(`${name} is not a directory`, 'TypeMismatchError');
      return existing;
    }
    if (!options.create) throw new DOMException(`missing directory: ${name}`, 'NotFoundError');
    const created = new MemoryDirectoryHandle(name);
    this.children.set(name, created);
    return created;
  }
  async getFileHandle(name, options = {}) {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'file') throw new DOMException(`${name} is not a file`, 'TypeMismatchError');
      return existing;
    }
    if (!options.create) throw new DOMException(`missing file: ${name}`, 'NotFoundError');
    const created = new MemoryFileHandle(name);
    created.failWrite = this.failNextWrite === true;
    this.failNextWrite = false;
    this.children.set(name, created);
    return created;
  }
  async removeEntry(name, options = {}) {
    const existing = this.children.get(name);
    if (!existing) throw new DOMException(`missing entry: ${name}`, 'NotFoundError');
    if (existing.kind === 'directory' && existing.children.size && !options.recursive) throw new DOMException('directory is not empty', 'InvalidModificationError');
    this.children.delete(name);
  }
  async *entries() { yield* this.children.entries(); }
}

async function readText(directory, name) {
  return (await (await directory.getFileHandle(name)).getFile()).text();
}

test('formal themes pass validation and JSON parse errors stay actionable', () => {
  assert.deepEqual(validateThemeConfig(BASIC_THEME), []);
  assert.deepEqual(validateThemeConfig(RAINY_THEME), []);
  assert.throws(() => parseThemeConfigJson('{bad json'), /不是有效 JSON/);
});

test('a late theme refresh cannot commit into a newly selected root', async () => {
  let currentRoot = { name: 'A' };
  let releaseLoad;
  let committed;
  const loading = new Promise((resolve) => { releaseLoad = resolve; });
  const pending = refreshRootSession(
    currentRoot,
    (expected) => currentRoot === expected,
    () => loading,
    (value) => { committed = value; },
  );
  currentRoot = { name: 'B' };
  releaseLoad({ name: 'A themes' });
  assert.deepEqual(await pending, { kind: 'stale' });
  assert.equal(committed, undefined);
});

test('theme refresh failure is distinct from an already completed mutation', async () => {
  const root = { name: 'fixture' };
  let committed = false;
  const result = await refreshRootSession(
    root,
    (expected) => expected === root,
    async () => { throw new Error('fixture refresh failure'); },
    () => { committed = true; },
  );
  assert.equal(result.kind, 'failed');
  assert.match(result.error.message, /fixture refresh failure/);
  assert.equal(committed, false);
});

test('theme-library keeps only consumed scoped action variants', async () => {
  const styles = await readFile(new URL('../src/styles/components-theme-library.css', import.meta.url), 'utf8');
  assert.doesNotMatch(styles, /\.theme-library-page \.button-accent\b/);
  assert.doesNotMatch(styles, /\.theme-library-page \.button-danger\b/, 'the shared dialog keeps one danger button everywhere');
});

test('white primary-button text remains readable on every accent in light and dark modes', async () => {
  const [controls, theme] = await Promise.all([
    readFile(new URL('../src/styles/components-controls.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/theme.css', import.meta.url), 'utf8'),
  ]);
  const swatches = [
    ['teal', 'teal-500', 'teal-600'],
    ['moss', 'moss-accent-500', 'moss-accent-600'],
    ['berry', 'berry-accent-500', 'berry-accent-600'],
  ];
  const luminance = (hex) => {
    const channels = hex.match(/[\da-f]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  const tokenValue = (token) => {
    const value = theme.match(new RegExp(`--color-${token}:\\s*(#[\\da-f]{6})`, 'i'))?.[1];
    assert.ok(value, `expected palette token --color-${token}`);
    return value;
  };

  assert.match(controls, /\.button-primary\s*\{\s*@apply border-action-line bg-action text-action-text;/);
  assert.match(controls, /\.button-primary\s*\{[^}]*@variant hover\s*\{\s*@apply border-accent-strong bg-action-hover bg-\(image:--editor-action-gradient\) text-action-text;/s);
  for (const [accent, normalToken, hoverToken] of swatches) {
    for (const token of [normalToken, hoverToken]) {
      const ratio = contrast('#ffffff', tokenValue(token));
      assert.ok(ratio >= 4.5, `${accent} ${token} with white text must meet 4.5:1; got ${ratio.toFixed(2)}:1`);
    }
  }
  const darkThemeBlock = theme.match(/:root\[data-editor-color-scheme="dark"\]\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.doesNotMatch(darkThemeBlock, /--color-accent(?:-strong)?:/);
});

test('theme validation rejects unsafe ids, remote CSS and executable CSS', () => {
  const unsafe = {
    ...BASIC_THEME,
    id: '../outside',
    css: '.article-preview .article-body p { background-image: url(https://example.invalid/a.css); }',
  };
  const errors = validateThemeConfig(unsafe);
  assert.match(errors.join('；'), /主题 ID/);
  assert.match(errors.join('；'), /远程资源|可执行/);

  const executable = { ...BASIC_THEME, css: '@import "https://example.invalid/theme.css";' };
  assert.match(validateThemeConfig(executable).join('；'), /远程资源|规则/);
});

function catalogueCompatibleTheme(theme) {
  return { ...theme, css: '.article-preview { color: var(--color-article-ink); background-color: var(--color-article-quote-surface); }\n.article-preview .article-body p { color: var(--color-article-ink); margin: 0; }', nodes: undefined };
}

test('directory initialization copies every formal theme and edits never rewrite article snapshots', async () => {
  const root = new MemoryDirectoryHandle('isolated-theme-library');
  assert.deepEqual((await loadThemeLibrary(root)).themes, []);
  await initializeThemeDefaults(root);
  const initial = await loadThemeLibrary(root);
  assert.deepEqual(initial.themes.map((theme) => theme.id).sort(), THEMES.map((theme) => theme.id).sort());
  assert.deepEqual(initial.issues, []);

  await saveStoredArticle(root, `${createArticleSource('固定快照', 'basic')}\n# 正文仍在这里\n`, BASIC_THEME);
  const articles = await root.getDirectoryHandle('articles');
  const month = (await articles.entries().next()).value[0];
  const monthDirectory = await articles.getDirectoryHandle(month);
  const folder = (await monthDirectory.entries().next()).value[0];
  const articleDirectory = await monthDirectory.getDirectoryHandle(folder);
  const beforeSnapshot = await readText(articleDirectory, 'theme.json');

  const changedBasic = catalogueCompatibleTheme({ ...BASIC_THEME, name: '基础 / 更新' });
  const saved = await saveThemeLibraryTheme(root, changedBasic);
  const expectedVersion = `${BASIC_THEME.version.split('.').slice(0, 2).join('.')}.${Number(BASIC_THEME.version.split('.')[2]) + 1}`;
  assert.equal(saved.version, expectedVersion);
  const reloaded = await loadThemeLibrary(root);
  assert.equal(reloaded.themes.find((theme) => theme.id === 'basic').name, '基础 / 更新');
  assert.equal(reloaded.themes.find((theme) => theme.id === 'basic').version, expectedVersion);
  assert.equal(await readText(articleDirectory, 'theme.json'), beforeSnapshot);
  const stored = await listStoredArticles(root);
  assert.equal(stored[0].theme.version, BASIC_THEME.version);
  assert.equal(stored[0].themeValid, true);
});

test('legacy themes remain readable but an unsupported new theme cannot be written', async () => {
  const root = new MemoryDirectoryHandle('closed-theme-format');
  await initializeThemeDefaults(root);
  assert.ok((await loadThemeLibrary(root)).themes.some(theme => theme.id === 'basic'));
  // The shipped themes no longer carry a blocking declaration, so the fixture adds one on purpose:
  // unsafe resource/code syntax remains a product boundary, independent of platform rules.
  await assert.rejects(saveThemeLibraryTheme(root, { ...BASIC_THEME, id: 'unlisted-theme', css: `${BASIC_THEME.css}\n.article-preview .article-body { color: expression(alert(1)); }` }), /不安全|可执行/);
  const { directory } = await (await import('../src/lib/themeDirectories.ts')).getThemeDirectory(root, 'article-themes');
  assert.equal(directory.children.has('unlisted-theme.json'), false);
});

test('node overrides join the article stylesheet and unsafe themes are rejected before compilation', async () => {
  const { compileArticleStyles } = await import('../src/lib/tailwind.ts');
  const adjusted = {
    ...BASIC_THEME,
    nodes: { h1: { fontSize: '2.75rem', lineHeight: '1.15', color: 'var(--color-article-accent)' } },
  };
  const adjustedVersion = {
    ...adjusted,
    version: '1.0.1',
    tokens: { ...adjusted.tokens, 'color-article-quote-surface': 'oklch(96% 0.02 28)' },
    nodes: { h1: { fontSize: '3rem', lineHeight: '1.1', color: 'var(--color-article-link)' } },
  };
  const output = themeToCss(adjusted);
  assert.match(output, /\.article-preview \.article-body h1\s*\{[^}]*font-size: 2\.75rem/);
  assert.match(output, /line-height: 1\.15/);
  const tableOutput = themeToCss({ ...BASIC_THEME, nodes: { table: { fontSize: '0.875rem' } } });
  assert.match(tableOutput, /\.article-preview \.article-body table, \.article-preview \.article-body th, \.article-preview \.article-body td/);
  assert.doesNotMatch(tableOutput, /, th, td/);
  const cardPreviewCss = themePreviewCss(adjusted, 'card-basic-v1');
  const editorPreviewCss = themePreviewCss(adjustedVersion, 'editor-basic-v2');
  assert.ok(cardPreviewCss.includes(`--color-article-quote-surface: ${BASIC_THEME.tokens['color-article-quote-surface']}`));
  assert.match(cardPreviewCss, /\.theme-preview-instance-card-basic-v1 \.article-preview \.article-body h1\s*\{[^}]*font-size: 2\.75rem/);
  assert.doesNotMatch(cardPreviewCss, /theme-preview-instance-editor-basic-v2/);
  assert.match(editorPreviewCss, /\.theme-preview-instance-editor-basic-v2 \.article-preview\s*\{[^}]*--color-article-quote-surface: oklch\(96% 0\.02 28\)/);
  assert.match(editorPreviewCss, /\.theme-preview-instance-editor-basic-v2 \.article-preview \.article-body h1\s*\{[^}]*font-size: 3rem/);
  assert.doesNotMatch(editorPreviewCss, /theme-preview-instance-card-basic-v1/);
  assert.doesNotMatch(cardPreviewCss, /@theme|@layer/);
  assert.match(themePreviewCss(RAINY_THEME, 'card-rainy'), /\.theme-preview-instance-card-rainy \.article-preview/);
  await assert.rejects(
    () => compileArticleStyles('# unsafe', { ...BASIC_THEME, css: '@import "https://example.invalid/theme.css";' }),
    /主题配置校验失败/,
  );
});

test('article compilation ignores authored and utility font families without rewriting the source theme', async () => {
  const { compileArticleStyles } = await import('../src/lib/tailwind.ts');
  const theme = { ...BASIC_THEME, css: `${BASIC_THEME.css}\n.article-preview .article-body p { font-family: Georgia; color: var(--color-article-ink); }` };
  assert.deepEqual(validateThemeConfig(theme), [], 'a stored theme remains readable');
  assert.ok(validateArticleFormatCss(theme.css).some(issue => issue.ruleId === 'font-family' && issue.tier === 'warning'), 'official font advice is diagnosed without blocking stored theme reads');
  const { css } = await compileArticleStyles('<p class="font-serif">正文</p>', theme);
  assert.doesNotMatch(css, /\bfont-family\s*:/i, 'neither the theme nor an authored utility changes the preview font');
  assert.match(css, /color-article-ink/, 'other article styles remain');
  assert.match(theme.css, /font-family: Georgia/, 'the source theme stays intact');
});

test('article themes cannot consume editor theme tokens', () => {
  const borrowedCss = { ...BASIC_THEME, css: `${BASIC_THEME.css}\n.article-preview .article-body p { color: var(--color-primary); }` };
  const borrowedToken = { ...BASIC_THEME, tokens: { ...BASIC_THEME.tokens, 'color-article-ink': 'var(--color-primary)' } };
  assert.ok(validateThemeConfig(borrowedCss).some(message => message.includes('color')));
  assert.ok(validateThemeConfig(borrowedToken).some(message => message.includes('color-article-ink')));
});

test('invalid theme files and paths are reported without being loaded or executed', async () => {
  const root = new MemoryDirectoryHandle('isolated-invalid-theme-files');
  const themes = await root.getDirectoryHandle('themes', { create: true });
  (await themes.getFileHandle('broken.json', { create: true })).content = '{broken';
  (await themes.getFileHandle('../outside.json', { create: true })).content = JSON.stringify(BASIC_THEME);
  const result = await loadThemeLibrary(root);
  assert.equal(result.themes.length, 0);
  assert.match(result.issues.map((issue) => issue.message).join('；'), /不是有效 JSON/);
  assert.match(result.issues.map((issue) => issue.message).join('；'), /文件名不安全/);
});

test('failed theme writes leave no partial file and deletion leaves article snapshots intact', async () => {
  const failedRoot = new MemoryDirectoryHandle('isolated-theme-write-failure');
  const { getThemeDirectory } = await import('../src/lib/themeDirectories.ts');
  const { directory: themes } = await getThemeDirectory(failedRoot, 'article-themes');
  themes.failNextWrite = true;
  await assert.rejects(
    () => saveThemeLibraryTheme(failedRoot, catalogueCompatibleTheme({ ...BASIC_THEME, id: 'new-theme', name: '写入失败样本' })),
    /主题文件 new-theme\.json 保存失败/,
  );
  assert.equal(themes.children.has('new-theme.json'), false);

  const root = new MemoryDirectoryHandle('isolated-theme-delete');
  await initializeThemeDefaults(root);
  const saved = await saveStoredArticle(root, `${createArticleSource('旧文章快照', 'basic')}\n# 旧样式继续有效\n`, BASIC_THEME);
  const articles = await root.getDirectoryHandle('articles');
  const month = await articles.getDirectoryHandle(saved.article.month);
  const articleDirectory = await month.getDirectoryHandle(saved.article.folder);
  const snapshot = await readText(articleDirectory, 'theme.json');
  const source = await readText(articleDirectory, 'article.md');
  await deleteThemeLibraryTheme(root, 'basic');
  assert.equal(await readText(articleDirectory, 'theme.json'), snapshot);
  assert.equal(await readText(articleDirectory, 'article.md'), source);
  assert.equal((await listStoredArticles(root))[0].themeValid, true);
  for (const theme of THEMES.filter((theme) => theme.id !== 'basic' && theme.id !== 'rainy')) await deleteThemeLibraryTheme(root, theme.id);
  await assert.rejects(() => deleteThemeLibraryTheme(root, 'rainy'), /至少保留一套主题/);
});

test('unrelated invalid theme files are reported but do not block deleting a valid theme', async () => {
  const root = new MemoryDirectoryHandle('isolated-theme-invalid-delete');
  await initializeThemeDefaults(root);
  const themes = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('article-themes');
  (await themes.getFileHandle('broken.json', { create: true })).content = '{broken';
  await deleteThemeLibraryTheme(root, 'basic');
  const result = await loadThemeLibrary(root);
  assert.deepEqual(result.themes.map((theme) => theme.id).sort(), THEMES.filter((theme) => theme.id !== 'basic').map((theme) => theme.id).sort());
  assert.match(result.issues[0].message, /不是有效 JSON/);
});

test('applying another theme creates an independent copy with matching metadata and snapshot', async () => {
  const root = new MemoryDirectoryHandle('isolated-theme-copy');
  await initializeThemeDefaults(root);
  const original = await saveStoredArticle(root, `${createArticleSource('原文章', 'basic')}\n# 原正文\n![封面](./media/image/cover.png)\n`, BASIC_THEME);
  const articles = await root.getDirectoryHandle('articles');
  const month = await articles.getDirectoryHandle(original.article.month);
  const sourceDirectory = await month.getDirectoryHandle(original.article.folder);
  const imageDirectory = await (await sourceDirectory.getDirectoryHandle('media', { create: true })).getDirectoryHandle('image', { create: true });
  (await imageDirectory.getFileHandle('cover.png', { create: true })).content = 'image bytes';
  const sourceText = await readText(sourceDirectory, 'article.md');
  const sourceSnapshot = await readText(sourceDirectory, 'theme.json');

  const copied = await copyStoredArticle(root, original.article.month, original.article.folder, 'Rainy 副本', original.article.month, RAINY_THEME);
  const targetDirectory = await (await articles.getDirectoryHandle(copied.article.month)).getDirectoryHandle(copied.article.folder);
  const targetSource = await readText(targetDirectory, 'article.md');
  const targetSnapshot = JSON.parse(await readText(targetDirectory, 'theme.json'));
  const targetImage = await (await (await targetDirectory.getDirectoryHandle('media')).getDirectoryHandle('image')).getFileHandle('cover.png');
  assert.equal(copied.article.theme.id, 'rainy');
  assert.equal(copied.article.theme.version, RAINY_THEME.version);
  assert.equal(copied.article.parse.metadata.theme.id, 'rainy');
  assert.equal(copied.article.parse.metadata.theme.version, RAINY_THEME.version);
  assert.equal(targetSnapshot.id, 'rainy');
  assert.match(targetSource, /# 原正文/);
  assert.equal(await (await targetImage.getFile()).text(), 'image bytes');
  assert.equal(await readText(sourceDirectory, 'article.md'), sourceText);
  assert.equal(await readText(sourceDirectory, 'theme.json'), sourceSnapshot);
});
