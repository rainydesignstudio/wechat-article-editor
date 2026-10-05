import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { articleExportBaseName, createArticleDocumentPackage } from '../src/lib/articleExport.ts';
import { articlePdfPageCuts } from '../src/lib/articleVisualExport.ts';

function directory(items) {
  return {
    kind: 'directory',
    async *entries() { for (const [name, value] of Object.entries(items)) yield [name, { kind: value.kind ?? 'file' }]; },
    async getDirectoryHandle(name) {
      const value = items[name];
      if (!value || value.kind !== 'directory') throw new DOMException('Not found', 'NotFoundError');
      return value;
    },
    async getFileHandle(name) {
      const value = items[name];
      if (!(value instanceof Blob)) throw new DOMException('Not found', 'NotFoundError');
      return { kind: 'file', async getFile() { return value; } };
    },
  };
}

test('document package preserves current markdown and the existing media tree', async () => {
  const media = directory({ image: directory({ '封面.png': new Blob([Uint8Array.from([1, 2, 3])]) }), 'note.txt': new Blob(['附注']) });
  const root = directory({ articles: directory({ '2026-10': directory({ draft: directory({ media }) }) }) });
  const source = '---\ntitle: "当前稿"\n---\n\n![封面](media/image/%E5%B0%81%E9%9D%A2.png)\n';
  const { blob, mediaFiles } = await createArticleDocumentPackage(source, root, '2026-10', 'draft');
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(strFromU8(entries['article.md']), source);
  assert.deepEqual(Array.from(entries['media/image/封面.png']), [1, 2, 3]);
  assert.equal(strFromU8(entries['media/note.txt']), '附注');
  assert.equal(mediaFiles, 2);
});

test('unsaved document package still contains markdown and an empty media directory', async () => {
  const { blob, mediaFiles } = await createArticleDocumentPackage('# 草稿\n', directory({}), null, null);
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(strFromU8(entries['article.md']), '# 草稿\n');
  assert.ok(entries['media/']);
  assert.equal(mediaFiles, 0);
  assert.equal(articleExportBaseName('  A/B: C  '), 'A-B- C');
});

test('PDF cuts prefer complete blocks within each A4 page', () => {
  assert.deepEqual(articlePdfPageCuts(2500, 1000, [800, 1700, 2400]), [800, 1700, 2500]);
});
