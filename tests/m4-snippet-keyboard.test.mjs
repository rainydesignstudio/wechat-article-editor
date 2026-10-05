import { withTextInputHistory } from './text-input-history-fixture.mjs';
const sourceSearch = await import('../src/lib/sourceSearch.ts');
const sourceViewport = await import('../src/lib/sourceViewport.ts');
import * as nativeEdit from '../src/lib/nativeTextareaEdit.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import * as composer from '../src/lib/snippetComposer.ts';
import * as highlighter from '../src/lib/editorSourceHighlight.ts';
import * as lineDiagnostics from '../src/lib/sourceLineDiagnostics.ts';

const source = await readFile(new URL('../src/components/content/SnippetTextarea.tsx', import.meta.url), 'utf8');
const walk = n => Array.isArray(n) ? n.flatMap(walk) : n?.props ? [n, ...walk(n.props.children)] : [];
function inputFixture(value, snippets, synchronousCommit = true, extras = {}) {
  let cursor = 0, cells = [], effects = [], input, tree, frames = 0, inserted = [];
  const history = [];
  const listeners = new Set();
  const document = { activeElement: null, addEventListener(_name, listener) { listeners.add(listener); }, removeEventListener(_name, listener) { listeners.delete(listener); }, execCommand(command, _ui, text) {
    if (command === 'undo' || command === 'redo') {
      const event = { inputType: command === 'undo' ? 'historyUndo' : 'historyRedo', preventDefault() { this.defaultPrevented = true; } };
      listeners.forEach(listener => listener(event));
      if (event.defaultPrevented) return true;
    }
    if (command === 'insertText') {
      history.push(element.value); inserted.push(text);
      const start = element.selectionStart;
      element.value = element.value.slice(0, start) + text + element.value.slice(element.selectionEnd);
      element.setSelectionRange(start + text.length, start + text.length);
    } else if (command === 'undo') element.value = history.pop();
    else return false;
    input.props.onChange({ currentTarget: element });
    if (synchronousCommit) render();
    return true;
  } };
  const element = { tagName: 'TEXTAREA', ownerDocument: document, value, selectionStart: value.length, selectionEnd: value.length, selectionDirection: 'none', scrollTop: 0, scrollLeft: 0, focus() { document.activeElement = this; }, setSelectionRange(start, end, direction = 'none') { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }, setRangeText(text, start, end) { inserted.push(text); this.value = this.value.slice(0, start) + text + this.value.slice(end); this.setSelectionRange(start + text.length, start + text.length); } };
  const overlay = { scrollTop: 0, scrollLeft: 0, querySelector() { return null; } };
  const menu = { scrollTop: 0, clientHeight: 160, clientTop: 1, firstElementChild: { offsetHeight: 32 }, getBoundingClientRect() { return { top: 100, bottom: 262 }; }, querySelector() {
    const options = walk(tree).filter(n => n.props.role === 'treeitem');
    const i = options.findIndex(n => n.props['aria-selected']);
    return i < 0 ? null : { getBoundingClientRect: () => ({ top: 133 + i * 52 - menu.scrollTop, bottom: 185 + i * 52 - menu.scrollTop }) };
  } };
  const props = { value, snippets, ...extras, onChange(next) { props.value = next; if (synchronousCommit) render(); } };
  const react = {
    forwardRef: fn => fn, useMemo: fn => fn(),
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
    useLayoutEffect(effect, deps) { const i = cursor++; if (!cells[i] || deps.some((d, j) => !Object.is(d, cells[i][j]))) { cells[i] = deps; effects.push(effect); } },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, document,
    requestAnimationFrame() { frames++; throw new Error('Caret restoration must not queue a stale animation frame'); },
    require: withTextInputHistory(function require(id) {
      if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => ({ id: 'test-format' }) };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id.endsWith('/sourceSearch')) return sourceSearch;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id === 'react-dom') return { createPortal: children => children };
      if (id.endsWith('/nativeTextareaEdit')) return nativeEdit;
      if (id.endsWith('/snippetComposer')) return composer;
      if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon' };
      if (id.endsWith('/editorSourceHighlight')) return highlighter;
      if (id.endsWith('/sourceLineDiagnostics')) return lineDiagnostics;
      throw new Error(id);
    }),
  });
  function render() {
    cursor = 0; tree = module.exports.SnippetTextarea(props, null);
    const nodes = walk(tree); input = nodes.find(n => n.type === 'textarea'); input.props.ref(element);
    nodes.find(n => n.props['aria-hidden'] && typeof n.props.ref === 'object').props.ref.current = overlay;
    const popup = nodes.find(n => n.props.className === 'snippet-command-menu'); if (popup) popup.props.ref.current = menu;
    while (effects.length) effects.shift()();
    return tree;
  }
  function key(key, rest = {}, commit = true) {
    let prevented = false;
    input.props.onKeyDown({ key, keyCode: 0, currentTarget: element, nativeEvent: { isComposing: false }, get defaultPrevented() { return prevented; }, preventDefault() { prevented = true; }, stopPropagation() {}, ...rest });
    if (commit) render(); return prevented;
  }
  render(); element.focus(); input.props.onSelect({ currentTarget: element }); render();
  return { element, props, document, menu, render, key, nodes: () => walk(tree), frames: () => frames, inserted, input: () => input };
}
const opening = { id: 'zixu-opening', name: '开场卡', description: '', trigger: '//zixu-opening', content: '<section class="mt-0 mb-7 border-0 bg-[#F5F5F7] px-5 py-6">\r\n<h1 class="text-[26px]/[1.5]">▌文章标题😀</h1>\r\n</section>\r\n' };

