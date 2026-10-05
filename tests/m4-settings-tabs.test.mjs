import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

const editorThemes = await import('../src/lib/editorThemes.ts');
const workspace = await import('../src/lib/editorWorkspace.ts');
const { DEFAULT_ARTICLE_SETTINGS } = await import('../src/lib/articleSettings.ts');
const source = await readFile(new URL('../src/components/settings/SettingsPanel.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function settingsPage(systemDark = false) {
  let cursor = 0;
  let tree;
  const cells = [];
  const effects = [];
  const focus = [];
  const saved = [];
  const previews = [];
  const appearanceWrites = [];
  let navigationGuard;
  const listeners = new Map();
  const mediaListeners = new Set();
  const media = { matches: systemDark, addEventListener(_, callback) { mediaListeners.add(callback); }, removeEventListener(_, callback) { mediaListeners.delete(callback); } };
  const props = {
    root: { name: 'test-only-directory' }, directoryName: 'test-only-directory', rememberedDirectoryName: null,
    directoryRestoreState: 'idle', directoryBookmarkIssue: null, fileSystemReady: true,
    settings: structuredClone(DEFAULT_ARTICLE_SETTINGS), issue: null, notice: { label: '', tone: 'neutral' }, busy: false,
    workspace: workspace.createDefaultEditorWorkspace(), workspaceIssue: null, workspaceBusy: false,
    editorThemes: [...editorThemes.BUILTIN_EDITOR_THEMES], editorThemeIssues: [],
    onSave: (value) => saved.push(value), onAuthorizeDirectory() {}, onReopenRememberedDirectory() {},
    onSaveAppearance: async (appearance) => { appearanceWrites.push(appearance); return false; }, onCreateEditorTheme: async () => false, onLoadDefaultEditorThemes: async () => false, onDeleteEditorTheme: async () => false,
    onPreviewAppearance: (appearance) => previews.push(appearance),
    registerNavigationGuard(guard) { navigationGuard = guard; return () => { navigationGuard = null; }; },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports, module,
    document: { body: {}, getElementById: (id) => ({ focus: () => focus.push(id) }) },
    window: { matchMedia: () => media, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name) => listeners.delete(name) },
    require(id) {
      if (id.endsWith('/PageHeading')) return { PageHeading: 'header' };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/ButtonBar')) return { ButtonBar: 'button-bar' };
      if (id === 'react-dom') return { createPortal: (children) => children };
      if (id.endsWith('/DialogFrame')) { const Dialog = (props) => jsx('dialog', props); return { DialogFrame: Dialog, DialogHeader: Dialog, DialogActions: Dialog, DialogButton: Dialog }; }
      if (id.endsWith('/EditorThemeDesigner')) return { EditorThemeDesigner: 'editor-theme-designer' };
      if (id.endsWith('/UnsavedChangesDialog')) return { UnsavedChangesDialog: 'unsaved-changes-dialog' };
      if (id.endsWith('/editorThemes')) return editorThemes;
      if (id.endsWith('/editorWorkspace')) return workspace;
      if (id === 'react') return {
        useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = typeof value === 'function' ? value() : value; return [cells[index], (next) => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }]; },
        useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
        useEffect(effect, dependencies) { const index = cursor++; const previous = cells[index]; if (previous && dependencies.every((value, i) => Object.is(value, previous.dependencies[i]))) return; effects.push(() => { previous?.cleanup?.(); cells[index] = { dependencies, cleanup: effect() }; }); },
      };
      throw new Error(`Unexpected settings import: ${id}`);
    },
  });
  function render() { cursor = 0; tree = module.exports.SettingsPanel(props); while (effects.length) effects.shift()(); }
  function all(node) { if (Array.isArray(node)) return node.flatMap(all); if (!node || typeof node !== 'object' || !node.props) return []; return [node, ...all(node.props.children)]; }
  function find(predicate) { const node = all(tree).find(predicate); assert.ok(node, 'Expected control exists'); return node; }
  function label(node) { if (typeof node === 'string') return node; if (Array.isArray(node)) return node.map(label).join(''); return node?.props ? label(node.props.children) : ''; }
  render(); render();
  return {
    props, focus, saved, previews, appearanceWrites, render, find,
    systemMode(dark) { media.matches = dark; for (const callback of mediaListeners) callback(); render(); },
    get guard() { return navigationGuard; }, listeners,
    modal() { return find(node => node.type === 'unsaved-changes-dialog'); },
    button(text) { return find((node) => node.props.onClick && label(node) === text); },
    unmount() { for (const cell of cells) cell?.cleanup?.(); },
    tab(id) { return find((node) => node.props.id === `settings-tab-${id}`); },
    panel(id) { return find((node) => node.props.id === `settings-panel-${id}`); },
    switch(id) { this.tab(id).props.onClick(); render(); },
  };
}

