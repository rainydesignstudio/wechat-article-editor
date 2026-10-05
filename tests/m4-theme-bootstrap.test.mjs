import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

const themes = await import('../src/lib/editorThemes.ts');
const cache = await import('../src/lib/editorThemeCache.ts');
const { createDefaultEditorWorkspace } = await import('../src/lib/editorWorkspace.ts');
const source = await readFile(new URL('../src/components/global/AppProviders.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function provider(storage = { getItem() { return null; }, setItem() {}, removeItem() {} }, media = { matches: false, addEventListener() {}, removeEventListener() {} }) {
  let cursor = 0;
  const cells = [];
  const effects = [];
  const writes = [];
  const values = new Map();
  const controller = { editorAppearanceReady: false, editorAppearanceVerified: false, editorDirectoryId: null, editorWorkspace: createDefaultEditorWorkspace(), editorThemes: [...themes.BUILTIN_EDITOR_THEMES] };
  const root = {
    dataset: new Proxy({ editorThemeState: 'loading' }, { set(object, key, value) { writes.push([key, value]); object[key] = value; return true; } }),
    style: { setProperty() { throw new Error('Do not write theme tokens on html.style'); } },
  };
  let themeStyle = null;
  const document = {
    documentElement: root,
    head: { appendChild(node) { themeStyle = node; } },
    getElementById(id) { return themeStyle?.id === id ? themeStyle : null; },
    createElement() { return { id: '', textContent: '' }; },
  };
  function useEffect(effect, dependencies) { const index = cursor++; const old = cells[index]; if (old && dependencies.every((value, i) => Object.is(value, old.dependencies[i]))) return; effects.push(() => { old?.cleanup?.(); cells[index] = { dependencies, cleanup: effect() }; }); }
  let tree;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports, module,
    document,
    window: { matchMedia: () => media },
    require(id) {
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/useEditorController')) return { useEditorController: () => controller };
      if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => ({ error: null }) };
      if (id.endsWith('/editorThemes')) return themes;
      if (id.endsWith('/editorThemeCache')) return { ...cache,
        readEditorThemeCache: () => cache.readEditorThemeCache(storage),
        cacheSavedEditorTheme: (id, appearance, themes) => cache.cacheSavedEditorTheme(id, appearance, themes, storage),
      };
      if (id === 'react') return {
        createContext: () => ({ Provider: 'provider' }), useContext() {},
        useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = typeof value === 'function' ? value() : value; return [cells[index], (next) => { cells[index] = next; }]; },
        useEffect, useLayoutEffect: useEffect,
      };
      throw new Error(`Unexpected provider import: ${id}`);
    },
  });
  function render() { cursor = 0; tree = module.exports.AppProviders({ children: 'app' }); while (effects.length) effects.shift()(); values.clear(); for (const [, key, value] of (themeStyle?.textContent ?? '').matchAll(/(--[a-z-]+): ([^;]+);/g)) values.set(key, value); }
  return { controller, root, values, writes, render, context: () => tree.props.value };
}

test('refresh keeps the shell hidden until the selected theme has finished loading', () => {
  const page = provider();
  page.render();
  assert.equal(page.writes.length, 0);
  assert.equal(page.root.dataset.editorThemeState, 'loading');
  const custom = structuredClone(themes.BASE_EDITOR_THEME);
  custom.id = 'custom-loaded'; custom.palette[custom.colors.light.canvas] = '#faf5ed';
  custom.fonts.eyebrow = custom.fonts.mono;
  page.controller.editorWorkspace.appearance = { themeId: custom.id, colorMode: 'light', custom: null };
  page.render();
  assert.equal(page.writes.length, 0, 'a not-yet-present theme must not trigger fallback');
  page.controller.editorThemes = [...page.controller.editorThemes, custom];
  page.controller.editorAppearanceReady = true;
  page.render();
  assert.equal(page.values.get('--color-canvas'), '#faf5ed');
  assert.equal(page.values.get('--font-eyebrow'), custom.fonts.mono);
  assert.equal(page.root.dataset.editorTheme, custom.id);
  assert.equal(page.root.dataset.editorThemeState, 'ready');
  assert.deepEqual(page.writes.at(-1), ['editorThemeState', 'ready'], 'reveal follows colors and fonts');
  assert.equal(page.values.get('--color-canvas'), '#faf5ed', 'no default theme is painted first');
});

test('an unconfigured library defaults to Slate and follows the system scheme', () => {
  let listener;
  const media = { matches: false, addEventListener(_event, callback) { listener = callback; }, removeEventListener() {} };
  const page = provider(undefined, media);
  assert.equal(page.controller.editorWorkspace.appearance.themeId, 'rainy-studio-slate');
  assert.equal(page.controller.editorWorkspace.appearance.colorMode, 'system');
  page.controller.editorAppearanceReady = true;
  page.render();
  assert.equal(page.root.dataset.editorTheme, 'rainy-studio-slate');
  assert.equal(page.root.dataset.colorMode, 'system');
  assert.equal(page.values.get('--font-sans'), themes.DEFAULT_EDITOR_THEME.fonts.ui);
  assert.equal(page.root.dataset.editorColorScheme, 'light');
  media.matches = true;
  listener(); page.render();
  assert.equal(page.root.dataset.editorColorScheme, 'dark');
  assert.equal(page.values.get('--color-canvas'), themes.resolveEditorThemeColors(themes.DEFAULT_EDITOR_THEME, 'dark').canvas);
});

