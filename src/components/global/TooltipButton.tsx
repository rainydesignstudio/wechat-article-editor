'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Render outside scroll/clipping containers; only the anchor geometry is dynamic.
export function TooltipButton({ as: Trigger = 'button', tooltip, children, onClick, onFocus, onBlur, onPointerEnter, onPointerLeave, ...props }: ButtonHTMLAttributes<HTMLElement> & { tooltip: ReactNode; as?: 'button' | 'summary' }) {
  const id = useId();
  const buttonRef = useRef<HTMLElement>(null);
  const disabledRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const show = () => {
    const rect = (props.disabled ? disabledRef.current : buttonRef.current)?.getBoundingClientRect();
    if (rect) setAnchor({ left: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
  };
  useLayoutEffect(() => {
    if (!anchor || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.left - rect.width / 2, window.innerWidth - rect.width - 8)),
      top: anchor.bottom + rect.height + 16 > window.innerHeight ? Math.max(8, anchor.top - rect.height - 8) : anchor.bottom + 8,
    });
  }, [anchor, tooltip]);
  useEffect(() => {
    if (!anchor) return;
    const hide = () => setAnchor(null);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', key);
    };
  }, [anchor]);
  const description = [props['aria-describedby'], anchor ? id : null].filter(Boolean).join(' ') || undefined;
  const button = <Trigger {...props} style={props.disabled ? undefined : props.style} ref={(node: HTMLElement | null) => { buttonRef.current = node; }} type={Trigger === 'button' ? props.type ?? 'button' : undefined} className={props.disabled ? 'contents' : props.className} aria-hidden={props.disabled ? true : props['aria-hidden']} aria-describedby={description}
      onPointerEnter={event => { onPointerEnter?.(event); if (event.pointerType !== 'touch' && !event.defaultPrevented) show(); }}
      onPointerLeave={event => { setAnchor(null); onPointerLeave?.(event); }}
      onFocus={event => { onFocus?.(event); if (!event.defaultPrevented) show(); }}
      onBlur={event => { setAnchor(null); onBlur?.(event); }}
      onClick={event => { setAnchor(null); if (props.disabled) { event.preventDefault(); event.stopPropagation(); return; } onClick?.(event); }}>{children}</Trigger>;
  return <>
    {props.disabled ? <span ref={disabledRef} role={props.role ?? 'button'} aria-checked={props['aria-checked']} aria-pressed={props['aria-pressed']} aria-haspopup={props['aria-haspopup']} aria-expanded={props['aria-expanded']} aria-controls={props['aria-controls']} aria-disabled="true" aria-label={props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined)} aria-describedby={description} tabIndex={props.tabIndex ?? 0} style={props.style} className={`${props.className ?? ''} inline-flex shrink-0 aria-disabled:pointer-events-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
      onPointerEnter={event => { if (event.pointerType !== 'touch') show(); }} onPointerLeave={() => setAnchor(null)} onFocus={show} onBlur={() => setAnchor(null)} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); } }}>{button}</span> : button}
    {anchor && typeof document !== 'undefined' ? createPortal(<span ref={tooltipRef} id={id} role="tooltip"
      className="pointer-events-none fixed z-70 w-max max-w-xs wrap-anywhere rounded-md border border-line-strong bg-popup-bg px-2.5 py-1.5 text-xs font-medium text-popup-text shadow-(--editor-popup-shadow)"
      style={{ left: position.left, top: position.top }}>{tooltip}</span>, document.body) : null}
  </>;
}
