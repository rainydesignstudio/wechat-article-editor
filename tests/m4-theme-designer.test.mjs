import * as sourceHighlight from '../src/lib/editorSourceHighlight.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import * as themes from '../src/lib/editorThemes.ts';
import * as fontCatalog from '../src/lib/fontCatalog.ts';
const panelSource = await readFile(new URL('../src/components/global/CollapsiblePanel.tsx', import.meta.url), 'utf8');
const panelCode = ts.transpileModule(panelSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const panelModule = { exports: {} };
vm.runInNewContext(panelCode, { module: panelModule, exports: panelModule.exports, require: () => ({ jsx, jsxs }) });

const source = await readFile(new URL('../src/components/settings/EditorThemeDesigner.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function designer(editing = false, appearanceScheme = 'light') {
  let cursor = 0, tree; const cells = [], effects = []; let closes = 0;
  const props = { editing, appearanceScheme, source: themes.BASE_EDITOR_THEME, themes: [...themes.BUILTIN_EDITOR_THEMES], navigationGuardRef: { current: null }, onClose: () => closes++, onSave: async () => false };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, window: { addEventListener() {}, removeEventListener() {} }, require(id) {
    if (id.endsWith('/ThemeInspection')) return { useThemeInspection: () => ({ listRef: { current: null }, hovered: null, selected: null, rowProps: () => ({}), clear() {}, locate() {} }), ThemeInspectionPreview: 'inspection-preview', INSPECTION_ROW_CLASSES: '' };
    if (id.endsWith('/themeInspection')) return { uniqueBindings: items => items.filter((item, index) => items.findIndex(other => other.key === item.key) === index) };
    if (id.endsWith('/tailwind')) return {};
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/editorThemes')) return themes;
    if (id.endsWith('/fontCatalog')) return fontCatalog;
    if (id.endsWith('/CollapsiblePanel')) return panelModule.exports;
    if (id.endsWith('/editorSourceHighlight')) return sourceHighlight;
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog', DialogHeader: 'header', DialogActions: 'actions', DialogButton: 'button' };
    if (id.endsWith('/UnsavedChangesDialog')) return { UnsavedChangesDialog: 'unsaved-dialog' };
    if (id.endsWith('/EditorColorPicker')) return { EditorColorPicker: 'color-picker' };
    if (id.endsWith('/ColorSwatchButton')) return { ColorSwatchButton: 'button' };
    if (id === 'react') return {
      useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = typeof value === 'function' ? value() : value; return [cells[index], next => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }]; },
      useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
      useEffect(effect, dependencies) { const index = cursor++; const old = cells[index]; if (old && dependencies.every((value, i) => Object.is(value, old.dependencies[i]))) return; effects.push(() => { old?.cleanup?.(); cells[index] = { dependencies, cleanup: effect() }; }); },
    };
    throw new Error(id);
  } });
  const all = node => Array.isArray(node) ? node.flatMap(all) : node?.props ? typeof node.type === 'function' && ['CollapsiblePanel', 'PanelHeading', 'PanelIcon'].includes(node.type.name) ? all(node.type(node.props)) : [node, ...all(node.props.children)] : [];
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const render = () => { cursor = 0; tree = module.exports.EditorThemeDesigner(props); while (effects.length) effects.shift()(); };
  render(); render();
  return { props, render, get closes() { return closes; }, nodes: () => all(tree), find: fn => { const found = all(tree).find(fn); assert.ok(found); return found; }, button: label => all(tree).find(node => node.type === 'button' && text(node) === label), preview: () => all(tree).find(node => node.type?.name === 'Preview').props.theme };
}

test('designer starts in the workspace scheme and permits temporary mode inspection without dirtying the theme', () => {
  const view = designer(true, 'dark');
  const mode = () => view.find(node => node.type?.name === 'Preview').props.mode;
  assert.equal(mode(), 'dark');
  assert.equal(view.button('深色').props['aria-pressed'], true);
  view.button('浅色').props.onClick(); view.render();
  assert.equal(mode(), 'light');
  view.render(); assert.equal(mode(), 'light', 'ordinary rerenders retain the temporary preview choice');
  assert.equal(view.props.appearanceScheme, 'dark');
  assert.equal(view.button('保存主题').props.disabled, true);
  assert.ok(view.nodes().some(node => node.props.role === 'status' && node.props.children.join('').includes('已保存配色')));
  view.props.appearanceScheme = 'light'; view.render(); view.render();
  view.props.appearanceScheme = 'dark'; view.render(); view.render();
  assert.equal(mode(), 'dark', 'an external display-mode change synchronizes the open designer');
  assert.equal(view.button('保存主题').props.disabled, true);
});

