import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const {
  BASE_EDITOR_THEME,
  BUILTIN_EDITOR_THEMES,
  EDITOR_COLOR_ROLES,
  composeLegacyEditorTheme,
  parseEditorThemeJson,
  resolveEditorThemeColors,
  validateEditorTheme,
} = await import('../src/lib/editorThemes.ts');
const { BASIC_THEME } = await import('../src/lib/themes.ts');
const { parseThemeConfigJson } = await import('../src/lib/themeValidation.ts');

function copy(value) { return JSON.parse(JSON.stringify(value)); }

test('every built-in editor theme supplies the same 33 roles for light and dark', () => {
  assert.equal(EDITOR_COLOR_ROLES.length, 33);
  assert.equal(BUILTIN_EDITOR_THEMES.length >= 11, true);
  for (const theme of BUILTIN_EDITOR_THEMES) {
    assert.deepEqual(validateEditorTheme(theme), []);
    assert.deepEqual(Object.keys(theme.colors.light), EDITOR_COLOR_ROLES);
    assert.deepEqual(Object.keys(theme.colors.dark), EDITOR_COLOR_ROLES);
    assert.match(resolveEditorThemeColors(theme, 'light').canvas, /^#/);
  }
});

test('new themes retain readable interface, button and source text in both schemes', () => {
  const luminance = (hex) => {
    const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const id of ['flowing-violet', 'evening-snow', 'sunshine', 'ink-white', 'flowing-violet-ii', 'evening-snow-ii', 'dreaming']) {
    const theme = BUILTIN_EDITOR_THEMES.find((item) => item.id === id);
    for (const scheme of ['light', 'dark']) {
      const colors = resolveEditorThemeColors(theme, scheme);
      for (const [foreground, background] of [['primary', 'panel'], ['muted', 'panel'], ['on-accent', 'accent'], ['editor-text', 'editor-surface']]) {
        const [low, high] = [luminance(colors[foreground]), luminance(colors[background])].sort((a, b) => a - b);
        assert.ok((high + 0.05) / (low + 0.05) >= 4.5, `${id}/${scheme}/${foreground}`);
      }
    }
  }
});

test('bundled editor theme catalog contains the current library selection', () => {
  assert.deepEqual(BUILTIN_EDITOR_THEMES.map((theme) => theme.id), [
    'sea-glass', 'linen', 'mist', 'rainy-studio-slate', 'flowing-violet', 'evening-snow',
    'sunshine', 'ink-white', 'flowing-violet-ii', 'evening-snow-ii', 'dreaming',
  ]);
  assert.equal(BUILTIN_EDITOR_THEMES.find((theme) => theme.id === 'dreaming')?.name, '梦华');
});

test('Ink White is monochrome across every role, including feedback colors', () => {
  const theme = BUILTIN_EDITOR_THEMES.find((item) => item.id === 'ink-white');
  for (const scheme of ['light', 'dark']) {
    for (const [role, hex] of Object.entries(resolveEditorThemeColors(theme, scheme))) {
      assert.equal(hex.slice(1, 3), hex.slice(3, 5), `${scheme}/${role}`);
      assert.equal(hex.slice(3, 5), hex.slice(5, 7), `${scheme}/${role}`);
    }
  }
});

test('editor theme parser rejects incomplete, unsafe, and article-theme inputs', () => {
  const incomplete = copy(BASE_EDITOR_THEME);
  delete incomplete.colors.dark['editor-quote'];
  assert.throws(() => parseEditorThemeJson(JSON.stringify(incomplete)), /缺少 editor-quote/);

  const unsafe = copy(BASE_EDITOR_THEME);
  unsafe.palette['sea-glass-100'] = 'url(https://example.test/style.css)';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(unsafe)), /十六进制颜色/);

  const article = copy(BASE_EDITOR_THEME);
  article.kind = 'article-theme';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(article)), /editor-theme/);

  const fontInjection = copy(BASE_EDITOR_THEME);
  fontInjection.fonts.ui = 'Sen; color: red';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(fontInjection)), /不安全/);
});

