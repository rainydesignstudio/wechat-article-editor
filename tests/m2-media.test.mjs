import assert from 'node:assert/strict';
import test from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

const { articleImageFileNameFromSource, articleImageSourceSetCandidates, copyArticleImageAs, importArticleImage, insertArticleImageReferences, listArticleImages, rewriteArticleImageReferences } = await import('../src/lib/articleMedia.ts');
const { getArticleMediaDirectory } = await import('../src/lib/fileSystem.ts');
const { getSharedImageDirectory, importSharedImage, listSharedImages } = await import('../src/lib/articleMedia.ts');

class MemoryFileHandle {
  kind = 'file';
  constructor(name, failWrite = false) { this.name = name; this.bytes = new Uint8Array(); this.type = ''; this.failWrite = failWrite; }
  async getFile() {
    return new File([this.bytes], this.name, { type: this.type, lastModified: 1 });
  }
  async createWritable() {
    let pending = new Uint8Array();
    return {
      write: async (value) => {
        if (this.failWrite) throw new Error('synthetic image write failure');
        pending = value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : new Uint8Array(value);
      },
      close: async () => { this.bytes = pending; },
      abort: async () => { pending = new Uint8Array(); },
    };
  }
}

class MemoryDirectoryHandle {
  kind = 'directory';
  constructor(name = 'image') { this.name = name; this.children = new Map(); this.failNextWrite = false; }
  async getDirectoryHandle(name, options = {}) {
    const current = this.children.get(name);
    if (current) {
      if (current.kind !== 'directory') throw new Error(`${name} is not a directory`);
      return current;
    }
    if (!options.create) throw Object.assign(new Error(`missing directory: ${name}`), { name: 'NotFoundError' });
    const created = new MemoryDirectoryHandle(name);
    this.children.set(name, created);
    return created;
  }
  async getFileHandle(name, options = {}) {
    const current = this.children.get(name);
    if (current) {
      if (current.kind !== 'file') throw new Error(`${name} is not a file`);
      return current;
    }
    if (!options.create) throw Object.assign(new Error(`missing file: ${name}`), { name: 'NotFoundError' });
    const created = new MemoryFileHandle(name, this.failNextWrite);
    this.failNextWrite = false;
    this.children.set(name, created);
    return created;
  }
  async *entries() { for (const entry of this.children) yield entry; }
  async removeEntry(name) { this.children.delete(name); }
}

test('renaming a local image updates Markdown and HTML image sources only', () => {
  const source = [
    '---',
    'title: "media/image/cabin.png remains metadata"',
    '---',
    '',
    '![Cabin](media/image/cabin.png "caption")',
    '<img class="wide" src="./media/image/cabin.png" alt="Cabin">',
    '![Remote](https://images.example.test/media/image/cabin.png)',
    'Plain text: media/image/cabin.png',
    '<!-- <img src="media/image/cabin.png"> -->',
    '```md',
    '![Code](media/image/cabin.png)',
    '<img src="media/image/cabin.png">',
    '```',
    '`![Inline code](media/image/cabin.png)`',
  ].join('\n');

  const result = rewriteArticleImageReferences(source, 'cabin.png', 'cabin-edited.png');

  assert.equal(result.count, 2);
  assert.equal(result.source, [
    '---',
    'title: "media/image/cabin.png remains metadata"',
    '---',
    '',
    '![Cabin](media/image/cabin-edited.png "caption")',
    '<img class="wide" src="./media/image/cabin-edited.png" alt="Cabin">',
    '![Remote](https://images.example.test/media/image/cabin.png)',
    'Plain text: media/image/cabin.png',
    '<!-- <img src="media/image/cabin.png"> -->',
    '```md',
    '![Code](media/image/cabin.png)',
    '<img src="media/image/cabin.png">',
    '```',
    '`![Inline code](media/image/cabin.png)`',
  ].join('\n'));
});

