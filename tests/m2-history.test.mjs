import assert from 'node:assert/strict';
import test from 'node:test';

const { createArticleSource } = await import('../src/lib/frontMatter.ts');
const { changedThemeSnapshotFields, createArticleSnapshot, listArticleHistory, setArticleSnapshotRetained } = await import('../src/lib/articleHistory.ts');
const { saveStoredArticle } = await import('../src/lib/fileSystem.ts');
const { getTheme } = await import('../src/lib/themes.ts');

function createMemoryRoot(name = 'history-test-root') {
  const state = { writes: [], failCloseSuffix: null };
  const makeDirectory = (directoryName, parentPath = '') => {
    const path = parentPath ? `${parentPath}/${directoryName}` : directoryName;
    const directory = { kind: 'directory', name: directoryName, path, children: new Map() };
    directory.queryPermission = async () => 'granted';
    directory.requestPermission = async () => 'granted';
    directory.getDirectoryHandle = async (childName, options = {}) => {
      let child = directory.children.get(childName);
      if (!child && options.create) {
        child = makeDirectory(childName, path);
        directory.children.set(childName, child);
      }
      if (!child) throw new DOMException(`missing directory: ${childName}`, 'NotFoundError');
      if (child.kind !== 'directory') throw new DOMException(`${childName} is not a directory`, 'TypeMismatchError');
      return child;
    };
    directory.getFileHandle = async (childName, options = {}) => {
      let child = directory.children.get(childName);
      if (!child && options.create) {
        const filePath = `${path}/${childName}`;
        child = { kind: 'file', name: childName, path: filePath, content: '' };
        child.getFile = async () => {
          const content = child.content;
          const bytes = new TextEncoder().encode(content);
          return { name: childName, size: bytes.length, text: async () => content, arrayBuffer: async () => bytes.slice().buffer };
        };
        child.createWritable = async () => {
          let pending = '';
          return {
            write: async (content) => { pending = typeof content === 'string' ? content : new TextDecoder().decode(content); },
            close: async () => {
              if (state.failCloseSuffix && filePath.endsWith(state.failCloseSuffix)) {
                state.failCloseSuffix = null;
                throw new DOMException('injected close failure', 'UnknownError');
              }
              child.content = pending;
              state.writes.push(filePath);
            },
            abort: async () => {},
          };
        };
        directory.children.set(childName, child);
      }
      if (!child) throw new DOMException(`missing file: ${childName}`, 'NotFoundError');
      if (child.kind !== 'file') throw new DOMException(`${childName} is not a file`, 'TypeMismatchError');
      return child;
    };
    directory.removeEntry = async (childName, options = {}) => {
      const child = directory.children.get(childName);
      if (!child) throw new DOMException(`missing entry: ${childName}`, 'NotFoundError');
      if (child.kind === 'directory' && child.children.size && !options.recursive) throw new DOMException('directory is not empty', 'InvalidModificationError');
      directory.children.delete(childName);
    };
    directory.entries = async function* entries() { for (const entry of directory.children) yield entry; };
    return directory;
  };
  const root = makeDirectory(name);
  root.state = state;
  return root;
}

test('history comparison detects theme content changes even when name and version match', () => {
  const previous = {
    id: 'rainy', name: 'Rainy', version: '1.0.0', formatVersion: 1,
    tokens: { accent: '#0a7780', ink: '#243b44' }, css: '.article-preview { color: #243b44; }',
  };
  const sameContent = {
    ...previous,
    tokens: { ink: '#243b44', accent: '#0a7780' },
  };
  const changedContent = {
    ...sameContent,
    tokens: { ...sameContent.tokens, accent: '#536d3e' },
    css: '.article-preview { color: #536d3e; }',
  };

  assert.deepEqual(changedThemeSnapshotFields(previous, sameContent), []);
  assert.deepEqual(changedThemeSnapshotFields(previous, changedContent), ['自定义 CSS', '排印 Token']);
});

