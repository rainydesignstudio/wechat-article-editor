import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parseArticle } from './frontMatter';

type MarkdownNode = {
  type?: string;
  value?: unknown;
  url?: unknown;
  identifier?: unknown;
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  children?: MarkdownNode[];
};

type SourceRange = { start: number; end: number };
type Replacement = SourceRange & { value: string };

const markdownParser = unified().use(remarkParse).use(remarkGfm);

export type ArticleImageFormat = { extension: string; mimeType: string };
export type ImportedArticleImage = {
  fileName: string;
  mimeType: string;
  size: number;
  handle: FileSystemFileHandle;
  lastModified?: number;
  description?: string;
};
export type ArticleImageFile = ImportedArticleImage;
export type ArticleMediaAsset = ArticleImageFile & {
  root: FileSystemDirectoryHandle;
  articleId: string;
  month: string;
  folder: string;
  articleTitle: string;
};
export type LibraryMediaAsset = (ArticleMediaAsset & { kind: 'article' }) | (ArticleImageFile & {
  kind: 'shared';
  root: FileSystemDirectoryHandle;
});
export type MediaActionOutcome = { ok: boolean; message: string; tone: 'success' | 'warning' | 'error'; failedKeys?: string[] };

export async function getSharedImageDirectory(root: FileSystemDirectoryHandle, create = false): Promise<FileSystemDirectoryHandle | null> {
  try {
    const shared = await root.getDirectoryHandle('shared', { create });
    return await shared.getDirectoryHandle('image', { create });
  } catch (error) {
    if (!create && error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError') return null;
    throw error;
  }
}

export async function listSharedImages(root: FileSystemDirectoryHandle): Promise<LibraryMediaAsset[]> {
  const directory = await getSharedImageDirectory(root);
  if (!directory) return [];
  return (await listArticleImages(directory)).map((image) => ({ ...image, kind: 'shared', root }));
}

export async function importSharedImage(root: FileSystemDirectoryHandle, file: File, isCurrent: () => boolean): Promise<LibraryMediaAsset> {
  // Reject unsupported files before lazily creating either shared directory.
  await inspectArticleImage(file);
  if (!isCurrent()) throw new Error('资料库已切换；图片未导入。');
  const directory = await getSharedImageDirectory(root, true);
  if (!directory || !isCurrent()) throw new Error('资料库已切换；图片未导入。');
  const image = await importArticleImage(directory, file);
  return { ...image, kind: 'shared', root };
}

const IMAGE_FORMATS: ArticleImageFormat[] = [
  { extension: 'png', mimeType: 'image/png' },
  { extension: 'jpg', mimeType: 'image/jpeg' },
  { extension: 'gif', mimeType: 'image/gif' },
  { extension: 'webp', mimeType: 'image/webp' },
  { extension: 'bmp', mimeType: 'image/bmp' },
  { extension: 'avif', mimeType: 'image/avif' },
];

async function detectImageFormat(file: Blob): Promise<ArticleImageFormat> {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 8 && bytes[0] === 137 && ascii(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return IMAGE_FORMATS[0];
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return IMAGE_FORMATS[1];
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return IMAGE_FORMATS[2];
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return IMAGE_FORMATS[3];
  if (bytes.length >= 2 && ascii(0, 2) === 'BM') return IMAGE_FORMATS[4];
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, bytes.length))) return IMAGE_FORMATS[5];
  throw new Error('无法从文件内容确认受支持的 PNG、JPEG、GIF、WebP、BMP 或 AVIF 图片；未写入文件。');
}

export async function inspectArticleImage(file: Blob): Promise<ArticleImageFormat> {
  return detectImageFormat(file);
}

function imageBaseName(fileName: string): string {
  const leaf = fileName.replace(/\\/g, '/').split('/').at(-1) ?? '';
  const dot = leaf.lastIndexOf('.');
  const withoutExtension = dot > 0 ? leaf.slice(0, dot) : leaf;
  const cleaned = withoutExtension
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');
  return Array.from(cleaned).slice(0, 80).join('') || 'image';
}

