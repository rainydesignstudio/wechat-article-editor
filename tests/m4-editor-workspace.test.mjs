import assert from 'node:assert/strict';
import test from 'node:test';

const {
  EDITOR_WORKSPACE_FILE,
  LEGACY_EDITOR_WORKSPACE_FILE,
  createDefaultEditorWorkspace,
  createEditorProject,
  deleteEditorProject,
  loadEditorWorkspace,
  moveArticleToProject,
  orderArticlesForGroup,
  orderEditorProjects,
  replaceEditorAppearanceThemeId,
  setArticleArchived,
  setArticleGroupOrder,
  setArticleProject,
  setEditorProjectPinned,
  saveEditorWorkspace,
  validateEditorWorkspace,
} = await import('../src/lib/editorWorkspace.ts');
const { BUILTIN_EDITOR_THEMES } = await import('../src/lib/editorThemes.ts');
const { loadEditorThemeLibrary, saveEditorTheme, deleteEditorTheme, EDITOR_THEME_DIRECTORY } = await import('../src/lib/editorThemeLibrary.ts');
const { initializeThemeDefaults, copyDefaultThemes } = await import('../src/lib/themeDefaults.ts');
const { loadThemeLibrary } = await import('../src/lib/fileSystem.ts');
const { THEMES } = await import('../src/lib/themes.ts');
const { migrateLegacyEditorAppearance } = await import('../src/lib/editorThemeMigration.ts');
const { loadArticleSettings, saveArticleSettings, DEFAULT_ARTICLE_SETTINGS } = await import('../src/lib/articleSettings.ts');

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
    return { text: async () => content, arrayBuffer: async () => bytes.slice().buffer };
  }

  async createWritable() {
    if (this.root.failOpenFor === this.name) { this.root.failOpenFor = null; throw new Error('injected open failure'); }
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
    if (this.root.failRemoveFor === name) { this.root.failRemoveFor = null; throw new Error('injected removal failure'); }
    const entry = this.children.get(name);
    if (!entry) throw new DOMException(`missing entry: ${name}`, 'NotFoundError');
    if (entry.kind === 'directory' && entry.children.size && !options.recursive) {
      throw new DOMException('directory is not empty', 'InvalidModificationError');
    }
    this.children.delete(name);
  }

  async *entries() { yield* this.children.entries(); }
}

function article(id, updatedAt) {
  return { id, parse: { metadata: { updatedAt } } };
}

test('a missing workspace manifest loads defaults without creating a file', async () => {
  const root = new MemoryDirectoryHandle('workspace-test-root');

  const loaded = await loadEditorWorkspace(root);

  assert.deepEqual(loaded.workspace, createDefaultEditorWorkspace());
  assert.equal(loaded.workspace.appearance.colorMode, 'system');
  assert.equal(loaded.issue, null);
  assert.equal(loaded.fileExists, false);
  assert.deepEqual(root.writes, []);
  await assert.rejects(() => root.getFileHandle(EDITOR_WORKSPACE_FILE));
});

test('workspace manifest saves and reloads projects, order, archive state, and appearance', async () => {
  const root = new MemoryDirectoryHandle('workspace-test-root');
  const initial = await loadEditorWorkspace(root);
  let workspace = createEditorProject(initial.workspace, '采访专题', 'project-interview');
  workspace = setArticleProject(workspace, '2026-09/秋日散步', 'project-interview');
  workspace = setArticleArchived(workspace, '2026-09/秋日散步', true);
  workspace = {
    ...workspace,
    appearance: { themeId: 'linen', colorMode: 'dark', custom: { colorThemeId: 'linen', fontThemeId: 'mist' } },
  };

  const saved = await saveEditorWorkspace(root, workspace, initial);
  const reloaded = await loadEditorWorkspace(root);

  assert.deepEqual(reloaded.workspace, saved.workspace);
  assert.equal(reloaded.issue, null);
  assert.equal(reloaded.fileExists, true);
  assert.deepEqual(root.writes, [EDITOR_WORKSPACE_FILE]);
});

