import { withTextInputHistory } from './text-input-history-fixture.mjs';
const sourceSearch = await import('../src/lib/sourceSearch.ts');
const sourceViewport = await import('../src/lib/sourceViewport.ts');
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { groupSourceLineIssues, logicalSourceLines } from '../src/lib/sourceLineDiagnostics.ts';
import { tokenizeEditorSource } from '../src/lib/editorSourceHighlight.ts';

test('line numbers count source newlines, including empty lines, and ignore visual wraps', () => {
  assert.deepEqual(logicalSourceLines('很长很长的一行'), ['很长很长的一行']);
  assert.deepEqual(logicalSourceLines('甲\r\n\r\n乙\n'), ['甲', '', '乙', '']);
});

test('line concerns combine warnings and errors while keeping the offending content', () => {
  const issues = [
    { kind: 'element', name: 'div', source: '正文', tier: 'conditional', line: 2, message: '有条件支持。' },
    { kind: 'style', name: 'display', source: '工具类 grid', tier: 'notAllowed', lines: [2, 3], message: '公众号不支持该值。' },
    { kind: 'element', name: 'p', source: '正文', tier: 'safe', line: 1, message: '安全。' },
    { kind: 'engine', name: 'Tailwind', source: '正文', tier: 'unknown', message: '没有行号。' },
    { kind: 'element', name: 'outside', source: '正文', tier: 'danger', line: 9, message: '范围外。' },
  ];
  const concerns = groupSourceLineIssues(issues, 3);
  assert.equal(concerns.size, 2);
  assert.equal(concerns.get(2).severity, 'error');
  assert.deepEqual(concerns.get(2).messages, ['div：有条件支持。', '工具类 grid · display：公众号不支持该值。']);
  assert.deepEqual(concerns.get(3).messages, ['工具类 grid · display：公众号不支持该值。']);
});

test('source editor renders one gutter number per logical line and exposes issue details', async () => {
  const source = await readFile(new URL('../src/components/content/SnippetTextarea.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: withTextInputHistory(function require(id) {
    if (id.endsWith('/sourceSearch')) return sourceSearch;
    if (id.endsWith('/sourceViewport')) return sourceViewport;
    if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
    if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
    if (id === 'react') return { forwardRef: render => render, useRef: initial => ({ current: initial }), useState: initial => [initial, () => {}], useMemo: calculate => calculate(), useLayoutEffect() {} };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react-dom') return { createPortal: children => children };
    if (id.endsWith('/nativeTextareaEdit')) return { insertUndoableText() {} };
    if (id.endsWith('/snippetComposer')) return { findSnippetMenuMatch: () => null, findSnippetSpaceExpansion: () => null, groupSnippetMatches: () => [], snippetTreeRows: () => [], prepareSnippetInsertion() {} };
    if (id.endsWith('/editorSourceHighlight')) return { tokenizeEditorSource };
    if (id.endsWith('/sourceLineDiagnostics')) return { logicalSourceLines };
    if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon' };
    throw new Error(`Unexpected import ${id}`);
  }) });
  const concern = { severity: 'error', messages: ['div：不支持。'] };
  const tree = module.exports.SnippetTextarea({ value: '甲\n\n乙', snippets: [], showLineNumbers: true, lineConcerns: new Map([[2, concern]]), onChange() {} }, null);
  function all(node) { if (Array.isArray(node)) return node.flatMap(all); if (!node?.props) return []; return [node, ...all(node.props.children)]; }
  const nodes = all(tree);
  const numbers = nodes.filter(node => node.type === 'button' && node.props['data-severity']);
  assert.equal(numbers.length, 1);
  assert.equal(numbers[0].props.children, 2);
  assert.match(numbers[0].props['aria-label'], /第 2 行错误：div：不支持/);
  assert.equal(nodes.filter(node => node.type === 'span' && node.props['aria-hidden'] === 'true' && [1, 3].includes(node.props.children)).length, 2);
  assert.equal(nodes.find(node => node.type === 'textarea').props.value, '甲\n\n乙');
});