test('renaming a reference-style Markdown image updates its definition and local srcset candidates', () => {
  const source = [
    '![Cover][hero]',
    '',
    '[hero]: <./media/image/cabin%20wide.png> "cover"',
    '',
    '<picture>',
    '  <source srcset="./media/image/cabin%20wide.png 1x, https://cdn.example.test/cabin%20wide.png 2x">',
    '  <img alt="Cabin" src="media/image/cabin%20wide.png" srcset="media/image/cabin%20wide.png 1x, https://cdn.example.test/cabin%20wide.png 2x">',
    '</picture>',
  ].join('\n');

  const result = rewriteArticleImageReferences(source, 'cabin wide.png', 'cabin-edited.png');

  assert.equal(result.count, 4);
  assert.equal(result.source, [
    '![Cover][hero]',
    '',
    '[hero]: <./media/image/cabin-edited.png> "cover"',
    '',
    '<picture>',
    '  <source srcset="./media/image/cabin-edited.png 1x, https://cdn.example.test/cabin%20wide.png 2x">',
    '  <img alt="Cabin" src="media/image/cabin-edited.png" srcset="media/image/cabin-edited.png 1x, https://cdn.example.test/cabin%20wide.png 2x">',
    '</picture>',
  ].join('\n'));
});

test('image import trusts the file signature and chooses a free matching extension', async () => {
  const directory = new MemoryDirectoryHandle();
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const file = new File([png], 'Screenshot.jpg', { type: 'image/jpeg' });

  const first = await importArticleImage(directory, file);
  const second = await importArticleImage(directory, file);

  assert.equal(first.fileName, 'Screenshot.png');
  assert.equal(first.mimeType, 'image/png');
  assert.equal(second.fileName, 'Screenshot-2.png');
  assert.deepEqual(directory.children.get(first.fileName).bytes, png);
  assert.deepEqual(directory.children.get(second.fileName).bytes, png);
});

test('renaming writes a new image without moving the original or overwriting a collision', async () => {
  const directory = new MemoryDirectoryHandle();
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const original = await importArticleImage(directory, new File([png], 'cover.png', { type: 'image/png' }));
  const collision = await directory.getFileHandle('cover-new.png', { create: true });
  const collisionWriter = await collision.createWritable();
  await collisionWriter.write(Uint8Array.from([1, 2, 3]));
  await collisionWriter.close();

  await assert.rejects(() => copyArticleImageAs(directory, original.handle, 'cover-new'), /已存在/);
  assert.deepEqual(directory.children.get('cover.png').bytes, png);
  assert.deepEqual(directory.children.get('cover-new.png').bytes, Uint8Array.from([1, 2, 3]));

  const renamed = await copyArticleImageAs(directory, original.handle, 'cover-edited');
  assert.equal(renamed.fileName, 'cover-edited.png');
  assert.deepEqual(directory.children.get('cover-edited.png').bytes, png);
  assert.deepEqual(directory.children.get('cover.png').bytes, png);
  await assert.rejects(() => copyArticleImageAs(directory, original.handle, '../escape'), /文件名/);
  assert.equal(directory.children.has('escape.png'), false);
});

test('image import rejects active-content lookalikes and cleans up a failed new write', async () => {
  const directory = new MemoryDirectoryHandle();
  const fakeSvg = new File(['<svg><script>not an image</script></svg>'], 'drawing.png', { type: 'image/png' });
  await assert.rejects(() => importArticleImage(directory, fakeSvg), /无法从文件内容确认/);
  assert.equal(directory.children.size, 0);

  directory.failNextWrite = true;
  const png = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'Screenshot.png', { type: 'image/png' });
  await assert.rejects(() => importArticleImage(directory, png), /保存失败/);
  assert.equal(directory.children.size, 0);
});

