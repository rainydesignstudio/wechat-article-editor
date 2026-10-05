import assert from 'node:assert/strict';
import test from 'node:test';

const { createArticleSource: createBaseArticleSource, updateFrontMatter } = await import('../src/lib/frontMatter.ts');
const { assertExistingDataDirectory, copyStoredArticle, createNamedDataDirectory, deleteStoredArticle, listStoredArticles, renameStoredArticle, saveStoredArticle } = await import('../src/lib/fileSystem.ts');
const { createArticleMutationQueue } = await import('../src/lib/articleMutationQueue.ts');
const { getTheme } = await import('../src/lib/themes.ts');
const createArticleSource = (title, id) => updateFrontMatter(createBaseArticleSource(title, id), { theme: { id, version: getTheme(id).version } });

class MemoryFileHandle {
  kind = 'file';

  constructor(name) {
    this.name = name;
    this.content = '';
  }

  async getFile() {
    const content = this.content;
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
    return {
      text: async () => typeof content === 'string' ? content : new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.slice().buffer,
    };
  }

  async createWritable() {
    return {
      write: async (content) => { this.content = typeof content === 'string' ? content : new TextDecoder().decode(content); },
      close: async () => {},
    };
  }
}

class MemoryDirectoryHandle {
  kind = 'directory';

  constructor(name) {
    this.name = name;
    this.children = new Map();
  }

  async getDirectoryHandle(name, options = {}) {
    const current = this.children.get(name);
    if (current) {
      if (current.kind !== 'directory') throw new DOMException(`${name} is not a directory`, 'TypeMismatchError');
      return current;
    }
    if (!options.create) throw new DOMException(`missing directory: ${name}`, 'NotFoundError');
    const created = new MemoryDirectoryHandle(name);
    this.children.set(name, created);
    return created;
  }

  async getFileHandle(name, options = {}) {
    const current = this.children.get(name);
    if (current) {
      if (current.kind !== 'file') throw new DOMException(`${name} is not a file`, 'TypeMismatchError');
      return current;
    }
    if (!options.create) throw new DOMException(`missing file: ${name}`, 'NotFoundError');
    const created = new MemoryFileHandle(name);
    this.children.set(name, created);
    return created;
  }

  async removeEntry(name, options = {}) {
    const current = this.children.get(name);
    if (!current) throw new DOMException(`missing entry: ${name}`, 'NotFoundError');
    if (current.kind === 'directory' && current.children.size > 0 && !options.recursive) throw new DOMException('directory is not empty', 'InvalidModificationError');
    this.children.delete(name);
  }

  async *entries() {
    for (const entry of this.children) yield entry;
  }
}

async function seedArticle(root, title = '原稿') {
  return saveStoredArticle(root, `${createArticleSource(title, 'basic')}# full body\n`, getTheme('basic'));
}

async function readText(directory, name) {
  return (await (await directory.getFileHandle(name)).getFile()).text();
}

test('new library stays inside its named child and existing libraries reopen without wrapping', async () => {
  const parent = new MemoryDirectoryHandle('drive-root');
  await assert.rejects(assertExistingDataDirectory(parent), /不是完整的资料库/);
  const library = await createNamedDataDirectory(parent, '我的文稿');
  assert.deepEqual([...parent.children.keys()], ['我的文稿']);
  assert.deepEqual([...library.children.keys()], ['themes', 'snippets', 'templates', 'articles', 'format']);
  await assertExistingDataDirectory(library);
  await assert.rejects(createNamedDataDirectory(parent, '我的文稿'), /已有/);
  assert.deepEqual([...parent.children.keys()], ['我的文稿']);
});

