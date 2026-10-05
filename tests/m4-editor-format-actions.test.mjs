const formatRuntime = await import('../src/lib/article-format/runtime.ts');
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import * as format from '../src/lib/articleFormat.ts';
import * as reports from '../src/lib/articleFormatReport.ts';
import { createArticleSource, parseArticle } from '../src/lib/frontMatter.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';

const controllerSource = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
const report = {
  theme: { passed: ['color', 'display'], issues: [{ kind: 'style', name: 'height', tier: 'lowPriority', source: '主题 CSS', message: '需核对' }] },
  body: { passed: ['p'], issues: [{ kind: 'element', name: '错闭合', tier: 'danger', source: '正文', message: '错闭合', line: 2 }, { kind: 'style', name: '未核实', tier: 'unknown', source: '正文', message: '未核实' }] },
};
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : typeof node === 'string' ? node : '';
function action(name, next, context) {
  const start = controllerSource.indexOf(`  const ${name} = useCallback(`);
  const end = controllerSource.indexOf(`\n\n  const ${next}`, start);
  assert.ok(start >= 0 && end > start);
  const source = controllerSource.slice(start, end) + `\nglobalThis.action = ${name};`;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.action;
}

test('format counters match both report tabs and warnings or errors remove the generated-success label', () => {
  assert.deepEqual(reports.articleFormatReportCounts(report), { pass: 3, warning: 1, error: 2 });
  const status = reports.compiledArticleFormatStatus(report, 8, 56);
  assert.equal(status.tone, 'error'); assert.equal(status.formatRevision, 8);
  assert.equal(status.label, 'revision 8 · 56 个类 · 3 个 pass · 1 个 warning · 2 个 error');
  assert.doesNotMatch(status.label, /样式已生成/);
  assert.equal(reports.compiledArticleFormatStatus({ ...report, body: { passed: [], issues: [] } }, 8, 56).tone, 'warning');
  assert.equal(reports.compiledArticleFormatStatus({ theme: { passed: ['color'], issues: [] }, body: { passed: ['p'], issues: [] } }, 8, 56).tone, 'success');
});

test('inspection has only a close action, and close/cancel/copy controls carry icons', async () => {
  const source = await readFile(new URL('../src/components/global/FormatCheckDialog.tsx', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require(id) {
    if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => formatRuntime.getFormatSnapshot() };
      if (id === 'react') return { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] };
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/articleFormat')) return format;
      if (id.endsWith('/articleFormatReport')) return reports;
      if (id.endsWith('/useAnimatedMaxHeight')) return { useAnimatedMaxHeight: () => ({ current: null }) };
      if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'actions', DialogButton: 'dialog-button' };
      throw new Error(id);
    },
  });
  for (const [mode, labels] of [['inspect', ['关闭']], ['save', ['关闭']], ['copy', ['先不复制', '仍然复制']]]) {
    const decisions = [];
    const tree = nodes(module.exports.FormatCheckDialog({ mode, report, onDecision: value => decisions.push(value) }));
    const buttons = tree.filter(node => node.type === 'dialog-button');
    assert.deepEqual(buttons.map(text), labels);
    for (const button of buttons) {
      const icon = button.props.children.find(child => typeof child?.type === 'function');
      assert.ok(icon); assert.equal(icon.type(icon.props).type, 'svg');
    }
    buttons[0].props.onClick(); assert.deepEqual(decisions, [false]);
  }
});

test('toolbar places export before the divider and inspection between refresh and save', async () => {
  const source = await readFile(new URL('../src/components/global/EditorTopbar.tsx', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require(id) {
      if (id === 'react') return { useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useEffect() {} };
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      throw new Error(id);
    },
  });
  let inspected = 0;
  const tree = nodes(module.exports.EditorTopbar({ view: 'articles', articleMode: 'editor', currentTitle: '当前稿', currentProjectName: null, articleCollectionTitle: '全部文章', article: { dirty: true, folder: 'current', themeValid: true }, directory: {}, isReadyToCopy: true, mediaOperation: null, historyBusy: false, isCompiling: false, currentArticleIsArchived: false, metadataWritable: true, onCheckFormat: () => inspected++ }));
  const controls = nodes(tree.find(node => node.props.className === 'toolbar-actions'));
  const index = label => controls.findIndex(node => node.props['aria-label'] === label);
  const divider = controls.findIndex(node => node.props.className === 'toolbar-divider');
  assert.ok(index('导出文章') < divider && divider < index('更新样式'));
  assert.ok(index('更新样式') < index('格式检查') && index('格式检查') < index('保存文章'));
  controls[index('格式检查')].props.onClick(); assert.equal(inspected, 1);
});

function compileFixture() {
  const statuses = [], events = [], cache = { current: null };
  const snapshot = { source: `${createArticleSource('当前稿')}\n正文`, theme: BASIC_THEME, themeValid: true, revision: 8 };
  const context = {
    useCallback: callback => callback, mounted: true, snapshotFor: () => snapshot,
    matchesSnapshot: () => true, compileRequestRef: { current: 0 }, compiledFormatRef: cache,
    previewRef: { current: {} }, setIsCompiling: value => events.push(['busy', value]),
    compileArticleStyles: async () => ({ css: '.current {}', candidates: ['one', 'two'] }),
    flushSync: callback => { events.push(['commit-start']); callback(); events.push(['commit-end']); },
    setCompiledCss: css => events.push(['css', css]), setCompiledRevision: revision => events.push(['revision', revision]),
    inspectArticleFormatReport: async () => { assert.equal(events.at(-1)[0], 'commit-end'); events.push(['inspect']); return report; },
    compiledArticleFormatStatus: reports.compiledArticleFormatStatus, setStatus: status => statuses.push(status),
    cacheLoadedArticleReport() {},
  };
  return { context, snapshot, statuses, events, cache, compile: action('compileCurrent', 'loadStoredArticles', context) };
}

