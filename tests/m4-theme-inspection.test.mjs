import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { inspectionDimmedElements, animateInspectionScroll, createArticleColorInspection, uniqueBindings } from '../src/lib/themeInspection.ts';
import { compileThemeInspectionUtilities } from '../src/lib/tailwind.ts';
import * as editorThemes from '../src/lib/editorThemes.ts';
import { tokenizeEditorSource } from '../src/lib/editorSourceHighlight.ts';

test('nested inspection hits keep every ancestor opaque and dim unrelated branches only once', () => {
  const node = parent => ({ parentElement: parent, contains(other) { for (let item = other; item; item = item.parentElement) if (item === this) return true; return false; } });
  const root = node(null), paragraph = node(root), link = node(paragraph), strong = node(paragraph), section = node(root), heading = node(section), caption = node(section);
  const all = [root, paragraph, link, strong, section, heading, caption];
  assert.deepEqual([...inspectionDimmedElements(all, [link])], [strong, section]);
  assert.deepEqual([...inspectionDimmedElements(all, [link, heading])], [strong, caption]);
  assert.deepEqual([...inspectionDimmedElements(all, [root])], [paragraph, section]);
  assert.deepEqual([...inspectionDimmedElements(all, [root, paragraph, link, strong])], [section]);
  assert.deepEqual([...inspectionDimmedElements(all, [])], [root]);
});

test('locating a color scrolls only its nearest scroll container over exactly 300ms and can cancel', () => {
  const frames = new Map(); let id = 0;
  const view = { performance: { now: () => 0 }, requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); }, getComputedStyle: () => ({ overflowY: 'auto' }) };
  const container = { parentElement: null, scrollTop: 10, scrollHeight: 1000, clientHeight: 200, getBoundingClientRect: () => ({ top: 100 }) };
  const row = { parentElement: container, ownerDocument: { defaultView: view }, getBoundingClientRect: () => ({ top: 600, height: 40 }) };
  const cancel = animateInspectionScroll(row);
  const step = now => { const [key, fn] = frames.entries().next().value; frames.delete(key); fn(now); };
  step(150); assert.ok(container.scrollTop > 10 && container.scrollTop < 430);
  step(300); assert.equal(container.scrollTop, 430); assert.equal(frames.size, 0);
  animateInspectionScroll(row); cancel();
});