test('failed library initialization removes only the newly created child', async () => {
  const parent = new MemoryDirectoryHandle('drive-root');
  const originalGetDirectoryHandle = parent.getDirectoryHandle.bind(parent);
  parent.getDirectoryHandle = async (name, options) => {
    const child = await originalGetDirectoryHandle(name, options);
    if (name === 'new-library') {
      const originalChildGet = child.getDirectoryHandle.bind(child);
      child.getDirectoryHandle = (part, childOptions) => part === 'templates'
        ? Promise.reject(new Error('permission revoked'))
        : originalChildGet(part, childOptions);
    }
    return child;
  };
  await assert.rejects(createNamedDataDirectory(parent, 'new-library'), /permission revoked/);
  assert.deepEqual([...parent.children.keys()], []);
});

test('rollback keeps a new folder if another file appears during initialization', async () => {
  const parent = new MemoryDirectoryHandle('drive-root');
  const originalGetDirectoryHandle = parent.getDirectoryHandle.bind(parent);
  parent.getDirectoryHandle = async (name, options) => {
    const child = await originalGetDirectoryHandle(name, options);
    if (name === 'shared') {
      const originalChildGet = child.getDirectoryHandle.bind(child);
      child.getDirectoryHandle = async (part, childOptions) => {
        if (part === 'templates') {
          await child.getFileHandle('keep.txt', { create: true });
          throw new Error('initialization failed');
        }
        return originalChildGet(part, childOptions);
      };
    }
    return child;
  };
  await assert.rejects(createNamedDataDirectory(parent, 'shared'), /出现其他内容，未自动清理/);
  const shared = await parent.getDirectoryHandle('shared');
  assert.equal((await shared.getFileHandle('keep.txt')).name, 'keep.txt');
});

test('permission denial and invalid names never create a library folder', async () => {
  const parent = new MemoryDirectoryHandle('drive-root');
  parent.queryPermission = async () => 'denied';
  parent.requestPermission = async () => 'denied';
  await assert.rejects(createNamedDataDirectory(parent, '文章库'), /没有读写权限/);
  assert.deepEqual([...parent.children.keys()], []);
  delete parent.queryPermission;
  delete parent.requestPermission;
  await assert.rejects(createNamedDataDirectory(parent, '../article'), /名称/);
  assert.deepEqual([...parent.children.keys()], []);
});

test('a directory appearing during creation is never initialized or removed', async () => {
  const parent = new MemoryDirectoryHandle('drive-root');
  const originalGetDirectoryHandle = parent.getDirectoryHandle.bind(parent);
  parent.getDirectoryHandle = async (name, options) => {
    const child = await originalGetDirectoryHandle(name, options);
    await child.getFileHandle('keep.txt', { create: true });
    return child;
  };
  await assert.rejects(createNamedDataDirectory(parent, 'shared'), /没有修改该目录/);
  const shared = await parent.getDirectoryHandle('shared');
  assert.deepEqual([...shared.children.keys()], ['keep.txt']);
});

