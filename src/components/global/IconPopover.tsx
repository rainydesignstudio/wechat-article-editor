'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';

/** Controlled by the toolbar so opening one control closes its sibling. */
export function IconPopover({ label, tooltip = label, icon, open, disabled = false, kind = 'menu', onToggle, onClose, children }: {
  label: string; tooltip?: ReactNode; icon: ReactNode; open: boolean; disabled?: boolean;
  kind?: 'menu' | 'dialog'; onToggle: () => void; onClose: () => void; children: ReactNode;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(trigger.left, window.innerWidth - panel.width - 8)), top: trigger.bottom + panel.height + 16 > window.innerHeight ? Math.max(8, trigger.top - panel.height - 8) : trigger.bottom + 8 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>('[aria-checked="true"], button:not(:disabled), input:not(:disabled)') ?? panel)?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) closeRef.current();
    };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !panelRef.current?.contains(event.target)) closeRef.current(); };
    const resize = () => closeRef.current();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
      queueMicrotask(() => { if (document.activeElement === document.body || panel?.contains(document.activeElement)) triggerRef.current?.querySelector<HTMLElement>('button')?.focus(); });
    };
  }, [open]);

  return <>
    <span ref={triggerRef} className="inline-flex shrink-0"><IconButton icon={icon} tooltip={tooltip} aria-label={label} aria-haspopup={kind} aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={onToggle} /></span>
    {open && typeof document !== 'undefined' ? createPortal(<div ref={panelRef} id={id} role={kind} aria-label={label} tabIndex={-1} className="fixed z-60 grid max-h-80 w-56 gap-0.5 overflow-x-clip overflow-y-auto rounded-lg border border-line-strong bg-popup-bg p-1.5 text-xs text-popup-text shadow-(--editor-popup-shadow) scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" style={position} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      if (event.key === 'Tab' && focusable.length) {
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
      }
      if (kind === 'menu' && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
        if (!items.length) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      }
    }}>{children}</div>, document.body) : null}
  </>;
}
