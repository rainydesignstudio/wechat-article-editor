'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { animateInspectionScroll, INSPECTION_CLASSES, inspectionDimmedElements, uniqueBindings, type ColorBinding } from '../../lib/themeInspection';

export function useThemeInspection() {
  const listRef = useRef<HTMLElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<ColorBinding | null>(null);
  useEffect(() => {
    if (!selected) return;
    let cancelScroll = () => {};
    // Locate after the requested tab/panel has mounted and expanded.
    const frame = requestAnimationFrame(() => {
      const row = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-inspection-option]') ?? []).find(item => item.dataset.inspectionOption === selected.key);
      if (row) { cancelScroll = animateInspectionScroll(row); row.focus({ preventScroll: true }); }
    });
    return () => { cancelAnimationFrame(frame); cancelScroll(); };
  }, [selected]);
  const rowProps = (key: string) => ({
    'data-inspection-option': key,
    'data-inspection-dim': Boolean(selected && selected.kind !== 'css' && selected.key !== key),
    'data-inspection-selected': selected?.key === key,
    tabIndex: -1,
    onPointerEnter: () => { setSelected(null); setHovered(key); }, onPointerLeave: () => setHovered(null),
    onFocusCapture: () => setHovered(key),
    onBlurCapture: (event: React.FocusEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(null); },
  });
  const clear = () => { setSelected(null); setHovered(null); };
  const listProps = { onPointerEnter: () => setSelected(null) };
  return { listRef, listProps, hovered, selected, locate: setSelected, rowProps, clear };
}
export type ThemeInspection = ReturnType<typeof useThemeInspection>;
export const INSPECTION_ROW_CLASSES = 'transition-opacity duration-300 data-[inspection-dim=true]:opacity-50 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

type Popup = { element: HTMLElement; bindings: ColorBinding[]; left: number; top: number; bottom: number };
type Props = {
  inspection: ThemeInspection; dialogOwner: string; children?: ReactNode; className?: string;
  resolve: (element: HTMLElement, root: HTMLElement) => ColorBinding[];
  rootRef?: RefObject<HTMLElement | null>;
  frameRef?: RefObject<HTMLIFrameElement | null>;
  revision?: unknown;
  onLocate?: (binding: ColorBinding) => void;
};

