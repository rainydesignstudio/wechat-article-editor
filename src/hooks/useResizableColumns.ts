'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { clampEditorSourceRatio, editorSourceRatioFromPointer, getEditorSourceWidth, getEditorSplitLimits, resizeEditorSourceRatio } from '../lib/editorLayout';

export function useResizableColumns(initialRatio = 50, breakpoint = '(width >= 64rem)', identity?: unknown) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [ratio, setRatio] = useState(initialRatio);
  const [width, setWidth] = useState(0);
  const [wideEnough, setWideEnough] = useState(false);
  const [dragging, setDragging] = useState(false);
  const stopDrag = () => { draggingRef.current = false; setDragging(false); };
  useEffect(() => {
    const finish = () => { if (draggingRef.current) stopDrag(); };
    const onVisibilityChange = () => { if (document.visibilityState !== 'visible') finish(); };
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
    window.addEventListener('blur', finish);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      window.removeEventListener('blur', finish);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      const measured = element.getBoundingClientRect().width;
      const enough = window.matchMedia(breakpoint).matches && getEditorSplitLimits(measured) !== null;
      setWidth(measured); setWideEnough(enough);
      if (enough) setRatio(current => clampEditorSourceRatio(measured, current));
      else { draggingRef.current = false; setDragging(false); }
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener('resize', update);
    return () => { draggingRef.current = false; observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [breakpoint, identity]);
  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !wideEnough) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch { return; }
    draggingRef.current = true; setDragging(true);
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setRatio(editorSourceRatioFromPointer(event.clientX, rect.left, rect.width));
  };
  const keyResize = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!containerRef.current) return;
    const next = resizeEditorSourceRatio(containerRef.current.getBoundingClientRect().width, ratio, event.key);
    if (next === null) return;
    event.preventDefault(); setRatio(next);
  };
  const limits = getEditorSplitLimits(width);
  const style = { '--editor-source-width': `${getEditorSourceWidth(width, ratio)}px` } as CSSProperties;
  return { containerRef, wideEnough, dragging, ratio, style, minRatio: limits?.minimumRatio ?? 50, maxRatio: limits?.maximumRatio ?? 50, startDrag, moveDrag, stopDrag, keyResize };
}