test('image storage creates media/image only inside an existing safe article folder', async () => {
  const root = new MemoryDirectoryHandle('data');
  const articles = await root.getDirectoryHandle('articles', { create: true });
  const month = await articles.getDirectoryHandle('2026-09', { create: true });
  const article = await month.getDirectoryHandle('existing-article', { create: true });

  const imageDirectory = await getArticleMediaDirectory(root, '2026-09', 'existing-article', true);

  assert.equal(imageDirectory.name, 'image');
  assert.equal(article.children.get('media').children.get('image'), imageDirectory);
  await assert.rejects(() => getArticleMediaDirectory(root, '2026-13', 'existing-article', true), /年月/);
  await assert.rejects(() => getArticleMediaDirectory(root, '2026-09', '../outside', true), /不安全/);
  await assert.rejects(() => getArticleMediaDirectory(root, '2026-09', 'missing-article', true), /missing directory/);
  assert.equal(month.children.has('missing-article'), false);
});

test('asset listing includes supported raster files and excludes unknown active content', async () => {
  const directory = new MemoryDirectoryHandle();
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const gif = new File([Uint8Array.from([71, 73, 70, 56, 57, 97])], 'second.gif', { type: 'image/gif' });
  await importArticleImage(directory, new File([png], 'first.png', { type: 'image/png' }));
  await importArticleImage(directory, gif);
  const svg = await directory.getFileHandle('untrusted.svg', { create: true });
  const svgWriter = await svg.createWritable();
  await svgWriter.write(new TextEncoder().encode('<svg><script>not executed</script></svg>'));
  await svgWriter.close();
  await directory.getDirectoryHandle('nested', { create: true });

  const assets = await listArticleImages(directory);

  assert.deepEqual(assets.map((asset) => asset.fileName), ['first.png', 'second.gif']);
  assert.deepEqual(assets.map((asset) => asset.mimeType), ['image/png', 'image/gif']);
});

test('local image resolution accepts only one safe media/image filename segment', () => {
  assert.equal(articleImageFileNameFromSource('./media/image/cabin%20wide.png'), 'cabin wide.png');
  assert.equal(articleImageFileNameFromSource('media/image/cabin.png?rev=2'), 'cabin.png');
  assert.equal(articleImageFileNameFromSource('https://cdn.example.test/media/image/cabin.png'), null);
  assert.equal(articleImageFileNameFromSource('../media/image/cabin.png'), null);
  assert.equal(articleImageFileNameFromSource('media/image/%2e%2e%2fsecret.png'), null);
});

test('image insertion stays in article body and encodes each local reference', () => {
  const source = '---\ntitle: "Draft"\n---\n\nExisting body';
  const next = insertArticleImageReferences(source, ['screenshot.png', 'wide view.png'], { start: 5, end: 12 });

  assert.equal(next, '---\ntitle: "Draft"\n---\n\n![screenshot](media/image/screenshot.png)\n![wide view](media/image/wide%20view.png)\n\nExisting body');
});

test('srcset inspection separates local image paths from remote and data candidates', () => {
  const candidates = articleImageSourceSetCandidates('./media/image/cover.png 1x, https://cdn.example.test/cover.png 2x, data:image/png;base64,AAAA 3x, media/image/wide%20cover.png 4x');

  assert.deepEqual(candidates.map(({ fileName }) => fileName), ['cover.png', null, null, 'wide cover.png']);
});

test('reading an empty shared library is side-effect free and rejects invalid imports before creating folders', async () => {
  const root = new MemoryDirectoryHandle('library');
  assert.equal(await getSharedImageDirectory(root), null);
  assert.deepEqual(await listSharedImages(root), []);
  assert.equal(root.children.size, 0);
  await assert.rejects(() => importSharedImage(root, new File(['not a raster image'], 'fake.png'), () => true), /无法从文件内容确认/);
  assert.equal(root.children.size, 0);
  const denied = { async getDirectoryHandle() { throw Object.assign(new Error('permission revoked'), { name: 'NotAllowedError' }); } };
  await assert.rejects(() => listSharedImages(denied), /permission revoked/);
});