export function ThemeInspectionPreview({ inspection, dialogOwner, children, className = '', resolve, rootRef, frameRef, revision, onLocate }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [fading, setFading] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const hoveredElement = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef({ inspection, resolve, onLocate });
  current.current = { inspection, resolve, onLocate };
  const cancelSwitch = () => { if (switchTimer.current !== null) clearTimeout(switchTimer.current); switchTimer.current = null; };
  const cancelClose = () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current); closeTimer.current = null; setFading(false); };
  const keepPopup = () => { cancelSwitch(); cancelClose(); };
  const close = () => { keepPopup(); hoveredElement.current = null; setPopup(null); };
  const deferClose = () => { cancelSwitch(); if (closeTimer.current !== null) return; setFading(true); closeTimer.current = setTimeout(close, 200); };

  useLayoutEffect(() => {
    if (!popup || !popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(popup.left, window.innerWidth - rect.width - 8)), top: popup.bottom + rect.height + 16 > window.innerHeight ? Math.max(8, popup.top - rect.height - 8) : popup.bottom + 8 });
  }, [popup]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const root = frameRef ? frameRef.current?.contentDocument?.querySelector<HTMLElement>('article') : rootRef?.current ?? wrapper.firstElementChild as HTMLElement | null;
    if (!root) return;
    let elements: HTMLElement[] = [];
    const refresh = () => { elements = [root, ...root.querySelectorAll<HTMLElement>('*')].filter(element => !element.matches('style,script,link')); elements.forEach(element => element.classList.add(...INSPECTION_CLASSES)); };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true });
    const show = (element: HTMLElement) => {
      cancelSwitch();
      cancelClose();
      const bindings = uniqueBindings(current.current.resolve(element, root)).filter(binding => !binding.hidden);
      if (!bindings.length) { close(); return; }
      hoveredElement.current = element;
      const rect = element.getBoundingClientRect();
      const offset = element.ownerDocument !== document ? frameRef?.current?.getBoundingClientRect() : null;
      setPopup({ element, bindings, left: rect.left + (offset?.left ?? 0), top: rect.top + (offset?.top ?? 0), bottom: rect.bottom + (offset?.top ?? 0) });
    };
    const over = (event: Event) => {
      const element = event.target as HTMLElement;
      if (element?.nodeType !== 1 || !root.contains(element)) return;
      keepPopup();
      if (!hoveredElement.current || event.type === 'focusin') { show(element); return; }
      if (hoveredElement.current === element) { show(element); return; }
      // Keep the current popup while crossing other preview elements to reach it.
      // Only a settled hover changes its contents; entering the popup cancels it.
      switchTimer.current = setTimeout(() => { switchTimer.current = null; if (element.isConnected) show(element); }, 200);
    };
    const leave = (event: Event) => {
      const related = (event as PointerEvent).relatedTarget as Node | null;
      if (related && popupRef.current?.contains(related)) keepPopup();
      else if (!related || !root.contains(related)) deferClose();
    };
    const click = (event: Event) => { event.preventDefault(); event.stopPropagation(); keepPopup(); const element = event.target as HTMLElement; if (element?.nodeType === 1 && root.contains(element)) show(element); };
    const input = (event: Event) => { const element = event.target as HTMLElement; if (hoveredElement.current === element) show(element); };
    const key = (event: Event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.key === 'Escape' && (hoveredElement.current || current.current.inspection.hovered)) { keyboard.preventDefault(); keyboard.stopImmediatePropagation(); close(); current.current.inspection.clear(); }
      else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(keyboard.key)) {
        keyboard.preventDefault();
        const visible = elements.filter(element => element.getBoundingClientRect().height > 0 && current.current.resolve(element, root).some(binding => !binding.hidden));
        const index = visible.indexOf(hoveredElement.current!);
        const next = visible[(index + (keyboard.key === 'ArrowUp' || keyboard.key === 'ArrowLeft' ? -1 : 1) + visible.length) % visible.length];
        if (next) { next.scrollIntoView({ block: 'nearest' }); requestAnimationFrame(() => { if (next.isConnected) show(next); }); }
      } else if (keyboard.key === 'Enter' && popupRef.current) { keyboard.preventDefault(); popupRef.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }
    };
    root.addEventListener('pointerover', over);
    root.addEventListener('pointerout', leave);
    root.addEventListener('focusin', over);
    root.addEventListener('input', input);
    root.addEventListener('click', click, true);
    if (frameRef) root.addEventListener('keydown', key, true);
    wrapper.addEventListener('keydown', key, true);
    const hideOnScroll = () => close();
    root.ownerDocument.defaultView?.addEventListener('scroll', hideOnScroll, true);
    window.addEventListener('resize', hideOnScroll);
    return () => {
      observer.disconnect(); keepPopup(); hoveredElement.current = null;
      root.removeEventListener('pointerover', over); root.removeEventListener('pointerout', leave); root.removeEventListener('focusin', over); root.removeEventListener('input', input); root.removeEventListener('click', click, true); root.removeEventListener('keydown', key, true); wrapper.removeEventListener('keydown', key, true);
      root.ownerDocument.defaultView?.removeEventListener('scroll', hideOnScroll, true); window.removeEventListener('resize', hideOnScroll);
      elements.forEach(element => { element.classList.remove(...INSPECTION_CLASSES); element.removeAttribute('data-theme-inspection-dim'); });
    };
  }, [rootRef, frameRef, revision]);

  useEffect(() => {
    close();
    const wrapper = wrapperRef.current;
    const root = frameRef ? frameRef.current?.contentDocument?.querySelector<HTMLElement>('article') : rootRef?.current ?? wrapper?.firstElementChild as HTMLElement | null;
    if (!root) return;
    const elements = [root, ...root.querySelectorAll<HTMLElement>('*')].filter(element => !element.matches('style,script,link'));
    const hits = inspection.hovered ? elements.filter(element => resolve(element, root).some(binding => binding.key === inspection.hovered)) : [];
    const dimmed = inspection.hovered ? inspectionDimmedElements(elements, hits) : new Set<HTMLElement>();
    elements.forEach(element => element.dataset.themeInspectionDim = String(dimmed.has(element)));
  }, [inspection.hovered, revision, rootRef, frameRef]);

  const locate = (binding: ColorBinding) => {
    current.current.inspection.locate(binding);
    current.current.onLocate?.(binding);
    close();
  };
  return <>
    <div ref={wrapperRef} className={className} tabIndex={0} aria-label="颜色用途预览：悬停查看，方向键浏览，Enter 选择定位" data-inspection-utilities="transition-opacity duration-300 data-[theme-inspection-dim=true]:opacity-50">{children}</div>
    {popup && typeof document !== 'undefined' ? createPortal(<div ref={popupRef} data-dialog-owner={dialogOwner} data-fading={fading} role="group" aria-label="预览元素的颜色用途" className="fixed z-70 grid w-max max-w-xs gap-1 rounded-lg border border-line-strong bg-popup-bg p-1.5 text-popup-text opacity-100 shadow-(--editor-popup-shadow) transition-opacity duration-200 data-[fading=true]:opacity-0" style={{ left: position.left, top: position.top }} onPointerEnter={keepPopup} onPointerLeave={deferClose} onFocusCapture={keepPopup} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) deferClose(); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); wrapperRef.current?.focus(); } }}>
      {popup.bindings.map(binding => <button key={binding.key} type="button" className="grid gap-1 rounded-md border-0 bg-transparent px-3 py-2 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default" disabled={binding.kind === 'css' && binding.start === undefined} onClick={() => locate(binding)}><span className="text-xs font-medium">{binding.label}</span><span className="break-all font-mono text-2xs text-muted">{binding.token}</span>{binding.value && binding.kind === 'css' ? <span className="break-all font-mono text-2xs text-faint">{binding.value}</span> : null}</button>)}
    </div>, wrapperRef.current?.closest('[role="dialog"]') ?? document.body) : null}
  </>;
}
