'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { LibraryMediaAsset } from '../../lib/articleMedia';
import { DialogFrame, DialogHeader } from '../global/DialogFrame';
import { IconButton } from '../global/IconButton';
import { ArticleImagePreview } from './ArticleImagePreview';
import { mediaAssetKey } from './MediaGallery';

export function MediaPreviewDialog({ initial, images, sessionKey, isCurrent, onClose }: {
  initial: LibraryMediaAsset; images: LibraryMediaAsset[]; sessionKey: number; isCurrent: () => boolean; onClose: () => void;
}) {
  const titleId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(() => mediaAssetKey(initial));
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const index = images.findIndex(image => mediaAssetKey(image) === key);
  const image = images[index];
  const fit = dimensions.width && dimensions.height ? Math.max(0.01, Math.min(1, viewport.width / dimensions.width, viewport.height / dimensions.height)) : 1;
  const scale = zoom ?? fit;
  const move = (direction: number) => {
    const next = images[index + direction];
    if (!next || !isCurrent()) return;
    setKey(previous => {
      const currentIndex = images.findIndex(candidate => mediaAssetKey(candidate) === previous);
      const candidate = images[currentIndex + direction];
      return candidate ? mediaAssetKey(candidate) : previous;
    });
    setDimensions({ width: 0, height: 0 }); setZoom(null);
    viewportRef.current?.scrollTo(0, 0);
  };
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setViewport(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  if (!image || !isCurrent()) return null;
  return <DialogFrame titleId={titleId} onClose={onClose} large onKeyDown={event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowLeft' ? -1 : 1); }
  }}>
    <DialogHeader titleId={titleId} eyebrow="IMAGE PREVIEW" title="图片预览" onClose={onClose} />
    <div className="flex shrink-0 items-center gap-3 border-b border-line p-4"><p className="min-w-0 flex-1 truncate text-sm text-primary" title={image.fileName}>{image.fileName}</p><span className="shrink-0 font-mono text-xs text-muted" role="status">{index + 1}／{images.length}</span></div>
    <div ref={viewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-list p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" tabIndex={0} aria-label="图片预览区域">
      <div className="grid min-h-full min-w-full place-items-center" style={dimensions.width ? { width: dimensions.width * scale, height: dimensions.height * scale } : undefined}>
        <ArticleImagePreview key={key} handle={image.handle} fileName={image.fileName} alt={image.description || image.fileName} variant="dialog" sessionKey={`${sessionKey}:${key}:original`} isCurrent={isCurrent}
          onDimensions={(width, height) => setDimensions(previous => previous.width === width && previous.height === height ? previous : { width, height })}
          imageProps={{ className: 'max-h-none max-w-none shrink-0', style: dimensions.width ? { width: dimensions.width * scale, height: dimensions.height * scale } : undefined }} />
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-line p-4" role="group" aria-label="图片预览操作">
      <IconButton tooltip="上一张图片 · 左方向键" aria-label="上一张图片" disabled={index <= 0} onClick={() => move(-1)} icon={<span aria-hidden="true">←</span>} />
      <IconButton tooltip="缩小图片" aria-label="缩小图片" disabled={!dimensions.width || scale <= 0.01} onClick={() => setZoom(Math.max(0.01, scale - 0.25))} icon={<span aria-hidden="true">−</span>} />
      <span className="min-w-12 text-center font-mono text-xs text-secondary" role="status">{Math.round(scale * 100)}%</span>
      <IconButton tooltip="放大图片" aria-label="放大图片" disabled={!dimensions.width || scale >= 8} onClick={() => setZoom(Math.min(8, scale + 0.25))} icon={<span aria-hidden="true">+</span>} />
      <button className="button button-quiet min-h-9 py-1 text-xs" disabled={!dimensions.width} onClick={() => setZoom(1)}>100%</button>
      <button className="button button-quiet min-h-9 py-1 text-xs" disabled={!dimensions.width} onClick={() => { setZoom(null); viewportRef.current?.scrollTo(0, 0); }}>适应窗口</button>
      <IconButton tooltip="下一张图片 · 右方向键" aria-label="下一张图片" disabled={index >= images.length - 1} onClick={() => move(1)} icon={<span aria-hidden="true">→</span>} />
    </div>
  </DialogFrame>;
}
