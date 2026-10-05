import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import * as themes from '../src/lib/editorThemes.ts';
import * as cache from '../src/lib/editorThemeCache.ts';

function themeWithSurfaces() {
  const theme = structuredClone(themes.BASE_EDITOR_THEME);
  theme.id = 'soft-surfaces';
  theme.palette = { ...theme.palette, 'test-tint': '#45556c', 'test-light': '#cefafe', 'test-dark': '#104e64' };
  theme.surfaces = Object.fromEntries(['light', 'dark'].map(mode => [mode, {
    primaryButton: mode === 'light' ? 'test-light' : 'test-dark', primaryText: mode === 'light' ? 'test-tint' : 'test-light',
    primaryHover: ['test-light', 'test-dark', 'test-tint', 'test-light'], secondaryButton: 'test-light', eyebrow: 'test-tint', dangerSurface: 'test-light',
    field: { color: 'test-tint', opacity: 5 }, shadow: { color: 'test-dark', opacity: mode === 'light' ? 67 : 30 }, canvasWash: { colors: ['test-light', 'test-dark', 'test-tint'], opacity: 8 },
  }]));
  return theme;
}
function storage() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}
function boot(store, dark = false) {
  const root = { dataset: {}, style: { setProperty() { throw new Error('Do not write theme tokens on html.style'); } } };
  let style = null;
  const document = { documentElement: root, head: { appendChild(node) { style = node; } }, getElementById(id) { return style?.id === id ? style : null; }, createElement() { return { id: '', textContent: '' }; } };
  vm.runInNewContext(cache.EDITOR_THEME_BOOTSTRAP_SCRIPT, { document, window: { localStorage: store, matchMedia: () => ({ matches: dark }) } });
  const values = new Map([...(style?.textContent ?? '').matchAll(/(--[a-z-]+): ([^;]+);/g)].map(([, key, value]) => [key, value]));
  return { root, values };
}

test('surface JSON roundtrips palette references and rejects CSS, unknown fields, malformed stops and out-of-range opacity', () => {
  const theme = themeWithSurfaces();
  assert.deepEqual(themes.validateEditorTheme(theme), []);
  assert.deepEqual(themes.parseEditorThemeJson(JSON.stringify(theme)), theme);
  for (const mutate of [
    value => { value.surfaces.light.primaryHover[0] = 'red); url(https://example.test)'; },
    value => { value.surfaces.light.primaryHover.pop(); },
    value => { value.surfaces.light.canvasWash.colors.push('test-tint'); },
    value => { value.surfaces.light.shadow.opacity = 101; },
    value => { value.surfaces.light.field.opacity = '5'; },
    value => { value.surfaces.light.field.color = 'missing'; },
    value => { value.surfaces.light.shadow.opacity = -1; },
    value => { value.surfaces.light.arbitraryCss = 'body{}'; },
  ]) {
    const bad = structuredClone(theme); mutate(bad);
    assert.throws(() => themes.parseEditorThemeJson(JSON.stringify(bad)), /surfaces/);
  }
});

