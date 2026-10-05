import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const themes = await import('../src/lib/editorThemes.ts');
const cache = await import('../src/lib/editorThemeCache.ts');
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function boot(store, dark = false, script = cache.EDITOR_THEME_BOOTSTRAP_SCRIPT) {
  const root = { dataset: { editorThemeState: 'loading' }, style: { setProperty() { throw new Error('Do not write theme tokens on html.style'); } } };
  let style = null;
  const document = { documentElement: root, head: { appendChild(node) { style = node; } }, getElementById(id) { return style?.id === id ? style : null; }, createElement() { return { id: '', textContent: '' }; } };
  vm.runInNewContext(script, { document, window: { localStorage: store, matchMedia: () => ({ matches: dark }) } });
  const writes = [...(style?.textContent ?? '').matchAll(/(--[a-z-]+): ([^;]+);/g)].map(([, key, value]) => [key, value]);
  return { root, style, writes };
}
const saved = { themeId: 'mist', colorMode: 'system', custom: { colorThemeId: 'sunshine', fontThemeId: 'linen' } };

test('older caches preserve Songti for writing and use a code font before hydration', () => {
  const store = storage();
  cache.cacheSavedEditorTheme('directory-a', saved, themes.BUILTIN_EDITOR_THEMES, store);
  const old = JSON.parse(store.getItem(cache.EDITOR_THEME_CACHE_KEY));
  delete old.fonts.articleSource;
  old.fonts.editorSource = '"Songti SC", serif';
  store.setItem(cache.EDITOR_THEME_CACHE_KEY, JSON.stringify(old));
  const normalized = cache.readEditorThemeCache(store), page = boot(store);
  assert.equal(normalized.fonts.articleSource, old.fonts.editorSource);
  assert.equal(normalized.fonts.editorSource, old.fonts.mono);
  assert.deepEqual(page.writes.find(([key]) => key === '--font-article-source'), ['--font-article-source', old.fonts.editorSource]);
  assert.deepEqual(page.writes.find(([key]) => key === '--font-editor-source'), ['--font-editor-source', old.fonts.mono]);
});

test('pre-hydration script restores all colors and fonts with custom combination and system scheme', () => {
  const store = storage();
  assert.equal(cache.cacheSavedEditorTheme('directory-a', saved, themes.BUILTIN_EDITOR_THEMES, store), true);
  for (const dark of [false, true]) {
    const { root, writes } = boot(store, dark);
    const snapshot = cache.readEditorThemeCache(store);
    assert.equal(root.dataset.editorThemeState, 'cached');
    assert.equal(root.dataset.editorColorScheme, dark ? 'dark' : 'light');
    assert.equal(root.dataset.editorTheme, 'custom');
    assert.equal(boot(store, dark).style.id, cache.EDITOR_THEME_STYLE_ID);
    assert.equal(writes.length, 55);
    assert.deepEqual(writes.find(([key]) => key === '--color-accent'), ['--color-accent', snapshot.colors[dark ? 'dark' : 'light'].accent]);
    assert.deepEqual(writes.find(([key]) => key === '--font-eyebrow'), ['--font-eyebrow', snapshot.fonts.eyebrow]);
  }
});

test('snapshot is bound to the remembered directory identity, not its display name', () => {
  const store = storage();
  cache.cacheSavedEditorTheme('directory-a', saved, themes.BUILTIN_EDITOR_THEMES, store);
  cache.activateEditorThemeDirectory('directory-b', store);
  assert.equal(cache.readEditorThemeCache(store), null);
  assert.equal(boot(store).writes.length, 0);
  cache.cacheSavedEditorTheme('directory-b', { themeId: 'ink-white', colorMode: 'light', custom: null }, themes.BUILTIN_EDITOR_THEMES, store);
  assert.equal(cache.readEditorThemeCache(store).directoryId, 'directory-b');
  cache.activateEditorThemeDirectory(null, store);
  assert.equal(store.getItem(cache.EDITOR_THEME_CACHE_KEY), null);
});