test('read-only sources allow finding while every replacement path preserves the source', () => {
  const openFindRef = { current: null }, original = 'Alpha alpha';
  const f = inputFixture(original, [], true, { readOnly: true, openFindRef });
  openFindRef.current(); f.render();
  let bar = f.nodes().find(n => n.type === 'source-find');
  bar.props.onQuery('alpha'); f.render();
  bar = f.nodes().find(n => n.type === 'source-find');
  assert.equal(bar.props.count, 2);
  assert.equal(bar.props.disabled, true);
  bar.props.onReplacement('Beta'); f.render();
  bar = f.nodes().find(n => n.type === 'source-find');
  bar.props.onReplace(); bar.props.onReplaceAll();
  assert.equal(f.props.value, original);
  assert.equal(f.inserted.length, 0);
});

test('replace-all requires confirmation, cancels without edits, refreshes changed content, and restores it in one undo', () => {
  const openFindRef = { current: null }, original = 'Alpha alpha';
  const f = inputFixture(original, [], true, { openFindRef });
  openFindRef.current(); f.render();
  let bar = () => f.nodes().find(n => n.type === 'source-find');
  bar().props.onQuery('alpha'); bar().props.onReplacement(''); f.render();
  bar().props.onReplaceAll(); f.render();
  assert.equal(f.props.value, original);
  assert.equal(bar().props.decision.count, 2);
  bar().props.onCancelAll(); f.render(); assert.equal(f.props.value, original);
  bar().props.onReplaceAll(); f.render();
  f.props.value = f.element.value = 'Alpha alpha alpha'; f.render(); f.render();
  assert.equal(bar().props.decision.changed, true);
  assert.equal(bar().props.decision.count, 3);
  bar().props.onConfirmAll(); f.render();
  assert.equal(f.props.value, '  ');
  assert.equal(bar().props.decision, null);
  f.element.focus(); f.key('z', { metaKey: true });
  assert.equal(f.props.value, 'Alpha alpha alpha');
  f.key('z', { metaKey: true, shiftKey: true }); assert.equal(f.props.value, '  ');
});

