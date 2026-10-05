import type { LibraryMediaAsset } from './articleMedia';

export const MEDIA_PAGE_SIZES = [10, 20, 50, 100] as const;
export type MediaPageSize = typeof MEDIA_PAGE_SIZES[number];
export const isMediaPageSize = (value: unknown): value is MediaPageSize => MEDIA_PAGE_SIZES.some(size => size === value);

export function paginateMedia<T>(items: readonly T[], requestedPage: number, pageSize: MediaPageSize) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1));
  const offset = (page - 1) * pageSize;
  return { page, pageCount, total: items.length, start: items.length ? offset + 1 : 0, end: Math.min(offset + pageSize, items.length), items: items.slice(offset, offset + pageSize) };
}

/** Slideshow scope is the actual file directory, independently of search and pagination. */
export function mediaDirectoryImages(assets: LibraryMediaAsset[], current: LibraryMediaAsset) {
  const images = assets.filter(asset => asset.root === current.root && asset.kind === current.kind && (asset.kind === 'shared' || current.kind === 'article' && asset.articleId === current.articleId));
  return images.some(asset => asset.fileName === current.fileName) ? images : [...images, current];
}
