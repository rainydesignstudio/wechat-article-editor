'use client';

import { useLayoutEffect, useRef, type ChangeEvent, type CompositionEvent, type KeyboardEvent, type RefObject } from 'react';
import { registerUndoableTextEditor } from '../lib/nativeTextareaEdit';
import { TextInputHistory, textHistoryShortcut, type TextSelection, type TextSnapshot } from '../lib/textInputHistory';

type Control = HTMLInputElement | HTMLTextAreaElement;
const selectionOf = (control: Control): TextSelection => ({ start: control.selectionStart ?? 0, end: control.selectionEnd ?? 0, direction: control.selectionDirection ?? 'none' });

export function useTextInputHistory<T extends Control>(ref: RefObject<T | null>, value: string, onChange: (value: string) => void, readOnly = false) {
  const history = useRef<TextInputHistory | null>(null);
  if (!history.current) history.current = new TextInputHistory(value);
  const selection = useRef<TextSelection>({ start: 0, end: 0, direction: 'none' });
  const beforeInput = useRef<{ selection: TextSelection; type: string } | null>(null);
  const composition = useRef<TextSelection | null>(null);
  const finishableInsertion = useRef(false);
  const latest = useRef({ onChange, readOnly });
  latest.current = { onChange, readOnly };

  useLayoutEffect(() => { if (!composition.current && value !== history.current!.value) history.current!.reset(value); }, [value]);

  const apply = (snapshot: TextSnapshot | null) => {
    const control = ref.current;
    if (!control || !snapshot) return;
    control.value = snapshot.value;
    control.setSelectionRange(snapshot.selection.start, snapshot.selection.end, snapshot.selection.direction);
    selection.current = snapshot.selection;
    beforeInput.current = null;
    latest.current.onChange(snapshot.value);
  };
  const replay = (action: 'undo' | 'redo') => {
    if (latest.current.readOnly || ref.current?.disabled || ref.current?.readOnly || composition.current) return;
    apply(history.current![action]());
  };
  const insert = (text: string, start: number, end: number) => {
    const control = ref.current;
    if (!control || control.disabled || control.readOnly || latest.current.readOnly || composition.current) return false;
    control.focus();
    const before = { start, end, direction: 'none' as const };
    control.setRangeText(text, start, end, 'end');
    const after = selectionOf(control);
    finishableInsertion.current = control.value !== history.current!.value;
    history.current!.record(control.value, before, after);
    selection.current = after; beforeInput.current = null;
    latest.current.onChange(control.value);
    return true;
  };

  useLayoutEffect(() => {
    const control = ref.current;
    if (!control) return;
    const document = control.ownerDocument;
    const handleBeforeInput = (event: Event) => {
      if (document.activeElement !== control) return;
      const input = event as InputEvent;
      if (input.inputType === 'historyUndo' || input.inputType === 'historyRedo') {
        if (composition.current) { if (event.target !== control) event.preventDefault(); return; }
        // Menu commands use beforeinput, and can otherwise target another control's native history.
        event.preventDefault();
        replay(input.inputType === 'historyUndo' ? 'undo' : 'redo');
        return;
      }
      beforeInput.current = { selection: selectionOf(control), type: input.inputType };
    };
    document.addEventListener('beforeinput', handleBeforeInput, true);
    const unregister = control.tagName === 'TEXTAREA' ? registerUndoableTextEditor(control as HTMLTextAreaElement, insert) : undefined;
    return () => { document.removeEventListener('beforeinput', handleBeforeInput, true); unregister?.(); };
  }, [ref]);

  const events = {
    onChange(event: ChangeEvent<T>) {
      finishableInsertion.current = false;
      const control = event.currentTarget, after = selectionOf(control);
      if (!composition.current) {
        const inputType = (event.nativeEvent as InputEvent | undefined)?.inputType;
        if (inputType === 'historyUndo' || inputType === 'historyRedo') {
          // Restore our own state if a browser emits a non-cancellable native history input.
          apply({ value: history.current!.value, selection: selection.current });
          return;
        }
        history.current!.record(control.value, beforeInput.current?.selection ?? selection.current, after, beforeInput.current?.type ?? inputType ?? 'transaction');
      }
      beforeInput.current = null; selection.current = after;
      latest.current.onChange(control.value);
    },
    onKeyDown(event: KeyboardEvent<T>) {
      if (event.defaultPrevented || event.nativeEvent.isComposing || composition.current || event.keyCode === 229) return;
      const action = textHistoryShortcut(event);
      if (action) { event.preventDefault(); event.stopPropagation(); replay(action); }
      else if (/^(Arrow|Home$|End$|PageUp$|PageDown$)/.test(event.key)) history.current!.breakGroup();
    },
    onSelect(event: { currentTarget: T }) {
      const next = selectionOf(event.currentTarget);
      if (next.start !== selection.current.start || next.end !== selection.current.end) history.current!.breakGroup();
      selection.current = next;
    },
    onBlur() { history.current!.breakGroup(); },
    onCompositionStart(event: CompositionEvent<T>) { composition.current = selectionOf(event.currentTarget); history.current!.breakGroup(); },
    onCompositionEnd(event: CompositionEvent<T>) {
      const before = composition.current;
      composition.current = null;
      if (!before) return;
      const control = event.currentTarget, after = selectionOf(control);
      history.current!.record(control.value, before, after);
      selection.current = after; beforeInput.current = null;
      latest.current.onChange(control.value);
    },
  };
  return { events, finishInsertion() { if (ref.current && finishableInsertion.current) { selection.current = selectionOf(ref.current); history.current!.finishTransaction(selection.current); finishableInsertion.current = false; } } };
}
