import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeLocalFonts, loadLocalFonts, shareLocalFontsWithPreview } from '../src/lib/localFonts.ts';
import { OPEN_FONT_ASSETS, canonicalFontStack, codeFontStack, fontOptions } from '../src/lib/fontCatalog.ts';

class Directory {
  files = new Map(); directories = new Map(); failWrite = false;
  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.directories.has(name)) { if (!create) throw new DOMException('missing', 'NotFoundError'); this.directories.set(name, new Directory()); }
    return this.directories.get(name);
  }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.files.has(name)) { if (!create) throw new DOMException('missing', 'NotFoundError'); this.files.set(name, new ArrayBuffer(0)); }
    return { getFile: async () => ({ arrayBuffer: async () => this.files.get(name) }), createWritable: async () => ({ write: async content => { if (this.failWrite) throw new Error('write denied'); this.files.set(name, content); }, close: async () => {}, abort: async () => {} }) };
  }
  async removeEntry(name) { this.files.delete(name); }
}

test('font menu deduplicates full-stack variants by family and isolates code choices', () => {
  const options = fontOptions(['"Sen Local", serif', '"Sen Local", sans-serif', '"Songti SC", serif', '"Songti SC", SimSun, serif']);
  assert.equal(options.filter(font => font.label.startsWith('Sen')).length, 1);
  assert.equal(options.filter(font => font.label.startsWith('系统宋体')).length, 1);
  assert.equal(canonicalFontStack('"Sen Local", serif'), canonicalFontStack('"Sen Local", sans-serif'));
  assert.ok(fontOptions([], true).every(font => /monospace/.test(font.value)));
  assert.ok(!/Songti/.test(codeFontStack('"Songti SC", serif')));
});

test('directory initialization copies only bundled open fonts with licenses, and preserves existing bytes', async t => {
  const root = new Directory(), urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(url); return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer }; });
  await initializeLocalFonts(root);
  const directory = await root.getDirectoryHandle('fonts');
  assert.deepEqual([...directory.files.keys()], OPEN_FONT_ASSETS.flatMap(asset => [asset.license, asset.file]));
  assert.ok(urls.every(url => /^\/[a-z-]+(?:\.ttf|\.txt)$/i.test(url)));
  const custom = new Uint8Array([1, 2, 3]).buffer;
  directory.files.set('sen-variable.ttf', custom);
  await initializeLocalFonts(root);
  assert.equal(urls.length, 6);
  assert.equal(directory.files.get('sen-variable.ttf'), custom);
  assert.equal([...directory.files.keys()].some(name => /PingFang|YaHei|Consolas|SFMono/.test(name)), false);
});

test('failed copies remove partial new files; a stale session never writes fetched bytes', async t => {
  const root = new Directory(), directory = await root.getDirectoryHandle('fonts', { create: true });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  directory.failWrite = true;
  await assert.rejects(initializeLocalFonts(root), /write denied/);
  assert.equal(directory.files.size, 0);
  directory.failWrite = false;
  let current = true;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => { current = false; return new ArrayBuffer(8); } }));
  await initializeLocalFonts(root, () => current);
  assert.equal(directory.files.size, 0);
});

test('font loading reads authorized files, discards stale results, and cleans up a directory session', async t => {
  const root = new Directory(), directory = await root.getDirectoryHandle('fonts', { create: true });
  for (const asset of OPEN_FONT_ASSETS) directory.files.set(asset.file, new ArrayBuffer(8));
  const original = globalThis.FontFace;
  globalThis.FontFace = class { constructor(family, source, descriptors) { this.family = family; this.source = source; this.descriptors = descriptors; } async load() { return this; } };
  t.after(() => { if (original) globalThis.FontFace = original; else delete globalThis.FontFace; });
  const target = { fonts: new Set() };
  const preview = { fonts: new Set() }, closePreview = shareLocalFontsWithPreview(preview);
  const dispose = await loadLocalFonts(root, () => true, target);
  assert.deepEqual([...target.fonts].map(face => face.family), OPEN_FONT_ASSETS.map(asset => asset.family));
  assert.equal(preview.fonts.size, 3, 'isolated dark previews use the same authorized font faces');
  dispose(); assert.equal(target.fonts.size, 0);
  assert.equal(preview.fonts.size, 0, 'changing directories clears faces from dark previews too');
  await loadLocalFonts(root, () => false, target);
  assert.equal(target.fonts.size, 0);
  closePreview();
});
