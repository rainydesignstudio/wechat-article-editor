import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { transform, Features } from 'lightningcss';
import * as palette from '../src/lib/tailwindPalette.ts';

function colorDocument() {
  let canvases = 0, reads = 0;
  const context = { fillStyle: '', clearRect() {}, fillRect() {}, getImageData() {
    reads++;
    const css = transform({ filename: 'color.css', code: Buffer.from(`a{color:${context.fillStyle}}`), targets: { chrome: 90 << 16 }, include: Features.Colors }).code.toString();
    let hex = css.match(/color:\s*(#[\da-f]{3,6})[;\s]/i)?.[1];
    assert.ok(hex);
    if (hex.length === 4) hex = `#${[...hex.slice(1)].map(char => char + char).join('')}`;
    return { data: new Uint8ClampedArray([...hex.slice(1).match(/../g).map(char => Number.parseInt(char, 16)), 255]) };
  } };
  return { document: { body: {}, createElement: () => { canvases++; return { getContext: () => context }; } }, canvases: () => canvases, reads: () => reads };
}

test('Tailwind names require exact HEX matches; normalization, endpoints, new families and duplicate hints stay accurate', () => {
  const fixture = colorDocument();
  assert.deepEqual(palette.tailwindColorInformation('#F1F5F9', fixture.document), { hex: '#f1f5f9', name: 'slate-100' });
  assert.deepEqual(palette.tailwindColorInformation('#123456', fixture.document), { hex: '#123456', name: null });
  assert.equal(palette.tailwindColorInformation('#475569', fixture.document).name, null, 'old Tailwind values must not be approximated');
  assert.deepEqual(palette.tailwindColorInformation('#FFF', fixture.document), { hex: '#ffffff', name: 'white' });
  assert.deepEqual(palette.tailwindColorInformation('#000', fixture.document), { hex: '#000000', name: 'black' });
  assert.equal(palette.tailwindColorInformation('#f1f5f9', fixture.document, 'slate-600').name, 'slate-100', 'mismatching hints are ignored');
  assert.equal(palette.tailwindColorInformation(palette.TAILWIND_PALETTE.find(family => family.name === 'olive').shades[500], fixture.document, 'olive-500').name, 'olive-500');
  const neutral = palette.TAILWIND_PALETTE.find(family => family.name === 'neutral').shades[50];
  assert.equal(palette.tailwindColorInformation(neutral, fixture.document, 'neutral-50').name, 'neutral-50');
  const reads = fixture.reads();
  for (let i = 0; i < 20; i++) palette.tailwindColorInformation('#f1f5f9', fixture.document);
  assert.equal(fixture.canvases(), 1, 'canvas is shared across the color grid');
  assert.equal(fixture.reads(), reads, 'HEX lookups reuse the palette index');
});

const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
async function harness(file, dependencies, initialProps) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const module = { exports: {} }, cells = [], effects = [];
  let cursor = 0, props = initialProps;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
    useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
    useId() { cursor++; return 'tooltip-test'; },
    useEffect(effect, values) { const index = cursor++, previous = cells[index]; if (previous && values.every((value, i) => Object.is(value, previous.values[i]))) return; effects.push(() => { previous?.cleanup?.(); cells[index] = { values, cleanup: effect() }; }); },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  const listeners = new Map();
  const fixture = colorDocument();
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, document: fixture.document, window: { innerWidth: 300, innerHeight: 200, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return hooks;
    if (id === 'react-dom') return { createPortal: children => jsx('portal', { children }) };
    if (id.endsWith('/tailwindPalette')) return palette;
    if (id in dependencies) return dependencies[id];
    throw new Error(id);
  } });
  return { module, listeners, setProps(value) { props = value; }, render(name) { cursor = 0; return module.exports[name](props); }, flush() { while (effects.length) effects.shift()(); } };
}

test('swatches expose name above HEX, omit unmatched names, and keep child controls and accessible labels intact', async () => {
  const props = { color: '#f1f5f9', 'aria-label': 'light.canvas', onFocus() {} };
  const h = await harness('../src/components/global/ColorSwatchButton.tsx', { './TooltipButton': { TooltipButton: 'tooltip-button' } }, props);
  h.render('ColorSwatchButton'); h.flush();
  let tree = h.render('ColorSwatchButton');
  assert.equal(tree.props['aria-label'], 'light.canvas');
  assert.equal(tree.props.title, undefined);
  assert.deepEqual(walk(tree.props.tooltip).filter(node => node.props['data-tailwind-color-name'] || node.props['data-color-hex']).map(node => node.props.children), ['slate-100', '#F1F5F9']);
  h.setProps({ ...props, color: '#123456' }); tree = h.render('ColorSwatchButton');
  assert.deepEqual(walk(tree.props.tooltip).filter(node => node.props['data-tailwind-color-name'] || node.props['data-color-hex']).map(node => node.props.children), ['#123456'], 'stale matches disappear before the effect runs');
  h.flush(); tree = h.render('ColorSwatchButton');
  assert.equal(tree.props.style.backgroundColor, '#123456');
  h.setProps({ color: '#000000', colorName: 'black', children: '纯黑' });
  h.render('ColorSwatchButton'); h.flush(); tree = h.render('ColorSwatchButton');
  assert.equal(tree.props.children, '纯黑');
  assert.equal(tree.props.style.backgroundColor, undefined, 'black/white buttons retain their button surface');
});

