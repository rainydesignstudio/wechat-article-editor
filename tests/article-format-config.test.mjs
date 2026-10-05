import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FORMAT_BUNDLE, validateFormatBundle, compileFormatBundle } from '../src/lib/article-format/config.ts';
import { activateFormatBundle, assertCurrentFormat, assertFormatReady, getFormatSnapshot, invalidateFormatBundle } from '../src/lib/article-format/runtime.ts';
import { initializeLibraryFormat, readLibraryFormat } from '../src/lib/article-format/library.ts';
import { findSourceMatches, replaceAllSourceMatches } from '../src/lib/sourceSearch.ts';

const copy = () => structuredClone(DEFAULT_FORMAT_BUNDLE);
test('configuration can add registered rules and additive formatter steps without consumer props', () => {
  const raw = copy();
  raw.support.rules.push({ id: 'alignment', section: 'custom', title: '自定义对齐', severity: 'warning', source: 'wechat-editor', validator: 'alignment' });
  raw.validator.rules.push({ id: 'alignment', operator: 'style.values', enabled: true, stages: ['authoring', 'rendered'], parameters: { property: 'text-align', values: ['justify'] } });
  raw.formatter.steps.push({ id: 'custom-css', operator: 'css.drop-properties', enabled: true, parameters: { properties: ['text-transform'] } });
  const result = compileFormatBundle(raw);
  assert.deepEqual(result.formatter.output.dropCssProperties, ['font-family', 'text-transform']);
  assert.equal(result.validator.rules.at(-1).parameters.property, 'text-align');
});
test('unknown fields, operators, wrong parameter types, conflicting steps and missing references fail explicitly', () => {
  for (const mutate of [
    b => { b.formatter.steps[0].parameters.mdoe = 'space'; },
    b => { b.validator.rules[0].parameters.value = '0'; },
    b => { b.validator.rules[0].operator = 'invented.algorithm'; },
    b => { b.formatter.steps.push({ ...b.formatter.steps[0], id: 'duplicate-soft-breaks' }); },
    b => { b.support.rules[0].validator = 'missing'; },
    b => { b.formatter.steps[0].enabled = 'false'; },
    b => { b.formatter.markdown = {}; },
    b => { b.validator.rules[0].stages = ['authoring']; },
    b => { b.formatter.steps.find(s => s.operator === 'output.html').parameters.preserveAttributes.push('onclick'); },
    b => { b.formatter.steps.find(s => s.operator === 'preview.surface').parameters.darkBackground = 'red;}body{display:none'; },
  ]) { const raw = copy(); mutate(raw); assert.throws(() => validateFormatBundle(raw)); }
});
test('snapshots are immutable and stale tasks cannot commit after switching configurations', () => {
  const raw = copy(); const first = activateFormatBundle(raw, 'test');
  assert.equal(first.officialDefault, true);
  assert.throws(() => { first.bundle.formatter.markdown.softBreaks = 'line-break'; });
  raw.formatter.steps[0].parameters.mode = 'line-break';
  assert.equal(first.bundle.formatter.markdown.softBreaks, 'space');
  const second = activateFormatBundle(raw, 'test');
  assert.equal(second.officialDefault, false);
  assert.equal(second.bundle.formatter.markdown.softBreaks, 'line-break');
  assert.throws(() => assertCurrentFormat(first));
  invalidateFormatBundle('test', '坏配置'); assert.throws(() => assertFormatReady());
  assert.equal(getFormatSnapshot().officialDefault, false);
  activateFormatBundle(copy(), null, 'built-in');
});

function directory(name = 'test') {
  const children = new Map(); let reads = 0, writes = 0;
  const notFound = () => new DOMException('missing', 'NotFoundError');
  return { name, children, get counts() { return { reads, writes }; },
    async getDirectoryHandle(key, options) { if (!children.has(key)) { if (!options?.create) throw notFound(); children.set(key, directory(key)); } return children.get(key); },
    async getFileHandle(key, options) {
      if (!children.has(key)) { if (!options?.create) throw notFound(); children.set(key, ''); }
      return { async getFile() { reads++; const value = children.get(key); return { size: value.length, text: async () => value }; },
        async createWritable() { let value; return { write: async text => { value = text; }, close: async () => { writes++; children.set(key, value); }, abort: async () => {} }; } };
    },
  };
}
test('library fallback is explicit; partial or old bundles are invalid; initialization never overwrites', async () => {
  const root = directory(); const absent = await readLibraryFormat(root);
  assert.equal(absent.source, 'built-in'); assert.ok(absent.message);
  await initializeLibraryFormat(root); const format = root.children.get('format');
  assert.equal(format.counts.writes, 3); assert.equal((await readLibraryFormat(root)).source, 'library');
  await initializeLibraryFormat(root); assert.equal(format.counts.writes, 3);
  format.children.delete('validator.json'); assert.equal((await readLibraryFormat(root)).source, 'invalid');
  await initializeLibraryFormat(root); assert.equal(format.counts.writes, 3);
  format.children.set('validator.json', '{'); assert.equal((await readLibraryFormat(root)).source, 'invalid');
  format.children.set('validator.json', JSON.stringify({ ...copy().validator, schemaVersion: 0 }));
  assert.equal((await readLibraryFormat(root)).source, 'invalid');
});
test('literal source find handles regex punctuation, Unicode offsets, case and literal replacement dollars', () => {
  assert.deepEqual(findSourceMatches('😀A.[ a.[', 'a.[', false), [{ start: 2, end: 5 }, { start: 6, end: 9 }]);
  assert.equal(findSourceMatches('Aa', 'a', true).length, 1);
  assert.equal(replaceAllSourceMatches('x x', 'x', '$&', false), '$& $&');
  assert.equal(findSourceMatches('aaaa', 'aa', true).length, 2);
  assert.deepEqual(findSourceMatches('source', '', false), []);
});
