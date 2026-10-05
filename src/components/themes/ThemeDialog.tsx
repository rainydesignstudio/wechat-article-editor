'use client';

import { useState } from 'react';
import type { ThemeConfig } from '../../lib/types';
import type { ArticleMediaContext } from '../editor/MarkdownPreview';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';
import { InformationIcon } from '../global/InformationButton';
import { ContentRenderPreview } from '../content/ContentRenderPreview';
import { availableArticleThemeUpdate } from '../../lib/articleThemeUpdate';
import { ThemeUpdateTag } from './ThemeUpdateTag';

export function ThemeDialog({ current, themes, source, media, busy = false, blockedReason = '', issue = '', onClose, onSelect }: {
  current: ThemeConfig; themes: ThemeConfig[]; source: string; media?: ArticleMediaContext | null;
  busy?: boolean; blockedReason?: string; issue?: string; onClose: () => void; onSelect: (theme: ThemeConfig) => void;
}) {
  const [selectedKey, setSelectedKey] = useState('current');
  const [query, setQuery] = useState('');
  const latestTheme = availableArticleThemeUpdate(current, themes);
  // The article snapshot remains selectable even after its library entry is changed or deleted.
  const options = [{ key: 'current', theme: current }, ...themes.filter(theme => JSON.stringify(theme) !== JSON.stringify(current)).map(theme => ({ key: `${theme.id}@${theme.version}`, theme }))];
  const selected = options.find(option => option.key === selectedKey) ?? options[0];
  const visible = options.filter(({ theme }) => `${theme.name} ${theme.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <DialogFrame large titleId="theme-dialog-title" descriptionId="theme-dialog-description" onClose={onClose} dismissible={!busy}>
    <DialogHeader titleId="theme-dialog-title" eyebrow="ARTICLE THEME" title="选择文章主题" onClose={onClose} closeDisabled={busy} />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <aside className="flex min-h-0 min-w-0 shrink-0 flex-col border-b border-line bg-list/50 md:w-72 md:border-r md:border-b-0" aria-label="文章主题列表">
        <div className="shrink-0 border-b border-line p-4"><label className="field-stack"><span className="field-label">查找主题 · {options.length}</span><input className="field" name="theme-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="主题名称" disabled={busy} /></label></div>
        <div className="min-h-0 overflow-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent md:flex-1">
          <div className="grid auto-cols-40 grid-flow-col gap-2 md:auto-cols-auto md:grid-flow-row">{visible.map(({ key, theme }) => <div key={key} className="relative min-w-0">
            <button type="button" aria-pressed={selected.key === key} onClick={() => setSelectedKey(key)} disabled={busy} className="flex h-full w-full min-w-0 items-start gap-3 rounded-lg border border-transparent p-3 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:border-accent-line aria-pressed:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50">
              <span className="information-badge mt-0.5"><InformationIcon book /></span><span className="flex min-w-0 flex-1 flex-col gap-1"><strong className="truncate font-sub-heading text-sm font-semibold text-primary">{theme.name}</strong><small className="flex flex-wrap items-center gap-1 text-xs text-muted">v{theme.version}{key === 'current' && latestTheme ? <ThemeUpdateTag /> : null}</small>{key === 'current' ? <span className="text-2xs text-accent-text">当前文章</span> : null}</span>
            </button>
            {key === 'current' && latestTheme ? <button type="button" className="button button-quiet absolute right-2 bottom-2 min-h-7 gap-1 px-2 py-1 text-2xs" onClick={() => onSelect(latestTheme)} disabled={busy || Boolean(blockedReason)} aria-label={`更新主题「${theme.name}」至 v${latestTheme.version}`}><svg className="size-3.5" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></svg>更新主题</button> : null}
          </div>)}</div>
          {!visible.length ? <p className="px-3 py-4 text-sm text-muted">没有匹配的主题。</p> : null}
        </div>
        <p id="theme-dialog-description" className="hidden shrink-0 border-t border-line p-4 text-xs text-muted md:block">先用当前正文试看，采用后返回编辑。</p>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4" aria-label="所选主题预览">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-sub-heading text-base font-semibold text-primary">{selected.theme.name}</h3><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">v{selected.theme.version}{selected.key === 'current' && latestTheme ? <ThemeUpdateTag /> : null}<span>· 浅色排版</span></p></div><span className="rounded-md border border-line bg-list px-2 py-1 text-xs text-faint">{selected.key === 'current' ? '当前主题' : '试看中'}</span></header>
        <ContentRenderPreview source={source} theme={selected.theme} media={media} fill />
        {blockedReason || issue ? <p className="shrink-0 rounded-lg border border-warning-line bg-warning-surface px-3 py-2 text-xs text-warning-strong" role="status">{blockedReason || issue}</p> : null}
      </section>
    </div>
    <DialogFooter><DialogActions><DialogButton onClick={onClose} disabled={busy}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m10 5-7 7 7 7M3 12h18" /></svg>返回编辑</DialogButton><DialogButton variant="primary" onClick={() => onSelect(selected.theme)} disabled={busy || Boolean(blockedReason) || selected.key === 'current'}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 12 5 5L20 6" /></svg>{busy ? '正在采用…' : '采用主题'}</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>;
}
