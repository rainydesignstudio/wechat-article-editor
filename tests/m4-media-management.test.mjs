import assert from 'node:assert/strict';
import test from 'node:test';
import { articleLocalImageReferences, copyArticleImageAs, importArticleImage, rewriteArticleImageReferences } from '../src/lib/articleMedia.ts';
import { inspectLocalArticleImages, inspectMediaUsage, readMediaMetadata, saveMediaDescription, removeMediaDescription, transferMedia, renameSharedMedia } from '../src/lib/mediaManagement.ts';
import { getArticleMediaDirectory } from '../src/lib/fileSystem.ts';
import { parseArticle } from '../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { groupSourceLineIssues } from '../src/lib/sourceLineDiagnostics.ts';

const png = Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
class FileHandle {
  kind = 'file'; bytes = new Uint8Array(); fail = false;
  constructor(name) { this.name = name; }
  async getFile() { return new File([this.bytes], this.name, { type: 'image/png', lastModified: 10 }); }
  async createWritable() {
    let pending;
    return { write: async value => { if (this.fail) throw new Error('write denied'); pending = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value); }, close: async () => { this.bytes = pending; }, abort: async () => {} };
  }
}
class Directory {
  kind = 'directory'; children = new Map(); writes = 0; failNewFile = false;
  constructor(name = 'root') { this.name = name; }
  async getDirectoryHandle(name, options = {}) { if (this.children.has(name)) return this.children.get(name); if (!options.create) throw new DOMException(name, 'NotFoundError'); const child = new Directory(name); this.children.set(name, child); this.writes++; return child; }
  async getFileHandle(name, options = {}) { if (this.children.has(name)) return this.children.get(name); if (!options.create) throw new DOMException(name, 'NotFoundError'); const file = new FileHandle(name); file.fail = this.failNewFile; this.children.set(name, file); this.writes++; return file; }
  async *entries() { yield* this.children; }
  async removeEntry(name) { if (!this.children.has(name)) throw new DOMException(name, 'NotFoundError'); this.children.delete(name); }
}
async function fixture() {
  const root = new Directory(), articles = await root.getDirectoryHandle('articles', { create: true }), month = await articles.getDirectoryHandle('2026-10', { create: true });
  const source = await month.getDirectoryHandle('source', { create: true }), target = await month.getDirectoryHandle('target', { create: true });
  const images = await (await source.getDirectoryHandle('media', { create: true })).getDirectoryHandle('image', { create: true });
  const handle = await images.getFileHandle('cover.png', { create: true }); handle.bytes = png;
  const markdown = await source.getFileHandle('article.md', { create: true }); markdown.bytes = new TextEncoder().encode('![image](media/image/cover.png)');
  return { root, source, target, images, handle, asset: { kind: 'article', root, articleId: '2026-10/source', month: '2026-10', folder: 'source', articleTitle: 'Source', fileName: 'cover.png', handle, size: png.length, mimeType: 'image/png', description: 'a picture' } };
}
test('local image extraction locates real inline, reference and HTML images but ignores code, comments and ordinary links', () => {
  const source = ['![one](media/image/a%20b.png)', '![ref][cover]', '', '[cover]: ./media/image/cover.png', '', '<img src="media/image/html.png"><source srcset="media/image/large.png 2x">', '`![code](media/image/no.png)`', '```html', '<img src="media/image/no.png">', '```', '<!-- <img src="media/image/no.png"> -->', '[link](media/image/no.png)'].join('\n');
  assert.deepEqual(articleLocalImageReferences(source), [{ fileName: 'a b.png', line: 1 }, { fileName: 'cover.png', line: 2 }, { fileName: 'html.png', line: 6 }, { fileName: 'large.png', line: 6 }]);
});
test('missing images are grouped at all logical source lines; access failure is a warning, empty reads create nothing', async () => {
  const f = await fixture();
  assert.equal((await inspectLocalArticleImages('![ok](media/image/cover.png)', f.root, '2026-10', 'source')).length, 0);
  const errors = await inspectLocalArticleImages('![x](media/image/lost.png)\n<img src="media/image/lost.png">', f.root, '2026-10', 'source');
  assert.equal(errors[0].tier, 'danger'); assert.deepEqual(errors[0].lines, [1,2]);
  const original = f.root.getDirectoryHandle; f.root.getDirectoryHandle = async () => { throw new DOMException('permission denied', 'NotAllowedError'); };
  assert.equal((await inspectLocalArticleImages('![x](media/image/lost.png)', f.root, '2026-10', 'source'))[0].tier, 'conditional'); f.root.getDirectoryHandle = original;
  const empty = new Directory(); await inspectLocalArticleImages('![x](media/image/lost.png)', empty, '2026-10', 'source'); assert.equal(empty.writes, 0);
});
test('description metadata round-trips unknown fields and write failures preserve the previous file', async () => {
  const directory = new Directory(); assert.deepEqual(await readMediaMetadata(directory), { version: 1, images: {} }); assert.equal(directory.writes, 0);
  await saveMediaDescription(directory, 'cover.png', 'first');
  const handle = directory.children.get('index.json'), data = JSON.parse(await (await handle.getFile()).text()); data.extra = 'retain'; data.images['cover.png'].custom = 7; handle.bytes = new TextEncoder().encode(JSON.stringify(data));
  await saveMediaDescription(directory, 'cover.png', 'second'); assert.equal((await readMediaMetadata(directory)).extra, 'retain'); assert.equal((await readMediaMetadata(directory)).images['cover.png'].custom, 7);
  const before = handle.bytes; handle.fail = true; await assert.rejects(saveMediaDescription(directory, 'cover.png', 'third'), /write denied/); assert.deepEqual(handle.bytes, before); handle.fail = false;
  await removeMediaDescription(directory, 'cover.png', () => true); assert.equal((await readMediaMetadata(directory)).images['cover.png'], undefined);
});
test('unreferenced transfer moves bytes and description; referenced transfer copies and preserves source', async () => {
  for (const referenced of [false,true]) {
    const f = await fixture(); await saveMediaDescription(f.images, 'cover.png', f.asset.description);
    const result = await transferMedia(f.asset, { kind: 'shared' }, { body: referenced ? 1 : 0, history: 0, issues: [] }, () => true);
    assert.equal(result.ok, true); const target = await (await f.root.getDirectoryHandle('shared')).getDirectoryHandle('image');
    assert.deepEqual((await (await target.getFileHandle('cover.png')).getFile()).size, png.length);
    assert.equal((await readMediaMetadata(target)).images['cover.png'].description, 'a picture');
    assert.equal(f.images.children.has('cover.png'), referenced);
    if (!referenced) assert.equal((await readMediaMetadata(f.images)).images['cover.png'], undefined);
  }
});
test('failed or stale transfer never deletes source; history uncertainty and same targets are rejected', async () => {
  const f = await fixture(); await assert.rejects(transferMedia(f.asset, { kind: 'shared' }, { body: 0, history: 0, issues: [] }, () => false), /会话/); assert.equal(f.root.children.has('shared'), false);
  await assert.rejects(transferMedia(f.asset, { kind: 'shared' }, { body: 0, history: 0, issues: ['broken'] }, () => true), /历史/);
  const destination = await (await f.root.getDirectoryHandle('shared', { create: true })).getDirectoryHandle('image', { create: true }); destination.failNewFile = true;
  await assert.rejects(transferMedia(f.asset, { kind: 'shared' }, { body: 0, history: 0, issues: [] }, () => true), /保存失败/); assert.equal(f.images.children.has('cover.png'), true); assert.equal(destination.children.has('cover.png'), false);
  await assert.rejects(transferMedia(f.asset, { kind: 'article', articleId: f.asset.articleId, month: f.asset.month, folder: f.asset.folder }, { body: 0, history: 0, issues: [] }, () => true), /相同/);
});
test('usage includes current draft references; shared rename retains description and leaves article copies independent', async () => {
  const f = await fixture(); assert.equal((await inspectMediaUsage(f.asset)).body, 1); assert.equal((await inspectMediaUsage(f.asset, 'no image')).body, 1);
  await transferMedia(f.asset, { kind: 'shared' }, { body: 1, history: 0, issues: [] }, () => true);
  const directory = await (await f.root.getDirectoryHandle('shared')).getDirectoryHandle('image'), asset = { ...f.asset, kind: 'shared', handle: await directory.getFileHandle('cover.png') };
  const result = await renameSharedMedia(asset, 'renamed', () => true); assert.equal(result.ok, true); assert.equal(directory.children.has('cover.png'), false); assert.equal(directory.children.has('renamed.png'), true); assert.equal(f.images.children.has('cover.png'), true); assert.equal((await readMediaMetadata(directory)).images['renamed.png'].description, 'a picture');
});
test('one source line retains both warning and error indicators and their message levels', () => {
  const concern = groupSourceLineIssues([{ name:'warning',source:'正文',tier:'conditional',kind:'element',line:1,message:'warn' }, { name:'error',source:'正文',tier:'danger',kind:'element',line:1,message:'bad' }], 1).get(1);
  assert.deepEqual(concern.severities, ['warning','error']); assert.deepEqual(concern.messageLevels.map(item => item.severity), ['warning','error']);
});

