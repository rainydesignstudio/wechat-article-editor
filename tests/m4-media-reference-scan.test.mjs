import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { countCurrentMediaReferences, scanWorkspaceMediaReferences } from '../src/lib/mediaManagement.ts';

class Directory {
  kind = 'directory'; children = new Map();
  constructor(name, reads) { this.name = name; this.reads = reads; }
  directory(name) { const entry = new Directory(`${this.name}/${name}`, this.reads); this.children.set(name, entry); return entry; }
  file(name, source) {
    const reads = this.reads, path = `${this.name}/${name}`;
    const entry = { kind: 'file', getFile: async () => { reads.push(path); return new File([source], name); } };
    this.children.set(name, entry); return entry;
  }
  async getDirectoryHandle(name, options = {}) { assert.equal(Boolean(options.create), false); const entry = this.children.get(name); if (!entry) throw new DOMException(name, 'NotFoundError'); return entry; }
  async getFileHandle(name, options = {}) { assert.equal(Boolean(options.create), false); const entry = this.children.get(name); if (!entry) throw new DOMException(name, 'NotFoundError'); return entry; }
  async *entries() { yield* this.children; }
}
function fixture() {
  const reads = [], root = new Directory('library', reads), month = root.directory('articles').directory('2026-10');
  const source = month.directory('source'), other = month.directory('other');
  source.file('article.md', '![local](media/image/a%20b.png)\n<img src="../../../shared/image/a%20b.png">\n`![example](media/image/a%20b.png)`');
  other.file('article.md', '![different copy](media/image/a%20b.png)\n![same file](../source/media/image/a%20b.png)\n![shared][s]\n\n[s]: ../../../shared/image/a%20b.png');
  source.directory('history').directory('snapshot-one').file('article.md', '![old](media/image/a%20b.png)');
  const article = { kind: 'article', root, month: '2026-10', folder: 'source', articleId: '2026-10/source', fileName: 'a b.png' };
  const shared = { kind: 'shared', root, fileName: 'a b.png' };
  const current = { month: '2026-10', folder: 'source', source: '![one](media/image/a%20b.png)\n<img src="./media/image/a%20b.png">\n![shared](../../../shared/image/a%20b.png)' };
  return { reads, root, source, other, article, shared, current };
}

test('draft count performs zero file reads and distinguishes independent copies and encoded references', () => {
  const f = fixture();
  assert.equal(countCurrentMediaReferences([f.article, f.shared], f.current), 3);
  assert.equal(countCurrentMediaReferences([{ ...f.article, folder: 'other' }], f.current), 0);
  assert.equal(countCurrentMediaReferences([f.shared], null), null);
  assert.deepEqual(f.reads, []);
});

test('explicit batch scan reads every saved source once, includes history and ignores code and remote URLs', async () => {
  const f = fixture();
  f.other.children.get('article.md').getFile = async () => { f.reads.push('library/articles/2026-10/other/article.md'); return new File(['![copy](media/image/a%20b.png)\n![cross](../source/media/image/a%20b.png)\n<img src="../../../shared/image/a%20b.png?size=2#view">\n![remote](https://example.com/shared/image/a%20b.png)'], 'article.md'); };
  const result = await scanWorkspaceMediaReferences(f.root, [f.article, f.shared, f.article], f.current, new AbortController().signal, () => true);
  assert.deepEqual(result, { current: 3, workspace: 5, issues: [] });
  assert.equal(f.reads.length, 3); assert.equal(new Set(f.reads).size, 3);
  assert.ok(f.reads.every(path => path.endsWith('/article.md')));
});

test('unreadable records are qualified; empty libraries stay empty and do not request creation', async () => {
  const f = fixture(); f.other.children.get('article.md').getFile = async () => { throw new DOMException('read denied', 'NotAllowedError'); };
  const result = await scanWorkspaceMediaReferences(f.root, [f.article], f.current, new AbortController().signal, () => true);
  assert.equal(result.workspace, 2); assert.equal(result.issues.length, 1); assert.match(result.issues[0], /other.*read denied/);
  const empty = new Directory('empty', []);
  assert.deepEqual(await scanWorkspaceMediaReferences(empty, [{ ...f.shared, root: empty }], null, new AbortController().signal, () => true), { current: null, workspace: 0, issues: [] });
  assert.equal(empty.children.size, 0);
});

