import assert from 'node:assert/strict';
import test from 'node:test';

const { createArticleSource, parseArticle, updateFrontMatter } = await import('../src/lib/frontMatter.ts');
const {
  DEFAULT_ARTICLE_SNIPPETS,
  DEFAULT_SNIPPET_CATEGORIES,
  DEFAULT_TEMPLATE_CATEGORIES,
  saveTemplateCategory,
  DEFAULT_ARTICLE_TEMPLATES,
  deleteArticleSnippet,
  deleteArticleTemplate,
  loadArticleSnippets,
  loadArticleTemplates,
  saveArticleSnippet,
  saveArticleTemplate,
  saveSnippetCategory,
} = await import('../src/lib/contentLibraries.ts');
const {
  findSnippetMenuMatch,
  findSnippetSpaceExpansion,
  prepareSnippetInsertion,
} = await import('../src/lib/snippetComposer.ts');
const { instantiateArticleTemplate } = await import('../src/lib/frontMatter.ts');
const { BASIC_THEME } = await import('../src/lib/themes.ts');
const { refreshRootSession } = await import('../src/lib/rootSession.ts');

class MemoryFileHandle {
  kind = 'file';
  constructor(name, content = '') { this.name = name; this.content = content; this.failWrite = false; }
  async getFile() {
    const content = this.content;
    const bytes = new TextEncoder().encode(content);
    return { text: async () => content, arrayBuffer: async () => bytes.slice().buffer };
  }
  async createWritable() {
    let staged = this.content;
    return {
      write: async (content) => {
        if (this.failWrite) { this.failWrite = false; throw new Error('fixture write failure'); }
        staged = typeof content === 'string' ? content : new TextDecoder().decode(content);
      },
      close: async () => { this.content = staged; },
      abort: async () => {},
    };
  }
}

class MemoryDirectoryHandle {
  kind = 'directory';
  constructor(name) { this.name = name; this.children = new Map(); }
  async getDirectoryHandle(name, options = {}) {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'directory') throw new DOMException(`${name} is not a directory`, 'TypeMismatchError');
      return existing;
    }
    if (!options.create) throw new DOMException(`missing directory: ${name}`, 'NotFoundError');
    const created = new MemoryDirectoryHandle(name);
    this.children.set(name, created);
    return created;
  }
  async getFileHandle(name, options = {}) {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'file') throw new DOMException(`${name} is not a file`, 'TypeMismatchError');
      return existing;
    }
    if (!options.create) throw new DOMException(`missing file: ${name}`, 'NotFoundError');
    const created = new MemoryFileHandle(name);
    created.failWrite = this.failNextWrite === true;
    this.failNextWrite = false;
    this.children.set(name, created);
    return created;
  }
  async removeEntry(name) {
    if (this.failRemove) throw new Error('fixture removal failure');
    if (!this.children.has(name)) throw new DOMException(`missing entry: ${name}`, 'NotFoundError');
    this.children.delete(name);
  }
  async *entries() { yield* this.children.entries(); }
}

