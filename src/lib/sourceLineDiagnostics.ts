import { articleFormatSeverity, type ArticleFormatIssue } from './articleFormat';

export type SourceLineConcern = {
  severity: 'warning' | 'error';
  messages: string[];
  severities?: ('warning' | 'error')[];
  messageLevels?: { message: string; severity: 'warning' | 'error' }[];
};

// A visual wrap inside the editor is still part of the same source line.
export function logicalSourceLines(source: string): string[] {
  return source.split(/\r\n|\r|\n/);
}

export function groupSourceLineIssues(issues: readonly ArticleFormatIssue[], lineCount: number): Map<number, SourceLineConcern> {
  const byLine = new Map<number, SourceLineConcern>();
  for (const issue of issues) {
    const severity = articleFormatSeverity(issue.tier);
    if (severity === 'safe') continue;
    const lines = issue.lines?.length ? issue.lines : issue.line ? [issue.line] : [];
    const subject = issue.source.startsWith('工具类 ') ? `${issue.source} · ${issue.name}` : issue.name;
    const message = subject === issue.message ? issue.message : `${subject}：${issue.message}`;
    for (const line of new Set(lines)) {
      if (!Number.isInteger(line) || line < 1 || line > lineCount) continue;
      const current: SourceLineConcern = byLine.get(line) ?? { severity, messages: [] };
      if (current.severity !== severity || current.severities) {
        current.severities = [...new Set([...(current.severities ?? [current.severity]), severity])];
        current.messageLevels ??= current.messages.map(message => ({ message, severity: current.severity }));
        if (!current.messageLevels.some(item => item.message === message && item.severity === severity)) current.messageLevels.push({ message, severity });
      }
      if (severity === 'error') current.severity = 'error';
      if (!current.messages.includes(message)) current.messages.push(message);
      byLine.set(line, current);
    }
  }
  return byLine;
}