test('legacy appearance composition preserves selected base palette, accent, and font', () => {
  const migrated = composeLegacyEditorTheme('linen', 'berry', 'serif');
  const linen = BUILTIN_EDITOR_THEMES.find((theme) => theme.id === 'linen');
  const legacyMist = parseEditorThemeJson(readFileSync(new URL('../src/themes/editor-themes/editor-theme-mist-legacy.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateEditorTheme(migrated), []);
  assert.equal(resolveEditorThemeColors(migrated, 'light').canvas, resolveEditorThemeColors(linen, 'light').canvas);
  assert.equal(resolveEditorThemeColors(migrated, 'dark').accent, resolveEditorThemeColors(legacyMist, 'dark').accent);
  assert.equal(migrated.fonts.ui, linen.fonts.serif);
  assert.equal(migrated.fonts.heading, migrated.fonts.ui);
});

test('v1 theme reads upgrade only in memory, while v2 heading is required and independently validated', () => {
  const legacy = JSON.parse(readFileSync(new URL('../src/themes/editor-themes/editor-theme-mist-legacy.json', import.meta.url), 'utf8'));
  legacy.formatVersion = 1; delete legacy.fonts.heading; delete legacy.fonts.eyebrow; delete legacy.fonts.subHeading; delete legacy.fonts.articleSource;
  const before = JSON.stringify(legacy);
  const normalized = parseEditorThemeJson(before);
  assert.equal(normalized.formatVersion, 4);
  assert.equal(normalized.fonts.heading, legacy.fonts.ui);
  assert.deepEqual(normalized.colors, legacy.colors);
  assert.deepEqual(normalized.palette, legacy.palette);
  assert.equal(JSON.stringify(legacy), before);
  assert.deepEqual(parseEditorThemeJson(JSON.stringify(normalized)), normalized);

  const missing = copy(BASE_EDITOR_THEME);
  delete missing.fonts.heading;
  assert.throws(() => parseEditorThemeJson(JSON.stringify(missing)), /缺少 heading/);
  const unsafe = copy(BASE_EDITOR_THEME);
  unsafe.fonts.heading = 'serif; background: url(evil)';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(unsafe)), /不安全/);
  const unknown = copy(BASE_EDITOR_THEME);
  unknown.formatVersion = 5;
  assert.throws(() => parseEditorThemeJson(JSON.stringify(unknown)), /仅支持1、2、3或4/);
  legacy.fonts.heading = legacy.fonts.ui;
  assert.throws(() => parseEditorThemeJson(JSON.stringify(legacy)), /未知字段 heading/);
});

test('eyebrow fonts are independently configurable and old v2 files inherit UI fonts in memory', () => {
  const old = copy(BASE_EDITOR_THEME);
  old.formatVersion = 2; delete old.fonts.subHeading; delete old.fonts.articleSource;
  delete old.fonts.eyebrow;
  const source = JSON.stringify(old);
  const loaded = parseEditorThemeJson(source);
  assert.equal(loaded.fonts.eyebrow, old.fonts.ui);
  assert.equal(JSON.stringify(old), source);
  loaded.fonts.eyebrow = loaded.fonts.mono;
  const restored = parseEditorThemeJson(JSON.stringify(loaded));
  assert.equal(restored.fonts.eyebrow, loaded.fonts.mono);
  assert.equal(restored.fonts.ui, old.fonts.ui);
  const unsafe = copy(loaded);
  unsafe.fonts.eyebrow = 'sans-serif; color: red';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(unsafe)), /eyebrow.*不安全/);
  for (const theme of BUILTIN_EDITOR_THEMES) assert.equal(theme.fonts.eyebrow, theme.fonts.ui, theme.id);
});

test('three retained themes match current color/font baselines exactly', () => {
  const baselines = {
    'sea-glass': 'da24061a113cda26b9ed403a70f91b4997c9abb7107378baf096ae5edbbd35f8',
    linen: '394cff3f032915e2f7c05442aee679b91f4264afdb03b5be4bf936261e74a7b0',
    'rainy-studio-slate': '97f67e3192117f547db7a4366cd86155d19000b92538250316771d77d5881f16',
  };
  for (const [id, baseline] of Object.entries(baselines)) {
    const theme = BUILTIN_EDITOR_THEMES.find((item) => item.id === id);
    const { heading, subHeading, eyebrow, articleSource, ...fonts } = theme.fonts;
    assert.equal(heading, fonts.ui);
    assert.equal(eyebrow, fonts.ui);
    const colors = Object.fromEntries(['light', 'dark'].map((mode) => [mode, Object.values(resolveEditorThemeColors(theme, mode))]));
    const signature = createHash('sha256').update(JSON.stringify({ colors, fonts })).digest('hex');
    assert.equal(signature, baseline, id);
  }
});

