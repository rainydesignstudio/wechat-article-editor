import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/hooks/useArticlePreviewMode.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function environment(saved, denied = false) {
  const values = new Map(saved ? [['rainy-article-preview-mode-v1', saved]] : []);
  const events = new Map(), systemEvents = new Set();
  const query = { matches: true, addEventListener: (_, callback) => systemEvents.add(callback), removeEventListener: (_, callback) => systemEvents.delete(callback) };
  let active;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, CustomEvent: class { constructor(type) { this.type = type; } }, window: {
    matchMedia: () => query,
    localStorage: { getItem: key => { if (denied) throw new Error('denied'); return values.get(key) ?? null; }, setItem: (key, value) => { if (denied) throw new Error('denied'); values.set(key, value); } },
    addEventListener: (name, callback) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); }, removeEventListener: (name, callback) => events.get(name)?.delete(callback), dispatchEvent: event => events.get(event.type)?.forEach(callback => callback(event)),
  }, require(id) { if (id === 'react') return {
    useState(initial) { const instance = active, index = instance.cursor++; if (!(index in instance.cells)) instance.cells[index] = initial; return [instance.cells[index], value => { instance.cells[index] = value; }]; },
    useLayoutEffect(effect, dependencies) { const instance = active, index = instance.cursor++; if (!(index in instance.cells)) { instance.cells[index] = true; effect(); } },
  }; throw new Error(id); } });
  const render = instance => { active = instance; instance.cursor = 0; instance.result = module.exports.useArticlePreviewMode(); return instance.result; };
  const view = () => { const instance = { cells: [], cursor: 0 }; render(instance); render(instance); return { render: () => render(instance), get state() { return instance.result; } }; };
  return { view, values, query, systemChange(value) { query.matches = value; systemEvents.forEach(callback => callback()); } };
}

test('article previews follow system until explicitly toggled and share the last choice across mounted views', () => {
  const env = environment(); const editor = env.view(), dialog = env.view();
  assert.equal(editor.state.dark, true); assert.equal(dialog.state.dark, true);
  assert.equal(env.values.size, 0, 'mount does not create a user preference');
  env.systemChange(false); editor.render(); dialog.render();
  assert.equal(editor.state.dark, false);
  editor.state.toggle(); editor.render(); dialog.render();
  assert.equal(editor.state.dark, true); assert.equal(dialog.state.dark, true);
  assert.equal(env.values.get('rainy-article-preview-mode-v1'), 'dark');
  env.systemChange(false); assert.equal(dialog.render().dark, true);
  assert.equal(env.view().state.dark, true, 'reopened dialog remembers last operation');
  assert.equal(environment('light').view().state.dark, false, 'reloaded app restores a saved choice');
});

test('blocked storage still permits toggling and synchronizing previews for the current session', () => {
  const env = environment(null, true); const left = env.view(), right = env.view();
  left.state.toggle(); left.render(); right.render();
  assert.equal(left.state.dark, false); assert.equal(right.state.dark, false);
  env.systemChange(true); assert.equal(right.render().dark, false);
});