test('article source tracing keeps same-HEX tokens distinct and identifies node overrides and fixed CSS', () => {
  const style = (props) => ({ ...props, cssText: Object.entries(props).map(([key, value]) => `${key}: ${value};`).join(''), [Symbol.iterator]: function* () { yield* Object.keys(props); }, getPropertyValue: key => props[key] ?? '', getPropertyPriority: () => '' });
  const rules = [
    { selectorText: '.theme-preview-instance-test .article-preview', style: style({ color: 'var(--color-article-ink)', 'background-color': 'var(--color-article-quote-surface)' }) },
    { selectorText: '.theme-preview-instance-test .article-preview .article-body h1', style: style({ color: 'var(--color-article-heading)' }) },
    { selectorText: '.theme-preview-instance-test .article-preview .article-body a', style: style({ color: '#123456' }) },
    { selectorText: '.theme-preview-instance-test .article-preview .article-body h3', style: style({ color: '#654321' }) },
  ];
  const old = globalThis.CSSStyleSheet;
  globalThis.CSSStyleSheet = class { cssRules = rules; replaceSync() {} };
  const inserted = [];
  const doc = { createElement: () => ({ dataset: {}, remove() { this.removed = true; } }), defaultView: { getComputedStyle: element => ({ textDecorationLine: 'none', backgroundImage: 'none', getPropertyValue: key => element.trace[key] ?? (key.endsWith('-width') ? '0' : '') }) } };
  const element = (tag, textSource) => ({ ownerDocument: doc, parentElement: null, childNodes: [{ nodeType: 3, textContent: 'visible' }], trace: { '--theme-inspection-text': textSource, '--theme-inspection-background': 'source-1' }, style: style({}), matches: selector => selector.split(',').includes(tag), closest: () => null, querySelectorAll: () => [], contains(other) { for (let item = other; item; item = item.parentElement) if (item === this) return true; return false; } });
  const root = element('article', 'source-0'); root.parentElement = { append: value => inserted.push(value) };
  const h1 = element('h1', 'source-2'), link = element('a', 'source-3'), h3 = element('h3', 'source-4');
  const css = '.article-preview { color: var(--color-article-ink); background-color: var(--color-article-quote-surface); }\n.article-preview .article-body h1 { color: var(--color-article-heading); }\n.article-preview .article-body a { color: #111111; }\n.article-preview .article-body a { color :   #123456; }';
  const theme = { css, tokens: { 'color-article-ink': '#333333', 'color-article-heading': '#333333', 'color-article-quote-surface': '#ffffff' }, nodes: { h3: { color: '#654321' } } };
  try {
    const probe = createArticleColorInspection(root, theme, css);
    assert.ok(probe.read(root).some(binding => binding.key === 'color-article-ink'));
    assert.ok(probe.read(h1).some(binding => binding.key === 'color-article-heading'));
    assert.equal(probe.read(h1).some(binding => binding.key === 'color-article-ink'), false);
    const fixed = probe.read(link).find(binding => binding.kind === 'css');
    assert.equal(css.slice(fixed.start, fixed.end).trim(), 'color :   #123456;');
    assert.equal(fixed.token, 'CSS · 第 4 行');
    assert.ok(probe.read(h3).some(binding => binding.key === 'node:h3' && !binding.hidden));
    assert.match(inserted[0].textContent, /--theme-inspection-text:source-2/);
    assert.doesNotMatch(inserted[0].textContent, /\{color:|background-color:/);
    probe.dispose(); assert.equal(inserted[0].removed, true);
  } finally { globalThis.CSSStyleSheet = old; }
});

test('iframe inspection uses official opacity and 300ms transition utilities without article styling', async () => {
  const css = await compileThemeInspectionUtilities();
  assert.match(css, /transition-property: opacity/);
  assert.match(css, /transition-duration: 300ms/);
  assert.match(css, /opacity: (?:50%|0\.5)/);
  assert.doesNotMatch(css, /article-preview|article-body/);
  assert.equal(await compileThemeInspectionUtilities(), css);
});

test('pending CSSOM shorthand longhands never become fixed colors; table and inline inheritance retain token sources', () => {
  const old = globalThis.CSSStyleSheet;
  const style = (cssText, pending = []) => ({ cssText, [Symbol.iterator]: function* () { yield* pending; }, getPropertyValue: () => '', getPropertyPriority: () => '' });
  const rules = [
    { selectorText: '.theme-preview-instance-test .article-preview', style: style('color:var(--color-article-ink);background:var(--color-article-quote-surface);', ['background-color']) },
    { selectorText: '.theme-preview-instance-test .article-preview .article-body th', style: style('border:1px solid var(--color-article-line);background:var(--color-article-tint);color:var(--color-article-heading);', ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'background-color', 'background-image']) },
  ];
  globalThis.CSSStyleSheet = class { cssRules = rules; replaceSync() {} };
  const doc = { createElement: () => ({ dataset: {}, remove() {} }), defaultView: { getComputedStyle: element => ({ textDecorationLine: 'none', backgroundImage: 'none', getPropertyValue: key => element.trace[key] ?? (key.endsWith('-width') ? '1px' : key.endsWith('-style') ? 'solid' : '') }) } };
  const element = (parent, props) => ({ parentElement: parent, ownerDocument: doc, childNodes: [{ nodeType: 3, textContent: 'sample' }], style: style(''), trace: props,
    matches: () => false, closest: () => null, querySelectorAll: () => [], contains(other) { for (let item = other; item; item = item.parentElement) if (item === this) return true; return false; } });
  const root = element(null, { '--theme-inspection-text': 'source-0', '--theme-inspection-background': 'source-1' }); root.parentElement = { append() {} };
  const th = element(root, { '--theme-inspection-text': 'source-4', '--theme-inspection-background': 'source-3', ...Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [`--theme-inspection-border-${side}`, 'source-2'])) });
  try {
    const probe = createArticleColorInspection(root, { css: '', tokens: {} }, '');
    const bindings = probe.read(th);
    assert.deepEqual(bindings.filter(binding => !binding.hidden).map(binding => binding.key).sort(), ['color-article-heading', 'color-article-line', 'color-article-tint']);
    assert.equal(bindings.some(binding => binding.kind === 'css'), false);
    const code = element(th, { '--theme-inspection-text': 'source-4' });
    th.style = style('color:var(--color-article-code-tint);'); code.style = style('color:inherit;');
    assert.ok(probe.read(code).some(binding => binding.key === 'color-article-code-tint'));
    probe.dispose();
  } finally { globalThis.CSSStyleSheet = old; }
});

