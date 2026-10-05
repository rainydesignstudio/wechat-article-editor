'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { articleMarkdownPlugins, articleHtmlPlugins } from '../../lib/article-format/pipeline';
import {
  articleImageFileNameFromSource,
  articleImageSourceSetCandidates,
  inspectArticleImage,
  replaceArticleImageSourceSetUrls,
  type ArticleMediaAsset,
} from '../../lib/articleMedia';
import { getArticleMediaDirectory } from '../../lib/fileSystem';
import type { StoredArticle } from '../../lib/types';
import { ArticleImagePreview } from '../media/ArticleImagePreview';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { ARTICLE_EXAMPLE_IMAGE, isLegacyExampleImage } from '../../lib/articleExamples';

export type ArticleMediaContext = {
  root: FileSystemDirectoryHandle | null;
  article: Pick<StoredArticle, 'id' | 'month' | 'folder'> | null;
  articleTitle: string;
  sessionKey: string | number;
  isCurrent: () => boolean;
  onOpen?: (asset: ArticleMediaAsset) => void;
};

type LocalImageProps = {
  root: FileSystemDirectoryHandle;
  article: Pick<StoredArticle, 'id' | 'month' | 'folder'>;
  articleTitle: string;
  sessionKey: string | number;
  sourcePath?: string;
  sourceSetPath?: string;
  clipboardSource?: string;
  clipboardSourceSet?: string;
  fileName: string;
  alt: string;
  imageProps: Omit<ComponentProps<'img'>, 'src' | 'alt' | 'onClick' | 'onKeyDown'>;
  isCurrent: () => boolean;
  onOpen?: (asset: ArticleMediaAsset) => void;
};

