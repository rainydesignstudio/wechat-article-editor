import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceOffsetRect, revealSourceRect } from '../src/lib/sourceViewport.ts';

function layer(parts) {
  const nodes = parts.map(([text, line, padding = false]) => ({
    length: text.length, line, parentElement: { closest: () => padding ? {} : null },
  }));
  const doc = {
    createTreeWalker() { let index = 0; return { nextNode: () => nodes[index++] ?? null }; },
    createRange() { let node, index; return {
      setStart(n, i) { node = n; index = i; }, collapse() {},
      getBoundingClientRect: () => ({ top: node.line * 28, bottom: node.line * 28 + 28, height: 28, left: index }),
    }; },
  };
  return { ownerDocument: doc };
}

test('caret offsets skip layout-only blank-line glyphs and still count real zero-width source characters', () => {
  const source = layer([['甲', 0], ['\n', 0], ['\u200b', 1, true], ['\n', 1], ['乙', 2]]);
  assert.equal(sourceOffsetRect(source, 2).top, 28);
  assert.equal(sourceOffsetRect(source, 3).top, 56);
  assert.equal(sourceOffsetRect(source, 4).left, 1);
  assert.equal(sourceOffsetRect(layer([['\u200bX', 0]]), 1).left, 1);
});

test('reveal changes only the common viewport and preserves the scroll position when already visible', () => {
  const viewport = { scrollTop: 500, clientHeight: 100, clientTop: 2, getBoundingClientRect: () => ({ top: 20 }) };
  revealSourceRect(viewport, { top: 50, bottom: 78, height: 28 });
  assert.equal(viewport.scrollTop, 500);
  revealSourceRect(viewport, { top: 5, bottom: 33, height: 28 });
  assert.equal(viewport.scrollTop, 483);
  revealSourceRect(viewport, { top: 150, bottom: 178, height: 28 });
  assert.equal(viewport.scrollTop, 539);
});
