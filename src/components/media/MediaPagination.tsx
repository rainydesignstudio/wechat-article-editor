'use client';

import { MEDIA_PAGE_SIZES, type MediaPageSize } from '../../lib/mediaBrowsing';
import { IconButton } from '../global/IconButton';

export function MediaPagination({ page, pageCount, start, end, total, pageSize, setPage, setPageSize, disabled = false }: {
  page: number; pageCount: number; start: number; end: number; total: number; pageSize: MediaPageSize;
  setPage: (page: number) => void; setPageSize: (size: MediaPageSize) => void; disabled?: boolean;
}) {
  return <nav className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line p-4 text-xs text-muted" aria-label="图片分页">
    <span className="mr-auto" role="status">显示 {start}–{end}／{total} 张</span>
    <label className="flex shrink-0 items-center gap-2"><span>每页</span><select className="field min-h-9 w-auto py-1 text-xs" aria-label="每页图片数量" value={pageSize} disabled={disabled} onChange={event => setPageSize(Number(event.target.value) as MediaPageSize)}>{MEDIA_PAGE_SIZES.map(size => <option key={size} value={size}>{size} 张</option>)}</select></label>
    <div className="flex shrink-0 items-center gap-1">
      <IconButton tooltip="上一页" disabled={disabled || page <= 1} onClick={() => setPage(page - 1)} icon={<span aria-hidden="true">←</span>} />
      <label><span className="sr-only">图片页码</span><select className="field min-h-9 w-auto py-1 text-xs" aria-label="图片页码" value={page} disabled={disabled || pageCount <= 1} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}／{pageCount}</option>)}</select></label>
      <IconButton tooltip="下一页" disabled={disabled || page >= pageCount} onClick={() => setPage(page + 1)} icon={<span aria-hidden="true">→</span>} />
    </div>
  </nav>;
}
