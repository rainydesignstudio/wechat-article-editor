import { getStoredArticleDirectory } from './fileSystem';

const MAX_PACKAGE_BYTES = 256 * 1024 * 1024;

export function articleExportBaseName(title: string): string {
  const name = title.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/\s+/g, ' ').replace(/^[. -]+|[. -]+$/g, '');
  return Array.from(name).slice(0, 80).join('') || 'article';
}

export function downloadArticleBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function safeArchiveName(name: string): string {
  if (!name || name === '.' || name === '..' || /[\\/\u0000-\u001f\u007f]/.test(name)) {
    throw new Error(`资源文件名不安全：${name || '空名称'}；文档包没有生成。`);
  }
  return name;
}

export async function createArticleDocumentPackage(source: string, root: FileSystemDirectoryHandle, month: string | null, folder: string | null): Promise<{ blob: Blob; mediaFiles: number }> {
  const entries: Record<string, Uint8Array> = {
    'article.md': new TextEncoder().encode(source),
    'media/': new Uint8Array(),
  };
  let totalBytes = entries['article.md'].byteLength;
  let mediaFiles = 0;
  const collect = async (directory: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    for await (const [rawName, entry] of directory.entries()) {
      const name = safeArchiveName(rawName);
      const path = `${prefix}${name}`;
      if (entry.kind === 'directory') {
        entries[`${path}/`] = new Uint8Array();
        await collect(await directory.getDirectoryHandle(name), `${path}/`);
      } else {
        const file = await (await directory.getFileHandle(name)).getFile();
        totalBytes += file.size;
        if (totalBytes > MAX_PACKAGE_BYTES) throw new Error('文档包超过 256 MB，无法在浏览器内完整生成。');
        entries[path] = new Uint8Array(await file.arrayBuffer());
        mediaFiles += 1;
      }
    }
  };
  if (month && folder) {
    const articleDirectory = await getStoredArticleDirectory(root, month, folder);
    let mediaDirectory: FileSystemDirectoryHandle | null = null;
    try {
      mediaDirectory = await articleDirectory.getDirectoryHandle('media');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
    if (mediaDirectory) await collect(mediaDirectory, 'media/');
  }
  const { zip } = await import('fflate');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => error ? reject(error) : resolve(data));
  });
  return { blob: new Blob([bytes as BlobPart], { type: 'application/zip' }), mediaFiles };
}
