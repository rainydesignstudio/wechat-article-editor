import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { summarizeArticleListChecks, articleListCheckResult } from '../src/lib/articleListChecks.ts';
import { parseArticle, createArticleSource, updateFrontMatter } from '../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { availableArticleThemeUpdate } from '../src/lib/articleThemeUpdate.ts';
import { createDefaultEditorWorkspace, getArticleOrganization, moveArticleToProject, orderArticlesForGroup, setArticleArchived } from '../src/lib/editorWorkspace.ts';

const source = await readFile(new URL('../src/components/articles/ArticlesPage.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function article(folder, title) {
  return { id: `2026-09/${folder}`, folder, month: '2026-09', theme: BASIC_THEME, themeValid: true,
    parse: { metadata: { title, description: '', categories: [], updatedAt: '2026-09-30T10:00:00Z' }, diagnostics: [] } };
}

function page(collection = 'all', options = {}) {
  const articles = [article('alpha', '甲文稿'), article('beta', '乙文稿')];
  const workspace = createDefaultEditorWorkspace();
  workspace.projects = [{ id: 'project-one', name: '项目一', pinned: false, collapsed: false }];
  workspace.projectOrder = ['project-one'];
  if (collection === 'archived') workspace.articleOrganization = Object.fromEntries(articles.map(item => [item.id, { projectId: null, archived: true }]));
  const archived = [], classified = [], deleted = [], opened = [];
  const props = { articles, allArticles: articles, themes: [BASIC_THEME], currentId: articles[0].id,
    directory: { name: 'test-only' }, directoryName: '测试目录', rememberedDirectoryName: null, directoryRestoreState: 'idle',
    collection, collectionTitle: collection === 'archived' ? '归档文章' : '全部文章', workspace, busy: false,
    indexMonths: ['2026-09'], indexIssues: [], checks: {}, listNotice: { label: '', tone: 'neutral' }, listWork: null, onCheck: async () => {}, onCancelCheck() {}, onRebuildIndexes: async () => {}, onRemoveCategories: async () => true, onNew() {}, onRefresh() {}, onOpen: item => opened.push(item), onInfo() {},
    onArchive() {}, onArchiveMany: (items, next) => archived.push([items, next]),
    onClassifyMany: (items, projectId) => { classified.push([items, projectId]); return Promise.resolve(true); },
    onFork() {}, onDelete() {}, onDeleteMany: items => deleted.push(items), onGoToSettings() {}, onReopenRememberedDirectory() {} };
  Object.assign(props, options);
  const cells = []; let cursor = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, document: { body: {} }, require(id) {
    if (id === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
      useMemo(calculate) { cursor++; return calculate(); },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
      useEffect() { cursor++; },
    };
    if (id === 'react-dom') return { createPortal: node => node };
    if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog-frame', DialogHeader: 'dialog-header', DialogActions: 'dialog-actions', DialogButton: 'dialog-button' };
    if (id.endsWith('/articleListChecks')) return { summarizeArticleListChecks };
    if (id.endsWith('/PageHeading')) return { PageHeading: 'header' };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/ButtonBar')) return { ButtonBar: 'button-bar' };
    if (id.endsWith('/editorWorkspace')) return { getArticleOrganization };
    if (id.endsWith('/articleThemeUpdate')) return { availableArticleThemeUpdate };
    if (id.endsWith('/ThemeUpdateTag')) return { ThemeUpdateTag: 'theme-update-tag' };
    if (id.endsWith('/ArticleActionsMenu')) return { ArticleActionsMenu: 'article-menu' };
    throw new Error(`Unexpected import ${id}`);
  } });
  function all(node) { if (Array.isArray(node)) return node.flatMap(all); if (!node?.props) return []; return [node, ...all(node.props.children)]; }
  function text(node) { if (Array.isArray(node)) return node.map(text).join(''); if (node?.props) return text(node.props.children); return typeof node === 'string' || typeof node === 'number' ? String(node) : ''; }
  function render() { cursor = 0; return all(module.exports.ArticlesPage(props)); }
  function control(label) { const node = render().find(item => ['button', 'dialog-button'].includes(item.type) && text(item) === label); assert.ok(node, `Missing ${label}`); return node; }
  return { articles: props.articles, props, archived, classified, deleted, opened, render, control, text };
}

