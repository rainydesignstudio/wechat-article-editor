import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { normalizeDataDirectoryName } from '../src/lib/fileSystem.ts';

const source = await readFile(new URL('../src/components/settings/CreateLibraryDialog.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : typeof node === 'string' ? node : '';

function dialog(onCreate = async () => ({ status: 'created' })) {
  const cells = [], requests = [];
  let cursor = 0, tree, closes = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Error, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/fileSystem')) return { normalizeDataDirectoryName };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'frame', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'actions', DialogButton: 'dialog-button' };
    if (id === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    };
    throw new Error(id);
  } });
  const render = () => { cursor = 0; tree = nodes(module.exports.CreateLibraryDialog({ onCreate: name => { requests.push(name); return onCreate(name); }, onClose: () => closes++ })); };
  const find = predicate => { const node = tree.find(predicate); assert.ok(node); return node; };
  const result = { render, find, requests, get closes() { return closes; }, input: () => find(node => node.type === 'input'),
    frame: () => find(node => node.type === 'frame'), submit: () => find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }),
    button: label => find(node => node.type === 'dialog-button' && text(node) === label),
    name(value) { result.input().props.onChange({ target: { value } }); render(); },
  };
  render(); return result;
}

test('library creation reuses the dialog shell, focuses the name, previews the destination and validates before choosing a directory', async () => {
  const view = dialog();
  assert.equal(view.input().props.autoFocus, true);
  assert.equal(view.button('选择父目录并创建').props.disabled, true);
  for (const value of [' ', '../文稿', '..', '文稿.', 'a:']) {
    view.name(value); assert.equal(view.button('选择父目录并创建').props.disabled, true);
    await view.submit(); assert.equal(view.requests.length, 0);
  }
  view.name('  ｍｙ－ａｒｔｉｃｌｅｓ  ');
  assert.match(text(view.find(node => node.props['aria-label'] === '资料库保存位置预览')), /所选父目录 \/ my-articles/);
  assert.equal(view.input().props['aria-invalid'], false);
  await view.submit(); assert.deepEqual(view.requests, ['my-articles']); assert.equal(view.closes, 1);
});

test('pending directory creation blocks duplicate submissions, cancellation and dismissal', async () => {
  let finish;
  const view = dialog(() => new Promise(resolve => { finish = resolve; }));
  view.name('测试资料库'); const pending = view.submit(); view.render();
  assert.equal(view.frame().props.dismissible, false);
  assert.equal(view.input().props.disabled, true);
  assert.equal(view.button('取消').props.disabled, true);
  assert.equal(view.find(node => node.type === 'header').props.closeDisabled, true);
  await view.submit(); view.frame().props.onClose();
  assert.equal(view.requests.length, 1); assert.equal(view.closes, 0);
  finish({ status: 'created' }); await pending; assert.equal(view.closes, 1);
});

test('picker cancellation and a creation failure retain the name and permit retry; only success closes', async () => {
  const responses = [{ status: 'cancelled' }, { status: 'error', message: '已有同名文件夹' }, { status: 'created' }];
  const view = dialog(async () => responses.shift()); view.name('我的文稿');
  await view.submit(); view.render();
  assert.equal(view.closes, 0); assert.equal(view.input().props.value, '我的文稿');
  assert.match(text(view.find(node => node.props.role === 'status')), /已取消选择父目录/);
  await view.submit(); view.render();
  assert.equal(text(view.find(node => node.props.role === 'alert')), '已有同名文件夹');
  assert.equal(view.input().props.value, '我的文稿'); assert.equal(view.button('选择父目录并创建').props.disabled, false);
  await view.submit(); assert.equal(view.closes, 1);
});

test('unexpected creation errors remain inside the dialog and cancel returns without writes', async () => {
  const view = dialog(async () => { throw new Error('写入失败'); }); view.name('我的文稿');
  await view.submit(); view.render();
  assert.equal(text(view.find(node => node.props.role === 'alert')), '写入失败');
  view.button('取消').props.onClick(); assert.equal(view.closes, 1); assert.equal(view.requests.length, 1);
});

const controllerSource = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
function action(name, next, context) {
  context.Error = Error;
  const start = controllerSource.indexOf(`  const ${name} = useCallback(`);
  const end = controllerSource.indexOf(`\n\n  const ${next}`, start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(ts.transpileModule(controllerSource.slice(start, end) + `\nglobalThis.action = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.action;
}

test('draft protection precedes the creation dialog and does not open the native picker until the form action', () => {
  let pending, opened = false;
  const request = action('requestCreateDataDirectory', 'createDataDirectory', {
    useCallback: callback => callback, runAfterDraftDecision: value => { pending = value; }, setCreateLibraryDialogOpen: value => { opened = value; },
  });
  request(); assert.equal(opened, false); assert.equal(pending.label, '新建资料库'); pending.run(); assert.equal(opened, true);
});

test('directory creation reports success, cancellation, stale selection and file collisions to the dialog', async () => {
  const statuses = [], opened = [], root = { name: 'new-library' };
  const context = { useCallback: callback => callback, DOMException, directorySelectionRef: { current: 0 },
    pickDataDirectory: async () => ({}), createNamedDataDirectory: async () => root,
    setStatus: status => statuses.push(status), rememberAuthorizedDirectory: (handle, selection) => opened.push(['remember', handle, selection]),
    openAuthorizedDirectory: async (handle, selection) => opened.push(['open', handle, selection]),
  };
  const create = action('createDataDirectory', 'reopenRememberedDirectory', context);
  assert.equal((await create('new-library')).status, 'created'); assert.equal(opened.length, 2);
  context.pickDataDirectory = async () => { throw new DOMException('取消', 'AbortError'); };
  assert.equal((await create('new-library')).status, 'cancelled'); assert.equal(opened.length, 2);
  context.pickDataDirectory = async () => { context.directorySelectionRef.current++; return {}; };
  assert.equal((await create('new-library')).status, 'cancelled'); assert.equal(opened.length, 2);
  context.pickDataDirectory = async () => ({}); context.createNamedDataDirectory = async () => { throw new Error('已有同名目录'); };
  const failure = await create('new-library'); assert.equal(failure.status, 'error'); assert.equal(failure.message, '已有同名目录');
  assert.equal(statuses.at(-1).tone, 'error'); assert.equal(opened.length, 2);
});