test('copy creates an independent article with snapshot and media but no old history', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const original = await seedArticle(root, '原稿');
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(original.article.month);
  const sourceDirectory = await monthDirectory.getDirectoryHandle(original.article.folder);
  const media = await sourceDirectory.getDirectoryHandle('media', { create: true });
  const nested = await media.getDirectoryHandle('nested', { create: true });
  (await nested.getFileHandle('cover.txt', { create: true })).content = 'media bytes';
  const history = await sourceDirectory.getDirectoryHandle('history', { create: true });
  (await history.getFileHandle('old.md', { create: true })).content = 'old revision';
  let mediaEnumerations = 0;
  const mediaEntries = media.entries.bind(media);
  media.entries = async function* entries() { mediaEnumerations += 1; yield* mediaEntries(); };
  history.entries = async function* entries() { throw new Error('history must never be scanned'); };
  assert.equal((await listStoredArticles(root)).length, 1);
  assert.equal(mediaEnumerations, 0);
  const originalSource = await readText(sourceDirectory, 'article.md');
  const originalTheme = await readText(sourceDirectory, 'theme.json');

  const copied = await copyStoredArticle(root, original.article.month, original.article.folder, '独立副本');
  const destination = await (await articles.getDirectoryHandle(copied.article.month)).getDirectoryHandle(copied.article.folder);
  const copiedMedia = await (await destination.getDirectoryHandle('media')).getDirectoryHandle('nested');

  assert.notEqual(copied.article.id, original.article.id);
  assert.equal(copied.article.parse.metadata.title, '独立副本');
  assert.match(await readText(destination, 'article.md'), /# full body/);
  assert.equal(await readText(destination, 'theme.json'), originalTheme);
  assert.equal(await readText(copiedMedia, 'cover.txt'), 'media bytes');
  await assert.rejects(() => destination.getDirectoryHandle('history'));
  assert.equal(await readText(sourceDirectory, 'article.md'), originalSource);
  assert.equal(await readText(sourceDirectory, 'theme.json'), originalTheme);
  assert.equal(mediaEnumerations, 1);
  assert.equal(copied.indexUpdated, true);
  const index = JSON.parse(await readText(await articles.getDirectoryHandle(copied.article.month), 'index.json'));
  assert.equal(index[copied.article.folder].title, '独立副本');
});

test('copy allows a source article with no media directory', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const original = await seedArticle(root, '无素材原稿');

  const copied = await copyStoredArticle(root, original.article.month, original.article.folder, '无素材副本');
  const articles = await root.getDirectoryHandle('articles');
  const destination = await (await articles.getDirectoryHandle(copied.article.month)).getDirectoryHandle(copied.article.folder);

  assert.equal(copied.article.parse.metadata.title, '无素材副本');
  await assert.rejects(() => destination.getDirectoryHandle('media'));
});

test('copy reports name collisions and treats another month as a new copy', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const original = await seedArticle(root, '原稿');
  const first = await copyStoredArticle(root, original.article.month, original.article.folder, '同名副本');
  const second = await copyStoredArticle(root, original.article.month, original.article.folder, '同名副本');
  const movedMonthCopy = await copyStoredArticle(root, original.article.month, original.article.folder, '跨月副本', '2024-02');

  assert.equal(first.folderCollision, false);
  assert.equal(second.folderCollision, true);
  assert.equal(second.article.folder, '同名副本-2');
  assert.equal(movedMonthCopy.article.month, '2024-02');
  assert.equal(original.article.month !== movedMonthCopy.article.month, true);
});

test('malformed Front Matter stays visible without hiding healthy siblings', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const theme = getTheme('basic');
  const malformed = await saveStoredArticle(root, '---\ntitle: [broken\n---\n# Keep visible', theme);
  const healthy = await seedArticle(root, '健康文章');
  const listed = await listStoredArticles(root);

  assert.equal(listed.length, 2);
  assert.equal(listed.some((item) => item.id === malformed.article.id && item.parse.diagnostics.some((entry) => entry.level === 'error')), true);
  assert.equal(listed.some((item) => item.id === healthy.article.id && item.parse.metadata.title === '健康文章'), true);
});

test('copy rebuilds a damaged month index while retaining the completed copy', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const original = await seedArticle(root, '索引原稿');
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(original.article.month);
  (await monthDirectory.getFileHandle('index.json')).content = '{ broken';

  const copied = await copyStoredArticle(root, original.article.month, original.article.folder, '索引副本');
  const index = JSON.parse(await readText(monthDirectory, 'index.json'));

  assert.equal(copied.indexUpdated, true);
  assert.match(copied.indexError, /重建/);
  assert.equal(index[original.article.folder].title, '索引原稿');
  assert.equal(index[copied.article.folder].title, '索引副本');
});