test('article inspection traces currentColor, transparent paint, gradient shorthand and functional accents without false fixed colors', () => {
  const old = globalThis.CSSStyleSheet;
  const style = (props, longhands = {}) => ({ cssText: Object.entries(props).map(([key, value]) => `${key}:${value};`).join(''), getPropertyValue: key => longhands[key] ?? props[key] ?? '', getPropertyPriority: () => '' });
  const rules = [
    { selectorText: '.theme-preview-instance-test .article-preview', style: style({ color: 'var(--color-article-ink)', background: 'var(--color-article-quote-surface)' }) },
    { selectorText: '.theme-preview-instance-test .article-preview .gradient', style: style({ background: 'linear-gradient(var(--color-article-tint),var(--color-article-accent))' }) },
    { selectorText: '.theme-preview-instance-test .article-preview p', style: style({ color: 'currentColor', border: '1px solid' }, { 'border-top-color': 'currentcolor', 'border-right-color': 'currentcolor', 'border-bottom-color': 'currentcolor', 'border-left-color': 'currentcolor' }) },
    { selectorText: '.theme-preview-instance-test .article-preview input', style: style({ 'accent-color': 'var(--color-article-accent)' }) },
  ];
  globalThis.CSSStyleSheet = class { cssRules = rules; replaceSync() {} };
  const inserted = [];
  const doc = { createElement: () => ({ dataset: {}, remove() {} }), defaultView: { getComputedStyle: element => ({ backgroundColor: element.background, backgroundImage: element.image ?? 'none', textDecorationLine: 'none', getPropertyValue: key => element.trace[key] ?? (key.endsWith('-width') ? '1px' : key.endsWith('-style') ? 'solid' : '') }) } };
  const element = (parent, props = {}) => ({ parentElement: parent, ownerDocument: doc, childNodes: [{ nodeType: 3, textContent: 'sample' }], background: 'rgba(0, 0, 0, 0)', style: style({}), trace: { '--theme-inspection-text': 'source-0', ...props }, matches: () => false, querySelectorAll: () => [], contains(other) { for (let item = other; item; item = item.parentElement) if (item === this) return true; return false; } });
  const root = element(null, { '--theme-inspection-background': 'source-1' }); root.background = 'rgb(255, 255, 255)'; root.parentElement = { append: value => inserted.push(value) };
  const gradient = element(root, { '--theme-inspection-background': 'source-2', '--theme-inspection-image': 'source-2' }); gradient.image = 'linear-gradient(rgb(0,0,0),rgb(255,255,255))';
  const paragraph = element(gradient); paragraph.style = style({ border: '1px solid currentColor', background: 'rgba(0,0,0,0)' });
  const input = element(root, { '--theme-inspection-accent': 'source-3' }); input.matches = selector => selector.includes(':checked');
  try {
    const probe = createArticleColorInspection(root, { css: '', tokens: {} }, '');
    assert.match(inserted[0].textContent, /--theme-inspection-border-top:var\(--theme-inspection-text\)/, 'implicit currentColor inherits actual text provenance');
    assert.match(inserted[0].textContent, /--theme-inspection-text:inherit/, 'color:currentColor inherits instead of creating a cyclic trace variable');
    const keys = probe.read(paragraph).map(binding => binding.key);
    assert.deepEqual(keys.sort(), ['color-article-accent', 'color-article-ink', 'color-article-quote-surface', 'color-article-tint']);
    assert.equal(probe.read(paragraph).some(binding => binding.kind === 'css'), false, 'transparent inline background and currentColor are not fixed colors');
    assert.ok(probe.read(input).some(binding => binding.key === 'color-article-accent'));
    input.matches = () => false;
    assert.equal(probe.read(input).some(binding => binding.key === 'color-article-accent'), false, 'unpainted checkbox accent is not reported');
    paragraph.background = 'rgb(250, 250, 250)'; paragraph.style = style({ background: 'var(--color-article-code-tint)' });
    assert.deepEqual(probe.read(paragraph).map(binding => binding.key).sort(), ['color-article-code-tint', 'color-article-ink'], 'opaque paint excludes covered ancestor gradient');
    probe.dispose();
  } finally { globalThis.CSSStyleSheet = old; }
});

