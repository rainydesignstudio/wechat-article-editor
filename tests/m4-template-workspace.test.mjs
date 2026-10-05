import { withTextInputHistory } from './text-input-history-fixture.mjs';
const formatRuntime = await import('../src/lib/article-format/runtime.ts');
const sourceSearch = await import('../src/lib/sourceSearch.ts');
const sourceViewport = await import('../src/lib/sourceViewport.ts');
import * as nativeEdit from '../src/lib/nativeTextareaEdit.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import * as actualReact from 'react';

const frontMatter = await import('../src/lib/frontMatter.ts');
const libraries = await import('../src/lib/contentLibraries.ts');
const navigation = await import('../src/lib/templateNavigation.ts');
const { refreshRootSession } = await import('../src/lib/rootSession.ts');
const { BASIC_THEME, RAINY_THEME } = await import('../src/lib/themes.ts');
const composer = await import('../src/lib/snippetComposer.ts');
const highlighter = await import('../src/lib/editorSourceHighlight.ts');
const lineDiagnostics = await import('../src/lib/sourceLineDiagnostics.ts');
const contentValidation = await import('../src/lib/contentValidation.ts');
const textareaSource = await readFile(new URL('../src/components/content/SnippetTextarea.tsx', import.meta.url), 'utf8');
const textareaModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(textareaSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  exports: textareaModule.exports, module: textareaModule,
  require: withTextInputHistory(function require(id) {
      if (id.endsWith('/article-format/runtime')) return formatRuntime;
      if (id.endsWith('/sourceSearch')) return sourceSearch;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'source-input', highlightMarkdownSource: value => value };
    if (id.endsWith('/sourceSearch')) return sourceSearch;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
    if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
    if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
    if (id === 'react') return actualReact;
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react-dom') return { createPortal: children => children };
    if (id.endsWith('/nativeTextareaEdit')) return nativeEdit;
      if (id.endsWith('/snippetComposer')) return composer;
      if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon' };
    if (id.endsWith('/editorSourceHighlight')) return highlighter;
    if (id.endsWith('/sourceLineDiagnostics')) return lineDiagnostics;
    throw new Error(`Unexpected textarea import: ${id}`);
  }),
});