test('color composition and system scheme restore the same surfaces before hydration and at runtime', () => {
  const theme = themeWithSurfaces(), store = storage();
  const appearance = { themeId: themes.BASE_EDITOR_THEME.id, colorMode: 'system', custom: { colorThemeId: theme.id, fontThemeId: themes.BASE_EDITOR_THEME.id } };
  assert.equal(cache.cacheSavedEditorTheme('directory-a', appearance, [theme, themes.BASE_EDITOR_THEME], store), true);
  const saved = cache.readEditorThemeCache(store);
  for (const dark of [false, true]) {
    const page = boot(store, dark), scheme = dark ? 'dark' : 'light';
    const expected = themes.editorSurfaceTokens(themes.resolveEditorThemeColors(theme, scheme), themes.resolveEditorThemeSurfaces(theme)[scheme]);
    assert.equal(page.root.dataset.editorColorScheme, scheme);
    for (const [key, value] of Object.entries(expected)) assert.equal(page.values.get(key), value);
    const runtimeRoot = { dataset: {}, style: { setProperty() { throw new Error('Do not write theme tokens on html.style'); } } };
    let runtimeStyle = null;
    const runtimeDocument = { documentElement: runtimeRoot, head: { appendChild(node) { runtimeStyle = node; } }, getElementById(id) { return runtimeStyle?.id === id ? runtimeStyle : null; }, createElement() { return { id: '', textContent: '' }; } };
    cache.applyEditorThemeCache(runtimeDocument, saved, dark);
    const runtime = new Map([...runtimeStyle.textContent.matchAll(/(--[a-z-]+): ([^;]+);/g)].map(([, key, value]) => [key, value]));
    assert.deepEqual(runtime, page.values);
    assert.equal(page.values.get('--font-sans'), themes.BASE_EDITOR_THEME.fonts.ui);
  }
});

test('plain hover and opaque fields restore without gradients, while optional backdrop colors remain validated', () => {
  const theme = themeWithSurfaces(), store = storage();
  for (const mode of ['light', 'dark']) {
    const surface = theme.surfaces[mode];
    surface.primaryHover = 'test-tint';
    surface.field = { color: 'test-dark', opacity: 100 };
    surface.canvasWash.opacity = 0;
    surface.backdrop = { color: 'test-dark', opacity: mode === 'light' ? 20 : 60 };
  }
  assert.deepEqual(themes.parseEditorThemeJson(JSON.stringify(theme)), theme);
  assert.equal(cache.cacheSavedEditorTheme('directory-a', { themeId: theme.id, colorMode: 'system', custom: null }, [theme], store), true);
  for (const dark of [false, true]) {
    const page = boot(store, dark);
    assert.equal(page.values.get('--editor-action-gradient'), 'none');
    assert.equal(page.values.get('--editor-canvas-wash'), 'none');
    assert.equal(page.values.get('--color-action-hover'), theme.palette['test-tint']);
    assert.equal(page.values.get('--editor-field-background'), theme.palette['test-dark']);
    assert.equal(page.values.get('--editor-dialog-backdrop'), `color-mix(in srgb, ${theme.palette['test-dark']} ${dark ? 60 : 20}%, transparent)`);
  }
  for (const mutate of [value => { value.surfaces.light.backdrop.color = 'url(x)'; }, value => { value.surfaces.dark.backdrop.opacity = 101; }]) {
    const bad = structuredClone(theme); mutate(bad);
    assert.throws(() => themes.parseEditorThemeJson(JSON.stringify(bad)), /surfaces/);
  }
});

test('forged cached surfaces cannot inject CSS during boot', () => {
  const theme = themeWithSurfaces(), store = storage();
  cache.cacheSavedEditorTheme('directory-a', { themeId: theme.id, colorMode: 'light', custom: null }, [theme], store);
  const source = store.getItem(cache.EDITOR_THEME_CACHE_KEY);
  for (const mutate of [value => { value.surfaces.dark.primaryText = 'red'; }, value => { value.surfaces.light.shadow.color = '#fff); url(x)'; }, value => { value.surfaces.light.field.opacity = Infinity; }]) {
    const bad = JSON.parse(source); mutate(bad);
    store.setItem(cache.EDITOR_THEME_CACHE_KEY, JSON.stringify(bad));
    assert.equal(cache.readEditorThemeCache(store), null);
    assert.equal(boot(store).values.size, 0);
  }
});

test('switching to a legacy theme explicitly clears gradients and restores its original control surfaces', () => {
  const theme = themes.BASE_EDITOR_THEME;
  const colors = themes.resolveEditorThemeColors(theme, 'light');
  const reset = themes.editorSurfaceTokens(colors);
  assert.equal(reset['--editor-action-gradient'], 'none');
  assert.equal(reset['--editor-canvas-wash'], 'none');
  assert.equal(reset['--color-action'], colors.accent);
  assert.equal(reset['--color-action-text'], colors['on-accent']);
  assert.equal(reset['--editor-field-background'], colors.panel);
  assert.equal(reset['--color-button-surface'], 'transparent');
});

