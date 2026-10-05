import colors from 'tailwindcss/colors';

// Use the installed Tailwind palette, including new families, without copying
// literal color values into the theme designer.
const paletteEntries: Array<[string, string | Record<string, string>]> = Object.entries(colors);
export const TAILWIND_PALETTE = paletteEntries
  .filter((entry): entry is [string, Record<string, string>] => typeof entry[1] === 'object' && entry[1] !== null)
  .map(([name, shades]) => ({ name, shades }));
export const TAILWIND_SHADES = [...new Set(TAILWIND_PALETTE.flatMap(({ shades }) => Object.keys(shades)))].sort((a, b) => Number(a) - Number(b));
export const TAILWIND_ENDPOINTS = [{ name: 'black', color: colors.black }, { name: 'white', color: colors.white }];

const canvasContexts = new WeakMap<Document, CanvasRenderingContext2D>();
const paletteIndexes = new WeakMap<Document, { byHex: Map<string, string>; byName: Map<string, string> }>();

function normalizeHex(value: string): string | null {
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map(channel => channel + channel).join('')}`.toLowerCase();
  return null;
}

export function tailwindColorToHex(value: string, document: Document): string {
  const hex = normalizeHex(value);
  if (hex) return hex;
  let context = canvasContexts.get(document);
  if (!context) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    context = canvas.getContext('2d', { willReadFrequently: true }) ?? undefined;
    if (context) canvasContexts.set(document, context);
  }
  if (!context) throw new Error('浏览器无法解析此颜色，请使用 HEX 输入。');
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  return `#${[...context.getImageData(0, 0, 1, 1).data.slice(0, 3)].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

export type TailwindColorInformation = { hex: string; name: string | null };

// Match exact browser-converted HEX values; never label an approximate color.
export function tailwindColorInformation(value: string, document?: Document, preferredName?: string): TailwindColorInformation {
  let hex = normalizeHex(value) ?? value;
  if (!document) {
    const endpoint = TAILWIND_ENDPOINTS.find(color => normalizeHex(color.color) === hex);
    return { hex, name: endpoint?.name ?? null };
  }
  try {
    hex = tailwindColorToHex(value, document);
    let index = paletteIndexes.get(document);
    if (!index) {
      index = { byHex: new Map(), byName: new Map() };
      const entries = [...TAILWIND_PALETTE.flatMap(family => Object.entries(family.shades).map(([shade, color]) => ({ name: `${family.name}-${shade}`, color }))), ...TAILWIND_ENDPOINTS];
      for (const entry of entries) {
        const converted = tailwindColorToHex(entry.color, document);
        index.byName.set(entry.name, converted);
        if (!index.byHex.has(converted)) index.byHex.set(converted, entry.name);
      }
      paletteIndexes.set(document, index);
    }
    const name = preferredName && index.byName.get(preferredName) === hex ? preferredName : index.byHex.get(hex) ?? null;
    return { hex, name };
  } catch { return { hex, name: null }; }
}
