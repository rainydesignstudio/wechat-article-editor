import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { jsx, jsxs } from 'react/jsx-runtime';
import { withTextInputHistory } from './text-input-history-fixture.mjs';

const source = await readFile(new URL('../src/components/content/SourceFindBar.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];

function barFixture(extras = {}) {
  let cursor = 0, tree;
  const cells = [], effects = [], listeners = new Set(), calls = { replace: 0, all: 0, confirm: 0, cancel: 0, move: [] };
  const document = { body: {}, activeElement: null, addEventListener(_name, listener) { listeners.add(listener); }, removeEventListener(_name, listener) { listeners.delete(listener); } };
  const element = () => ({ tagName: 'INPUT', ownerDocument: document, selectionStart: 0, selectionEnd: 0, selectionDirection: 'none', focus() { document.activeElement = this; }, select() { this.selectionEnd = this.value.length; }, setSelectionRange(start, end, direction = 'none') { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; } });
  const query = element(), replacement = element();
  const effect = (callback, deps) => { const i = cursor++; if (!cells[i] || deps.some((dep, index) => dep !== cells[i][index])) { cells[i] = deps; effects.push(callback); } };
  const react = { useRef(initial) { return cells[cursor++] ??= { current: initial }; }, useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; }, useEffect: effect, useLayoutEffect: effect };
  const props = { query: 'Alpha', replacement: 'Beta', matchCase: false, count: 2, index: 0, disabled: false, composing: false, decision: null, scopeLabel: '当前文章正文', focusQueryRef: { current: null }, onQuery: value => { props.query = value; }, onReplacement: value => { props.replacement = value; }, onCase() {}, onMove: direction => calls.move.push(direction), onReplace: () => { calls.replace++; document.activeElement = {}; }, onReplaceAll: () => { calls.all++; }, onConfirmAll: () => { calls.confirm++; }, onCancelAll: () => { calls.cancel++; }, onClose() {}, ...extras };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, document, require: withTextInputHistory(id => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react-dom') return { createPortal: children => children };
    if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
    if (id.endsWith('/DialogFrame')) return Object.fromEntries(['DialogFrame','DialogHeader','DialogFooter','DialogActions','DialogButton'].map(name => [name, name]));
    throw new Error(id);
  }) });
  function render() {
    cursor = 0; tree = module.exports.SourceFindBar(props);
    walk(tree).filter(node => node.type === 'input').forEach((node, index) => { node.props.ref.current = index ? replacement : query; node.props.ref.current.value = node.props.value; });
    while (effects.length) effects.shift()();
    return tree;
  }
  const nodes = () => walk(tree);
  function key(target, modifiers = {}) {
    target.focus(); const event = { target, key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...modifiers };
    nodes().find(node => node.props.role === 'search').props.onKeyDown(event); render(); return event;
  }
  render(); return { props, calls, nodes, query, replacement, key, document, render };
}

test('Cmd/Ctrl+Enter in replacement performs only the current match and returns focus, preserving popup copy', () => {
  for (const modifier of ['metaKey', 'ctrlKey']) {
    const f = barFixture();
    f.key(f.replacement, { [modifier]: true });
    assert.equal(f.calls.replace, 1); assert.equal(f.calls.all, 0); assert.equal(f.calls.confirm, 0);
    assert.equal(f.document.activeElement, f.replacement);
    assert.ok(f.nodes().some(node => node.props.tooltip === '替换当前匹配'));
    f.key(f.query, { [modifier]: true }); assert.equal(f.calls.replace, 1);
    f.props.disabled = true; f.render(); f.key(f.replacement, { [modifier]: true }); assert.equal(f.calls.replace, 1);
  }
});

test('plain Enter navigates; composing input blocks replacements even when a stale callback is invoked', () => {
  const f = barFixture(); f.key(f.query); f.key(f.query, { shiftKey: true });
  assert.deepEqual(f.calls.move, [1, -1]);
  f.nodes().find(node => node.props.role === 'search').props.onCompositionStart(); f.render();
  f.key(f.replacement, { metaKey: true });
  assert.equal(f.calls.replace, 0);
  f.nodes().find(node => node.props.tooltip === '替换当前匹配').props.onClick(); assert.equal(f.calls.replace, 0);
});

test('bulk confirmation exposes scope, exact query, deletion semantics and count, with cancel/confirm sharing focus return', () => {
  const f = barFixture({ decision: { source: 'Alpha Alpha', query: 'Alpha', replacement: '', matchCase: false, count: 2 } });
  const text = f.nodes().flatMap(node => typeof node.props.children === 'string' ? [node.props.children] : Array.isArray(node.props.children) ? node.props.children.filter(child => typeof child === 'string' || typeof child === 'number') : []).join(' ');
  assert.match(text, /当前文章正文/); assert.match(text, /Alpha/); assert.match(text, /删除匹配内容/);
  const confirm = f.nodes().find(node => node.type === 'DialogButton' && node.props.variant === 'primary');
  assert.equal(confirm.props.disabled, false); confirm.props.onClick(); assert.equal(f.calls.confirm, 1);
  f.nodes().find(node => node.type === 'DialogButton' && node.props.autoFocus).props.onClick(); assert.equal(f.calls.cancel, 1);
  f.props.decision = null; f.render(); assert.equal(f.document.activeElement, f.replacement);
  f.props.decision = { query: 'Alpha', replacement: '', count: 0, changed: true }; f.render();
  assert.equal(f.nodes().find(node => node.type === 'DialogButton' && node.props.variant === 'primary').props.disabled, true);
});
