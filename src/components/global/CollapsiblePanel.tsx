'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function PanelHeading({ title, icon, count, expanded, reserveAction = false, details, className = '', children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & {
  title: ReactNode; icon?: ReactNode; count?: number; expanded?: boolean; reserveAction?: boolean; details?: ReactNode;
}) {
  const heading = <>{icon}<span className="min-w-0 flex-1 truncate">{title}</span>{reserveAction ? <span className="size-8 shrink-0" aria-hidden="true" /> : null}{count !== undefined ? <span className="w-6 shrink-0 text-center font-mono text-xs font-normal text-faint">{count}</span> : null}
    {expanded !== undefined ? <svg className="size-4 shrink-0 text-faint group-aria-expanded/panel:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg> : children}</>;
  return <button {...props} type="button" className={`panel-heading group/panel ${className}`} aria-expanded={expanded}>
    {details ? <><span className="flex w-full min-w-0 items-center gap-2">{heading}</span>{details}</> : heading}
  </button>;
}

export function PanelIcon({ kind }: { kind: 'colors' | 'fonts' | 'nodes' | 'issues' }) {
  return <svg className="size-4 shrink-0 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {kind === 'colors' ? <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z" /><circle cx="7.5" cy="10" r=".7" /><circle cx="11" cy="6.5" r=".7" /><circle cx="16" cy="7.5" r=".7" /></> : kind === 'fonts' ? <path d="M4 5h16M12 5v15M8 20h8M4 8V5m16 3V5" /> : kind === 'nodes' ? <path d="M4 5h16M4 12h11M4 19h16" /> : <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3v1" /></>}
  </svg>;
}

export function CollapsiblePanel({ id, title, icon, count, open, onToggle, className = '', contentClassName = '', contentLabel, headingActions, children }: {
  id: string; title: string; icon: ReactNode; count?: number; open: boolean; onToggle: () => void;
  className?: string; contentClassName?: string; contentLabel?: string; headingActions?: ReactNode; children: ReactNode;
}) {
  return <section className={`collapsible-panel ${className}`} data-open={open} aria-labelledby={`${id}-heading`}>
    <div className="group/panel-heading relative flex shrink-0 items-center">
      <PanelHeading id={`${id}-heading`} title={title} icon={icon} count={count} expanded={open} reserveAction={Boolean(headingActions)} aria-controls={`${id}-content`} onClick={onToggle} className="min-w-0 flex-1" />
      {headingActions ? <div className="absolute top-1/2 right-20 -translate-y-1/2">{headingActions}</div> : null}
    </div>
    {open ? <div id={`${id}-content`} aria-label={contentLabel} className={`collapsible-panel-content ${contentClassName}`}>{children}</div> : null}
  </section>;
}