test('article input and its highlight overlay use the same writing font while code surfaces stay separate', () => {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(textareaSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: withTextInputHistory(function require(id) {
      if (id.endsWith('/article-format/runtime')) return formatRuntime;
      if (id.endsWith('/sourceSearch')) return sourceSearch;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'source-input', highlightMarkdownSource: value => value };
      if (id === 'react') return { forwardRef: fn => fn, useMemo: fn => fn(), useLayoutEffect() {}, useRef: value => ({ current: value }), useState: value => [value, () => {}] };
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id === 'react-dom') return { createPortal: children => children };
      if (id.endsWith('/nativeTextareaEdit')) return nativeEdit;
      if (id.endsWith('/snippetComposer')) return composer;
      if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon' };
      if (id.endsWith('/editorSourceHighlight')) return highlighter;
      if (id.endsWith('/sourceLineDiagnostics')) return lineDiagnostics;
      throw new Error(id);
    }),
  });
  const tree = module.exports.SnippetTextarea({ value: '# 一段正文', snippets: [], onChange() {} }, null);
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const nodes = walk(tree), input = nodes.find(node => node.type === 'textarea'), overlay = nodes.find(node => node.type === 'pre');
  assert.ok(input.props.className.includes('font-article-source'));
  assert.ok(overlay.props.className.includes('font-article-source'));
  assert.equal(input.props.value, '# 一段正文');
  assert.ok(!input.props.className.includes('font-editor-source'));
});
const source = await readFile(new URL('../src/components/content/ContentLibrary.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function workspace() {
  let cursor = 0;
  const cells = [];
  const effects = [];
  const calls = { saves: 0, refreshes: 0, commits: 0, writes: [], categoryWrites: [] };
  const root = { name: 'isolated-memory-library' };
  let currentRoot = root;
  let saveError = false;
  let refreshError = false;
  let deferSave;
  let formatIssues = [];
  let tree;
  let guard;
  const listeners = new Map();
  const props = {
    root, librariesState: 'ready', sessionKey: 1, themes: [BASIC_THEME], defaultTheme: BASIC_THEME,
    snippets: libraries.DEFAULT_ARTICLE_SNIPPETS.map((item) => ({ ...item })),
    snippetCategories: [{ id: 'notes', name: '笔记', description: '', order: 0 }, ...libraries.DEFAULT_SNIPPET_CATEGORIES.map(category => ({ ...category }))],
    templateCategories: libraries.DEFAULT_TEMPLATE_CATEGORIES.map(item => ({ ...item })),
    templates: libraries.DEFAULT_ARTICLE_TEMPLATES.map((item) => ({ ...item })),
    snippetIssues: [], templateIssues: [],
    isRootCurrent: (expected, epoch) => currentRoot === expected && epoch === 1,
    registerNavigationGuard(next) { guard = next; return () => { guard = null; }; },
    onSnippetsChange(expected, epoch, snippets, issues, categories) { calls.commits += 1; props.snippets = snippets; props.snippetIssues = issues; if (categories) props.snippetCategories = categories; },
    onTemplatesChange(expected, epoch, templates, issues, categories) { calls.commits += 1; props.templates = templates; props.templateIssues = issues; if (categories) props.templateCategories = categories; },
  };
  const react = {
    useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = typeof value === 'function' ? value() : value; return [cells[index], (next) => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }]; },
    useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
    useEffect(effect, dependencies) { const index = cursor++; const previous = cells[index]; if (previous && dependencies.every((item, i) => Object.is(item, previous.dependencies[i]))) return; effects.push(() => { previous?.cleanup?.(); cells[index] = { dependencies, cleanup: effect() }; }); },
  };
  const content = {
    ...libraries,
    async saveSnippetCategory(expected, value, originalId) { calls.categoryWrites.push({ kind: 'snippets', value: { ...value }, originalId }); return { ...value }; },
    async saveTemplateCategory(expected, value, originalId) { calls.categoryWrites.push({ kind: 'templates', value: { ...value }, originalId }); return { ...value }; },
    async saveArticleSnippet(expected, draft, originalId, onFormatIssues) { calls.writes.push({ kind: 'snippets', draft: { ...draft }, originalId }); calls.saves += 1; if (deferSave) await deferSave; if (saveError) throw new Error('fixture save denied'); if (formatIssues.length) onFormatIssues?.(formatIssues); return { ...draft }; },
    async saveArticleTemplate(expected, id, source, originalId, categoryId, onFormatIssues) { calls.writes.push({ kind: 'templates', draft: { id, source, categoryId }, originalId }); calls.saves += 1; if (deferSave) await deferSave; if (saveError) throw new Error('fixture save denied'); if (formatIssues.length) onFormatIssues?.(formatIssues); const metadata = frontMatter.parseArticle(source).metadata; return { id, source, name: metadata.title || id, ...(categoryId ? { categoryId } : {}), ...(typeof metadata.templateIcon === 'string' ? { icon: metadata.templateIcon } : {}) }; },
    async loadArticleTemplates() { calls.refreshes += 1; if (refreshError) throw new Error('fixture refresh failed'); return { templates: props.templates, categories: props.templateCategories, issues: [] }; },
    async loadArticleSnippets() { calls.refreshes += 1; if (refreshError) throw new Error('fixture refresh failed'); return { snippets: props.snippets, categories: props.snippetCategories, issues: [] }; },
  };
  const Dialog = (props) => jsx('dialog', props);
  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports, module, console,
    document: { body: {}, getElementById: id => ({ focus() {}, requestSubmit() {
      if (id === 'content-information-form') {
        const dialog = find(node => node.type === 'metadata-dialog');
        if (!dialog.props.busy && !dialog.props.saveDisabled) dialog.props.onSave();
      } else find(node => node.props.id === id).props.onSubmit({ preventDefault() {} });
    } }) },
    window: { location: { search: '' }, history: { state: {}, replaceState() {} }, addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); }, removeEventListener(name, callback) { listeners.get(name)?.delete(callback); } },
    require: withTextInputHistory(function require(id) {
      if (id.endsWith('/article-format/runtime')) return formatRuntime;
      if (id.endsWith('/sourceSearch')) return sourceSearch;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'source-input', highlightMarkdownSource: value => value };
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id === 'react-dom') return { createPortal: children => children };
      if (id.endsWith('/ButtonBar')) return { ButtonBar: 'button-bar' };
      if (id.endsWith('/PageHeading')) return { PageHeading: Dialog };
      if (id.endsWith('/CollapsiblePanel')) return { CollapsiblePanel: 'collapsible-panel', PanelHeading: 'panel-heading' };
      if (id.endsWith('/ContentMetadataEditor')) return { ContentMetadataEditor: 'metadata-editor' };
      if (id.endsWith('/ContentMetadataDialog')) return { ContentMetadataDialog: 'metadata-dialog' };
      if (id.endsWith('/ContentRenderPreview')) return { ContentRenderPreview: 'content-preview' };
      if (id.endsWith('/PreviewModeSwitch')) return { PreviewModeSwitch: 'preview-mode-switch' };
      if (id.endsWith('/ArticleThemeSelect')) return { ArticleThemeSelect: 'article-theme-select' };
      if (id.endsWith('/useArticlePreviewMode')) return { useArticlePreviewMode: () => ({ dark: false, toggle() {} }) };
      if (id.endsWith('/ColumnSplitter')) return { ColumnSplitter: 'column-splitter' };
      if (id.endsWith('/useResizableColumns')) return { useResizableColumns: () => ({ containerRef: { current: null }, style: {}, wideEnough: true, ratio: 50 }) };
      if (id.endsWith('/TooltipButton')) return { TooltipButton: 'tooltip-button' };
      if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon', SnippetCategoryDialog: 'category-dialog' };
      if (id.endsWith('/TemplateArticleCategoryTags')) return { TemplateArticleCategoryTags: 'article-category-tags' };
      if (id.endsWith('/frontMatter')) return frontMatter;
      if (id.endsWith('/rootSession')) return { refreshRootSession };
      if (id.endsWith('/contentLibraries')) return content;
      if (id.endsWith('/contentValidation')) return contentValidation;
      if (id.endsWith('/templateNavigation')) return navigation;
      if (id.endsWith('/DialogFrame')) return { DialogFrame: Dialog, DialogHeader: Dialog, DialogFooter: Dialog, DialogActions: Dialog, DialogButton: Dialog };
      if (id.endsWith('/UnsavedChangesDialog')) return { UnsavedChangesDialog: 'unsaved-changes-dialog' };
      if (id.endsWith('/articleFormat')) return { articleFormatMessage: (issues) => (issues ?? []).map((item) => item.message).join('；') };
      if (id.endsWith('/SnippetTextarea')) return textareaModule.exports;
      throw new Error(`Unexpected import: ${id}`);
    }),
  });
  function render() { cursor = 0; tree = module.exports.ContentLibrary(props); while (effects.length) effects.shift()(); return tree; }
  function all(node) {
    if (Array.isArray(node)) return node.flatMap((item) => all(item));
    if (!node || typeof node !== 'object' || !node.props) return [];
    return [node, ...all(node.props.children)];
  }
  function find(predicate) { const node = all(tree).find(predicate); assert.ok(node, 'Expected control exists'); return node; }
  render(); render();
  return {
    render, calls, find, props,
    get guard() { return guard; },
    set saveError(value) { saveError = value; }, set refreshError(value) { refreshError = value; },
    set deferSave(value) { deferSave = value; }, set currentRoot(value) { currentRoot = value; },
    set formatIssues(value) { formatIssues = value; },
    create(fileId = 'named-draft') {
      find(node => node.type === 'button' && node.props.onClick && node.props.className === 'button button-primary').props.onClick(); render();
      if (fileId === null) return;
      find(node => node.type === 'metadata-editor').props.onFileIdChange(fileId); render();
      find(node => node.type === 'metadata-dialog').props.onSave(); render();
      if (!props.snippetCategories.length) { find(node => node.type === 'metadata-dialog').props.onClose(); render(); }
    },
    info() { find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('编辑')).props.onClick(); render(); },
    async saveInfo() { const info = find(node => node.type === 'metadata-dialog'); if (info.props.onValidate) { await info.props.onValidate(); render(); } find(node => node.type === 'metadata-dialog').props.onSave(); render(); await new Promise(resolve => setImmediate(resolve)); render(); },
    form() { return find((node) => node.type === 'form'); },
    source() { return find((node) => node.type === 'source-input'); },
    change(text) { this.source().props.onChange(text); render(); },
    switch(tab) { find((node) => node.props.id === `template-tab-${tab}`).props.onClick(); render(); },
    async validate() { await find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('校验内容')).props.onClick(); render(); },
    async save() { await this.validate(); this.form().props.onSubmit({ preventDefault() {} }); render(); await new Promise((resolve) => setImmediate(resolve)); render(); },
    key(props = {}) { const event = { key: 's', metaKey: false, ctrlKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props }; const pending = []; for (const fn of [...(listeners.get('keydown') ?? [])]) { const result = fn(event); if (result?.then) pending.push(result); } event.completed = Promise.all(pending); render(); return event; },
    async shortcut(props = {}) { const event = this.key(props); await event.completed; render(); return event; },
  };
}

