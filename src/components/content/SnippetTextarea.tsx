'use client';

import { findSourceMatches, replaceAllSourceMatches } from '../../lib/sourceSearch';
import { SourceFindBar, FindIcon, type ReplaceAllDecision } from './SourceFindBar';
import { IconButton } from '../global/IconButton';
import { insertUndoableText } from '../../lib/nativeTextareaEdit';
import { sourceOffsetRect, revealSourceRect } from '../../lib/sourceViewport';
import { useTextInputHistory } from '../../hooks/useTextInputHistory';

import { forwardRef, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type CompositionEvent, type DragEvent, type ForwardedRef, type KeyboardEvent, type MutableRefObject, type ReactNode, type UIEvent } from 'react';
import { createPortal } from 'react-dom';
import { findSnippetMenuMatch, findSnippetSpaceExpansion, groupSnippetMatches, snippetTreeRows, prepareSnippetInsertion } from '../../lib/snippetComposer';
import { tokenizeEditorSource } from '../../lib/editorSourceHighlight';
import { logicalSourceLines, type SourceLineConcern } from '../../lib/sourceLineDiagnostics';
import type { ArticleSnippet, SnippetCategory } from '../../lib/types';
import { CategoryIcon } from './SnippetCategoryDialog';

type Props = {
  value: string;
  snippets: ArticleSnippet[];
  categories?: SnippetCategory[];
  openFindRef?: MutableRefObject<(() => void) | null>;
  openPickerRef?: MutableRefObject<(() => void) | null>;
  insertTextRef?: MutableRefObject<((text: string, caretOffset: number) => boolean) | null>;
  onChange: (value: string) => void;
  onSnippetInserted?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  id?: string;
  sourceFont?: 'article' | 'editor';
  onImportFiles?: (files: File[], selection: Selection) => void | Promise<void>;
  onPasteConflict?: () => void;
  showLineNumbers?: boolean;
  lineConcerns?: ReadonlyMap<number, SourceLineConcern>;
};

const EMPTY_LINE_CONCERNS = new Map<number, SourceLineConcern>();

type Selection = { start: number; end: number };

