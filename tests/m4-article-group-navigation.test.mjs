import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { createDefaultEditorWorkspace, getArticleOrganization, orderArticlesForGroup } from '../src/lib/editorWorkspace.ts';

const source = await readFile(new URL('../src/components/articles/ArticleSidebar.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node?.props) return [];
  return [node, ...nodes(node.props.children)];
}

function label(node) {
  if (Array.isArray(node)) return node.map(label).join('');
  if (node?.props) return label(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

test('project name navigates to its article list while the chevron only collapses it', () => {
  const workspace = createDefaultEditorWorkspace();
  const project = { id: 'test-project', name: '测试项目', pinned: false, collapsed: false };
  const unclassifiedArticle = { id: 'unclassified-article', parse: { metadata: { title: '无项目文稿' } } };
  workspace.projects = [project];
  workspace.projectOrder = [project.id];
  const selected = [], collapsed = []; let mobileClosed = 0;
  const archivedArticle = { id: 'archived-article', parse: { metadata: { title: '归档文稿' } } };
  workspace.articleOrganization[archivedArticle.id] = { archived: true, projectId: null };
  const controller = { directory: {}, editorWorkspace: workspace, editorProjectsInDisplayOrder: [project], articleList: [unclassifiedArticle, archivedArticle],
    orderedArchivedArticles: [archivedArticle], orderedUnclassifiedArticles: [unclassifiedArticle], selectedArticleCollection: 'all',
    editorWorkspaceBusy: false, mediaOperation: null, historyBusy: false,
    setArticleCollection: collection => { selected.push(collection); controller.selectedArticleCollection = collection; },
    setProjectCollapsed: (id, value) => { collapsed.push([id, value]); return Promise.resolve(true); } };
  const module = { exports: {} };
  const state = []; let cursor = 0;
  vm.runInNewContext(code, { module, exports: module.exports, requestAnimationFrame: callback => callback(), require(id) {
    if (id === 'react') return { useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; }, useRef: initial => ({ current: initial }), useEffect() {} };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/editorWorkspace')) return { orderArticlesForGroup, getArticleOrganization };
    if (id.endsWith('/AppProviders')) return { useEditorControllerContext: () => controller };
    if (id.endsWith('/useUnclassifiedCollapsed')) return { useUnclassifiedCollapsed() {
      const index = cursor++; if (!(index in state)) state[index] = false;
      return { collapsed: state[index], toggle: () => { state[index] = !state[index]; } };
    } };
    if (id.endsWith('/ArticleActionsMenu')) return { ArticleActionsMenu: 'article-menu' };
    throw new Error(`Unexpected import ${id}`);
  } });
  const render = () => { cursor = 0; return nodes(module.exports.ArticleSidebar({ collapsed: false, mobileOpen: false, onToggleCollapsed() {}, onCloseMobile() { mobileClosed++; } })); };
  let tree = render();
  const name = tree.find(node => node.type === 'button' && node.props['aria-label'] === '测试项目，共 0 篇文档');
  assert.ok(name);
  name.props.onClick();
  assert.deepEqual(selected, ['project:test-project']);
  assert.equal(mobileClosed, 1);
  assert.deepEqual(collapsed, []);
  const chevron = tree.find(node => node.type === 'button' && node.props['aria-label'] === '折叠项目「测试项目」');
  assert.ok(chevron);
  chevron.props.onClick();
  assert.deepEqual(collapsed, [['test-project', true]]);
  assert.deepEqual(selected, ['project:test-project']);
  assert.ok(tree.some(node => node.type === 'button' && node.props['aria-label'] === '未分组，共 1 篇文档'));
  assert.ok(tree.some(node => node.props.article?.id === unclassifiedArticle.id));
  const unclassifiedChevron = tree.find(node => node.type === 'button' && node.props['aria-label'] === '折叠未分组');
  assert.equal(unclassifiedChevron.props['aria-expanded'], true);
  unclassifiedChevron.props.onClick();
  tree = render();
  assert.equal(tree.find(node => node.type === 'button' && node.props['aria-label'] === '展开未分组').props['aria-expanded'], false);
  assert.ok(!tree.some(node => node.props.article?.id === unclassifiedArticle.id));
  tree.find(node => node.type === 'button' && node.props['aria-label'] === '未分组，共 1 篇文档').props.onClick();
  assert.deepEqual(selected, ['project:test-project', 'unclassified']);
  tree = render();
  const archive = () => tree.find(node => node.type === 'button' && node.props['aria-controls'] === 'archived-article-rows');
  archive().props.onClick(); tree = render();
  assert.equal(archive().props['aria-expanded'], true);
  assert.ok(tree.some(node => node.props.article?.id === archivedArticle.id));
  archive().props.onClick(); tree = render();
  assert.equal(archive().props['aria-expanded'], false);
  assert.ok(!tree.some(node => node.props.article?.id === archivedArticle.id));
  assert.equal(controller.selectedArticleCollection, 'archived');
  assert.deepEqual(selected, ['project:test-project', 'unclassified', 'archived']);
  archive().props.onClick(); tree = render();
  assert.equal(archive().props['aria-expanded'], true);
  tree.find(node => node.type === 'button' && label(node) === '新建项目').props.onClick({ currentTarget: { closest: () => ({ open: true }) } }); tree = render();
  const projectSection = tree.find(node => node.type === 'section' && node.props['aria-label'] === '项目');
  const entries = tree.find(node => node.type === 'section' && node.props['aria-label'] === '文章入口');
  assert.ok(nodes(projectSection).some(node => node.props.id === 'new-project-name'));
  assert.ok(!nodes(entries).some(node => node.props.id === 'new-project-name'));
});