test('each tab retains its own draft and returning to a tab restores its text', () => {
  const w = workspace();
  w.create(); w.change('snippet unsaved');
  w.switch('templates'); w.create(); w.change('# template unsaved');
  w.switch('snippets'); assert.equal(w.source().props.value, 'snippet unsaved');
  w.switch('templates'); assert.equal(w.source().props.value, '# template unsaved');
});

test('library theme selection previews snippets and templates without changing their source', () => {
  const w = workspace();
  w.props.themes = [BASIC_THEME, RAINY_THEME]; w.render();
  const original = w.source().props.value;
  w.find(n => n.type === 'article-theme-select').props.onChange(RAINY_THEME.id); w.render();
  assert.equal(w.find(n => n.type === 'content-preview').props.theme.id, RAINY_THEME.id);
  assert.equal(w.source().props.value, original);
  w.switch('templates');
  assert.equal(w.find(n => n.type === 'content-preview').props.theme.id, RAINY_THEME.id);
});

test('library preview follows the saved default theme until a local choice is made', () => {
  const w = workspace();
  w.props.themes = [BASIC_THEME, RAINY_THEME];
  w.props.defaultTheme = RAINY_THEME; w.render();
  assert.equal(w.find(n => n.type === 'content-preview').props.theme.id, RAINY_THEME.id);
  w.find(n => n.type === 'article-theme-select').props.onChange(BASIC_THEME.id); w.render();
  assert.equal(w.find(n => n.type === 'content-preview').props.theme.id, BASIC_THEME.id);
});

test('new snippet and template require a filename and confirm information without any write until content save', async () => {
  for (const tab of ['snippets', 'templates']) {
    const w = workspace(); w.switch(tab); w.create(null);
    const dialog = () => w.find(n => n.type === 'metadata-dialog');
    const fields = () => w.find(n => n.type === 'metadata-editor');
    assert.equal(dialog().props.creating, true);
    assert.equal(fields().props.fileId, '');
    assert.equal(dialog().props.saveDisabled, true);
    await w.saveInfo();
    assert.equal(w.calls.saves, 0);
    fields().props.onFileIdChange('../bad'); w.render();
    assert.equal(dialog().props.saveDisabled, true);
    assert.ok(fields().props.fileError);
    fields().props.onFileIdChange(w.props[tab][0].id); w.render();
    assert.equal(dialog().props.saveDisabled, true);
    assert.match(fields().props.fileError, /已存在/);
    fields().props.onFileIdChange('chosen-file'); w.render();
    if (tab === 'snippets') fields().props.onSnippetChange({ name: 'Chosen name', trigger: '//chosen' });
    else fields().props.onMetadataChange('title', 'Chosen title');
    w.render(); w.key({ metaKey: true });
    await new Promise(resolve => setImmediate(resolve)); w.render();
    assert.equal(w.calls.saves, 0, 'confirmation and its shortcut only update memory');
    assert.equal(w.calls.commits, 0);
    w.change('# Final content'); await w.save();
    assert.equal(w.calls.saves, 1);
    const write = w.calls.writes[0];
    assert.equal(write.originalId, null);
    assert.equal(write.draft.id, 'chosen-file');
    assert.equal(tab === 'snippets' ? write.draft.content : frontMatter.parseArticle(write.draft.source).body, '# Final content');
    assert.equal(tab === 'snippets' ? write.draft.name : frontMatter.parseArticle(write.draft.source).metadata.title, tab === 'snippets' ? 'Chosen name' : 'Chosen title');
  }
});

test('saving an unnamed draft returns to filename information and preserves its content', async () => {
  const w = workspace(); w.create(null);
  w.find(n => n.type === 'metadata-dialog').props.onClose(); w.render();
  w.change('Keep unnamed draft'); await w.save();
  assert.equal(w.calls.saves, 0);
  assert.equal(w.source().props.value, 'Keep unnamed draft');
  assert.equal(w.find(n => n.type === 'metadata-editor').props.fileId, '');
});

test('renaming existing snippet and template saves metadata, reselects the new identity and retains pending body', async () => {
  for (const tab of ['snippets', 'templates']) {
    const w = workspace(); w.switch(tab);
    const oldId = w.props[tab][0].id, oldBody = w.source().props.value;
    w.change('Pending body after rename'); w.info();
    w.find(n => n.type === 'metadata-editor').props.onFileIdChange('renamed-file'); w.render();
    w.saveError = true; await w.saveInfo();
    assert.ok(w.props[tab].some(n => n.id === oldId));
    assert.equal(w.source().props.value, 'Pending body after rename');
    w.saveError = false; await w.saveInfo();
    assert.ok(!w.props[tab].some(n => n.id === oldId));
    const saved = w.props[tab].find(n => n.id === 'renamed-file');
    assert.equal(tab === 'snippets' ? saved.content : frontMatter.parseArticle(saved.source).body, oldBody);
    assert.equal(w.calls.writes.at(-1).originalId, oldId);
    assert.equal(w.source().props.value, 'Pending body after rename');
    await w.save();
    assert.equal(w.calls.writes.at(-1).originalId, 'renamed-file');
    assert.equal(w.calls.writes.at(-1).draft.id, 'renamed-file');
  }
});

