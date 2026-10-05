import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/hooks/useSourceLineNumbers.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const key = 'rainy-source-line-numbers-v1';

function environment(saved, denied = false) {
  const values = new Map(saved === undefined ? [] : [[key, saved]]);
  const listeners = new Map();
  let active;
  const dispatch = event => listeners.get(event.type)?.forEach(callback => callback(event));
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, CustomEvent: class { constructor(type) { this.type = type; } }, window: {
    localStorage: {
      getItem(name) { if (denied) throw new Error('denied'); return values.get(name) ?? null; },
      setItem(name, value) { if (denied) throw new Error('denied'); values.set(name, value); },
    },
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener: (name, callback) => listeners.get(name)?.delete(callback), dispatchEvent: dispatch,
  }, require(id) {
    if (id === 'react') return {
      useState(initial) { const instance = active, index = instance.cursor++; if (!(index in instance.cells)) instance.cells[index] = initial; return [instance.cells[index], value => { instance.cells[index] = value; }]; },
      useLayoutEffect(effect) { const instance = active, index = instance.cursor++; if (!(index in instance.cells)) { instance.cells[index] = true; instance.cleanups.push(effect()); } },
    };
    throw new Error(id);
  } });
  const render = instance => { active = instance; instance.cursor = 0; instance.result = module.exports.useSourceLineNumbers(); return instance.result; };
  const view = () => {
    const instance = { cells: [], cursor: 0, cleanups: [] };
    render(instance); render(instance);
    return { render: () => render(instance), get state() { return instance.result; }, unmount: () => instance.cleanups.forEach(cleanup => cleanup()) };
  };
  return { view, values, listeners, storage: name => dispatch({ type: 'storage', key: name }) };
}

test('line numbers default off without overwriting storage and restore both saved choices on restart', () => {
  const fresh = environment();
  assert.equal(fresh.view().state.showLineNumbers, false);
  assert.equal(fresh.values.size, 0);
  assert.equal(environment('true').view().state.showLineNumbers, true);
  assert.equal(environment('false').view().state.showLineNumbers, false);
  assert.equal(environment('invalid').view().state.showLineNumbers, false);
});

test('enabling and disabling line numbers synchronize mounted views and persist for new views', () => {
  const env = environment(), first = env.view(), second = env.view();
  first.state.toggle(); first.render(); second.render();
  assert.equal(first.state.showLineNumbers, true);
  assert.equal(second.state.showLineNumbers, true);
  assert.equal(env.values.get(key), 'true');
  assert.equal(env.view().state.showLineNumbers, true);
  second.state.toggle(); first.render(); second.render();
  assert.equal(first.state.showLineNumbers, false);
  assert.equal(second.state.showLineNumbers, false);
  assert.equal(env.values.get(key), 'false');
  assert.equal(env.view().state.showLineNumbers, false);
});

test('another tab changes or clears the line-number preference without unrelated storage events overriding it', () => {
  const env = environment('false'), view = env.view();
  view.state.toggle(); view.render();
  env.values.set(key, 'false'); env.storage('unrelated-key');
  assert.equal(view.render().showLineNumbers, true);
  env.storage(key); assert.equal(view.render().showLineNumbers, false);
  env.values.set(key, 'true'); env.storage(key); assert.equal(view.render().showLineNumbers, true);
  env.values.clear(); env.storage(null); assert.equal(view.render().showLineNumbers, false);
});

test('unavailable storage preserves the session preference across views and removes listeners on unmount', () => {
  const env = environment(undefined, true), first = env.view(), second = env.view();
  first.state.toggle(); first.render(); second.render();
  assert.equal(second.state.showLineNumbers, true);
  assert.equal(env.view().state.showLineNumbers, true);
  second.state.toggle(); assert.equal(first.render().showLineNumbers, false);
  assert.equal(env.values.size, 0);
  const count = env.listeners.get('storage').size;
  first.unmount(); second.unmount();
  assert.equal(env.listeners.get('storage').size, count - 2);
  assert.equal(env.listeners.get('rainy-source-line-numbers-change').size, count - 2);
});