test('Cmd/Ctrl+G cycles matches in both directions, reopens the bar without claiming query focus, and ignores IME', () => {
  const openFindRef = { current: null };
  const f = inputFixture('Alpha alpha ALPHA', [], true, { openFindRef });
  const bar = () => f.nodes().find(n => n.type === 'source-find');
  const capture = (modifiers = {}) => {
    const event = { key: 'g', metaKey: true, target: f.element, nativeEvent: { isComposing: false }, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...modifiers };
    f.nodes().find(n => n.props.onKeyDownCapture).props.onKeyDownCapture(event); f.render(); return event;
  };
  capture(); assert.equal(bar().props.autoFocusQuery, true);
  bar().props.onQuery('alpha'); f.render();
  capture(); assert.equal(bar().props.index, 1); assert.equal(f.element.selectionStart, 6);
  capture({ metaKey: false, ctrlKey: true, shiftKey: true }); assert.equal(bar().props.index, 0);
  capture({ nativeEvent: { isComposing: true } }); assert.equal(bar().props.index, 0);
  bar().props.onClose(); f.render(); capture();
  assert.equal(bar().props.autoFocusQuery, false);
  assert.equal(f.document.activeElement, f.element);
  assert.equal(bar().props.index, 1);
});

test('input and highlight share one scrolling ancestor, with no independently scrolling text mirrors', () => {
  const f = inputFixture('甲\n\n乙', []);
  const viewport = f.nodes().find(n => n.props['data-source-viewport']);
  assert.ok(viewport.props.className.includes('overflow-y-auto'));
  const content = walk(viewport).find(n => n.props['data-source-content']);
  assert.ok(walk(content).some(n => n.type === 'pre'));
  assert.ok(walk(content).includes(f.input()));
  assert.ok(f.input().props.className.includes('overflow-hidden'));
  assert.equal(f.input().props.className.includes('overflow-y-auto'), false);
  const passive = f.nodes().find(n => n.props['aria-hidden'] && n.props.ref);
  assert.equal(passive.props.className.includes('overflow-hidden'), false);
  f.element.scrollTop = 80;
  f.input().props.onScroll({ currentTarget: f.element });
  assert.equal(f.element.scrollTop, 0);
});

test('an active IME composition blocks stale replacement callbacks until composition finishes', () => {
  const openFindRef = { current: null }, original = 'Alpha alpha';
  const f = inputFixture(original, [], true, { openFindRef });
  openFindRef.current(); f.render();
  let bar = f.nodes().find(n => n.type === 'source-find');
  bar.props.onQuery('alpha'); bar.props.onReplacement('Beta'); f.render();
  f.input().props.onCompositionStart({ currentTarget: f.element }); f.render();
  bar = f.nodes().find(n => n.type === 'source-find');
  assert.equal(bar.props.composing, true);
  bar.props.onReplace(); bar.props.onReplaceAll();
  assert.equal(f.props.value, original);
  assert.equal(f.inserted.length, 0);
  f.input().props.onCompositionEnd({ currentTarget: f.element }); f.render();
  f.nodes().find(n => n.type === 'source-find').props.onReplace();
  assert.equal(f.props.value, 'Beta alpha');
});

test('standard insert-menu text replaces the selection in one source undo step and keeps inline formatting inline', () => {
  const insertTextRef = { current: null };
  const original = '正文 selected 结尾';
  const f = inputFixture(original, [], true, { insertTextRef });
  f.element.setSelectionRange(3, 11);
  assert.equal(insertTextRef.current('**粗体**', 2), true);
  assert.equal(f.props.value, '正文 **粗体** 结尾');
  assert.equal(f.element.selectionStart, 5);
  assert.equal(f.inserted.length, 1);
  f.document.execCommand('undo');
  assert.equal(f.props.value, original);
  f.element.setSelectionRange(original.length, original.length);
  assert.equal(insertTextRef.current('\n## 标题', 4), true);
  f.document.execCommand('undo');
  assert.equal(f.props.value, original);
});

