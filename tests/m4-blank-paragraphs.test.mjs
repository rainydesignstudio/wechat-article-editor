import assert from 'node:assert/strict';
import test from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { remarkArticleBlankParagraphs } from '../src/lib/articleBlankParagraphs.ts';

function blocks(source) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkArticleBlankParagraphs).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeSanitize, defaultSchema);
  return processor.runSync(processor.parse(source), source).children.filter(node => node.type === 'element');
}

function isEmptyParagraph(node) {
  return node.tagName === 'p' && node.children?.length === 1 && node.children[0].tagName === 'br';
}

test('a single blank line separates blocks; further blank lines create paragraphs', () => {
  assert.deepEqual(blocks('甲\n乙').map(isEmptyParagraph), [false]);
  assert.deepEqual(blocks('甲\n\n乙').map(isEmptyParagraph), [false, false]);
  assert.deepEqual(blocks('甲\n\n\n乙').map(isEmptyParagraph), [false, true, false]);
  assert.deepEqual(blocks('甲\n\n\n\n乙').map(isEmptyParagraph), [false, true, true, false]);
  assert.deepEqual(blocks('甲\r\n\r\n乙').map(isEmptyParagraph), [false, false]);
  assert.deepEqual(blocks('甲\r\n\r\n\r\n乙').map(isEmptyParagraph), [false, true, false]);
});

test('leading and trailing blank lines survive, while fenced code stays intact', () => {
  assert.deepEqual(blocks('\n\n甲\n\n').map(isEmptyParagraph), [true, false, true]);
  const result = blocks('甲\n\n```text\na\n\nb\n```\n\n乙');
  assert.deepEqual(result.map(node => node.tagName), ['p', 'pre', 'p']);
  assert.deepEqual(result.map(isEmptyParagraph), [false, false, false]);
  assert.match(result[1].children[0].children[0].value, /a\n\nb/);
});