test('live color-theme composition switches surfaces and clears them when returning to a legacy theme', () => {
  const page = provider(), soft = structuredClone(themes.BASE_EDITOR_THEME);
  soft.id = 'soft-theme';
  const a = soft.colors.light.primary, b = soft.colors.dark.primary;
  soft.surfaces = Object.fromEntries(['light', 'dark'].map(mode => [mode, {
    primaryButton: a, primaryText: b, primaryHover: [a, b, a, b], secondaryButton: b, eyebrow: a, dangerSurface: a,
    field: { color: a, opacity: 5 }, shadow: { color: b, opacity: 67 }, canvasWash: { colors: [a, b, a], opacity: 8 },
  }]));
  page.controller.editorThemes.push(soft);
  page.controller.editorWorkspace.appearance = { themeId: soft.id, colorMode: 'light', custom: { colorThemeId: soft.id, fontThemeId: themes.BASE_EDITOR_THEME.id } };
  page.controller.editorAppearanceReady = true;
  page.render();
  assert.ok(page.values.get('--editor-action-gradient').startsWith('linear-gradient('));
  assert.equal(page.values.get('--color-action'), soft.palette[a]);
  assert.equal(page.values.get('--font-sans'), themes.BASE_EDITOR_THEME.fonts.ui);
  page.controller.editorWorkspace.appearance = { themeId: soft.id, colorMode: 'dark', custom: null };
  page.render();
  assert.equal(page.values.get('--color-action'), soft.palette[a]);
  assert.equal(page.root.dataset.editorColorScheme, 'dark');
  page.controller.editorWorkspace.appearance = { themeId: themes.BASE_EDITOR_THEME.id, colorMode: 'light', custom: null };
  page.render();
  assert.equal(page.values.get('--editor-action-gradient'), 'none');
  assert.equal(page.values.get('--editor-canvas-wash'), 'none');
  assert.equal(page.values.get('--color-action'), themes.resolveEditorThemeColors(themes.BASE_EDITOR_THEME, 'light').accent);
});

test('directory changes retain the validated theme until the next result; failed detection may then fall back', () => {
  const page = provider();
  page.controller.editorWorkspace.appearance.themeId = 'flowing-violet';
  page.controller.editorAppearanceReady = true;
  page.render();
  const before = [...page.values];
  const writes = page.writes.length;
  page.controller.editorAppearanceReady = false;
  page.controller.editorWorkspace = createDefaultEditorWorkspace();
  page.render();
  assert.deepEqual([...page.values], before);
  assert.equal(page.writes.length, writes);
  page.controller.editorWorkspace.appearance.themeId = 'missing-after-library-check';
  page.controller.editorAppearanceReady = true;
  page.render();
  assert.equal(page.values.get('--color-accent'), themes.resolveEditorThemeColors(themes.DEFAULT_EDITOR_THEME, 'light').accent);
  assert.equal(page.root.dataset.editorTheme, themes.DEFAULT_EDITOR_THEME.id);
});

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('cached custom colors and six font roles survive startup; temporary previews never replace saved cache', () => {
  const storage = memoryStorage();
  const saved = { themeId: 'mist', colorMode: 'dark', custom: { colorThemeId: 'sunshine', fontThemeId: 'linen' } };
  assert.equal(cache.cacheSavedEditorTheme('directory-a', saved, themes.BUILTIN_EDITOR_THEMES, storage), true);
  const page = provider(storage);
  page.render(); page.render();
  assert.equal(page.root.dataset.editorThemeState, 'cached');
  assert.equal(page.values.get('--color-accent'), themes.resolveEditorThemeColors(themes.BUILTIN_EDITOR_THEMES.find(t => t.id === 'sunshine'), 'dark').accent);
  assert.equal(page.context().displayedEditorAppearance.colorMode, 'dark');
  page.controller.editorWorkspace.appearance = saved;
  page.controller.editorDirectoryId = 'directory-a';
  page.controller.editorAppearanceReady = true;
  page.controller.editorAppearanceVerified = true;
  page.render();
  const before = storage.getItem(cache.EDITOR_THEME_CACHE_KEY);
  page.context().previewEditorAppearance({ themeId: 'flowing-violet', colorMode: 'light', custom: null });
  page.render();
  assert.equal(page.root.dataset.editorTheme, 'flowing-violet');
  assert.equal(storage.getItem(cache.EDITOR_THEME_CACHE_KEY), before);
  // Only the successful persisted workspace update can replace the snapshot.
  page.controller.editorWorkspace.appearance = page.context().editorAppearancePreview;
  page.render();
  assert.equal(cache.readEditorThemeCache(storage).appearance.themeId, 'flowing-violet');
});

test('failed directory theme reads do not cache a fallback workspace', () => {
  const storage = memoryStorage();
  const page = provider(storage);
  page.controller.editorDirectoryId = 'directory-a';
  page.controller.editorAppearanceReady = true;
  page.render();
  assert.equal(storage.getItem(cache.EDITOR_THEME_CACHE_KEY), null);
});

test('later directory switches keep the last validated theme, never reapply the startup snapshot', () => {
  const storage = memoryStorage();
  cache.cacheSavedEditorTheme('directory-a', { themeId: 'sunshine', colorMode: 'light', custom: null }, themes.BUILTIN_EDITOR_THEMES, storage);
  const page = provider(storage);
  page.render(); page.render();
  page.controller.editorWorkspace.appearance = { themeId: 'ink-white', colorMode: 'dark', custom: null };
  page.controller.editorAppearanceReady = true;
  page.render(); page.render();
  const before = [...page.values];
  page.controller.editorAppearanceReady = false;
  page.controller.editorWorkspace = createDefaultEditorWorkspace();
  page.render();
  assert.deepEqual([...page.values], before);
  assert.equal(page.root.dataset.editorTheme, 'ink-white');
});