test('the source toolbar uses the same undoable insert ref as the input', async () => {
  const code = ts.transpileModule(await readFile(new URL('../src/components/editor/SourcePanel.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  let lineToggles = 0;
  vm.runInNewContext(code, {
    module, exports: module.exports, require: withTextInputHistory(function require(id) {
      if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => ({ id: 'test-format' }) };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id === 'react') return { useRef: value => ({ current: value }), useState: value => [value, () => {}], useMemo: fn => fn(), useEffect() {} };
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/articleAuthoringFormat')) return { validateArticleAuthoringMarkdown: async () => [] };
      if (id.endsWith('/sourceLineDiagnostics')) return lineDiagnostics;
      if (id.endsWith('/mediaManagement')) return { inspectLocalArticleImages: async () => [] };
      if (id.endsWith('/useMediaPreferences')) return { useAuthoringChecks: () => [true, () => {}] };
      if (id.endsWith('/useSourceLineNumbers')) return { useSourceLineNumbers: () => ({ showLineNumbers: false, toggle() { lineToggles++; } }) };
      if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'snippet-input' };
      if (id.endsWith('/InsertElementsMenu')) return { InsertElementsMenu: 'insert-menu' };
      if (id.endsWith('/InformationButton')) return { InformationButton: 'information', InformationIcon: 'icon' };
      throw new Error(id);
    }),
  });
  const tree = module.exports.SourcePanel({ article: {}, parsed: { body: 'Kept source', diagnostics: [] }, sourceTextareaRef: { current: {} }, status: {}, onChangeBody() { throw new Error('Toolbar must not replace controlled source directly'); } });
  const nodes = walk(tree), input = nodes.find(n => n.type === 'snippet-input'), menu = nodes.find(n => n.type === 'insert-menu'), calls = [];
  input.props.insertTextRef.current = (...args) => calls.push(args);
  menu.props.onInsert('**bold**', 2);
  assert.deepEqual(calls, [['**bold**', 2]]);
  const inside = {}, outside = {};
  const shortcut = overrides => {
    const event = { key: '/', ctrlKey: true, nativeEvent: { isComposing: false }, target: inside,
      currentTarget: { contains: target => target === inside }, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...overrides };
    tree.props.onKeyDownCapture(event);
    return event;
  };
  assert.equal(shortcut({ ctrlKey: false, metaKey: true }).defaultPrevented, true);
  assert.equal(shortcut({}).defaultPrevented, true);
  assert.equal(lineToggles, 2);
  for (const event of [{ ctrlKey: false }, { key: '?' }, { altKey: true }, { repeat: true }, { nativeEvent: { isComposing: true } }, { keyCode: 229 }, { target: outside }]) {
    assert.equal(shortcut(event).defaultPrevented, undefined);
  }
  assert.equal(lineToggles, 2, 'ordinary typing, IME, repeated keys and portal dialogs do not toggle line numbers');
  assert.ok(nodes.some(node => node.props.tooltip === '显示行号（⌘/ / Ctrl+/）'));
});

test('Tab inserts a long Unicode HTML snippet and preserves its marker through a synchronous controlled update and undo', () => {
  const original = '前文😀 //zixu-opening';
  let compiled = 0;
  const f = inputFixture(original, [opening], true, { onSnippetInserted: () => { compiled++; } });
  assert.equal(f.key('Tab'), true);
  assert.equal(compiled, 1);
  const caret = f.element.value.indexOf('文章标题😀');
  assert.equal(f.element.selectionStart, caret);
  assert.equal(f.element.selectionEnd, caret);
  assert.equal(f.element.value.includes('\r'), false);
  assert.ok(f.element.value.startsWith('前文😀 \n<section'));
  assert.equal(f.inserted.length, 1);
  assert.equal(f.frames(), 0);
  assert.ok(!f.nodes().some(n => n.props.role === 'treeitem'));
  f.document.execCommand('undo');
  assert.equal(f.props.value, original);
});

