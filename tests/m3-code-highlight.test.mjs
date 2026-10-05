import assert from 'node:assert/strict';
import test from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { rehypeAlignSanitizedFragmentLinks } from '../src/lib/articleTableOfContents.ts';
import { rehypeArticleCodeHighlight, rehypeArticleCodeWhitespace } from '../src/lib/articleCodeHighlight.ts';
import { clipboardPlainText, rehypeSafeStyles, SAFE_REHYPE_SCHEMA } from '../src/lib/render.ts';
import { BASIC_THEME, RAINY_THEME, themePreviewCss, themeToCss } from '../src/lib/themes.ts';

function findElements(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) findElements(child, predicate, matches);
  return matches;
}

function textContent(node) {
  return node.type === 'text' ? node.value ?? '' : (node.children ?? []).map(textContent).join('');
}

function authoredCodeText(node) {
  if (node.tagName === 'br') return '\n';
  if (node.properties?.['data-code-tab']) return '\t';
  return node.type === 'text' ? (node.value ?? '').replace(/\u00a0/g, ' ') : (node.children ?? []).map(authoredCodeText).join('');
}

function asDom(node, parentElement = null) {
  if (node.type === 'text') return { nodeType: 3, textContent: node.value, childNodes: [], parentElement };
  const element = { nodeType: 1, tagName: node.tagName?.toUpperCase(), parentElement, childNodes: [], hasAttribute: name => Boolean(node.properties?.[name]) };
  element.childNodes = (node.children ?? []).map(child => asDom(child, element));
  return element;
}

function fence(language, source) {
  return `\`\`\`${language}\n${source}\`\`\``;
}

test('highlights TypeScript, SQL, JSON, and HTML code while preserving exact code text and whitespace', async () => {
  const samples = [
    { language: 'ts', value: 'const answer: number = 42;  \n\treturn answer;\n', token: 'hljs-keyword' },
    { language: 'sql', value: 'SELECT name FROM authors WHERE id = 7;\n', token: 'hljs-keyword' },
    { language: 'json', value: '{\n  "enabled": true,\n  "count": 2\n}\n', token: 'hljs-attr' },
    { language: 'html', value: '<script>alert("still text")</script>\n', token: 'hljs-tag' },
    { language: '', value: 'plain\t  text  \n', token: null },
    { language: 'm3-language-that-does-not-exist', value: 'unknown\t  text  \n', token: null },
  ];
  const source = [
    ...samples.map((sample) => fence(sample.language, sample.value)),
    '<script>window.__highlightTestShouldNotRun = true</script>',
  ].join('\n\n');
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeAlignSanitizedFragmentLinks)
    .use(rehypeSanitize, SAFE_REHYPE_SCHEMA)
    .use(rehypeArticleCodeHighlight)
    .use(rehypeArticleCodeWhitespace)
    .use(rehypeSafeStyles);
  const tree = await processor.run(processor.parse(source));
  const codeBlocks = findElements(tree, (node) => node.type === 'element' && node.tagName === 'pre')
    .map((pre) => findElements(pre, (node) => node.type === 'element' && node.tagName === 'code')[0]);

  assert.equal(codeBlocks.length, samples.length);
  for (const [index, sample] of samples.entries()) {
    const code = codeBlocks[index];
    assert.equal(authoredCodeText(code), sample.value);
    assert.equal(clipboardPlainText(asDom(code, { tagName: 'PRE' })), sample.value, 'clipboard plain text keeps the original code whitespace');
    assert.equal(findElements(code, node => node.tagName === 'br').length, (sample.value.match(/\n/g) ?? []).length);
    const tokenClasses = findElements(code, (node) => node.type === 'element' && node.tagName === 'span')
      .flatMap((span) => span.properties.className ?? []);
    if (sample.token) assert.ok(tokenClasses.includes(sample.token), `${sample.language} should contain ${sample.token}`);
    else assert.deepEqual(tokenClasses, [], `${sample.language || 'plain'} should remain unhighlighted text`);
  }
  assert.deepEqual(findElements(tree, (node) => node.type === 'element' && node.tagName === 'script'), []);
  assert.ok(authoredCodeText(codeBlocks[3]).includes('<script>alert("still text")</script>'));
  assert.ok(textContent(codeBlocks[0]).includes('\u00a0'), 'visual code spacing survives nowrap');
});

test('Basic and Rainy expose scoped code-token CSS for article, history, and theme previews', () => {
  for (const theme of [BASIC_THEME, RAINY_THEME]) {
    const css = themeToCss(theme);
    const scoped = themePreviewCss(theme, `m3-${theme.id}`);
    assert.match(css, /\.article-preview \.article-body pre \.hljs-keyword/);
    assert.match(css, /\.article-preview \.article-body pre \.hljs-string/);
    assert.match(css, /color-mix\(in oklch/);
    assert.match(scoped, new RegExp(`\\.theme-preview-instance-m3-${theme.id} \\.article-preview \\.article-body pre \\.hljs-keyword`));
    assert.match(scoped, /color-mix\(in oklch/);
  }
  assert.notEqual(BASIC_THEME.tokens['color-article-link'], RAINY_THEME.tokens['color-article-link']);
});