test('history snapshots round-trip full article source and the matching theme snapshot', async () => {
  const root = createMemoryRoot();
  const theme = getTheme('basic');
  const source = `${createArticleSource('原稿', theme.id)}\n# historical body\n\n![cover](media/image/cover.png)\n`;
  const saved = await saveStoredArticle(root, source, theme);

  const created = await createArticleSnapshot(root, saved.article.month, saved.article.folder, source, theme, {
    id: 'snapshot-20260923-120000-0001',
    kind: 'manual',
    now: () => new Date('2026-09-23T12:00:00.000Z'),
  });
  const listed = await listArticleHistory(root, saved.article.month, saved.article.folder);

  assert.equal(created.created, true);
  assert.equal(listed.issues.length, 0);
  assert.equal(listed.snapshots.length, 1);
  assert.equal(listed.snapshots[0].id, created.snapshot.id);
  assert.equal(listed.snapshots[0].source, source);
  assert.deepEqual(listed.snapshots[0].theme, theme);
  assert.equal(listed.snapshots[0].createdAt, '2026-09-23T12:00:00.000Z');
  assert.equal(listed.snapshots[0].kind, 'manual');
  assert.equal(listed.snapshots[0].retained, true);
});

test('automatic snapshots do not write duplicates when article and theme are unchanged', async () => {
  const root = createMemoryRoot();
  const theme = getTheme('basic');
  const source = `${createArticleSource('无变化原稿', theme.id)}\n# same revision\n`;
  const saved = await saveStoredArticle(root, source, theme);
  const first = await createArticleSnapshot(root, saved.article.month, saved.article.folder, source, theme, {
    id: 'snapshot-20260923-120000-0001',
    kind: 'automatic',
    now: () => new Date('2026-09-23T12:00:00.000Z'),
  });
  const writesBeforeDuplicate = root.state.writes.length;

  const duplicate = await createArticleSnapshot(root, saved.article.month, saved.article.folder, source, theme, {
    id: 'snapshot-20260923-123000-0002',
    kind: 'automatic',
    now: () => new Date('2026-09-23T12:30:00.000Z'),
  });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.snapshot.id, first.snapshot.id);
  assert.equal(root.state.writes.length, writesBeforeDuplicate);
  assert.equal((await listArticleHistory(root, saved.article.month, saved.article.folder)).snapshots.length, 1);
});

test('manual important snapshots stay distinct and protected even when content matches an automatic snapshot', async () => {
  const root = createMemoryRoot();
  const theme = getTheme('basic');
  const source = `${createArticleSource('重要版本', theme.id)}\n# same bytes\n`;
  const saved = await saveStoredArticle(root, source, theme);
  const automatic = await createArticleSnapshot(root, saved.article.month, saved.article.folder, source, theme, {
    id: 'snapshot-20260923-121000-auto', kind: 'automatic',
  });
  const manual = await createArticleSnapshot(root, saved.article.month, saved.article.folder, source, theme, {
    id: 'snapshot-20260923-122000-manual', kind: 'manual',
  });

  assert.equal(automatic.created, true);
  assert.equal(manual.created, true);
  assert.equal(manual.snapshot.retained, true);
  assert.equal((await listArticleHistory(root, saved.article.month, saved.article.folder)).snapshots.length, 2);
});

test('automatic retention deletes only old unprotected snapshots and leaves manual/unknown data alone', async () => {
  const root = createMemoryRoot();
  const theme = getTheme('basic');
  const sourceFor = (body) => `${createArticleSource('保留测试', theme.id)}\n${body}\n`;
  const saved = await saveStoredArticle(root, sourceFor('base'), theme);
  const make = (id, body, kind, time, retained, maxAutoSnapshots) => createArticleSnapshot(
    root,
    saved.article.month,
    saved.article.folder,
    sourceFor(body),
    theme,
    { id, kind, retained, maxAutoSnapshots, now: () => new Date(time) },
  );

  await make('snapshot-20260923-120000-0001', 'auto one', 'automatic', '2026-09-23T12:00:00.000Z', false, 1);
  await make('snapshot-20260923-121000-0002', 'pinned auto', 'automatic', '2026-09-23T12:10:00.000Z', true, 1);
  await make('snapshot-20260923-122000-0003', 'manual', 'manual', '2026-09-23T12:20:00.000Z', false, 1);
  const articles = await root.getDirectoryHandle('articles');
  const month = await articles.getDirectoryHandle(saved.article.month);
  const article = await month.getDirectoryHandle(saved.article.folder);
  const history = await article.getDirectoryHandle('history');
  const unmanaged = await history.getDirectoryHandle('unmanaged', { create: true });
  (await unmanaged.getFileHandle('keep.txt', { create: true })).content = 'not ours';

  await make('snapshot-20260923-123000-0004', 'auto four', 'automatic', '2026-09-23T12:30:00.000Z', false, 1);
  const listed = await listArticleHistory(root, saved.article.month, saved.article.folder);

  assert.deepEqual(listed.snapshots.map((item) => item.id).sort(), [
    'snapshot-20260923-121000-0002',
    'snapshot-20260923-122000-0003',
    'snapshot-20260923-123000-0004',
  ].sort());
  assert.equal(await (await unmanaged.getFileHandle('keep.txt')).getFile().then((file) => file.text()), 'not ours');
  await assert.rejects(() => history.getDirectoryHandle('snapshot-20260923-120000-0001'));
});