function safeRenameBaseName(value: string, format: ArticleImageFormat): string {
  let base = value.trim().normalize('NFKC');
  const extension = /\.([a-z0-9]+)$/i.exec(base)?.[1]?.toLowerCase();
  if (extension) {
    const aliases: Record<string, string> = { jpeg: 'jpg', jpe: 'jpg' };
    const normalizedExtension = aliases[extension] ?? extension;
    if (IMAGE_FORMATS.some((item) => item.extension === normalizedExtension) && normalizedExtension !== format.extension) {
      throw new Error(`文件内容是 .${format.extension} 图片；不能改成 .${extension} 扩展名。`);
    }
    if (normalizedExtension === format.extension) base = base.slice(0, -(extension.length + 1));
  }
  if (!base || base === '.' || base === '..' || base.startsWith('.') || /[<>:"/\\|?*\u0000-\u001f\u007f]/.test(base) || /[. ]$/.test(base)) {
    throw new Error('文件名无效；请只填写不含路径的图片名称。');
  }
  if (Array.from(base).length > 80) throw new Error('文件名过长；请控制在 80 个字符内。');
  return base;
}

function normalizedFileName(fileName: string): string {
  return fileName.normalize('NFKC').toLocaleLowerCase('en-US');
}

async function existingNames(directory: FileSystemDirectoryHandle): Promise<Set<string>> {
  const names = new Set<string>();
  for await (const [name] of directory.entries()) names.add(normalizedFileName(name));
  return names;
}

async function uniqueImageFileName(directory: FileSystemDirectoryHandle, base: string, extension: string): Promise<string> {
  const names = await existingNames(directory);
  let suffix = 1;
  while (true) {
    const fileName = `${base}${suffix === 1 ? '' : `-${suffix}`}.${extension}`;
    if (!names.has(normalizedFileName(fileName))) return fileName;
    suffix += 1;
  }
}

async function writeNewImageFile(
  directory: FileSystemDirectoryHandle,
  fileName: string,
  bytes: ArrayBuffer,
): Promise<FileSystemFileHandle> {
  const names = await existingNames(directory);
  if (names.has(normalizedFileName(fileName))) throw new Error(`素材「${fileName}」已存在；未覆盖任何文件。`);
  let handle: FileSystemFileHandle | null = null;
  let writable: FileSystemWritableFileStream | null = null;
  try {
    handle = await directory.getFileHandle(fileName, { create: true });
    writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return handle;
  } catch (error) {
    try { await writable?.abort(); } catch { /* preserve the write error */ }
    if (handle) {
      try { await directory.removeEntry(fileName); } catch { /* report cleanup failure with the write error */ }
    }
    throw new Error(`图片文件 ${fileName} 保存失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function importArticleImage(
  directory: FileSystemDirectoryHandle,
  file: File,
): Promise<ImportedArticleImage> {
  const format = await detectImageFormat(file);
  const bytes = await file.arrayBuffer();
  const fileName = await uniqueImageFileName(directory, imageBaseName(file.name), format.extension);
  const handle = await writeNewImageFile(directory, fileName, bytes);
  return { fileName, mimeType: format.mimeType, size: bytes.byteLength, handle };
}

export async function copyArticleImageAs(
  directory: FileSystemDirectoryHandle,
  sourceHandle: FileSystemFileHandle,
  requestedBaseName: string,
): Promise<ImportedArticleImage> {
  const original = await sourceHandle.getFile();
  const format = await detectImageFormat(original);
  const baseName = safeRenameBaseName(requestedBaseName, format);
  const fileName = `${baseName}.${format.extension}`;
  const bytes = await original.arrayBuffer();
  const handle = await writeNewImageFile(directory, fileName, bytes);
  return { fileName, mimeType: format.mimeType, size: bytes.byteLength, handle };
}

export async function listArticleImages(directory: FileSystemDirectoryHandle): Promise<ArticleImageFile[]> {
  const images: ArticleImageFile[] = [];
  for await (const [fileName, entry] of directory.entries()) {
    if (entry.kind !== 'file' || !fileName || /[\\/\u0000-\u001f\u007f]/.test(fileName)) continue;
    try {
      const handle = await directory.getFileHandle(fileName);
      const file = await handle.getFile();
      const format = await detectImageFormat(file);
      images.push({ fileName, mimeType: format.mimeType, size: file.size, lastModified: file.lastModified, handle });
    } catch {
      // Unknown, unreadable, or non-raster files are not executable image assets.
    }
  }
  return images.sort((left, right) => left.fileName.localeCompare(right.fileName, 'zh-CN', { numeric: true }));
}

export function articleImageReferences(source: string): { url: string; line: number }[] {
  const body = parseArticle(source).body;
  const tree = markdownParser.parse(body) as unknown as MarkdownNode;
  const references: { url: string; line: number }[] = [];
  const definitions = new Map<string, string>();
  const visitDefinitions = (node: MarkdownNode) => {
    if (node.type === 'definition' && typeof node.identifier === 'string' && typeof node.url === 'string' && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    node.children?.forEach(visitDefinitions);
  };
  visitDefinitions(tree);
  const add = (url: string, offset: number) => {
    references.push({ url, line: body.slice(0, offset).split(/\r\n|\r|\n/).length });
  };
  const visit = (node: MarkdownNode) => {
    const offset = node.position?.start?.offset ?? 0;
    if (node.type === 'image' && typeof node.url === 'string') add(node.url, offset);
    if (node.type === 'imageReference' && typeof node.identifier === 'string') {
      const url = definitions.get(node.identifier); if (url) add(url, offset);
    }
    if (node.type === 'html' && typeof node.value === 'string') {
      for (const range of findHtmlImageReferenceRanges(node.value, offset)) add(body.slice(range.start, range.end).replace(/&amp;/g, '&').replace(/&#(?:x([\da-f]+)|(\d+));/ig, (_, hex, decimal) => String.fromCodePoint(parseInt(hex ?? decimal, hex ? 16 : 10))), range.start);
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return references;
}

export function articleLocalImageReferences(source: string): { fileName: string; line: number }[] {
  return articleImageReferences(source).flatMap(reference => {
    const fileName = articleImageFileNameFromSource(reference.url);
    return fileName ? [{ fileName, line: reference.line }] : [];
  });
}

function localImagePath(value: string): { fileName: string; prefix: string; suffix: string } | null {
  const prefix = value.startsWith('./') ? './' : '';
  const path = prefix ? value.slice(prefix.length) : value;
  const match = /^media\/image\/([^/?#]+)([?#].*)?$/.exec(path);
  if (!match) return null;
  let fileName: string;
  try {
    fileName = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!fileName || fileName === '.' || fileName === '..' || /[\\/\u0000-\u001f]/.test(fileName)) return null;
  return { fileName, prefix, suffix: match[2] ?? '' };
}

function encodeImageFileName(fileName: string): string {
  // Parentheses otherwise participate in Markdown's destination delimiter.
  return encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function articleImageFileNameFromSource(source: string): string | null {
  return localImagePath(source)?.fileName ?? null;
}

export function insertArticleImageReferences(
  source: string,
  fileNames: string[],
  selection: { start: number; end: number },
): string {
  if (!fileNames.length) return source;
  const frontMatterEnd = parseArticle(source).frontMatterRange?.end ?? 0;
  let start = Math.min(source.length, Math.max(frontMatterEnd, selection.start));
  let end = Math.min(source.length, Math.max(frontMatterEnd, selection.end));
  if (end < start) [start, end] = [end, start];
  if (selection.start < frontMatterEnd || selection.end < frontMatterEnd) start = end = frontMatterEnd;

  const references = fileNames.map((fileName) => {
    if (!fileName || /[\\/\u0000-\u001f\u007f]/.test(fileName)) throw new Error('图片文件名不安全；未插入引用。');
    const label = fileName.replace(/\.[^.]+$/, '').replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    return `![${label}](media/image/${encodeImageFileName(fileName)})`;
  });
  const before = source.slice(0, start);
  const after = source.slice(end);
  const prefix = !before ? '' : /\n\n$/.test(before) ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = !after ? '' : /^\n\n/.test(after) ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  return `${before}${prefix}${references.join('\n')}${suffix}${after}`;
}

function findInlineImageDestination(raw: string): SourceRange | null {
  if (!raw.startsWith('![')) return null;
  let index = 1;
  let bracketDepth = 0;
  for (; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '\\') { index += 1; continue; }
    if (character === '[') bracketDepth += 1;
    else if (character === ']') {
      bracketDepth -= 1;
      if (bracketDepth === 0) break;
    }
  }
  if (index >= raw.length) return null;
  index += 1;
  while (/\s/.test(raw[index] ?? '')) index += 1;
  if (raw[index] !== '(') return null;
  index += 1;
  while (/\s/.test(raw[index] ?? '')) index += 1;

  if (raw[index] === '<') {
    const start = ++index;
    for (; index < raw.length; index += 1) {
      if (raw[index] === '\\') { index += 1; continue; }
      if (raw[index] === '>') return { start, end: index };
    }
    return null;
  }

  const start = index;
  let parenthesisDepth = 0;
  for (; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '\\') { index += 1; continue; }
    if (character === '(') parenthesisDepth += 1;
    else if (character === ')') {
      if (parenthesisDepth === 0) break;
      parenthesisDepth -= 1;
    } else if (/\s/.test(character) && parenthesisDepth === 0) break;
  }
  return index > start ? { start, end: index } : null;
}

function findDefinitionDestination(raw: string): SourceRange | null {
  if (!raw.startsWith('[')) return null;
  let index = 0;
  let bracketDepth = 0;
  for (; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '\\') { index += 1; continue; }
    if (character === '[') bracketDepth += 1;
    else if (character === ']') {
      bracketDepth -= 1;
      if (bracketDepth === 0) break;
    }
  }
  if (index >= raw.length) return null;
  index += 1;
  while (/\s/.test(raw[index] ?? '')) index += 1;
  if (raw[index] !== ':') return null;
  index += 1;
  while (/\s/.test(raw[index] ?? '')) index += 1;
  if (raw[index] === '<') {
    const start = ++index;
    for (; index < raw.length; index += 1) {
      if (raw[index] === '\\') { index += 1; continue; }
      if (raw[index] === '>') return { start, end: index };
    }
    return null;
  }
  const start = index;
  while (index < raw.length && !/\s/.test(raw[index])) index += 1;
  return index > start ? { start, end: index } : null;
}

function findSrcsetUrlRanges(value: string, absoluteStart: number): SourceRange[] {
  const ranges: SourceRange[] = [];
  let index = 0;
  while (index < value.length) {
    while (/[\s,]/.test(value[index] ?? '')) index += 1;
    if (index >= value.length) break;
    const start = index;
    while (index < value.length && !/\s/.test(value[index])) index += 1;
    let end = index;
    while (end > start && value[end - 1] === ',') end -= 1;
    if (end > start) ranges.push({ start: absoluteStart + start, end: absoluteStart + end });
    if (end < index) continue;
    while (index < value.length && value[index] !== ',') index += 1;
    if (value[index] === ',') index += 1;
  }
  return ranges;
}

export type ArticleImageSourceSetCandidate = { url: string; fileName: string | null };

export function articleImageSourceSetCandidates(sourceSet: string): ArticleImageSourceSetCandidate[] {
  return findSrcsetUrlRanges(sourceSet, 0).map((range) => {
    const url = sourceSet.slice(range.start, range.end);
    return { url, fileName: articleImageFileNameFromSource(url) };
  });
}

export function replaceArticleImageSourceSetUrls(sourceSet: string, replacements: ReadonlyMap<string, string | null>): string {
  const changes = findSrcsetUrlRanges(sourceSet, 0)
    .map((range) => ({ ...range, url: sourceSet.slice(range.start, range.end) }))
    .filter((range) => replacements.has(range.url))
    .map((range) => ({ ...range, value: replacements.get(range.url) ?? '' }))
    .sort((left, right) => right.start - left.start);
  let next = sourceSet;
  for (const change of changes) next = `${next.slice(0, change.start)}${change.value}${next.slice(change.end)}`;
  return next;
}

function skipTagEnd(source: string, start: number): number {
  let quote = '';
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index + 1;
  }
  return source.length;
}

function skipRawTextElement(source: string, start: number, tagName: string): number {
  const closing = new RegExp(`<\\/\\s*${tagName}\\s*>`, 'ig');
  closing.lastIndex = start;
  const match = closing.exec(source);
  return match ? match.index + match[0].length : source.length;
}

function findHtmlImageReferenceRanges(html: string, absoluteStart: number): SourceRange[] {
  const ranges: SourceRange[] = [];
  let index = 0;
  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart < 0) break;
    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4);
      index = commentEnd < 0 ? html.length : commentEnd + 3;
      continue;
    }
    if (html.startsWith('<![CDATA[', tagStart)) {
      const cdataEnd = html.indexOf(']]>', tagStart + 9);
      index = cdataEnd < 0 ? html.length : cdataEnd + 3;
      continue;
    }
    if (html[tagStart + 1] === '/' || html[tagStart + 1] === '!' || html[tagStart + 1] === '?') {
      index = skipTagEnd(html, tagStart + 2);
      continue;
    }

    let cursor = tagStart + 1;
    const nameStart = cursor;
    while (/[A-Za-z0-9:-]/.test(html[cursor] ?? '')) cursor += 1;
    if (cursor === nameStart) { index = tagStart + 1; continue; }
    const tagName = html.slice(nameStart, cursor).toLowerCase();
    let selfClosing = false;

    while (cursor < html.length) {
      while (/\s/.test(html[cursor] ?? '')) cursor += 1;
      if (html[cursor] === '>') { cursor += 1; break; }
      if (html[cursor] === '/' && html[cursor + 1] === '>') { selfClosing = true; cursor += 2; break; }
      if (cursor >= html.length) break;

      const attributeStart = cursor;
      while (!/[\s=/>]/.test(html[cursor] ?? '') && cursor < html.length) cursor += 1;
      if (cursor === attributeStart) { cursor += 1; continue; }
      const attributeName = html.slice(attributeStart, cursor).toLowerCase();
      while (/\s/.test(html[cursor] ?? '')) cursor += 1;
      if (html[cursor] !== '=') continue;
      cursor += 1;
      while (/\s/.test(html[cursor] ?? '')) cursor += 1;
      const quote = html[cursor] === '"' || html[cursor] === "'" ? html[cursor++] : '';
      const valueStart = cursor;
      if (quote) {
        while (cursor < html.length && html[cursor] !== quote) cursor += 1;
      } else {
        while (cursor < html.length && !/[\s>]/.test(html[cursor])) cursor += 1;
      }
      const valueEnd = cursor;
      if (quote && html[cursor] === quote) cursor += 1;
      if (tagName === 'img' && attributeName === 'src' && valueEnd > valueStart) {
        ranges.push({ start: absoluteStart + valueStart, end: absoluteStart + valueEnd });
      } else if ((tagName === 'img' || tagName === 'source') && attributeName === 'srcset' && valueEnd > valueStart) {
        ranges.push(...findSrcsetUrlRanges(html.slice(valueStart, valueEnd), absoluteStart + valueStart));
      }
    }

    if (!selfClosing && ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext'].includes(tagName)) {
      index = skipRawTextElement(html, cursor, tagName);
    } else {
      index = cursor;
    }
  }
  return ranges;
}

export function rewriteArticleImageReferences(
  source: string,
  oldFileName: string,
  newFileName: string,
): { source: string; count: number } {
  const frontMatterEnd = parseArticle(source).frontMatterRange?.end ?? 0;
  const replacements = new Map<string, Replacement>();
  let tree: MarkdownNode;
  try {
    tree = markdownParser.parse(source) as unknown as MarkdownNode;
  } catch {
    return { source, count: 0 };
  }

  const imageReferenceIds = new Set<string>();
  const collectImageReferences = (node: MarkdownNode) => {
    if (node.type === 'imageReference' && typeof node.identifier === 'string') imageReferenceIds.add(node.identifier);
    node.children?.forEach(collectImageReferences);
  };
  collectImageReferences(tree);

  const visit = (node: MarkdownNode) => {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (typeof start === 'number' && start >= frontMatterEnd && typeof end === 'number' && end >= start) {
      if (node.type === 'image' && typeof node.url === 'string') {
        const local = localImagePath(node.url);
        const destination = findInlineImageDestination(source.slice(start, end));
        if (local?.fileName === oldFileName && destination) {
          const range = { start: start + destination.start, end: start + destination.end };
          replacements.set(`${range.start}:${range.end}`, {
            ...range,
            value: `${local.prefix}media/image/${encodeImageFileName(newFileName)}${local.suffix}`,
          });
        }
      } else if (node.type === 'definition' && typeof node.identifier === 'string' && imageReferenceIds.has(node.identifier) && typeof node.url === 'string') {
        const local = localImagePath(node.url);
        const destination = findDefinitionDestination(source.slice(start, end));
        if (local?.fileName === oldFileName && destination) {
          const range = { start: start + destination.start, end: start + destination.end };
          replacements.set(`${range.start}:${range.end}`, {
            ...range,
            value: `${local.prefix}media/image/${encodeImageFileName(newFileName)}${local.suffix}`,
          });
        }
      } else if (node.type === 'html' && typeof node.value === 'string') {
        for (const range of findHtmlImageReferenceRanges(node.value, start)) {
          const local = localImagePath(source.slice(range.start, range.end));
          if (local?.fileName !== oldFileName) continue;
          replacements.set(`${range.start}:${range.end}`, {
            ...range,
            value: `${local.prefix}media/image/${encodeImageFileName(newFileName)}${local.suffix}`,
          });
        }
      }
    }
    node.children?.forEach(visit);
  };
  visit(tree);

  const changes = [...replacements.values()].sort((left, right) => right.start - left.start);
  let next = source;
  for (const change of changes) next = `${next.slice(0, change.start)}${change.value}${next.slice(change.end)}`;
  return { source: next, count: changes.length };
}