test('shared linkage separates temporary preview hovering from pinned list selection and clears both without writes', async () => {
  const source = await readFile(new URL('../src/components/global/ThemeInspection.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} }, cells = [], effects = [], frames = []; let cursor = 0, linkage;
  vm.runInNewContext(code, { module, exports: module.exports, requestAnimationFrame: fn => (frames.push(fn), frames.length), cancelAnimationFrame() {}, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react-dom') return {};
    if (id.endsWith('/themeInspection')) return { animateInspectionScroll, uniqueBindings };
    if (id === 'react') return {
      useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
      useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = value; return [cells[index], next => cells[index] = typeof next === 'function' ? next(cells[index]) : next]; },
      useEffect(effect, deps) { const index = cursor++; if (!cells[index] || deps.some((value, i) => value !== cells[index][i])) { cells[index] = deps; effects.push(effect); } },
    };
    throw Error(id);
  } });
  const render = () => { cursor = 0; linkage = module.exports.useThemeInspection(); while (effects.length) effects.shift()(); };
  render(); linkage.rowProps('heading').onPointerEnter(); render(); assert.equal(linkage.hovered, 'heading');
  linkage.locate({ key: 'ink', label: '正文', token: '--color-article-ink' }); render();
  assert.equal(linkage.rowProps('ink')['data-inspection-dim'], false);
  assert.equal(linkage.rowProps('heading')['data-inspection-dim'], true);
  linkage.rowProps('heading').onPointerLeave(); render(); assert.equal(linkage.hovered, null); assert.equal(linkage.selected.key, 'ink');
  linkage.listProps.onPointerEnter(); render();
  assert.equal(linkage.selected, null); assert.equal(linkage.rowProps('heading')['data-inspection-dim'], false);
  linkage.rowProps('heading').onPointerEnter(); render(); assert.equal(linkage.hovered, 'heading');
  linkage.clear(); render(); assert.equal(linkage.selected, null); assert.equal(linkage.rowProps('heading')['data-inspection-dim'], false);
});

