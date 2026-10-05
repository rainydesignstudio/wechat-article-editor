import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/components/global/UnsavedChangesDialog.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function dialog() {
  let cursor = 0, tree;
  const cells = [];
  const calls = { save: 0, cancel: 0, discard: 0 };
  let resolveSave;
  const props = { entries: [{ label: '测试外观', detail: '雾灰配色' }], description: '外观尚未保存。', onCancel: () => calls.cancel++, onDiscard: () => calls.discard++, onSave: () => { calls.save++; return new Promise(resolve => { resolveSave = resolve; }); } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'frame', DialogHeader: 'header', DialogActions: 'actions', DialogButton: 'button' };
    if (id === 'react') return {
      useId: () => 'test-dialog',
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    };
    throw new Error(`Unexpected dialog import ${id}`);
  } });
  function all(node) { if (Array.isArray(node)) return node.flatMap(all); if (!node?.props) return []; return [node, ...all(node.props.children)]; }
  function text(node) { if (typeof node === 'string') return node; if (Array.isArray(node)) return node.map(text).join(''); return node?.props ? text(node.props.children) : ''; }
  function render() { cursor = 0; tree = module.exports.UnsavedChangesDialog(props); }
  function find(predicate) { const node = all(tree).find(predicate); assert.ok(node, 'Control exists'); return node; }
  render();
  return { props, calls, render, find, frame: () => tree, button: label => find(node => node.type === 'button' && text(node) === label), finish: async result => { resolveSave(result); await new Promise(resolve => setImmediate(resolve)); render(); } };
}

test('unsaved dialog traps dismissal during save, blocks duplicate writes, and retains context after failure', async () => {
  const d = dialog();
  const save = d.button('保存并离开').props.onClick;
  save(); save(); d.render();
  assert.equal(d.calls.save, 1);
  assert.equal(d.frame().props.dismissible, false);
  d.frame().props.onClose();
  assert.equal(d.calls.cancel, 0);
  assert.equal(d.button('继续编辑').props.disabled, true);
  assert.equal(d.button('放弃变更').props.disabled, true);
  await d.finish(false);
  assert.match(d.find(node => node.props.role === 'alert').props.children, /修改已保留/);
  assert.equal(d.frame().props.dismissible, true);
  d.button('继续编辑').props.onClick();
  assert.equal(d.calls.cancel, 1);
});

test('disabled saving never writes and discard remains an explicit independent action', () => {
  const d = dialog(); d.props.saveDisabled = true; d.render();
  assert.equal(d.button('保存并离开').props.disabled, true);
  d.button('保存并离开').props.onClick();
  assert.equal(d.calls.save, 0);
  d.button('放弃变更').props.onClick();
  assert.equal(d.calls.discard, 1);
  assert.equal(d.frame().props.role, 'alertdialog');
  assert.equal(d.frame().props.titleId, 'test-dialog-title');
  assert.equal(d.frame().props.descriptionId, 'test-dialog-description');
});
