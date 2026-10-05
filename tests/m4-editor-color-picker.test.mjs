import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import colors from 'tailwindcss/colors';
import * as palette from '../src/lib/tailwindPalette.ts';

test('palette includes every installed Tailwind color family and shade without copied color literals', () => {
  const families = Object.entries(colors).filter(([, value]) => typeof value === 'object');
  assert.deepEqual(palette.TAILWIND_PALETTE.map(family => family.name), families.map(([name]) => name));
  for (const [name, shades] of families) assert.equal(palette.TAILWIND_PALETTE.find(family => family.name === name).shades, shades);
  assert.equal(palette.TAILWIND_PALETTE.length, 26);
  assert.equal(palette.TAILWIND_SHADES.length, 11);
  assert.deepEqual(palette.TAILWIND_ENDPOINTS, [{ name: 'black', color: colors.black }, { name: 'white', color: colors.white }]);
});

test('native canvas color conversion yields six digit HEX compatible with editor theme JSON', () => {
  let context;
  const document = { createElement: () => ({ getContext: () => context = { clearRect() {}, fillRect() {}, getImageData: () => ({ data: new Uint8ClampedArray([139, 92, 246, 255]) }) } }) };
  assert.equal(palette.tailwindColorToHex(colors.violet[500], document), '#8b5cf6');
  assert.equal(context.fillStyle, colors.violet[500]);
  assert.equal(palette.tailwindColorToHex('#AbC', document), '#aabbcc');
});

test('picker exposes all swatches, blocks invalid HEX and uses one tab stop with arrow navigation', async () => {
  const source = await readFile(new URL('../src/components/settings/EditorColorPicker.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let cursor = 0, selected, closed = 0; const cells = [];
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, document: {}, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return { useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = value; return [cells[index], next => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }]; } };
    if (id.endsWith('/ButtonBar')) return { ButtonBar: 'button-bar' };
    if (id.endsWith('/ColorSwatchButton')) return { ColorSwatchButton: 'button', useTailwindColorInformation: value => palette.tailwindColorInformation(value) };
    if (id.endsWith('/tailwindPalette')) return palette;
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog', DialogHeader: 'header', DialogActions: 'actions', DialogButton: 'button' };
    throw new Error(id);
  } });
  const props = { label: '工作区背景', token: '--color-canvas', modeLabel: '浅色', value: '#ffffff', onSelect: value => { selected = value; }, onClose: () => { closed++; } };
  const all = node => Array.isArray(node) ? node.flatMap(all) : node?.props ? [node, ...all(node.props.children)] : [];
  const render = () => { cursor = 0; return all(module.exports.EditorColorPicker(props)); };
  let nodes = render();
  const swatches = nodes.filter(node => node.props['data-palette-color']);
  assert.equal(swatches.length, 286);
  assert.equal(swatches.filter(node => node.props.tabIndex === 0).length, 1);
  assert.equal(swatches.find(node => node.props['aria-label'] === 'olive-500').props.color, colors.olive[500]);
  const focusTargets = Array.from({ length: swatches.length }, (_, index) => ({ focus: () => { selected = index; } }));
  focusTargets[0].closest = () => ({ querySelectorAll: () => focusTargets });
  swatches[0].props.onKeyDown({ key: 'ArrowDown', currentTarget: focusTargets[0], preventDefault() {} });
  assert.equal(selected, 11);
  nodes.find(node => node.props['aria-label'] === '自定义 HEX').props.onChange({ target: { value: '#nope' } }); nodes = render();
  assert.equal(nodes.find(node => (Array.isArray(node.props.children) ? node.props.children.includes('应用颜色') : node.props.children === '应用颜色')).props.disabled, true);
  nodes.find(node => node.props['aria-label'] === '自定义 HEX').props.onChange({ target: { value: '#123456' } }); nodes = render();
  nodes.find(node => (Array.isArray(node.props.children) ? node.props.children.includes('应用颜色') : node.props.children === '应用颜色')).props.onClick();
  assert.equal(selected, '#123456'); assert.equal(closed, 1);
});

test('inactive parent dialog does not trap focus or process Escape while a color dialog is open', async () => {
  const source = await readFile(new URL('../src/hooks/useDialogFocus.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const listeners = new Set(), cleanups = []; let closes = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, HTMLElement: class {}, document: { activeElement: null }, window: { requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) }, require() { return { useRef: value => ({ current: value }), useEffect: effect => cleanups.push(effect()) }; } });
  const ref = { current: {} };
  module.exports.useDialogFocus(ref, () => { closes++; }, false);
  assert.equal(listeners.size, 0);
  module.exports.useDialogFocus(ref, () => { closes++; }, true);
  assert.equal(listeners.size, 1);
  [...listeners][0]({ key: 'Escape', preventDefault() {} });
  assert.equal(closes, 1);
  cleanups.filter(Boolean).forEach(cleanup => cleanup());
  assert.equal(listeners.size, 0);
});
