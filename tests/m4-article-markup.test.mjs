import assert from 'node:assert/strict';
import test from 'node:test';
import { articleFormatMessage, inspectArticleFormatMarkdown } from '../src/lib/articleFormat.ts';
import { validateContentSource } from '../src/lib/contentValidation.ts';
import { createArticleSource } from '../src/lib/frontMatter.ts';
import { groupSourceLineIssues } from '../src/lib/sourceLineDiagnostics.ts';
import { DEFAULT_ARTICLE_SNIPPETS, DEFAULT_ARTICLE_TEMPLATES } from '../src/lib/contentLibraries.ts';

const markupIssues = source => inspectArticleFormatMarkdown(source).issues.filter(issue => issue.source.endsWith('HTML 标签结构'));

test('tag spelling, unmatched closing tags and nesting order are checked before the HTML parser repairs them', () => {
  const wrong = markupIssues('<section>\n<p>正文</p>\n</tdction>');
  assert.equal(wrong.length, 1);
  assert.equal(wrong[0].line, 3);
  assert.match(wrong[0].message, /<\/tdction>.*<\/section>/);
  assert.equal(groupSourceLineIssues(wrong, 3).get(3).severity, 'error');
  assert.deepEqual(groupSourceLineIssues(wrong, 3).get(3).messages, [wrong[0].message]);
  assert.match(markupIssues('</span>')[0].message, /没有对应/);
  assert.match(markupIssues('<section><strong>正文</section>')[0].message, /闭合顺序错误.*strong/);
  const repeated = markupIssues('<section>\n</wrong>\n</section>\n<section>\n</wrong>\n</section>');
  assert.match(articleFormatMessage(repeated), /第 2 行/);
  assert.match(articleFormatMessage(repeated), /第 5 行/);
});

test('unfinished tags, attribute quotes, closing-tag content and required end tags have source locations', () => {
  for (const source of ['正文\n<span class="未结束', '正文\n<section class="x"']) {
    const issues = markupIssues(source);
    assert.equal(issues[0].line, 2);
    assert.match(issues[0].message, /标签不完整/);
  }
  assert.match(markupIssues('<p>正文</p class="bad">')[0].message, /闭合标签不能带属性或正文/);
  assert.match(markupIssues('<p>正文</>')[0].message, /闭合标签缺少名称/);
  const missing = markupIssues('正文\n\n<section><p>正文');
  assert.equal(missing[0].line, 3);
  assert.match(missing[0].message, /section.*未闭合/);
  assert.match(markupIssues('<section />')[0].message, /不能自闭合/);
});

test('code examples, escaped HTML, links and plain comparisons are not treated as unfinished authoring tags', () => {
  const source = '```html\n<section><strong>不完整的代码示例\n```\n\n`<span>`\n\n\\<section>\n\n<https://example.com/>\n\n<person@example.com>\n\n3 < 5，x<y';
  assert.deepEqual(markupIssues(source), []);
  assert.deepEqual(markupIssues('![图片](<p>)\n\n[链接](<span>)\n\n[参考][key]\n\n[key]: <section>'), []);
});

test('void elements, quoted angle brackets, comments, raw text and legal optional HTML endings remain valid', () => {
  for (const source of [
    '<section><P title="x > y and <span>">正文<BR /></P><img src="a.png" /><hr></section>',
    '<!-- <section><strong> -->\n<p>正文</p>',
    '<script>const text = "<section>";</script>',
    '<ul><li>甲<li>乙</ul>',
    '<table><tbody><tr><td>甲<td>乙</table>',
    '<section><p>合法省略结束标签</section>',
    '<svg><path d="M0 0" /></svg>',
  ]) assert.deepEqual(markupIssues(source), [], source);
});

test('snippet and starter-template validation refuse malformed closing tags even when their repaired DOM looks valid', async () => {
  const body = '<section><p>内容</p></tdction>';
  for (const [kind, source] of [['snippets', body], ['templates', `${createArticleSource('错误闭合')}\n${body}`]]) {
    const result = await validateContentSource(kind, source);
    assert.ok(result.errors.some(error => error.includes('tdction')));
  }
});

test('every bundled snippet and starter template has complete HTML tag structure', () => {
  for (const snippet of DEFAULT_ARTICLE_SNIPPETS) assert.deepEqual(markupIssues(snippet.content), [], snippet.id);
  for (const template of DEFAULT_ARTICLE_TEMPLATES) {
    const body = template.source.replace(/^---[\s\S]*?\n---\r?\n/, '');
    assert.deepEqual(markupIssues(body), [], template.id);
  }
});