async function writeText(directory, name, content) {
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

const sampleSnippet = {
  id: 'custom-note',
  name: '自定义提示',
  trigger: '//custom-note',
  description: '用于本地测试',
  content: '\n<p>▌</p>\n',
};

const notes = { id: 'notes', name: '笔记', description: '测试分类', order: 0 };

test('unlisted article formats no longer block a snippet or template save and are reported instead', async () => {
  const root = new MemoryDirectoryHandle('closed-article-format');
  await loadArticleSnippets(root);
  await loadArticleTemplates(root);
  const snippets = await root.getDirectoryHandle('snippets');
  const templates = await root.getDirectoryHandle('templates');
  const blocked = { ...sampleSnippet, id: 'blocked-fragment', trigger: '//blocked-fragment', categoryId: 'default', content: '<aside>▌</aside>' };
  const snippetIssues = [];
  await saveArticleSnippet(root, blocked, null, issues => snippetIssues.push(...issues));
  assert.equal(snippetIssues.some(issue => issue.name === 'aside'), false, 'unmentioned HTML is not an invented official finding');
  assert.equal((await snippets.getDirectoryHandle('default')).children.has('blocked-fragment.json'), true, 'the snippet is written anyway');
  const invalidTemplate = `${createArticleSource('未列入标题', 'basic')}\n<figure>未列入元素</figure>\n`;
  const templateIssues = [];
  await saveArticleTemplate(root, 'blocked-template', invalidTemplate, null, 'default', issues => templateIssues.push(...issues));
  assert.equal(templateIssues.some(issue => issue.name === 'figure'), false);
  assert.equal((await templates.getDirectoryHandle('default')).children.has('blocked-template.md'), true, 'the template is written anyway');
  assert.ok((await loadArticleSnippets(root)).snippets.some(item => item.id === 'callout'), 'legacy snippets remain readable');
});

test('snippet and starter template save static Tailwind authoring classes without treating class as exported HTML', async () => {
  const root = new MemoryDirectoryHandle('authoring-classes');
  await loadArticleSnippets(root);
  await loadArticleTemplates(root);
  const content = '<section class="w-full p-4"><img class="block h-auto max-w-full" src="/article-sample.png" /><span>图一▌</span></section>';
  const snippet = { ...sampleSnippet, id: 'safe-layout', trigger: '//safe-layout', categoryId: 'default', content };
  await saveArticleSnippet(root, snippet, null);
  const snippets = await root.getDirectoryHandle('snippets');
  assert.ok(JSON.parse((await (await snippets.getDirectoryHandle('default')).getFileHandle('safe-layout.json')).content).content.includes('class="w-full p-4"'));
  const source = `${createArticleSource('安全布局', 'basic')}\n${content.replace('▌', '')}\n`;
  await saveArticleTemplate(root, 'safe-layout', source, null, 'default');
  const templates = await root.getDirectoryHandle('templates');
  assert.equal((await (await templates.getDirectoryHandle('default')).getFileHandle('safe-layout.md')).content, source);
  await saveArticleSnippet(root, { ...snippet, id: 'grid-layout', trigger: '//grid-layout', content: '<section class="grid gap-4">▌</section>' }, null);
  assert.equal((await snippets.getDirectoryHandle('default')).children.has('grid-layout.json'), true);
  const saved = (await (await snippets.getDirectoryHandle('default')).getFileHandle('safe-layout.json')).content;
  await assert.rejects(saveArticleSnippet(root, { ...snippet, content: '<script>▌可执行内容</script>' }, 'safe-layout'), /校验失败.*script/);
  assert.equal((await (await snippets.getDirectoryHandle('default')).getFileHandle('safe-layout.json')).content, saved, 'failed validation keeps original bytes');
  await assert.rejects(saveArticleTemplate(root, 'safe-layout', `${createArticleSource('禁止的容器')}\n<script>正文</script>`, 'safe-layout', 'default'), /校验失败.*script/);
  assert.equal((await (await templates.getDirectoryHandle('default')).getFileHandle('safe-layout.md')).content, source);
  const malformed = '<section><p>正文</p></tdction>';
  await assert.rejects(saveArticleSnippet(root, { ...snippet, content: malformed }, 'safe-layout'), /校验失败.*tdction/);
  await assert.rejects(saveArticleTemplate(root, 'safe-layout', `${createArticleSource('错误闭合')}\n${malformed}`, 'safe-layout', 'default'), /校验失败.*tdction/);
  assert.equal((await (await snippets.getDirectoryHandle('default')).getFileHandle('safe-layout.json')).content, saved);
  assert.equal((await (await templates.getDirectoryHandle('default')).getFileHandle('safe-layout.md')).content, source);
});

test('side-border Tailwind classes save in snippets and starter templates', async () => {
  const root = new MemoryDirectoryHandle('side-border-authoring');
  await loadArticleSnippets(root);
  await loadArticleTemplates(root);
  const content = '<blockquote class="my-7 border-l-0 border-r-4 border-b-4 border-article-line bg-article-tint px-6 py-5"><p>▌摘记</p></blockquote>';
  const snippet = { ...sampleSnippet, id: 'side-border-note', trigger: '//side-border-note', categoryId: 'default', content };
  await saveArticleSnippet(root, snippet, null);
  const savedSnippet = await (await (await root.getDirectoryHandle('snippets')).getDirectoryHandle('default')).getFileHandle('side-border-note.json');
  assert.equal(JSON.parse(savedSnippet.content).content, content);
  const source = `${createArticleSource('单侧边框', 'basic')}\n${content.replace('▌', '')}\n`;
  await saveArticleTemplate(root, 'side-border-note', source, null, 'default');
  const savedTemplate = await (await (await root.getDirectoryHandle('templates')).getDirectoryHandle('default')).getFileHandle('side-border-note.md');
  assert.equal(savedTemplate.content, source);
});

test('template categories round-trip, move files without changing Markdown and recover a malformed index', async () => {
  const root = new MemoryDirectoryHandle('template-categories');
  const initial = await loadArticleTemplates(root);
  assert.deepEqual(initial.categories, DEFAULT_TEMPLATE_CATEGORIES);
  await saveTemplateCategory(root, notes, null);
  const original = initial.templates[0];
  const moved = await saveArticleTemplate(root, original.id, original.source, original.id, notes.id);
  assert.equal(moved.categoryId, 'notes');
  const base = await root.getDirectoryHandle('templates');
  assert.equal((await (await base.getDirectoryHandle('notes')).getFileHandle(original.id + '.md')).content, original.source);
  await assert.rejects((await base.getDirectoryHandle('default')).getFileHandle(original.id + '.md'), { name: 'NotFoundError' });
  await deleteArticleTemplate(root, original.id);
  assert.ok(!(await loadArticleTemplates(root)).templates.some(item => item.id === original.id));
  const index = await base.getFileHandle('index.json');
  await writeText(base, 'index.json', '{broken');
  const recovered = await loadArticleTemplates(root);
  assert.ok(recovered.issues.some(issue => issue.file === 'index.json'));
  assert.ok(recovered.categories.some(item => item.id === 'notes'));
  await assert.rejects(saveTemplateCategory(root, { ...notes, name: 'Do not replace' }, notes.id));
  assert.equal(index.content, '{broken');
});

test('category directory rename updates its index, retains unknown files and moves all content for both libraries', async () => {
  for (const kind of ['snippets', 'templates']) {
    const root = new MemoryDirectoryHandle(`${kind}-category-rename`);
    const library = kind === 'snippets' ? await loadArticleSnippets(root) : await loadArticleTemplates(root);
    const old = library.categories[0], base = await root.getDirectoryHandle(kind), folder = await base.getDirectoryHandle(old.id);
    await writeText(folder, 'keep.txt', 'User notes\n');
    const before = Object.fromEntries([...folder.children].map(([name, file]) => [name, file.content]));
    const next = { ...old, id: 'renamed-category', name: '改名分类' };
    await (kind === 'snippets' ? saveSnippetCategory : saveTemplateCategory)(root, next, old.id);
    await assert.rejects(base.getDirectoryHandle(old.id), { name: 'NotFoundError' });
    const target = await base.getDirectoryHandle(next.id);
    assert.deepEqual(Object.fromEntries([...target.children].map(([name, file]) => [name, file.content])), before);
    const updated = kind === 'snippets' ? await loadArticleSnippets(root) : await loadArticleTemplates(root);
    assert.ok(updated.categories.some(item => item.id === next.id && item.name === next.name));
    assert.ok(!updated.categories.some(item => item.id === old.id));
    assert.ok((kind === 'snippets' ? updated.snippets : updated.templates).some(item => item.categoryId === next.id));
  }
});

test('category rename collisions, index write failure and partial old-file removal preserve original files and index', async () => {
  for (const kind of ['snippets', 'templates']) {
    for (const phase of ['collision', 'copy', 'index', 'removal']) {
      const root = new MemoryDirectoryHandle(`${kind}-${phase}`);
      const library = kind === 'snippets' ? await loadArticleSnippets(root) : await loadArticleTemplates(root);
      const saveCategory = kind === 'snippets' ? saveSnippetCategory : saveTemplateCategory;
      const old = library.categories[0], base = await root.getDirectoryHandle(kind), folder = await base.getDirectoryHandle(old.id);
      const before = Object.fromEntries([...folder.children].map(([name, file]) => [name, file.content]));
      const index = await base.getFileHandle('index.json'), originalIndex = index.content;
      if (phase === 'collision') await base.getDirectoryHandle('renamed-category', { create: true });
      if (phase === 'copy') {
        const getDirectory = base.getDirectoryHandle.bind(base);
        base.getDirectoryHandle = async (name, options) => {
          const folder = await getDirectory(name, options);
          if (name === 'renamed-category' && options?.create) folder.failNextWrite = true;
          return folder;
        };
      }
      if (phase === 'index') index.failWrite = true;
      if (phase === 'removal') {
        let removes = 0;
        const remove = folder.removeEntry.bind(folder);
        folder.removeEntry = name => ++removes === 2 ? Promise.reject(new Error('partial removal failure')) : remove(name);
      }
      await assert.rejects(saveCategory(root, { ...old, id: 'renamed-category' }, old.id), /不能覆盖|改名失败/);
      assert.equal(index.content, originalIndex);
      const retained = await base.getDirectoryHandle(old.id);
      assert.deepEqual(Object.fromEntries([...retained.children].map(([name, file]) => [name, file.content])), before);
      if (phase !== 'collision') await assert.rejects(base.getDirectoryHandle('renamed-category'), { name: 'NotFoundError' });
    }
  }
});

test('explicit creation never overwrites existing snippet or template files', async () => {
  const root = new MemoryDirectoryHandle('create-collision');
  const snippets = await loadArticleSnippets(root);
  const templates = await loadArticleTemplates(root);
  const original = snippets.snippets[0];
  await assert.rejects(saveArticleSnippet(root, { ...original, content: 'replacement' }, null), /占用|已存在/);
  await assert.rejects(saveArticleTemplate(root, templates.templates[0].id, '# Replacement', null), /占用|已存在/);
  assert.deepEqual((await loadArticleSnippets(root)).snippets, snippets.snippets);
  assert.deepEqual((await loadArticleTemplates(root)).templates, templates.templates);
});

test('renaming snippets and templates writes the complete new file, removes the old and preserves unrelated assets', async () => {
  const root = new MemoryDirectoryHandle('rename-content');
  const snippets = await loadArticleSnippets(root), templates = await loadArticleTemplates(root);
  const old = snippets.snippets[0], template = templates.templates[0];
  const saved = await saveArticleSnippet(root, { ...old, id: 'renamed-snippet', categoryId: 'zixu', content: '<p>Full body</p>' }, old.id);
  const renamed = await saveArticleTemplate(root, 'renamed-template', template.source, template.id);
  const base = await root.getDirectoryHandle('snippets');
  const origin = await base.getDirectoryHandle(old.categoryId);
  await assert.rejects(origin.getFileHandle(`${old.id}.json`), { name: 'NotFoundError' });
  const record = JSON.parse((await (await base.getDirectoryHandle('zixu')).getFileHandle('renamed-snippet.json')).content);
  assert.equal(record.id, saved.id); assert.equal(record.content, '<p>Full body</p>');
  assert.equal('categoryId' in record, false);
  const folder = await (await root.getDirectoryHandle('templates')).getDirectoryHandle('default');
  await assert.rejects(folder.getFileHandle(`${template.id}.md`), { name: 'NotFoundError' });
  assert.equal((await folder.getFileHandle('renamed-template.md')).content, template.source);
  assert.equal(renamed.id, 'renamed-template');
  assert.equal((await loadArticleSnippets(root)).snippets.length, snippets.snippets.length);
  assert.equal((await loadArticleTemplates(root)).templates.length, templates.templates.length);
});

test('rename collisions and unavailable originals never replace any file', async () => {
  const root = new MemoryDirectoryHandle('rename-collision');
  const snippets = await loadArticleSnippets(root), templates = await loadArticleTemplates(root);
  const old = snippets.snippets[0];
  await assert.rejects(saveArticleSnippet(root, { ...old, id: snippets.snippets[1].id }, old.id), /占用/);
  await assert.rejects(saveArticleTemplate(root, templates.templates[1].id, '# Body', templates.templates[0].id), /占用/);
  const folder = await root.getDirectoryHandle('templates');
  await writeText(folder, 'broken.md', 'preserved broken file');
  await assert.rejects(saveArticleTemplate(root, 'broken', '# Body', templates.templates[0].id), /占用|已存在/);
  const base = await root.getDirectoryHandle('snippets');
  await writeText(await base.getDirectoryHandle('zixu'), 'broken.json', 'preserved broken file');
  await assert.rejects(saveArticleSnippet(root, { ...old, id: 'broken' }, old.id), /安全更新/);
  await assert.rejects(saveArticleSnippet(root, { ...old, id: 'new-file' }, 'missing'), /不存在/);
  await assert.rejects(saveArticleTemplate(root, 'new-file', '# Body', 'missing'), /不存在/);
  assert.equal((await folder.getFileHandle('broken.md')).content, 'preserved broken file');
  assert.deepEqual((await loadArticleSnippets(root)).snippets, snippets.snippets);
});

test('failed rename writes or old-file removal retain the original and clean up the new file', async () => {
  for (const kind of ['snippets', 'templates']) {
    for (const phase of ['write', 'remove']) {
      const root = new MemoryDirectoryHandle(`${kind}-rename-${phase}`);
      const snippets = await loadArticleSnippets(root), templates = await loadArticleTemplates(root);
      const old = kind === 'snippets' ? snippets.snippets[0] : templates.templates[0];
      const base = await root.getDirectoryHandle(kind);
      const origin = old.categoryId ? await base.getDirectoryHandle(old.categoryId) : base;
      const target = kind === 'snippets' ? await base.getDirectoryHandle('zixu') : origin;
      const extension = kind === 'snippets' ? '.json' : '.md';
      const original = (await origin.getFileHandle(old.id + extension)).content;
      if (phase === 'write') target.failNextWrite = true;
      else {
        const remove = origin.removeEntry.bind(origin);
        origin.removeEntry = name => name === old.id + extension ? Promise.reject(new Error('old file locked')) : remove(name);
      }
      await assert.rejects(kind === 'snippets'
        ? saveArticleSnippet(root, { ...old, id: 'renamed-file', categoryId: 'zixu', content: '<p>▌</p>' }, old.id)
        : saveArticleTemplate(root, 'renamed-file', old.source, old.id), /保存失败|原文件保留/);
      assert.equal((await origin.getFileHandle(old.id + extension)).content, original);
      await assert.rejects(target.getFileHandle('renamed-file' + extension), { name: 'NotFoundError' });
    }
  }
});

test('a failed rollback explicitly reports the extra file while preserving the original bytes', async () => {
  for (const kind of ['snippets', 'templates']) {
    const root = new MemoryDirectoryHandle(`${kind}-rollback-failure`);
    const snippets = await loadArticleSnippets(root), templates = await loadArticleTemplates(root);
    const old = kind === 'snippets' ? snippets.snippets[0] : templates.templates[0];
    const base = await root.getDirectoryHandle(kind);
    const folder = old.categoryId ? await base.getDirectoryHandle(old.categoryId) : base;
    const extension = kind === 'snippets' ? '.json' : '.md';
    const original = (await folder.getFileHandle(old.id + extension)).content;
    folder.failRemove = true;
    await assert.rejects(kind === 'snippets'
      ? saveArticleSnippet(root, { ...old, id: 'renamed-file', content: '<p>▌</p>' }, old.id)
      : saveArticleTemplate(root, 'renamed-file', old.source, old.id), /原文件保留.*回滚失败/);
    assert.equal((await folder.getFileHandle(old.id + extension)).content, original);
    assert.ok(await folder.getFileHandle('renamed-file' + extension));
  }
});

test('empty libraries seed themed snippets and sample templates in their categories', async () => {
  const root = new MemoryDirectoryHandle('isolated-content-library');
  const snippets = await loadArticleSnippets(root);
  const templates = await loadArticleTemplates(root);

  assert.equal(snippets.snippets.length, 20);
  assert.deepEqual(snippets.categories, DEFAULT_SNIPPET_CATEGORIES);
  assert.equal(templates.templates.length, 5);
  assert.deepEqual(snippets.snippets.map((item) => item.trigger).sort(), DEFAULT_ARTICLE_SNIPPETS.map((item) => item.trigger).sort());
  assert.deepEqual(templates.templates.map((item) => item.id).sort(), DEFAULT_ARTICLE_TEMPLATES.map((item) => item.id).sort());
  assert.ok(templates.templates.every((item) => parseArticle(item.source).canCopy));
  assert.ok((await (await (await root.getDirectoryHandle('templates')).getDirectoryHandle('default')).getFileHandle('tutorial.md')).name === 'tutorial.md');
  assert.equal((await (await (await root.getDirectoryHandle('templates')).getDirectoryHandle('theme-samples')).getFileHandle('rainy-design-sample.md')).name, 'rainy-design-sample.md');
  assert.deepEqual(snippets.issues, []);
  assert.deepEqual(templates.issues, []);
});

test('an existing snippet library keeps its files without receiving new defaults', async () => {
  const root = new MemoryDirectoryHandle('existing-content-library');
  const directory = await root.getDirectoryHandle('snippets', { create: true });
  const defaultFolder = await directory.getDirectoryHandle('default', { create: true });
  await writeText(defaultFolder, 'custom-note.json', JSON.stringify(sampleSnippet));

  const loaded = await loadArticleSnippets(root);
  assert.deepEqual(loaded.snippets.map((item) => item.id), ['custom-note']);
  assert.equal(defaultFolder.children.has('reading-index.json'), false);
});

test('snippet and template changes round-trip without touching unrelated files', async () => {
  const root = new MemoryDirectoryHandle('round-trip-content-library');
  await loadArticleSnippets(root);
  await loadArticleTemplates(root);

  await saveSnippetCategory(root, notes);
  const savedSnippet = await saveArticleSnippet(root, { ...sampleSnippet, categoryId: 'notes' });
  assert.equal(savedSnippet.trigger, '//custom-note');
  assert.ok((await loadArticleSnippets(root)).snippets.some((item) => item.id === 'custom-note'));
  await deleteArticleSnippet(root, 'custom-note');
  assert.ok(!(await loadArticleSnippets(root)).snippets.some((item) => item.id === 'custom-note'));

  const source = `${createArticleSource('自定义模板', 'basic')}\n# 自定义正文\n`;
  await saveArticleTemplate(root, 'custom-template', source);
  assert.equal((await loadArticleTemplates(root)).templates.find((item) => item.id === 'custom-template').source, source);
  await deleteArticleTemplate(root, 'custom-template');
  assert.ok(!(await loadArticleTemplates(root)).templates.some((item) => item.id === 'custom-template'));
  assert.ok((await (await root.getDirectoryHandle('snippets')).getDirectoryHandle('default')).children.has('callout.json'));
  assert.ok((await (await root.getDirectoryHandle('templates')).getDirectoryHandle('default')).children.has('tutorial.md'));
});

test('library readers report malformed siblings and keep their bytes untouched', async () => {
  const root = new MemoryDirectoryHandle('corrupt-content-library');
  const snippets = await root.getDirectoryHandle('snippets', { create: true });
  await writeText(snippets, 'broken.json', '{not json');
  await writeText(snippets, 'healthy.json', JSON.stringify({ ...sampleSnippet, id: 'healthy', trigger: '//healthy' }));
  const templates = await root.getDirectoryHandle('templates', { create: true });
  await writeText(templates, 'healthy.md', `${createArticleSource('保留正常模板', 'basic')}\n正文\n`);
  await writeText(templates, 'unsafe name.md', 'do not rewrite');

  const snippetResult = await loadArticleSnippets(root);
  const templateResult = await loadArticleTemplates(root);
  assert.deepEqual(snippetResult.snippets.map((item) => item.id), ['healthy']);
  assert.ok(snippetResult.issues.some((item) => item.file === 'broken.json'));
  assert.equal(await (await snippets.getFileHandle('broken.json')).getFile().then((file) => file.text()), '{not json');
  assert.ok(templateResult.templates.some((item) => item.id === 'healthy'));
  assert.ok(templateResult.issues.some((item) => item.file === 'unsafe name.md'));
  assert.equal(await (await templates.getFileHandle('unsafe name.md')).getFile().then((file) => file.text()), 'do not rewrite');
});

test('snippet input rejects unsafe paths, ambiguous triggers, and multiple caret markers', async () => {
  const root = new MemoryDirectoryHandle('validation-content-library');
  await assert.rejects(saveArticleSnippet(root, { ...sampleSnippet, id: '../outside' }), /ID/);
  await assert.rejects(saveArticleSnippet(root, { ...sampleSnippet, trigger: '//bad trigger' }), /触发词/);
  await assert.rejects(saveArticleSnippet(root, { ...sampleSnippet, content: '▌ one ▌ two' }), /光标占位符/);
  await loadArticleSnippets(root);
  await saveSnippetCategory(root, notes);
  await assert.rejects(saveArticleSnippet(root, { ...sampleSnippet, categoryId: 'notes', id: 'other', trigger: '//callout' }), /占用/);
});

test('failed writes do not replace existing snippets or leave new partial files', async () => {
  const root = new MemoryDirectoryHandle('failed-write-content-library');
  await loadArticleSnippets(root);
  const directory = await root.getDirectoryHandle('snippets');
  const existing = await (await directory.getDirectoryHandle('default')).getFileHandle('callout.json');
  const original = existing.content;
  existing.failWrite = true;
  await assert.rejects(saveArticleSnippet(root, { ...DEFAULT_ARTICLE_SNIPPETS[0], name: '不应写入', content: '<p>▌</p>' }), /保存失败/);
  assert.equal(existing.content, original);

  await saveSnippetCategory(root, notes);
  const categorized = await directory.getDirectoryHandle('notes');
  categorized.failNextWrite = true;
  await assert.rejects(saveArticleSnippet(root, { ...sampleSnippet, categoryId: 'notes' }), /保存失败/);
  assert.equal(categorized.children.has('custom-note.json'), false);
});

test('template instantiation preserves defaults and body while replacing dates and theme binding', () => {
  const source = [
    '---',
    'title: 原模板标题',
    'description: 保留的摘要',
    'createdAt: 2020-01-01T00:00:00.000Z',
    'updatedAt: 2020-01-02T00:00:00.000Z',
    'theme:',
    '  id: basic',
    '  version: 1.0.0',
    'customField: keep-me',
    '---',
    '# 正文完全保留',
    '',
  ].join('\n');
  const now = '2026-09-23T05:00:00.000Z';
  const result = instantiateArticleTemplate(source, { now, theme: BASIC_THEME });
  const parsed = parseArticle(result);
  assert.equal(parsed.metadata.title, '原模板标题');
  assert.equal(parsed.metadata.description, '保留的摘要');
  assert.equal(parsed.metadata.createdAt, now);
  assert.equal(parsed.metadata.updatedAt, now);
  assert.deepEqual(parsed.metadata.theme, { id: BASIC_THEME.id, version: BASIC_THEME.version });
  assert.equal(parsed.metadata.customField, 'keep-me');
  assert.equal(parsed.body, '# 正文完全保留\n');
  assert.throws(() => instantiateArticleTemplate('---\ntitle: [bad\n---\nbody', { now, theme: BASIC_THEME }), /Front Matter/);
});

test('category index names and orders folders while defaults share the default folder and runtime metadata stays out of files', async () => {
  const root = new MemoryDirectoryHandle('categories');
  await loadArticleSnippets(root);
  await saveSnippetCategory(root, notes);
  await saveSnippetCategory(root, { id: 'zixu', name: '紫序', description: '组合', order: 5 });
  await saveArticleSnippet(root, { ...sampleSnippet, categoryId: 'zixu' });
  await saveSnippetCategory(root, { ...notes, name: '新笔记', order: 9 });
  const loaded = await loadArticleSnippets(root);
  assert.deepEqual(loaded.categories.map(c => c.name), ['默认', 'Rainy Design', '紫序', '新笔记']);
  assert.equal(loaded.snippets.find(s => s.id === sampleSnippet.id).categoryId, 'zixu');
  assert.equal(loaded.snippets.filter(s => s.categoryId === 'default').length, DEFAULT_ARTICLE_SNIPPETS.filter(s => s.categoryId === 'default').length);
  const base = await root.getDirectoryHandle('snippets');
  const folder = await base.getDirectoryHandle('zixu');
  assert.equal(JSON.parse((await folder.getFileHandle('custom-note.json')).content).categoryId, undefined);
  assert.deepEqual(loaded.issues, []);
  await deleteArticleSnippet(root, sampleSnippet.id);
  assert.equal(folder.children.has('custom-note.json'), false);
  assert.ok(base.children.has('index.json'));
});

test('missing and malformed category indexes recover folder contents without overwriting the index', async () => {
  const root = new MemoryDirectoryHandle('index-recovery');
  const base = await root.getDirectoryHandle('snippets', { create: true });
  const folder = await base.getDirectoryHandle('notes', { create: true });
  await writeText(folder, 'custom-note.json', JSON.stringify(sampleSnippet));
  assert.equal((await loadArticleSnippets(root)).categories[0].name, 'notes');
  await writeText(base, 'index.json', '{broken');
  const loaded = await loadArticleSnippets(root);
  assert.equal(loaded.snippets.length, 1);
  assert.ok(loaded.issues.some(i => i.file === 'index.json'));
  await assert.rejects(saveSnippetCategory(root, notes));
  assert.equal((await base.getFileHandle('index.json')).content, '{broken');
});

test('cross-category duplicates and unsafe categories cannot silently overwrite another snippet', async () => {
  const root = new MemoryDirectoryHandle('category-conflicts');
  await loadArticleSnippets(root);
  await saveSnippetCategory(root, notes);
  await saveSnippetCategory(root, { ...notes, id: 'other' });
  await saveArticleSnippet(root, { ...sampleSnippet, categoryId: 'notes' });
  const base = await root.getDirectoryHandle('snippets');
  const other = await base.getDirectoryHandle('other');
  await writeText(other, 'custom-note.json', JSON.stringify(sampleSnippet));
  await writeText(other, 'duplicate-trigger.json', JSON.stringify({ ...sampleSnippet, id: 'duplicate-trigger' }));
  const loaded = await loadArticleSnippets(root);
  assert.ok(loaded.issues.some(i => i.file === 'other/custom-note.json'));
  assert.ok(loaded.issues.some(i => i.file === 'other/duplicate-trigger.json'));
  await assert.rejects(saveArticleSnippet(root, { ...sampleSnippet, categoryId: 'notes', name: 'cannot overwrite' }), /无法安全更新/);
  await assert.rejects(saveSnippetCategory(root, { ...notes, id: '../escape' }), /ID/);
  await assert.rejects(saveArticleSnippet(root, { ...sampleSnippet, id: 'new' }), /选择分类/);
  await assert.rejects(saveArticleSnippet(root, { ...sampleSnippet, id: 'new', categoryId: 'missing' }), /分类不存在/);
});

test('category moves keep the original on write or removal failure and remove it only after a complete write', async () => {
  const root = new MemoryDirectoryHandle('safe-category-move');
  await loadArticleSnippets(root);
  await saveSnippetCategory(root, notes);
  const base = await root.getDirectoryHandle('snippets');
  const target = await base.getDirectoryHandle('notes');
  const from = await base.getDirectoryHandle('default');
  const sourceFile = await from.getFileHandle('callout.json');
  sourceFile.content = JSON.stringify({ ...JSON.parse(sourceFile.content), content: '<p>▌</p>' });
  const original = sourceFile.content;
  target.failNextWrite = true;
  const moved = { ...DEFAULT_ARTICLE_SNIPPETS.find(s => s.id === 'callout'), categoryId: 'notes', content: '<p>▌</p>' };
  await assert.rejects(saveArticleSnippet(root, moved), /保存失败/);
  assert.equal((await from.getFileHandle('callout.json')).content, original);
  assert.equal(target.children.has('callout.json'), false);
  from.failRemove = true;
  await assert.rejects(saveArticleSnippet(root, moved), /原文件保留/);
  assert.equal(target.children.has('callout.json'), false);
  from.failRemove = false;
  await saveArticleSnippet(root, moved);
  assert.equal(from.children.has('callout.json'), false);
  assert.deepEqual(JSON.parse((await target.getFileHandle('callout.json')).content), JSON.parse(original));
});

test('a failed category index write retains existing metadata and lets an empty folder be recovered', async () => {
  const root = new MemoryDirectoryHandle('category-index-failure');
  await loadArticleSnippets(root);
  await saveSnippetCategory(root, notes);
  const base = await root.getDirectoryHandle('snippets');
  const index = await base.getFileHandle('index.json');
  const original = index.content;
  index.failWrite = true;
  await assert.rejects(saveSnippetCategory(root, { ...notes, id: 'other', name: '其他' }), /保存失败/);
  assert.equal(index.content, original);
  assert.ok((await loadArticleSnippets(root)).categories.some(c => c.id === 'other' && c.name === 'other'));
});

test('snippet search finds only supported contexts and keyboard expansion consumes exact trigger', () => {
  const snippet = { ...sampleSnippet, trigger: '//callout' };
  const snippets = [snippet];
  const query = '正文 //cal';
  const menu = findSnippetMenuMatch(query, query.length, snippets);
  assert.equal(menu.query, 'cal');
  assert.equal(menu.items[0].id, snippet.id);
  assert.equal(findSnippetMenuMatch('https://example.test//cal', 25, snippets), null);
  assert.equal(findSnippetMenuMatch('`//cal`', 5, snippets), null);
  assert.equal(findSnippetMenuMatch('```md\n//cal', 11, snippets), null);
  assert.equal(findSnippetMenuMatch('---\ntitle: //cal\n---\nbody', 15, snippets), null);
  assert.equal(findSnippetMenuMatch('//cal', 5, snippets, true), null);

  const expansionSource = '开头 //callout';
  const expansion = findSnippetSpaceExpansion(expansionSource, expansionSource.length, snippets);
  assert.equal(expansion.snippet.id, snippet.id);
  assert.equal(expansion.start, 3);
  assert.equal(findSnippetSpaceExpansion('//callout', 9, snippets, true), null);
  assert.equal(findSnippetSpaceExpansion('`//callout`', 10, snippets), null);
  assert.equal(findSnippetSpaceExpansion('https://example.test//callout', 29, snippets), null);
});

test('snippet triggers stay inactive in cross-line spans and fenced containers', () => {
  const snippet = { ...sampleSnippet, trigger: '//callout' };
  const snippets = [snippet];
  const blocked = [
    ['cross-line single-backtick span', '`start\n//callout\nend`'],
    ['cross-line double-backtick span with a shorter run', '``start `still in code`\n//callout\nend``'],
    ['blockquote fenced code', '> ```md\n> //callout\n> ```'],
    ['list-item fenced code', '- ```md\n  //callout\n  ```'],
  ];

  for (const [label, source] of blocked) {
    const caret = source.indexOf('//callout') + '//callout'.length;
    assert.equal(findSnippetMenuMatch(source, caret, snippets), null, `${label}: search menu`);
    assert.equal(findSnippetSpaceExpansion(source, caret, snippets), null, `${label}: space expansion`);
  }

  const closedContainers = '> ```md\n> //callout\n> ```\n\n普通正文 //callout';
  const legalCaret = closedContainers.length;
  assert.equal(findSnippetMenuMatch(closedContainers, legalCaret, snippets)?.items[0].trigger, '//callout');
  assert.equal(findSnippetSpaceExpansion('普通正文 //callout', '普通正文 //callout'.length, snippets)?.snippet.trigger, '//callout');
});

test('a late refresh from a previous root epoch cannot commit even if the same handle is selected again', async () => {
  const root = { name: 'same-memory-handle' };
  let currentEpoch = 4;
  let releaseLoad;
  let committed;
  const loading = new Promise((resolve) => { releaseLoad = resolve; });
  const pending = refreshRootSession(
    root,
    (expected) => expected === root && currentEpoch === 4,
    () => loading,
    (value) => { committed = value; },
  );
  currentEpoch = 6;
  releaseLoad({ snippets: [{ id: 'late-A' }] });
  assert.deepEqual(await pending, { kind: 'stale' });
  assert.equal(committed, undefined);
});

test('snippet insertion removes one cursor marker and returns its insertion-relative caret', () => {
  const insertion = prepareSnippetInsertion('\n<p>before ▌ after</p>\n');
  assert.equal(insertion.text, '<p>before  after</p>\n');
  assert.equal(insertion.caretOffset, '<p>before '.length);
  assert.equal(prepareSnippetInsertion('plain text').caretOffset, 'plain text'.length);
});


test('category icons round-trip through the index, preserve old entries, and reject arbitrary markup', async () => {
  const root = new MemoryDirectoryHandle('category-icons');
  await loadArticleSnippets(root);
  const directory = await root.getDirectoryHandle('snippets');
  const index = await directory.getFileHandle('index.json');
  const legacyIndex = JSON.parse(index.content);
  delete legacyIndex.categories[0].icon;
  await writeText(directory, 'index.json', JSON.stringify(legacyIndex));
  const legacy = (await loadArticleSnippets(root)).categories[0];
  assert.equal(legacy.icon, undefined);
  await saveSnippetCategory(root, { ...legacy, icon: 'book' });
  assert.equal((await loadArticleSnippets(root)).categories[0].icon, 'book');
  const original = index.content;
  for (const icon of ['<svg onload="alert(1)">', '../escape', null, 1]) {
    await assert.rejects(saveSnippetCategory(root, { ...legacy, icon }), /分类图标/);
    assert.equal(index.content, original);
  }
});

test('snippet icons round-trip, old bundled snippets receive their icon, and invalid values are rejected', async () => {
  const root = new MemoryDirectoryHandle('snippet-icons');
  await loadArticleSnippets(root);
  const folder = await (await root.getDirectoryHandle('snippets')).getDirectoryHandle('default');
  const file = await folder.getFileHandle('callout.json');
  const legacy = JSON.parse(file.content);
  delete legacy.icon;
  await writeText(folder, 'callout.json', JSON.stringify(legacy));
  const loaded = (await loadArticleSnippets(root)).snippets.find(item => item.id === 'callout');
  assert.equal(loaded.icon, 'sparkles');

  await saveArticleSnippet(root, { ...loaded, icon: 'table' }, 'callout');
  assert.equal(JSON.parse(file.content).icon, 'table');
  assert.equal((await loadArticleSnippets(root)).snippets.find(item => item.id === 'callout').icon, 'table');
  for (const icon of ['<svg onload="alert(1)">', '../escape', null, 1]) {
    await assert.rejects(saveArticleSnippet(root, { ...loaded, icon }, 'callout'), /片段图标/);
    assert.equal(JSON.parse(file.content).icon, 'table');
  }
});

test('editing snippet information saves the icon with metadata and keeps its body', async () => {
  const root = new MemoryDirectoryHandle('edit-snippet-icon');
  const original = (await loadArticleSnippets(root)).snippets.find(item => item.id === 'callout');
  const edited = { ...original, id: 'callout-revised', name: '新版提示', trigger: '//callout-revised', description: '新版说明', icon: 'image' };
  await saveArticleSnippet(root, edited, original.id);
  const reloaded = (await loadArticleSnippets(root)).snippets.find(item => item.id === edited.id);
  assert.deepEqual({ name: reloaded.name, trigger: reloaded.trigger, description: reloaded.description, icon: reloaded.icon }, {
    name: edited.name, trigger: edited.trigger, description: edited.description, icon: edited.icon,
  });
  assert.equal(reloaded.content, original.content);
  assert.equal((await loadArticleSnippets(root)).snippets.some(item => item.id === original.id), false);
});

test('an id matching an Object prototype property does not become a snippet icon', async () => {
  const root = new MemoryDirectoryHandle('snippet-icon-prototype');
  await loadArticleSnippets(root);
  const saved = await saveArticleSnippet(root, { ...sampleSnippet, id: 'constructor', trigger: '//constructor', categoryId: 'default' }, null);
  assert.equal(saved.icon, undefined);
  assert.equal((await loadArticleSnippets(root)).snippets.find(item => item.id === 'constructor').icon, undefined);
});

test('template icons persist in the template, default for old files, and stay out of created articles', async () => {
  const root = new MemoryDirectoryHandle('template-icons');
  const original = (await loadArticleTemplates(root)).templates.find(item => item.id === 'tutorial');
  const folder = await (await root.getDirectoryHandle('templates')).getDirectoryHandle('default');
  const file = await folder.getFileHandle('tutorial.md');
  assert.equal(original.icon, undefined);
  assert.equal(file.content, original.source, 'reading an old template does not rewrite it');

  const updatedSource = updateFrontMatter(original.source, { templateIcon: 'book' });
  const saved = await saveArticleTemplate(root, original.id, updatedSource, original.id);
  assert.equal(saved.icon, 'book');
  assert.equal((await loadArticleTemplates(root)).templates.find(item => item.id === original.id).icon, 'book');
  assert.equal(parseArticle(file.content).metadata.templateIcon, 'book');
  const article = instantiateArticleTemplate(file.content, { now: '2026-10-01T00:00:00.000Z', theme: BASIC_THEME });
  assert.equal(parseArticle(article).metadata.templateIcon, undefined);
  assert.equal(parseArticle(article).body, parseArticle(original.source).body);

  const invalidSource = updateFrontMatter(file.content, { templateIcon: '<svg onload="alert(1)">' });
  await assert.rejects(saveArticleTemplate(root, original.id, invalidSource, original.id), /起稿模板图标/);
  assert.equal(file.content, updatedSource);
  await writeText(folder, 'tutorial.md', invalidSource);
  const invalidLibrary = await loadArticleTemplates(root);
  assert.equal(invalidLibrary.templates.find(item => item.id === original.id).icon, undefined);
  assert.ok(invalidLibrary.issues.some(issue => issue.file === 'default/tutorial.md' && issue.message.includes('图标无效')));
});


test('snippet insertion adds exactly one contextual newline and keeps the cursor aligned', () => {
  const content = '\n\n<section>▌正文</section>\n';
  for (const [source, start, prefix] of [['', 0, ''], ['前文\n//note', 3, ''], ['前文 //note', 3, '\n'], ['前文\r\n段落 //note', 8, '\r\n']]) {
    const insertion = prepareSnippetInsertion(content, source, start);
    assert.equal(insertion.text, prefix + '<section>正文</section>\n');
    assert.equal(insertion.caretOffset, prefix.length + '<section>'.length);
  }
  assert.equal(prepareSnippetInsertion('\nplain', 'before', 6).text, '\nplain');
  assert.equal(prepareSnippetInsertion('plain', 'before\n', 7).text, 'plain');
});
