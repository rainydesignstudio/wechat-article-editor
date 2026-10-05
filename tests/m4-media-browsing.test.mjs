import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
import { jsx, jsxs } from 'react/jsx-runtime';
import { MEDIA_PAGE_SIZES, isMediaPageSize, paginateMedia, mediaDirectoryImages } from '../src/lib/mediaBrowsing.ts';

test('all four page sizes cover results exactly once; empty results and deletion clamp to a valid page',()=>{
  const images=Array.from({length:203},(_,index)=>index);
  for(const size of MEDIA_PAGE_SIZES){
    const first=paginateMedia(images,1,size),collected=[];
    for(let page=1;page<=first.pageCount;page++){const result=paginateMedia(images,page,size);assert.ok(result.items.length<=size);collected.push(...result.items);assert.equal(result.start,(page-1)*size+1)}
    assert.deepEqual(collected,images);assert.equal(paginateMedia(images,999,size).end,203);
  }
  assert.deepEqual(paginateMedia([],5,20),{page:1,pageCount:1,total:0,start:0,end:0,items:[]});
  assert.equal(paginateMedia(images.slice(0,3),9,20).page,1);
  for(const invalid of [0,1,30,NaN,'20',null])assert.equal(isMediaPageSize(invalid),false);
});

test('slideshow stays within one actual directory and root, with an initial item available before catalogue loading',()=>{
  const root={},other={},shared={kind:'shared',root,fileName:'one.png'},article={kind:'article',root,articleId:'2026-10/a',fileName:'one.png'};
  const assets=[shared,{...shared,fileName:'two.png'},{...shared,root:other},article,{...article,fileName:'two.png'},{...article,articleId:'2026-10/b'}];
  assert.deepEqual(mediaDirectoryImages(assets,shared).map(image=>image.fileName),['one.png','two.png']);
  assert.deepEqual(mediaDirectoryImages(assets,article).map(image=>image.fileName),['one.png','two.png']);
  assert.deepEqual(mediaDirectoryImages([],article),[article]);
});

