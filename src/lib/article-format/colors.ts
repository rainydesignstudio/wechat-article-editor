export function createArticleColorNormalizer(doc: Document) {
  let colorContext: CanvasRenderingContext2D | null = null;
  const normalizedColors = new Map<string, string>();
  const normalizeColor = (value: string) => {
    if (!value || /^(rgba?\(|transparent$)/i.test(value)) return value;
    const cached = normalizedColors.get(value);
    if (cached) return cached;
    // Modern article colors (including color-mix/OKLCH syntax highlighting)
    // use the same RGB representation in the dark engine and clipboard output.
    if (!colorContext) {
      const canvas = doc.createElement('canvas');
      canvas.width = canvas.height = 1;
      colorContext = canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!colorContext) throw new Error('浏览器无法解析文章颜色。');
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = value;
    colorContext.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorContext.getImageData(0, 0, 1, 1).data;
    const result = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    normalizedColors.set(value, result);
    return result;
  };
  // Normalize color functions inside gradients and shadows without changing geometry, stops, URLs or
  // alpha. This is the clipboard's path: it must return light-mode values untouched.
  const normalizePaint = (value: string) => walkPaint(value, normalizeColor);
  // Traverse paint functions independently of the platform's conversion algorithm.
  const walkPaint = (value: string, map: (color: string) => string) => {
    const pattern = /\b(?:url|oklab|oklch|lab|lch|color|color-mix|rgba?|hsla?|hwb)\(/g;
    let output = '', offset = 0, match: RegExpExecArray | null;
    while ((match = pattern.exec(value))) {
      let end = pattern.lastIndex, depth = 1, quote = '';
      while (end < value.length && depth) {
        if (value[end] === '\\') { end += 2; continue; }
        if (quote) { if (value[end] === quote) quote = ''; }
        else if (value[end] === '"' || value[end] === "'") quote = value[end];
        else if (value[end] === '(') depth++;
        else if (value[end] === ')') depth--;
        end++;
      }
      if (depth) break;
      const paint = value.slice(match.index, end);
      output += value.slice(offset, match.index) + (paint.startsWith('url(') ? paint : map(paint));
      offset = end; pattern.lastIndex = end;
    }
    return output + value.slice(offset);
  };
  return { normalizeColor, normalizePaint };
}