test('designer receives the current appearance draft including system mode and explicit overrides', () => {
  const page = settingsPage(true); page.switch('appearance');
  page.button('跟随系统').props.onClick(); page.render();
  page.button('新建编辑器主题').props.onClick(); page.render();
  const designer = () => page.find(node => node.type === 'editor-theme-designer');
  assert.equal(designer().props.appearanceScheme, 'dark');
  page.systemMode(false); assert.equal(designer().props.appearanceScheme, 'light');
  page.button('深色').props.onClick(); page.render();
  assert.equal(designer().props.appearanceScheme, 'dark');
  page.systemMode(false); assert.equal(designer().props.appearanceScheme, 'dark');
  assert.equal(page.appearanceWrites.length, 0);
});

test('settings tabs have one active panel and keyboard navigation wraps with focus', () => {
  const page = settingsPage();
  assert.equal(page.panel('library').props.hidden, false);
  assert.equal(page.panel('appearance').props.hidden, true);
  page.tab('library').props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} }); page.render();
  assert.equal(page.panel('workflow').props.hidden, false);
  assert.equal(page.tab('workflow').props.tabIndex, 0);
  assert.equal(page.focus.at(-1), 'settings-tab-workflow');
  page.tab('workflow').props.onKeyDown({ key: 'Home', preventDefault() {} }); page.render();
  assert.equal(page.focus.at(-1), 'settings-tab-library');
});

test('new library opens the shared dialog without adding an inline form', () => {
  const page = settingsPage(); let opened = 0;
  page.props.onCreateDirectory = () => opened++; page.render();
  assert.equal(page.button('新建资料库').props['aria-haspopup'], 'dialog');
  page.button('新建资料库').props.onClick(); page.render();
  assert.equal(opened, 1);
  assert.doesNotMatch(source, /create-library-fields|newLibraryOpen|newLibraryName/);
});

test('unsaved appearance is resolved before opening the new library dialog', () => {
  const page = settingsPage(); let opened = 0;
  page.props.onCreateDirectory = () => opened++;
  page.switch('appearance');
  page.find(node => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'mist').name}`).props.onClick(); page.render();
  page.switch('library'); page.button('新建资料库').props.onClick(); page.render();
  assert.equal(opened, 0); page.modal().props.onCancel(); page.render(); assert.equal(opened, 0);
  page.button('新建资料库').props.onClick(); page.render(); page.modal().props.onDiscard(); page.render();
  assert.equal(opened, 1); assert.equal(page.previews.at(-1), null);
});

test('theme designer and additive file actions coexist; saving its file only previews the new appearance until explicit save', async () => {
  const page = settingsPage(); page.switch('appearance');
  page.button('新建编辑器主题').props.onClick(); page.render();
  const designer = page.find(node => node.type === 'editor-theme-designer');
  const newTheme = { ...editorThemes.BASE_EDITOR_THEME, id: 'test-new-editor-theme' };
  assert.equal(await designer.props.onSave(newTheme), false);
  assert.equal(page.previews.at(-1), null);
  page.props.onCreateEditorTheme = async () => true; page.render();
  const current = page.find(node => node.type === 'editor-theme-designer');
  assert.equal(await current.props.onSave(newTheme), true); page.render();
  assert.equal(page.previews.at(-1).themeId, newTheme.id);
  assert.equal(page.appearanceWrites.length, 0);
  let proceeded = false;
  assert.equal(page.guard(() => { proceeded = true; }), true);
  assert.equal(proceeded, false);
});

test('switching settings tabs retains unsaved appearance and automation values', () => {
  const page = settingsPage();
  page.switch('appearance');
  page.find((node) => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'mist').name}`).props.onClick(); page.render();
  page.switch('workflow');
  page.find((node) => node.type === 'input' && node.props.max === '86400').props.onChange({ target: { value: '37' } }); page.render();
  page.switch('library'); page.switch('appearance');
  assert.equal(page.find((node) => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'mist').name}`).props['aria-pressed'], true);
  page.switch('workflow');
  assert.equal(page.find((node) => node.type === 'input' && node.props.max === '86400').props.value, 37);
  page.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(page.saved[0].autoSave.intervalSeconds, 37);
  assert.equal(page.props.settings.autoSave.intervalSeconds, DEFAULT_ARTICLE_SETTINGS.autoSave.intervalSeconds);
});

test('busy settings prevent tab changes and absent directory disables persisted changes', () => {
  const page = settingsPage();
  page.props.busy = true; page.render();
  assert.equal(page.tab('appearance').props.disabled, true);
  page.tab('library').props.onKeyDown({ key: 'End', preventDefault() { assert.fail('Busy tab must not navigate'); } }); page.render();
  assert.equal(page.panel('library').props.hidden, false);
  page.props.busy = false; page.props.root = null; page.render();
  assert.equal(page.find((node) => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'mist').name}`).props.disabled, true);
  assert.equal(page.find((node) => node.type === 'input' && node.props['aria-label'] === '启用自动保存').props.disabled, true);
});