test('shared imports keep collisions independent and create only the image directory', async () => {
  const root = new MemoryDirectoryHandle('library');
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const file = new File([bytes], 'cover.jpg', { type: 'image/jpeg' });
  const first = await importSharedImage(root, file, () => true);
  const second = await importSharedImage(root, file, () => true);
  assert.deepEqual([first.fileName, second.fileName], ['cover.png', 'cover-2.png']);
  assert.equal(first.kind, 'shared');
  assert.equal(first.root, root);
  assert.deepEqual([...root.children.keys()], ['shared']);
  assert.deepEqual([...root.children.get('shared').children.keys()], ['image']);
  assert.deepEqual((await listSharedImages(root)).map((asset) => asset.fileName), ['cover-2.png', 'cover.png']);
  assert.deepEqual(new Uint8Array(await (await first.handle.getFile()).arrayBuffer()), bytes);
});

test('long image names are clipped at complete Unicode characters and remain valid references', async () => {
  const root = new MemoryDirectoryHandle('library');
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const name = `${'a'.repeat(79)}😀extra.png`;
  const image = await importSharedImage(root, new File([png], name), () => true);
  assert.equal(image.fileName, `${'a'.repeat(79)}😀.png`);
  assert.doesNotThrow(() => insertArticleImageReferences('', [image.fileName], { start: 0, end: 0 }));
});

test('stale shared imports do not write and failed writes preserve the original image', async () => {
  const root = new MemoryDirectoryHandle('library');
  const file = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'cover.png');
  await assert.rejects(() => importSharedImage(root, file, () => false), /资料库已切换/);
  assert.equal(root.children.size, 0);
  const original = await importSharedImage(root, file, () => true);
  const directory = await getSharedImageDirectory(root);
  directory.failNextWrite = true;
  await assert.rejects(() => importSharedImage(root, file, () => true), /保存失败/);
  assert.deepEqual([...directory.children.keys()], ['cover.png']);
  assert.equal((await original.handle.getFile()).size, file.size);
});

test('adopting a shared image produces an independent article file with the existing portable reference', async () => {
  const root = new MemoryDirectoryHandle('library');
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const shared = await importSharedImage(root, new File([bytes], '共用封面.png'), () => true);
  const articles = await root.getDirectoryHandle('articles', { create: true });
  const month = await articles.getDirectoryHandle('2026-10', { create: true });
  await month.getDirectoryHandle('draft', { create: true });
  const directory = await getArticleMediaDirectory(root, '2026-10', 'draft', true);
  await importArticleImage(directory, new File([bytes], shared.fileName));
  const adopted = await importArticleImage(directory, await shared.handle.getFile());
  assert.equal(adopted.fileName, '共用封面-2.png');
  assert.notEqual(adopted.handle, shared.handle);
  assert.deepEqual(new Uint8Array(await (await adopted.handle.getFile()).arrayBuffer()), bytes);
  const source = insertArticleImageReferences('before\n\nafter', [adopted.fileName], { start: 6, end: 6 });
  assert.ok(source.includes(`media/image/${encodeURIComponent(adopted.fileName)}`));
  assert.equal(source.includes('shared/'), false);
  const writable = await shared.handle.createWritable();
  await writable.write(Uint8Array.from([1, 2, 3]));
  await writable.close();
  assert.deepEqual(new Uint8Array(await (await adopted.handle.getFile()).arrayBuffer()), bytes);
});


test('image references encode filename punctuation so Markdown cannot truncate the destination', () => {
  for (const name of ['封面(终稿.png', 'cover)\'final!.png']) {
    const source = insertArticleImageReferences('', [name], { start: 0, end: 0 });
    const image = unified().use(remarkParse).parse(source).children[0].children[0];
    assert.equal(image.type, 'image');
    assert.equal(articleImageFileNameFromSource(image.url), name);
    const rewritten = rewriteArticleImageReferences(source, name, 'new)cover.png');
    assert.equal(rewritten.count, 1);
    const renamed = unified().use(remarkParse).parse(rewritten.source).children[0].children[0];
    assert.equal(articleImageFileNameFromSource(renamed.url), 'new)cover.png');
  }
});
