import assert from 'node:assert/strict';
import test from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { rehypeAlignSanitizedFragmentLinks, remarkHeadingIds } from '../src/lib/articleTableOfContents.ts';
import { SAFE_REHYPE_SCHEMA } from '../src/lib/render.ts';

function findElements(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) findElements(child, predicate, matches);
  return matches;
}

test('preview heading ids match authored fragment links after sanitization; fenced headings are excluded', async () => {
  const body = '- [First](#hello-world)\n- [Second](#hello-world-2)\n- [Third](#中文标题)\n\n# Hello, World!\n\n## Hello World\n\n## 中文标题\n\n```md\n# Not a heading\n```\n';
  const tree = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkHeadingIds)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeAlignSanitizedFragmentLinks)
    .use(rehypeSanitize, SAFE_REHYPE_SCHEMA)
    .run(unified().use(remarkParse).use(remarkGfm).parse(body));
  const headings = findElements(tree, (node) => node.type === 'element' && /^h[1-6]$/.test(node.tagName));
  const links = findElements(tree, (node) => node.type === 'element' && node.tagName === 'a');

  assert.deepEqual(headings.map((node) => node.properties.id), [
    'user-content-hello-world',
    'user-content-hello-world-2',
    'user-content-中文标题',
  ]);
  assert.deepEqual(links.map((node) => node.properties.href), [
    '#user-content-hello-world',
    '#user-content-hello-world-2',
    '#user-content-中文标题',
  ]);
  assert.deepEqual(links.map((node) => decodeURIComponent(node.properties.href.slice(1))), headings.map((node) => node.properties.id));
  assert.equal(headings.some((node) => JSON.stringify(node).includes('Not a heading')), false);
});

test('GFM footnote backlinks and references resolve after ID clobber protection; task lists remain static', async () => {
  const fixture = [
    '## GFM fixture',
    '',
    '- [x] completed task',
    '- [ ] pending task',
    '',
    'A footnote reference[^note].',
    '',
    '[^note]: Footnote text.',
    '',
    '```ts',
    'const revision = 1;',
    '```',
  ].join('\n');
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkHeadingIds)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeAlignSanitizedFragmentLinks)
    .use(rehypeSanitize, SAFE_REHYPE_SCHEMA);
  const tree = await processor.run(processor.parse(fixture));
  const ids = new Set(findElements(tree, (node) => node.type === 'element' && typeof node.properties?.id === 'string').map((node) => node.properties.id));
  const localLinks = findElements(tree, (node) => node.type === 'element' && node.tagName === 'a' && typeof node.properties?.href === 'string' && node.properties.href.startsWith('#'));
  const taskInputs = findElements(tree, (node) => node.type === 'element' && node.tagName === 'input' && node.properties?.type === 'checkbox');
  const code = findElements(tree, (node) => node.type === 'element' && node.tagName === 'code' && node.properties?.className?.includes('language-ts'))[0];

  assert.equal(localLinks.length, 2);
  for (const link of localLinks) assert.ok(ids.has(decodeURIComponent(link.properties.href.slice(1))), `unresolved fragment: ${link.properties.href}`);
  assert.equal(taskInputs.length, 2);
  assert.equal(taskInputs[0].properties.checked, true);
  assert.equal(taskInputs[0].properties.disabled, true);
  assert.equal(taskInputs[1].properties.checked, undefined);
  assert.equal(taskInputs[1].properties.disabled, true);
  assert.ok(code);
  assert.equal(code.children?.map((node) => node.value ?? '').join(''), 'const revision = 1;\n');
});
