'use client';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTextInputHistory } from '../../hooks/useTextInputHistory';
import { IconButton } from '../global/IconButton';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';

export type ReplaceAllDecision = { source: string; query: string; replacement: string; matchCase: boolean; count: number; changed?: boolean };

export function FindIcon({ name = 'find' }: { name?: 'find' | 'up' | 'down' | 'close' | 'case' | 'replace' | 'all' }) {
  const paths = { find: 'm21 21-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', up: 'm5 15 7-7 7 7', down: 'm5 9 7 7 7-7', close: 'm6 6 12 12M18 6 6 18', case: 'm3 18 5-12 5 12M5 14h6M15 11h6M21 11v7M21 15h-3a3 3 0 0 0 0 6', replace: 'M4 7h13m-4-4 4 4-4 4M20 17H7m4-4-4 4 4 4', all: 'M3 6h13m-4-3 4 3-4 3M3 12h18M3 18h13m-4-3 4 3-4 3' };
  return <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function SourceFindBar({ query, replacement, matchCase, count, index, disabled, composing, autoFocusQuery = true, focusQueryRef, decision, scopeLabel, onConfirmAll, onCancelAll, onQuery, onReplacement, onCase, onMove, onReplace, onReplaceAll, onClose }: {
  query: string; replacement: string; matchCase: boolean; count: number; index: number; disabled: boolean; composing: boolean;
  autoFocusQuery?: boolean; focusQueryRef?: MutableRefObject<(() => void) | null>;
  decision: ReplaceAllDecision | null; scopeLabel: string; onConfirmAll: () => void; onCancelAll: () => void;
  onQuery: (value: string) => void; onReplacement: (value: string) => void; onCase: () => void; onMove: (direction: 1 | -1) => void; onReplace: () => void; onReplaceAll: () => void; onClose: () => void;
}) {
  const [inputComposing, setInputComposing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const queryHistory = useTextInputHistory(input, query, onQuery);
  const replacementHistory = useTextInputHistory(replacementInput, replacement, onReplacement);
  const hadDecision = useRef(false);
  const focusReplacement = () => replacementInput.current?.focus({ preventScroll: true });
  useEffect(() => {
    const focus = () => { input.current?.focus(); input.current?.select(); };
    if (focusQueryRef) focusQueryRef.current = focus;
    if (autoFocusQuery) focus();
    return () => { if (focusQueryRef?.current === focus) focusQueryRef.current = null; };
  }, [autoFocusQuery, focusQueryRef]);
  useEffect(() => { if (hadDecision.current && !decision) focusReplacement(); hadDecision.current = Boolean(decision); }, [decision]);
  const replaceCurrent = () => { if (!disabled && !composing && !inputComposing && count) { onReplace(); focusReplacement(); } };
  return <><div className="relative z-30 grid shrink-0 gap-2 border-b border-line bg-panel px-3 py-2" role="search" aria-label="当前源码查找替换" onCompositionStart={() => setInputComposing(true)} onCompositionEnd={() => setInputComposing(false)} onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || inputComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault(); event.stopPropagation();
      if (event.target === replacementInput.current) replaceCurrent();
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onMove(event.shiftKey ? -1 : 1); }
  }}>
    <div className="flex min-w-0 items-center gap-1">
      <input ref={input} {...queryHistory.events} className="form-input min-h-9 min-w-0 flex-1 px-2 text-xs" type="search" value={query} placeholder="查找当前源码" aria-label="查找文本" />
      <span className="shrink-0 font-mono text-2xs text-muted" role="status">{count ? `${index + 1}/${count}` : '0/0'}</span>
      <IconButton tooltip="区分大小写" icon={<FindIcon name="case" />} aria-pressed={matchCase} onClick={onCase} />
      <IconButton tooltip="上一个（Shift+Enter）" icon={<FindIcon name="up" />} disabled={!count} onClick={() => onMove(-1)} />
      <IconButton tooltip="下一个（Enter）" icon={<FindIcon name="down" />} disabled={!count} onClick={() => onMove(1)} />
      <IconButton tooltip="关闭查找（Esc）" icon={<FindIcon name="close" />} onClick={onClose} />
    </div>
    <div className="flex min-w-0 items-center gap-1">
      <input ref={replacementInput} {...replacementHistory.events} className="form-input min-h-9 min-w-0 flex-1 px-2 text-xs" type="text" value={replacement} placeholder="替换为" aria-label="替换文本" />
      <IconButton tooltip={disabled ? '源码只读或暂不可编辑' : '替换当前匹配'} icon={<FindIcon name="replace" />} disabled={disabled || composing || inputComposing || !count} onClick={replaceCurrent} />
      <IconButton tooltip={disabled ? '源码只读或暂不可编辑' : '替换全部匹配，一次撤销'} icon={<FindIcon name="all" />} disabled={disabled || composing || inputComposing || !count} onClick={onReplaceAll} />
    </div>
  </div>{decision && typeof document !== 'undefined' ? createPortal(<DialogFrame titleId="source-replace-all-title" descriptionId="source-replace-all-description" onClose={onCancelAll}>
    <DialogHeader titleId="source-replace-all-title" eyebrow="REPLACE ALL" title="替换全部" onClose={onCancelAll} />
    <div className="dialog-content">
      <p id="source-replace-all-description" className="text-sm text-muted">范围：{scopeLabel}</p>
      <dl className="grid min-w-0 gap-2 text-sm text-primary">
        <dt className="text-muted">查找</dt><dd className="max-h-24 overflow-x-clip overflow-y-auto whitespace-pre-wrap break-words scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{decision.query}</dd>
        <dt className="text-muted">替换为</dt><dd className="max-h-24 overflow-x-clip overflow-y-auto whitespace-pre-wrap break-words scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{decision.replacement || '删除匹配内容'}</dd>
      </dl>
      <p className="text-sm text-primary">共匹配 {decision.count} 处</p>
      {decision.changed ? <p className="text-xs text-warning-strong" role="status">内容已变化，已更新匹配信息，请再次确认。</p> : null}
    </div>
    <DialogFooter><DialogActions><DialogButton autoFocus onClick={onCancelAll}>取消</DialogButton><DialogButton variant="primary" disabled={disabled || composing || inputComposing || !decision.count} onClick={onConfirmAll}>替换 {decision.count} 处</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>, document.body) : null}</>;
}
