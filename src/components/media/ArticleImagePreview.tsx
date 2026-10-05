'use client';

import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react';

type Props = {
  handle: FileSystemFileHandle;
  fileName: string;
  alt: string;
  variant: 'article' | 'tile' | 'dialog';
  sourcePath?: string;
  sourceSetPath?: string;
  clipboardSource?: string;
  clipboardSourceSet?: string;
  imageProps?: Omit<ComponentProps<'img'>, 'src' | 'alt' | 'onClick' | 'onKeyDown'>;
  onOpen?: () => void;
  isCurrent?: () => boolean;
  sessionKey?: string | number;
  onDimensions?: (width: number, height: number) => void;
};

export function ArticleImagePreview({ handle, fileName, alt, variant, sourcePath, sourceSetPath, clipboardSource, clipboardSourceSet, imageProps, onOpen, isCurrent, sessionKey, onDimensions }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const currentRef = useRef(isCurrent);
  currentRef.current = isCurrent;
  const dimensionsRef = useRef(onDimensions);
  dimensionsRef.current = onDimensions;

  useEffect(() => {
    let cancelled = false;
    let ownedUrl: string | null = null;
    setObjectUrl(null);
    setIssue(null);

    const current = () => !cancelled && (currentRef.current?.() ?? true);
    const load = async () => {
      try {
        const file = await handle.getFile();
        if (!current()) return;
        const url = URL.createObjectURL(file);
        ownedUrl = url;
        const probe = new Image();
        probe.src = url;
        if (typeof probe.decode === 'function') await probe.decode();
        else await new Promise<void>((resolve, reject) => {
          probe.onload = () => resolve();
          probe.onerror = () => reject(new Error('浏览器无法解码图片。'));
        });
        if (!current()) {
          URL.revokeObjectURL(url);
          ownedUrl = null;
          return;
        }
        dimensionsRef.current?.(probe.naturalWidth, probe.naturalHeight);
        setObjectUrl(url);
      } catch (error) {
        if (ownedUrl) {
          URL.revokeObjectURL(ownedUrl);
          ownedUrl = null;
        }
        if (current()) setIssue(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [fileName, handle, sessionKey]);

  const activate = () => {
    if (objectUrl && isCurrent?.() !== false) onOpen?.();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLImageElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activate();
  };
  const marker = {
    ...(sourcePath ? { 'data-local-asset-src': sourcePath } : {}),
    ...(sourceSetPath ? { 'data-local-asset-srcset': sourceSetPath } : {}),
    ...(clipboardSource !== undefined ? { 'data-clipboard-src': clipboardSource } : {}),
    ...(clipboardSourceSet ? { 'data-clipboard-srcset': clipboardSourceSet } : {}),
  };
  const missingLabel = issue ? `本地图片不可用：${fileName}` : `正在读取本地图片：${fileName}`;
  const variantClass = variant === 'tile' ? 'media-image-tile' : variant === 'dialog' ? 'media-image-dialog' : 'article-local-image-open';

  if (!objectUrl) {
    return (
      <span
        className={variant === 'article' ? 'article-local-image-placeholder' : `media-image-placeholder media-image-placeholder-${variant}`}
        role="img"
        aria-label={missingLabel}
        aria-busy={!issue}
        {...marker}
      >
        {issue ? `本地图片暂不可用 · ${fileName}` : '正在读取本地图片…'}
      </span>
    );
  }

  return (
    <img
      {...imageProps}
      {...marker}
      className={[imageProps?.className, variantClass].filter(Boolean).join(' ')}
      src={objectUrl}
      alt={alt}
      onClick={onOpen ? activate : undefined}
      {...(variant === 'article' && onOpen ? { role: 'button' as const, tabIndex: 0, 'aria-haspopup': 'dialog' as const, onKeyDown: handleKeyDown } : {})}
    />
  );
}