test('older startup caches inherit a subheading font without reverting to a fallback theme', () => {
  const store = storage();
  cache.cacheSavedEditorTheme('directory-a', saved, themes.BUILTIN_EDITOR_THEMES, store);
  const previous = JSON.parse(store.getItem(cache.EDITOR_THEME_CACHE_KEY));
  delete previous.fonts.subHeading;
  store.setItem(cache.EDITOR_THEME_CACHE_KEY, JSON.stringify(previous));
  assert.equal(cache.readEditorThemeCache(store).fonts.subHeading, previous.fonts.ui);
  const page = boot(store, true);
  assert.equal(page.root.dataset.editorThemeState, 'cached');
  assert.deepEqual(page.writes.find(([key]) => key === '--font-sub-heading'), ['--font-sub-heading', previous.fonts.ui]);
  const custom = structuredClone(themes.BASE_EDITOR_THEME);
  custom.fonts.subHeading = custom.fonts.mono;
  cache.cacheSavedEditorTheme('directory-a', { themeId: custom.id, custom: null, colorMode: 'light' }, [custom], store);
  assert.equal(cache.readEditorThemeCache(store).fonts.subHeading, custom.fonts.mono);
});

test('corrupt, incomplete and CSS-injection snapshots retain the neutral loading state', () => {
  const store = storage();
  cache.cacheSavedEditorTheme('directory-a', saved, themes.BUILTIN_EDITOR_THEMES, store);
  const original = store.getItem(cache.EDITOR_THEME_CACHE_KEY);
  const variants = [
    () => '{',
    () => { const item = JSON.parse(original); delete item.colors.dark.faint; return JSON.stringify(item); },
    () => { const item = JSON.parse(original); item.fonts.ui = 'url(https://example.test/font)'; return JSON.stringify(item); },
    () => { const item = JSON.parse(original); item.colors.light.canvas = '#fff;display:none'; return JSON.stringify(item); },
    () => { const item = JSON.parse(original); item.version = 2; return JSON.stringify(item); },
    () => 'x'.repeat(32001),
  ];
  for (const variant of variants) {
    store.setItem(cache.EDITOR_THEME_CACHE_KEY, variant());
    assert.equal(cache.readEditorThemeCache(store), null);
    const page = boot(store);
    assert.equal(page.root.dataset.editorThemeState, 'loading');
    assert.equal(page.writes.length, 0);
  }
});

test('storage denial does not block boot or a successful library save', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(boot(denied).root.dataset.editorThemeState, 'loading');
  assert.equal(cache.readEditorThemeCache(denied), null);
  assert.equal(cache.cacheSavedEditorTheme('directory-a', saved, themes.BUILTIN_EDITOR_THEMES, denied), false);
  assert.doesNotThrow(() => cache.activateEditorThemeDirectory(null, denied));
});

test('external theme changes replace the snapshot only after validated theme data arrives', () => {
  const store = storage();
  const custom = structuredClone(themes.BASE_EDITOR_THEME);
  custom.id = 'my-import';
  const appearance = { themeId: custom.id, colorMode: 'dark', custom: null };
  cache.cacheSavedEditorTheme('directory-a', appearance, [custom], store);
  const before = cache.readEditorThemeCache(store).colors.dark.accent;
  custom.palette[custom.colors.dark.accent] = '#123456';
  cache.cacheSavedEditorTheme('directory-a', appearance, [custom], store);
  assert.notEqual(cache.readEditorThemeCache(store).colors.dark.accent, before);
  assert.equal(cache.readEditorThemeCache(store).colors.dark.accent, '#123456');
  assert.equal(cache.cacheSavedEditorTheme('directory-a', appearance, [], store), false);
  assert.equal(cache.readEditorThemeCache(store), null);
});

test('transpiled bootstrap is self-contained and the static shell embeds it before the body', async () => {
  const source = await readFile(new URL('../src/lib/editorThemeCache.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: () => themes });
  const store = storage(); cache.cacheSavedEditorTheme('directory-a', saved, themes.BUILTIN_EDITOR_THEMES, store);
  assert.equal(boot(store, true, module.exports.EDITOR_THEME_BOOTSTRAP_SCRIPT).root.dataset.editorThemeState, 'cached');
  const layout = await readFile(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
  assert.ok(layout.indexOf('EDITOR_THEME_BOOTSTRAP_SCRIPT }}') < layout.indexOf('<body>'));
});
