import { articleImageFileNameFromSource, inspectArticleImage } from '../articleMedia';
import { getArticleMediaDirectory } from '../fileSystem';
import type { FormatSnapshot } from './runtime';
import { assertCurrentFormat } from './runtime';

export type InspectionMedia = { root: FileSystemDirectoryHandle | null; month: string | null; folder: string | null };
// Resolve only images referenced by this one document. Never scan a library or change its files.
export async function prepareInspectionAssets(root: HTMLElement, media: InspectionMedia | undefined, snapshot: FormatSnapshot, signal?: AbortSignal): Promise<{ root: HTMLElement; dispose: () => void }> {
  const clone = root.cloneNode(true) as HTMLElement;
  const urls = new Map<string, string>();
  const dispose = () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); };
  let directory: FileSystemDirectoryHandle | null = null;
  try {
    for (const image of clone.querySelectorAll<HTMLImageElement>('img[data-inspection-src]')) {
      signal?.throwIfAborted(); assertCurrentFormat(snapshot);
      const source = image.getAttribute('data-inspection-src')!;
      image.removeAttribute('data-inspection-src');
      const name = articleImageFileNameFromSource(source);
      if (!name) { if (/^(?:https?:|data:image\/|blob:|\/)/i.test(source)) image.setAttribute('src', source); continue; }
      if (!media?.root || !media.month || !media.folder) continue;
      try {
        directory ??= await getArticleMediaDirectory(media.root, media.month, media.folder, false);
        if (!urls.has(name)) {
          const file = await (await directory.getFileHandle(name)).getFile();
          await inspectArticleImage(file);
          signal?.throwIfAborted(); assertCurrentFormat(snapshot);
          urls.set(name, URL.createObjectURL(file));
        }
        image.setAttribute('src', urls.get(name)!);
      } catch (error) { signal?.throwIfAborted(); assertCurrentFormat(snapshot); if (error instanceof Error && error.name === 'AbortError') throw error; /* file diagnostics are reported by the product check */ }
    }
    return { root: clone, dispose };
  } catch (error) { dispose(); throw error; }
}