test('cancel or identity changes halt the scan before reading subsequent documents', async () => {
  for (const change of ['abort', 'identity']) {
    const f = fixture(), controller = new AbortController(); let valid = true;
    f.source.children.get('article.md').getFile = async () => { if (change === 'abort') controller.abort(); else valid = false; return new File(['![x](media/image/a%20b.png)'], 'article.md'); };
    await assert.rejects(scanWorkspaceMediaReferences(f.root, [f.article], f.current, controller.signal, () => valid), change === 'abort' ? { name: 'AbortError' } : /已变化/);
    assert.deepEqual(f.reads, []);
  }
});

const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : typeof node === 'string' ? node : '';
async function dialog(scanner) {
  const source = await readFile(new URL('../src/components/media/MediaManagementDialog.tsx', import.meta.url), 'utf8');
  const module = { exports: {} }, cells = [], cleanups = [], effects = [];
  let cursor = 0, tree, closes = 0, scans = 0, lastSignal;
  const request = { type: 'delete', assets: [{ kind: 'shared', fileName: 'sample.png' }] };
  const props = { request, articles: [], busy: false, isCurrent: () => true, currentReferences: 2, scanReferences: (assets, signal) => { scans++; lastSignal = signal; return scanner(assets, signal); }, onClose: () => closes++, onSubmit: async () => ({ ok: true }) };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, AbortController, Error, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
      useEffect(callback) { const index = cursor++; if (!(index in cells)) { cells[index] = true; effects.push(() => cleanups.push(callback())); } },
    };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'actions', DialogButton: 'button' };
    if (id.endsWith('/MediaGallery')) return { MediaIcon: 'icon' };
    throw new Error(id);
  } });
  const render = () => { cursor = 0; tree = nodes(module.exports.MediaManagementDialog(props)); while (effects.length) effects.shift()(); return tree; };
  const button = label => { const node = tree.find(node => node.type === 'button' && text(node) === label); assert.ok(node); return node.props; };
  render();
  return { render, button, status: () => text(tree.findLast(node => node.props.role === 'status')), get scans() { return scans; }, get closes() { return closes; }, get lastSignal() { return lastSignal; }, tree: () => tree };
}

test('opening dialog never scans; explicit scan locks duplicate starts, reports progress and preserves cancel', async () => {
  let finish;
  const view = await dialog(() => new Promise(resolve => { finish = resolve; }));
  assert.equal(view.scans, 0); assert.match(view.status(), /当前文稿正文 2 处.*未扫描/);
  assert.equal(view.tree().filter(node => node.type === 'p' && text(node) === 'sample.png').length, 1, 'filename appears only in the heading');
  view.button('扫描引用').onClick(); view.button('扫描引用').onClick(); view.render();
  assert.equal(view.scans, 1); assert.equal(view.status(), '扫描中……请稍后'); assert.equal(view.button('确认删除').disabled, true); assert.equal(view.button('取消').disabled, false);
  finish({ current: 2, workspace: 5, issues: [] }); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.status(), '本文 2 处，全工作区 5 处（含历史）'); assert.equal(view.button('确认删除').disabled, false);
});

test('cancel aborts a pending scan and late results do not replace statistics; failed scans can retry', async () => {
  let finish;
  const view = await dialog(() => new Promise(resolve => { finish = resolve; }));
  view.button('扫描引用').onClick(); view.render(); view.button('取消').onClick();
  assert.equal(view.lastSignal.aborted, true); assert.equal(view.closes, 1);
  finish({ current: 2, workspace: 99, issues: [] }); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.status().includes('99'), false);
  let attempts = 0;
  const retry = await dialog(async () => { if (++attempts === 1) throw new Error('permission denied'); return { current: 2, workspace: 4, issues: ['one unreadable file'] }; });
  retry.button('扫描引用').onClick(); await new Promise(resolve => setImmediate(resolve)); retry.render();
  assert.match(text(retry.tree()), /引用扫描失败.*permission denied/);
  retry.button('扫描引用').onClick(); await new Promise(resolve => setImmediate(resolve)); retry.render();
  assert.match(retry.status(), /全工作区 4 处.*部分未核对/); assert.match(text(retry.tree()), /统计不完整/);
});