test('unknown or malformed manifest fields stay untouched and block replacement', async () => {
  const root = new MemoryDirectoryHandle('workspace-test-root');
  const file = await root.getFileHandle(LEGACY_EDITOR_WORKSPACE_FILE, { create: true });
  file.content = JSON.stringify({ ...createDefaultEditorWorkspace(), futureField: true });

  const loaded = await loadEditorWorkspace(root);
  const before = file.content;

  assert.match(loaded.issue, /未知字段/);
  await assert.rejects(() => saveEditorWorkspace(root, createDefaultEditorWorkspace(), loaded), /未知字段|没有写入/);
  assert.equal(file.content, before);
  assert.deepEqual(root.writes, []);
});

test('an external manifest change is detected before a stale replacement', async () => {
  const root = new MemoryDirectoryHandle('workspace-test-root');
  const initial = await loadEditorWorkspace(root);
  await saveEditorWorkspace(root, initial.workspace, initial);
  const base = await loadEditorWorkspace(root);
  const file = await root.getFileHandle(EDITOR_WORKSPACE_FILE);
  file.content = JSON.stringify({ ...JSON.parse(file.content), appearance: { ...base.workspace.appearance, themeId: 'mist' } });
  const next = createEditorProject(base.workspace, '新项目', 'project-new');

  await assert.rejects(() => saveEditorWorkspace(root, next, base), /外部变化/);
  assert.match(file.content, /"mist"/);
});

test('failed manifest replacement preserves the previous complete file', async () => {
  const root = new MemoryDirectoryHandle('workspace-test-root');
  const initial = await loadEditorWorkspace(root);
  const first = await saveEditorWorkspace(root, initial.workspace, initial);
  const file = await root.getFileHandle(EDITOR_WORKSPACE_FILE);
  const before = file.content;
  root.failCloseFor = EDITOR_WORKSPACE_FILE;
  const next = createEditorProject(first.workspace, '采访专题', 'project-interview');

  await assert.rejects(() => saveEditorWorkspace(root, next, first), /保存失败/);

  assert.equal(file.content, before);
  assert.deepEqual(root.writes, [EDITOR_WORKSPACE_FILE]);
});

test('manual article order survives edit dates while unlisted external articles stay at the top', () => {
  let workspace = createEditorProject(createDefaultEditorWorkspace(), '项目甲', 'project-a');
  workspace = setArticleGroupOrder(workspace, null, ['2026-09/旧稿', '2026-09/次稿']);
  const ordered = orderArticlesForGroup([
    article('2026-09/旧稿', '2026-09-01'),
    article('2026-09/次稿', '2026-09-02'),
    article('2026-09/新外部稿', '2026-09-20'),
  ], workspace, null);

  assert.deepEqual(ordered.map((item) => item.id), ['2026-09/新外部稿', '2026-09/旧稿', '2026-09/次稿']);
});

test('moving an article changes project metadata only and puts it first in the target order', () => {
  let workspace = createEditorProject(createDefaultEditorWorkspace(), '项目甲', 'project-a');
  workspace = setArticleProject(workspace, '2026-09/文章甲', null);
  workspace = setArticleGroupOrder(workspace, 'project-a', ['2026-09/文章乙']);
  workspace = moveArticleToProject(workspace, '2026-09/文章甲', 'project-a', ['2026-09/文章乙']);

  assert.equal(workspace.articleOrganization['2026-09/文章甲'].projectId, 'project-a');
  assert.deepEqual(workspace.articleOrder['project-a'], ['2026-09/文章甲', '2026-09/文章乙']);
  assert.equal(workspace.articleOrganization['2026-09/文章甲'].archived, false);
});

