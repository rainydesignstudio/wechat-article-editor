export type TextSelection = { start: number; end: number; direction?: 'forward' | 'backward' | 'none' };
export type TextSnapshot = { value: string; selection: TextSelection };
type Edit = { start: number; removed: string; inserted: string; before: TextSelection; after: TextSelection };

const groupedTypes = new Set(['insertText', 'deleteContentBackward', 'deleteContentForward']);
const sameSelection = (a: TextSelection, b: TextSelection) => a.start === b.start && a.end === b.end && a.direction === b.direction;
const cost = (edit: Edit) => edit.removed.length + edit.inserted.length;

function difference(before: string, after: string, selectionBefore: TextSelection, selectionAfter: TextSelection): Edit {
  let start = 0, oldEnd = before.length, newEnd = after.length;
  while (start < oldEnd && start < newEnd && before[start] === after[start]) start++;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  return { start, removed: before.slice(start, oldEnd), inserted: after.slice(start, newEnd), before: { ...selectionBefore }, after: { ...selectionAfter } };
}

/** A control owns its history. Records retain edited spans, not a full document per keystroke. */
export class TextInputHistory {
  value: string;
  private past: Edit[] = [];
  private future: Edit[] = [];
  private group: { type: string; time: number } | null = null;
  private retained = 0;
  private maxRecords: number;
  private maxCharacters: number;

  constructor(value: string, maxRecords = 200, maxCharacters = 2_000_000) { this.value = value; this.maxRecords = maxRecords; this.maxCharacters = maxCharacters; }

  reset(value: string) { this.value = value; this.past = []; this.future = []; this.retained = 0; this.breakGroup(); }
  breakGroup() { this.group = null; }
  finishTransaction(selection: TextSelection) { const last = this.past.at(-1); if (last && !this.group) last.after = { ...selection }; }

  record(next: string, before: TextSelection, after: TextSelection, type = 'transaction', time = Date.now()) {
    if (next === this.value) return;
    const last = this.past.at(-1);
    const merge = last && this.group?.type === type && groupedTypes.has(type) && time - this.group.time <= 1000
      && before.start === before.end && sameSelection(last.after, before);
    let previous = this.value, firstSelection = before;
    if (merge) {
      previous = previous.slice(0, last.start) + last.removed + previous.slice(last.start + last.inserted.length);
      firstSelection = last.before;
      this.past.pop(); this.retained -= cost(last);
    }
    const edit = difference(previous, next, firstSelection, after);
    this.retained -= this.future.reduce((total, item) => total + cost(item), 0);
    this.future = [];
    this.past.push(edit); this.retained += cost(edit);
    this.value = next;
    this.group = groupedTypes.has(type) ? { type, time } : null;
    while (this.past.length > 1 && (this.past.length > this.maxRecords || this.retained > this.maxCharacters)) this.retained -= cost(this.past.shift()!);
  }

  undo(): TextSnapshot | null {
    this.breakGroup();
    const edit = this.past.pop();
    if (!edit) return null;
    this.value = this.value.slice(0, edit.start) + edit.removed + this.value.slice(edit.start + edit.inserted.length);
    this.future.push(edit);
    return { value: this.value, selection: { ...edit.before } };
  }

  redo(): TextSnapshot | null {
    this.breakGroup();
    const edit = this.future.pop();
    if (!edit) return null;
    this.value = this.value.slice(0, edit.start) + edit.inserted + this.value.slice(edit.start + edit.removed.length);
    this.past.push(edit);
    return { value: this.value, selection: { ...edit.after } };
  }
}

export function textHistoryShortcut(event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }): 'undo' | 'redo' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  return key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey ? 'redo' : null;
}