test('an interrupted snapshot write removes the incomplete directory and never exposes a partial revision', async () => {
  const root = createMemoryRoot();
  const theme = getTheme('basic');
  const source = `${createArticleSource('安全快照', theme.id)}\n# intact source\n`;
  const saved = await saveStoredArticle(root, source, theme);
  root.state.failCloseSuffix = '/theme.json';

  await assert.rejects(() => createArticleSnapshot(root, saved.article.month, saved.article.folder, source, theme, {
    id: 'snapshot-20260923-130000-failed',
    kind: 'automatic',
  }), /快照写入失败/);
  const listed = await listArticleHistory(root, saved.article.month, saved.article.folder);
  assert.deepEqual(listed.snapshots, []);
  assert.deepEqual(listed.issues, []);
  assert.equal((await listStoredArticleSource(root, saved.article.month, saved.article.folder)), source);
});

test('automatic snapshot protection can be toggled transactionally; manual snapshots stay protected', async () => {
  const root = createMemoryRoot();
  const theme = getTheme('basic');
  const source = `${createArticleSource('保护切换', theme.id)}\n# protected\n`;
  const saved = await saveStoredArticle(root, source, theme);
  const automatic = await createArticleSnapshot(root, saved.article.month, saved.article.folder, source, theme, {
    id: 'snapshot-20260923-140000-auto', kind: 'automatic',
  });
  const manual = await createArticleSnapshot(root, saved.article.month, saved.article.folder, `${source}\nmanual`, theme, {
    id: 'snapshot-20260923-140100-manual', kind: 'manual',
  });

  const protectedSnapshot = await setArticleSnapshotRetained(root, saved.article.month, saved.article.folder, automatic.snapshot.id, true);
  assert.equal(protectedSnapshot.retained, true);
  const unprotectedSnapshot = await setArticleSnapshotRetained(root, saved.article.month, saved.article.folder, automatic.snapshot.id, false);
  assert.equal(unprotectedSnapshot.retained, false);
  assert.equal((await listArticleHistory(root, saved.article.month, saved.article.folder)).snapshots.find((item) => item.id === manual.snapshot.id)?.retained, true);
  await assert.rejects(() => setArticleSnapshotRetained(root, saved.article.month, saved.article.folder, manual.snapshot.id, false), /始终受保护/);
});

test('failed protection update preserves the original manifest and snapshot readability', async () => {
  const root = createMemoryRoot();
  const theme = getTheme('basic');
  const source = `${createArticleSource('保护失败', theme.id)}\n# intact\n`;
  const saved = await saveStoredArticle(root, source, theme);
  const automatic = await createArticleSnapshot(root, saved.article.month, saved.article.folder, source, theme, {
    id: 'snapshot-20260923-150000-auto', kind: 'automatic',
  });
  root.state.failCloseSuffix = '/snapshot.json';

  await assert.rejects(() => setArticleSnapshotRetained(root, saved.article.month, saved.article.folder, automatic.snapshot.id, true), /原状态未改动/);
  const listed = await listArticleHistory(root, saved.article.month, saved.article.folder);
  assert.equal(listed.snapshots.length, 1);
  assert.equal(listed.snapshots[0].retained, false);
  assert.equal(listed.snapshots[0].source, source);
});

async function listStoredArticleSource(root, month, folder) {
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(month);
  const articleDirectory = await monthDirectory.getDirectoryHandle(folder);
  return (await (await articleDirectory.getFileHandle('article.md')).getFile()).text();
}