test('deleting a project returns its articles to unclassified without dropping archive state', () => {
  let workspace = createEditorProject(createDefaultEditorWorkspace(), '项目甲', 'project-a');
  workspace = setArticleProject(workspace, '2026-09/文章甲', 'project-a');
  workspace = setArticleArchived(workspace, '2026-09/文章甲', true);
  workspace = deleteEditorProject(workspace, 'project-a', ['2026-09/文章甲']);

  assert.equal(workspace.projects.length, 0);
  assert.deepEqual(workspace.articleOrganization['2026-09/文章甲'], { projectId: null, archived: true });
  assert.deepEqual(workspace.projectOrder, []);
});

test('pinned projects retain manual pin order and regular projects sort by recent activity', () => {
  let workspace = createDefaultEditorWorkspace();
  workspace = createEditorProject(workspace, '项目甲', 'project-a');
  workspace = createEditorProject(workspace, '项目乙', 'project-b');
  workspace = createEditorProject(workspace, '置顶项目', 'project-pinned');
  workspace = setEditorProjectPinned(workspace, 'project-pinned', true);
  workspace = setArticleProject(workspace, '2026-09/甲', 'project-a');
  workspace = setArticleProject(workspace, '2026-09/乙', 'project-b');

  assert.deepEqual(orderEditorProjects(workspace, [
    { ...article('2026-09/甲', '2026-09-10') },
    { ...article('2026-09/乙', '2026-09-20') },
  ]).map((project) => project.id), ['project-pinned', 'project-b', 'project-a']);
});

test('invalid IDs and unsafe theme choices are rejected', () => {
  const workspace = createDefaultEditorWorkspace();
  assert.throws(() => createEditorProject(workspace, '项目', 'not safe!'), /项目 ID/);
  assert.throws(() => validateEditorWorkspace({ ...workspace, appearance: { ...workspace.appearance, themeId: 'any css' } }), /主题 ID/);
  assert.throws(() => validateEditorWorkspace({ ...workspace, appearance: { ...workspace.appearance, custom: { colorThemeId: 'sea-glass', fontThemeId: 'url(evil)' } } }), /来源 ID/);
});

test('version 1 appearance is read losslessly in memory before an explicit version 2 save', async () => {
  const root = new MemoryDirectoryHandle('workspace-test-root');
  const file = await root.getFileHandle(LEGACY_EDITOR_WORKSPACE_FILE, { create: true });
  const old = {
    ...createDefaultEditorWorkspace(),
    version: 1,
    projects: [{ id: 'project-a', name: '旧项目', pinned: true, collapsed: false }],
    projectOrder: ['project-a'],
    articleOrganization: { '2026-09/旧文': { projectId: 'project-a', archived: true } },
    articleOrder: { 'project-a': ['2026-09/旧文'] },
    appearance: { preset: 'linen', accent: 'berry', font: 'serif', colorMode: 'dark' },
  };
  file.content = JSON.stringify(old);
  const loaded = await loadEditorWorkspace(root);
  assert.equal(loaded.issue, null);
  assert.equal(loaded.workspace.version, 2);
  assert.equal(loaded.workspace.appearance.themeId, 'legacy-linen-berry-serif');
  assert.deepEqual(loaded.legacyAppearance, old.appearance);
  assert.equal(loaded.workspace.articleOrganization['2026-09/旧文'].archived, true);
  assert.equal(file.content, JSON.stringify(old));
  const saved = await saveEditorWorkspace(root, loaded.workspace, loaded);
  assert.equal(saved.workspace.version, 2);
  assert.equal(JSON.parse(file.content).articleOrder['project-a'][0], '2026-09/旧文');
});