test('editor preview identifies component colors and aliases from palette references rather than equal HEX', async () => {
  const source = await readFile(new URL('../src/components/settings/EditorThemeDesigner.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code + '\nexports.read = editorElementBindings; exports.Preview = Preview;', { module, exports: module.exports, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/editorThemes')) return editorThemes;
    if (id.endsWith('/editorSourceHighlight')) return { tokenizeEditorSource };
    if (id.endsWith('/themeInspection')) return { uniqueBindings };
    return {};
  } });
  const node = (classes, parent, own = true, states = []) => ({ classList: Object.assign(new Set(classes.split(' ')), { contains(value) { return this.has(value); } }), parentElement: parent,
    childNodes: own ? [{ nodeType: 3, textContent: 'sample' }] : [], matches: selector => selector.split(',').some(selector => states.includes(selector)),
    contains(other) { for (let item = other; item; item = item.parentElement) if (item === this) return true; return false; } });
  const root = node('bg-canvas text-secondary border-line', null, false);
  const caption = node('editor-theme-preview-caption', root);
  const field = node('field', root, false, ['input', ':placeholder-shown']);
  const theme = structuredClone(editorThemes.BASE_EDITOR_THEME);
  const captionBindings = module.exports.read(caption, root, theme, 'light');
  assert.ok(captionBindings.some(binding => binding.key === 'faint'));
  assert.equal(captionBindings.some(binding => binding.key === 'secondary'), false);
  assert.equal(module.exports.read(field, root, theme, 'light').some(binding => binding.key === 'secondary'), false);
  assert.ok(module.exports.read(field, root, theme, 'light').some(binding => binding.key === 'faint'));
  const filled = node('field', root, false, ['input']);
  assert.ok(module.exports.read(filled, root, theme, 'light').some(binding => binding.key === 'secondary'));
  assert.equal(module.exports.read(filled, root, theme, 'light').some(binding => binding.key === 'faint'), false);
  const header = node('editor-theme-preview-caption bg-panel text-editor-text', root);
  assert.ok(module.exports.read(header, root, theme, 'light').some(binding => binding.key === 'editor-text'));
  assert.equal(module.exports.read(header, root, theme, 'light').some(binding => binding.key === 'faint'), false);
  const clear = node('bg-panel/0', root, false);
  assert.equal(module.exports.read(clear, root, theme, 'light').some(binding => binding.key === 'panel'), false);
  assert.ok(module.exports.read(clear, root, theme, 'light').some(binding => binding.key === 'canvas'));
  const button = node('button button-primary', root);
  assert.ok(module.exports.read(button, root, theme, 'light').some(binding => binding.key === 'accent'));
  const dangerButton = node('button button-danger', root, true, ['button']);
  assert.ok(module.exports.read(dangerButton, root, theme, 'light').some(binding => binding.key === 'danger'));
  assert.ok(module.exports.read(dangerButton, root, theme, 'light').some(binding => binding.key === 'panel'));
  assert.equal(module.exports.read(dangerButton, root, theme, 'light').some(binding => binding.key === 'on-danger'), false);
  const dangerHover = node('button button-danger', root, true, ['button', ':hover']);
  assert.ok(module.exports.read(dangerHover, root, theme, 'light').some(binding => binding.key === 'on-danger'));
  assert.equal(module.exports.read(dangerHover, root, theme, 'light').some(binding => binding.key === 'panel'), false);
  const fork = module.exports.forkEditorTheme(theme);
  assert.equal(JSON.stringify(theme), JSON.stringify(editorThemes.BASE_EDITOR_THEME));
  assert.deepEqual(editorThemes.validateEditorTheme(JSON.parse(JSON.stringify(fork))), []);
  const aliasTheme = structuredClone(theme);
  aliasTheme.surfaces = Object.fromEntries(['light', 'dark'].map(mode => [mode, { primaryButton: aliasTheme.colors[mode].accent, primaryText: aliasTheme.colors[mode]['on-accent'], primaryHover: aliasTheme.colors[mode]['accent-strong'], secondaryButton: aliasTheme.colors[mode].panel, eyebrow: aliasTheme.colors[mode]['accent-text'], dangerSurface: aliasTheme.colors[mode].panel, field: { color: aliasTheme.colors[mode].panel, opacity: 100 }, shadow: { color: aliasTheme.colors[mode].secondary, opacity: 15 }, canvasWash: { colors: [aliasTheme.colors[mode].accent, aliasTheme.colors[mode].panel, aliasTheme.colors[mode].canvas], opacity: 0 } }]));
  for (const mode of ['light', 'dark']) {
    aliasTheme.palette['independent-action'] = aliasTheme.palette[aliasTheme.colors[mode].panel];
    aliasTheme.surfaces[mode].primaryButton = 'independent-action';
    aliasTheme.surfaces[mode].primaryText = aliasTheme.colors[mode]['on-accent'];
    aliasTheme.surfaces[mode].primaryHover = [aliasTheme.colors[mode].accent, aliasTheme.colors[mode]['accent-strong'], aliasTheme.colors[mode].accent, aliasTheme.colors[mode]['accent-strong']];
    aliasTheme.surfaces[mode].field = { color: aliasTheme.colors[mode].panel, opacity: 0 };
  }
  const aliasFork = module.exports.forkEditorTheme(aliasTheme);
  assert.notEqual(aliasFork.surfaces.light.primaryButton, aliasFork.colors.light.panel, 'equal HEX must not collapse independent palette references');
  assert.ok(module.exports.read(node('button button-primary', root, true, [':hover']), root, aliasFork, 'light').some(binding => binding.token.startsWith('--editor-action-gradient')));
  assert.equal(module.exports.read(field, root, aliasTheme, 'light').some(binding => binding.key === 'panel'), false, 'zero-alpha field background has no visible panel contribution');
  const rendered = module.exports.Preview({ theme, mode: 'light', inspection: {} }).props.children;
  const elements = [];
  const build = (value, parent) => {
    if (Array.isArray(value)) { value.forEach(child => build(child, parent)); return; }
    if (!value?.props) return;
    if (typeof value.type !== 'string') { build(value.props.children, parent); return; }
    const element = node(value.props.className ?? '', parent, false, [value.type, ...(value.type === 'input' ? [':placeholder-shown'] : [])]);
    const children = [value.props.children].flat(Infinity);
    element.childNodes = children.filter(child => typeof child === 'string').map(text => ({ nodeType: 3, textContent: text }));
    element.tag = value.type; elements.push(element); build(value.props.children, element);
  };
  build(rendered, null);
  const sources = elements.filter(element => element.tag === 'pre');
  assert.ok(elements.some(element => element.tag === 'mark' && element.classList.contains('bg-selection/60')));
  assert.ok(elements.some(element => element.tag === 'button' && element.classList.contains('button-danger')));
  assert.equal(sources.length, 2);
  assert.ok(sources.every(element => !element.childNodes.length), 'source containers must not have bare text that stays opaque with highlighted descendants');
  for (const role of ['editor-heading', 'editor-quote', 'editor-syntax']) {
    const hits = elements.filter(element => module.exports.read(element, elements[0], theme, 'dark').some(binding => binding.key === role));
    const dimmed = inspectionDimmedElements(elements, hits);
    const ordinary = elements.filter(element => element.childNodes.length && element.classList.contains('text-editor-text'));
    assert.ok(ordinary.length > 1);
    assert.ok(ordinary.every(element => [...dimmed].some(branch => branch.contains(element))), `plain source text must dim when highlighting ${role}`);
    assert.ok(hits.every(element => ![...dimmed].some(branch => branch.contains(element))));
  }
  for (const mode of ['light', 'dark']) {
    const consumed = new Set(elements.flatMap(element => module.exports.read(element, elements[0], theme, mode)).map(binding => binding.key));
    assert.deepEqual(editorThemes.EDITOR_COLOR_ROLES.filter(role => !consumed.has(role)), [], `every ${mode} color has an inspectable preview consumer`);
  }
});

