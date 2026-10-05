import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { SNIPPET_CATEGORY_ICONS, isSnippetCategoryIcon } from '../src/lib/snippetCategoryIcons.ts';

function loadComponent(path, imports) {
  const module = { exports: {} };
  const code = ts.transpileModule(path, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    for (const [suffix, value] of Object.entries(imports)) if (id.endsWith(suffix)) return value;
    throw new Error(`Unexpected import ${id}`);
  } });
  return module.exports;
}

function all(node) {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!node?.props) return [];
  return [node, ...all(node.props.children)];
}

const categorySource = await readFile(new URL('../src/components/content/SnippetCategoryDialog.tsx', import.meta.url), 'utf8');
const category = loadComponent(categorySource, {
  '/snippetCategoryIcons': { SNIPPET_CATEGORY_ICONS },
  '/DialogFrame': { DialogActions: 'dialog-actions', DialogButton: 'dialog-button', DialogFooter: 'dialog-footer', DialogFrame: 'dialog-frame', DialogHeader: 'dialog-header' },
  '/CollapsiblePanel': { PanelHeading: 'panel-heading' },
});

test('icon picker exposes named radio options and reports the selected snippet icon', () => {
  const chosen = [];
  const tree = category.IconChoiceGrid({ name: 'snippet-icon', value: 'image', onChange: icon => chosen.push(icon) });
  const options = all(tree).filter(node => node.type === 'input' && node.props.type === 'radio');
  assert.equal(options.length, SNIPPET_CATEGORY_ICONS.length);
  assert.match(tree.props.className, /grid-cols-4/);
  assert.doesNotMatch(tree.props.className, /md:grid-cols-6/);
  assert.equal(options.find(node => node.props.value === 'image').props.checked, true);
  assert.equal(options.find(node => node.props.value === 'table').props['aria-label'], '表格');
  options.find(node => node.props.value === 'table').props.onChange();
  assert.deepEqual(chosen, ['table']);
});

test('the shared icon fieldset keeps the current selection and preview inside one border', () => {
  const tree = category.IconSelectionFieldset({ name: 'category-icon', label: '分类图标', hint: '用于分类列表。', value: 'sparkles', disabled: false, previewLabel: '分类预览', onChange() {}, children: jsx('preview-card', { title: 'Rainy Design' }) });
  assert.equal(tree.type, 'fieldset');
  assert.match(tree.props.className, /border/);
  const nodes = all(tree);
  assert.equal(nodes.find(node => node.type === 'legend').props.children, '分类图标');
  assert.equal(nodes.find(node => node.type === category.IconChoiceGrid).props.value, 'sparkles');
  assert.deepEqual(Array.from(nodes.find(node => node.type === 'p' && node.props.className === 'mt-3 text-xs text-faint').props.children), ['当前：', '灵感', '，', '分类预览', '：']);
  assert.equal(nodes.find(node => node.type === 'preview-card').props.title, 'Rainy Design');
});

test('both category dialogs use the shared frame and retain count and description in preview', () => {
  for (const kind of ['snippets', 'templates']) {
    const tree = category.SnippetCategoryDialog({ value: { id: 'default', name: '默认', description: '说明文字', order: 0, icon: 'book' }, existing: true, kind, count: 7, busy: false, error: '', onChange() {}, onClose() {}, onSave() {} });
    const panel = all(tree).find(node => node.type === category.IconSelectionFieldset);
    assert.equal(panel.props.value, 'book');
    assert.equal(panel.props.previewLabel, '分类预览');
    const preview = all(panel.props.children);
    assert.equal(preview.find(node => node.type === 'panel-heading').props.count, 7);
    assert.equal(preview.find(node => node.type === 'p').props.children, '说明文字');
  }
});