test('multi-select uses the whole row, hides menus, and offers project and archive actions', () => {
  const view = page();
  assert.equal(view.render().filter(node => node.type === 'article-menu').length, 2);
  view.render().find(node => node.props?.['aria-label'] === '进入多选模式').props.onClick();
  let rows = view.render().filter(node => node.type === 'article');
  assert.equal(rows.length, 2);
  assert.ok(rows.every(node => node.props.role === 'checkbox' && node.props['data-selection-opacity'] === 'muted'));
  assert.equal(view.render().filter(node => node.type === 'article-menu').length, 0);
  rows[0].props.onClick();
  rows = view.render().filter(node => node.type === 'article');
  assert.equal(rows[0].props['aria-checked'], true);
  assert.equal(rows[0].props['data-selection-opacity'], 'full');
  assert.equal(rows[1].props['data-selection-opacity'], 'muted');
  assert.equal(view.opened.length, 0);
  view.control('归档').props.onClick();
  assert.deepEqual(view.archived, [[[view.articles[0]], true]]);
  view.control('分组至').props.onClick();
  view.control('项目一').props.onClick();
  assert.deepEqual(view.classified, [[[view.articles[0]], 'project-one']]);
  view.render().find(node => node.props?.['aria-label'] === '退出多选模式').props.onClick();
  assert.equal(view.render().filter(node => node.type === 'article-menu').length, 2);
});

