import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { availableArticleThemeUpdate } from '../src/lib/articleThemeUpdate.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';

const current = { ...BASIC_THEME, version: '1.0.1' };
const latest = { ...BASIC_THEME, version: '1.0.4' };

test('update is available only for a different version of the same library theme', () => {
  assert.equal(availableArticleThemeUpdate(current, [latest]), latest);
  assert.equal(availableArticleThemeUpdate(latest, [latest]), null);
  assert.equal(availableArticleThemeUpdate(current, []), null);
  assert.equal(availableArticleThemeUpdate(current, [{ ...latest, id: 'another-theme' }]), null);
});

const source = await readFile(new URL('../src/components/themes/ThemeDialog.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function dialog({ library = [latest], blockedReason = '', busy = false } = {}) {
  const selected = [];
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === 'react') return { useState: initial => [initial, () => {}] };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/articleThemeUpdate')) return { availableArticleThemeUpdate };
    if (id.endsWith('/ThemeUpdateTag')) return { ThemeUpdateTag: 'theme-update-tag' };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog-frame', DialogHeader: 'dialog-header', DialogFooter: 'dialog-footer', DialogActions: 'dialog-actions', DialogButton: 'dialog-button' };
    if (id.endsWith('/InformationButton')) return { InformationIcon: 'information-icon' };
    if (id.endsWith('/ContentRenderPreview')) return { ContentRenderPreview: 'content-preview' };
    throw new Error(`Unexpected import ${id}`);
  } });
  const tree = module.exports.ThemeDialog({ current, themes: library, source: '正文', busy, blockedReason, onClose() {}, onSelect(theme) { selected.push(theme); } });
  function all(node) {
    if (Array.isArray(node)) return node.flatMap(all);
    if (!node?.props) return [];
    return [node, ...all(node.props.children)];
  }
  return { nodes: all(tree), selected };
}

test('update button applies the matching library theme directly and respects the existing block', () => {
  const view = dialog();
  const button = view.nodes.find(node => node.type === 'button' && node.props['aria-label']?.startsWith('更新主题'));
  assert.ok(button);
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  assert.deepEqual(view.selected, [latest]);
  assert.equal(view.nodes.filter(node => node.type === 'theme-update-tag').length, 2);
  assert.equal(dialog({ library: [current] }).nodes.some(node => node.props?.['aria-label']?.startsWith('更新主题')), false);
  assert.equal(dialog({ blockedReason: '归档文章只读' }).nodes.find(node => node.props?.['aria-label']?.startsWith('更新主题')).props.disabled, true);
  assert.equal(dialog({ busy: true }).nodes.find(node => node.props?.['aria-label']?.startsWith('更新主题')).props.disabled, true);
});