test('Command+S and Control+S save only the active content draft, and unchanged or read-only content never writes', async () => {
  const w = workspace();
  assert.equal(w.key({ metaKey: true }).defaultPrevented, true);
  assert.equal(w.calls.saves, 0);
  w.change('<p>Shortcut snippet</p>');
  assert.equal((await w.shortcut({ ctrlKey: true })).defaultPrevented, true);
  assert.equal(w.calls.saves, 1);
  assert.ok(w.props.snippets.some(n => n.content === '<p>Shortcut snippet</p>'));
  w.switch('templates'); w.change('# Shortcut template');
  assert.equal((await w.shortcut({ metaKey: true, key: 'S' })).defaultPrevented, true);
  assert.equal(w.calls.saves, 2);
  assert.ok(w.props.templates.some(n => frontMatter.parseArticle(n.source).body === '# Shortcut template'));
  w.props.root = null; w.render();
  w.key({ ctrlKey: true });
  assert.equal(w.calls.saves, 2);
});

test('one save shortcut validates current content and never writes a forbidden element', async () => {
  for (const tab of ['snippets', 'templates']) {
    const w = workspace(); w.switch(tab); w.change('<script>可执行内容</script>');
    await w.shortcut({ ctrlKey: true });
    assert.equal(w.calls.saves, 0);
    assert.equal(w.source().props.value, '<script>可执行内容</script>');
    assert.ok(w.find(n => n.props['data-tone'] === 'error').props.children.includes('script'));
    w.change('<p>修复后的内容</p>');
    await w.shortcut({ metaKey: true });
    assert.equal(w.calls.saves, 1);
    await w.shortcut({ metaKey: true });
    assert.equal(w.calls.saves, 1, 'unchanged content is not written again');
  }
});

test('saving shows progress and keeps format concerns in the final result after refresh', async () => {
  const w = workspace(); w.change('<p>保存状态</p>'); await w.validate();
  w.formatIssues = [{ kind: 'style', name: 'height', tier: 'lowPriority', message: '保留的需核对提示' }];
  let complete; w.deferSave = new Promise(resolve => { complete = resolve; });
  const saving = w.shortcut({ ctrlKey: true }); w.render();
  assert.equal(w.find(n => n.props['data-tone'] === 'neutral').props.children, '正在保存…');
  complete(); await saving;
  const final = w.find(n => n.props['data-tone'] === 'warning').props.children;
  assert.ok(final.includes('已保存') && final.includes('保留的需核对提示'));
  assert.equal(w.calls.refreshes, 1);
});

test('save shortcuts respect composition, repeat, alternate modifiers, confirmation dialogs and the write lock', async () => {
  const w = workspace();
  w.change('Shortcut protected');
  for (const key of [{ metaKey: true, isComposing: true }, { ctrlKey: true, repeat: true }, { ctrlKey: true, keyCode: 229 }, { metaKey: true, altKey: true }, { ctrlKey: true, shiftKey: true }, {}]) w.key(key);
  assert.equal(w.calls.saves, 0);
  w.find(n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children.includes('取消编辑')).props.onClick(); w.render();
  assert.equal(w.key({ metaKey: true }).defaultPrevented, true);
  assert.equal(w.calls.saves, 0);
  w.find(n => n.type === 'unsaved-changes-dialog').props.onCancel(); w.render();
  await w.validate();
  let resolveSave;
  w.deferSave = new Promise(resolve => { resolveSave = resolve; });
  w.key({ metaKey: true }); w.key({ ctrlKey: true });
  assert.equal(w.calls.saves, 1);
  resolveSave(); await new Promise(resolve => setImmediate(resolve)); w.render();
});

test('information shortcut saves metadata without saving a pending body, and failures keep the dialog and draft', async () => {
  const w = workspace();
  const original = w.source().props.value;
  w.change('Pending shortcut body'); w.info();
  w.find(n => n.type === 'metadata-editor').props.onSnippetChange({ name: 'Shortcut information' }); w.render();
  w.saveError = true; await w.shortcut({ metaKey: true });
  assert.ok(w.find(n => n.type === 'metadata-dialog').props.error.includes('fixture save denied'));
  assert.equal(w.source().props.value, 'Pending shortcut body');
  w.saveError = false; await w.shortcut({ ctrlKey: true });
  assert.equal(w.props.snippets.find(n => n.name === 'Shortcut information').content, original);
  assert.equal(w.source().props.value, 'Pending shortcut body');
});

test('failed saving retains the draft and never commits a library change', async () => {
  const w = workspace();
  w.create(); w.change('protected draft'); w.saveError = true;
  await w.save();
  assert.equal(w.source().props.value, 'protected draft');
  assert.equal(w.calls.saves, 1);
  assert.equal(w.calls.commits, 0);
  assert.equal(w.calls.refreshes, 0);
});

test('a successful write followed by failed refresh clears the draft and retry only reads', async () => {
  const w = workspace();
  w.create(); w.change('saved content'); w.refreshError = true;
  await w.save();
  assert.equal(w.calls.saves, 1);
  assert.equal(w.calls.commits, 1);
  assert.equal(w.calls.refreshes, 1);
  const retry = w.find((node) => node.type === 'button' && node.props.children === '重试刷新列表');
  w.refreshError = false;
  await retry.props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); w.render();
  assert.equal(w.calls.saves, 1);
  assert.equal(w.calls.refreshes, 2);
});