test('theme selection previews without writing; cancel and unmount clear the preview', () => {
  const page = settingsPage();
  page.switch('appearance');
  for (const label of ['重置外观', '取消变更', '保存外观']) assert.equal(page.button(label).props.disabled, true);
  page.find((node) => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'sunshine').name}`).props.onClick(); page.render();
  assert.equal(page.previews.at(-1).themeId, 'sunshine');
  assert.equal(page.props.workspace.appearance.themeId, 'rainy-studio-slate');
  assert.equal(page.appearanceWrites.length, 0);
  assert.equal(page.button('保存外观').props.disabled, false);
  page.button('取消变更').props.onClick(); page.render();
  assert.equal(page.previews.at(-1), null);
  assert.equal(page.button('保存外观').props.disabled, true);
  page.find((node) => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'evening-snow').name}`).props.onClick(); page.render();
  page.unmount();
  assert.equal(page.previews.at(-1), null);
});

test('successful explicit save writes once, shows saved state and disables all change actions', async () => {
  const page = settingsPage();
  page.props.onSaveAppearance = async (appearance) => { page.appearanceWrites.push(appearance); page.props.workspace = { ...page.props.workspace, appearance }; return true; };
  page.switch('appearance');
  page.find((node) => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'flowing-violet').name}`).props.onClick(); page.render();
  await page.button('保存外观').props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); page.render();
  assert.equal(page.appearanceWrites.length, 1);
  assert.equal(page.appearanceWrites[0].themeId, 'flowing-violet');
  assert.equal(page.previews.at(-1), null);
  for (const label of ['重置外观', '取消变更', '已保存']) assert.equal(page.button(label).props.disabled, true);
});

test('failed appearance save keeps preview and changes available for retry', async () => {
  const page = settingsPage(); page.switch('appearance');
  page.find((node) => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'mist').name}`).props.onClick(); page.render();
  await page.button('保存外观').props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); page.render();
  assert.equal(page.previews.at(-1).themeId, 'mist');
  assert.equal(page.button('保存外观').props.disabled, false);
  assert.equal(page.props.workspace.appearance.themeId, 'rainy-studio-slate');
});

test('custom combination is staged in the dialog and applied as a preview only', () => {
  const page = settingsPage(); page.switch('appearance');
  page.find((node) => node.type === 'button' && node.props.onClick && node.props.className.includes('min-h-48')).props.onClick(); page.render();
  page.find((node) => node.props['aria-label'] === `选择${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'sunshine').name}配色`).props.onClick(); page.render();
  page.find((node) => node.props['aria-label'] === `选择${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'evening-snow').name}字体`).props.onClick(); page.render();
  assert.equal(page.previews.at(-1), null);
  page.button('应用组合并预览').props.onClick(); page.render();
  assert.equal(page.previews.at(-1).custom.colorThemeId, 'sunshine');
  assert.equal(page.previews.at(-1).custom.fontThemeId, 'evening-snow');
  assert.equal(page.appearanceWrites.length, 0);
});

test('saved global display mode changes update a pending theme preview without losing its theme', () => {
  const page = settingsPage(); page.switch('appearance');
  page.find((node) => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'sunshine').name}`).props.onClick(); page.render();
  page.props.workspace = { ...page.props.workspace, appearance: { ...page.props.workspace.appearance, colorMode: 'dark' } };
  page.render(); page.render();
  assert.equal(page.previews.at(-1).themeId, 'sunshine');
  assert.equal(page.previews.at(-1).colorMode, 'dark');
  assert.equal(page.appearanceWrites.length, 0);
});


test('custom color cards keep all 33 token slots in order even when values repeat', () => {
  const page = settingsPage();
  page.switch('appearance');
  page.find((node) => node.props['aria-pressed'] === false && node.type === 'button' && node.props.children?.some?.((child) => child?.props?.children === '自定义组合')).props.onClick(); page.render();
  const sample = page.find((node) => node.props.kind === 'colors' && node.props.theme.id === 'ink-white');
  for (const scheme of ['light', 'dark']) {
    const tree = sample.type({ ...sample.props, scheme });
    const [main, remainder] = tree.props.children;
    assert.equal(main.props['data-color-role'], 'accent');
    const rows = remainder.props.children;
    assert.deepEqual(Array.from(rows, (row) => row.props.children.length), [16, 16]);
    const tokens = Array.from(rows).flatMap((row) => Array.from(row.props.children));
    assert.deepEqual(tokens.map((cell) => cell.props['data-color-role']), editorThemes.EDITOR_COLOR_ROLES.filter((role) => role !== 'accent'));
    const resolved = editorThemes.resolveEditorThemeColors(sample.props.theme, scheme);
    for (const [role, value] of Object.entries(resolved)) assert.equal(tree.props.style[`--color-${role}`], value);
    for (const cell of [main, ...tokens]) assert.equal(cell.props.style, undefined, 'swatches consume registered token utilities');
    assert.ok(new Set(Object.values(resolved)).size < 33, 'fixture includes duplicate colors');
  }
});


test('unsaved appearance blocks leaving; cancel retains preview, discard restores saved appearance before leaving', () => {
  const page = settingsPage(); page.switch('appearance');
  page.find(node => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'mist').name}`).props.onClick(); page.render();
  let left = 0;
  assert.equal(page.guard(() => left++), true); page.render();
  assert.equal(left, 0);
  page.modal().props.onCancel(); page.render();
  assert.equal(page.previews.at(-1).themeId, 'mist');
  assert.equal(page.guard(() => left++), true); page.render();
  page.modal().props.onDiscard(); page.render();
  assert.equal(left, 1);
  assert.equal(page.previews.at(-1), null);
  assert.equal(page.appearanceWrites.length, 0);
  assert.equal(page.guard(() => left++), false);
});

