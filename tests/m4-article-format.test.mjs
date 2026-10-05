import assert from 'node:assert/strict';
import test from 'node:test';
import { validateArticleFormatCss, validateArticleFormatHtml, validateArticleFormatMarkdown, inspectArticleFormatMarkdown, articleFormatAllowsCssProperty, validateRenderedArticleCss } from '../src/lib/articleFormat.ts';
import { validateArticleAuthoringMarkdown } from '../src/lib/articleAuthoringFormat.ts';
import { inspectArticleFormatReport, finalizeFormatSection } from '../src/lib/articleFormatReport.ts';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { DEFAULT_FORMAT_BUNDLE } from '../src/lib/article-format/config.ts';
import { activateFormatBundle } from '../src/lib/article-format/runtime.ts';

test('empty articles do not pretend to exercise theme or body rules', async () => {
  const report = await inspectArticleFormatReport('', BASIC_THEME, null);
  assert.deepEqual(report.theme, { passed: [], issues: [] });
  assert.deepEqual(report.body, { passed: [], issues: [] });
  assert.equal(report.complete, true); assert.ok(report.formatId);
});
test('unmentioned HTML and CSS are not invented official warnings or prohibitions', async () => {
  assert.deepEqual(await validateArticleAuthoringMarkdown('<aside class="grid gap-4"><figure>内容</figure></aside>'), []);
  assert.deepEqual(validateArticleFormatCss('section { height:auto; border-collapse:collapse; position:relative; }'), []);
  assert.equal(articleFormatAllowsCssProperty('height', 'auto'), true);
  assert.equal(articleFormatAllowsCssProperty('position', 'relative'), true);
});
test('official font advice, alignment and important findings retain IDs, source and severity', () => {
  const issues = validateArticleFormatCss('p { font-family:Georgia; text-align:start; color:red !important }');
  assert.deepEqual(issues.map(i => i.ruleId), ['font-family', 'text-align', 'important']);
  assert.ok(issues.every(i => i.tier === 'warning' && i.domain === 'standard' && i.reference.startsWith('https://developers.weixin.qq.com/')));
  assert.equal(articleFormatAllowsCssProperty('font-family'), false);
});
test('CSS locations remain declaration-based; article locations start in the body after Front Matter', async () => {
  assert.equal(validateArticleFormatCss('p {\n color:red;\n text-align:end;\n}')[0].line, 3);
  const source = '---\ntitle: 测试\n---\n正文\n\n<p style="text-align:start">正文</p>';
  const report = await inspectArticleFormatReport(source, BASIC_THEME, null, undefined, { deep: false });
  assert.equal(report.body.issues.find(i => i.ruleId === 'text-align').line, 3);
  assert.equal(report.complete, false);
});
test('product safety and malformed structure remain separate from platform rules', () => {
  assert.ok(validateArticleFormatHtml('<script>alert(1)</script><p onclick="alert(1)">正文</p>').some(i => i.tier === 'error' && i.domain === 'product'));
  assert.ok(validateArticleFormatMarkdown('<section>正文</tdction>').some(i => i.domain === 'product'));
});
test('leaf nesting is checked before generated paragraphs and HTML repair can hide it', () => {
  assert.ok(validateArticleFormatMarkdown('<span leaf><section>块节点</section></span>').some(issue => issue.ruleId === 'span-leaf' && issue.tier === 'error'));
  assert.equal(validateArticleFormatMarkdown('<span leaf><strong>行内文字</strong><img src="/article-sample.png"></span>').some(issue => issue.ruleId === 'span-leaf'), false);
  assert.equal(validateArticleFormatMarkdown('`<span leaf><section>代码示例</section></span>`').some(issue => issue.ruleId === 'span-leaf'), false);
});
test('raw authoring class occurrences remain available for contextual compilation', () => {
  const inspected = inspectArticleFormatMarkdown('<p class="text-right">甲</p>\n\n<p class="text-right">乙</p>', '正文', true);
  assert.deepEqual(inspected.classes, ['text-right']);
  assert.deepEqual(inspected.classLines.get('text-right'), [1, 3]);
});
test('the same registered value capability applies to authored CSS and inline HTML', () => {
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE);
  raw.support.meta.sources['local-policy'] = { url: 'https://example.test/policy' };
  raw.support.rules.push({ id: 'local-align', section: 'local', title: '本库对齐约定', severity: 'error', source: 'local-policy', validator: 'local-align' });
  raw.validator.rules.push({ id: 'local-align', operator: 'style.values', enabled: true, stages: ['authoring'], parameters: { property: 'text-align', values: ['justify'] } });
  activateFormatBundle(raw, 'unit-test');
  try {
    assert.equal(validateArticleFormatCss('p {text-align:justify}')[0].ruleId, 'local-align');
    assert.equal(validateArticleFormatHtml('<p style="text-align:justify">正文</p>')[0].ruleId, 'local-align');
  } finally { activateFormatBundle(DEFAULT_FORMAT_BUNDLE, null, 'built-in'); }
});
test('only selectors used by the actual article enter its theme report', () => {
  const preview = { matches: () => false, querySelector: selector => selector.includes(' p') ? {} : null };
  const issues = validateRenderedArticleCss(preview, '.article-preview .article-body h1{font-family:Georgia}.article-preview .article-body p{text-align:start}');
  assert.deepEqual(issues.map(i => i.ruleId), ['text-align']);
});
test('violations are never also passed and repeated stage findings are collapsed by rule and location', () => {
  const issue = { ruleId: 'height', kind: 'element', name: '高度', tier: 'error', line: 3 };
  const section = finalizeFormatSection({ passed: ['CSS语法', '规则 height', '规则 width'], issues: [{ ...issue, source: '源码' }, { ...issue, source: '实际渲染' }] });
  assert.deepEqual(section.passed, ['CSS语法', '规则 width']); assert.equal(section.issues.length, 1);
});