function LocalArticleImage(props: LocalImageProps) {
  const [asset, setAsset] = useState<{ handle: FileSystemFileHandle; mimeType: string; size: number } | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const currentRef = useRef(props.isCurrent);
  const onOpenRef = useRef(props.onOpen);
  currentRef.current = props.isCurrent;
  onOpenRef.current = props.onOpen;

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setIssue(null);
    const current = () => !cancelled && currentRef.current();
    const load = async () => {
      try {
        const imageDirectory = await getArticleMediaDirectory(props.root, props.article.month, props.article.folder, false);
        const handle = await imageDirectory.getFileHandle(props.fileName);
        const file = await handle.getFile();
        const format = await inspectArticleImage(file);
        if (!current()) return;
        setAsset({ handle, mimeType: format.mimeType, size: file.size });
      } catch (error) {
        if (current()) setIssue(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [props.article.folder, props.article.month, props.fileName, props.root, props.sessionKey]);

  if (issue || !asset) {
    const label = issue ? `本地图片不可用：${props.fileName}` : `正在读取本地图片：${props.fileName}`;
    return (
      <span
        className="article-local-image-placeholder"
        role="img"
        aria-label={label}
        aria-busy={!issue}
        data-local-asset-src={props.sourcePath}
        data-local-asset-srcset={props.sourceSetPath}
        data-clipboard-src={props.clipboardSource}
        data-clipboard-srcset={props.clipboardSourceSet}
      >
        {issue ? `本地图片暂不可用 · ${props.fileName}` : '正在读取本地图片…'}
      </span>
    );
  }

  const mediaAsset: ArticleMediaAsset = {
    ...asset,
    fileName: props.fileName,
    root: props.root,
    articleId: props.article.id,
    month: props.article.month,
    folder: props.article.folder,
    articleTitle: props.articleTitle,
  };
  return (
    <ArticleImagePreview
      handle={asset.handle}
      fileName={props.fileName}
      alt={props.alt}
      variant="article"
      sourcePath={props.sourcePath}
      sourceSetPath={props.sourceSetPath}
      clipboardSource={props.clipboardSource}
      clipboardSourceSet={props.clipboardSourceSet}
      imageProps={props.imageProps}
      sessionKey={props.sessionKey}
      isCurrent={props.isCurrent}
      onOpen={onOpenRef.current ? () => onOpenRef.current?.(mediaAsset) : undefined}
    />
  );
}

type LocalSourceSetProps = {
  root: FileSystemDirectoryHandle;
  article: Pick<StoredArticle, 'id' | 'month' | 'folder'>;
  sessionKey: string | number;
  sourceSet: string;
  sourceProps: Omit<ComponentProps<'source'>, 'srcSet'>;
  isCurrent: () => boolean;
};

async function decodeTemporaryUrl(url: string): Promise<void> {
  const probe = new Image();
  probe.src = url;
  if (typeof probe.decode === 'function') {
    await probe.decode();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    probe.onload = () => resolve();
    probe.onerror = () => reject(new Error('浏览器无法解码本地图片。'));
  });
}

function LocalArticleSourceSet(props: LocalSourceSetProps) {
  const candidates = articleImageSourceSetCandidates(props.sourceSet).filter((candidate) => candidate.fileName);
  const remoteOnlySourceSet = replaceArticleImageSourceSetUrls(
    props.sourceSet,
    new Map(candidates.map((candidate) => [candidate.url, null])),
  );
  const [resolvedSourceSet, setResolvedSourceSet] = useState<string | null>(null);
  const currentRef = useRef(props.isCurrent);
  currentRef.current = props.isCurrent;

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    setResolvedSourceSet(null);
    const current = () => !cancelled && currentRef.current();

    const resolve = async () => {
      try {
        const imageDirectory = await getArticleMediaDirectory(props.root, props.article.month, props.article.folder, false);
        const replacements = new Map<string, string | null>();
        for (const candidate of candidates) {
          if (!candidate.fileName || !current()) return;
          let objectUrl: string | null = null;
          try {
            const handle = await imageDirectory.getFileHandle(candidate.fileName);
            const file = await handle.getFile();
            await inspectArticleImage(file);
            objectUrl = URL.createObjectURL(file);
            objectUrls.push(objectUrl);
            await decodeTemporaryUrl(objectUrl);
            if (!current()) return;
            replacements.set(candidate.url, objectUrl);
          } catch {
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
              const index = objectUrls.indexOf(objectUrl);
              if (index >= 0) objectUrls.splice(index, 1);
            }
            replacements.set(candidate.url, null);
          }
        }
        if (current()) setResolvedSourceSet(replaceArticleImageSourceSetUrls(props.sourceSet, replacements));
      } catch {
        if (current()) setResolvedSourceSet(remoteOnlySourceSet);
      }
    };
    void resolve();
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [props.article.folder, props.article.month, props.root, props.sessionKey, props.sourceSet]);

  return (
    <source
      {...props.sourceProps}
      srcSet={resolvedSourceSet ?? remoteOnlySourceSet}
      data-local-asset-srcset={props.sourceSet}
      data-clipboard-srcset={props.sourceSet}
    />
  );
}

