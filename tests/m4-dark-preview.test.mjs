import assert from 'node:assert/strict';
import test from 'node:test';
import { articleDarkPreviewDocument, cloneArticleForDarkPreview, createArticleColorNormalizer, observeArticlePreview } from '../src/lib/articleDarkPreview.ts';

test('late Markdown hydration and subsequent DOM changes refresh dark previews, and stale observers stop on theme switches', t => {
  const previous = globalThis.MutationObserver, observers = [];
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(root, options) { this.root = root; this.options = options; }
    disconnect() { this.disconnected = true; }
  };
  t.after(() => { if (previous) globalThis.MutationObserver = previous; else delete globalThis.MutationObserver; });
  const root = { textContent: '', get outerHTML() { return `<article>${this.textContent}</article>`; } }, snapshots = [];
  const stop = observeArticlePreview(root, () => snapshots.push(root.textContent));
  assert.deepEqual(snapshots, ['']);
  root.textContent = '迟到的 Markdown 正文'; observers[0].callback();
  assert.deepEqual(snapshots, ['', '迟到的 Markdown 正文']);
  for (let index = 0; index < 1000; index++) observers[0].callback();
  assert.equal(snapshots.length, 2, 'identical React attribute writes must not rebuild the iframe');
  assert.equal(observers[0].options.childList, true);
  assert.equal(observers[0].options.subtree, true);
  stop(); assert.equal(observers[0].disconnected, true);
  root.textContent = '下一套主题'; observers[0].callback();
  assert.equal(snapshots.length, 2, 'old theme cannot overwrite the new preview');
  const stopNext = observeArticlePreview(root, () => snapshots.push(root.textContent));
  assert.equal(snapshots.at(-1), '下一套主题');
  stopNext();
});

function element(computed, children = [], attributes = {}) {
  const properties = new Map();
  const node = {
    attributes: { ...attributes }, children, computed, parentElement: null,
    classList: { contains: name => (attributes.class ?? '').split(/\s+/).includes(name) },
    style: { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name), getPropertyValue: name => properties.get(name) || '' },
    querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]); },
    querySelector(selector) { return selector === ':scope > .article-body' ? this.children.find(child => child.attributes.class === 'article-body') ?? null : null; },
    removeAttribute(name) { delete this.attributes[name]; },
    cloneNode() { return element(computed, children.map(child => child.cloneNode()), this.attributes); },
  };
  children.forEach(child => { child.parentElement = node; });
  return node;
}

function cloneWith(computed) {
  const root = element(computed, [], { hidden: '', class: 'article-preview' });
  root.ownerDocument = { defaultView: { getComputedStyle: source => ({ getPropertyValue: name => source.computed[name] || '' }) } };
  return { root, copy: cloneArticleForDarkPreview(root) };
}

test('the measurement clone does not apply any home-grown gray mirroring', () => {
  for (const color of ['rgb(35, 35, 35)', 'rgb(255, 255, 255)', 'rgb(124, 58, 237)', 'rgba(35, 35, 35, 0.5)']) assert.equal(cloneWith({ color }).copy.style.getPropertyValue('color'), color);
});

function boxedIn(inner, outer = {}) {
  const panel = element({ 'background-color': 'rgba(0, 0, 0, 0)', ...inner });
  const root = element({ color: 'rgb(35, 35, 35)', 'background-color': 'rgba(0, 0, 0, 0)', ...outer }, [panel], { class: 'article-preview' });
  root.ownerDocument = { defaultView: { getComputedStyle: source => ({ getPropertyValue: name => source.computed[name] || '' }) } };
  return { panel: cloneArticleForDarkPreview(root).children[0], root };
}

test('the clone strips only configured generated root/body backgrounds and preserves authored colors', () => {
  const tinted = boxedIn({ color: 'rgb(35, 35, 35)', 'background-color': 'rgb(241, 245, 249)' });
  assert.equal(tinted.panel.style.getPropertyValue('color'), 'rgb(35, 35, 35)');
  assert.equal(tinted.panel.style.getPropertyValue('background-color'), 'rgb(241, 245, 249)');
  assert.equal(tinted.root.style.getPropertyValue('color'), '');
});

test('dark preview resolves live class colors on a clone, preserving the light DOM, assets and responsive layout', () => {
  const rootStyles = { color: 'rgb(23, 30, 40)', 'background-color': 'rgb(255, 255, 255)', 'border-left-color': 'rgb(0, 120, 140)', 'border-left-width': '4px', 'border-left-style': 'solid', 'border-left': '4px solid rgb(0, 120, 140)' };
  const childStyles = { color: 'rgb(70, 80, 90)', 'background-color': 'rgba(0, 0, 0, 0)' };
  const image = element(childStyles, [], { src: 'blob:local-image', 'data-no-dark': 'true' });
  const body = element({ 'background-color': 'rgb(248, 250, 252)' }, [], { class: 'article-body' });
  const root = element(rootStyles, [image, body], { hidden: '', class: 'article-preview' });
  root.ownerDocument = { defaultView: { getComputedStyle: source => ({ getPropertyValue: name => source.computed[name] || '' }) } };
  const copy = cloneArticleForDarkPreview(root);
  assert.equal(copy.style.getPropertyValue('color'), rootStyles.color);
  assert.equal(copy.style.getPropertyValue('border-left'), rootStyles['border-left']);
  assert.equal(root.style.getPropertyValue('border-left'), '', 'cloning must not style the original');
  assert.equal(copy.children[0].style.getPropertyValue('color'), childStyles.color);
  assert.equal(copy.children[0].attributes.src, 'blob:local-image');
  assert.equal(copy.children[0].attributes['data-no-dark'], 'true');
  assert.equal(copy.attributes.hidden, undefined);
  assert.equal(root.attributes.hidden, '');
  assert.equal(root.style.getPropertyValue('color'), '');
  assert.equal(copy.style.getPropertyValue('width'), '');
  assert.equal(copy.style.getPropertyValue('background-color'), '', 'the page background must not be inlined on the article root');
  assert.equal(copy.children[1].style.getPropertyValue('background-color'), '', 'the generated body wrapper must not carry page paint');
});

test('the isolated document loads the registered conversion and escapes stylesheet breakouts', () => {
  const css = '.article-preview{color:var(--color-article-ink)}';
  const html = '<article class="article-preview"><p>原稿</p></article>';
  const result = articleDarkPreviewDocument(css, html);
  assert.ok(result.includes('src="/mp-darkmode.js"') && result.includes('src="/article-format-engine.js"'));
  assert.ok(result.includes('background:#191919'));
  assert.ok(result.includes(css) && result.includes(html));
  assert.equal(articleDarkPreviewDocument('</style><script>bad()</script>', html).includes('</style><script>bad()'), false);
});

test('the clipboard normalizer resolves colour syntax without mirroring anything', () => {
  // render.ts shares this module. If the dark mirror leaked into `normalizePaint`, the copied HTML
  // would carry dark-mode colours into the light article the reader actually pastes.
  const context = { clearRect() {}, fillRect() {}, getImageData: () => ({ data: [35, 35, 35, 255] }) };
  const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
  const { normalizePaint } = createArticleColorNormalizer(doc);
  assert.equal(normalizePaint('rgb(35, 35, 35)'), 'rgb(35, 35, 35)');
  assert.equal(normalizePaint('linear-gradient(oklch(0.2 0 0), rgb(124, 58, 237))'), 'linear-gradient(rgba(35, 35, 35, 1), rgb(124, 58, 237))');
  assert.equal(normalizePaint('url(/article-sample.png)'), 'url(/article-sample.png)', 'asset URLs are never treated as colours');
});
