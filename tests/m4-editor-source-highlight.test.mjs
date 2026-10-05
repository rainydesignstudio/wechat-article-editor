import assert from 'node:assert/strict';
import test from 'node:test';

const { tokenizeEditorSource } = await import('../src/lib/editorSourceHighlight.ts');

test('syntax display preserves the exact Markdown source while marking reference-style spans', () => {
  const source = '# 标题\n普通文字\n- 列表\n> 引用\n\n';
  const tokens = tokenizeEditorSource(source);
  assert.equal(tokens.map((token) => token.text).join(''), source);
  assert.deepEqual(tokens.filter((token) => token.tone).map((token) => token.tone), ['syntax', 'heading', 'syntax', 'syntax', 'quote']);
});

test('heading-like text inside fenced code remains unstyled source text', () => {
  const source = '```md\n# 不是标题\n```\n## 标题';
  const tokens = tokenizeEditorSource(source);
  assert.equal(tokens.map((token) => token.text).join(''), source);
  assert.deepEqual(tokens.filter((token) => token.tone).map((token) => token.tone), ['syntax', 'heading']);
});
