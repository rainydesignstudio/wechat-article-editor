'use client';

import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useRef, useState, type MutableRefObject } from 'react';
import { articleExportBaseName, createArticleDocumentPackage, downloadArticleBlob } from '../../lib/articleExport';
import { articleCanvasToPdf, articleCanvasToPng, renderArticleExportCanvas } from '../../lib/articleVisualExport';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';

type Format = 'package' | 'markdown' | 'png' | 'pdf';

const FORMATS: { id: Format; title: string; extension: string; detail: string }[] = [
  { id: 'package', title: '文档包', extension: 'zip', detail: 'article.md 与 ./media/ 资源目录，打包为 ZIP。' },
  { id: 'markdown', title: 'Markdown', extension: 'md', detail: '只下载当前 .md 源码；本地图片路径保持原样。' },
  { id: 'png', title: '长图片', extension: 'png', detail: '按当前主题的浅色排版生成完整单张图片。' },
  { id: 'pdf', title: 'PDF', extension: 'pdf', detail: '按浅色排版生成 A4 多页 PDF；文字以图片形式排入。' },
];

export function ArticleExportDialog({ source, title, dirty, root, month, folder, visualAvailable, previewRef, isCurrent, prepareVisual, onExported, onClose }: {
  source: string;
  title: string;
  dirty: boolean;
  root: FileSystemDirectoryHandle;
  month: string | null;
  folder: string | null;
  visualAvailable: boolean;
  previewRef: MutableRefObject<HTMLElement | null>;
  isCurrent: () => boolean;
  prepareVisual: () => Promise<boolean>;
  onExported: (fileName: string, mediaFiles?: number) => void;
  onClose: () => void;
}) {
  const formatSnapshot = useFormatSnapshot();
  const [format, setFormat] = useState<Format>('package');
  const [fileBase, setFileBase] = useState(() => articleExportBaseName(title));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const exportingRef = useRef(false);
  const selected = FORMATS.find(item => item.id === format)!;
  const fileName = `${articleExportBaseName(fileBase)}.${selected.extension}`;
  const exportArticle = async () => {
    if (exportingRef.current || !isCurrent()) return;
    exportingRef.current = true;
    setBusy(true);
    setError('');
    let completed = false;
    try {
      let blob: Blob;
      let mediaFiles: number | undefined;
      if (format === 'markdown') {
        blob = new Blob([source], { type: 'text/markdown;charset=utf-8' });
      } else if (format === 'package') {
        const result = await createArticleDocumentPackage(source, root, month, folder);
        blob = result.blob;
        mediaFiles = result.mediaFiles;
      } else {
        if (!visualAvailable || !await prepareVisual() || !isCurrent() || !previewRef.current) {
          throw new Error('当前排版尚未就绪，请处理文稿或主题问题后重试。');
        }
        const { canvas, blockEnds } = await renderArticleExportCanvas(previewRef.current);
        blob = format === 'png' ? await articleCanvasToPng(canvas) : await articleCanvasToPdf(canvas, blockEnds);
      }
      if (!isCurrent()) throw new Error('导出期间文稿或资料库已切换；没有下载旧内容。');
      downloadArticleBlob(blob, fileName);
      onExported(fileName, mediaFiles);
      completed = true;
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      exportingRef.current = false;
      if (!completed) setBusy(false);
    }
  };
  return <DialogFrame titleId="article-export-title" descriptionId="article-export-description" onClose={onClose} dismissible={!busy} className="flex min-h-0 max-w-2xl flex-col overflow-hidden">
    <DialogHeader titleId="article-export-title" eyebrow="EXPORT ARTICLE" title="导出文章" onClose={onClose} closeDisabled={busy} />
    <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); void exportArticle(); }}>
      <div className="grid min-h-0 gap-4 overflow-x-clip overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        <p id="article-export-description" className="text-sm text-muted">导出当前编辑稿{dirty ? '，包含未保存修改' : ''}；不会保存或改动资料库中的文章。</p>
        <label className="field-stack min-w-0"><span className="field-label">下载文件名</span><input className="field" value={fileBase} maxLength={80} onChange={event => setFileBase(event.target.value)} disabled={busy} /><span className="text-xs text-faint">下载为 {fileName}</span></label>
        <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 text-sm font-semibold text-primary">格式</legend>
          {FORMATS.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-panel p-3 hover:border-accent-line has-checked:border-accent-line has-checked:bg-accent-soft has-disabled:cursor-not-allowed has-disabled:opacity-50">
            <input className="mt-1 accent-accent" type="radio" name="article-export-format" value={item.id} checked={format === item.id} onChange={() => setFormat(item.id)} disabled={busy || (item.id === 'png' || item.id === 'pdf') && !visualAvailable} />
            <span className="grid min-w-0 gap-1"><strong className="text-sm font-semibold text-primary">{item.title} <span className="font-mono text-xs font-normal text-muted">.{item.extension}</span></strong><span className="text-xs text-muted">{item.detail}</span></span>
          </label>)}
        </fieldset>
        {(format === 'png' || format === 'pdf') ? <p className="rounded-lg border border-line bg-list/50 p-3 text-xs text-muted">按 {formatSnapshot.bundle.formatter.output.visual.width}px 的文章宽度生成；内容过长或资源无法载入时会停止并说明原因，不截断文章。</p> : null}
        {format === 'package' && !folder ? <p className="rounded-lg border border-line bg-list/50 p-3 text-xs text-muted">当前文稿尚未保存，文档包将包含当前 article.md 与空的 media/ 目录。</p> : null}
        {error ? <p className="rounded-lg border border-danger/30 bg-danger-surface p-3 text-sm text-danger" role="alert">{error}</p> : null}
      </div>
      <DialogFooter><DialogActions><DialogButton disabled={busy} onClick={onClose}>取消</DialogButton><DialogButton type="submit" variant="primary" disabled={busy || !isCurrent()}>{busy ? '生成中…' : `导出 ${selected.title}`}</DialogButton></DialogActions></DialogFooter>
    </form>
  </DialogFrame>;
}
