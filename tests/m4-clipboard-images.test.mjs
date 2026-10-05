import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseFragment } from 'parse5';
import ts from 'typescript';
import vm from 'node:vm';
import { embedClipboardImages } from '../src/lib/clipboardImages.ts';

const png = await readFile(new URL('../public/article-sample.png', import.meta.url));
const file = () => new Blob([png], { type: 'application/octet-stream' });
const payload = html => ({ html, text: 'before\nmiddle\nafter', localImageCount: 2 });
const elements = root => (root.childNodes ?? []).flatMap(node => node.tagName ? [node, ...elements(node)] : []);
const attribute = (node, name) => node.attrs.find(attr => attr.name === name)?.value;

test('multiple images keep positions, alt and styles; encoded duplicate filenames read once and preserve all bytes', async () => {
  const reads = [];
  const result = await embedClipboardImages(payload('<section><p>before</p><img src="media/image/%E5%B0%81%E9%9D%A2%20a.png" alt="A" style="width:50%"><p>middle</p><img src="./media/image/b.png" alt="B"><p>after</p><img src="media/image/%E5%B0%81%E9%9D%A2%20a.png"></section>'), async name => { reads.push(name); return file(); }, () => true);
  assert.deepEqual(reads, ['封面 a.png', 'b.png']);
  assert.equal(result.embeddedImageCount, 3); assert.equal(result.text, 'before\nmiddle\nafter');
  const section = parseFragment(result.html).childNodes[0];
  assert.deepEqual(section.childNodes.map(node => node.tagName), ['p', 'img', 'p', 'img', 'p', 'img']);
  const images = elements(section).filter(node => node.tagName === 'img');
  assert.equal(attribute(images[0], 'alt'), 'A'); assert.equal(attribute(images[0], 'style'), 'width:50%');
  for (const image of images) { const src=attribute(image, 'src'); assert.match(src, /^data:image\/png;base64,/); assert.deepEqual(Buffer.from(src.split(',')[1], 'base64'), png); }
});

test('srcset and data-src use embedded bytes while remote sources and descriptors retain their meaning', async () => {
  let reads=0;
  const result = await embedClipboardImages(payload('<picture><source srcset="media/image/a.png 1x, https://example.test/b.png 2x"><img src="media/image/a.png" data-src="media/image/a.png" srcset="media/image/a.png 640w, media/image/c.png 1280w"></picture>'), async () => { reads++; return file(); }, () => true);
  assert.equal(reads, 2);
  const nodes=elements(parseFragment(result.html));
  assert.match(attribute(nodes.find(node=>node.tagName==='source'), 'srcset'), / 1x, https:\/\/example.test\/b.png 2x$/);
  const image=nodes.find(node=>node.tagName==='img');
  assert.equal(attribute(image, 'src'), attribute(image, 'data-src'));
  assert.match(attribute(image, 'srcset'), / 640w, data:image\/png;base64,[\w+/=]+ 1280w$/);
});

test('missing, inaccessible or unsupported image bytes fail the whole preparation; stale reads stop further file access', async () => {
  for (const reason of ['missing file', 'permission denied']) await assert.rejects(embedClipboardImages(payload('<img src="media/image/a.png">'), async ()=>{throw new Error(reason)}, ()=>true), new RegExp(reason));
  await assert.rejects(embedClipboardImages(payload('<img src="media/image/a.png">'), async ()=>new Blob(['invalid']), ()=>true), /无法从文件内容/);
  await assert.rejects(embedClipboardImages(payload('<img src="blob:orphan">'), async ()=>file(), ()=>true), /无法读取本地图片引用/);
  let current=true,reads=0;
  await assert.rejects(embedClipboardImages(payload('<img src="media/image/a.png"><img src="media/image/b.png">'), async ()=>{reads++;current=false;return file()}, ()=>current), /已取消旧稿复制/);
  assert.equal(reads,1);
});

test('bundled example images embed through their dedicated reader and documents without local images perform no reads', async () => {
  const result=await embedClipboardImages(payload('<img src="/article-sample.png">'), async()=>{throw new Error('not an article file')}, ()=>true, async()=>file());
  assert.equal(result.embeddedImageCount,1); assert.match(result.html,/data:image\/png;base64,/);
  const remote=await embedClipboardImages(payload('<p>plain</p><img src="https://example.test/remote.png">'), async()=>{throw new Error('must not read')}, ()=>true);
  assert.equal(remote.embeddedImageCount,0); assert.match(remote.html,/https:\/\/example.test\/remote.png/);
});

