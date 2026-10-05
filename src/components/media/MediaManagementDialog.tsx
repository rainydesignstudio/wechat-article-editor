'use client';
import { useEffect, useRef, useState } from 'react';
import type { ArticleSummary } from '../../lib/types';
import type { LibraryMediaAsset, MediaActionOutcome } from '../../lib/articleMedia';
import type { MediaDestination, MediaEditRequest, MediaMutation, MediaReferenceScan } from '../../lib/mediaManagement';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { MediaIcon } from './MediaGallery';
const titles = { rename: '改文件名', replace: '替换图片', describe: '编辑描述', delete: '删除图片', transfer: '移动或复制图片' };
export function MediaManagementDialog({ request, articles, busy, isCurrent, currentReferences, scanReferences, onSubmit, onClose }: {
  request: MediaEditRequest; articles: ArticleSummary[]; busy: boolean; isCurrent: () => boolean;
  currentReferences: number | null;
  scanReferences: (assets: LibraryMediaAsset[], signal: AbortSignal) => Promise<MediaReferenceScan>;
  onSubmit: (operation: MediaMutation) => Promise<MediaActionOutcome>;
  onClose: () => void;
}) {
  const asset = request.assets[0];
  const [name, setName] = useState(asset.fileName.replace(/\.[^.]+$/, ''));
  const [description, setDescription] = useState(asset.description ?? '');
  const [file, setFile] = useState<File | undefined>();
  const [destination, setDestination] = useState('');
  const [scanState, setScanState] = useState<{ request: MediaEditRequest; scanning: boolean; result?: MediaReferenceScan } | null>(null);
  const scanRef = useRef<AbortController | null>(null);
  const [notice, setNotice] = useState<MediaActionOutcome | null>(null);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const locked = busy || working;
  const scanning = scanState?.request === request && scanState.scanning;
  const scanned = scanState?.request === request ? scanState.result : undefined;
  const showReferences = request.type === 'delete' || request.type === 'transfer';
  useEffect(() => () => { scanRef.current?.abort(); }, [request]);
  const scan = async () => {
    if (workingRef.current || busy || !isCurrent() || scanRef.current && !scanRef.current.signal.aborted) return;
    const controller = new AbortController(); scanRef.current = controller;
    setScanState({ request, scanning: true }); setNotice(null);
    try {
      const result = await scanReferences(request.assets, controller.signal);
      if (!controller.signal.aborted && isCurrent()) {
        setScanState({ request, scanning: false, result });
        if (result.issues.length) setNotice({ ok: false, tone: 'warning', message: `${result.issues.length} 份文件无法核对，工作区统计不完整。${result.issues.slice(0, 3).join('；')}` });
      }
    } catch (error) {
      if (!controller.signal.aborted && isCurrent()) { setScanState({ request, scanning: false }); setNotice({ ok: false, tone: 'error', message: `引用扫描失败，可重试：${error instanceof Error ? error.message : String(error)}` }); }
    } finally { if (scanRef.current === controller) scanRef.current = null; }
  };
  const close = () => { if (!workingRef.current && !busy) { scanRef.current?.abort(); onClose(); } };
  const submit = async () => {
    if (workingRef.current || busy || !isCurrent() || scanRef.current && !scanRef.current.signal.aborted) return;
    workingRef.current = true; setWorking(true); setNotice(null);
    const chosen = articles.find(article => article.id === destination);
    const target: MediaDestination | undefined = destination === 'shared' ? { kind: 'shared' } : chosen ? { kind: 'article', articleId: chosen.id, month: chosen.month, folder: chosen.folder, title: chosen.parse.metadata.title } : undefined;
    try { const result = await onSubmit({ ...request, name, description, file, destination: target }); if (isCurrent()) { setNotice(result); if (result.ok) onClose(); } }
    catch (error) { if (isCurrent()) setNotice({ ok: false, tone: 'error', message: error instanceof Error ? error.message : String(error) }); }
    finally { workingRef.current = false; setWorking(false); }
  };
  const disabled = locked || scanning || !isCurrent() || request.type === 'rename' && !name.trim() || request.type === 'replace' && !file || request.type === 'transfer' && !destination;
  return <DialogFrame titleId="media-management-title" onClose={close} dismissible={!locked} role={request.type === 'delete' ? 'alertdialog' : 'dialog'}>
    <DialogHeader titleId="media-management-title" eyebrow="IMAGE MANAGEMENT" title={titles[request.type]} onClose={close} closeDisabled={locked} />
    <div className="grid min-w-0 gap-4 p-4">
      <p className="break-all text-sm text-secondary">{request.assets.length === 1 ? asset.fileName : `已选择 ${request.assets.length} 张图片`}</p>
      {request.assets.length > 1 ? <ul className="max-h-28 overflow-x-clip overflow-y-auto break-all text-xs text-muted">{request.assets.map(asset => <li key={`${asset.kind}:${asset.kind === 'article' ? asset.articleId : 'shared'}:${asset.fileName}`}>{asset.fileName}</li>)}</ul> : null}
      {request.type === 'rename' ? <label className="field-stack"><span className="field-label">文件名（不含扩展名）</span><input autoFocus className="field" value={name} onChange={event => setName(event.target.value)} disabled={locked} /><span className="text-xs text-muted">{asset.kind === 'article' ? '更新当前正文引用，保留历史所需原文件。' : '共享文件改名；已采用的文章副本保持原样。'}</span></label> : null}
      {request.type === 'describe' ? <label className="field-stack"><span className="field-label">描述</span><textarea className="field min-h-28" value={description} onChange={event => setDescription(event.target.value)} disabled={locked} placeholder="可留空" /><span className="text-xs text-muted">保存为素材信息，已有正文alt不自动修改。</span></label> : null}
      {request.type === 'replace' ? <><label className="field-stack"><span className="field-label">选择替换图片</span><input className="field" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif" disabled={locked} onChange={event => setFile(event.target.files?.[0])} /></label><p className="text-xs text-muted">{asset.kind === 'article' ? '更新当前文章的图片引用，保留历史旧图。' : '替换共享原件，已采用的文章副本保持原样。'}</p></> : null}
      {request.type === 'transfer' ? <label className="field-stack"><span className="field-label">目标位置</span><select className="field" value={destination} disabled={locked} onChange={event => setDestination(event.target.value)}><option value="">请选择…</option><option value="shared">共享素材</option>{articles.map(article => <option key={article.id} value={article.id}>{article.parse.metadata.title}</option>)}</select><span className="text-xs text-muted">未引用文件移动；被正文或历史引用的文件复制，保留来源。不自动插入正文。</span></label> : null}
      {request.type === 'delete' ? <p className="rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">确认后永久删除所选图片文件，无法通过文稿台恢复。正文与历史中的引用保留，会显示图片缺失诊断。</p> : null}
      {notice ? <p className="status-copy break-words text-sm" data-tone={notice.tone} role="status">{notice.message}</p> : null}
    </div>
    <DialogFooter><DialogActions>
      {showReferences ? <><p className="mr-auto min-w-0 basis-full self-center text-xs text-muted md:flex-1" role="status">{scanning ? '扫描中……请稍后' : scanned ? `${scanned.current === null ? '未打开当前文稿' : `本文 ${scanned.current} 处`}，全工作区 ${scanned.workspace} 处（含历史${scanned.issues.length ? '，部分未核对' : ''}）` : `${currentReferences === null ? '未打开当前文稿' : `当前文稿正文 ${currentReferences} 处`}，工作区未扫描`}</p><DialogButton disabled={locked || scanning} title="本文按当前草稿；全工作区统计已保存正文与历史，按实际文件路径区分独立副本。" onClick={() => void scan()}><MediaIcon name="search" />扫描引用</DialogButton></> : null}
      <DialogButton disabled={locked} onClick={close}><MediaIcon name="close" />取消</DialogButton><DialogButton variant={request.type === 'delete' ? 'danger' : 'primary'} disabled={Boolean(disabled)} onClick={() => void submit()}>{locked ? '正在处理…' : request.type === 'delete' ? '确认删除' : request.type === 'transfer' ? '确认移动／复制' : '保存修改'}</DialogButton>
    </DialogActions></DialogFooter>
  </DialogFrame>;
}
