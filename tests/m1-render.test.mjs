import assert from 'node:assert/strict';
import test from 'node:test';
import { unified } from 'unified';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { rehypeSafeStyles, SAFE_REHYPE_SCHEMA } from '../src/lib/render.ts';

test('raw HTML uses the official parse and sanitize pipeline', async () => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, SAFE_REHYPE_SCHEMA)
    .use(rehypeSafeStyles);
  const tree = await processor.run(processor.parse(`
<figure class="rounded-xl"><section class="text-sky-950" style="color: green; background-image: url(javascript:alert(1));" onclick="alert(1)">safe</section></figure>
<table><tr><td rowspan="2" colspan="3">cell</td></tr></table>
<script>alert(1)</script>
`));
  const serialized = JSON.stringify(tree);
  const findElement = (node, tagName) => {
    if (node.type === 'element' && node.tagName === tagName) return node;
    for (const child of node.children ?? []) {
      const match = findElement(child, tagName);
      if (match) return match;
    }
    return undefined;
  };
  const section = findElement(tree, 'section');
  const cell = findElement(tree, 'td');

  assert.ok(section);
  assert.deepEqual(section.properties.className, ['text-sky-950']);
  assert.equal(section.properties.onclick, undefined);
  assert.equal(String(section.properties.style).includes('javascript'), false);
  assert.equal(String(section.properties.style).includes('url('), false);
  assert.equal(cell?.properties.rowSpan, 2);
  assert.equal(cell?.properties.colSpan, 3);
  assert.equal(serialized.includes('<script>'), false);
});

test('raw article styles keep other declarations while ignoring unsupported font families', async () => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, SAFE_REHYPE_SCHEMA)
    .use(rehypeSafeStyles);
  const tree = await processor.run(processor.parse('<p style="font-family: Georgia; color: #123456">正文</p>'));
  const paragraph = tree.children[0];
  assert.equal(paragraph.tagName, 'p');
  assert.match(paragraph.properties.style, /color:#123456/);
  assert.doesNotMatch(paragraph.properties.style, /font-family/i);
});