test('designer independently edits 33 colors per mode and eight fonts without mutating a preset or adding size controls', () => {
  const view = designer(); const original = JSON.stringify(themes.BASE_EDITOR_THEME);
  assert.equal(view.nodes().filter(node => node.props['data-color-swatch']).length, 66);
  assert.equal(view.nodes().filter(node => node.type === 'button' && 'aria-expanded' in node.props).length, 2);
  assert.equal(view.nodes().filter(node => node.type === 'select').length, 8);
  assert.equal(view.nodes().some(node => node.type === 'input' && ['number', 'range'].includes(node.props.type)), false);
  const before = view.preview();
  view.find(node => node.props['aria-label'] === 'light.canvas').props.onClick(); view.render();
  const picker = view.find(node => node.type === 'color-picker');
  assert.equal(view.find(node => node.type === 'dialog').props.focusActive, false);
  picker.props.onSelect('#123456'); picker.props.onClose(); view.render();
  assert.equal(view.find(node => node.type === 'dialog').props.focusActive, true);
  const after = view.preview();
  assert.ok(view.nodes().some(node => node.props.role === 'status' && node.props.children.join('').includes('未保存草稿')));
  assert.equal(themes.resolveEditorThemeColors(after, 'light').canvas, '#123456');
  assert.equal(themes.resolveEditorThemeColors(after, 'dark').canvas, themes.resolveEditorThemeColors(before, 'dark').canvas);
  assert.equal(JSON.stringify(themes.BASE_EDITOR_THEME), original);
  assert.deepEqual(themes.validateEditorTheme(JSON.parse(JSON.stringify(after))), []);
  view.button('深色').props.onClick(); view.render();
  assert.equal(view.nodes().filter(node => node.props['aria-label']?.startsWith('dark.')).length, 33);
});

test('designer keeps collapsible group headings outside independently scrolling color and font lists', () => {
  const view = designer();
  const colors = () => view.find(node => node.props.id === 'editor-theme-colors-heading');
  const fonts = () => view.find(node => node.props.id === 'editor-theme-fonts-heading');
  assert.ok(view.find(node => node.props['aria-label'] === '颜色角色列表').props.className.includes('overflow-y-auto'));
  assert.ok(view.find(node => node.props['aria-label'] === '字体角色列表').props.className.includes('overflow-y-auto'));
  assert.ok(!view.find(node => node.props['aria-label'] === '主题颜色与字体').props.className.includes('overflow-y-auto'));
  colors().props.onClick(); view.render();
  assert.equal(colors().props['aria-expanded'], false);
  assert.equal(fonts().props['aria-expanded'], true);
  assert.equal(view.nodes().filter(node => node.props['data-color-swatch']).length, 0);
  assert.equal(view.nodes().filter(node => node.type === 'select').length, 8);
  colors().props.onClick(); fonts().props.onClick(); view.render();
  assert.equal(view.nodes().filter(node => node.props['data-color-swatch']).length, 66);
  assert.equal(view.nodes().filter(node => node.type === 'select').length, 0);
});

test('designer preview renders highlighted React nodes as content rather than serializing objects into HTML', () => {
  const view = designer();
  const component = view.find(node => node.type?.name === 'Preview');
  const tree = component.type(component.props);
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const pre = walk(tree).find(node => node.props['data-font-role'] === 'articleSource');
  assert.equal(pre.props.dangerouslySetInnerHTML, undefined);
  assert.ok(Array.isArray(pre.props.children));
  assert.equal(pre.props.children[0].type, 'span');
  assert.equal(pre.props.children[0].props.children, '#');
  assert.equal(pre.props.children[0].props.className, 'text-editor-syntax');
  assert.equal(pre.props.children[2].props.className, 'text-editor-heading');
});

test('each font setting has a visible preview consumer, including independent serif and subheading samples', () => {
  const view = designer();
  view.find(node => node.props['aria-label'] === '字体：衬线文字').props.onChange({ target: { value: 'SampleSerif, serif' } }); view.render();
  view.find(node => node.props['aria-label'] === '字体：列表与次级标题').props.onChange({ target: { value: 'SampleSubHeading, sans-serif' } }); view.render();
  const preview = view.find(node => node.type?.name === 'Preview');
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const tree = preview.type(preview.props), nodes = walk(tree);
  assert.deepEqual(nodes.filter(node => node.props['data-font-role']).map(node => node.props['data-font-role']).sort(), ['ui', 'heading', 'subHeading', 'eyebrow', 'serif', 'mono', 'editorSource', 'articleSource'].sort());
  assert.equal(tree.props.children.props.style['--font-serif'], 'SampleSerif, serif');
  assert.equal(tree.props.children.props.style['--font-sub-heading'], 'SampleSubHeading, sans-serif');
  assert.ok(nodes.find(node => node.props['data-font-role'] === 'serif').props.className.includes('font-serif'));
  assert.ok(nodes.find(node => node.props['data-font-role'] === 'subHeading').props.className.includes('font-sub-heading'));
  assert.equal(view.preview().fonts.ui, themes.BASE_EDITOR_THEME.fonts.ui);
  assert.equal(view.preview().fonts.heading, themes.BASE_EDITOR_THEME.fonts.heading);
});

