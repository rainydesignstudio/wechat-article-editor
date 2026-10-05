import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const { readTemplateTab, templateHref, historyPosition } = await import('../src/lib/templateNavigation.ts');
const hookSource = await readFile(new URL('../src/hooks/useRouteNavigation.ts', import.meta.url), 'utf8');
const hookCode = ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const nodeRequire = createRequire(import.meta.url);

function harness() {
  let cursor = 0;
  const cells = [];
  const effects = [];
  const listeners = new Set();
  const entries = [{ url: '/articles/', state: { __NA: true, tree: 'articles' } }];
  let position = 0;
  let handle;
  const location = { href: '/articles/' };
  const history = {
    get state() { return entries[position].state; },
    replaceState(state, unused, url) { entries[position] = { state, url }; location.href = url; },
    go(distance) {
      const next = position + distance;
      if (next < 0 || next >= entries.length) return;
      position = next;
      location.href = entries[position].url;
      const event = { state: history.state, stopped: false, stopImmediatePropagation() { this.stopped = true; } };
      for (const listener of listeners) listener(event);
      if (!event.stopped) render(location.href.split('?')[0]);
    },
  };
  const router = {
    push(url) {
      entries.splice(position + 1);
      entries.push({ url, state: { __NA: true, tree: url } });
      position += 1;
      location.href = url;
      render(url.split('?')[0]);
    },
  };
  const react = {
    useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
    useCallback(value) { cursor += 1; return value; },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = cells[index];
      if (previous && dependencies.every((item, i) => Object.is(item, previous.dependencies[i]))) return;
      effects.push(() => { previous?.cleanup?.(); cells[index] = { dependencies, cleanup: effect() }; });
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(hookCode, {
    exports: module.exports, module,
    require(id) {
      if (id === 'react') return react;
      if (id === 'next/navigation') return { useRouter: () => router };
      if (id === '../lib/templateNavigation') return { historyPosition };
      return nodeRequire(id);
    },
    window: { history, location, addEventListener(name, listener) { assert.equal(name, 'popstate'); listeners.add(listener); }, removeEventListener(name, listener) { listeners.delete(listener); } },
  });
  function render(pathname) {
    cursor = 0;
    handle = module.exports.useRouteNavigation(pathname);
    while (effects.length) effects.shift()();
  }
  render('/articles/');
  return { get handle() { return handle; }, history, location, entries, get position() { return position; } };
}

test('template links select the right tab and unsupported query values fall back to snippets', () => {
  for (const tab of ['snippets', 'templates']) {
    const href = templateHref(tab);
    assert.equal(new URL(href, 'http://localhost:3500').pathname, '/template/');
    assert.equal(readTemplateTab(new URL(href, 'http://localhost:3500').search), tab);
  }
  assert.equal(readTemplateTab(''), 'snippets');
  assert.equal(readTemplateTab('?tab=unknown'), 'snippets');
  assert.equal(readTemplateTab('?tab=templates&extra=preserved'), 'templates');
});

test('history positions reject malformed values while leaving Next state independent', () => {
  for (const state of [null, undefined, {}, { rainyHistoryPosition: '1' }, { rainyHistoryPosition: 1.5 }, { rainyHistoryPosition: Infinity }]) assert.equal(historyPosition(state), null);
  assert.equal(historyPosition({ __NA: true, tree: {}, rainyHistoryPosition: 4 }), 4);
});

test('guarded menu navigation only leaves after consent; unregister restores normal routing', () => {
  const h = harness();
  h.handle.navigateRoute(templateHref('snippets'));
  let pending;
  const unregister = h.handle.registerNavigationGuard((proceed) => { pending = proceed; return true; });
  h.handle.navigateRoute('/settings/');
  assert.equal(h.location.href, templateHref('snippets'));
  assert.equal(h.entries.length, 2);
  pending();
  assert.equal(h.location.href, '/settings/');
  unregister();
  h.handle.navigateRoute('/assets/');
  assert.equal(h.location.href, '/assets/');
});

test('cancelled Back restores the same history entry and consent follows the original destination', () => {
  const h = harness();
  h.handle.navigateRoute('/settings/');
  h.handle.navigateRoute(templateHref('templates'));
  const originalState = h.history.state;
  let pending;
  h.handle.registerNavigationGuard((proceed) => { pending = proceed; return true; });
  h.history.go(-1);
  assert.equal(h.location.href, templateHref('templates'));
  assert.equal(h.position, 2);
  assert.equal(h.entries.length, 3);
  assert.equal(h.history.state.tree, originalState.tree);
  pending();
  assert.equal(h.location.href, '/settings/');
  assert.equal(h.position, 1);
  assert.equal(h.entries.length, 3);
});

test('busy navigation restores Back without creating a discard action or deleting forward history', () => {
  const h = harness();
  h.handle.navigateRoute(templateHref('snippets'));
  h.handle.registerNavigationGuard(() => true);
  h.history.go(-1);
  assert.equal(h.location.href, templateHref('snippets'));
  assert.equal(h.entries.length, 2);
  assert.equal(h.position, 1);
  assert.equal(h.history.state.__NA, true);
});

test('Forward cancellation and consent preserve both destinations', () => {
  const h = harness();
  h.handle.navigateRoute(templateHref('snippets'));
  h.handle.navigateRoute('/settings/');
  h.history.go(-1);
  let pending;
  h.handle.registerNavigationGuard((proceed) => { pending = proceed; return true; });
  h.history.go(1);
  assert.equal(h.location.href, templateHref('snippets'));
  pending();
  assert.equal(h.location.href, '/settings/');
  assert.equal(h.entries.length, 3);
});