test('a stale directory completion cannot update the current library', async () => {
  const w = workspace();
  let resolveSave;
  w.deferSave = new Promise((resolve) => { resolveSave = resolve; });
  w.create(); w.change('old directory draft');
  w.form().props.onSubmit({ preventDefault() {} }); w.render();
  assert.equal(w.find((node) => node.props.id === 'template-tab-templates').props.disabled, true);
  w.currentRoot = { name: 'another-directory' };
  resolveSave(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(w.calls.commits, 0);
  assert.equal(w.calls.refreshes, 0);
});

test('leaving with two drafts requires consent and cancel keeps both drafts', () => {
  const w = workspace();
  w.create(); w.change('keep me');
  let left = false;
  assert.equal(w.guard(() => { left = true; }), true); w.render();
  assert.equal(left, false);
  w.find((node) => node.type === 'unsaved-changes-dialog').props.onCancel(); w.render();
  assert.equal(w.source().props.value, 'keep me');
});


test('source editing starts on the first change and metadata opens separately without changing the source layout', () => {
  const w = workspace(); w.switch('templates');
  const readonlyForm = w.form().props.className;
  assert.equal(w.source().props.readOnly, false);
  assert.equal(w.source().props.ariaLabel, '起稿模板源码预览');
  const text = w.source().props.value;
  w.info();
  assert.equal(w.find(n => n.type === 'metadata-dialog').props.kind, 'templates');
  assert.equal(w.source().props.readOnly, false);
  assert.equal(w.source().props.value, text);
  w.find(n => n.type === 'metadata-dialog').props.onClose(); w.render();
  w.change(text + 'Changed');
  assert.equal(w.source().props.ariaLabel, '起稿模板源码编辑');
  assert.equal(w.form().props.className, readonlyForm);
  const save = w.find(node => node.type === 'button' && node.props.type === 'submit');
  assert.ok(save.props.children.some(child => child?.props?.name === 'save'));
  assert.equal(w.calls.saves, 0);
});


test('save and leave saves both tab drafts; failed saving never proceeds', async () => {
  const w = workspace();
  w.create(); w.change('pending snippet'); w.switch('templates'); w.create();
  let left = false;
  w.guard(() => { left = true; }); w.render();
  const modal = () => w.find(node => node.type === 'unsaved-changes-dialog');
  assert.equal(modal().props.entries.length, 2);
  w.saveError = true;
  assert.equal(await modal().props.onSave(), false); w.render();
  assert.equal(left, false);
  assert.equal(w.source().props.readOnly, false);
  w.saveError = false;
  assert.equal(await modal().props.onSave(), true); w.render();
  assert.equal(left, true);
  assert.equal(w.calls.saves, 3);
  assert.equal(w.calls.commits, 4, 'publish and refresh for each saved library');
  assert.equal(w.guard(() => {}), false);
});

test('library categories start collapsed on both tabs and retain independent expansion', () => {
  const w = workspace();
  const list = () => w.find(n => n.props['aria-label']?.endsWith('列表滚动区'));
  assert.ok(list().props.className.includes('flex-col'));
  assert.ok(list().props.className.includes('overflow-y-auto'));
  const category = w.find(n => n.type === 'collapsible-panel' && n.props.id === 'snippet-category-notes');
  assert.ok(category.props.className.includes('shrink-0'));
  assert.ok(category.props.contentClassName.includes('shrink-0'));
  assert.equal(category.props.open, false);
  assert.equal(w.find(n => n.props.id === 'snippet-category-default').props.open, false);
  category.props.onToggle(); w.render();
  assert.equal(w.find(n => n.props.id === 'snippet-category-notes').props.open, true);
  w.switch('templates');
  assert.ok(list().props.className.includes('overflow-y-auto'));
  const templateCategory = w.find(n => n.type === 'collapsible-panel' && n.props.id === 'template-category-default');
  assert.ok(templateCategory.props.className.includes('shrink-0'));
  assert.equal(templateCategory.props.count, 3);
  assert.equal(templateCategory.props.open, false);
  assert.equal(w.find(n => n.props.id === 'template-category-theme-samples').props.open, false);
  assert.ok(templateCategory.props.children[1].props.children[0].every(n => n.type === 'div' && n.props.children[0].type === 'panel-heading' && n.props.children[0].props.details));
  templateCategory.props.onToggle(); w.render();
  assert.equal(w.find(n => n.props.id === 'template-category-default').props.open, true);
  w.switch('snippets');
  assert.equal(w.find(n => n.props.id === 'snippet-category-notes').props.open, true);
});

test('a new snippet without a category cannot write and retains its source', async () => {
  const w = workspace(); w.props.snippetCategories = []; w.render();
  w.create(); w.change('retain draft');
  assert.equal(w.find(n => n.type === 'button' && n.props.type === 'submit').props.disabled, true);
  await w.save();
  assert.equal(w.calls.saves, 0);
  assert.equal(w.source().props.value, 'retain draft');
});

test('new manuscript menu only changes the themed preview until creation is confirmed', async () => {
  const templateSource = await readFile(new URL('../src/components/content/TemplateDialog.tsx', import.meta.url), 'utf8');
  let cursor = 0, tree, closed = 0; const cells = [], created = [];
  const state = value => { const index = cursor++; if (!(index in cells)) cells[index] = value; return [cells[index], next => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }]; };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(templateSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: withTextInputHistory(function require(id) {
      if (id.endsWith('/article-format/runtime')) return formatRuntime;
      if (id.endsWith('/sourceSearch')) return sourceSearch;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'source-input', highlightMarkdownSource: value => value };
      if (id === 'react') return { useState: state };
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/frontMatter')) return frontMatter;
      if (id.endsWith('/themes')) return { BASIC_THEME };
      if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog', DialogHeader: 'header', DialogActions: 'actions', DialogButton: 'button' };
      if (id.endsWith('/CollapsiblePanel')) return { CollapsiblePanel: 'category-panel', PanelHeading: 'menu-heading' };
      if (id.endsWith('/PreviewModeSwitch')) return { PreviewModeSwitch: 'mode-switch' };
      if (id.endsWith('/ArticleThemeSelect')) return { ArticleThemeSelect: 'article-theme-select' };
      if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon' };
      if (id.endsWith('/TemplateArticleCategoryTags')) return { TemplateArticleCategoryTags: 'article-category-tags' };
      if (id.endsWith('/useArticlePreviewMode')) return { useArticlePreviewMode: () => { const [dark, setDark] = state(false); return { dark, toggle: () => setDark(v => !v) }; } };
      if (id.endsWith('/ContentRenderPreview')) return { ContentRenderPreview: 'content-preview' };
      throw new Error(id);
    }),
  });
  const good = { ...libraries.DEFAULT_ARTICLE_TEMPLATES[0], icon: 'book', source: frontMatter.updateFrontMatter(libraries.DEFAULT_ARTICLE_TEMPLATES[0].source, { categories: ['写作', '教程'] }) };
  const selectedTheme = { ...BASIC_THEME, name: '当前主题' };
  const props = { templates: [good, { id: 'invalid', name: '损坏', source: '---\ntitle: [bad\n---\nbody' }], categories: [...libraries.DEFAULT_TEMPLATE_CATEGORIES, { id: 'other', name: '其他', description: '', order: 1 }], themes: [selectedTheme, RAINY_THEME], defaultTheme: selectedTheme, onClose: () => closed++, onCreate: (template, theme) => created.push({ template, theme }) };
  const walk = n => Array.isArray(n) ? n.flatMap(walk) : n?.props ? [n, ...walk(n.props.children)] : [];
  const render = () => { cursor = 0; tree = module.exports.TemplateDialog(props); };
  const find = f => { const n = walk(tree).find(f); assert.ok(n); return n; };
  render();
  assert.equal(find(n => n.type === 'dialog').props.large, true);
  assert.equal(walk(tree).filter(n => n.type === 'menu-heading').length, 2);
  assert.equal(find(n => n.type === 'menu-heading' && n.props.title === good.name).props.icon.props.name, 'book');
  assert.deepEqual(Array.from(find(n => n.type === 'menu-heading' && n.props.title === good.name).props.details.props.categories), ['写作', '教程']);
  assert.equal(find(n => n.type === 'content-preview').props.theme, selectedTheme);
  assert.equal(find(n => n.type === 'content-preview').props.bare, true);
  assert.equal(find(n => n.type === 'category-panel' && n.props.title === '默认').props.open, false);
  assert.equal(find(n => n.type === 'category-panel' && n.props.title === '其他').props.open, false);
  find(n => n.type === 'category-panel' && n.props.title === '其他').props.onToggle(); render();
  assert.equal(find(n => n.type === 'category-panel' && n.props.title === '其他').props.open, true);
  find(n => n.type === 'article-theme-select').props.onChange(RAINY_THEME.id); render();
  assert.equal(find(n => n.type === 'content-preview').props.theme.id, RAINY_THEME.id);
  const illustration = find(n => n.type === 'content-preview').props.source;
  find(n => n.type === 'menu-heading' && n.props.title === good.name).props.onClick(); render();
  assert.equal(created.length, 0);
  assert.equal(find(n => n.type === 'content-preview').props.source, frontMatter.parseArticle(good.source).body);
  find(n => n.type === 'mode-switch').props.onToggle(); render();
  assert.equal(find(n => n.type === 'content-preview').props.dark, true);
  find(n => n.type === 'button' && n.props.variant === 'primary').props.onClick();
  assert.equal(created[0].template, good);
  assert.equal(created[0].theme.id, RAINY_THEME.id);
  find(n => n.type === 'menu-heading' && n.props.title === '空白文章').props.onClick(); render();
  assert.equal(find(n => n.type === 'content-preview').props.source, illustration);
  find(n => n.type === 'button' && n.props.variant === 'primary').props.onClick();
  assert.equal(created[1].template, null);
  assert.equal(created[1].theme.id, RAINY_THEME.id);
  find(n => n.type === 'header').props.onClose();
  assert.equal(closed, 1);
});


