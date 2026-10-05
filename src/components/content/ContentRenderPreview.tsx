'use client';

import { articlePreviewStyle, previewSurfaceStyle } from '../../lib/article-format/preview';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { compileArticleStyles } from '../../lib/tailwind';
import type { ThemeConfig } from '../../lib/types';
import { MarkdownPreview } from '../editor/MarkdownPreview';
import type { ArticleMediaContext } from '../editor/MarkdownPreview';
import { articleDarkPreviewDocument, cloneArticleForDarkPreview, observeArticlePreview } from '../../lib/articleDarkPreview';

export function ContentRenderPreview({ source, theme, blocked = false, media = null, fill = false, bare = false, dark = false }: { source: string; theme: ThemeConfig; blocked?: boolean; media?: ArticleMediaContext | null; fill?: boolean; bare?: boolean; dark?: boolean }) {
  const formatSnapshot = useFormatSnapshot();
  const hostRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const snapshotRef = useRef('');
  const [darkDocument, setDarkDocument] = useState('');
  const [darkFailed, setDarkFailed] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [css, setCss] = useState('');
  const [issue, setIssue] = useState('');
  const [pending, setPending] = useState(true);
  const body = source.replace('▌', '');
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    let mount = shadow.querySelector<HTMLElement>('[data-content-preview]');
    if (!mount) { mount = document.createElement('div'); mount.dataset.contentPreview = ''; shadow.append(mount); }
    setTarget(mount);
  }, []);
  useEffect(() => {
    let current = true;
    setPending(!blocked); setIssue('');
    if (blocked) { setCss(''); return; }
    // Merge rapid typing; ignore obsolete completions on edits, theme changes or unmount.
    const timer = window.setTimeout(() => {
      void compileArticleStyles(body, theme).then(result => {
        if (current) { setCss(result.css); setPending(false); }
      }).catch((error: unknown) => {
        if (current) { setIssue(error instanceof Error ? error.message : String(error)); setPending(false); }
      });
    }, 200);
    return () => { current = false; window.clearTimeout(timer); };
  }, [body, theme, blocked, formatSnapshot.id]);
  useEffect(() => {
    if (!dark || blocked || !articleRef.current) return;
    return observeArticlePreview(articleRef.current, () => {
      try {
        const clone = cloneArticleForDarkPreview(articleRef.current!);
        const snapshot = css + clone.outerHTML;
        if (snapshot === snapshotRef.current) return;
        snapshotRef.current = snapshot;
        setDarkFailed(false);
        setDarkDocument(articleDarkPreviewDocument(css, clone.outerHTML));
      } catch { snapshotRef.current = ''; setDarkDocument(''); setDarkFailed(true); }
    });
  }, [dark, blocked, css, target, formatSnapshot.id]);
    return <section id={bare ? undefined : 'content-render-preview'} className={`flex ${fill ? 'min-h-0' : 'min-h-64'} min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line group-data-[wide=true]/content-preview:min-h-0`} style={previewSurfaceStyle(dark)} aria-label="即时渲染效果">
    {bare ? null : <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-list px-4 py-3"><span className="text-xs font-medium text-secondary">即时预览</span><span className="text-xs text-faint" role="status">{blocked ? '请先修复元数据' : issue ? '样式生成失败' : pending ? '更新中…' : theme.name}</span></header>}
    {bare && pending && !blocked ? <p className="shrink-0 px-4 py-2 text-xs text-muted" role="status">排版更新中…</p> : null}
    {issue ? <p className="shrink-0 px-4 py-3 text-xs text-danger" role="alert">{issue}</p> : null}
    {dark && darkFailed && !blocked ? <p className="shrink-0 border-b border-warning-line bg-warning-surface px-4 py-3 text-xs text-warning-strong" role="alert">深色预览加载失败，可切回浅色后重试。</p> : null}
    <div className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
      <div ref={hostRef} hidden={dark || blocked} className="min-h-full min-w-0" style={previewSurfaceStyle()} aria-busy={pending} />
      {blocked ? <p className="p-4 text-sm text-muted">元数据有误，修复后恢复预览。</p> : target ? createPortal(<><style>{css ? articlePreviewStyle(css) : ''}</style><article ref={articleRef} className="article-preview" data-theme={theme.id}><div className="article-body"><MarkdownPreview source={body} media={media} placeholderRelativeImages={!media} /></div></article></>, target) : null}
      {dark && !blocked ? <iframe ref={frameRef} className="block h-full min-w-0 w-full border-0" title="深色内容预览" sandbox="allow-scripts allow-same-origin" srcDoc={darkDocument} /> : null}
    </div>
  </section>;
}