test('legacy theme is saved before the workspace changes, and failed workspace writes preserve version 1', async () => {
  const root = new MemoryDirectoryHandle('workspace-test-root');
  const file = await root.getFileHandle(LEGACY_EDITOR_WORKSPACE_FILE, { create: true });
  const old = {
    ...createDefaultEditorWorkspace(), version: 1,
    appearance: { preset: 'linen', accent: 'berry', font: 'serif', colorMode: 'dark' },
  };
  file.content = JSON.stringify(old);
  const loaded = await loadEditorWorkspace(root);
  const library = await loadEditorThemeLibrary(root);
  root.failCloseFor = EDITOR_WORKSPACE_FILE;

  const failed = await migrateLegacyEditorAppearance(root, loaded, library.themes, true);

  assert.match(failed.issue, /迁移未完成/);
  assert.equal(file.content, JSON.stringify(old));
  assert.equal(failed.loaded.workspace.appearance.themeId, 'legacy-linen-berry-serif');
  assert.deepEqual(failed.themes.map(theme => theme.id), ['legacy-linen-berry-serif']);
  const themeDirectory = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('editor-themes');
  assert.equal((await themeDirectory.getFileHandle('legacy-linen-berry-serif.json')).kind, 'file');

  const retried = await migrateLegacyEditorAppearance(root, await loadEditorWorkspace(root), (await loadEditorThemeLibrary(root)).themes, true);
  assert.equal(retried.issue, null);
  assert.equal(JSON.parse(await (await (await root.getFileHandle('settings.json')).getFile()).text()).version, 2);
});

test('v1 theme library reads do not rewrite files and a v2 copy preserves independent heading on reload', async () => {
  const root = new MemoryDirectoryHandle('heading-compatibility-root');
  const directory = await root.getDirectoryHandle('editor-themes', { create: true });
  const old = JSON.parse(JSON.stringify(BUILTIN_EDITOR_THEMES[0]));
  old.id = 'old-custom-theme';
  old.formatVersion = 1;
  delete old.fonts.subHeading;
  delete old.fonts.articleSource;
  delete old.fonts.heading;
  delete old.fonts.eyebrow;
  const file = await directory.getFileHandle(`${old.id}.json`, { create: true });
  file.content = JSON.stringify(old);
  const before = file.content;
  const loaded = await loadEditorThemeLibrary(root);
  const normalized = loaded.themes.find((theme) => theme.id === old.id);
  assert.deepEqual(loaded.issues, []);
  assert.equal(normalized.formatVersion, 4);
  assert.equal(normalized.fonts.heading, old.fonts.ui);
  assert.equal(file.content, before);

  const copy = { ...normalized, id: 'new-heading-theme', fonts: { ...normalized.fonts, heading: normalized.fonts.serif, eyebrow: normalized.fonts.mono } };
  await saveEditorTheme(root, copy);
  const reloaded = (await loadEditorThemeLibrary(root)).themes.find((theme) => theme.id === copy.id);
  assert.deepEqual(reloaded, copy);
  assert.notEqual(reloaded.fonts.heading, reloaded.fonts.ui);
  assert.equal(reloaded.fonts.eyebrow, normalized.fonts.mono);
  assert.equal(file.content, before);
});

test('legacy settings and workspace migrate together; subsequent concurrent reads use only settings.json', async () => {
  const root = new MemoryDirectoryHandle('combined-settings-migration');
  const settings = structuredClone(DEFAULT_ARTICLE_SETTINGS); settings.autoSave.intervalSeconds = 37;
  const oldSettings = await root.getFileHandle('settings.json', { create: true }); oldSettings.content = JSON.stringify(settings);
  const workspace = createEditorProject(createDefaultEditorWorkspace(), '旧项目', 'old-project');
  const oldWorkspace = await root.getFileHandle(LEGACY_EDITOR_WORKSPACE_FILE, { create: true }); oldWorkspace.content = JSON.stringify(workspace);
  const originalWorkspace = oldWorkspace.content;
  const loaded = await Promise.all([loadArticleSettings(root), loadEditorWorkspace(root)]);
  assert.equal(loaded[0].settings.autoSave.intervalSeconds, 37);
  assert.equal(loaded[1].workspace.projects[0].id, 'old-project');
  assert.equal(oldWorkspace.content, originalWorkspace);
  assert.equal(JSON.parse(oldSettings.content).version, 2);
  const reads = []; const getFileHandle = root.getFileHandle.bind(root);
  root.getFileHandle = async (name, options) => { reads.push(name); return getFileHandle(name, options); };
  await Promise.all([loadArticleSettings(root), loadEditorWorkspace(root)]);
  assert.deepEqual(reads, ['settings.json']);
});

