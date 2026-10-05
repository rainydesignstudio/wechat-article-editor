'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getArticleMediaDirectory } from '../lib/fileSystem';
import { readMediaMetadata } from '../lib/mediaManagement';
import { listArticleImages, listSharedImages, getSharedImageDirectory, type LibraryMediaAsset } from '../lib/articleMedia';
import type { ArticleSummary } from '../lib/types';

export function useMediaLibrary({ root, sessionKey, refreshSignal, articles, isRootCurrent }: {
  root: FileSystemDirectoryHandle | null;
  sessionKey: number;
  refreshSignal: number;
  articles: ArticleSummary[];
  isRootCurrent: (root: FileSystemDirectoryHandle, session: number) => boolean;
}) {
  const [result, setResult] = useState<{ root: FileSystemDirectoryHandle | null; session: number; assets: LibraryMediaAsset[]; issues: string[] }>({ root: null, session: -1, assets: [], issues: [] });
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(0);
  const currentRef = useRef(isRootCurrent);
  currentRef.current = isRootCurrent;
  useEffect(() => {
    const request = ++requestRef.current;
    let cancelled = false;
    const current = () => !cancelled && request === requestRef.current && root !== null && currentRef.current(root, sessionKey);
    if (!root) { setLoading(false); return () => { cancelled = true; }; }
    setLoading(true);
    void (async () => {
      const rows = await Promise.all([
        (async () => {
          try {
            const assets = await listSharedImages(root), directory = await getSharedImageDirectory(root);
            try { const metadata: Awaited<ReturnType<typeof readMediaMetadata>> = directory ? await readMediaMetadata(directory) : { version: 1, images: {} }; return { assets: assets.map(asset => ({ ...asset, description: metadata.images[asset.fileName]?.description ?? '' })), issues: [] as string[] }; }
            catch (error) { return { assets, issues: [`共享描述读取失败：${error instanceof Error ? error.message : String(error)}`] }; }
          }
          catch (error) { return { assets: [], issues: [`共享图片读取失败：${error instanceof Error ? error.message : String(error)}`] }; }
        })(),
        ...articles.map(async (article) => {
          if (!current()) return { assets: [], issues: [] as string[] };
          try {
            const directory = await getArticleMediaDirectory(root, article.month, article.folder, false);
            if (!current()) return { assets: [], issues: [] as string[] };
            const files = await listArticleImages(directory);
            let metadata: Awaited<ReturnType<typeof readMediaMetadata>> = { version: 1, images: {} }, metadataIssue = '';
            try { metadata = await readMediaMetadata(directory); } catch (error) { metadataIssue = `图片描述读取失败：${error instanceof Error ? error.message : String(error)}`; }
            return { assets: files.map((file): LibraryMediaAsset => ({ ...file, description: metadata.images[file.fileName]?.description ?? '', kind: 'article', root, articleId: article.id, month: article.month, folder: article.folder, articleTitle: article.parse.metadata.title })), issues: metadataIssue ? [metadataIssue] : [] as string[] };
          } catch (error) {
            if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError') return { assets: [], issues: [] as string[] };
            return { assets: [], issues: [`${article.parse.metadata.title} · ${error instanceof Error ? error.message : String(error)}`] };
          }
        }),
      ]);
      if (!current()) return;
      setResult({ root, session: sessionKey, assets: rows.flatMap((row) => row.assets), issues: rows.flatMap((row) => row.issues) });
      setLoading(false);
    })().catch((error: unknown) => {
      if (!current()) return;
      setResult({ root, session: sessionKey, assets: [], issues: [error instanceof Error ? error.message : String(error)] });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [root, sessionKey, refreshSignal, refreshKey, articles]);
  const visible = result.root === root && result.session === sessionKey;
  const assets = useMemo(() => visible ? result.assets : [], [visible, result.assets]);
  return { assets, issues: visible ? result.issues : [], loading, refresh: () => setRefreshKey((key) => key + 1) };
}
