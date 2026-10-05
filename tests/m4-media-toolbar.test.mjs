import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
async function component(file, dependencies) {
  const module = { exports: {} }, cells = [];
  let cursor = 0;
  const code = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Set, window: { matchMedia: () => ({ matches: false }) }, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; }, useMemo: callback => callback(),
    };
    if (id in dependencies) return dependencies[id];
    throw new Error(id);
  } });
  return (name, props) => { cursor = 0; return nodes(module.exports[name](props)); };
}
const assets = [{ kind: 'shared', fileName: 'a.png', size: 1, mimeType: 'image/png', handle: {} }, { kind: 'shared', fileName: 'b.png', size: 2, mimeType: 'image/png', handle: {} }];
const galleryExports = { MediaDetails: 'details', MediaGallery: 'gallery', MediaIcon: 'icon', MediaImportButton: 'import', sortMediaAssets: values => values, mediaAssetKey: asset => asset.fileName };
const find = (tree, predicate) => { const node = tree.find(predicate); assert.ok(node); return node; };

test('first card checkbox enables bulk selection; collapsed controls retain it and filter changes clear it', async () => {
  const render = await component('../src/components/media/MediaLibrary.tsx', {
    '../../lib/editorWorkspace': { getArticleOrganization: () => ({}) },
    '../global/PageHeading': { PageHeading: 'heading' }, './MediaManagementDialog': { MediaManagementDialog: 'management' },
    '../../hooks/useMediaPreferences': { useMediaPreferences: () => [{ columns: 1, sort: 'name', descending: false }, () => {}] },
    '../../hooks/useMediaPagination': { useMediaPagination: items => ({ items, page: 1, pageCount: 1, total: items.length, start: 1, end: items.length, pageSize: 20 }) },
    '../../lib/mediaBrowsing': { mediaDirectoryImages: values => values }, './MediaPagination': { MediaPagination: 'pagination' }, './MediaPreviewDialog': { MediaPreviewDialog: 'preview' },
    '../../hooks/useMediaLibrary': { useMediaLibrary: () => ({ assets, issues: [], refresh() {} }) },
    '../global/DialogFrame': { DialogFrame: 'frame', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'actions', DialogButton: 'button' },
    './MediaToolbar': { MediaToolbar: 'toolbar' }, './MediaGallery': galleryExports, './ArticleImagePreview': { ArticleImagePreview: 'image' },
  });
  const props = { root: {}, sessionKey: 1, refreshSignal: 0, articles: [], workspace: { projects: [] }, isRootCurrent: () => true, busy: false, currentArticleId: '', canAdopt: false };
  const view = () => render('MediaLibrary', props);
  const toolbar = () => find(view(), node => node.type === 'toolbar').props;
  const gallery = () => find(view(), node => node.type === 'gallery').props;
  gallery().onToggleSelection(assets[0]);
  assert.equal(toolbar().selection.active, true); assert.equal(toolbar().selection.count, 1); assert.equal(toolbar().activeControl, 'selection');
  toolbar().onControlChange('sort'); assert.equal(toolbar().activeControl, 'sort'); assert.equal(toolbar().selection.count, 1);
  toolbar().onControlChange(null); assert.equal(toolbar().selection.count, 1);
  gallery().onSelect(assets[1]); assert.equal(toolbar().selection.count, 2);
  toolbar().onQueryChange('a'); assert.equal(toolbar().selection.count, 0); assert.equal(toolbar().selection.active, false);
  gallery().onToggleSelection(assets[0]); toolbar().groups.onChange('unclassified'); assert.equal(toolbar().selection.count, 0);
  toolbar().selection.onEnable(); toolbar().selection.onAll(); assert.equal(toolbar().selection.count, 1);
  toolbar().selection.onCancel(); assert.equal(toolbar().selection.active, false);
  gallery().onToggleSelection(assets[0]); toolbar().onSourceChange('article'); assert.equal(toolbar().selection.count, 0);
});

test('toolbar controls are exclusive, sorting arrow applies its field and range preserves sorting', async () => {
  const render = await component('../src/components/media/MediaToolbar.tsx', {
    '../global/IconPopover': { IconPopover: 'popover' }, '../global/TooltipButton': { TooltipButton: 'tooltip' }, '../global/IconButton': { IconButton: 'tooltip' }, './MediaGallery': { MediaIcon: 'icon', MediaSourceSwitch: 'source' },
  });
  let activeControl = null, preferences = { columns: 3, sort: 'name', descending: false }, enabled = 0;
  const props = { source: 'article', query: '', onSourceChange() {}, onQueryChange() {}, disabled: false, groups: { value: 'all', options: [{ value: 'all', label: '全部分组' }], onChange() {} }, articles: { value: 'all', options: [{ value: 'all', label: '全部文章' }], onChange() {} }, selection: { active: false, count: 0, hasVisible: true, onEnable() { enabled++; } }, onControlChange: value => activeControl = value, onPreferencesChange: value => preferences = value };
  const view = () => render('MediaToolbar', { ...props, activeControl, preferences });
  find(view(), node => node.props['aria-label']?.startsWith('多选图片')).props.onClick(); assert.equal(activeControl, 'selection');
  find(view(), node => node.props.label === '所属分组').props.onToggle(); assert.equal(activeControl, 'group');
  find(view(), node => node.props.label === '图片排序').props.onToggle(); assert.equal(activeControl, 'sort');
  find(view(), node => node.props['aria-label'] === '按文件大小切换为降序').props.onClick(); assert.equal(preferences.sort, 'size'); assert.equal(preferences.descending, true);
  find(view(), node => node.props.label === '图片布局').props.onToggle(); assert.equal(activeControl, 'layout');
  const range = find(view(), node => node.props.type === 'range'); assert.equal(range.props.min, '1'); assert.equal(range.props.max, '4'); assert.equal(range.props.step, '1');
  range.props.onChange({ target: { value: '1' } }); assert.equal(preferences.columns, 1); assert.equal(preferences.sort, 'size'); assert.equal(preferences.descending, true);
  assert.equal(enabled, 1);
});

test('card selection, checkbox, rename and actions are separate sibling controls in grid and list modes', async () => {
  const render = await component('../src/components/media/MediaGallery.tsx', { '../global/TooltipButton': { TooltipButton: 'tooltip' }, '../global/IconButton': { IconButton: 'tooltip' }, './ArticleImagePreview': { ArticleImagePreview: 'image' } });
  for (const columns of [1, 3]) {
    const calls = [], asset = assets[0];
    const tree = render('MediaGallery', { assets: [asset], selected: null, columns, selectedKeys: new Set(), disabled: false, onSelect: () => calls.push('select'), onToggleSelection: () => calls.push('check'), onRename: () => calls.push('rename'), onDelete: () => calls.push('delete'), onAdopt: () => calls.push('adopt') });
    const card = find(tree, node => node.type === 'article');
    const primary = find(tree, node => node.type === 'button' && node.props['aria-label']?.startsWith('选择 '));
    assert.equal(nodes(primary.props.children).some(node => node.type === 'button' || node.props.role === 'checkbox'), false, 'interactive controls cannot be nested in stretched button');
    primary.props.onClick();
    find(tree, node => node.type === 'tooltip' && node.props.role === 'checkbox').props.onClick();
    find(tree, node => node.type === 'button' && node.props.title === asset.fileName).props.onClick();
    find(tree, node => node.props['aria-label'] === `删除 ${asset.fileName}`).props.onClick();
    assert.deepEqual(calls, ['select', 'check', 'rename', 'delete']);
    assert.equal(card.props['data-layout'], columns === 1 ? 'list' : 'grid');
  }
});
