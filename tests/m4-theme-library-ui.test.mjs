import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
const themes = await import('../src/lib/themes.ts');
const rootSession = await import('../src/lib/rootSession.ts');
const source = await readFile(new URL('../src/components/themes/ThemeLibrary.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function page(fileSystem = {}) {
  let cursor = 0, tree;
  const cells = [], effects = [], applied = [], writes = [], defaults = [];
  const root = { name: 'test-only-theme-library' };
  const props = { root, themes: [...themes.THEMES], issues: [], currentTheme: themes.BASIC_THEME, defaultThemeId: null, currentArticleSaved: false, canApply: true, isRootCurrent: value => value === props.root, onLibraryChange: (...values) => writes.push(values), onApply: value => applied.push(value), async onSetDefault(id, selectedRoot) { defaults.push([id, selectedRoot]); props.defaultThemeId = id; } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id.endsWith('/contentValidation')) return { validateContentSource: async () => ({ errors: [], issues: [] }) };
    if (id.endsWith('/article-format/runtime')) return { getFormatSnapshot: () => ({ id: 'test-format' }) };
    if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => ({ id: 'test-format' }) };
    if (id.endsWith('/article-format/preview')) return { articlePreviewStyle: value => value, previewSurfaceStyle: () => ({}) };
    if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'source-input' };
    if (id.endsWith('/articleExamples')) return { ARTICLE_EXAMPLE_IMAGE: '/article-sample.png' };
      if (id.endsWith('/ThemeInspection')) return { useThemeInspection: () => ({ listRef: { current: null }, hovered: null, selected: null, rowProps: () => ({}), clear() {}, locate() {} }), ThemeInspectionPreview: 'inspection-preview', INSPECTION_ROW_CLASSES: '' };
    if (id.endsWith('/themeInspection')) return { uniqueBindings: items => items.filter((item, index) => items.findIndex(other => other.key === item.key) === index) };
    if (id.endsWith('/tailwind')) return {};
    if (id === 'react-dom') return { createPortal: children => children };
    if (id.endsWith('/PageHeading')) return { PageHeading: 'header' };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/useResizableColumns')) return { useResizableColumns: () => ({ containerRef: { current: null }, wideEnough: true, dragging: false, ratio: 40, style: { '--editor-source-width': '400px' } }) };
    if (id.endsWith('/ColumnSplitter')) return { ColumnSplitter: 'column-splitter' };
    if (id.endsWith('/localFonts')) return { shareLocalFontsWithPreview: () => () => {} };
    if (id.endsWith('/CollapsiblePanel')) return { CollapsiblePanel: 'collapsible-panel', PanelIcon: 'panel-icon' };
    if (id.endsWith('/ButtonBar')) return { ButtonBar: 'button-bar' };
    if (id.endsWith('/UnsavedChangesDialog')) return { UnsavedChangesDialog: 'unsaved-dialog' };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog', DialogHeader: 'dialog-header', DialogActions: 'dialog-actions', DialogButton: 'dialog-button' };
    if (id.endsWith('/PreviewModeSwitch')) return { PreviewModeSwitch: 'preview-mode-switch' };
    if (id.endsWith('/useArticlePreviewMode')) return { useArticlePreviewMode: () => ({ dark: false, toggle() {} }) };
    if (id.endsWith('/articleDarkPreview')) return {};
    if (id.endsWith('/EditorColorPicker')) return { EditorColorPicker: 'color-picker' };
    if (id.endsWith('/ArticleThemeFields')) return { ArticleThemeFields: 'article-theme-fields' };
    if (id.endsWith('/tailwindPalette')) return {};
    if (id.endsWith('/themes')) return themes;
    if (id.endsWith('/fileSystem')) return fileSystem;
    if (id.endsWith('/themeDefaults')) return {};
    if (id.endsWith('/rootSession')) return rootSession;
    if (id.endsWith('/themeValidation')) return {};
    if (id.endsWith('/MarkdownPreview')) return { MarkdownPreview: 'markdown-preview' };
    if (id === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
      useId() { return 'isolated-theme-id'; },
      useEffect(effect, dependencies) { const index = cursor++; const old = cells[index]; if (old && dependencies.every((value, i) => Object.is(value, old.dependencies[i]))) return; effects.push(() => { old?.cleanup?.(); cells[index] = { dependencies, cleanup: effect() }; }); },
    };
    throw new Error(`Unexpected theme library import ${id}`);
  } });
  function render() { cursor = 0; tree = module.exports.ThemeLibrary(props); while (effects.length) effects.shift()(); }
  function all(node) { if (Array.isArray(node)) return node.flatMap(all); if (!node?.props) return []; return [node, ...all(node.props.children)]; }
  function text(node) { if (typeof node === 'string') return node; if (Array.isArray(node)) return node.map(text).join(''); return node?.props ? text(node.props.children) : ''; }
  function find(predicate) { const node = all(tree).find(predicate); assert.ok(node, 'Control exists'); return node; }
  render(); render();
  return { props, applied, writes, defaults, render, find, button: label => find(node => node.type === 'button' && text(node) === label) };
}