test('portal tooltips preserve palette focus handlers, appear outside clipping, clamp to viewport and dismiss on scrolling', async () => {
  let focuses = 0, clicks = 0;
  const tooltip = jsx('span', { children: [jsx('span', { children: 'slate-100' }), jsx('span', { children: '#F1F5F9' })] });
  const h = await harness('../src/components/global/TooltipButton.tsx', {}, { tooltip, 'aria-describedby': 'existing-help', onFocus: () => focuses++, onClick: () => clicks++ });
  let tree = h.render('TooltipButton'); h.flush();
  let button = walk(tree).find(node => node.type === 'button');
  button.props.ref({ getBoundingClientRect: () => ({ left: 275, width: 20, top: 175, bottom: 195 }) });
  button.props.onFocus({ defaultPrevented: false });
  tree = h.render('TooltipButton');
  const popup = walk(tree).find(node => node.props.role === 'tooltip');
  assert.ok(walk(tree).some(node => node.type === 'portal'));
  popup.props.ref.current = { getBoundingClientRect: () => ({ width: 80, height: 40 }) };
  h.flush(); tree = h.render('TooltipButton');
  button = walk(tree).find(node => node.type === 'button');
  const placed = walk(tree).find(node => node.props.role === 'tooltip');
  assert.equal(focuses, 1);
  assert.equal(button.props['aria-describedby'], 'existing-help tooltip-test');
  assert.equal(placed.props.style.left, 212);
  assert.equal(placed.props.style.top, 127);
  h.listeners.get('scroll')(); tree = h.render('TooltipButton'); h.flush();
  assert.equal(walk(tree).some(node => node.props.role === 'tooltip'), false);
  walk(tree).find(node => node.type === 'button').props.onClick({});
  assert.equal(clicks, 1);
});

test('a native summary keeps the shared tooltip and exposes no nested button', async () => {
  const h = await harness('../src/components/global/TooltipButton.tsx', {}, { as: 'summary', tooltip: '插入元素', 'aria-label': '插入元素' });
  let tree = h.render('TooltipButton'); h.flush();
  const summary = walk(tree).find(node => node.type === 'summary');
  assert.ok(summary);
  assert.equal(walk(tree).some(node => node.type === 'button'), false);
  summary.props.ref({ getBoundingClientRect: () => ({ left: 20, width: 36, top: 20, bottom: 56 }) });
  summary.props.onFocus({ defaultPrevented: false });
  tree = h.render('TooltipButton');
  assert.equal(walk(tree).find(node => node.props.role === 'tooltip').props.children, '插入元素');
});

test('current-color header adds exact Tailwind names and retains HEX alone for custom colors', async () => {
  const fixture = colorDocument();
  const props = { label: '工作区背景', token: '--color-canvas', modeLabel: '浅色', value: '#F1F5F9', onSelect() {}, onClose() {} };
  const dependencies = {
    '../global/ColorSwatchButton': { ColorSwatchButton: 'swatch', useTailwindColorInformation: value => palette.tailwindColorInformation(value, fixture.document) },
    '../global/DialogFrame': { DialogFrame: 'dialog', DialogHeader: 'header' },
    '../global/ButtonBar': { ButtonBar: 'button-bar' },
  };
  const h = await harness('../src/components/settings/EditorColorPicker.tsx', dependencies, props);
  let nodes = walk(h.render('EditorColorPicker'));
  assert.equal(nodes.find(node => node.props['data-current-tailwind-color']).props.children, 'slate-100');
  h.setProps({ ...props, value: '#123456' }); nodes = walk(h.render('EditorColorPicker'));
  assert.equal(nodes.some(node => node.props['data-current-tailwind-color']), false);
  assert.ok(nodes.some(node => node.props.children === '#123456'));
  assert.equal(nodes.filter(node => node.props['data-palette-color']).length, 286);
});


test('disabled native buttons retain non-activating pointer and keyboard tooltip access', async () => {
  let clicks = 0, stopped = 0;
  const h = await harness('../src/components/global/TooltipButton.tsx', {}, { tooltip: '请先选择图片', disabled: true, 'aria-label': '采用图片', onClick: () => clicks++ });
  let tree = h.render('TooltipButton'); h.flush();
  const button = walk(tree).find(node => node.type === 'button');
  let wrapper = walk(tree).find(node => node.props['aria-disabled'] === 'true');
  wrapper.props.ref.current = { getBoundingClientRect: () => ({ left: 30, width: 32, top: 40, bottom: 72 }) };
  assert.equal(button.props.disabled, true); assert.equal(wrapper.props.tabIndex, 0);
  wrapper.props.onPointerEnter({ pointerType: 'mouse' });
  tree = h.render('TooltipButton'); assert.ok(walk(tree).some(node => node.props.role === 'tooltip'));
  wrapper = walk(tree).find(node => node.props['aria-disabled'] === 'true'); wrapper.props.onBlur();
  h.render('TooltipButton'); wrapper.props.onFocus(); tree = h.render('TooltipButton');
  assert.ok(walk(tree).some(node => node.props.role === 'tooltip'));
  wrapper.props.onKeyDown({ key: 'Enter', preventDefault() {}, stopPropagation() { stopped++; } });
  wrapper.props.onClick({ stopPropagation() { stopped++; } });
  button.props.onClick({ preventDefault() {}, stopPropagation() { stopped++; } });
  assert.equal(stopped, 3); assert.equal(clicks, 0);
});
