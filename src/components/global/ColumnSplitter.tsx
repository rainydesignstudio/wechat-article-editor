'use client';

import type { useResizableColumns } from '../../hooks/useResizableColumns';

export function ColumnSplitter({ layout, label, controls }: { layout: ReturnType<typeof useResizableColumns>; label: string; controls?: string }) {
  if (!layout.wideEnough) return null;
  return <button className="editor-splitter" type="button" role="separator" aria-label={label} aria-controls={controls} aria-orientation="vertical"
    aria-valuemin={Math.ceil(layout.minRatio)} aria-valuemax={Math.floor(layout.maxRatio)} aria-valuenow={Math.round(layout.ratio)} data-dragging={layout.dragging}
    onPointerDown={layout.startDrag} onPointerMove={layout.moveDrag} onPointerUp={layout.stopDrag} onPointerCancel={layout.stopDrag} onLostPointerCapture={layout.stopDrag} onKeyDown={layout.keyResize}><span /></button>;
}
