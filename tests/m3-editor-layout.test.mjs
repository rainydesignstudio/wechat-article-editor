import assert from 'node:assert/strict';
import test from 'node:test';

const {
  EDITOR_MIN_PANEL_PX,
  EDITOR_SPLITTER_PX,
  clampEditorSourceRatio,
  editorSourceRatioFromPointer,
  getEditorSourceWidth,
  getEditorSplitLimits,
  resizeEditorSourceRatio,
} = await import('../src/lib/editorLayout.ts');

function tracks(containerWidth, ratio) {
  const usableWidth = containerWidth - EDITOR_SPLITTER_PX;
  const source = getEditorSourceWidth(containerWidth, ratio);
  const preview = usableWidth - source;
  return { source, preview, total: source + preview + EDITOR_SPLITTER_PX };
}

test('split limits include the divider and preserve both 360px minimum panels', () => {
  const edge = tracks(EDITOR_MIN_PANEL_PX * 2 + EDITOR_SPLITTER_PX, 50);
  assert.deepEqual(edge, { source: 360, preview: 360, total: 732 });

  const wide = getEditorSplitLimits(1032);
  assert.ok(wide);
  const minimum = tracks(1032, 0);
  const maximum = tracks(1032, 100);
  assert.equal(minimum.source, 360);
  assert.equal(minimum.preview, 660);
  assert.equal(minimum.total, 1032);
  assert.equal(maximum.source, 660);
  assert.equal(maximum.preview, 360);
  assert.equal(maximum.total, 1032);
  assert.equal(clampEditorSourceRatio(1032, 50), 50);
});

test('pointer and Home/End sizing use the same divider-excluded width', () => {
  const limits = getEditorSplitLimits(1032);
  assert.ok(limits);
  const minimumPointer = 100 + EDITOR_SPLITTER_PX / 2 + EDITOR_MIN_PANEL_PX;
  const maximumPointer = minimumPointer + (limits.maximumRatio - limits.minimumRatio) * limits.usableWidth / 100;

  assert.equal(editorSourceRatioFromPointer(minimumPointer, 100, 1032), limits.minimumRatio);
  assert.equal(editorSourceRatioFromPointer(maximumPointer, 100, 1032), limits.maximumRatio);
  assert.equal(resizeEditorSourceRatio(1032, 50, 'Home'), limits.minimumRatio);
  assert.equal(resizeEditorSourceRatio(1032, 50, 'End'), limits.maximumRatio);
  assert.equal(resizeEditorSourceRatio(1032, 50, 'ArrowLeft'), 48);
  assert.equal(resizeEditorSourceRatio(1032, 50, 'ArrowRight'), 52);
  assert.equal(resizeEditorSourceRatio(1032, 50, 'Tab'), null);
});