function imageFilesFromTransfer(transfer: DataTransfer): File[] {
  const fromItems = Array.from(transfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  const files = fromItems.length ? fromItems : Array.from(transfer.files);
  return files.filter((file) => file.type.startsWith('image/') || /\.(?:png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name));
}

function selectionOf(textarea: HTMLTextAreaElement): Selection {
  return { start: textarea.selectionStart, end: textarea.selectionEnd };
}

export function highlightMarkdownSource(value: string): ReactNode[] {
  return tokenizeEditorSource(value).map((segment, index) => segment.tone
    ? <span key={index} className={segment.tone}>{segment.text || <span data-source-padding="true">{'\u200b'}</span>}</span>
    : segment.text || <span key={index} data-source-padding="true">{'\u200b'}</span>);
}

export const SnippetTextarea = forwardRef(function SnippetTextarea(
  { value, snippets, categories = [], openFindRef, openPickerRef, insertTextRef, onChange, onSnippetInserted, disabled = false, readOnly = false, ariaLabel = '文章原始 Markdown 与 HTML 源码', id, sourceFont = 'article', onImportFiles, onPasteConflict, showLineNumbers = false, lineConcerns = EMPTY_LINE_CONCERNS }: Props,
  forwardedRef: ForwardedRef<HTMLTextAreaElement>,
) {
  const fontClass = sourceFont === 'article' ? 'font-article-source' : 'font-editor-source';
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLPreElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const tooltipCloseRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pendingSelectionRef = useRef<(Selection & { value: string }) | null>(null);
  const reportedValueRef = useRef(value);
  const composingRef = useRef(false);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const selectionRef = useRef<Selection>({ start: 0, end: 0 });
  const [isComposing, setIsComposing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [activeState, setActiveState] = useState<{ key: string | null; index: number }>({ key: null, index: 0 });
  const [expandedState, setExpandedState] = useState<{ key: string | null; ids: string[] }>({ key: null, ids: [] });
  const [dismissedMatch, setDismissedMatch] = useState<string | null>(null);
  const [insertionIssue, setInsertionIssue] = useState<string | null>(null);
  const [hoveredConcern, setHoveredConcern] = useState<{ line: number; concern: SourceLineConcern; top: number; left: number } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [focusFindQuery, setFocusFindQuery] = useState(true);
  const focusFindRef = useRef<(() => void) | null>(null);
  const [replaceAllDecision, setReplaceAllDecision] = useState<ReplaceAllDecision | null>(null);
  const [findQuery, setFindQuery] = useState('');
  const [findReplacement, setFindReplacement] = useState('');
  const [findCase, setFindCase] = useState(false);
  const [findIndex, setFindIndex] = useState(0);
  const found = useMemo(() => findOpen ? findSourceMatches(value, findQuery, findCase) : [], [value, findQuery, findCase, findOpen]);
  const activeFind = Math.min(findIndex, Math.max(0, found.length - 1));
  const highlightedSource = useMemo(() => {
    const match = findOpen ? found[activeFind] : null;
    if (!match) return highlightMarkdownSource(value);
    const segments = tokenizeEditorSource(value); let offset = 0;
    return segments.flatMap((segment, index) => {
      const start = offset; const end = start + segment.text.length; offset = end;
      if (end <= match.start || start >= match.end) return [<span key={index} className={segment.tone}>{segment.text || <span data-source-padding="true">{'\u200b'}</span>}</span>];
      const left = Math.max(0, match.start - start), right = Math.min(segment.text.length, match.end - start);
      return [<span key={index} className={segment.tone}>{segment.text.slice(0, left)}<mark data-source-find="true" className="rounded-sm bg-selection text-editor-text">{segment.text.slice(left, right)}</mark>{segment.text.slice(right)}</span>];
    });
  }, [value, findOpen, found, activeFind]);
  const sourceLines = useMemo(() => logicalSourceLines(value), [value]);
  const sourceBoxClass = `editor-inner ${fontClass} ${showLineNumbers ? 'pl-14 md:pl-18' : ''}`;
  const revealCaret = () => {
    const textarea = textareaRef.current, source = sourceRef.current, viewport = viewportRef.current;
    if (!textarea || !source || !viewport) return;
    const offset = textarea.selectionDirection === 'backward' ? textarea.selectionStart : textarea.selectionEnd;
    const rect = sourceOffsetRect(source, offset);
    if (rect) revealSourceRect(viewport, rect);
  };

  const cancelTooltipClose = () => {
    if (tooltipCloseRef.current !== null) window.clearTimeout(tooltipCloseRef.current);
    tooltipCloseRef.current = null;
  };
  const scheduleTooltipClose = () => {
    cancelTooltipClose();
    tooltipCloseRef.current = window.setTimeout(() => setHoveredConcern(null), 150);
  };

  useLayoutEffect(() => {
    cancelTooltipClose();
    setHoveredConcern(null);
    return cancelTooltipClose;
  }, [value, lineConcerns, showLineNumbers]);

  const showConcern = (element: HTMLElement, line: number, concern: SourceLineConcern) => {
    cancelTooltipClose();
    const bounds = element.getBoundingClientRect();
    setHoveredConcern({ line, concern, top: Math.max(8, Math.min(bounds.top, window.innerHeight - 272)), left: Math.max(8, Math.min(bounds.right + 8, window.innerWidth - 272)) });
  };

  const match = useMemo(() => selection.start === selection.end
    ? findSnippetMenuMatch(value, selection.start, snippets, isComposing)
    : null, [isComposing, selection, snippets, value]);
  const matchKey = match ? `${match.start}:${match.query}` : null;
  const visibleMatch = !findOpen && match && matchKey !== dismissedMatch ? match : null;
  const groups = visibleMatch ? groupSnippetMatches(visibleMatch.items, categories) : [];
  const expanded = expandedState.key === matchKey ? expandedState.ids : visibleMatch?.query ? groups.map(group => group.id) : [];
  const rows = snippetTreeRows(groups, expanded);
  const initialIndex = visibleMatch?.query ? Math.max(0, rows.findIndex(row => row.snippet)) : 0;
  const safeActiveIndex = Math.min(activeState.key === matchKey ? activeState.index : initialIndex, Math.max(0, rows.length - 1));
  const activeRow = rows[safeActiveIndex];
  const activeSnippet = activeRow?.snippet;
  const setActiveIndex = (index: number) => setActiveState({ key: matchKey, index });
  const toggleGroup = (id: string, open = !expanded.includes(id)) => setExpandedState({ key: matchKey, ids: open ? [...expanded.filter(item => item !== id), id] : expanded.filter(item => item !== id) });

  const restoreSelection = (target: HTMLTextAreaElement, next: Selection) => {
    target.setSelectionRange(next.start, next.end);
    selectionRef.current = next;
    setSelection(next);
    revealCaret();
  };

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    const textarea = textareaRef.current;
    if (!pending || !textarea || pending.value !== value) return;
    pendingSelectionRef.current = null;
    if (document.activeElement === textarea) restoreSelection(textarea, pending);
  }, [value]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
    if (document.activeElement === textarea && textarea.selectionStart === textarea.selectionEnd) revealCaret();
  }, [showLineNumbers, sourceFont, value]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const option = menu?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!menu || !option) return;
    const bounds = menu.getBoundingClientRect();
    const selectedBounds = option.getBoundingClientRect();
    const visibleTop = bounds.top + menu.clientTop + (menu.firstElementChild as HTMLElement).offsetHeight;
    const visibleBottom = bounds.top + menu.clientTop + menu.clientHeight;
    // Scroll only this popup, preserving the editor's position and keyboard focus.
    if (selectedBounds.top < visibleTop) menu.scrollTop -= visibleTop - selectedBounds.top;
    else if (selectedBounds.bottom > visibleBottom) menu.scrollTop += selectedBounds.bottom - visibleBottom;
  }, [activeRow?.id, matchKey]);

  const rememberSelection = (target: HTMLTextAreaElement) => {
    const next = selectionOf(target);
    const changed = selectionRef.current.start !== next.start || selectionRef.current.end !== next.end;
    selectionRef.current = next;
    setSelection(previous => previous.start === next.start && previous.end === next.end ? previous : next);
    return changed;
  };

  const sourceHistory = useTextInputHistory(textareaRef, value, next => {
    reportedValueRef.current = next;
    if (textareaRef.current) rememberSelection(textareaRef.current);
    setDismissedMatch(null);
    setActiveState({ key: null, index: 0 });
    setInsertionIssue(null);
    onChange(next);
  }, readOnly);

  const importTransferFiles = (files: File[], target: HTMLTextAreaElement) => {
    if (!files.length || disabled || readOnly || !onImportFiles) return;
    void onImportFiles(files, selectionOf(target));
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imageFilesFromTransfer(event.clipboardData);
    if (!files.length) return;
    if (event.clipboardData.getData('text/plain').trim()) {
      onPasteConflict?.();
      return;
    }
    event.preventDefault();
    importTransferFiles(files, event.currentTarget);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || readOnly || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    setIsDragActive(false);
    const files = imageFilesFromTransfer(event.dataTransfer);
    if (!files.length || disabled || readOnly) return;
    event.preventDefault();
    const target = textareaRef.current;
    if (!target) return;
    selectionRef.current = selectionOf(target);
    importTransferFiles(files, target);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.currentTarget.value;
    if (pendingSelectionRef.current?.value !== nextValue) pendingSelectionRef.current = null;
    reportedValueRef.current = nextValue;
    rememberSelection(event.currentTarget);
    setDismissedMatch(null);
    setActiveState({ key: null, index: 0 });
    setInsertionIssue(null);
    sourceHistory.events.onChange(event);
  };

  const commitInsertion = (insertion: { text: string; caretOffset: number }, start: number, end: number): boolean => {
    const textarea = textareaRef.current;
    if (!textarea || disabled || readOnly || composingRef.current) return false;
    const previous = textarea.value;
    const expected = `${previous.slice(0, start)}${insertion.text}${previous.slice(end)}`;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    reportedValueRef.current = previous;
    const nextCaret = start + insertion.caretOffset;
    pendingSelectionRef.current = { value: expected, start: nextCaret, end: nextCaret };

    if (!insertUndoableText(textarea, insertion.text, start, end, () => reportedValueRef.current, previous => {
      reportedValueRef.current = previous;
      onChange(previous);
    })) {
      pendingSelectionRef.current = null;
      setInsertionIssue('浏览器未能建立可撤销的单步编辑；原文已保留。请重试，或手动修改源码。');
      restoreSelection(textarea, { start, end });
      return false;
    }

    setInsertionIssue(null);
    restoreSelection(textarea, { start: nextCaret, end: nextCaret });
    sourceHistory.finishInsertion();
    setDismissedMatch(null);
    setActiveState({ key: null, index: 0 });
    return true;
  };

  const commitSnippet = (snippet: ArticleSnippet, start: number, end: number, compile = true) => {
    const inserted = commitInsertion(prepareSnippetInsertion(snippet.content.replace(/\r\n?/g, '\n'), textareaRef.current?.value ?? value, start), start, end);
    if (inserted && compile) onSnippetInserted?.();
    return inserted;
  };

  useLayoutEffect(() => {
    if (!insertTextRef) return;
    insertTextRef.current = (text, caretOffset) => {
      const textarea = textareaRef.current;
      return Boolean(textarea && commitInsertion({ text, caretOffset }, textarea.selectionStart, textarea.selectionEnd));
    };
    return () => { insertTextRef.current = null; };
  }, [insertTextRef, disabled, readOnly, value]);

  useLayoutEffect(() => {
    if (!openPickerRef) return;
    openPickerRef.current = () => {
      const textarea = textareaRef.current;
      if (textarea) commitSnippet({ id: 'picker', name: '', description: '', trigger: '//picker', content: '//' }, textarea.selectionStart, textarea.selectionEnd, false);
    };
    return () => { openPickerRef.current = null; };
  }, [openPickerRef, disabled, readOnly, value]);

  const openFind = () => {
    const textarea = textareaRef.current;
    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      const chosen = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      if (!chosen.includes('\n')) setFindQuery(chosen);
    }
    setFocusFindQuery(true);
    setFindOpen(true);
    focusFindRef.current?.();
  };
  const closeFind = () => { setFindOpen(false); if (!disabled) textareaRef.current?.focus(); };
  const moveFind = (direction: 1 | -1) => {
    if (!findQuery) { openFind(); return; }
    const matches = findOpen ? found : findSourceMatches(value, findQuery, findCase);
    if (!findOpen) { setFocusFindQuery(false); setFindOpen(true); }
    if (!matches.length) return;
    const index = (Math.min(findIndex, matches.length - 1) + direction + matches.length) % matches.length;
    setFindIndex(index);
    const textarea = textareaRef.current;
    if (textarea) { textarea.setSelectionRange(matches[index].start, matches[index].end); selectionRef.current = matches[index]; }
  };
  const replaceCurrent = () => {
    const item = found[activeFind];
    if (item) commitInsertion({ text: findReplacement, caretOffset: findReplacement.length }, item.start, item.end);
  };
  const requestReplaceAll = () => {
    if (disabled || readOnly || composingRef.current || !found.length) return;
    setReplaceAllDecision({ source: value, query: findQuery, replacement: findReplacement, matchCase: findCase, count: found.length });
  };
  const confirmReplaceAll = () => {
    if (!replaceAllDecision || disabled || readOnly || composingRef.current) return;
    if (replaceAllDecision.source !== value || replaceAllDecision.query !== findQuery || replaceAllDecision.replacement !== findReplacement || replaceAllDecision.matchCase !== findCase) {
      setReplaceAllDecision({ source: value, query: findQuery, replacement: findReplacement, matchCase: findCase, count: found.length, changed: true });
      return;
    }
    const next = replaceAllSourceMatches(value, findQuery, findReplacement, findCase);
    if (next === value || commitInsertion({ text: next, caretOffset: Math.min(selectionRef.current.start, next.length) }, 0, value.length)) setReplaceAllDecision(null);
  };
  useLayoutEffect(() => {
    if (replaceAllDecision && (replaceAllDecision.source !== value || replaceAllDecision.query !== findQuery || replaceAllDecision.replacement !== findReplacement || replaceAllDecision.matchCase !== findCase)) {
      setReplaceAllDecision({ source: value, query: findQuery, replacement: findReplacement, matchCase: findCase, count: found.length, changed: true });
    }
  }, [replaceAllDecision, value, findQuery, findReplacement, findCase, found.length]);
  useLayoutEffect(() => {
    if (!openFindRef) return;
    openFindRef.current = openFind;
    return () => { openFindRef.current = null; };
  }, [openFindRef, value]);
  useLayoutEffect(() => {
    if (!findOpen || !found.length || !viewportRef.current || !highlightRef.current) return;
    const marker = highlightRef.current.querySelector<HTMLElement>('[data-source-find]');
    if (!marker) return;
    revealSourceRect(viewportRef.current, marker.getBoundingClientRect());
  }, [findOpen, found, activeFind]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    sourceHistory.events.onKeyDown(event);
    if (event.defaultPrevented) return;
    pendingSelectionRef.current = null;
    const composing = composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229;
    if (composing || disabled || readOnly) return;

    if (visibleMatch && event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((safeActiveIndex + 1) % rows.length);
      return;
    }
    if (visibleMatch && event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((safeActiveIndex - 1 + rows.length) % rows.length);
      return;
    }
    if (visibleMatch && activeRow && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      if (event.key === 'ArrowRight') {
        if (!activeSnippet && !expanded.includes(activeRow.group.id)) toggleGroup(activeRow.group.id, true);
        else if (!activeSnippet && rows[safeActiveIndex + 1]?.snippet) setActiveIndex(safeActiveIndex + 1);
      } else if (activeSnippet) setActiveIndex(rows.findIndex(row => row.group.id === activeRow.group.id && !row.snippet));
      else toggleGroup(activeRow.group.id, false);
      return;
    }
    if (visibleMatch && activeRow && !activeSnippet && event.key === 'Enter') {
      event.preventDefault(); toggleGroup(activeRow.group.id); return;
    }
    if (visibleMatch && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) && activeSnippet) {
      event.preventDefault();
      commitSnippet(activeSnippet, visibleMatch.start, visibleMatch.end);
      return;
    }
    if (visibleMatch && event.key === 'Escape') {
      event.preventDefault();
      setDismissedMatch(matchKey);
      return;
    }
    if (event.key === ' ' && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
      const expansion = findSnippetSpaceExpansion(value, event.currentTarget.selectionStart, snippets);
      if (!expansion) return;
      event.preventDefault();
      commitSnippet(expansion.snippet, expansion.start, expansion.end);
    }
  };

  const handleCompositionStart = (event: CompositionEvent<HTMLTextAreaElement>) => {
    sourceHistory.events.onCompositionStart(event);
    composingRef.current = true;
    setIsComposing(true);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>) => {
    sourceHistory.events.onCompositionEnd(event);
    composingRef.current = false;
    setIsComposing(false);
    rememberSelection(event.currentTarget);
  };

  const handleViewportScroll = () => {
    setHoveredConcern(null);
  };
  const handleTextareaScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    // A focused native control can try to scroll internally while its content grows.
    // Its final height follows the pre, so keep that internal offset at the common origin.
    if (event.currentTarget.scrollTop || event.currentTarget.scrollLeft) {
      event.currentTarget.scrollTop = 0;
      event.currentTarget.scrollLeft = 0;
      revealCaret();
    }
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-editor-surface data-[drop-active=true]:outline-2 data-[drop-active=true]:outline-offset-2 data-[drop-active=true]:outline-accent" data-drop-active={isDragActive} onKeyDownCapture={event => {
        if (event.nativeEvent.isComposing || composingRef.current || replaceAllDecision || event.keyCode === 229) return;
        const key = event.key.toLowerCase();
        if ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'g') { event.preventDefault(); event.stopPropagation(); moveFind(event.shiftKey ? -1 : 1); return; }
        if (findOpen && key === 'escape' && event.target === textareaRef.current) { event.preventDefault(); event.stopPropagation(); closeFind(); return; }
        if ((event.metaKey || event.ctrlKey) && key === 'f' || event.ctrlKey && key === 'h') { event.preventDefault(); event.stopPropagation(); openFind(); }
      }} onDragEnter={handleDragOver} onDragOver={handleDragOver} onDragLeave={() => setIsDragActive(false)} onDrop={handleDrop}>
      {findOpen ? <SourceFindBar query={findQuery} replacement={findReplacement} matchCase={findCase} count={found.length} index={activeFind} disabled={disabled || readOnly} composing={isComposing} autoFocusQuery={focusFindQuery} focusQueryRef={focusFindRef}
        decision={replaceAllDecision} scopeLabel={ariaLabel === '文章原始 Markdown 与 HTML 源码' ? '当前文章正文' : `当前${ariaLabel}`} onConfirmAll={confirmReplaceAll} onCancelAll={() => setReplaceAllDecision(null)}
        onQuery={next => { setFindQuery(next); setFindIndex(0); }} onReplacement={setFindReplacement} onCase={() => { setFindCase(current => !current); setFindIndex(0); }} onMove={moveFind}
        onReplace={replaceCurrent} onReplaceAll={requestReplaceAll} onClose={closeFind} /> : null}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {!openFindRef && !findOpen ? <div className="absolute top-2 right-2 z-30"><IconButton tooltip="查找替换（⌘F / Ctrl+F）" icon={<FindIcon />} onClick={openFind} /></div> : null}
      <div ref={viewportRef} data-source-viewport="true" className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto scrollbar-gutter-stable" onScroll={handleViewportScroll}>
      <div data-source-content="true" className="relative min-h-full w-full">
      <div ref={highlightRef} className={`pointer-events-none ${isComposing ? 'opacity-0' : ''}`} aria-hidden="true"><pre ref={sourceRef} className={sourceBoxClass}>{highlightedSource}</pre></div>
      {showLineNumbers || lineConcerns.size > 0 ? <div ref={gutterRef} className="pointer-events-none absolute inset-0 z-20 overflow-clip">
        <div className={sourceBoxClass}>
          {sourceLines.map((line, index) => {
            const number = index + 1;
            const concern = lineConcerns.get(number);
            return <div key={number} className="relative min-w-0 whitespace-pre-wrap wrap-anywhere">
              {showLineNumbers ? concern ? <button className="pointer-events-auto absolute top-0 -left-9 w-5 bg-transparent p-0 pr-1 text-right font-article-source text-faint data-[severity=warning]:text-warning data-[severity=error]:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:-left-12 md:w-8" type="button" data-severity={concern.severity} aria-label={`第 ${number} 行${concern.severity === 'error' ? '错误' : '警告'}：${concern.messages.join('；')}`} onMouseEnter={(event) => showConcern(event.currentTarget, number, concern)} onMouseLeave={scheduleTooltipClose} onFocus={(event) => showConcern(event.currentTarget, number, concern)} onBlur={scheduleTooltipClose}>{number}</button> : <span className="absolute top-0 -left-9 w-5 pr-1 text-right font-article-source text-faint md:-left-12 md:w-8" aria-hidden="true">{number}</span> : null}
              {concern && (!showLineNumbers || concern.severities) ? <button type="button" className={`pointer-events-auto absolute top-0 flex h-6 items-center justify-center gap-0.5 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-accent ${showLineNumbers ? '-left-12 w-3 md:-left-16' : '-left-5 w-4 md:-left-6'}`} aria-label={`第 ${number} 行诊断：${concern.messages.join('；')}`} onMouseEnter={event => showConcern(event.currentTarget, number, concern)} onMouseLeave={scheduleTooltipClose} onFocus={event => showConcern(event.currentTarget, number, concern)} onBlur={scheduleTooltipClose}>{(concern.severities ?? [concern.severity]).map(severity => <span key={severity} data-severity={severity} className="size-1.5 shrink-0 rounded-full data-[severity=warning]:bg-warning data-[severity=error]:bg-danger" aria-hidden="true" />)}</button> : null}
              <span className="invisible" aria-hidden="true">{line || '\u200b'}</span>
            </div>;
          })}
        </div>
      </div> : null}
      <textarea
        id={id}
        ref={(node) => {
          textareaRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        className={`absolute inset-0 z-10 min-h-0 min-w-0 size-full resize-none overflow-hidden ${sourceBoxClass} caret-editor-text outline-0 selection:bg-selection/60 selection:text-editor-text focus-visible:outline-none ${isComposing ? 'text-editor-text' : 'text-transparent'}`}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        onChange={handleChange}
        onClick={(event) => { pendingSelectionRef.current = null; rememberSelection(event.currentTarget); if (event.currentTarget.selectionStart === event.currentTarget.selectionEnd) revealCaret(); }}
        onBlur={() => { sourceHistory.events.onBlur(); pendingSelectionRef.current = null; setDismissedMatch(matchKey); }}
        onFocus={() => queueMicrotask(() => {
          const textarea = textareaRef.current;
          if (textarea && document.activeElement === textarea && textarea.selectionStart === textarea.selectionEnd) revealCaret();
        })}
        name={id ?? "article-source"}
        onKeyUp={(event) => { rememberSelection(event.currentTarget); if (!event.nativeEvent.isComposing && !composingRef.current && /^(Arrow|Home$|End$|PageUp$|PageDown$)/.test(event.key)) revealCaret(); }}
        onSelect={(event) => {
          sourceHistory.events.onSelect(event);
          const changed = rememberSelection(event.currentTarget);
          if (changed && !composingRef.current && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) revealCaret();
        }}
        onScroll={handleTextareaScroll}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        spellCheck={false}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-haspopup="tree"
        aria-expanded={Boolean(visibleMatch)}
        aria-controls={visibleMatch ? 'snippet-command-list' : undefined}
        aria-activedescendant={activeRow?.id}
      />
      </div>
      </div>
      </div>
      {insertionIssue ? <div className="diagnostic" data-level="error" role="alert">{insertionIssue}</div> : null}
      {visibleMatch ? (
        <div ref={menuRef} className="snippet-command-menu" aria-label="片段搜索结果">
          <p className="snippet-command-hint">片段库 · ↑↓ 移动 · ←→ 折叠／展开 · Enter / Tab 插入 · Esc 关闭</p>
          <div className="snippet-command-list" id="snippet-command-list" role="tree" aria-label="匹配片段分类">
            {rows.map((row, index) => (
              <button
                key={row.id}
                id={row.id}
                className={`snippet-command-option ${row.snippet ? 'items-start' : 'items-center py-2.5'}`}
                type="button"
                role="treeitem"
                tabIndex={-1}
                aria-level={row.snippet ? 2 : 1}
                aria-expanded={row.snippet ? undefined : expanded.includes(row.group.id)}
                aria-selected={index === safeActiveIndex}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => { if (row.snippet) commitSnippet(row.snippet, visibleMatch!.start, visibleMatch!.end); else { setActiveIndex(index); toggleGroup(row.group.id); } }}
              >
                {row.snippet ? <><span className="mt-0.5 inline-flex size-4 shrink-0"><CategoryIcon name={row.snippet.icon} /></span><span className="grid min-w-0 flex-1 gap-1"><span className="snippet-option-heading"><strong className="min-w-0 break-words">{row.snippet.name}</strong><code>{row.snippet.trigger}</code></span><span className="snippet-option-description">{row.snippet.description}</span></span></> : <><span className="inline-flex size-4 shrink-0 text-accent-text"><CategoryIcon name={row.group.icon ?? 'snippet'} /></span><strong className="min-w-0 flex-1 truncate font-sub-heading text-sm font-semibold">{row.group.name}</strong><span className="font-mono text-xs text-faint">{row.group.items.length}</span><svg className={`size-4 text-faint ${expanded.includes(row.group.id) ? 'rotate-90' : ''}`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 5 7 7-7 7" /></svg></>}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {hoveredConcern && typeof document !== 'undefined' ? createPortal(
        <div id={`source-line-${hoveredConcern.line}-issue`} className="fixed z-50 max-h-64 w-64 overflow-x-clip overflow-y-auto rounded-md border border-line-strong bg-popup-bg p-3 text-xs text-popup-text shadow-(--editor-popup-shadow) scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" style={{ top: hoveredConcern.top, left: hoveredConcern.left }} role="tooltip" onMouseEnter={cancelTooltipClose} onMouseLeave={scheduleTooltipClose}>
          <div className="flex items-center gap-2 font-semibold data-[severity=warning]:text-warning data-[severity=error]:text-danger" data-severity={hoveredConcern.concern.severity}>
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></svg>
            <span>第 {hoveredConcern.line} 行 · {hoveredConcern.concern.severities ? '错误与警告' : hoveredConcern.concern.severity === 'error' ? '错误' : '警告'}</span>
          </div>
          <ul className="mt-2 grid gap-1 pl-6">{(hoveredConcern.concern.messageLevels ?? hoveredConcern.concern.messages.map(message => ({ message, severity: hoveredConcern.concern.severity }))).map(({ message, severity }) => <li key={`${severity}:${message}`} className="break-words data-[severity=warning]:text-warning data-[severity=error]:text-danger" data-severity={severity}>{message}</li>)}</ul>
        </div>, document.body) : null}
    </div>
  );
});