test('archived selection offers restore and confirmed deletion', () => {
  const view = page('archived');
  view.render().find(node => node.props?.['aria-label'] === '进入多选模式').props.onClick();
  const row = view.render().find(node => node.type === 'article');
  let prevented = false;
  row.props.onKeyDown({ key: ' ', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(view.render().find(node => node.type === 'article').props['aria-checked'], true);
  view.control('取消归档').props.onClick();
  assert.deepEqual(view.archived, [[[view.articles[0]], false]]);
  view.control('删除').props.onClick();
  assert.deepEqual(view.deleted, [[view.articles[0]]]);
  assert.equal(view.render().some(node => node.type === 'button' && node.props.children === '分组至'), false);
});

const controllerSource = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
function controllerAction(startMarker, endMarker, context, exportName) {
  const start = controllerSource.indexOf(startMarker);
  const end = controllerSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  const snippet = `${controllerSource.slice(start, end)}\nglobalThis.action = ${exportName};`;
  vm.runInNewContext(ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return context.action;
}

test('hidden or stale editor preview cannot replace list check records after a background article update', () => {
  const records = [];
  let matches = true;
  const preview = { isConnected: true };
  const context = { useCallback: fn => fn, matchesSnapshot: () => matches, previewRef: { current: null }, articleRef: { current: { dirty: false } }, parseArticle, articleListCheckResult, setArticleChecks: update => records.push(update({})) };
  const cache = controllerAction('  const cacheLoadedArticleReport = useCallback(', '\n\n  const compileCurrent', context, 'cacheLoadedArticleReport');
  const snapshot = { folder: 'alpha', month: '2026-09', articleId: '2026-09/alpha', source: updateFrontMatter(createArticleSource('甲', BASIC_THEME.id), { theme: { id: BASIC_THEME.id, version: BASIC_THEME.version } }), theme: BASIC_THEME, themeValid: true };
  const report = { theme: { passed: [], issues: [{ kind: 'engine', name: '主题预览', tier: 'unknown', message: '预览尚未就绪' }] }, body: { passed: [], issues: [] } };
  cache(snapshot, report, null);
  assert.equal(records.length, 0);
  context.previewRef.current = preview;
  matches = false;
  cache(snapshot, report, preview);
  assert.equal(records.length, 0);
  matches = true;
  cache(snapshot, { theme: { passed: [], issues: [] }, body: { passed: [], issues: [] } }, preview);
  assert.equal(records.length, 1);
  assert.equal(records[0][snapshot.articleId].state, 'checked');
});

test('cancelling a current-scope check while its file read is pending prevents late list and check updates', async () => {
  const root = {};
  let finishRead;
  const pendingRead = new Promise(resolve => { finishRead = resolve; });
  const updates = [];
  const context = {
    getFormatSnapshot: () => ({ id: 'test-format' }),
    useCallback: fn => fn, AbortController, directoryRef: { current: root }, articleListAbortRef: { current: null },
    mutationQueueRef: { current: { run: fn => fn() } }, readStoredArticleById: () => pendingRead,
    setArticleListWork: value => updates.push(['work', value]), setArticleListNotice: value => updates.push(['notice', value]),
    setStoredArticles: () => updates.push(['articles']), setArticleChecks: () => updates.push(['checks']),
    articleFormatPreviewStructure: () => { throw new Error('cancelled source must not reach inspection'); },
    inspectArticleFormatReport: () => { throw new Error('cancelled source must not reach inspection'); },
    articleListCheckResult,
  };
  const check = controllerAction('  const checkArticleList = useCallback(', '\n\n  const rebuildListIndexes', context, 'checkArticleList');
  const cancel = controllerAction('  const cancelArticleListCheck = useCallback(', '\n\n  const checkArticleList', context, 'cancelArticleListCheck');
  const work = check([article('alpha', '甲文稿')]);
  assert.equal(context.articleListAbortRef.current.kind, 'check');
  cancel(true);
  finishRead({});
  await work;
  assert.equal(context.articleListAbortRef.current, null);
  assert.equal(updates.some(([kind]) => kind === 'articles' || kind === 'checks'), false);
});

test('bulk archive saves selected organization in one update and protects a dirty selected draft', () => {
  const articles = [article('alpha', '甲文稿'), article('beta', '乙文稿')];
  const root = {};
  const calls = [];
  const context = { useCallback: fn => fn, directoryRef: { current: root }, articleRef: { current: { folder: articles[0].folder, month: articles[0].month, dirty: true } },
    documentTokenRef: { current: { root } }, articleId: value => `2026-09/${value.folder}`,
    setArticleArchived, persistEditorWorkspace: (update, notice) => { calls.push({ workspace: update(createDefaultEditorWorkspace()), notice }); return Promise.resolve(true); },
    runAfterDraftDecision: (pending, protect) => { calls.push({ protect, label: pending.label }); pending.run(); } };
  const archive = controllerAction('  const archiveStoredArticles = useCallback(', '\n\n  const classifyStoredArticles', context, 'archiveStoredArticles');
  archive(articles, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].protect, true);
  assert.equal(getArticleOrganization(calls[1].workspace, articles[0].id).archived, true);
  assert.equal(getArticleOrganization(calls[1].workspace, articles[1].id).archived, true);
});

test('bulk classification keeps the selected list order when moving into a project', async () => {
  const articles = [article('alpha', '甲文稿'), article('beta', '乙文稿')];
  const workspace = createDefaultEditorWorkspace();
  workspace.projects = [{ id: 'project-one', name: '项目一', pinned: false, collapsed: false }];
  workspace.projectOrder = ['project-one'];
  const root = {};
  const calls = [];
  const context = { useCallback: fn => fn, directoryRef: { current: root }, editorWorkspaceRef: { current: workspace }, storedArticles: articles,
    setStatus() {}, getArticleOrganization, orderArticlesForGroup, moveArticleToProject,
    persistEditorWorkspace: async (update, notice) => { const next = update(workspace); calls.push({ next, notice }); return true; } };
  const classify = controllerAction('  const classifyStoredArticles = useCallback(', '\n\n  const moveStoredArticleToProject', context, 'classifyStoredArticles');
  assert.equal(await classify(articles, 'project-one'), true);
  assert.equal(calls.length, 1);
  assert.deepEqual([...calls[0].next.articleOrder['project-one']], articles.map(item => item.id));
  assert.ok(articles.every(item => getArticleOrganization(calls[0].next, item.id).projectId === 'project-one'));
});


test('categories use only the current collection and category removal snapshots the filtered target rows', async () => {
  const members = [article('alpha', '甲文稿'), article('beta', '乙文稿')];
  members[0].parse.metadata.categories = ['当前标签'];
  members[1].parse.metadata.categories = ['保留标签'];
  const other = article('other', '其他组'); other.parse.metadata.categories = ['其他组标签'];
  const removed = [];
  const view = page('all', { articles: members, allArticles: [...members, other], onRemoveCategories: async (rows, labels) => { removed.push({ rows, labels }); return true; } });
  assert.equal(view.render().some(node => node.type === 'button' && view.text(node) === '其他组标签'), false);
  view.render().find(node => node.type === 'icon-button').props.onClick();
  view.control('当前标签').props.onClick();
  // Picking labels to remove does not filter away unrelated rows before confirmation.
  assert.equal(view.render().filter(node => node.type === 'article').length, 2);
  view.control('移除所选标签').props.onClick();
  assert.ok(view.render().some(node => view.text(node).includes('共影响 1 篇文章')));
  view.control('确认移除').props.onClick();
  await Promise.resolve();
  assert.equal(removed.length, 1);
  assert.deepEqual([...removed[0].rows].map(item => item.id), [members[0].id]);
  assert.deepEqual([...removed[0].labels], ['当前标签']);
});

test('archived category management is disabled and empty collection cannot leak a previous editor result', () => {
  const archived = article('archive', '归档稿'); archived.parse.metadata.categories = ['归档标签'];
  const view = page('archived', { articles: [archived] });
  assert.equal(view.render().find(node => node.type === 'icon-button').props.disabled, true);
  const empty = page('all', { articles: [], checks: { 'old-article': { state: 'checked', warning: 0, error: 12 } } });
  assert.ok(empty.render().some(node => empty.text(node) === '当前范围无文章需检查'));
  assert.equal(empty.render().some(node => empty.text(node).includes('revision')), false);
});
