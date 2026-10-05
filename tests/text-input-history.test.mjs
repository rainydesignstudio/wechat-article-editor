import test from 'node:test';
import assert from 'node:assert/strict';
import { TextInputHistory, textHistoryShortcut } from '../src/lib/textInputHistory.ts';
import { insertUndoableText } from '../src/lib/nativeTextareaEdit.ts';
import { withTextInputHistory } from './text-input-history-fixture.mjs';

const caret = end => ({ start: end, end, direction: 'none' });

test('three inputs keep independent histories, including redo after another field is edited', () => {
  const query = new TextInputHistory('Alpha'), replacement = new TextInputHistory('Beta'), body = new TextInputHistory('Alpha alpha');
  query.record('alpha', caret(5), caret(5));
  replacement.record('Gamma', caret(4), caret(5));
  body.record('Gamma alpha', { start: 0, end: 5 }, caret(5));
  assert.equal(replacement.undo().value, 'Beta');
  assert.equal(body.value, 'Gamma alpha');
  assert.equal(body.undo().value, 'Alpha alpha');
  assert.equal(replacement.undo(), null, 'an empty field history never falls back to the body');
  query.record('ALPHA', caret(5), caret(5));
  assert.equal(body.redo().value, 'Gamma alpha');
  assert.equal(replacement.redo().value, 'Gamma');
});

test('typing groups naturally; paste and replace-all are separate reversible transactions', () => {
  const h = new TextInputHistory('');
  h.record('a', caret(0), caret(1), 'insertText', 100);
  h.record('ab', caret(1), caret(2), 'insertText', 200);
  h.record('abab', caret(2), caret(4), 'insertFromPaste', 300);
  h.record('XYXY', { start: 0, end: 4 }, caret(2), 'transaction', 400);
  assert.equal(h.undo().value, 'abab');
  assert.equal(h.undo().value, 'ab');
  assert.equal(h.undo().value, '');
  assert.equal(h.redo().value, 'ab');
  h.record('z', caret(2), caret(1));
  assert.equal(h.redo(), null);
});

test('Unicode edits preserve exact values and selections, with bounded retained history', () => {
  const h = new TextInputHistory('甲😀乙', 2, 20);
  h.record('甲🧑‍💻乙', { start: 1, end: 3, direction: 'backward' }, caret(6));
  assert.equal(h.undo().value, '甲😀乙');
  assert.equal(h.redo().value, '甲🧑‍💻乙');
  h.finishTransaction(caret(2));
  assert.equal(h.undo().selection.direction, 'backward');
  assert.equal(h.redo().selection.start, 2);
  h.record('二', caret(2), caret(1)); h.record('三', caret(1), caret(1));
  assert.equal(h.undo().value, '二'); assert.equal(h.undo().value, '甲🧑‍💻乙'); assert.equal(h.undo(), null);
  h.reset('外部重载'); assert.equal(h.redo(), null); assert.equal(h.undo(), null);
});

test('undo shortcuts distinguish platform conventions and do not claim unrelated keys', () => {
  assert.equal(textHistoryShortcut({ key: 'z', metaKey: true }), 'undo');
  assert.equal(textHistoryShortcut({ key: 'Z', metaKey: true, shiftKey: true }), 'redo');
  assert.equal(textHistoryShortcut({ key: 'y', ctrlKey: true }), 'redo');
  assert.equal(textHistoryShortcut({ key: 'y', metaKey: true }), null);
  assert.equal(textHistoryShortcut({ key: 'z', ctrlKey: true, altKey: true }), null);
});

