const formatRuntime = await import('../src/lib/article-format/runtime.ts');
const formatPreview = await import('../src/lib/article-format/preview.ts');
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { BASIC_THEME } from '../src/lib/themes.ts';

const code = ts.transpileModule(await readFile(new URL('../src/components/content/ContentRenderPreview.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;

function preview() {
  let cursor = 0, tree, timerId = 0, shadows = 0;
  const cells = [], effects = [], timers = new Map(), calls = [];
  const mount = {};
  const shadow = { querySelector: () => mount };
  const host = { shadowRoot: null, attachShadow: () => { shadows++; return host.shadowRoot = shadow; } };
  const props = { source: 'first', theme: BASIC_THEME };
  const module = { exports: {} };
  const react = {
    useState(value) { const i = cursor++; if (!(i in cells)) cells[i] = value; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
    useRef(value) { const i = cursor++; return cells[i] ??= { current: value }; },
    useEffect(effect, dependencies) { const i = cursor++, old = cells[i]; if (old && dependencies.every((value, n) => Object.is(value, old.dependencies[n]))) return; effects.push(() => { old?.cleanup?.(); cells[i] = { dependencies, cleanup: effect() }; }); },
  };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    window: { addEventListener() {}, removeEventListener() {}, setTimeout(fn, delay) { assert.equal(delay, 200); timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } },
    require(id) {
    if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => formatRuntime.getFormatSnapshot() };
    if (id.endsWith('/article-format/preview')) return formatPreview;
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id === 'react-dom') return { createPortal: (children, target) => { assert.equal(target, mount); return children; } };
      if (id.endsWith('/MarkdownPreview')) return { MarkdownPreview: 'markdown' };
      if (id.endsWith('/articleDarkPreview')) return { observeArticlePreview() {}, cloneArticleForDarkPreview() {}, articleDarkPreviewDocument() {} };
      if (id.endsWith('/localFonts')) return { shareLocalFontsWithPreview: () => () => {} };
      if (id.endsWith('/tailwind')) return { compileArticleStyles(source, theme) { return new Promise((resolve, reject) => calls.push({ source, theme, resolve, reject })); } };
      throw new Error(id);
    },
  });
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  function render() {
    cursor = 0; tree = module.exports.ContentRenderPreview(props);
    walk(tree).find(node => node.props.ref)?.props.ref && (walk(tree).find(node => node.props.ref).props.ref.current = host);
    while (effects.length) effects.shift()();
  }
  render(); render();
  return {
    props, calls, render, get shadows() { return shadows; },
    nodes: () => walk(tree),
    flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    unmount() { cells.forEach(cell => cell?.cleanup?.()); },
  };
}

test('live preview updates text immediately but merges rapid utility compilation and keeps one shadow root', () => {
  const p = preview();
  for (let i = 0; i < 40; i++) { p.props.source = `text-${i}▌`; p.render(); }
  assert.equal(p.calls.length, 0);
  assert.equal(p.nodes().find(node => node.type === 'markdown').props.source, 'text-39');
  p.flush();
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].source, 'text-39');
  assert.equal(p.shadows, 1);
});

test('late compilations cannot overwrite a newer source, a blocked template, or an unmounted preview', async () => {
  const p = preview(); p.flush();
  p.props.source = 'new'; p.render(); p.flush();
  p.calls[0].resolve({ css: 'obsolete' }); await Promise.resolve(); p.render();
  assert.equal(p.nodes().find(node => node.type === 'style').props.children, '');
  p.calls[1].resolve({ css: 'current' }); await Promise.resolve(); p.render();
  assert.equal(p.nodes().find(node => node.type === 'style').props.children, formatPreview.articlePreviewStyle('current'));
  p.props.source = 'unsafe metadata'; p.render(); p.flush();
  p.props.blocked = true; p.render();
  p.calls[2].resolve({ css: 'must not render' }); await Promise.resolve(); p.render();
  assert.equal(p.nodes().some(node => node.type === 'markdown'), false);
  p.props.blocked = false; p.render(); p.flush(); p.unmount();
  p.calls[3].resolve({ css: 'after unmount' }); await Promise.resolve();
  assert.equal(p.nodes().some(node => node.type === 'style' && node.props.children === 'after unmount'), false);
});
