'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { compileArticleStyles } from '../../lib/tailwind';
import type { ArticleHistorySnapshot } from '../../lib/articleHistory';
import type { StoredArticle } from '../../lib/types';
import { MarkdownPreview, type ArticleMediaContext } from '../editor/MarkdownPreview';

type Props = {
  snapshot: ArticleHistorySnapshot;
  root: FileSystemDirectoryHandle | null;
  article: Pick<StoredArticle, 'id' | 'month' | 'folder'>;
  articleTitle: string;
};

export function HistorySnapshotPreview({ snapshot, root, article, articleTitle }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [compiled, setCompiled] = useState<{ id: string; css: string } | null>(null);
  const [compileIssue, setCompileIssue] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const identityRef = useRef({ id: snapshot.id, root, articleId: article.id });
  identityRef.current = { id: snapshot.id, root, articleId: article.id };

  useEffect(() => {
    mountedRef.current = true;
    const host = hostRef.current;
    if (!host) return () => { mountedRef.current = false; };
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    let mount = shadow.querySelector<HTMLElement>('[data-history-preview-portal]');
    if (!mount) {
      mount = document.createElement('div');
      mount.dataset.historyPreviewPortal = '';
      shadow.append(mount);
    }
    setPortalTarget(mount);
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    setCompiled(null);
    setCompileIssue(null);
    void compileArticleStyles(snapshot.source, snapshot.theme).then(({ css }) => {
      if (current) setCompiled({ id: snapshot.id, css });
    }).catch((error: unknown) => {
      if (current) setCompileIssue(error instanceof Error ? error.message : String(error));
    });
    return () => { current = false; };
  }, [snapshot.id, snapshot.source, snapshot.theme]);

  const isCurrent = useCallback(() => {
    const identity = identityRef.current;
    return mountedRef.current && identity.id === snapshot.id && identity.root === root && identity.articleId === article.id;
  }, [article.id, root, snapshot.id]);
  const media = {
    root,
    article,
    articleTitle,
    sessionKey: `history-${snapshot.id}`,
    isCurrent,
  } satisfies ArticleMediaContext;

  return (
    <div className="history-render-scroll" aria-label="历史文章排版预览">
      <div ref={hostRef} className="history-render-host" aria-busy={!compiled && !compileIssue} />
      {compileIssue ? <p className="content-library-note" data-tone="error" role="alert">历史主题预览编译失败：{compileIssue}。仍可切换到源码查看。</p> : null}
      {!compiled && !compileIssue ? <p className="status-copy" role="status">正在编译此版本自己的主题与样式…</p> : null}
      {portalTarget && compiled?.id === snapshot.id ? createPortal(
        <>
          <style>{`:host { font-family: system-ui; color: var(--color-article-ink, #1f1f1f); }\n${compiled.css}\narticle.article-preview { font-family: system-ui; }`}</style>
          <article className="article-preview" data-theme={snapshot.theme.id}>
            <div className="article-body">
              <MarkdownPreview source={snapshot.parsed.body} media={media} />
            </div>
          </article>
        </>,
        portalTarget,
      ) : null}
    </div>
  );
}