function controlsFixture(values) {
  let cursor = 0;
  const cells = [], effects = [], listeners = new Set(), changes = [], refs = values.map(() => ({ current: null }));
  const document = { activeElement: null, addEventListener(_name, listener) { listeners.add(listener); }, removeEventListener(_name, listener) { listeners.delete(listener); } };
  const controls = values.map((value, index) => ({ tagName: index === 2 ? 'TEXTAREA' : 'INPUT', ownerDocument: document, value, disabled: false, readOnly: false, selectionStart: value.length, selectionEnd: value.length, selectionDirection: 'none', focus() { document.activeElement = this; }, setSelectionRange(start, end, direction = 'none') { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }, setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.setSelectionRange(start + text.length, start + text.length); } }));
  controls.forEach((control, index) => refs[index].current = control);
  const react = { useRef(initial) { return cells[cursor++] ??= { current: initial }; }, useLayoutEffect(effect, deps) { const i = cursor++; if (!cells[i] || deps.some((dep, j) => dep !== cells[i][j])) { cells[i] = deps; effects.push(effect); } } };
  const require = withTextInputHistory(id => id === 'react' ? react : null);
  require('react');
  const { useTextInputHistory } = require('./useTextInputHistory');
  let hooks;
  function render() { cursor = 0; hooks = values.map((value, i) => useTextInputHistory(refs[i], value, next => { changes.push([i, next]); values[i] = next; })); while (effects.length) effects.shift()(); }
  function before(index, inputType, target = controls[index]) {
    controls[index].focus();
    const event = { inputType, target, prevented: false, preventDefault() { this.prevented = true; } };
    listeners.forEach(listener => listener(event)); return event;
  }
  function input(index, next, inputType = 'insertText') {
    before(index, inputType); controls[index].value = next; controls[index].setSelectionRange(next.length, next.length);
    hooks[index].events.onChange({ currentTarget: controls[index], nativeEvent: { inputType } }); render();
  }
  function key(index, key, modifiers = {}) {
    controls[index].focus(); const event = { key, ctrlKey: true, ...modifiers, currentTarget: controls[index], nativeEvent: { isComposing: false }, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    hooks[index].events.onKeyDown(event); render(); return event;
  }
  render();
  return { controls, values, input, key, before, render, changes, hook: index => hooks[index] };
}

test('focused native fields route menu undo and keyboard redo independently, including foreign native event targets', () => {
  const f = controlsFixture(['Alpha', 'Beta', 'Alpha alpha']);
  f.input(0, 'alpha'); f.input(1, 'Gamma');
  f.controls[2].setSelectionRange(0, 5);
  assert.equal(insertUndoableText(f.controls[2], 'Gamma', 0, 5, () => f.values[2], () => {}), true);
  f.render();
  assert.equal(f.before(1, 'historyUndo').prevented, true); f.render();
  assert.deepEqual(f.values, ['alpha', 'Beta', 'Gamma alpha']);
  assert.equal(f.before(2, 'historyUndo', f.controls[1]).prevented, true); f.render();
  assert.deepEqual(f.values, ['alpha', 'Beta', 'Alpha alpha']);
  f.key(2, 'z', { shiftKey: true });
  assert.equal(f.values[2], 'Gamma alpha');
  f.key(1, 'y'); assert.equal(f.values[1], 'Gamma');
  f.key(0, 'z'); f.key(0, 'z'); assert.equal(f.values[2], 'Gamma alpha');
});

test('composition remains one transaction despite intermediate controlled renders, and read-only undo preserves content', () => {
  const f = controlsFixture(['', '', '原文']);
  f.input(2, '原文a');
  f.hook(2).events.onCompositionStart({ currentTarget: f.controls[2] });
  f.input(2, '原文a中', 'insertCompositionText'); f.input(2, '原文a中文', 'insertCompositionText');
  assert.equal(f.key(2, 'z').defaultPrevented, undefined);
  assert.equal(f.before(2, 'historyUndo').prevented, false, 'the IME keeps its own candidate undo');
  assert.equal(f.before(2, 'historyUndo', f.controls[0]).prevented, true, 'composition never permits a foreign native history to change another field');
  f.hook(2).events.onCompositionEnd({ currentTarget: f.controls[2] }); f.render();
  f.key(2, 'z'); assert.equal(f.values[2], '原文a');
  f.key(2, 'z'); assert.equal(f.values[2], '原文');
  f.controls[2].readOnly = true; f.key(2, 'y'); assert.equal(f.values[2], '原文');
});

test('managed insertion observes current disabled state so an authorized media insertion can temporarily unlock its textarea', () => {
  const f = controlsFixture(['', '', '正文']);
  f.controls[2].disabled = true;
  assert.equal(insertUndoableText(f.controls[2], '图', 2, 2, () => f.values[2], () => {}), false);
  f.controls[2].disabled = false;
  assert.equal(insertUndoableText(f.controls[2], '图', 2, 2, () => f.values[2], () => {}), true);
  f.render(); f.key(2, 'z'); assert.equal(f.values[2], '正文');
});
