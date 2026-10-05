import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

test('loading remains full-screen until ready, fades for 300ms, and a new load cancels removal', async () => {
  const file = await readFile(new URL('../src/components/global/AppProviders.tsx', import.meta.url), 'utf8');
  const source = file.slice(file.indexOf('function StartupLoading('), file.indexOf('export function useEditorControllerContext')) + '\nglobalThis.component = StartupLoading;';
  let cursor = 0, previous, cleanup; const cells = [], effects = [], timers = new Map(); let timerId = 0;
  const context = { require: () => ({ jsx, jsxs }), exports: {},
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], value => { cells[i] = value; }]; },
    useEffect(effect, dependencies) { if (!previous || previous[0] !== dependencies[0]) { effects.push(() => { cleanup?.(); previous = dependencies; cleanup = effect(); }); } },
    window: { setTimeout(fn, duration) { assert.equal(duration, 300); timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } },
  };
  vm.runInNewContext(ts.transpileModule(source, { fileName: 'loading.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = loading => { cursor = 0; const node = context.component({ loading }); while (effects.length) effects.shift()(); return node; };
  assert.equal(render(true).props['data-fading'], false);
  assert.equal(timers.size, 0);
  render(false);
  assert.equal(render(false).props['data-fading'], true);
  assert.equal(timers.size, 1);
  render(true);
  assert.equal(timers.size, 0, 'new loading cancels the previous fade removal');
  assert.equal(render(true).props['data-fading'], false);
  render(false); [...timers.values()][0]();
  assert.equal(render(false), null);
});