const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node?.props?[node,...nodes(node.props.children)]:[];
async function load(relative,dependencies,globals={}){
  const module={exports:{}};
  const code=ts.transpileModule(await readFile(new URL(relative,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,Set,Object,...globals,require(id){if(id==='react/jsx-runtime')return {jsx,jsxs};if(id in dependencies)return dependencies[id];throw new Error(id)}});
  return module.exports;
}
const find=(tree,predicate)=>{const result=tree.find(predicate);assert.ok(result);return result};

test('library mounts only the current page, preserves cross-page selections and resets page when filters, sort or page size change',async()=>{
  const root={},cells=[];let cursor=0,pageSize=20,preferences={columns:1,sort:'name',descending:false};
  let assets=Array.from({length:31},(_,index)=>({kind:'shared',root,fileName:`${index+1}.png`,size:1,mimeType:'image/png',handle:{}}));
  const react={useState(initial){const index=cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return [cells[index],value=>{cells[index]=typeof value==='function'?value(cells[index]):value}]},useRef(initial){const index=cursor++;return cells[index]??={current:initial}},useMemo:callback=>callback()};
  const {useMediaPagination}=await load('../src/hooks/useMediaPagination.ts',{'react':react,'../lib/mediaBrowsing':{paginateMedia},'./useMediaPreferences':{useMediaPageSize:()=>[pageSize,value=>pageSize=value]}});
  const module=await load('../src/components/media/MediaLibrary.tsx',{
    'react':react,'../../lib/editorWorkspace':{getArticleOrganization:()=>({})},
    '../../hooks/useMediaPreferences':{useMediaPreferences:()=>[preferences,value=>preferences=value]},'../../hooks/useMediaPagination':{useMediaPagination},
    '../../hooks/useMediaLibrary':{useMediaLibrary:()=>({assets,issues:[],loading:false,refresh(){}})},'../../lib/mediaBrowsing':{mediaDirectoryImages},
    '../global/PageHeading':{PageHeading:'heading'},'../global/DialogFrame':{DialogFrame:'frame',DialogHeader:'header',DialogFooter:'footer',DialogActions:'actions',DialogButton:'button'},
    './MediaGallery':{MediaDetails:'details',MediaGallery:'gallery',MediaIcon:'icon',MediaImportButton:'import',sortMediaAssets:values=>values,formatMediaBytes:()=>'',mediaAssetKey:image=>image.fileName},
    './MediaToolbar':{MediaToolbar:'toolbar'},'./MediaPagination':{MediaPagination:'pagination'},'./MediaPreviewDialog':{MediaPreviewDialog:'preview'},'./ArticleImagePreview':{ArticleImagePreview:'image'},'./MediaManagementDialog':{MediaManagementDialog:'management'},
  },{window:{matchMedia:()=>({matches:false})}});
  const props={root,sessionKey:1,articles:[],workspace:{projects:[]},isRootCurrent:()=>true,currentArticleId:'',canAdopt:false,busy:false};
  const view=()=>{cursor=0;return nodes(module.MediaLibrary(props))};
  const pagination=()=>find(view(),node=>node.type==='pagination').props;
  const toolbar=()=>find(view(),node=>node.type==='toolbar').props;
  const gallery=()=>find(view(),node=>node.type==='gallery').props;
  assert.equal(gallery().assets.length,20);toolbar().selection.onEnable();toolbar().selection.onAll();assert.equal(toolbar().selection.count,20);
  pagination().setPage(2);assert.equal(gallery().assets.length,11);assert.equal(toolbar().selection.count,20);
  toolbar().selection.onAll();assert.equal(toolbar().selection.count,31);
  toolbar().onPreferencesChange({...preferences,descending:true});assert.equal(pagination().page,1);assert.equal(toolbar().selection.count,31);
  pagination().setPage(2);pagination().setPageSize(10);assert.equal(pagination().page,1);assert.equal(gallery().assets.length,10);
  pagination().setPage(4);assets=assets.slice(0,3);assert.equal(pagination().page,1);assert.equal(gallery().assets.length,3);
  pagination().setPageSize(20);assets=Array.from({length:31},(_,index)=>({kind:'shared',root,fileName:`${index}.png`}));pagination().setPage(2);
  toolbar().onQueryChange('1');assert.equal(pagination().page,1);assert.equal(toolbar().selection.count,0);
});

test('preview buttons and keyboard obey directory boundaries, modifiers and editable controls; zoom sizes preserve image proportions',async()=>{
  const cells=[];let cursor=0;
  class Element {constructor(editable=false){this.editable=editable}closest(){return this.editable?{}:null}}
  const react={useState(initial){const index=cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return [cells[index],value=>{cells[index]=typeof value==='function'?value(cells[index]):value}]},useRef(initial){const index=cursor++;return cells[index]??={current:initial}},useEffect(){},useId:()=> 'preview-title'};
  const module=await load('../src/components/media/MediaPreviewDialog.tsx',{'react':react,'../global/DialogFrame':{DialogFrame:'frame',DialogHeader:'header'},'../global/IconButton':{IconButton:'icon-button'},'./ArticleImagePreview':{ArticleImagePreview:'image'},'./MediaGallery':{mediaAssetKey:asset=>asset.fileName}},{Element});
  const images=[{fileName:'a.png',handle:{}},{fileName:'b.png',handle:{}}],props={initial:images[0],images,sessionKey:1,isCurrent:()=>true,onClose(){}};
  const view=()=>{cursor=0;return nodes(module.MediaPreviewDialog(props))};
  const image=()=>find(view(),node=>node.type==='image').props;
  const key=(value,target=new Element(),meta=false)=>find(view(),node=>node.type==='frame').props.onKeyDown({key:value,target,metaKey:meta,preventDefault(){},stopPropagation(){}});
  assert.equal(find(view(),node=>node.props['aria-label']==='上一张图片').props.disabled,true);
  key('ArrowRight',new Element(true));assert.equal(image().fileName,'a.png');key('ArrowRight',new Element(),true);assert.equal(image().fileName,'a.png');
  key('ArrowRight');assert.equal(image().fileName,'b.png');key('ArrowRight');assert.equal(image().fileName,'b.png');
  assert.equal(find(view(),node=>node.props['aria-label']==='下一张图片').props.disabled,true);
  image().onDimensions(1000,1500);find(view(),node=>node.type==='button'&&node.props.children==='100%').props.onClick();
  assert.deepEqual({...image().imageProps.style},{width:1000,height:1500});find(view(),node=>node.props['aria-label']==='放大图片').props.onClick();assert.deepEqual({...image().imageProps.style},{width:1250,height:1875});
  key('ArrowLeft');assert.equal(image().fileName,'a.png');assert.equal(image().imageProps.style,undefined);
  props.images=[...images,{fileName:'c.png',handle:{}}];
  const rapid=find(view(),node=>node.type==='frame').props.onKeyDown;
  const event={key:'ArrowRight',target:new Element(),preventDefault(){},stopPropagation(){}};
  rapid(event);rapid(event);assert.equal(image().fileName,'c.png','batched rapid keys advance from the latest image');
});