test('compilation commits preview styles before inspecting and stores one report for the footer and dialog', async () => {
  const fixture = compileFixture();
  assert.equal(await fixture.compile(), true);
  assert.equal(fixture.cache.current.report, report);
  assert.equal(fixture.statuses.at(-1).label, 'revision 8 · 2 个类 · 3 个 pass · 1 个 warning · 2 个 error');
  assert.equal(fixture.events.at(-1)[1], false);
});

test('a late format inspection cannot replace the status of a changed article', async () => {
  const fixture = compileFixture(); let finish;
  fixture.context.inspectArticleFormatReport = () => new Promise(resolve => { finish = resolve; });
  const pending = fixture.compile(); await new Promise(resolve => setImmediate(resolve));
  fixture.context.matchesSnapshot = () => false; finish(report);
  assert.equal(await pending, false); assert.equal(fixture.statuses.length, 0); assert.equal(fixture.cache.current, null);
});

test('inspection engine failure remains an error report after successful CSS compilation', async () => {
  const fixture = compileFixture(); fixture.context.inspectArticleFormatReport = async () => { throw new Error('核对失败'); };
  assert.equal(await fixture.compile(), true);
  assert.equal(fixture.statuses.at(-1).tone, 'error');
  assert.match(fixture.statuses.at(-1).label, /1 个 error/);
  assert.match(fixture.cache.current.report.theme.issues[0].message, /核对失败/);
});

test('a preview mounted after compilation replaces the not-ready report with the current theme and body counts', async () => {
  const start = controllerSource.indexOf('  useEffect(() => {\n    if (isCompiling || articleMode');
  const end = controllerSource.indexOf('\n\n  const performSaveSnapshot', start);
  assert.ok(start >= 0 && end > start);
  const source = controllerSource.slice(start, end);
  assert.match(source, /matchesSnapshot, previewElement, snapshotFor/);
  const fixture = compileFixture();
  const preview = {};
  const context = { ...fixture.context, useEffect: callback => callback(),
    isCompiling: false, articleMode: 'editor', loadInspectionRevision: 8, compiledRevision: 8, previewElement: preview,
    setLoadInspectionRevision: value => fixture.events.push(['loaded', value]),
    inspectArticleFormatReport: async (_source, _theme, node) => { assert.equal(node, preview); return report; },
  };
  fixture.cache.current = { snapshot: fixture.snapshot, report: { theme: { passed: [], issues: [] }, body: { passed: [], issues: [] } }, classes: 2, preview: null, requestId: 0 };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.cache.current.preview, preview);
  assert.equal(fixture.cache.current.report, report);
  assert.equal(fixture.statuses.at(-1).label, 'revision 8 · 2 个类 · 3 个 pass · 1 个 warning · 2 个 error');
  assert.deepEqual(fixture.events.at(-1), ['loaded', null]);
});

test('standalone format inspection opens the inspection dialog without saving or copying', async () => {
  const dialogs = []; let saves = 0;
  const snapshot = { source: createArticleSource('当前稿'), themeValid: true, revision: 8 };
  const context = {
    useCallback: callback => callback, snapshotFor: () => snapshot, parseArticle, matchesSnapshot: () => true,
    formatInspectionRef: { current: false }, formatCheckResolveRef: { current: null }, mediaOperationRef: { current: null }, historyOperationRef: { current: null },
    compileRequestRef: { current: 1 }, compiledFormatRef: { current: { snapshot, report, requestId: 1 } },
    cacheLoadedArticleReport() {}, previewRef: { current: {} }, inspectArticleFormatReport: async () => report, compiledArticleFormatStatus: reports.compiledArticleFormatStatus, compileCurrent: async () => true, setFormatCheck: dialog => dialogs.push(dialog), setStatus() {}, saveSnapshot: () => saves++,
  };
  const inspect = action('checkCurrentFormat', 'saveSettings', context);
  assert.equal(await inspect(), true); assert.equal(dialogs[0].mode, 'inspect'); assert.equal(dialogs[0].report, report); assert.equal(saves, 0);
});

test('manual save waits for the compiled report and uses it for the save dialog', async () => {
  const fixture = compileFixture(); const dialogs = []; let inspections = 0;
  const context = { ...fixture.context,
    mediaOperationRef: { current: null }, historyOperationRef: { current: null }, setLoadInspectionRevision() {},
    saveSnapshot: async () => ({ ok: true, current: true, savedSnapshot: fixture.snapshot, result: { article: { parse: { canCopy: true } } } }),
    compileCurrent: async () => { fixture.cache.current = { snapshot: fixture.snapshot, report }; return true; },
    inspectArticleFormatReport: async () => { inspections++; return report; }, hasFormatConcerns: reports.hasFormatConcerns,
    setFormatCheck: dialog => dialogs.push(dialog),
  };
  const save = action('saveCurrent', 'checkCurrentFormat', context);
  assert.equal(await save(), true); assert.equal(inspections, 1); assert.equal(dialogs[0].mode, 'save'); assert.equal(dialogs[0].report, report);
});