test('compiled shared controls retain runtime shadow variables instead of inlining a fallback theme', async () => {
  const base = fileURLToPath(new URL('../src/styles/', import.meta.url));
  const source = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  const compiler = await compile(source, { base, onDependency() {} });
  const css = compiler.build([]);
  const dialog = css.slice(css.indexOf('.dialog-card'), css.indexOf('.dialog-header'));
  assert.match(dialog, /--tw-shadow: var\(--editor-dialog-shadow\)/);
  assert.doesNotMatch(dialog, /--tw-shadow: 0 2rem/);
  assert.match(css, /--tw-shadow: var\(--editor-popup-shadow\)/);
  assert.match(css, /background-color: var\(--editor-field-background\)/);
  assert.match(css, /background-image: var\(--editor-action-gradient\)/);
});

test('editing and forking a soft theme preserve surfaces and keep preview tokens independent of the enclosing theme', async () => {
  const source = await readFile(new URL('../src/components/settings/EditorThemeDesigner.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output + '\nexports.Preview = Preview;', { module, exports: module.exports, require(id) {
    if (id.endsWith('/editorThemes')) return themes;
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/editorSourceHighlight')) return { tokenizeEditorSource: value => [{ text: value }] };
    if (id.endsWith('/ThemeInspection')) return { ThemeInspectionPreview: 'inspection-preview' };
    return {};
  } });
  const original = themeWithSurfaces(), before = JSON.stringify(original);
  const fork = module.exports.forkEditorTheme(original);
  assert.deepEqual(themes.validateEditorTheme(fork), []);
  assert.deepEqual(JSON.parse(JSON.stringify(themes.resolveEditorThemeSurfaces(fork))), themes.resolveEditorThemeSurfaces(original));
  assert.notEqual(fork.surfaces, original.surfaces);
  for (const mode of ['light', 'dark']) {
    const rendered = module.exports.Preview({ theme: original, mode }).props.children;
    const expected = themes.editorSurfaceTokens(themes.resolveEditorThemeColors(original, mode), themes.resolveEditorThemeSurfaces(original)[mode]);
    for (const [key, value] of Object.entries(expected)) assert.equal(rendered.props.style[key], value);
    const legacyPreview = module.exports.Preview({ theme: themes.BASE_EDITOR_THEME, mode }).props.children;
    assert.equal(legacyPreview.props.style['--editor-action-gradient'], 'none');
    assert.equal(legacyPreview.props.style['--editor-canvas-wash'], 'none');
  }
  fork.surfaces.light.field.opacity = 10;
  assert.equal(JSON.stringify(original), before);
  assert.ok(Object.keys(fork.palette).length <= 100);
  const plain = structuredClone(original);
  plain.surfaces.light.primaryHover = 'test-tint';
  plain.surfaces.light.backdrop = { color: 'test-dark', opacity: 20 };
  const plainFork = module.exports.forkEditorTheme(plain);
  assert.deepEqual(themes.validateEditorTheme(plainFork), []);
  assert.deepEqual(JSON.parse(JSON.stringify(themes.resolveEditorThemeSurfaces(plainFork))), themes.resolveEditorThemeSurfaces(plain));
  const plainPreview = module.exports.Preview({ theme: plainFork, mode: 'light' }).props.children;
  assert.equal(plainPreview.props.style['--editor-action-gradient'], 'none');
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const nodes = walk(plainPreview);
  assert.equal(nodes.find(node => node.type === 'input').props.placeholder, '测试表单');
  const sample = nodes.find(node => node.type === 'button' && node.props.children === '测试按钮');
  assert.ok(sample);
  assert.equal(sample.props.onClick, undefined);
});