test('snippet and template descriptions and identities live inside the selectable card', () => {
  const w = workspace();
  for (const tab of ['snippets', 'templates']) {
    w.switch(tab);
    const target = w.props[tab][1];
    const card = w.find(n => n.type === 'panel-heading' && n.props['aria-label'] === target.name);
    assert.ok(card.props.details, 'description and identity belong to the button');
    card.props.onClick(); w.render();
    const expected = tab === 'snippets' ? target.content : frontMatter.parseArticle(target.source).body;
    assert.equal(w.source().props.value, expected);
  }
});

test('template library cards show their article categories apart from template grouping', () => {
  const w = workspace();
  const target = w.props.templates[1];
  w.props.templates[1] = { ...target, source: frontMatter.updateFrontMatter(target.source, { categories: ['写作', '教程'] }) };
  w.switch('templates');
  const card = w.find(n => n.type === 'panel-heading' && n.props['aria-label'] === target.name);
  const tags = card.props.details.props.children[1];
  assert.equal(tags.type, 'article-category-tags');
  assert.deepEqual(Array.from(tags.props.categories), ['写作', '教程']);
  assert.equal(card.props['aria-description'], '文章分类：写作、教程');
  const emptyCard = w.find(n => n.type === 'panel-heading' && n.props['aria-label'] === w.props.templates[0].name);
  assert.deepEqual(Array.from(emptyCard.props.details.props.children[1].props.categories), []);
  assert.equal(emptyCard.props['aria-description'], '文章分类：未设置');
});

test('template article category tags render values and an explicit empty state', async () => {
  const source = await readFile(new URL('../src/components/content/TemplateArticleCategoryTags.tsx', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: withTextInputHistory(function require(id) {
      if (id.endsWith('/article-format/runtime')) return formatRuntime;
      if (id.endsWith('/sourceSearch')) return sourceSearch;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'source-input', highlightMarkdownSource: value => value }; if (id === 'react/jsx-runtime') return { jsx, jsxs }; throw new Error(id); }),
  });
  const text = node => typeof node === 'string' ? [node] : Array.isArray(node) ? node.flatMap(text) : node?.props ? text(node.props.children) : [];
  assert.deepEqual(Array.from(text(module.exports.TemplateArticleCategoryTags({ categories: [' 写作 ', '教程'] }))), ['文章分类', '写作', '教程']);
  assert.deepEqual(Array.from(text(module.exports.TemplateArticleCategoryTags({ categories: [] }))), ['文章分类', '未设置']);
});

test('each snippet and template card has a 300ms hover edit button that opens its own information dialog', () => {
  const w = workspace();
  for (const tab of ['snippets', 'templates']) {
    w.switch(tab);
    const target = w.props[tab][1];
    const row = w.find(n => n.type === 'div' && n.props.className?.includes('group/entry') && n.props.children[0]?.props['aria-label'] === target.name);
    const card = row.props.children[0], editButton = row.props.children[1];
    assert.equal(card.type, 'panel-heading');
    assert.equal(card.props.reserveAction, true);
    assert.equal(editButton.type, 'tooltip-button');
    assert.match(editButton.props.className, /duration-300/);
    assert.match(editButton.props.className, /group-hover\/entry:opacity-100/);
    assert.match(editButton.props.className, /group-focus-within\/entry:opacity-100/);
    assert.equal(editButton.props['aria-label'], `编辑${tab === 'snippets' ? '片段' : '起稿模板'}「${target.name}」`);
    editButton.props.onClick(); w.render();
    assert.equal(w.find(n => n.type === 'metadata-editor').props.fileId, target.id);
    w.find(n => n.type === 'metadata-dialog').props.onClose(); w.render();
  }
});

test('list edit action protects a dirty draft before opening another item', () => {
  const w = workspace();
  w.change('<p>Uncommitted edit</p>');
  const current = w.props.snippets[0];
  w.find(n => n.type === 'tooltip-button' && n.props['aria-label'] === `编辑片段「${current.name}」`).props.onClick(); w.render();
  assert.equal(w.find(n => n.type === 'metadata-editor').props.fileId, current.id);
  assert.equal(w.source().props.value, '<p>Uncommitted edit</p>');
  w.find(n => n.type === 'metadata-dialog').props.onClose(); w.render();
  const target = w.props.snippets[1];
  w.find(n => n.type === 'tooltip-button' && n.props['aria-label'] === `编辑片段「${target.name}」`).props.onClick(); w.render();
  assert.equal(w.source().props.value, '<p>Uncommitted edit</p>');
  w.find(n => n.type === 'unsaved-changes-dialog').props.onDiscard(); w.render();
  assert.equal(w.find(n => n.type === 'metadata-editor').props.fileId, target.id);
});

