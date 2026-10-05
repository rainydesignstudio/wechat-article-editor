import assert from 'node:assert/strict';
import test from 'node:test';

const { DEFAULT_ARTICLE_SETTINGS, loadArticleSettings, saveArticleSettings } = await import('../src/lib/articleSettings.ts');

class MemoryFileHandle {
  kind = 'file';

  constructor(name, root, content = '') {
    this.name = name;
    this.root = root;
    this.content = content;
  }

  async getFile() {
    const content = this.content;
    const bytes = new TextEncoder().encode(content);
    return {
      text: async () => content,
      arrayBuffer: async () => bytes.slice().buffer,
    };
  }

  async createWritable() {
    let pending = '';
    return {
      write: async (content) => { pending = String(content); },
      close: async () => {
        if (this.root.failCloseFor === this.name) {
          this.root.failCloseFor = null;
          throw new DOMException('injected close failure', 'UnknownError');
        }
        this.content = pending;
        this.root.writes.push(this.name);
      },
      abort: async () => {},
    };
  }
}

class MemoryDirectoryHandle {
  kind = 'directory';

  constructor(name, root = this) {
    this.name = name;
    this.root = root;
    this.children = new Map();
    if (root === this) {
      this.failCloseFor = null;
      this.writes = [];
    }
  }

  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }

  async getDirectoryHandle(name, options = {}) {
    let entry = this.children.get(name);
    if (!entry && options.create) {
      entry = new MemoryDirectoryHandle(name, this.root);
      this.children.set(name, entry);
    }
    if (!entry) throw new DOMException(`missing directory: ${name}`, 'NotFoundError');
    if (entry.kind !== 'directory') throw new DOMException(`${name} is not a directory`, 'TypeMismatchError');
    return entry;
  }

  async getFileHandle(name, options = {}) {
    let entry = this.children.get(name);
    if (!entry && options.create) {
      entry = new MemoryFileHandle(name, this.root);
      this.children.set(name, entry);
    }
    if (!entry) throw new DOMException(`missing file: ${name}`, 'NotFoundError');
    if (entry.kind !== 'file') throw new DOMException(`${name} is not a file`, 'TypeMismatchError');
    return entry;
  }

  async removeEntry(name, options = {}) {
    const entry = this.children.get(name);
    if (!entry) throw new DOMException(`missing entry: ${name}`, 'NotFoundError');
    if (entry.kind === 'directory' && entry.children.size && !options.recursive) {
      throw new DOMException('directory is not empty', 'InvalidModificationError');
    }
    this.children.delete(name);
  }

  async *entries() {
    for (const entry of this.children) yield entry;
  }
}

async function readText(root, name) {
  return (await (await root.getFileHandle(name)).getFile()).text();
}

test('missing settings load the defaults without creating data/settings.json', async () => {
  const root = new MemoryDirectoryHandle('settings-test-root');

  const loaded = await loadArticleSettings(root);

  assert.deepEqual(loaded.settings, DEFAULT_ARTICLE_SETTINGS);
  assert.equal(loaded.issue, null);
  assert.equal(loaded.fileExists, false);
  assert.deepEqual(root.writes, []);
  await assert.rejects(() => root.getFileHandle('settings.json'));
});

test('settings save and reload preserve independent switches, intervals, and retention', async () => {
  const root = new MemoryDirectoryHandle('settings-test-root');
  const settings = {
    version: 1,
    autoSave: { enabled: false, intervalSeconds: 90 },
    autoSnapshot: { enabled: true, intervalMinutes: 45, maxCount: 12 },
  };

  await saveArticleSettings(root, settings);
  const loaded = await loadArticleSettings(root);

  assert.deepEqual(loaded.settings, { ...settings, defaultArticleThemeId: null });
  assert.equal(loaded.issue, null);
  assert.equal(loaded.fileExists, true);
  assert.equal(root.writes.filter((name) => name === 'settings.json').length, 1);
});

test('article theme default persists while older settings without it still load', async () => {
  const root = new MemoryDirectoryHandle('article-theme-default');
  const legacy = await root.getFileHandle('settings.json', { create: true });
  legacy.content = JSON.stringify({ version: 1, autoSave: { enabled: true, intervalSeconds: 60 }, autoSnapshot: { enabled: true, intervalMinutes: 30, maxCount: 20 } });
  assert.equal((await loadArticleSettings(root)).settings.defaultArticleThemeId, null);
  const saved = await saveArticleSettings(root, { ...DEFAULT_ARTICLE_SETTINGS, defaultArticleThemeId: 'rainy' });
  assert.equal(saved.defaultArticleThemeId, 'rainy');
  assert.equal((await loadArticleSettings(root)).settings.defaultArticleThemeId, 'rainy');
});

test('malformed settings are diagnosed and left untouched by loading', async () => {
  const root = new MemoryDirectoryHandle('settings-test-root');
  const handle = await root.getFileHandle('settings.json', { create: true });
  handle.content = '{ invalid settings';
  const before = handle.content;

  const loaded = await loadArticleSettings(root);

  assert.deepEqual(loaded.settings, DEFAULT_ARTICLE_SETTINGS);
  assert.match(loaded.issue, /settings\.json/);
  assert.equal(loaded.fileExists, true);
  assert.equal(handle.content, before);
  assert.deepEqual(root.writes, []);
});

test('invalid setting values are rejected before writing', async () => {
  const root = new MemoryDirectoryHandle('settings-test-root');
  const settings = structuredClone(DEFAULT_ARTICLE_SETTINGS);
  settings.autoSave.intervalSeconds = 0;

  await assert.rejects(() => saveArticleSettings(root, settings), /间隔/);
  assert.deepEqual(root.writes, []);
  await assert.rejects(() => root.getFileHandle('settings.json'));
});

test('a failed settings replacement preserves the previous complete file', async () => {
  const root = new MemoryDirectoryHandle('settings-test-root');
  const original = await root.getFileHandle('settings.json', { create: true });
  original.content = JSON.stringify(DEFAULT_ARTICLE_SETTINGS);
  root.failCloseFor = 'settings.json';
  const next = structuredClone(DEFAULT_ARTICLE_SETTINGS);
  next.autoSave.intervalSeconds = 120;

  await assert.rejects(() => saveArticleSettings(root, next), /settings\.json 保存失败/);

  assert.equal(await readText(root, 'settings.json'), JSON.stringify(DEFAULT_ARTICLE_SETTINGS));
  assert.deepEqual(root.writes, []);
});
