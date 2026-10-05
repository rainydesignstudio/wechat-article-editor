import { OPEN_FONT_ASSETS } from './fontCatalog';

const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';

// Default assets come from the application's own static bundle, never a font CDN.
// Existing library files belong to the user and are never overwritten.
export async function initializeLocalFonts(root: FileSystemDirectoryHandle, current: () => boolean = () => true): Promise<void> {
  if (!current()) return;
  const directory = await root.getDirectoryHandle('fonts', { create: true });
  for (const asset of OPEN_FONT_ASSETS) for (const name of [asset.license, asset.file]) {
    if (!current()) return;
    try { await directory.getFileHandle(name); continue; }
    catch (error) { if (!missing(error)) throw error; }
    const response = await fetch(`/${name}`);
    if (!response.ok) throw new Error(`无法复制开源字体文件 ${name}（${response.status}）。`);
    const content = await response.arrayBuffer();
    if (!current()) return;
    const file = await directory.getFileHandle(name, { create: true });
    let writable: FileSystemWritableFileStream | undefined;
    try { writable = await file.createWritable(); await writable.write(content); await writable.close(); }
    catch (error) {
      try { await writable?.abort(); } catch { /* retain the failure */ }
      try { await directory.removeEntry(name); } catch { /* retain the failure */ }
      throw error;
    }
  }
}

type FontDocument = Pick<Document, 'fonts'>;
const activeFaces = new Set<FontFace>();
const previewFontSets = new Set<FontFaceSet>();

export function shareLocalFontsWithPreview(target: FontDocument): () => void {
  const fonts = target.fonts;
  previewFontSets.add(fonts);
  for (const face of activeFaces) fonts.add(face);
  return () => { previewFontSets.delete(fonts); for (const face of activeFaces) fonts.delete(face); };
}

// Load only via the authorized filesystem handle. Discard late results after a
// directory switch, and remove every registered face when that session closes.
export async function loadLocalFonts(root: FileSystemDirectoryHandle, current: () => boolean, target: FontDocument = document): Promise<() => void> {
  const faces: FontFace[] = [];
  const dispose = () => { for (const face of faces) { target.fonts.delete(face); activeFaces.delete(face); for (const fonts of previewFontSets) fonts.delete(face); } };
  try {
    const directory = await root.getDirectoryHandle('fonts');
    const loaded = await Promise.all(OPEN_FONT_ASSETS.map(async asset => {
      const source = await (await directory.getFileHandle(asset.file)).getFile();
      const face = new FontFace(asset.family, await source.arrayBuffer(), { style: 'normal', weight: asset.weight, display: 'swap' });
      return face.load();
    }));
    if (current()) for (const face of loaded) { target.fonts.add(face); faces.push(face); activeFaces.add(face); for (const fonts of previewFontSets) fonts.add(face); }
    return dispose;
  } catch (error) { dispose(); throw error; }
}