test('snippet and template detail titles use base size and stack above their file identity', () => {
  const w = workspace();
  for (const tab of ['snippets', 'templates']) {
    w.switch(tab);
    const heading = w.form().props.children[0].props.children[0];
    assert.match(heading.props.className, /flex-col/);
    assert.doesNotMatch(heading.props.children[0].props.className, /text-lg/);
    assert.match(heading.props.children[1].props.className, /break-all/);
  }
});

test('category editing opens with existing metadata and icon changes remain a draft until saving', () => {
  const w = workspace();
  w.props.snippetCategories[0].icon = 'book'; w.render();
  w.find(n => n.type === 'collapsible-panel' && n.props.id === 'snippet-category-notes').props.headingActions.props.onClick(); w.render();
  const dialog = () => w.find(n => n.type === 'category-dialog');
  assert.equal(dialog().props.value.icon, 'book');
  dialog().props.onChange({ ...dialog().props.value, icon: 'quote' }); w.render();
  assert.equal(dialog().props.value.icon, 'quote');
  assert.equal(w.props.snippetCategories[0].icon, 'book');
  dialog().props.onClose(); w.render();
  assert.equal(w.calls.commits, 0);
});

test('both tabs expose category creation and category rename retains pending source and updates its folder identity', async () => {
  for (const tab of ['snippets', 'templates']) {
    const w = workspace(); w.switch(tab);
    w.find(n => n.type === 'button' && n.props.children?.includes?.('新建分类')).props.onClick(); w.render();
    let dialog = w.find(n => n.type === 'category-dialog');
    assert.equal(dialog.props.kind, tab);
    assert.equal(dialog.props.value.id, '');
    dialog.props.onClose(); w.render();
    w.change('Protected category body');
    const oldId = w.props[tab][0].categoryId;
    const prefix = tab === 'snippets' ? 'snippet' : 'template';
    w.find(n => n.type === 'collapsible-panel' && n.props.id === `${prefix}-category-${oldId}`).props.headingActions.props.onClick(); w.render();
    dialog = w.find(n => n.type === 'category-dialog');
    dialog.props.onChange({ ...dialog.props.value, id: 'renamed-folder', name: 'New category' }); w.render();
    w.find(n => n.type === 'category-dialog').props.onSave();
    await new Promise(resolve => setImmediate(resolve)); w.render();
    assert.equal(w.calls.categoryWrites[0].originalId, oldId);
    assert.equal(w.calls.categoryWrites[0].kind, tab);
    assert.equal(w.source().props.value, 'Protected category body');
    assert.ok(w.props[tab].some(item => item.categoryId === 'renamed-folder'));
    w.info();
    assert.equal(w.find(n => n.type === 'metadata-editor').props.categoryId, 'renamed-folder');
    w.find(n => n.type === 'metadata-dialog').props.onClose(); w.render();
    await w.save();
    assert.equal(w.calls.writes[0].draft.categoryId, 'renamed-folder');
  }
});


test('saving template information preserves metadata and keeps unsaved body changes independent', async () => {
  const w = workspace();
  const original = '---\n# keep me\ntitle: Old\nauthor: Rainy\ncustom: preserved\ncreatedAt: "2020-01-01"\nupdatedAt: "2020-01-02"\ntheme: { id: basic, version: 1.0.0 }\n---\n\n# Original body\n';
  w.props.templates = [{ id: 'controlled', name: 'Old', source: original }]; w.switch('templates');
  assert.equal(w.source().props.value, '\n# Original body\n');
  w.change('# Changed body\n');
  w.info();
  const fields = () => w.find(n => n.type === 'metadata-editor');
  fields().props.onMetadataChange('title', ''); w.render();
  assert.equal(fields().props.inputs.title, '');
  fields().props.onMetadataChange('title', 'New'); w.render();
  fields().props.onMetadataChange('categories', 'A, B,'); w.render();
  assert.equal(fields().props.inputs.categories, 'A, B,');
  await w.saveInfo();
  assert.equal(frontMatter.parseArticle(w.props.templates[0].source).body, '\n# Original body\n');
  assert.equal(w.source().props.value, '# Changed body\n');
  const preview = w.find(n => n.type === 'content-preview');
  assert.equal(preview.props.source, '# Changed body\n');
  const guard = w.guard;
  assert.equal(guard(() => {}), true); w.render();
  assert.equal(w.find(n => n.type === 'unsaved-changes-dialog').props.entries[0].label, 'New');
  // Inspect the saved source through the existing save callback, not a second metadata model.
  await w.save();
    const stored = w.props.templates[0].source;
    assert.ok(stored.includes('# keep me'));
    const parsed = frontMatter.parseArticle(stored);
    assert.equal(parsed.body, '# Changed body\n');
    assert.equal(parsed.metadata.custom, 'preserved');
    assert.equal(parsed.metadata.createdAt, '2020-01-01');
    assert.equal(parsed.metadata.updatedAt, '2020-01-02');
    assert.equal(parsed.metadata.theme.id, 'basic');
    assert.deepEqual(parsed.metadata.categories, ['A', 'B']);
});

test('template icon changes save through the information dialog and preserve a pending body edit', async () => {
  const w = workspace();
  w.switch('templates');
  const original = w.props.templates[0];
  w.change('# Unsaved body\n');
  w.info();
  const fields = () => w.find(n => n.type === 'metadata-editor');
  assert.equal(fields().props.metadata.templateIcon, undefined);
  fields().props.onTemplateIconChange('sparkles'); w.render();
  assert.equal(fields().props.metadata.templateIcon, 'sparkles');
  await w.saveInfo();
  const saved = w.props.templates.find(item => item.id === original.id);
  assert.equal(saved.icon, 'sparkles');
  assert.equal(frontMatter.parseArticle(saved.source).metadata.templateIcon, 'sparkles');
  assert.equal(frontMatter.parseArticle(saved.source).body, frontMatter.parseArticle(original.source).body);
  assert.equal(w.source().props.value, '# Unsaved body\n');
});