test('Mist uses neutral grays and serif headings while feedback and other fonts stay intact', () => {
  const mist = BUILTIN_EDITOR_THEMES.find((theme) => theme.id === 'mist');
  const legacy = parseEditorThemeJson(readFileSync(new URL('../src/themes/editor-themes/editor-theme-mist-legacy.json', import.meta.url), 'utf8'));
  assert.equal(mist.fonts.heading, legacy.fonts.serif);
  assert.notEqual(mist.fonts.heading, mist.fonts.ui);
  for (const role of ['ui', 'serif', 'mono', 'editorSource']) assert.equal(mist.fonts[role], legacy.fonts[role]);
  const feedback = ['success', 'success-surface', 'warning', 'warning-strong', 'warning-surface', 'warning-line', 'danger'];
  for (const mode of ['light', 'dark']) {
    const colors = resolveEditorThemeColors(mist, mode);
    const oldColors = resolveEditorThemeColors(legacy, mode);
    for (const role of EDITOR_COLOR_ROLES) {
      if (feedback.includes(role)) assert.equal(colors[role], oldColors[role]);
      else {
        const rgb = colors[role].match(/^#(..)(..)(..)$/).slice(1);
        assert.equal(rgb[0], rgb[1], `${mode}.${role}`);
        assert.equal(rgb[1], rgb[2], `${mode}.${role}`);
      }
    }
  }
  const migrated = composeLegacyEditorTheme('mist', 'berry', 'sans');
  for (const mode of ['light', 'dark']) assert.deepEqual(resolveEditorThemeColors(migrated, mode), resolveEditorThemeColors(legacy, mode));
});

test('published editor template includes an independent heading font and all fallback colors', () => {
  const template = parseEditorThemeJson(readFileSync(new URL('../public/presets/editor-theme-template.json', import.meta.url), 'utf8'));
  assert.deepEqual(template, BASE_EDITOR_THEME);
  const composed = { ...template, id: 'mixed-heading-test', fonts: { ...BUILTIN_EDITOR_THEMES.find((theme) => theme.id === 'mist').fonts } };
  const restored = parseEditorThemeJson(JSON.stringify(composed));
  assert.equal(restored.fonts.heading, restored.fonts.serif);
  assert.notEqual(restored.fonts.heading, restored.fonts.ui);
  assert.deepEqual(restored.colors, template.colors);
});

test('existing article theme snapshots remain readable with or without the new kind marker', () => {
  const marked = { ...BASIC_THEME, kind: 'article-theme' };
  assert.equal(parseThemeConfigJson(JSON.stringify(marked)).kind, 'article-theme');
  const legacy = copy(marked);
  delete legacy.kind;
  assert.equal(parseThemeConfigJson(JSON.stringify(legacy)).id, 'basic');
});

test('Rainy Studio uses complete slate colors and locally bundled Google fonts', () => {
  const studio = BUILTIN_EDITOR_THEMES.find((theme) => theme.id === 'rainy-studio-slate');
  assert.ok(studio);
  assert.equal(resolveEditorThemeColors(studio, 'light').accent, '#62748e');
  assert.equal(resolveEditorThemeColors(studio, 'dark').accent, '#90a1b9');
  for (const [family, asset, license] of [
    ['Sen Local', 'sen-variable.ttf', 'sen-OFL.txt'],
    ['Noto Sans SC Local', 'noto-sans-sc-variable.ttf', 'noto-sans-sc-OFL.txt'],
    ['Roboto Mono Local', 'roboto-mono-variable.ttf', 'roboto-mono-OFL.txt'],
  ]) {
    assert.ok(Object.values(studio.fonts).some((stack) => stack.includes(family)));
    assert.ok(existsSync(new URL(`../public/${asset}`, import.meta.url)));
    assert.match(readFileSync(new URL(`../public/${license}`, import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/);
  }
  const css = readFileSync(new URL('../src/styles/editor-theme.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(css, /@font-face/, 'font faces are loaded from the authorized data directory');
});

test('v3 migration preserves the writing font and splits code font without rewriting the source', () => {
  const old = copy(BASE_EDITOR_THEME);
  old.formatVersion = 3; delete old.fonts.articleSource;
  old.fonts.editorSource = '"Songti SC", serif';
  const raw = JSON.stringify(old), upgraded = parseEditorThemeJson(raw);
  assert.equal(upgraded.formatVersion, 4);
  assert.equal(upgraded.fonts.articleSource, old.fonts.editorSource);
  assert.equal(upgraded.fonts.editorSource, old.fonts.mono);
  assert.equal(JSON.stringify(old), raw);
  const incomplete = copy(upgraded); delete incomplete.fonts.articleSource;
  assert.throws(() => parseEditorThemeJson(JSON.stringify(incomplete)), /缺少 articleSource/);
});