test('Songti writing and code-font selections remain independent in draft and preview', () => {
  const view = designer();
  const writing = view.find(node => node.props['aria-label'] === '字体：文章写作源码');
  const songti = fontCatalog.SYSTEM_SERIF_FONT;
  const previousCode = view.preview().fonts.editorSource;
  writing.props.onChange({ target: { value: songti } }); view.render();
  const code = view.find(node => node.props['aria-label'] === '字体：代码源码');
  assert.equal(view.preview().fonts.articleSource, songti);
  assert.equal(view.preview().fonts.editorSource, previousCode);
  assert.ok(code.props.children.every(option => /monospace/.test(option.props.value)));
  const preview = view.find(node => node.type?.name === 'Preview');
  const tree = preview.type(preview.props);
  assert.equal(tree.props.children.props.style['--font-article-source'], songti);
  assert.equal(tree.props.children.props.style['--font-editor-source'], previousCode);
  assert.equal(themes.BASE_EDITOR_THEME.fonts.articleSource, themes.BASE_EDITOR_THEME.fonts.mono);
});

test('status text joins the font sample cards and writing preview has no full-height or double-padding wrapper', () => {
  const view = designer(), preview = view.find(node => node.type?.name === 'Preview');
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const nodes = walk(preview.type(preview.props));
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const status = nodes.find(node => node.props['aria-label'] === '状态文字样本');
  assert.match(text(status), /保存成功等待处理保存失败/);
  assert.equal(nodes.filter(node => node.type === 'footer').length, 1);
  const writing = nodes.find(node => node.props['data-font-role'] === 'articleSource');
  assert.ok(!writing.props.className.includes('editor-inner'));
  assert.ok(writing.props.className.includes('font-article-source'));
  const writingCard = nodes.find(node => node.props['aria-label'] === '文章写作源码字体样本');
  assert.ok(writingCard.props.className.includes('editor-theme-preview-card'));
  const serif = nodes.find(node => node.props['data-font-role'] === 'serif');
  assert.ok(serif.props.className.includes('editor-theme-preview-text'));
  assert.equal(serif.props.title, '把零散的想法，写成一页文字。');
});

test('designer guards unsaved navigation and retains draft after failed saving; saving is locked against duplicates', async () => {
  const view = designer(); let writes = 0, release;
  view.props.onSave = async () => { writes++; return new Promise(resolve => { release = resolve; }); };
  view.find(node => node.type === 'input' && node.props.maxLength === 80).props.onChange({ target: { value: '测试主题' } }); view.render();
  let proceeded = false; assert.equal(view.props.navigationGuardRef.current(() => { proceeded = true; }), true); view.render();
  view.find(node => node.type === 'unsaved-dialog').props.onCancel(); view.render();
  assert.equal(proceeded, false); assert.equal(view.preview().name, '测试主题');
  const save = view.button('保存主题'); save.props.onClick(); save.props.onClick(); view.render();
  assert.equal(writes, 1); assert.equal(view.button('保存中…').props.disabled, true);
  view.find(node => node.type === 'dialog').props.onClose(); assert.equal(view.closes, 0);
  release(false); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.preview().name, '测试主题'); assert.equal(view.closes, 0);
  assert.ok(view.find(node => node.props.role === 'alert'));
});


test('edit mode keeps theme identity and disables saving unchanged content', () => {
  const view = designer(true);
  assert.equal(view.preview().id, themes.BASE_EDITOR_THEME.id);
  assert.equal(view.preview().name, themes.BASE_EDITOR_THEME.name);
  assert.equal(view.button('保存主题').props.disabled, true);
  view.find(node => node.type === 'input' && node.props.maxLength === 80).props.onChange({ target: { value: '修改名称' } }); view.render();
  assert.equal(view.preview().id, themes.BASE_EDITOR_THEME.id);
  assert.equal(view.button('保存主题').props.disabled, false);
  assert.notEqual(view.preview().name, themes.BASE_EDITOR_THEME.name);
});

test('editor theme identity fields edit the JSON filename and version with collision feedback', () => {
  const view = designer(true);
  const fileName = view.find(node => node.type === 'input' && node.props.maxLength === 48);
  const version = view.find(node => node.type === 'input' && node.props.maxLength === 32);
  assert.equal(fileName.props.value, themes.BASE_EDITOR_THEME.id);
  assert.equal(version.props.value, themes.BASE_EDITOR_THEME.version);
  assert.ok(view.nodes().some(node => node.props.className?.includes('md:grid-cols-3') && node.props.children?.length === 3));
  fileName.props.onChange({ target: { value: 'my-editor-theme' } });
  version.props.onChange({ target: { value: '2.3.4' } }); view.render();
  assert.equal(view.preview().id, 'my-editor-theme');
  assert.equal(view.preview().version, '2.3.4');
  assert.equal(view.button('保存主题').props.disabled, false);
  assert.ok(view.nodes().some(node => node.props.id === 'editor-theme-id-hint' && node.props.children.join('').includes('my-editor-theme.json')));
  assert.ok(view.nodes().some(node => node.props.id === 'editor-theme-id-hint' && node.props.children.join('').includes('基础主题原文件保留')));
  view.find(node => node.type === 'input' && node.props.maxLength === 48).props.onChange({ target: { value: themes.BUILTIN_EDITOR_THEMES[1].id } }); view.render();
  assert.equal(view.button('保存主题').props.disabled, true);
  assert.match(view.find(node => node.props.role === 'alert').props.children, /已存在/);
});