test('invalid template metadata is repaired in the information dialog, never mixed into the body or rendered', async () => {
  const w = workspace();
  const source = '---\ntitle: [broken\n---\n# Kept body\n';
  w.props.templates = [{ id: 'broken', name: 'Broken', source }]; w.switch('templates');
  assert.equal(w.source().props.value, '# Kept body\n');
  assert.equal(w.source().props.disabled, true);
  assert.equal(w.find(n => n.type === 'content-preview').props.blocked, true);
  w.find(n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children.includes('编辑')).props.onClick(); w.render();
  const repair = w.find(n => n.props['aria-label'] === '起稿模板元数据修复');
  assert.equal(repair.props.value, '---\ntitle: [broken\n---\n');
  repair.props.onChange({ target: { value: '---\ntitle: Fixed\n---\n' } }); w.render();
  assert.equal(w.source().props.disabled, true);
  await w.saveInfo();
  assert.equal(w.source().props.value, '# Kept body\n');
  assert.equal(w.source().props.disabled, false);
  assert.equal(w.find(n => n.type === 'content-preview').props.blocked, false);
});

test('information cancellation and failed saving retain source drafts; successful information saving writes only metadata', async () => {
  const w = workspace();
  const original = w.source().props.value;
  w.change('<p>Unsaved source</p>');
  w.info();
  assert.equal(w.find(n => n.type === 'metadata-dialog').props.saveDisabled, true, 'source changes do not enable metadata saving');
  w.find(n => n.type === 'metadata-editor').props.onSnippetChange({ name: 'Cancelled title' }); w.render();
  w.find(n => n.type === 'metadata-dialog').props.onClose(); w.render();
  assert.equal(w.source().props.value, '<p>Unsaved source</p>');
  assert.equal(w.calls.saves, 0);
  w.info();
  w.find(n => n.type === 'metadata-editor').props.onSnippetChange({ name: 'Saved information', icon: 'table' }); w.render();
  w.saveError = true;
  await w.saveInfo();
  assert.ok(w.find(n => n.type === 'metadata-dialog').props.error.includes('fixture save denied'));
  assert.equal(w.source().props.value, '<p>Unsaved source</p>');
  assert.equal(w.calls.commits, 0);
  assert.equal(w.find(n => n.type === 'metadata-editor').props.snippet.icon, 'table');
  w.saveError = false;
  await w.saveInfo();
  const stored = w.props.snippets.find(n => n.name === 'Saved information');
  assert.equal(stored.icon, 'table');
  assert.equal(stored.content, original);
  assert.equal(w.source().props.value, '<p>Unsaved source</p>');
  w.find(n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children.includes('取消编辑')).props.onClick(); w.render();
  w.find(n => n.type === 'unsaved-changes-dialog').props.onDiscard(); w.render();
  assert.equal(w.source().props.value, original);
  assert.equal(w.props.snippets.find(n => n.id === stored.id).name, 'Saved information');
});

test('read-only presets cannot create source drafts and saving is disabled until content changes', () => {
  const w = workspace();
  assert.equal(w.find(n => n.type === 'button' && n.props.type === 'submit').props.disabled, true);
  w.props.root = null; w.render();
  const original = w.source().props.value;
  assert.equal(w.source().props.readOnly, true);
  w.change('must not become a draft');
  assert.equal(w.source().props.value, original);
  assert.equal(w.guard(() => {}), false);
});


test('contextual snippet expansion inserts the newline and content as one reversible edit', () => {
  const original = 'Before //note';
  const snippet = { id: 'note', name: 'Note', trigger: '//note', description: '', content: '<p>▌safe</p>\n' };
  let cells = [], cursor = 0, changes = [], commands = [], frames = [], compilations = [];
  const element = { value: original, selectionStart: original.length, selectionEnd: original.length, focus() {}, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  const module = { exports: {} };
  const react = {
    forwardRef: fn => fn, useMemo: fn => fn(), useLayoutEffect() {},
    useRef(value) { const i = cursor++; return cells[i] ??= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in cells)) cells[i] = value; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
  };
  let input;
  const context = {
    module, exports: module.exports, requestAnimationFrame: fn => frames.push(fn),
    document: { execCommand(command, _ui, text) {
      commands.push({ command, text });
      if (command === 'insertText') element.value = element.value.slice(0, element.selectionStart) + text + element.value.slice(element.selectionEnd);
      if (command === 'undo') element.value = original;
      input.props.onChange({ currentTarget: element });
      return true;
    } },
    require: withTextInputHistory(function require(id) {
      if (id.endsWith('/article-format/runtime')) return formatRuntime;
      if (id.endsWith('/sourceSearch')) return sourceSearch;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'source-input', highlightMarkdownSource: value => value };
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id === 'react-dom') return { createPortal: children => children };
      if (id.endsWith('/nativeTextareaEdit')) return nativeEdit;
      if (id.endsWith('/snippetComposer')) return composer;
      if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon' };
      if (id.endsWith('/editorSourceHighlight')) return highlighter;
      if (id.endsWith('/sourceLineDiagnostics')) return lineDiagnostics;
      throw new Error(id);
    }),
  };
  element.ownerDocument = context.document;
  vm.runInNewContext(ts.transpileModule(textareaSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const tree = module.exports.SnippetTextarea({ value: original, snippets: [snippet], onChange: value => changes.push(value), onSnippetInserted: () => compilations.push(changes.at(-1)) }, null);
  const walk = n => Array.isArray(n) ? n.flatMap(walk) : n?.props ? [n, ...walk(n.props.children)] : [];
  input = walk(tree).find(n => n.type === 'textarea'); input.props.ref(element);
  input.props.onKeyDown({ key: ' ', currentTarget: element, nativeEvent: { isComposing: false }, preventDefault() {} });
  assert.deepEqual(commands, [{ command: 'insertText', text: '\n<p>safe</p>\n' }]);
  assert.equal(changes.at(-1), 'Before \n<p>safe</p>\n');
  assert.deepEqual(compilations, ['Before \n<p>safe</p>\n'], 'snippet completion compiles the updated source once');
  frames.forEach(fn => fn());
  assert.equal(element.selectionStart, 'Before \n<p>'.length);
  // One simulated native undo restores the trigger and the contextual newline together.
  context.document.execCommand('undo');
  assert.equal(changes.at(-1), original);
});