test('setting the default article theme saves the choice without changing the current article', async () => {
  const view = page();
  view.find(node => node.props['aria-label'] === '预览主题 Rainy Design').props.onClick(); view.render();
  view.button('设为新稿默认').props.onClick();
  await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.deepEqual(view.defaults, [['rainy', view.props.root]]);
  assert.equal(view.props.defaultThemeId, 'rainy');
  assert.equal(view.applied.length, 0);
  assert.equal(view.button('当前默认').props.disabled, true);
});

test('selecting a theme previews it without applying or writing; explicit application uses the selected theme', () => {
  const view = page();
  view.find(node => node.props['aria-label'] === '预览主题 Rainy Design').props.onClick(); view.render();
  assert.equal(view.find(node => node.props.id === 'theme-preview-title').props.children, 'Rainy Design');
  assert.equal(view.find(node => node.props['aria-label'] === '预览主题 基础').props['aria-pressed'], false);
  assert.equal(view.applied.length, 0);
  assert.equal(view.writes.length, 0);
  view.button('应用到当前稿').props.onClick();
  assert.equal(view.applied[0].id, 'rainy');
});

test('saved article application keeps its explicit copy action; stale roots cannot apply', () => {
  const view = page(); view.props.currentArticleSaved = true; view.render();
  view.button('复制并应用').props.onClick();
  assert.equal(view.applied.length, 1);
  view.props.canApply = false; view.render();
  assert.equal(view.button('文章来自其他目录').props.disabled, true);
  view.button('文章来自其他目录').props.onClick();
  assert.equal(view.applied.length, 1);
  const oldRoot = view.props.root;
  view.props.root = { name: 'new-test-only-root' }; view.render();
  view.props.isRootCurrent = () => false; view.render();
  assert.equal(view.writes.length, 0);
  assert.notEqual(view.props.root, oldRoot);
});

test('removed selections and new root libraries select an available preview', () => {
  const view = page();
  view.find(node => node.props['aria-label'] === '预览主题 Rainy Design').props.onClick(); view.render();
  view.props.themes = [themes.BASIC_THEME]; view.render();
  assert.equal(view.find(node => node.props.id === 'theme-preview-title').props.children, '基础');
  view.props.root = null; view.render(); view.render();
  assert.equal(view.button('导入 JSON').props.disabled, true);
  assert.equal(view.button('新建主题').props.disabled, true);
  assert.equal(view.button('编辑主题').props.disabled, true);
});

test('theme lists expose only directory files, without adding missing source presets', () => {
  const view = page();
  view.props.themes = [{ ...themes.BASIC_THEME, name: '用户的基础排印' }, themes.RAINY_THEME]; view.render();
  for (const preset of themes.ARTICLE_THEME_PRESETS) assert.throws(() => view.find(node => node.props['aria-label'] === `预览主题 ${preset.name}`), /Control exists/);
  assert.equal(view.find(node => node.props.id === 'theme-preview-title').props.children, '用户的基础排印');
  assert.equal(view.writes.length, 0);
  assert.equal(view.button('载入默认主题').props.disabled, false);
});

test('a persisted theme overrides its preset and a broken same-ID file is not masked by a preset', () => {
  const view = page();
  view.props.themes = [themes.BASIC_THEME, { ...themes.ARTICLE_THEME_PRESETS[0], name: '我改过的青砚' }];
  view.props.issues = [{ file: 'mokan.json', message: '损坏的文件' }]; view.render();
  view.find(node => node.props['aria-label'] === '预览主题 我改过的青砚').props.onClick(); view.render();
  assert.equal(view.find(node => node.props.id === 'theme-preview-title').props.children, '我改过的青砚');
  assert.throws(() => view.find(node => node.props['aria-label'] === '预览主题 墨刊'), /Control exists/);
});

test('theme details transition to a single editor dialog and redundant complete-stylebook buttons are absent', () => {
  const view = page();
  assert.throws(() => view.button('完整样本册'), /Control exists/);
  view.button('主题详情').props.onClick(); view.render();
  const detail = view.find(node => node.type?.name === 'ThemeCardDialog');
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const buttons = walk(detail.type(detail.props)).filter(node => node.type === 'button');
  assert.equal(buttons.filter(node => text(node) === '完整样本册').length, 0);
  assert.equal(buttons.filter(node => text(node) === '编辑主题').length, 1);
  detail.props.onRequestDelete(); view.render();
  detail.props.onOpenStylebook(); view.render();
  assert.throws(() => view.find(node => node.type?.name === 'ThemeCardDialog'), /Control exists/);
  const editor = view.find(node => node.type?.name === 'ThemeStylebookDialog');
  assert.equal(editor.props.initialMode, undefined);
  editor.props.onClose(); view.render();
  assert.throws(() => view.find(node => node.type?.name === 'ThemeCardDialog'), /Control exists/);
  assert.throws(() => view.find(node => node.type?.name === 'ThemeStylebookDialog'), /Control exists/);
});