test('display rename keeps the physical folder; delete removes the selected tree and index entry', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const original = await seedArticle(root, '固定目录');
  const renamed = await renameStoredArticle(root, original.article.month, original.article.folder, '只改显示标题');
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(original.article.month);
  assert.equal(renamed.article.folder, original.article.folder);
  assert.equal(renamed.article.parse.metadata.title, '只改显示标题');
  assert.deepEqual([...monthDirectory.children.keys()].filter((key) => key !== 'index.json'), [original.article.folder]);

  const articleDirectory = await monthDirectory.getDirectoryHandle(original.article.folder);
  const media = await articleDirectory.getDirectoryHandle('media', { create: true });
  (await media.getFileHandle('image.png', { create: true })).content = 'image';
  const history = await articleDirectory.getDirectoryHandle('history', { create: true });
  (await history.getFileHandle('old.md', { create: true })).content = 'revision';
  const deleted = await deleteStoredArticle(root, original.article.month, original.article.folder);
  assert.equal(deleted.indexUpdated, true);
  await assert.rejects(() => monthDirectory.getDirectoryHandle(original.article.folder));
  assert.deepEqual(await listStoredArticles(root), []);
  assert.deepEqual(JSON.parse(await readText(monthDirectory, 'index.json')), {});
});

test('invalid source and unsafe paths cannot be copied or deleted', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const original = await seedArticle(root, '原稿');
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(original.article.month);
  const sourceDirectory = await monthDirectory.getDirectoryHandle(original.article.folder);
  const sourceFile = await sourceDirectory.getFileHandle('article.md');
  sourceFile.content = '---\ntitle: [broken\n---\n# Preserve';
  const damagedSource = sourceFile.content;

  await assert.rejects(() => copyStoredArticle(root, original.article.month, original.article.folder, '不能复制'), /Front Matter/);
  await assert.rejects(() => deleteStoredArticle(root, original.article.month, '../outside'), /不安全/);
  assert.equal(sourceFile.content, damagedSource);
  assert.equal((await listStoredArticles(root)).length, 1);
});

test('copy failure removes only the partial destination and preserves the source', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const original = await seedArticle(root, '原稿');
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(original.article.month);
  const sourceDirectory = await monthDirectory.getDirectoryHandle(original.article.folder);
  const media = await sourceDirectory.getDirectoryHandle('media', { create: true });
  media.entries = async function* entries() { yield ['unreadable.bin', { kind: 'file' }]; };
  media.getFileHandle = async () => ({ getFile: async () => { throw new Error('synthetic media read failure'); } });
  const originalSource = await readText(sourceDirectory, 'article.md');

  await assert.rejects(() => copyStoredArticle(root, original.article.month, original.article.folder, '部分副本'), /复制本地素材失败/);
  assert.equal(await readText(sourceDirectory, 'article.md'), originalSource);
  await assert.rejects(() => monthDirectory.getDirectoryHandle('部分副本'));
  assert.equal((await listStoredArticles(root)).length, 1);
});

test('a disappearing nested media file fails the copy and rolls back its partial destination', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const original = await seedArticle(root, '素材原稿');
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(original.article.month);
  const sourceDirectory = await monthDirectory.getDirectoryHandle(original.article.folder);
  const media = await sourceDirectory.getDirectoryHandle('media', { create: true });
  const nested = await media.getDirectoryHandle('nested', { create: true });
  const originalFile = await nested.getFileHandle('cover.png', { create: true });
  originalFile.content = 'source-image-bytes';
  const getFileHandle = nested.getFileHandle.bind(nested);
  nested.getFileHandle = async (name, options) => {
    if (name === 'cover.png' && !options?.create) {
      throw new DOMException('media file disappeared during copy', 'NotFoundError');
    }
    return getFileHandle(name, options);
  };
  const originalSource = await readText(sourceDirectory, 'article.md');

  await assert.rejects(
    () => copyStoredArticle(root, original.article.month, original.article.folder, '部分素材副本'),
    /复制本地素材失败/,
  );

  assert.equal(originalFile.content, 'source-image-bytes');
  assert.equal(await readText(sourceDirectory, 'article.md'), originalSource);
  await assert.rejects(() => monthDirectory.getDirectoryHandle('部分素材副本'));
  assert.equal((await listStoredArticles(root)).length, 1);
});

