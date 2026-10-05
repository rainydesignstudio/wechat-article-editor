import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { availableArticleThemeUpdate } from '../src/lib/articleThemeUpdate.ts';
import { parseArticle, updateFrontMatter } from '../src/lib/frontMatter.ts';

const moduleSource = await readFile(new URL('../src/components/themes/ThemeDialog.tsx', import.meta.url), 'utf8');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const label = node => Array.isArray(node) ? node.map(label).join('') : node?.props ? label(node.props.children) : typeof node === 'string' ? node : '';
function picker() {
  let cursor = 0; const cells = []; const selected = []; let closed = 0;
  const alternate = { ...BASIC_THEME, id: 'alternate', name: '另一套', version: '2.0.0' };
  const props = { current: BASIC_THEME, themes: [BASIC_THEME, alternate], source: '# 当前正文', onClose: () => closed++, onSelect: theme => selected.push(theme) };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(moduleSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require(id) {
      if (id === 'react') return { useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], value => { cells[i] = value; }]; } };
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog-frame', DialogHeader: 'dialog-header', DialogFooter: 'dialog-footer', DialogActions: 'dialog-actions', DialogButton: 'dialog-button' };
      if (id.endsWith('/InformationButton')) return { InformationIcon: 'information-icon' };
      if (id.endsWith('/ContentRenderPreview')) return { ContentRenderPreview: 'content-preview' };
      if (id.endsWith('/articleThemeUpdate')) return { availableArticleThemeUpdate };
      if (id.endsWith('/ThemeUpdateTag')) return { ThemeUpdateTag: 'theme-update-tag' };
      throw new Error(id);
    },
  });
  const render = () => { cursor = 0; return nodes(module.exports.ThemeDialog(props)); };
  const control = (text) => render().find(n => ['button', 'dialog-button'].includes(n.type) && label(n) === text);
  return { props, render, control, selected, alternate, closed: () => closed };
}

test('theme browsing renders current body without applying; return and explicit adoption have separate effects', () => {
  const p = picker(), before = JSON.stringify(p.props.current);
  p.render().find(n => n.type === 'button' && label(n).startsWith('另一套')).props.onClick();
  const preview = p.render().find(n => n.type === 'content-preview');
  assert.equal(preview.props.source, '# 当前正文');
  assert.equal(preview.props.theme, p.alternate);
  assert.equal(p.selected.length, 0);
  p.control('返回编辑').props.onClick();
  assert.equal(p.closed(), 1);
  assert.equal(JSON.stringify(p.props.current), before);
  p.control('采用主题').props.onClick();
  assert.equal(p.selected[0], p.alternate);
});

test('picker keeps missing current snapshot, supports search, and prevents adoption while blocked or busy', () => {
  const p = picker();
  p.props.themes = [p.alternate];
  assert.ok(p.render().some(n => n.type === 'button' && label(n).includes('当前文章')));
  p.render().find(n => n.type === 'input').props.onChange({ target: { value: '无匹配' } });
  assert.ok(p.render().some(n => label(n) === '没有匹配的主题。'));
  p.render().find(n => n.type === 'input').props.onChange({ target: { value: '' } });
  p.render().find(n => n.type === 'button' && label(n).startsWith('另一套')).props.onClick();
  p.props.blockedReason = '归档文章只读';
  assert.equal(p.control('采用主题').props.disabled, true);
  p.props.blockedReason = ''; p.props.busy = true;
  assert.equal(p.control('正在采用…').props.disabled, true);
  assert.equal(p.render()[0].props.dismissible, false);
});

