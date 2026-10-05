import assert from 'node:assert/strict';
import test from 'node:test';
import { articleStatisticsFromHtml } from '../src/lib/articleStatistics.ts';

test('article statistics count rendered content and exclude blank paragraphs and metadata styles', () => {
  const result = articleStatisticsFromHtml('<h1>标题</h1><p>你好 <a href="/">链接</a></p><p><br></p><p><img src="media/image/a.png" alt="示意图"></p><pre><code>A\nB</code></pre><style>不计</style>');
  assert.deepEqual(result, { characters: 8, readingMinutes: 1, headings: 1, paragraphs: 2, images: 1, links: 1, codeBlocks: 1 });
});

test('article reading estimate rounds up only when there is content', () => {
  assert.equal(articleStatisticsFromHtml('<p><br></p>').readingMinutes, 0);
  assert.equal(articleStatisticsFromHtml(`<p>${'字'.repeat(301)}</p>`).readingMinutes, 2);
});

test('local image loading placeholders count as images without adding status text', () => {
  const result = articleStatisticsFromHtml('<p><span data-local-asset-src="media/image/a.png">正在读取本地图片…</span></p>');
  assert.equal(result.characters, 0);
  assert.equal(result.paragraphs, 1);
  assert.equal(result.images, 1);
});