export function MarkdownPreview({
  source,
  media,
  placeholderRelativeImages = false,
}: {
  source: string;
  media?: ArticleMediaContext | null;
  placeholderRelativeImages?: boolean;
}) {
  const formatSnapshot = useFormatSnapshot();
  const [hydrated, setHydrated] = useState(false);
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const relativeImagePolicyRef = useRef(placeholderRelativeImages);
  relativeImagePolicyRef.current = placeholderRelativeImages;
  const componentsRef = useRef<Components | null>(null);

  if (!componentsRef.current) {
    componentsRef.current = {
      img: ({ node: _node, src, srcSet, alt, ...imageProps }) => {
        const originalSrc = typeof src === 'string' ? src : '';
        if (isLegacyExampleImage(originalSrc) || (relativeImagePolicyRef.current && originalSrc && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(originalSrc))) {
          return <img {...imageProps} src={ARTICLE_EXAMPLE_IMAGE} alt={alt || '示例图片'} data-example-image="true" />;
        }
        const originalSourceSet = typeof srcSet === 'string' ? srcSet : '';
        const localSourceSet = articleImageSourceSetCandidates(originalSourceSet).filter((candidate) => candidate.fileName);
        const directFileName = articleImageFileNameFromSource(originalSrc);
        const sourceSetCandidate = localSourceSet[0];
        const fileName = directFileName ?? sourceSetCandidate?.fileName;
        if (!fileName) return <img {...imageProps} src={src} srcSet={srcSet} alt={alt ?? ''} />;

        const currentMedia = mediaRef.current;
        if (!currentMedia?.root || !currentMedia.article) {
          if (!directFileName && sourceSetCandidate) {
            const remoteOnlySourceSet = replaceArticleImageSourceSetUrls(originalSourceSet, new Map(localSourceSet.map((candidate) => [candidate.url, null])));
            return (
              <img
                {...imageProps}
                src={src}
                srcSet={remoteOnlySourceSet}
                alt={alt ?? fileName}
                data-local-asset-srcset={originalSourceSet}
                data-clipboard-src={originalSrc}
                data-clipboard-srcset={originalSourceSet}
              />
            );
          }
          return (
            <span
              className="article-local-image-placeholder"
              role="img"
              aria-label={`本地图片待补：${fileName}`}
              data-local-asset-src={originalSrc}
              data-local-asset-srcset={localSourceSet.length ? originalSourceSet : undefined}
              data-clipboard-srcset={originalSourceSet || undefined}
            >
              本地图片待补 · {fileName}
            </span>
          );
        }
        return (
          <LocalArticleImage
            key={`${currentMedia.sessionKey}:${currentMedia.article.id}:${originalSrc || originalSourceSet}`}
            root={currentMedia.root}
            article={currentMedia.article}
            articleTitle={currentMedia.articleTitle}
            sessionKey={currentMedia.sessionKey}
            sourcePath={directFileName ? originalSrc : undefined}
            sourceSetPath={localSourceSet.length ? originalSourceSet : undefined}
            clipboardSource={!directFileName ? originalSrc : undefined}
            clipboardSourceSet={originalSourceSet || undefined}
            fileName={fileName}
            alt={alt ?? fileName}
            imageProps={{ ...imageProps, srcSet: undefined }}
            isCurrent={currentMedia.isCurrent}
            onOpen={currentMedia.onOpen}
          />
        );
      },
      source: ({ node: _node, srcSet, ...sourceProps }) => {
        const originalSourceSet = typeof srcSet === 'string' ? srcSet : '';
        const localCandidates = articleImageSourceSetCandidates(originalSourceSet).filter((candidate) => candidate.fileName);
        if (!originalSourceSet || !localCandidates.length) return <source {...sourceProps} srcSet={srcSet} />;
        const currentMedia = mediaRef.current;
        if (!currentMedia?.root || !currentMedia.article) {
          const remoteOnlySourceSet = replaceArticleImageSourceSetUrls(originalSourceSet, new Map(localCandidates.map((candidate) => [candidate.url, null])));
          return <source {...sourceProps} srcSet={remoteOnlySourceSet} data-local-asset-srcset={originalSourceSet} data-clipboard-srcset={originalSourceSet} />;
        }
        return (
          <LocalArticleSourceSet
            key={`${currentMedia.sessionKey}:${currentMedia.article.id}:${originalSourceSet}`}
            root={currentMedia.root}
            article={currentMedia.article}
            sessionKey={currentMedia.sessionKey}
            sourceSet={originalSourceSet}
            sourceProps={sourceProps}
            isCurrent={currentMedia.isCurrent}
          />
        );
      },
    };
  }

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  return (
    <ReactMarkdown
      remarkPlugins={articleMarkdownPlugins()}
      remarkRehypeOptions={{ allowDangerousHtml: true }}
      rehypePlugins={articleHtmlPlugins(formatSnapshot)}
      components={componentsRef.current}
    >
      {source}
    </ReactMarkdown>
  );
}