const controller=await readFile(new URL('../src/hooks/useEditorController.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('controller.ts',controller,ts.ScriptTarget.Latest,true);
let initializer;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='copyRichText')initializer=node.initializer;ts.forEachChild(node,visit)}
visit(ast);
function copyFixture({ decision=true, getFile=async()=>file(), placeholder=false }={}) {
  const writes=[],statuses=[]; let current=true,reads=0;
  let began; const readStarted=new Promise(resolve=>{began=resolve});
  const snapshot={revision:7,source:'body',theme:{},directory:{},month:'2026-10',folder:'test'};
  const context={Blob,Promise,Error,requestAnimationFrame:callback=>callback(),useCallback:callback=>callback,
    copyRequestRef:{current:0},mediaOperationRef:{current:null},articleRef:{current:{dirty:false}},previewRef:{current:{querySelector:()=>placeholder?{}:null}},
    setLoadInspectionRevision(){},isReadyToCopy:true,snapshotFor:()=>snapshot,matchesSnapshot:()=>current,compiledRevision:7,compileCurrent:async()=>true,
    saveSnapshot:async()=>({ok:true,current,savedSnapshot:snapshot}),
    inspectArticleFormatReport:async()=>({}),buildClipboardPayload:()=>payload('<p>before</p><img src="media/image/a.png"><p>middle</p><img src="media/image/b.png"><p>after</p>'),
    confirmFormatCheck:async()=>decision,embedClipboardImages,getArticleMediaDirectory:async()=>({getFileHandle:async()=>({getFile:async()=>{reads++;const result=getFile();began();return result}})}),
    setStatus:value=>statuses.push(value),ClipboardItem:class{constructor(types){this.types=types}},navigator:{clipboard:{write:async items=>writes.push(items)}},
  };
  vm.runInNewContext(ts.transpileModule(`globalThis.copy=${initializer.getText(ast)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {copy:context.copy,writes,statuses,context,readStarted,stop(){current=false},get reads(){return reads}};
}

test('formal copy writes one complete HTML/plain payload after the existing report decision; cancellation performs no image reads', async()=>{
  const f=copyFixture();await f.copy();assert.equal(f.writes.length,1);
  const representations=f.writes[0][0].types;
  assert.deepEqual(Object.keys(representations),['text/html','text/plain']);
  const html=await representations['text/html'].text();assert.equal((html.match(/data:image\/png;base64,/g)||[]).length,2);
  assert.equal(await representations['text/plain'].text(),'before\nmiddle\nafter');assert.equal(f.statuses.at(-1).tone,'success');
  const cancelled=copyFixture({decision:false});await cancelled.copy();assert.equal(cancelled.reads,0);assert.equal(cancelled.writes.length,0);
  const failedSave=copyFixture();failedSave.context.articleRef.current.dirty=true;failedSave.context.saveSnapshot=async()=>({ok:false});await failedSave.copy();assert.equal(failedSave.reads,0);assert.equal(failedSave.writes.length,0);
});

test('formal copy retains clipboard on unreadable files, unresolved preview images and changed documents', async()=>{
  const broken=copyFixture({getFile:async()=>{throw new Error('permission denied')}});await broken.copy();assert.equal(broken.writes.length,0);assert.match(broken.statuses.at(-1).label,/permission denied/);
  const loading=copyFixture({placeholder:true});await loading.copy();assert.equal(loading.reads,0);assert.equal(loading.writes.length,0);assert.match(loading.statuses.at(-1).label,/尚未就绪/);
  let finish;const stale=copyFixture({getFile:()=>new Promise(resolve=>{finish=resolve})});const pending=stale.copy();
  await stale.readStarted;stale.stop();finish(file());await pending;assert.equal(stale.writes.length,0);assert.equal(stale.reads,1);
});

test('a second copy supersedes an older pending image read and only the latest request writes the clipboard', async()=>{
  let finish,calls=0;const f=copyFixture({getFile:()=>++calls===1?new Promise(resolve=>{finish=resolve}):Promise.resolve(file())});
  const first=f.copy();await f.readStarted;await f.copy();finish(file());await first;assert.equal(f.writes.length,1);assert.equal(f.statuses.at(-1).tone,'success');
});
