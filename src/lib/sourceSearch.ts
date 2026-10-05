export type SourceMatch = { start: number; end: number };
function literalPattern(query: string, matchCase: boolean): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu');
}
export function findSourceMatches(source: string, query: string, matchCase = false): SourceMatch[] {
  if (!query) return [];
  return [...source.matchAll(literalPattern(query, matchCase))].map(match => ({ start: match.index!, end: match.index! + match[0].length }));
}
export function replaceAllSourceMatches(source: string, query: string, replacement: string, matchCase = false): string {
  return query ? source.replace(literalPattern(query, matchCase), () => replacement) : source;
}
