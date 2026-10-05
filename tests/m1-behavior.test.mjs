import assert from 'node:assert/strict';
import test from 'node:test';

const { createArticleSource, parseArticle, updateFrontMatter } = await import('../src/lib/frontMatter.ts');

test('front matter patch preserves unknown YAML and body bytes', () => {
  const body = '\n正文第一行  \n---\n正文分隔线之后仍然是正文。\n';
  const source = `---\n# 用户备注\ntitle: "旧标题"\ndescription: "摘要"\nauthor: "Rainy"\ncategories: [M1]\ncreatedAt: "2026-09-23T00:00:00.000Z"\nupdatedAt: "2026-09-23T00:00:00.000Z"\ntheme:\n  id: basic\n  version: 1.0.0\ncustom:\n  owner: rainy\n${body}`;

  const updated = updateFrontMatter(source.replace('version: 1.0.0', 'version: "1.0.0"').replace('owner: rainy\n', 'owner: rainy\n---\n'), { title: '新标题', updatedAt: '2026-09-23T01:00:00.000Z' });
  const parsed = parseArticle(updated);

  assert.equal(parsed.diagnostics.filter((item) => item.level === 'error').length, 0);
  assert.equal(parsed.metadata.title, '新标题');
  assert.equal(parsed.metadata.custom.owner, 'rainy');
  assert.match(updated, /# 用户备注/);
  assert.ok(updated.endsWith(body));
  assert.equal(parsed.body, body);
});

test('invalid known field type blocks preview and copy', () => {
  const parsed = parseArticle('---\ntitle: [not-a-string]\ncategories: nope\n---\n# Body');

  assert.equal(parsed.canCopy, false);
  assert.ok(parsed.diagnostics.some((item) => item.level === 'error' && item.message.includes('title')));
  assert.ok(parsed.diagnostics.some((item) => item.level === 'error' && item.message.includes('categories')));
});

test('an unclosed front matter opener is never treated as article body', () => {
  const parsed = parseArticle('---\ntitle: Broken\n# This must not render');

  assert.equal(parsed.hasFrontMatter, true);
  assert.equal(parsed.body, '');
  assert.equal(parsed.canCopy, false);
  assert.ok(parsed.diagnostics.some((item) => item.level === 'error' && item.message.includes('闭合')));
});

test('explicitly updating a body without front matter adds metadata without rewriting the body', () => {
  const body = '# Plain body\n\nKeep this exact.\n';
  const updated = updateFrontMatter(body, { title: '补齐元数据' });
  const parsed = parseArticle(updated);

  assert.equal(parsed.metadata.title, '补齐元数据');
  assert.equal(parsed.body, body);
  assert.equal(parsed.canCopy, true);
  assert.match(updated, /title: "补齐元数据"/);
});

test('new article source includes the required theme snapshot binding', () => {
  const parsed = parseArticle(createArticleSource('新稿', 'rainy-paper'));

  assert.equal(parsed.metadata.title, '新稿');
  assert.deepEqual(parsed.metadata.theme, { id: 'rainy-paper', version: '1.0.0' });
  assert.equal(parsed.canCopy, true);
});