test('snippet information editor keeps fields left, icon and live preview right, and description below', async () => {
  const source = await readFile(new URL('../src/components/content/ContentMetadataEditor.tsx', import.meta.url), 'utf8');
  const editor = loadComponent(source, {
    '/snippetCategoryIcons': { isSnippetCategoryIcon },
    '/SnippetCategoryDialog': { CategoryIcon: 'category-icon', IconSelectionFieldset: 'icon-selection-fieldset' },
  });
  const patches = [];
  const snippet = { id: 'note', name: 'Note', trigger: '//note', description: '说明', content: '<p>正文</p>', icon: 'quote' };
  const tree = editor.ContentMetadataEditor({ snippet, fileId: 'note', creating: false, categoryId: 'default', categories: [{ id: 'default', name: '默认' }], disabled: false, invalid: false, onFileIdChange() {}, onCategoryChange() {}, onSnippetChange: patch => patches.push(patch), onMetadataChange() {}, onTemplateIconChange() {} });
  assert.match(tree.props.className, /md:grid-cols-5/);
  assert.equal(tree.props.children[0].type, 'div');
  assert.equal(tree.props.children[1].type, 'aside');
  assert.equal(tree.props.children[2].type, 'label');
  const leftFields = Array.from(tree.props.children[0].props.children);
  assert.equal(leftFields[1].type, 'div');
  assert.doesNotMatch(leftFields[1].props.className, /border|bg-list|p-3/);
  assert.equal(leftFields[2].type, 'label');
  assert.equal(all(tree.props.children[2]).some(node => node.type === 'textarea' && node.props.name === 'snippet-description'), true);
  const fieldset = tree.props.children[1].props.children;
  assert.equal(fieldset.type, 'icon-selection-fieldset');
  const preview = all(fieldset.props.children).find(node => node.type === 'div' && node.props['aria-label'] === '片段列表默认预览');
  assert.ok(preview, 'the preview is inside the icon fieldset');
  assert.equal(fieldset.props.value, 'quote');
  assert.equal(fieldset.props.previewLabel, '默认预览');
  assert.equal(all(preview).find(node => node.type === 'category-icon').props.name, 'quote');
  assert.equal(all(preview).find(node => node.type === 'span').props.children, 'Note');
  assert.equal(all(preview).some(node => node.type === 'p' || node.type === 'code'), false);
  fieldset.props.onChange('table');
  assert.equal(patches.length, 1);
  assert.equal(patches[0].icon, 'table');
  assert.equal(snippet.content, '<p>正文</p>');
});

test('template information uses the same two-column layout and defaults old templates to the document icon', async () => {
  const source = await readFile(new URL('../src/components/content/ContentMetadataEditor.tsx', import.meta.url), 'utf8');
  const editor = loadComponent(source, {
    '/snippetCategoryIcons': { isSnippetCategoryIcon },
    '/SnippetCategoryDialog': { CategoryIcon: 'category-icon', IconSelectionFieldset: 'icon-selection-fieldset' },
  });
  const chosen = [];
  const metadata = { title: '旧模板', description: '摘要', author: '作者', categories: ['示例'] };
  const props = { metadata, fileId: 'old-template', creating: false, categoryId: 'default', categories: [{ id: 'default', name: '默认' }], disabled: false, invalid: false, onFileIdChange() {}, onCategoryChange() {}, onSnippetChange() {}, onMetadataChange() {}, onTemplateIconChange: icon => chosen.push(icon) };
  const tree = editor.ContentMetadataEditor(props);
  assert.match(tree.props.className, /md:grid-cols-5/);
  assert.equal(tree.props.children[0].type, 'div');
  assert.equal(tree.props.children[1].type, 'aside');
  assert.equal(all(tree.props.children[2]).find(node => node.type === 'textarea').props.name, 'template-description');
  const fieldset = tree.props.children[1].props.children;
  assert.equal(fieldset.props.value, 'document');
  assert.equal(all(fieldset.props.children).find(node => node.type === 'category-icon').props.name, 'document');
  fieldset.props.onChange('book');
  assert.deepEqual(chosen, ['book']);
  const chosenTree = editor.ContentMetadataEditor({ ...props, metadata: { ...metadata, templateIcon: 'book' } });
  assert.equal(chosenTree.props.children[1].props.children.props.value, 'book');
});

test('snippet and template information dialogs share the full-width body', async () => {
  const source = await readFile(new URL('../src/components/content/ContentMetadataDialog.tsx', import.meta.url), 'utf8');
  const dialog = loadComponent(source, {
    '/DialogFrame': { DialogActions: 'dialog-actions', DialogButton: 'dialog-button', DialogFooter: 'dialog-footer', DialogFrame: 'dialog-frame', DialogHeader: 'dialog-header' },
  });
  const tree = dialog.ContentMetadataDialog({ kind: 'snippets', creating: false, busy: false, saveDisabled: false, children: null, onClose() {}, onSave() {} });
  assert.equal(all(tree).some(node => node.type === 'aside'), false);
  const template = dialog.ContentMetadataDialog({ kind: 'templates', creating: false, busy: false, saveDisabled: false, children: null, onClose() {}, onSave() {} });
  assert.equal(all(template).some(node => node.type === 'aside'), false);
  assert.equal(all(template).find(node => node.props.id === 'content-information-description').props.className, 'sr-only');
});
