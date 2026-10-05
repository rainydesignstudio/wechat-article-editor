import { getFormatSnapshot, assertCurrentFormat, assertFormatReady } from './article-format/runtime';

function imageReady(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return image.decode().then(() => {
    if (!image.naturalWidth) throw new Error('文章图片未能解码，导出已停止。');
  });
}

export async function renderArticleExportCanvas(article: HTMLElement): Promise<{ canvas: HTMLCanvasElement; blockEnds: number[] }> {
  const snapshot = getFormatSnapshot(); assertFormatReady(snapshot);
  const options = snapshot.bundle.formatter.output.visual;
  const EXPORT_WIDTH = options.width;
  const MAX_CANVAS_SIDE = options.maxCanvasSide;
  const originalRoot = article.getRootNode();
  if (!(originalRoot instanceof ShadowRoot)) throw new Error('文章预览尚未就绪，无法生成图片。');
  const sourceStyle = originalRoot.querySelector<HTMLStyleElement>('style[data-article-style]');
  if (!sourceStyle?.textContent) throw new Error('文章样式尚未就绪，无法生成图片。');
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${EXPORT_WIDTH}px`;
  host.style.pointerEvents = 'none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = sourceStyle.textContent;
  const copy = article.cloneNode(true) as HTMLElement;
  copy.style.width = `${EXPORT_WIDTH}px`;
  copy.style.margin = '0';
  shadow.append(style, copy);
  document.body.append(host);
  try {
    if (copy.querySelector('span[data-local-asset-src],span[data-local-asset-srcset]')) {
      throw new Error('本地图片尚未载入，图片和 PDF 导出已停止；请等预览显示图片后重试。');
    }
    await Promise.all(Array.from(copy.querySelectorAll('img')).map(imageReady));
    const height = Math.ceil(copy.scrollHeight);
    if (!height) throw new Error('文章正文为空，无法生成图片。');
    if (copy.scrollWidth > EXPORT_WIDTH + 1) throw new Error('文章内容超出图片宽度，导出已停止；请调整横向溢出的内容后重试。');
    const pixelRatio = height * 2 <= MAX_CANVAS_SIDE ? 2 : 1;
    if (height * pixelRatio > MAX_CANVAS_SIDE) throw new Error('文章过长，超出浏览器单张图片的尺寸上限；可改用文档包或 Markdown。');
    const top = copy.getBoundingClientRect().top;
    const blockEnds = Array.from(copy.querySelectorAll('p,h1,h2,h3,h4,h5,h6,ul,ol,pre,blockquote,table,section'))
      .map(element => Math.round((element.getBoundingClientRect().bottom - top) * pixelRatio))
      .filter(value => value > 0 && value <= height * pixelRatio)
      .sort((left, right) => left - right);
    let imageFailed = false;
    const { toCanvas } = await import('html-to-image');
    const canvas = await toCanvas(copy, {
      width: EXPORT_WIDTH,
      height,
      pixelRatio,
      backgroundColor: options.pngBackground,
      skipAutoScale: true,
      onImageErrorHandler: () => { imageFailed = true; },
    });
    if (imageFailed) throw new Error('文章中的图片或背景资源无法载入，导出已停止。');
    if (canvas.width !== EXPORT_WIDTH * pixelRatio || canvas.height !== height * pixelRatio) {
      throw new Error('浏览器未能完整绘制文章，导出已停止。');
    }
    assertCurrentFormat(snapshot);
    return { canvas, blockEnds };
  } finally {
    host.remove();
  }
}

export async function articleCanvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('浏览器没有生成完整的 PNG 图片。')), 'image/png');
  });
}

export function articlePdfPageCuts(height: number, maxPageHeight: number, blockEnds: readonly number[]): number[] {
  const cuts: number[] = [];
  let start = 0;
  while (start < height) {
    const limit = Math.min(height, start + maxPageHeight);
    const minimum = start + Math.round(maxPageHeight * 0.7);
    const preferred = blockEnds.filter(value => value > minimum && value <= limit).at(-1);
    const end = limit < height && preferred ? preferred : limit;
    if (end <= start) throw new Error('PDF 分页失败。');
    cuts.push(end);
    start = end;
  }
  return cuts;
}

export async function articleCanvasToPdf(canvas: HTMLCanvasElement, blockEnds: readonly number[]): Promise<Blob> {
  const snapshot = getFormatSnapshot(); assertFormatReady(snapshot);
  const options = snapshot.bundle.formatter.output.visual;
  const PAGE_MARGIN_PT = options.pdfMargin;
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth - PAGE_MARGIN_PT * 2;
  const printableHeight = pageHeight - PAGE_MARGIN_PT * 2;
  if (imageWidth <= 0 || printableHeight <= 0) throw new Error('PDF边距超过纸面尺寸，请修改formatter配置。');
  const maxPageHeight = Math.max(1, Math.floor(printableHeight * canvas.width / imageWidth));
  const cuts = articlePdfPageCuts(canvas.height, maxPageHeight, blockEnds);
  let start = 0;
  for (let index = 0; index < cuts.length; index += 1) {
    const end = cuts[index];
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = end - start;
    const context = slice.getContext('2d');
    if (!context) throw new Error('浏览器没有可用的 PDF 绘制画布。');
    context.fillStyle = options.pdfBackground;
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, slice.width, slice.height);
    if (index) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', PAGE_MARGIN_PT, PAGE_MARGIN_PT, imageWidth, slice.height * imageWidth / canvas.width);
    start = end;
  }
  assertCurrentFormat(snapshot);
  return pdf.output('blob');
}