const controllerSource = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
const start = controllerSource.indexOf('  const changeTheme = useCallback(');
const end = controllerSource.indexOf('\n\n', controllerSource.indexOf('  }, [articleSettings.autoSnapshot.maxCount', start));
function themeChange({ fail = false } = {}) {
  const root = {}, current = { source: '---\ntitle: 原稿\n---\n# 原稿正文', theme: BASIC_THEME, themeValid: true, folder: 'original', month: '2026-09' };
  const updates = [], statuses = []; let checkpoints = 0, finishes = 0, hidden = false;
  const context = {
    useCallback: fn => fn, directoryRef: { current: root }, articleRef: { current }, articleId: () => 'original', editorWorkspaceRef: { current: {} }, getArticleOrganization: () => ({ archived: false }),
    parseArticle, updateFrontMatter, setStatus: v => statuses.push(v), setShowThemeDialog: () => { hidden = true; }, updateArticle: (...args) => updates.push(args),
    snapshotFor: () => ({ ...current, directory: root, documentToken: { root } }), beginHistoryOperation: () => ({ lease: true }), finishHistoryOperation: () => { finishes++; },
    setHistoryNotice() {}, articleSettings: { autoSnapshot: { maxCount: 20 } }, matchesSnapshot: () => true,
    mutationQueueRef: { current: { canSave: () => true, run: task => Promise.resolve().then(task) } },
    createArticleSnapshot: async () => { checkpoints++; if (fail) throw new Error('checkpoint failed'); return { snapshot: { id: 'checkpoint' }, cleanupIssues: [] }; },
  };
  const code = ts.transpileModule(controllerSource.slice(start, end) + '\nglobalThis.change = changeTheme;', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, context);
  return { context, current, updates, statuses, checkpoints: () => checkpoints, finishes: () => finishes, hidden: () => hidden };
}

test('saved article applies a changed same-version theme only after its protection snapshot succeeds', async () => {
  const fixture = themeChange();
  const changed = { ...BASIC_THEME, tokens: { ...BASIC_THEME.tokens, 'color-article-accent': '#112233' } };
  fixture.context.change(changed);
  assert.equal(fixture.updates.length, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.checkpoints(), 1);
  assert.equal(fixture.updates.length, 1);
  assert.equal(fixture.updates[0][1], changed);
  assert.equal(parseArticle(fixture.updates[0][0]).body, '# 原稿正文');
  assert.equal(fixture.hidden(), true);
  assert.equal(fixture.finishes(), 1);
});

test('failed protection snapshot retains current theme and leaves the picker open', async () => {
  const fixture = themeChange({ fail: true });
  fixture.context.change({ ...BASIC_THEME, id: 'alternate' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.checkpoints(), 1);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.hidden(), false);
  assert.equal(fixture.statuses.at(-1).tone, 'error');
  assert.equal(fixture.finishes(), 1);
});

test('theme library forks a saved article with its current source and the selected theme', async () => {
  const source = controllerSource;
  const start = source.indexOf('  const applyThemeFromLibrary = useCallback(');
  const end = source.indexOf('\n\n', source.indexOf('  }, [changeTheme, navigateArticleMode, storedArticles]);', start));
  const stored = { id: 'saved-id', month: '2026-09', folder: 'saved', parse: { metadata: { title: '原稿' } } };
  const current = { source: '# 尚未保存的修改', month: stored.month, folder: stored.folder };
  const root = {};
  const updates = [], navigation = [];
  const context = {
    useCallback: fn => fn,
    directoryRef: { current: root }, documentTokenRef: { current: { root } }, articleRef: { current },
    copyOpenerRef: { current: null },
    storedArticles: [stored], parseArticle: () => ({ diagnostics: [] }),
    changeTheme: theme => updates.push(theme), navigateArticleMode: mode => navigation.push(mode),
    setStatus: value => updates.push(value), setCopyThemeTarget: value => updates.push(['theme', value]),
    setCopySourceOverride: value => updates.push(['source', value]),
    setCopyFromThemeLibrary: value => updates.push(['fromLibrary', value]),
    setCopyTarget: value => updates.push(['target', value]),
    setCopyTitle: value => updates.push(['title', value]), setCopyMonth: value => updates.push(['month', value]),
  };
  const code = ts.transpileModule(source.slice(start, end) + '\nglobalThis.apply = applyThemeFromLibrary;', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, context);
  context.apply(BASIC_THEME);
  assert.deepEqual(updates.map(([kind]) => kind), ['theme', 'source', 'fromLibrary', 'target', 'title', 'month']);
  assert.equal(updates[0][1], BASIC_THEME);
  assert.equal(updates[1][1], current.source);
  assert.equal(updates[3][1], stored);
  assert.equal(navigation.length, 0, 'the original article stays untouched before Fork confirmation');
  assert.match(await readFile(new URL('../src/app/themes/page.tsx', import.meta.url), 'utf8'), /onApply=\{controller\.applyThemeFromLibrary\}/);
});
