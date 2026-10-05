'use client';

import { articlePreviewStyle, previewSurfaceStyle } from '../../lib/article-format/preview';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { articleDarkPreviewDocument, cloneArticleForDarkPreview, observeArticlePreview } from '../../lib/articleDarkPreview';
import { parseArticle } from '../../lib/frontMatter';
import type { WorkingArticle } from '../../lib/types';
import type { ArticleMediaContext } from './MarkdownPreview';
import { MarkdownPreview } from './MarkdownPreview';
import { PreviewModeSwitch } from './PreviewModeSwitch';
import { useArticlePreviewMode } from '../../hooks/useArticlePreviewMode';
import { InformationButton, InformationIcon } from '../global/InformationButton';
import { ThemeUpdateTag } from '../themes/ThemeUpdateTag';

type Props = {
  article: WorkingArticle;
  themeUpdateAvailable: boolean;
  parsed: ReturnType<typeof parseArticle>;
  compiledCss: string;
  mobilePane: 'source' | 'preview';
  previewRef: MutableRefObject<HTMLElement | null>;
  attachPreview: (element: HTMLElement | null) => void;
  clipboardReceiverRef: MutableRefObject<HTMLDivElement | null>;
  media: ArticleMediaContext | null;
  onPaste: () => Promise<void>;
  mediaBusy: boolean;
  readOnly: boolean;
  onOpenTheme: () => void;
};

