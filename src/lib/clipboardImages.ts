import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { articleImageFileNameFromSource, articleImageSourceSetCandidates, inspectArticleImage, replaceArticleImageSourceSetUrls } from './articleMedia';
import { ARTICLE_EXAMPLE_IMAGE } from './articleExamples';
import type { ClipboardPayload } from './render';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];

/** Embed bytes in authored positions; repeated references read each file only once. */
export async function embedClipboardImages(payload: ClipboardPayload, readImage: (fileName: string) => Promise<Blob>, isCurrent: () => boolean, readExample?: () => Promise<Blob>) {
  const document = parseFragment(payload.html);
  const images: Element[] = [];
  const visit = (node: Node) => {
    if ('tagName' in node && (node.tagName === 'img' || node.tagName === 'source')) images.push(node);
    if ('childNodes' in node) node.childNodes.forEach(visit);
  };
  document.childNodes.forEach(visit);
  const cache = new Map<string, Promise<string>>();
  let embeddedImageCount = 0;
  const assertCurrent = () => { if (!isCurrent()) throw new Error('文稿或资料库已变化，已取消旧稿复制。'); };
  const embed = async (source: string): Promise<string> => {
    const fileName = articleImageFileNameFromSource(source);
    const example = source === ARTICLE_EXAMPLE_IMAGE;
    if (!fileName && !example) {
      if (/^(?:blob:|\.\.?\/|media\/image\/)/i.test(source)) throw new Error(`无法读取本地图片引用：${source}`);
      return source;
    }
    assertCurrent();
    const key = example ? ARTICLE_EXAMPLE_IMAGE : fileName!;
    if (!cache.has(key)) cache.set(key, (async () => {
      let file: Blob;
      try { file = example ? await (readExample?.() ?? Promise.reject(new Error('示例图片不可读取。'))) : await readImage(fileName!); }
      catch (error) { throw new Error(`图片「${key}」读取失败：${error instanceof Error ? error.message : String(error)}`); }
      assertCurrent();
      const format = await inspectArticleImage(file);
      const bytes = new Uint8Array(await file.arrayBuffer());
      assertCurrent();
      let binary = '';
      // Bound argument lists for large images without allocating a second byte array.
      for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      return `data:${format.mimeType};base64,${btoa(binary)}`;
    })());
    return cache.get(key)!;
  };
  for (const image of images) {
    assertCurrent();
    let embedded = false;
    for (const attribute of image.attrs) {
      if (attribute.name === 'src' || attribute.name === 'data-src') {
        const next = await embed(attribute.value);
        embedded ||= next !== attribute.value;
        attribute.value = next;
      } else if (attribute.name === 'srcset') {
        const replacements = new Map<string, string>();
        for (const candidate of articleImageSourceSetCandidates(attribute.value)) {
          const next = await embed(candidate.url);
          if (next !== candidate.url) replacements.set(candidate.url, next);
        }
        embedded ||= replacements.size > 0;
        attribute.value = replaceArticleImageSourceSetUrls(attribute.value, replacements);
      }
    }
    if (embedded && image.tagName === 'img') embeddedImageCount++;
  }
  assertCurrent();
  return { ...payload, html: serialize(document), embeddedImageCount };
}
