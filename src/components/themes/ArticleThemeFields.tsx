'use client';

import { useEffect, useState } from 'react';
import { CollapsiblePanel, PanelIcon } from '../global/CollapsiblePanel';
import type { ThemeConfig, ThemeNodeKey } from '../../lib/types';
import { ButtonBar } from '../global/ButtonBar';
import { ColorSwatchButton } from '../global/ColorSwatchButton';
import { INSPECTION_ROW_CLASSES, type ThemeInspection } from '../global/ThemeInspection';
import { ARTICLE_COLOR_LABELS } from '../../lib/themeInspection';

const COLOR_NAMES = ARTICLE_COLOR_LABELS;
export const ARTICLE_NODE_OPTIONS: Array<{ id: ThemeNodeKey; label: string }> = [
  { id: 'h1', label: '一级标题' }, { id: 'h2', label: '二级标题' }, { id: 'h3', label: '三级标题' },
  { id: 'h4', label: '四级标题' }, { id: 'h5', label: '五级标题' }, { id: 'h6', label: '六级标题' },
  { id: 'paragraph', label: '正文段落' }, { id: 'blockquote', label: '引用' }, { id: 'inlineCode', label: '行内代码' },
  { id: 'codeBlock', label: '代码块' }, { id: 'table', label: '表格' }, { id: 'caption', label: '图注' }, { id: 'divider', label: '分隔线' },
];

export function ArticleThemeFields({ theme, disabled, nodeKey, onNodeKey, onToken, onNodeValue, onResetNode, onColor, inspection, nodeColors = {} }: {
  theme: ThemeConfig; disabled: boolean; nodeKey: ThemeNodeKey;
  onNodeKey: (key: ThemeNodeKey) => void; onToken: (key: string, value: string) => void;
  onNodeValue: (key: 'fontSize' | 'lineHeight' | 'color', value: string) => void; onResetNode: () => void;
  onColor: (label: string, token: string, value: string, select: (color: string) => void) => void;
  inspection?: ThemeInspection;
  nodeColors?: Partial<Record<ThemeNodeKey, string>>;
}) {
  const node = theme.nodes?.[nodeKey] ?? {};
  const [colorsOpen, setColorsOpen] = useState(true);
  const [nodesOpen, setNodesOpen] = useState(true);
  useEffect(() => { if (!inspection?.selected) return; if (inspection.selected.kind === 'node') setNodesOpen(true); else setColorsOpen(true); }, [inspection?.selected]);
  const nodeColor = node.color ?? nodeColors[nodeKey] ?? '';
  const resolvedNodeColor = nodeColor.replace(/var\(--([a-z-]+)\)/g, (_, key: string) => theme.tokens[key] ?? nodeColor);
  return <div className="grid content-start gap-4">
    <CollapsiblePanel id="article-theme-colors" title="颜色" icon={<PanelIcon kind="colors" />} count={Object.keys(theme.tokens).filter(key => key.startsWith('color-')).length} open={colorsOpen} onToggle={() => setColorsOpen(value => !value)} className="shrink-0" contentClassName="pb-2"><div>{Object.entries(theme.tokens).filter(([token]) => token.startsWith('color-')).map(([token, color]) => <div key={token} {...inspection?.rowProps(token)} className={`flex items-center justify-between gap-3 border-t border-line py-3 ${INSPECTION_ROW_CLASSES}`}> <div className="min-w-0"><p className="text-xs font-medium text-primary">{COLOR_NAMES[token] ?? token.replace('color-article-', '')}</p><p className="mt-1 break-all font-mono text-2xs text-faint">--{token}</p></div><ColorSwatchButton color={color} className="size-8 shrink-0 rounded-full border border-line-strong hover:ring-2 hover:ring-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed" type="button" aria-label={`修改${COLOR_NAMES[token] ?? token}`} disabled={disabled} onClick={() => onColor(COLOR_NAMES[token] ?? token, `--${token}`, color, value => onToken(token, value))} /></div>)}</div></CollapsiblePanel>
    <CollapsiblePanel id="article-theme-nodes" title="排版节点" icon={<PanelIcon kind="nodes" />} count={ARTICLE_NODE_OPTIONS.length} open={nodesOpen} onToggle={() => setNodesOpen(value => !value)} className="shrink-0"><div className="grid gap-4"><label className="grid gap-2 text-xs text-muted">调整层级<select className="field" value={nodeKey} disabled={disabled} onChange={event => onNodeKey(event.target.value as ThemeNodeKey)}>{ARTICLE_NODE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="grid min-w-0 gap-2 text-xs text-muted">字号<input className="field min-w-0 w-full" value={node.fontSize ?? ''} placeholder="主题默认" disabled={disabled} onChange={event => onNodeValue('fontSize', event.target.value)} /></label><label className="grid min-w-0 gap-2 text-xs text-muted">行高<input className="field min-w-0 w-full" value={node.lineHeight ?? ''} placeholder="主题默认" disabled={disabled} onChange={event => onNodeValue('lineHeight', event.target.value)} /></label></div><div {...inspection?.rowProps(`node:${nodeKey}`)} className={`flex items-center justify-between gap-3 ${INSPECTION_ROW_CLASSES}`}><p className="text-xs text-muted">节点文字色</p><ButtonBar label="排版节点操作"><button className="button button-quiet size-8 min-h-0 p-0" type="button" aria-label="重置此节点" title="重置此节点" data-tooltip="重置此节点" disabled={disabled || !theme.nodes?.[nodeKey]} onClick={onResetNode}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></svg></button><ColorSwatchButton color={resolvedNodeColor} className="size-8 rounded-full border border-line-strong focus-visible:outline-2 focus-visible:outline-accent" type="button" aria-label="修改节点文字色" aria-haspopup="dialog" disabled={disabled} onClick={() => onColor('节点文字色', nodeKey, resolvedNodeColor, value => onNodeValue('color', value))} /></ButtonBar></div></div></CollapsiblePanel>
  </div>;
}
