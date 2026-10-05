'use client';

import type { ArticleSummary } from '../../lib/types';
import { useEffect, useRef, useState, type MouseEvent } from 'react';

type Props = {
  article: ArticleSummary;
  archived: boolean;
  disabled?: boolean;
  insetSummary?: boolean;
  onInfo: (article: ArticleSummary) => void;
  onArchive: (article: ArticleSummary, archived: boolean) => void;
  onFork: (article: ArticleSummary) => void;
  onDelete: (article: ArticleSummary) => void;
};

function ActionIcon({ name }: { name: 'info' | 'archive' | 'fork' | 'delete' }) {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true as const, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'info') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 10.5V16M12 7.5h.01" /></svg>;
  if (name === 'archive') return <svg {...common}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M10 12h4" /></svg>;
  if (name === 'delete') return <svg {...common}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>;
  return <svg {...common}><circle cx="7" cy="5" r="2" /><circle cx="17" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M7 7v4a5 5 0 0 0 5 5M17 7v4a5 5 0 0 1-5 5" /></svg>;
}

export function ArticleActionsMenu({ article, archived, disabled = false, insetSummary = false, onInfo, onArchive, onFork, onDelete }: Props) {
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current && !menuRef.current.contains(event.target)) menuRef.current.open = false;
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);
  const closeMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const details = event.currentTarget.closest('details');
    if (details) {
      details.open = false;
      const summary = details.querySelector('summary');
      queueMicrotask(() => summary?.focus());
    }
  };

  return (
    <details ref={menuRef} className="article-action-menu" onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return;
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
      event.preventDefault();
      event.stopPropagation();
    }}>
      <summary className={insetSummary ? 'mr-1' : undefined} aria-label={`更多操作：${article.parse.metadata.title}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg><span className="article-action-menu-label">更多</span>
      </summary>
      <div role="group" aria-label={`文章操作：${article.parse.metadata.title}`}>
        <button type="button" disabled={disabled} onClick={(event) => { closeMenu(event); onInfo(article); }}><ActionIcon name="info" />文章信息</button>
        <button type="button" disabled={disabled} onClick={(event) => { closeMenu(event); onFork(article); }}><ActionIcon name="fork" />Fork 文稿</button>
        <button type="button" disabled={disabled} onClick={(event) => { closeMenu(event); onArchive(article, !archived); }}><ActionIcon name="archive" />{archived ? '取消归档' : '归档'}</button>
        {archived ? <><span className="my-1 h-px bg-line" aria-hidden="true" /><button className="text-warning-strong hover:bg-warning-surface hover:text-warning-strong focus-visible:bg-warning-surface focus-visible:text-warning-strong" type="button" disabled={disabled} onClick={(event) => { closeMenu(event); onDelete(article); }}><ActionIcon name="delete" />删除归档</button></> : null}
      </div>
    </details>
  );
}
