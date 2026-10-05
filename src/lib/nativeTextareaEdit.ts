type ManagedInsertion = (text: string, start: number, end: number) => boolean;
const managedEditors = new WeakMap<HTMLTextAreaElement, ManagedInsertion>();

export function registerUndoableTextEditor(textarea: HTMLTextAreaElement, insert: ManagedInsertion): () => void {
  managedEditors.set(textarea, insert);
  return () => { if (managedEditors.get(textarea) === insert) managedEditors.delete(textarea); };
}

export function insertUndoableText(
  textarea: HTMLTextAreaElement,
  text: string,
  start: number,
  end: number,
  reportedValue: () => string,
  restoreValue: (value: string) => void,
): boolean {
  const managed = managedEditors.get(textarea);
  if (managed) return managed(text, start, end);
  const previous = textarea.value;
  const expected = previous.slice(0, start) + text + previous.slice(end);
  textarea.focus();
  textarea.setSelectionRange(start, end);
  let inserted = false;
  try { inserted = textarea.ownerDocument.execCommand('insertText', false, text); } catch { /* report failure without bypassing undo */ }
  if (inserted && textarea.value === expected && reportedValue() === expected) return true;
  if (textarea.value !== previous) {
    try { textarea.ownerDocument.execCommand('undo'); } catch { /* restore the controlled source below */ }
  }
  if (textarea.value !== previous) textarea.value = previous;
  if (reportedValue() !== previous) restoreValue(previous);
  textarea.setSelectionRange(start, end);
  return false;
}