export function PreviewPanel({
  article,
  themeUpdateAvailable,
  parsed,
  compiledCss,
  mobilePane,
  previewRef,
  attachPreview,
  clipboardReceiverRef,
  media,
  onPaste,
  mediaBusy,
  readOnly,
  onOpenTheme,
}: Props) {
  const formatSnapshot = useFormatSnapshot();
  const { dark, toggle } = useArticlePreviewMode();
  const [darkDocument, setDarkDocument] = useState('');
  const [darkError, setDarkError] = useState(false);
  const darkFrameRef = useRef<HTMLIFrameElement | null>(null);
  const lastSnapshotRef = useRef('');
  const lightHostRef = useRef<HTMLDivElement | null>(null);
  const [lightTarget, setLightTarget] = useState<HTMLElement | null>(null);
  // The clipboard dock opens to half the preview panel, measured once against the panel so the
  // target does not chase the preview as the dock itself takes space away from it.
  const [dockOpen, setDockOpen] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const dockBodyRef = useRef<HTMLDivElement | null>(null);
  const dockTarget = () => `${Math.round((panelRef.current?.clientHeight ?? 0) / 2)}px`;
  useLayoutEffect(() => {
    const node = dockBodyRef.current;
    if (!node) return;
    if (!node.style.maxHeight) {
      node.style.maxHeight = dockOpen ? dockTarget() : '0px';
      return;
    }
    node.style.maxHeight = `${node.getBoundingClientRect().height}px`;
    node.getBoundingClientRect();
    node.style.maxHeight = dockOpen ? dockTarget() : '0px';
  }, [dockOpen]);
  useEffect(() => {
    if (!dockOpen) return;
    const apply = () => { const node = dockBodyRef.current; if (node) node.style.maxHeight = dockTarget(); };
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [dockOpen]);
  useLayoutEffect(() => {
    const node = clipboardReceiverRef.current;
    if (!node) return;
    const syncPlaceholder = () => {
      const hasContent = Boolean(node.textContent || node.querySelector('img, svg, video, audio, canvas, table, hr'));
      node.dataset.empty = String(!hasContent);
    };
    syncPlaceholder();
    // Both native editing and the programmatic paste button change this uncontrolled DOM.
    const observer = new MutationObserver(syncPlaceholder);
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [clipboardReceiverRef]);
  useLayoutEffect(() => {
    const host = lightHostRef.current;
    if (!host) return;
    // Author utilities must never participate in the editor UI's CSS cascade.
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    let mount = shadow.querySelector<HTMLElement>('[data-article-preview]');
    if (!mount) { mount = document.createElement('div'); mount.dataset.articlePreview = ''; shadow.append(mount); }
    setLightTarget(mount);
  }, []);
  useEffect(() => {
    if (!dark || !previewRef.current) return;
    // Clone React's already sanitized article, never the user's raw HTML.
    return observeArticlePreview(previewRef.current, () => {
      try {
        const clone = cloneArticleForDarkPreview(previewRef.current!);
        const snapshot = `${compiledCss}\n${clone.outerHTML}`;
        if (snapshot === lastSnapshotRef.current) return;
        lastSnapshotRef.current = snapshot;
        setDarkError(false);
        setDarkDocument(articleDarkPreviewDocument(compiledCss, clone.outerHTML));
      } catch {
        lastSnapshotRef.current = '';
        setDarkDocument('');
        setDarkError(true);
      }
    });
  }, [dark, compiledCss, previewRef, formatSnapshot.id]);
    return (
    <section ref={panelRef} className="panel preview-panel" data-mobile-hidden={mobilePane === 'source'}>
      <div className="panel-header h-18 min-h-18 bg-list px-3 md:px-7.5">
        <div className="flex min-w-0 items-center gap-2 md:gap-6">
          <InformationButton icon={<InformationIcon book />} title={article.theme.name} subtitle={<span className="flex items-center gap-1.5">v{article.theme.version}{themeUpdateAvailable ? <ThemeUpdateTag /> : null}</span>} onClick={onOpenTheme} disabled={mediaBusy} aria-label={`选择文章主题：${article.theme.name}，版本 ${article.theme.version}${themeUpdateAvailable ? '，可更新' : ''}`} />
          <PreviewModeSwitch dark={dark} onToggle={toggle} />
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-faint" role="status"><svg className="size-3.5 text-accent-text" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{article.dirty ? <circle cx="12" cy="12" r="7" /> : <path d="m4 12 5 5L20 6" />}</svg>{article.dirty ? '未保存' : '已保存'}</span>
      </div>
      <div className="preview-shell" data-preview-mode={dark ? 'dark' : 'light'}>
        <div ref={lightHostRef} className="min-h-full min-w-0 " style={previewSurfaceStyle()} hidden={dark} />
        {lightTarget ? createPortal(<><style data-article-style="true">{articlePreviewStyle(compiledCss)}</style><article ref={attachPreview} className="article-preview" data-theme={article.theme.id}>
          <div className="article-body">
            {parsed.canCopy && article.themeValid ? <MarkdownPreview source={parsed.body} media={media} /> : <div className="empty-state"><strong>预览已阻止</strong><p>请先处理 Front Matter 或主题快照诊断。</p></div>}
          </div>
        </article></>, lightTarget) : null}
        {dark && darkError ? <p className="border-b border-warning-line bg-warning-surface px-4 py-3 text-xs text-warning-strong" role="alert">深色预览加载失败，可切回浅色后重试。原稿与复制内容不受影响。</p> : null}
        {dark ? <iframe ref={darkFrameRef} className="block h-full w-full border-0" title="深色文章预览" sandbox="allow-scripts allow-same-origin" srcDoc={darkDocument} /> : null}
      </div>
      <div className="panel-body">
        <section className="clipboard-dock">
          <button className="clipboard-dock-toggle group/dock" type="button" aria-expanded={dockOpen} aria-controls="clipboard-receiver" onClick={() => setDockOpen((current) => !current)}>
            <span>剪贴板接收区</span>
            <svg className="size-4 shrink-0 text-faint transition-transform duration-500 ease-out motion-reduce:transition-none group-aria-expanded/dock:rotate-90" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
          </button>
          <div id="clipboard-receiver" ref={dockBodyRef} className="clipboard-dock-body" inert={!dockOpen}>
            <div className="clipboard-dock-content">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 min-w-0 text-xs text-muted">复制富文本后在此粘贴，与复制结果逐项比对。</p>
                <button className="button button-quiet shrink-0" type="button" onClick={() => void onPaste()} disabled={mediaBusy || readOnly || !parsed.canCopy || !article.themeValid}><svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4h6v3H9zM7 5H5v15h14V5h-2" /><path d="M9 12h6M9 16h4" /></svg>复制后在此粘贴</button>
              </div>
              <div ref={clipboardReceiverRef} className="clipboard-receiver before:pointer-events-none before:text-muted data-[empty=true]:before:content-[attr(aria-placeholder)]" data-preview-mode={dark ? 'dark' : 'light'} contentEditable={!readOnly} suppressContentEditableWarning style={previewSurfaceStyle(dark)} role="textbox" aria-multiline="true" aria-label="富文本剪贴板接收区" aria-placeholder="点击“复制富文本”，再在此处按 ⌘V / Ctrl+V 验证 text/html。" />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