function deletionDialog(view) {
  return view.find(node => node.type?.name === 'ThemeDeleteDialog');
}

test('main deletion requires confirmation; cancellation does not touch the library', () => {
  const deleted = [];
  const view = page({ deleteThemeLibraryTheme: (...args) => deleted.push(args) });
  view.find(node => node.props['aria-label'] === '预览主题 Rainy Design').props.onClick(); view.render();
  view.button('删除主题').props.onClick(); view.render();
  const confirmation = deletionDialog(view);
  assert.equal(confirmation.props.theme.id, 'rainy');
  const frame = confirmation.type(confirmation.props);
  assert.equal(frame.props.role, 'alertdialog');
  assert.equal(frame.props.descriptionId, 'theme-delete-description');
  assert.equal(deleted.length, 0);
  confirmation.props.onCancel(); view.render();
  assert.throws(() => deletionDialog(view), /Control exists/);
  assert.equal(deleted.length, 0);
  view.props.themes = [themes.BASIC_THEME]; view.render();
  assert.equal(view.button('删除主题').props.disabled, true);
});

test('confirmed deletion locks duplicate actions, updates selection, and preserves article snapshots', async () => {
  let finish;
  const deleted = [];
  const view = page({
    deleteThemeLibraryTheme: (root, id) => { deleted.push([root, id]); return new Promise(resolve => { finish = resolve; }); },
    loadThemeLibrary: async () => ({ themes: [themes.BASIC_THEME], issues: [] }),
  });
  view.find(node => node.props['aria-label'] === '预览主题 Rainy Design').props.onClick(); view.render();
  view.button('删除主题').props.onClick(); view.render();
  const confirmation = deletionDialog(view);
  const pending = confirmation.props.onDelete();
  await confirmation.props.onDelete();
  view.render();
  assert.equal(deletionDialog(view).props.busy, true);
  confirmation.props.onCancel(); view.render();
  assert.equal(deletionDialog(view).props.busy, true);
  assert.deepEqual(deleted, [[view.props.root, 'rainy']]);
  finish(); await pending; view.render();
  assert.throws(() => deletionDialog(view), /Control exists/);
  assert.deepEqual(view.writes.map(call => call[1].map(theme => theme.id)), [themes.THEMES.filter(theme => theme.id !== 'rainy').map(theme => theme.id), ['basic']]);
  view.props.themes = view.writes.at(-1)[1]; view.render();
  assert.equal(view.find(node => node.props.id === 'theme-preview-title').props.children, '基础');
  assert.equal(view.applied.length, 0);
  assert.equal(view.props.currentTheme, themes.BASIC_THEME);
});

test('detail deletion replaces its dialog, returns on cancel, and keeps failures retryable', async () => {
  const view = page({ deleteThemeLibraryTheme: async () => { throw new Error('权限已失效'); } });
  view.button('主题详情').props.onClick(); view.render();
  view.find(node => node.type?.name === 'ThemeCardDialog').props.onRequestDelete(); view.render();
  assert.throws(() => view.find(node => node.type?.name === 'ThemeCardDialog'), /Control exists/);
  deletionDialog(view).props.onCancel(); view.render();
  view.find(node => node.type?.name === 'ThemeCardDialog').props.onRequestDelete(); view.render();
  await deletionDialog(view).props.onDelete(); view.render();
  assert.match(deletionDialog(view).props.error, /权限已失效/);
  assert.equal(deletionDialog(view).props.busy, false);
  assert.equal(view.writes.length, 0);
});

test('a refresh failure after deletion offers reload without repeating deletion', async () => {
  const deleted = [];
  const view = page({
    deleteThemeLibraryTheme: async (_, id) => { deleted.push(id); },
    loadThemeLibrary: async () => { throw new Error('重读失败'); },
  });
  view.button('删除主题').props.onClick(); view.render();
  await deletionDialog(view).props.onDelete(); view.render();
  assert.throws(() => deletionDialog(view), /Control exists/);
  await view.button('重新载入主题列表').props.onClick(); view.render();
  assert.deepEqual(deleted, ['basic']);
  assert.equal(view.writes.length, 1);
});

test('deletion completion from an old directory cannot update the new directory', async () => {
  let finish;
  const view = page({ deleteThemeLibraryTheme: () => new Promise(resolve => { finish = resolve; }) });
  view.button('删除主题').props.onClick(); view.render();
  const pending = deletionDialog(view).props.onDelete();
  view.props.root = { name: 'replacement-directory' }; view.render(); view.render();
  finish(); await pending; view.render();
  assert.equal(view.writes.length, 0);
  assert.throws(() => deletionDialog(view), /Control exists/);
  assert.equal(view.button('删除主题').props.disabled, false);
});
