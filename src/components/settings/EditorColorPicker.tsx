'use client';

import { useState, type KeyboardEvent } from 'react';
import { TAILWIND_ENDPOINTS, TAILWIND_PALETTE, TAILWIND_SHADES, tailwindColorToHex } from '../../lib/tailwindPalette';
import { ButtonBar } from '../global/ButtonBar';
import { DialogFrame, DialogHeader } from '../global/DialogFrame';
import { ColorSwatchButton, useTailwindColorInformation } from '../global/ColorSwatchButton';

const FAMILY_LABELS: Record<string, string> = {
  slate: '蓝灰', gray: '冷灰', zinc: '锌灰', neutral: '中性灰', stone: '石灰', mauve: '紫灰', olive: '橄榄灰', mist: '雾灰', taupe: '褐灰',
  red: '红', orange: '橙', amber: '琥珀', yellow: '黄', lime: '青柠', green: '绿', emerald: '翡翠', teal: '青绿', cyan: '青', sky: '天蓝', blue: '蓝', indigo: '靛蓝', violet: '蓝紫', purple: '紫', fuchsia: '品红', pink: '粉', rose: '玫红',
};

export function EditorColorPicker({ label, token, modeLabel, value, onSelect, onClose }: {
  label: string; token: string; modeLabel: string; value: string;
  onSelect: (hex: string) => void; onClose: () => void;
}) {
  const [hex, setHex] = useState(value);
  const [error, setError] = useState('');
  const [focusedColor, setFocusedColor] = useState(`${TAILWIND_PALETTE[0].name}-${TAILWIND_SHADES[0]}`);
  const currentColor = useTailwindColorInformation(value);
  const validHex = /^#[\da-f]{6}$/i.test(hex);
  const choose = (color: string) => {
    try { onSelect(tailwindColorToHex(color, document)); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  };
  const navigatePalette = (event: KeyboardEvent<HTMLButtonElement>) => {
    const columns = TAILWIND_SHADES.length;
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    if (offset === undefined) return;
    const buttons = [...(event.currentTarget.closest('table')?.querySelectorAll<HTMLButtonElement>('[data-palette-color]') ?? [])];
    const index = buttons.indexOf(event.currentTarget);
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, index + offset))]?.focus();
  };
  return <DialogFrame large wide titleId="editor-color-picker-title" descriptionId="editor-color-picker-description" onClose={onClose}>
    <DialogHeader titleId="editor-color-picker-title" eyebrow="COLOR PALETTE" title={`${label} · ${modeLabel}`} onClose={onClose} />
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line p-4">
      <div className="flex min-w-0 items-center gap-3"><span className="size-10 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor: value }} aria-hidden="true" /><div><p className="font-mono text-xs text-primary">{token}</p><p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">当前颜色 <span className="font-mono">{currentColor.hex.toUpperCase()}</span>{currentColor.name ? <span className="font-mono text-primary" data-current-tailwind-color="true">{currentColor.name}</span> : null}</p></div></div>
      <div className="flex items-end gap-2"><label className="grid gap-1 text-2xs text-muted">自定义 HEX<input className="field w-28 font-mono" aria-label="自定义 HEX" value={hex} maxLength={7} onChange={event => { setHex(event.target.value); setError(''); }} aria-invalid={!validHex} spellCheck={false} /></label><ButtonBar label="颜色应用"><button className="button button-quiet" type="button" disabled={!validHex} onClick={() => choose(hex)}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 12 5 5L20 6" /></svg>应用颜色</button></ButtonBar></div>
    </div>
    <p id="editor-color-picker-description" className="shrink-0 p-4 text-xs text-muted">选择色块即时预览；保存主题后才会保留。</p>
    <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" aria-label="Tailwind 全色系表">
      <table className="w-full border-separate border-spacing-x-1 border-spacing-y-2 text-xs"><caption className="py-3 text-left text-xs text-faint">Tailwind · {TAILWIND_PALETTE.length} 色系 · {TAILWIND_SHADES.length} 色阶</caption><thead className="sticky top-0 z-10 bg-panel"><tr><th scope="col" className="sticky left-0 bg-panel py-2 text-left font-medium text-muted">色系</th>{TAILWIND_SHADES.map(shade => <th key={shade} scope="col" className="py-2 text-center font-mono text-2xs font-normal text-faint">{shade}</th>)}</tr></thead><tbody>{TAILWIND_PALETTE.map(family => <tr key={family.name}><th scope="row" className="sticky left-0 z-10 bg-panel pr-3 text-left font-normal"><span className="block whitespace-nowrap text-xs text-primary">{FAMILY_LABELS[family.name] || family.name}</span><span className="block font-mono text-3xs text-faint">{family.name}</span></th>{TAILWIND_SHADES.map(shade => <td key={shade} className="text-center"><ColorSwatchButton color={family.shades[shade]} colorName={`${family.name}-${shade}`} type="button" data-palette-color="true" tabIndex={focusedColor === `${family.name}-${shade}` ? 0 : -1} onFocus={() => setFocusedColor(`${family.name}-${shade}`)} onKeyDown={navigatePalette} className="mx-auto block size-6 rounded-full border border-line/50 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:size-7" aria-label={`${family.name}-${shade}`} onClick={() => choose(family.shades[shade])} /></td>)}</tr>)}</tbody></table>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line p-4"><ButtonBar label="黑白颜色">{TAILWIND_ENDPOINTS.map(color => <ColorSwatchButton color={color.color} colorName={color.name} type="button" key={color.name} className="button button-quiet" onClick={() => choose(color.color)}><span className="size-5 rounded-full border border-line-strong" style={{ backgroundColor: color.color }} aria-hidden="true" />{color.name === 'black' ? '纯黑' : '纯白'}</ColorSwatchButton>)}</ButtonBar><ButtonBar label="色板操作"><button className="button button-quiet" type="button" onClick={onClose}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>取消</button></ButtonBar></footer>
    {error ? <p className="shrink-0 p-4 text-xs text-danger" role="alert">{error}</p> : null}
  </DialogFrame>;
}