test('article node swatches use measured CSS defaults and preserve explicit node token overrides', async () => {
  const source = await readFile(new URL('../src/components/themes/ArticleThemeFields.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return { useEffect() {}, useState: value => [value, () => {}] };
    if (id.endsWith('/ColorSwatchButton')) return { ColorSwatchButton: 'swatch' };
    if (id.endsWith('/CollapsiblePanel')) return { CollapsiblePanel: 'panel', PanelIcon: 'icon' };
    if (id.endsWith('/ButtonBar')) return { ButtonBar: 'bar' };
    if (id.endsWith('/themeInspection')) return { ARTICLE_COLOR_LABELS: {} };
    return {};
  } });
  const find = value => {
    if (Array.isArray(value)) return value.map(find).find(Boolean);
    if (!value?.props) return;
    if (value.props['aria-label'] === '修改节点文字色') return value;
    return find(value.props.children);
  };
  const theme = { tokens: { 'color-article-heading': '#111111', 'color-article-ink': '#333333', 'color-article-code': '#555555' } };
  const props = { theme, disabled: false, fonts: [], nodeKey: 'paragraph', nodeColors: { paragraph: '#333333' } };
  assert.equal(find(module.exports.ArticleThemeFields(props)).props.color, '#333333', 'paragraph default must not silently use heading color');
  theme.nodes = { paragraph: { color: 'var(--color-article-code)' } };
  assert.equal(find(module.exports.ArticleThemeFields(props)).props.color, '#555555', 'explicit node color remains authoritative');
});