test('editing and saving while a queued delete is in flight cannot recreate the deleted document', async () => {
  const root = new MemoryDirectoryHandle('isolated-test-data');
  const original = await seedArticle(root, '不会复活的原稿');
  const queue = createArticleMutationQueue();
  const oldDocument = queue.openDocument(root, original.article.id);
  let announcePredecessor;
  let releasePredecessor;
  let announceDeleteStart;
  let releaseDelete;
  const predecessorStarted = new Promise((resolve) => { announcePredecessor = resolve; });
  const predecessorGate = new Promise((resolve) => { releasePredecessor = resolve; });
  const deleteStarted = new Promise((resolve) => { announceDeleteStart = resolve; });
  const deleteGate = new Promise((resolve) => { releaseDelete = resolve; });

  const predecessor = queue.run(async () => {
    announcePredecessor();
    await predecessorGate;
  });
  await predecessorStarted;
  const deleteTicket = queue.beginDelete(root, original.article.id);
  assert.ok(deleteTicket);
  const deletion = queue.run(async () => {
    announceDeleteStart();
    await deleteGate;
    await deleteStoredArticle(root, original.article.month, original.article.folder);
    queue.finishDelete(deleteTicket);
  });

  releasePredecessor();
  await deleteStarted;
  const editedSource = original.article.source.replace('不会复活的原稿', '排队期间编辑的原稿');
  const staleSave = queue.run(async () => {
    if (!queue.canSave(oldDocument)) return false;
    await saveStoredArticle(root, editedSource, original.article.theme, original.article.folder, original.article.month);
    return true;
  });

  releaseDelete();
  await Promise.all([predecessor, deletion]);
  assert.equal(await staleSave, false);
  assert.deepEqual(await listStoredArticles(root), []);

  const independentDocument = queue.openDocument(root, original.article.id);
  assert.equal(await queue.run(async () => {
    if (!queue.canSave(independentDocument)) return false;
    await saveStoredArticle(root, original.article.source, original.article.theme, original.article.folder, original.article.month);
    return true;
  }), true);
  assert.equal((await listStoredArticles(root)).length, 1);
});

test('same-named documents in separate roots stay independent and a failed delete restores saving', async () => {
  const rootA = new MemoryDirectoryHandle('root-A');
  const rootB = new MemoryDirectoryHandle('root-B');
  const articleA = await seedArticle(rootA, '同名文章');
  const articleB = await seedArticle(rootB, '同名文章');
  const queue = createArticleMutationQueue();
  const documentA = queue.openDocument(rootA, articleA.article.id);
  const documentB = queue.openDocument(rootB, articleB.article.id);

  assert.ok(documentA);
  assert.ok(documentB);
  assert.equal(articleA.article.id, articleB.article.id);
  const failedDelete = queue.beginDelete(rootA, articleA.article.id);
  assert.ok(failedDelete);
  assert.equal(queue.isDeleting(rootA, articleA.article.id), true);
  assert.equal(queue.isDeleting(rootB, articleB.article.id), false);
  assert.equal(queue.canSave(documentB), true);
  assert.equal(queue.canSave(documentA), false);
  queue.failDelete(failedDelete);
  assert.equal(queue.canSave(documentA), true);

  const otherRootSave = await queue.run(async () => {
    if (!queue.canSave(documentB)) return false;
    await saveStoredArticle(rootB, articleB.article.source, articleB.article.theme, articleB.article.folder, articleB.article.month);
    return true;
  });
  assert.equal(otherRootSave, true);
  assert.equal((await listStoredArticles(rootA)).length, 1);
  assert.equal((await listStoredArticles(rootB)).length, 1);
});
