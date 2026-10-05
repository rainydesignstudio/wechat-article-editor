import * as formatRuntime from '../src/lib/article-format/runtime.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ARTICLE_THEME_PRESETS, THEMES, getTheme, themePreviewCss } from '../src/lib/themes.ts';
import { parseThemeConfigJson, validateThemeFormat } from '../src/lib/themeValidation.ts';
import { compileArticleStyles } from '../src/lib/tailwind.ts';
import { createArticleColorNormalizer } from '../src/lib/articleDarkPreview.ts';
import { articleFormatAllowsCssProperty, articleFormatTierOfValue, articleStyleContext } from '../src/lib/articleFormat.ts';
import postcss from 'postcss';

test('article theme images use automatic height, full-width constraint and block display', () => {
  for (const theme of THEMES) {
    const rules = [];
    postcss.parse(theme.css).walkRules(rule => { if (rule.selector === '.article-preview .article-body img') rules.push(rule); });
    assert.ok(rules.length > 0, theme.id);
    const values = Object.fromEntries(rules.flatMap(rule => rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value])));
    assert.equal(values.height, 'auto', theme.id);
    assert.equal(values['max-width'], '100%', theme.id);
    assert.equal(values.display, 'block', theme.id);
  }
});

function contrast(foreground, background) {
  const luminance = color => {
    const channels = color.match(/[\da-f]{2}/gi).map(channel => Number.parseInt(channel, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

test('all five article presets are standalone valid JSON and compile in isolated preview scopes', async () => {
  assert.equal(ARTICLE_THEME_PRESETS.length, 5);
  for (const theme of ARTICLE_THEME_PRESETS) {
    assert.deepEqual(parseThemeConfigJson(JSON.stringify(theme)), theme);
    assert.equal(getTheme(theme.id), theme);
    const { css } = await compileArticleStyles('# 标题\n\n正文\n\n> 引用', theme);
    assert.ok(css.includes(`--color-article-quote-surface: ${theme.tokens['color-article-quote-surface']}`));
    const preview = themePreviewCss(theme, `test-${theme.id}`);
    assert.ok(preview.includes(`.theme-preview-instance-test-${theme.id} .article-preview`));
    for (const other of ARTICLE_THEME_PRESETS.filter(item => item.id !== theme.id)) {
      assert.ok(!preview.includes(`.theme-preview-instance-test-${other.id}`));
    }
  }
});

test('every built-in article theme compiles the shared article preview content', async () => {
  const source = '# 标题\n\n<section style="color:var(--color-article-ink)"><p class="font-serif">正文</p></section>\n\n> 引用';
  for (const theme of THEMES) {
    const { css } = await compileArticleStyles(source, theme);
    assert.match(css, /\.article-preview/);
    assert.doesNotMatch(css, /\bfont-family\s*:/i, `${theme.name} cannot prescribe a reader font`);
  }
});

test('article theme body, notes, links, heading labels and inline code meet normal-text contrast', () => {
  for (const theme of THEMES) {
    const colors = theme.tokens;
    for (const role of ['ink', 'heading', 'muted', 'link']) {
      assert.ok(contrast(colors[`color-article-${role}`], colors['color-article-quote-surface']) >= 4.5, `${theme.name} ${role}`);
    }
    const inlineCodeRule = theme.css.match(/\.article-preview \.article-body code\s*\{([^}]+)\}/)?.[1];
    const inlineCodeColor = inlineCodeRule?.match(/(?:^|;)\s*color:\s*var\(--(color-article-[a-z-]+)\)/)?.[1];
    assert.ok(inlineCodeColor, `${theme.name} has an explicit inline-code text role`);
    assert.ok(contrast(colors[inlineCodeColor], colors['color-article-code-tint']) >= 4.5, `${theme.name} inline code`);
    assert.ok(contrast(colors['color-article-link'], colors['color-article-tint']) >= 4.5, `${theme.name} tinted heading`);
    if (theme.id === 'mokan') assert.ok(contrast(colors['color-article-quote-surface'], colors['color-article-accent']) >= 4.5, `${theme.name} inverse heading`);
  }
});

test('Rainy Design uses a portable article stylesheet and keeps the rainy theme ID', () => {
  const rainy = getTheme('rainy');
  assert.equal(rainy.name, 'Rainy Design');
  assert.deepEqual(validateThemeFormat(rainy), [], 'the stylesheet no longer sets list markers, which WeChat controls itself');
});

test('rich-text export keeps intrinsic heading labels without freezing their viewport width', async () => {
  const { readFile } = await import('node:fs/promises');
  const { default: ts } = await import('typescript');
  const { default: vm } = await import('node:vm');
  const source = await readFile(new URL('../src/lib/render.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const exported = { styles: '', tagName: 'H2', textContent: '章节标签', attributes: [],
    getAttribute: () => null, hasAttribute: () => false,
    setAttribute(name, value) { if (name === 'style') this.styles = value; },
    removeAttribute() {}, querySelectorAll: () => [],
    get outerHTML() { return `<h2 style="${this.styles}">章节标签</h2>`; },
  };
  const heading = { tagName: 'H2', getAttribute: () => null, hasAttribute: () => false,
    cloneNode: () => exported, querySelector: () => null, querySelectorAll: () => [],
  };
  vm.runInNewContext(code, { module, exports: module.exports,
    window: { getComputedStyle: () => ({ getPropertyValue: property => ({ display: 'inline-block', 'max-width': '100%', 'box-sizing': 'border-box', width: '280px', margin: '0px 0px 16px', 'background-color': 'rgb(71, 85, 105)', 'border-radius': '24px' })[property] ?? '' }) },
    require: id => id.endsWith('/article-format/runtime') ? formatRuntime : id.endsWith('/article-format/sanitize') ? { sanitizeHtml: html => html } : id === 'dompurify' ? { sanitize: html => html } : id.endsWith('/articleDarkPreview') ? { createArticleColorNormalizer } : id.endsWith('/articleFormat') ? { articleFormatAllowsCssProperty, articleFormatTierOfValue, articleStyleContext } : { defaultSchema: {} },
  });
  const payload = module.exports.buildClipboardPayload(heading);
  assert.match(payload.html, /display:inline-block/);
  assert.match(payload.html, /max-width:100%/);
  assert.match(payload.html, /margin:0px 0px 16px/);
  assert.match(payload.html, /box-sizing:border-box/, 'configured inline properties enter the output');
  assert.doesNotMatch(payload.html, /position:|transform:/, 'undeclared used dimensions are not frozen');
  assert.match(payload.html, /background-color:rgb\(71, 85, 105\)/);
  assert.match(payload.html, /border-radius:24px/);
  assert.doesNotMatch(payload.html, /(?:^|;)width:280px/);
});


test('clipboard keeps authored backgrounds and layout but omits generated page paint', async () => {
  const { readFile } = await import('node:fs/promises');
  const { default: ts } = await import('typescript');
  const { default: vm } = await import('node:vm');
  const code = ts.transpileModule(await readFile(new URL('../src/lib/render.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const doc = { defaultView: { getComputedStyle: node => ({ getPropertyValue: property => node.computed[property] ?? '' }) }, createElement: tag => element(tag) };
  function element(tag, computed = {}, dimensions = {}, attributes = {}, children = []) {
    const attrs = new Map(Object.entries(attributes));
    return { tagName: tag.toUpperCase(), ownerDocument: doc, computed, children,
      style: { getPropertyValue: () => '' }, computedStyleMap: () => ({ get: property => dimensions[property] == null ? undefined : { toString: () => dimensions[property] } }),
      get attributes() { return [...attrs].map(([name, value]) => ({ name, value })); },
      getAttribute: name => attrs.get(name) ?? null, hasAttribute: name => attrs.has(name),
      setAttribute: (name, value) => attrs.set(name, value), removeAttribute: name => attrs.delete(name),
      append: child => children.push(child), querySelector: selector => selector === '.article-body' ? children.find(child => child.getAttribute('class') === 'article-body') ?? null : null,
      querySelectorAll: () => children.flatMap(child => [child, ...child.querySelectorAll('*')]),
      cloneNode: () => element(tag, { ...computed }, { ...dimensions }, Object.fromEntries(attrs), children.map(child => child.cloneNode(true))),
      get textContent() { return tag === 'img' ? '' : children.map(child => child.textContent).join(''); },
      get outerHTML() { return `<${tag} ${[...attrs].map(([name, value]) => `${name}="${value}"`).join(' ')}>${children.map(child => child.outerHTML).join('')}</${tag}>`; },
    };
  }
  const image = element('img', { display: 'block', 'max-width': '100%', 'height': '640px', 'object-fit': 'cover', 'background-color': 'rgba(0, 0, 0, 0)' }, { width: '100%', height: 'auto' }, { src: 'https://example.test/image.png', 'data-w': '800', 'data-h': '600', 'data-src': 'https://example.test/image.png', 'data-imgfileid': 'image-1', 'data-no-dark': 'true', 'data-internal-selection': 'private' });
  const incompleteImage = element('img', { display: 'inline', 'max-width': '100%' }, { height: 'auto' }, { src: 'https://example.test/incomplete.png' });
  const fixedImage = element('img', { display: 'block', 'max-width': '100%' }, { height: '200px' }, { src: 'https://example.test/fixed.png' });
  const autoBox = element('section', { display: 'block', 'max-width': '100%' }, { height: 'auto' });
  const figure = element('figure', { 'flex-shrink': '0', 'margin-left': '0px' }, { width: '80%', 'min-width': '256px' }, { class: 'w-4/5 min-w-64 shrink-0' }, [image]);
  const gallery = element('div', { display: 'flex', gap: '16px', 'overflow-x': 'auto', 'padding-bottom': '12px', 'background-color': 'rgb(239, 246, 255)' }, {}, { class: 'flex gap-4 overflow-x-auto', 'aria-label': '图片画廊' }, [figure]);
  const grid = element('div', { display: 'grid', 'grid-template-columns': '240px 240px' }, { 'grid-template-columns': 'repeat(2, minmax(0px, 1fr))' }, { class: 'grid grid-cols-2' });
  const divider = element('p', { margin: '16px 0px', 'border-bottom': '1px solid rgb(71, 85, 105)' }, {}, { class: 'my-4 border-b border-solid text-article-line' });
  const fontOnly = element('span', { 'font-family': 'Papyrus' }, {}, { style: 'font-family:Papyrus' });
  const quote = element('blockquote', { 'border-left': '0px none rgb(71, 85, 105)', 'border-right': '4px solid rgb(71, 85, 105)', 'border-bottom': '4px solid rgb(71, 85, 105)' }, {}, { class: 'border-l-0 border-r-4 border-b-4' });
  const body = element('div', { color: 'rgb(71, 85, 105)', 'background-color': 'rgba(0, 0, 0, 0)' }, { width: 'auto' }, { class: 'article-body' }, [gallery, grid, divider, fontOnly, quote, incompleteImage, fixedImage, autoBox]);
  const root = element('article', { 'background-color': 'rgb(248, 250, 252)', 'background-image': 'linear-gradient(rgb(248, 250, 252), rgb(241, 245, 249))', 'box-shadow': 'rgb(71, 85, 105) 0px 2px 4px' }, { width: 'auto' }, { class: 'article-preview', 'data-theme': 'fixture', 'data-no-dark': 'true' }, [body]);
  const before = root.outerHTML;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, window: doc.defaultView,
    require: id => id.endsWith('/article-format/runtime') ? formatRuntime : id.endsWith('/article-format/sanitize') ? { sanitizeHtml: html => html } : id === 'dompurify' ? { sanitize: html => html } : id.endsWith('/articleDarkPreview') ? { createArticleColorNormalizer } : id.endsWith('/articleFormat') ? { articleFormatAllowsCssProperty, articleFormatTierOfValue, articleStyleContext } : { defaultSchema: {} } });
  const payload = module.exports.buildClipboardPayload(root);
  assert.match(payload.html, /^<section\b[^>]*><section\b/, 'editor preview body is exported as a supported section');
  for (const expected of ['<section', 'background-color:rgb(239, 246, 255)', 'box-shadow:', 'gap:16px', 'width:80%', 'flex-shrink:0', 'width:100%', 'object-fit:cover', 'margin:16px 0px', 'border-left:0px none rgb(71, 85, 105)', 'border-right:4px solid rgb(71, 85, 105)', 'border-bottom:1px solid rgb(71, 85, 105)', 'data-w="800"', 'data-h="600"', 'data-src="https://example.test/image.png"']) assert.ok(payload.html.includes(expected), expected);
  assert.doesNotMatch(payload.html, /background-color:rgb\(248, 250, 252\)|background-image:linear-gradient/);
  assert.doesNotMatch(payload.html, /font-family|Papyrus/, 'the default formatter drops custom font-family');
  assert.doesNotMatch(payload.html, /class=|data-theme=|data-internal|aria-label=|data-imgfileid=/, 'internal marks are stripped without deleting configured attributes');
  assert.equal((payload.html.match(/height:auto/g) ?? []).length, 3, 'configured automatic dimensions do not depend on the revoked three-property exception');
  assert.match(payload.html, /height:200px/, 'explicit image sizes retain their existing output behavior');
  assert.doesNotMatch(payload.html, /height:640px/, 'the used pixel image height is never frozen');
  assert.match(payload.html, /grid-template-columns:/, 'nothing has rated this one, so it is carried rather than dropped');
  assert.match(payload.html, /min-width:|overflow-x:|padding-bottom:/, 'low priority and usable declarations survive; only confirmed verdicts are dropped');
  assert.ok(payload.html.includes('width:80%'));
  assert.ok(payload.html.includes('width:100%'));
  assert.equal(root.outerHTML, before, 'export cannot modify the original article');
});

test('clipboard and dark preview share RGB normalization for modern colors, alpha and gradients', () => {
  let paints = 0;
  const doc = { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() { paints++; }, getImageData: () => ({ data: [71, 85, 105, 128] }) }) }) };
  const { normalizeColor, normalizePaint } = createArticleColorNormalizer(doc);
  assert.equal(normalizeColor('oklch(50% 0.02 250 / 50%)'), `rgba(71, 85, 105, ${128 / 255})`);
  const gradient = normalizePaint('linear-gradient(90deg, oklch(50% 0.02 250 / 50%), color-mix(in srgb, red 50%, white) 100%)');
  assert.ok(gradient.startsWith('linear-gradient(90deg, rgba('));
  assert.ok(gradient.endsWith('100%)'));
  assert.doesNotMatch(gradient, /oklch|color-mix/);
  assert.equal(normalizePaint('url("https://example.test/color(oklch).png")'), 'url("https://example.test/color(oklch).png")');
  assert.equal(normalizePaint('rgba(71,85,105,0.5)'), 'rgba(71,85,105,0.5)');
  assert.equal(paints, 2, 'repeated colors reuse their conversion');
});