test('concurrent automation and workspace saves preserve both sections in one settings file', async () => {
  const root = new MemoryDirectoryHandle('combined-settings-writes');
  const base = await loadEditorWorkspace(root);
  const settings = structuredClone(DEFAULT_ARTICLE_SETTINGS); settings.autoSnapshot.maxCount = 41;
  const workspace = createEditorProject(base.workspace, '并发项目', 'concurrent-project');
  await Promise.all([saveArticleSettings(root, settings), saveEditorWorkspace(root, workspace, base)]);
  const document = JSON.parse(await (await (await root.getFileHandle('settings.json')).getFile()).text());
  assert.equal(document.autoSnapshot.maxCount, 41);
  assert.equal(document.projects[0].id, 'concurrent-project');
  assert.equal(root.children.has(LEGACY_EDITOR_WORKSPACE_FILE), false);
});

test('invalid combined settings block both writers and are never replaced with defaults', async () => {
  const root = new MemoryDirectoryHandle('invalid-combined-settings');
  const file = await root.getFileHandle('settings.json', { create: true }); file.content = 'null';
  const loaded = await loadEditorWorkspace(root);
  assert.ok(loaded.issue);
  await assert.rejects(() => saveArticleSettings(root, DEFAULT_ARTICLE_SETTINGS), /顶层必须是对象/);
  await assert.rejects(() => saveEditorWorkspace(root, loaded.workspace, loaded), /顶层必须是对象/);
  assert.equal(file.content, 'null');
});

test('new classified editor themes are adopted directly; legacy originals are copied once without overwriting', async () => {
  const root = new MemoryDirectoryHandle('classified-theme-files');
  const legacy = await root.getDirectoryHandle('editor-themes', { create: true });
  const theme = { ...structuredClone(BUILTIN_EDITOR_THEMES[0]), id: 'directory-custom-theme', name: '目录里的主题' };
  const original = await legacy.getFileHandle(`${theme.id}.json`, { create: true }); original.content = JSON.stringify(theme);
  assert.ok((await loadEditorThemeLibrary(root)).themes.some(value => value.id === theme.id));
  const directory = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('editor-themes');
  const migrated = await directory.getFileHandle(`${theme.id}.json`);
  assert.equal(migrated.content, original.content);
  migrated.content = JSON.stringify({ ...theme, name: '新目录中修改过的主题' });
  const loaded = await loadEditorThemeLibrary(root);
  assert.equal(loaded.themes.find(value => value.id === theme.id).name, '新目录中修改过的主题');
  assert.equal(original.content, JSON.stringify(theme));
});


test('local-only readers are empty until initialization; defaults are additive and deleted defaults stay deleted', async () => {
  const root = new MemoryDirectoryHandle('default-copy-root');
  assert.deepEqual((await loadEditorThemeLibrary(root)).themes, []);
  assert.deepEqual((await loadThemeLibrary(root)).themes, []);
  const modified = { ...structuredClone(BUILTIN_EDITOR_THEMES[1]), name: '我修改的纸衫' };
  await saveEditorTheme(root, modified);
  await initializeThemeDefaults(root);
  assert.equal((await loadThemeLibrary(root)).themes.length, THEMES.length);
  let library = await loadEditorThemeLibrary(root);
  assert.equal(library.themes.length, BUILTIN_EDITOR_THEMES.length);
  assert.equal(library.themes.find(theme => theme.id === modified.id).name, modified.name);
  assert.deepEqual(library.issues, []);
  await deleteEditorTheme(root, modified.id);
  await initializeThemeDefaults(root);
  assert.equal((await loadEditorThemeLibrary(root)).themes.some(theme => theme.id === modified.id), false);
  const copied = await copyDefaultThemes(root, 'editor-themes');
  assert.equal(copied.added, 1);
  assert.equal(copied.skipped, BUILTIN_EDITOR_THEMES.length - 1);
  assert.deepEqual(copied.issues, []);
  library = await loadEditorThemeLibrary(root);
  assert.equal(library.themes.find(theme => theme.id === modified.id).name, BUILTIN_EDITOR_THEMES[1].name);
});