test('save and leave waits for success; failed appearance save keeps the pending navigation and preview', async () => {
  const page = settingsPage(); page.switch('appearance');
  page.find(node => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'mist').name}`).props.onClick(); page.render();
  let left = false;
  page.guard(() => { left = true; }); page.render();
  assert.equal(await page.modal().props.onSave(), false); page.render();
  assert.equal(left, false);
  assert.equal(page.previews.at(-1).themeId, 'mist');
  page.props.onSaveAppearance = async appearance => { page.appearanceWrites.push(appearance); page.props.workspace = { ...page.props.workspace, appearance }; return true; };
  page.render();
  assert.equal(await page.modal().props.onSave(), true); page.render();
  assert.equal(left, true);
  assert.equal(page.previews.at(-1), null);
  assert.equal(page.guard(() => assert.fail('Saved appearance should not block navigation')), false);
});

test('refresh guard protects dirty appearance and is removed on unmount; tab icons all have labels', () => {
  const page = settingsPage();
  for (const [id, icon] of [['library', 'folder'], ['appearance', 'theme'], ['workflow', 'clock']]) assert.ok(page.tab(id).props.children.some(child => child?.props?.name === icon));
  let prevented = false;
  const event = { preventDefault() { prevented = true; }, returnValue: null };
  page.listeners.get('beforeunload')(event); assert.equal(prevented, false);
  page.switch('appearance'); page.find(node => node.type === 'button' && node.props['aria-label'] === `预览编辑器主题 ${editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'mist').name}`).props.onClick(); page.render();
  page.listeners.get('beforeunload')(event); assert.equal(prevented, true); assert.equal(event.returnValue, '');
  page.unmount(); assert.equal(page.guard, null); assert.equal(page.listeners.has('beforeunload'), false);
});


test('theme card actions are sibling icon controls; selected and foundational themes cannot be deleted', async () => {
  const page = settingsPage(); page.switch('appearance');
  const theme = editorThemes.BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'mist');
  const edit = page.find(node => node.props['aria-label'] === `编辑主题「${theme.name}」`);
  assert.equal(edit.props['data-tooltip'], '编辑');
  edit.props.onClick(); page.render();
  const designer = page.find(node => node.type === 'editor-theme-designer');
  assert.equal(designer.props.editing, true);
  assert.equal(designer.props.source, theme);
  designer.props.onClose(); page.render();
  const deletion = page.find(node => node.props['aria-label'] === `删除主题「${theme.name}」`);
  assert.equal(deletion.props['data-tooltip'], '删除');
  assert.equal(deletion.props.disabled, false);
  const base = editorThemes.BASE_EDITOR_THEME;
  assert.equal(page.find(node => node.props['aria-label'] === `删除主题「${base.name}」`).props.disabled, true);
  page.find(node => node.props['aria-label'] === `预览编辑器主题 ${theme.name}`).props.onClick(); page.render();
  assert.equal(page.find(node => node.props['aria-label'] === `删除主题「${theme.name}」`).props.disabled, true);
});

test('appearance toolbar restores import and additive default loading without changing selection', async () => {
  const page = settingsPage(); page.switch('appearance');
  let loads = 0; page.props.onLoadDefaultEditorThemes = async () => { loads++; return true; }; page.render();
  assert.equal(page.button('导入 JSON').props.disabled, false);
  page.button('载入默认主题').props.onClick(); await new Promise(resolve => setImmediate(resolve)); page.render();
  assert.equal(loads, 1);
  assert.equal(page.previews.at(-1), null);
  assert.equal(page.appearanceWrites.length, 0);
});