test('shared replacement changes the original file and retains description without touching adopted copies', async () => {
  const f = await fixture(); await transferMedia(f.asset, { kind: 'shared' }, { body: 1, history: 0, issues: [] }, () => true);
  const directory = await (await f.root.getDirectoryHandle('shared')).getDirectoryHandle('image');
  const shared = { ...f.asset, kind: 'shared', handle: await directory.getFileHandle('cover.png') };
  const replaced = new File([png, new Uint8Array([9,9])], 'replacement.png', { type: 'image/png' });
  const result = await renameSharedMedia(shared, 'ignored', () => true, replaced);
  assert.equal(result.ok, true); assert.equal(directory.children.has('cover.png'), false);
  assert.equal((await (await directory.getFileHandle('cover-2.png')).getFile()).size, png.length + 2);
  assert.equal((await readMediaMetadata(directory)).images['cover-2.png'].description, 'a picture');
  assert.equal((await f.handle.getFile()).size, png.length);
});

const { readFile } = await import('node:fs/promises');
const vm = await import('node:vm');
const ts = (await import('typescript')).default;
const controllerText = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
function controllerAction(name, context) {
  const ast = ts.createSourceFile('controller.ts', controllerText, ts.ScriptTarget.Latest, true);
  let declaration;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node.initializer; ts.forEachChild(node, visit); };
  visit(ast); assert.ok(declaration);
  context.useCallback = callback => callback;
  vm.runInNewContext(ts.transpileModule(`globalThis.action = ${declaration.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.action;
}
function managementContext(root) {
  return { directoryRef: { current: root }, contentLibraryRootSessionRef: { current: 1 }, mediaOperationRef: { current: false }, historyOperationRef: { current: null }, editorWorkspaceRef: { current: {} }, getArticleOrganization: () => ({ archived: false }), mutationQueueRef: { current: { run: callback => callback(), isDeleting: () => false } }, compileCurrent() {}, renameMediaImage() {}, setMediaOperation() {}, setMediaRefreshRevision() {}, setStatus() {}, articleMode: 'overview', view: 'assets', snapshotFor: () => ({ articleId: 'draft' }), mediaPickerRequestRef: { current: null }, setMediaPickerRequest() {}, mediaDirectory: async () => ({}), saveMediaDescription: async () => {}, articleRef: { current: {} }, articleId: () => 'draft' };
}
test('batch management reports partial failure and returns only failed keys for retry', async () => {
  const root = {}, context = managementContext(root), written = [];
  context.saveMediaDescription = async (_directory, fileName) => { if (fileName === 'bad.png') throw new Error('permission revoked'); written.push(fileName); };
  const run = controllerAction('manageLibraryMedia', context);
  const assets = ['good.png','bad.png'].map(fileName => ({ kind: 'shared', root, fileName }));
  const result = await run({ type: 'describe', assets, description: 'test' });
  assert.equal(result.ok, false); assert.deepEqual(written, ['good.png']); assert.deepEqual(Array.from(result.failedKeys), ['shared:shared:bad.png']); assert.match(result.message, /1\/2 项完成/); assert.match(result.message, /permission revoked/); assert.equal(context.mediaOperationRef.current, false);
});
test('switching library while a batch is running cancels remaining files and never writes to the new library', async () => {
  const root = {}, context = managementContext(root), written = [];
  context.saveMediaDescription = async (_directory, fileName) => { written.push(fileName); context.directoryRef.current = {}; };
  const run = controllerAction('manageLibraryMedia', context);
  const result = await run({ type: 'describe', assets: ['first.png','second.png'].map(fileName => ({ kind: 'shared', root, fileName })) });
  assert.equal(result.ok, false); assert.deepEqual(written, ['first.png']); assert.deepEqual(Array.from(result.failedKeys), ['shared:shared:second.png']); assert.equal(context.mediaOperationRef.current, false);
});
test('confirmed deletion reports metadata cleanup failure without claiming the image file was retained', async () => {
  const root = {}, context = managementContext(root); let removed = false, attempts = 0;
  context.mediaDirectory = async () => ({ removeEntry: async () => { if (removed) throw new DOMException('gone', 'NotFoundError'); removed = true; } });
  context.removeMediaDescription = async () => { if (++attempts === 1) throw new Error('index write failed'); };
  const result = await controllerAction('manageLibraryMedia', context)({ type: 'delete', assets: [{ kind: 'shared', root, fileName: 'test.png' }] });
  assert.equal(removed, true); assert.equal(result.ok, false); assert.match(result.message, /已删除，描述索引未清理/); assert.doesNotMatch(result.message, /文件保留/);
  const retry = await controllerAction('manageLibraryMedia', context)({ type: 'delete', assets: [{ kind: 'shared', root, fileName: 'test.png' }] });
  assert.equal(retry.ok, true); assert.equal(attempts, 2);
});

test('article rename removes an unreferenced original, preserves its description, and leaves source untouched', async () => {
  const f = await fixture(), source = 'plain text without images';
  f.source.children.get('article.md').bytes = new TextEncoder().encode(source);
  const context = managementContext(f.root);
  context.articleRef.current = { source, folder: f.asset.folder, month: f.asset.month, theme: BASIC_THEME, dirty: false };
  const token = { root: f.root, articleId: f.asset.articleId };
  Object.assign(context, { documentTokenRef: { current: token }, articleId: () => f.asset.articleId, getArticleMediaDirectory, copyArticleImageAs, importArticleImage, readMediaMetadata, saveMediaDescription, removeMediaDescription, inspectMediaUsage, rewriteArticleImageReferences, parseArticle, performSaveSnapshot() { throw new Error('source must stay unchanged'); }, updateArticle() { throw new Error('source must stay unchanged'); }, snapshotFor() {} });
  context.mutationQueueRef.current.canSave = () => true;
  const result = await controllerAction('renameMediaImage', context)(f.asset, 'renamed');
  assert.equal(result.tone, 'success'); assert.equal(f.images.children.has('cover.png'), false); assert.equal(f.images.children.has('renamed.png'), true); assert.equal((await readMediaMetadata(f.images)).images['renamed.png'].description, 'a picture'); assert.equal(context.articleRef.current.source, source);
});