test('default copy preserves damaged same-ID files, removes failed partial writes and retries missing files', async () => {
  const root = new MemoryDirectoryHandle('default-copy-failure');
  const directory = await (await root.getDirectoryHandle('themes', { create: true })).getDirectoryHandle('editor-themes', { create: true });
  const id = BUILTIN_EDITOR_THEMES[1].id;
  const damaged = await directory.getFileHandle(`${id}.json`, { create: true }); damaged.content = '{broken';
  root.failOpenFor = `${BUILTIN_EDITOR_THEMES[0].id}.json`;
  const failed = await copyDefaultThemes(root, 'editor-themes');
  assert.equal(failed.issues.length, 1);
  assert.equal(directory.children.has(`${BUILTIN_EDITOR_THEMES[0].id}.json`), false);
  assert.equal(damaged.content, '{broken');
  const retry = await copyDefaultThemes(root, 'editor-themes');
  assert.equal(retry.added, 1);
  assert.deepEqual(retry.issues, []);
  assert.equal(damaged.content, '{broken');
  assert.ok((await loadEditorThemeLibrary(root)).issues.some(issue => issue.file === `${id}.json`));
});

test('failed initial seeding has no completion marker and retries without overwriting successful files', async () => {
  const root = new MemoryDirectoryHandle('default-initialization-failure');
  root.failCloseFor = `${BUILTIN_EDITOR_THEMES[2].id}.json`;
  await assert.rejects(() => initializeThemeDefaults(root), /injected close failure/);
  const directory = await root.getDirectoryHandle('themes');
  assert.equal(directory.children.has('default-themes.loaded'), false);
  await initializeThemeDefaults(root);
  assert.equal(directory.children.has('default-themes.loaded'), true);
  assert.equal((await loadEditorThemeLibrary(root)).themes.length, BUILTIN_EDITOR_THEMES.length);
});

test('editing local themes increments version, refuses external changes and preserves originals on failed writes', async () => {
  const root = new MemoryDirectoryHandle('local-theme-edit');
  const original = structuredClone(BUILTIN_EDITOR_THEMES[1]);
  await saveEditorTheme(root, original);
  const changed = { ...original, name: '已编辑的主题' };
  const saved = await saveEditorTheme(root, changed, original);
  assert.equal(saved.id, original.id);
  assert.equal(saved.version, '1.1.1');
  const directory = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('editor-themes');
  const file = await directory.getFileHandle(`${original.id}.json`);
  const before = file.content;
  await assert.rejects(() => saveEditorTheme(root, { ...saved, name: '过期编辑' }, original), /已存在或已被修改/);
  assert.equal(file.content, before);
  root.failOpenFor = `${saved.id}.json`;
  await assert.rejects(() => saveEditorTheme(root, { ...saved, name: '打开失败' }, saved), /保存失败/);
  assert.equal(file.content, before);
  root.failCloseFor = `${saved.id}.json`;
  await assert.rejects(() => saveEditorTheme(root, { ...saved, name: '关闭失败' }, saved), /保存失败/);
  assert.equal(file.content, before);
  await deleteEditorTheme(root, saved.id);
  await assert.rejects(() => saveEditorTheme(root, { ...saved, name: '已移除' }, saved), /已被移除/);
  await assert.rejects(() => deleteEditorTheme(root, BUILTIN_EDITOR_THEMES[0].id), /不可删除/);
  root.failOpenFor = 'new-failed-theme.json';
  await assert.rejects(() => saveEditorTheme(root, { ...saved, id: 'new-failed-theme' }), /保存失败/);
  assert.equal(directory.children.has('new-failed-theme.json'), false);
});

