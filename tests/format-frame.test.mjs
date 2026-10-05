import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'parse5';
import { formatPreviewDocument } from '../src/lib/article-format/frame.ts';
import { getFormatSnapshot } from '../src/lib/article-format/runtime.ts';

test('frame configuration is inert JSON, escapes closing tags, and runs only external scripts', () => {
  const snapshot = structuredClone(getFormatSnapshot());
  snapshot.bundle.support.meta.name = '</script><script>malicious()</script>';
  const tree = parse(formatPreviewDocument('', '<article class="article-preview">正文</article>', true, snapshot));
  const scripts = [];
  const walk = node => { if (node.tagName === 'script') scripts.push(node); node.childNodes?.forEach(walk); };
  walk(tree);
  const attributes = node => Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
  const executable = scripts.filter(node => attributes(node).type !== 'application/json');
  assert.equal(executable.length, 3);
  assert.ok(executable.every(node => attributes(node).src && !node.childNodes.length));
  assert.ok(executable.some(node => attributes(node).src === '/article-format-bootstrap.js'));
  const data = scripts.find(node => attributes(node).type === 'application/json');
  assert.equal(JSON.parse(data.childNodes[0].value).bundle.support.meta.name, snapshot.bundle.support.meta.name);
});

test('static frame bootstrap reports inspection results and failures without eval or inline execution', async () => {
  const script = await readFile(new URL('../public/article-format-bootstrap.js', import.meta.url), 'utf8');
  for (const fail of [false, true]) {
    const posted = [], attributes = [];
    const payload = { kind: 'inspection', bundle: getFormatSnapshot().bundle, token: 'nonce', origin: 'http://127.0.0.1:3501', css: 'body{}' };
    const context = {
      document: { head: { querySelector: () => ({ textContent: JSON.stringify(payload) }) }, querySelector: () => ({}), body: { setAttribute: (...args) => attributes.push(args) } },
      window: { ArticleFormatEngine: { async inspect() { if (fail) throw new Error('measurement failed'); return { checked: ['width'], issues: [], manual: [] }; } } },
      parent: { postMessage: (...args) => posted.push(args) },
    };
    vm.runInNewContext(script.replace('void runFormatFrameBootstrap();', 'window.bootComplete = runFormatFrameBootstrap();'), context, { codeGeneration: { strings: false, wasm: false } });
    await context.window.bootComplete;
    assert.equal(posted.length, 1);
    assert.equal(posted[0][0].token, 'nonce');
    assert.equal(posted[0][1], payload.origin);
    if (fail) { assert.match(posted[0][0].error, /measurement failed/); assert.equal(attributes[0][0], 'data-preview-error'); }
    else assert.equal(posted[0][0].result.checked[0], 'width');
  }
});