test('popup remains actionable while crossing preview siblings and cancels its 200ms fade on reentry', async () => {
  const source = await readFile(new URL('../src/components/global/ThemeInspection.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} }, cells = [], effects = [], timers = new Map();
  let cursor = 0, now = 0, id = 0, tree, located;
  const node = (name, parent = null) => ({ name, nodeType: 1, isConnected: true, parentElement: parent, dataset: {}, classList: { add() {}, remove() {} },
    contains(other) { for (let item = other; item; item = item.parentElement) if (item === this) return true; return false; },
    matches: () => false, removeAttribute() {}, getBoundingClientRect: () => ({ left: 20, top: 20, bottom: 40, width: 100, height: 20 }),
    events: {}, addEventListener(type, handler) { this.events[type] = handler; }, removeEventListener(type) { delete this.events[type]; },
    closest: () => null, querySelectorAll: () => [], focus() {},
  });
  const root = node('root'), first = node('first', root), second = node('second', root), wrapper = node('wrapper'), popupElement = node('popup');
  root.querySelectorAll = () => [first, second]; wrapper.firstElementChild = root;
  const win = { innerWidth: 1000, innerHeight: 1000, addEventListener() {}, removeEventListener() {} };
  const doc = { body: {}, defaultView: win }; root.ownerDocument = doc;
  const react = {
    useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
    useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = value; return [cells[index], next => cells[index] = typeof next === 'function' ? next(cells[index]) : next]; },
    useEffect(effect, deps) { const index = cursor++; if (!cells[index] || deps.some((value, i) => value !== cells[index][i])) { cells[index] = deps; effects.push(effect); } },
  };
  react.useLayoutEffect = react.useEffect;
  vm.runInNewContext(code, { module, exports: module.exports, window: win, document: doc,
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs };
      if (name === 'react-dom') return { createPortal: child => child };
      if (name.endsWith('/themeInspection')) return { uniqueBindings, inspectionDimmedElements, INSPECTION_CLASSES: [] };
      throw Error(name);
    },
  });
  const props = { inspection: { hovered: null, locate(binding) { located = binding.key; }, clear() {} },
    resolve: element => [{ key: element.name, token: `--${element.name}`, label: element.name }] };
  const render = () => {
    cursor = 0; tree = module.exports.ThemeInspectionPreview(props);
    tree.props.children[0].props.ref.current = wrapper;
    if (tree.props.children[1]) tree.props.children[1].props.ref.current = popupElement;
    while (effects.length) effects.shift()();
  };
  const popup = () => tree.props.children[1];
  const advance = milliseconds => { now += milliseconds; for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn(); } render(); };
  const hover = target => { root.events.pointerover({ type: 'pointerover', target }); render(); };
  render(); hover(first); assert.equal(popup().props.children[0].props.children[0].props.children, 'first');
  hover(second); advance(100);
  assert.equal(popup().props.children[0].props.children[0].props.children, 'first');
  popup().props.onPointerEnter(); advance(200);
  assert.equal(popup().props.children[0].props.children[0].props.children, 'first');
  popup().props.onPointerLeave(); render(); assert.equal(popup().props['data-fading'], true);
  advance(199); assert.ok(popup());
  popup().props.onPointerEnter(); render(); advance(1); assert.ok(popup()); assert.equal(popup().props['data-fading'], false);
  popup().props.children[0].props.onClick(); render(); assert.equal(located, 'first'); assert.equal(popup(), null);
  hover(first); popup().props.onPointerLeave(); advance(200); assert.equal(popup(), null);
  hover(first); hover(second); advance(200);
  assert.equal(popup().props.children[0].props.children[0].props.children, 'second');
});
