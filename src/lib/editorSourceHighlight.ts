export type EditorSourceTone = 'syntax' | 'heading' | 'quote';
export type EditorSourceSegment = { text: string; tone?: EditorSourceTone };

export function tokenizeEditorSource(value: string): EditorSourceSegment[] {
  const output: EditorSourceSegment[] = [];
  let fenced = false;
  value.split('\n').forEach((line, index, lines) => {
    const fence = /^\s*(?:`{3,}|~{3,})/.test(line);
    const heading = !fenced && !fence ? line.match(/^(#{1,6})(\s+)(.*)$/) : null;
    const quote = !fenced && !fence && !heading ? line.match(/^(\s*>\s?)(.*)$/) : null;
    const list = !fenced && !fence && !heading && !quote ? line.match(/^(\s*(?:[-*+]|\d+\.))(\s+)(.*)$/) : null;
    if (heading) output.push({ text: heading[1], tone: 'syntax' }, { text: heading[2] }, { text: heading[3], tone: 'heading' });
    else if (quote) output.push({ text: quote[1], tone: 'syntax' }, { text: quote[2], tone: 'quote' });
    else if (list) output.push({ text: list[1], tone: 'syntax' }, { text: list[2] }, { text: list[3] });
    else output.push({ text: line });
    if (index < lines.length - 1) output.push({ text: '\n' });
    if (fence) fenced = !fenced;
  });
  return output;
}