test('keyboard navigation scrolls the selected item inside the popup, wraps, and Enter inserts that item', () => {
  const snippets = Array.from({ length: 11 }, (_, i) => ({ id: `item-${i}`, name: `item-${i}`, description: '', trigger: `//item-${i}`, content: `item-${i}▌` }));
  const f = inputFixture('//', snippets);
  f.key('ArrowRight'); f.key('ArrowRight');
  for (let i = 0; i < 10; i++) assert.equal(f.key('ArrowDown'), true);
  assert.ok(f.menu.scrollTop > 0);
  assert.equal(f.input().props['aria-activedescendant'], 'snippet-option-item-10');
  assert.equal(f.document.activeElement, f.element);
  f.key('ArrowDown');
  assert.equal(f.input().props['aria-activedescendant'], 'snippet-category-uncategorized');
  assert.equal(f.menu.scrollTop, 0);
  f.key('ArrowUp');
  assert.equal(f.input().props['aria-activedescendant'], 'snippet-option-item-10');
  assert.ok(f.menu.scrollTop > 0);
  f.key('ArrowLeft'); f.key('ArrowLeft');
  assert.equal(f.nodes().filter(n => n.props.role === 'treeitem').length, 1);
  f.key('ArrowRight'); f.key('ArrowUp');
  f.key('Enter');
  assert.equal(f.props.value, 'item-10');
});

test('Shift-Tab, IME and no-match Tab retain native behavior; moving focus cancels pending restoration', () => {
  const f = inputFixture('//zixu-opening', [opening], false);
  assert.equal(f.key('Tab', { shiftKey: true }), false);
  assert.equal(f.key('Tab', { nativeEvent: { isComposing: true } }), false);
  assert.equal(f.inserted.length, 0);
  f.key('Escape'); assert.equal(f.key('Tab'), false);
  const second = inputFixture('//zixu-opening', [opening], false);
  second.key('Tab', {}, false);
  second.element.setSelectionRange(1, 1);
  second.input().props.onBlur(); second.document.activeElement = {};
  second.render();
  assert.equal(second.element.selectionStart, 1);
  assert.equal(second.frames(), 0);
});

test('picker entry inserts // at a line start, otherwise adds one newline, and opens category navigation', () => {
  for (const [original, expected] of [['正文', '正文\n//'], ['正文\n', '正文\n//']]) {
    const opener = { current: null };
    let compiled = 0;
    const f = inputFixture(original, [opening], true, { openPickerRef: opener, onSnippetInserted: () => { compiled++; } });
    opener.current(); f.render();
    assert.equal(f.props.value, expected);
    assert.equal(compiled, 0, 'opening the snippet picker is not a completed snippet insertion');
    assert.equal(f.element.selectionStart, expected.length);
    const category = f.nodes().find(n => n.props.role === 'treeitem');
    assert.equal(category.props['aria-level'], 1);
    assert.equal(category.props['aria-expanded'], false);
    assert.equal(f.input().props['aria-haspopup'], 'tree');
  }
});

test('grouping follows directory index metadata and search opens only matching groups', () => {
  const snippets = [{ ...opening, categoryId: 'zixu', icon: 'quote' }, { ...opening, id: 'image', trigger: '//image', categoryId: 'uncategorized' }];
  const categories = [{ id: 'zixu', name: '紫序', description: '', order: 2, icon: 'book' }, { id: 'uncategorized', name: '通用', description: '', order: 0 }];
  const grouped = composer.groupSnippetMatches(snippets, categories);
  assert.deepEqual(grouped.map(g => g.name), ['通用', '紫序']);
  assert.equal(grouped[1].icon, 'book');
  assert.equal(composer.snippetTreeRows(grouped, []).length, 2);
  const f = inputFixture('//zixu-o', snippets, true, { categories });
  assert.equal(f.nodes().filter(n => n.props.role === 'treeitem').length, 2);
  assert.equal(f.input().props['aria-activedescendant'], 'snippet-option-zixu-opening');
  const snippetRow = f.nodes().find(n => n.props.id === 'snippet-option-zixu-opening');
  assert.equal(walk(snippetRow).find(n => n.type === 'category-icon').props.name, 'quote');
  assert.equal(snippetRow.props.className.includes('ml-6'), false, 'the icon and text use the same left column as the category row');
});