test('theme ID changes rename the file, honor an explicit version and rollback on collision or failure', async () => {
  const root = new MemoryDirectoryHandle('local-theme-rename');
  const original = structuredClone(BUILTIN_EDITOR_THEMES[1]);
  await saveEditorTheme(root, original);
  const directory = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('editor-themes');
  const oldName = `${original.id}.json`;
  const oldRaw = (await directory.getFileHandle(oldName)).content;
  let commits = 0, rollbacks = 0;
  const hooks = { commit: async () => { commits++; }, rollback: async () => { rollbacks++; } };
  const changed = { ...original, id: 'renamed-editor-theme', version: '2.3.4' };
  const saved = await saveEditorTheme(root, changed, original, hooks);
  assert.equal(saved.version, '2.3.4');
  assert.equal(commits, 1); assert.equal(rollbacks, 0);
  await assert.rejects(directory.getFileHandle(oldName), { name: 'NotFoundError' });
  assert.equal(JSON.parse((await directory.getFileHandle('renamed-editor-theme.json')).content).id, saved.id);
  const next = { ...saved, id: 'another-editor-theme' };
  await assert.rejects(saveEditorTheme(root, next, saved, { commit: async () => { throw new Error('settings denied'); }, rollback: async () => { rollbacks++; } }), /settings denied/);
  assert.equal(directory.children.has('another-editor-theme.json'), false);
  assert.equal(directory.children.has('renamed-editor-theme.json'), true);
  root.failRemoveFor = 'renamed-editor-theme.json';
  await assert.rejects(saveEditorTheme(root, next, saved, hooks), /injected removal failure/);
  assert.equal(directory.children.has('another-editor-theme.json'), false);
  assert.equal(directory.children.has('renamed-editor-theme.json'), true);
  assert.equal(rollbacks, 2);
  await saveEditorTheme(root, { ...original, id: 'taken-theme' });
  await assert.rejects(saveEditorTheme(root, { ...saved, id: 'taken-theme' }, saved, hooks), /已存在/);
  assert.equal(directory.children.has('renamed-editor-theme.json'), true);
  assert.equal(JSON.parse(oldRaw).id, original.id);
  const manualVersion = await saveEditorTheme(root, { ...saved, version: '4.5.6' }, saved);
  assert.equal(manualVersion.version, '4.5.6');
  assert.equal(JSON.parse((await directory.getFileHandle('renamed-editor-theme.json')).content).version, '4.5.6');
});

test('theme ID replacement updates saved selection and both custom combination references', () => {
  const before = { themeId: 'old-theme', colorMode: 'system', custom: { colorThemeId: 'old-theme', fontThemeId: 'other-theme' } };
  assert.deepEqual(replaceEditorAppearanceThemeId(before, 'old-theme', 'new-theme'), { themeId: 'new-theme', colorMode: 'system', custom: { colorThemeId: 'new-theme', fontThemeId: 'other-theme' } });
  assert.equal(before.themeId, 'old-theme');
});

test('changing the protected base theme ID creates a separate file and keeps its original', async () => {
  const root = new MemoryDirectoryHandle('base-theme-copy');
  const original = structuredClone(BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'sea-glass'));
  await saveEditorTheme(root, original);
  const copied = await saveEditorTheme(root, { ...original, id: 'sea-glass-personal' }, original);
  const directory = await (await root.getDirectoryHandle('themes')).getDirectoryHandle('editor-themes');
  assert.equal((await directory.getFileHandle('sea-glass.json')).content.includes('"id": "sea-glass"'), true);
  assert.equal(JSON.parse((await directory.getFileHandle('sea-glass-personal.json')).content).id, copied.id);
});
