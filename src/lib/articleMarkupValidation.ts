import { html, Tokenizer, TokenizerMode, type TokenHandler } from 'parse5';
import type { ArticleFormatIssue } from './articleFormat';

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};
type Range = [number, number];
type OpenTag = { name: string; line: number; reported: boolean };

const VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const OPTIONAL_END_TAGS = new Set('html head body p li dt dd rt rp option optgroup colgroup thead tbody tfoot tr td th'.split(' '));
const P_CLOSING_STARTS = new Set('address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section table ul'.split(' '));
const KNOWN_TAGS = new Set<string>(Object.values(html.TAG_NAMES));
const SYNTAX_ERRORS: Record<string, string> = {
  'eof-in-tag': '标签不完整，或属性引号未闭合',
  'eof-before-tag-name': '标签缺少名称',
  'missing-end-tag-name': '闭合标签缺少名称',
  'end-tag-with-attributes': '闭合标签不能带属性或正文',
  'end-tag-with-trailing-solidus': '闭合标签不能使用自闭合写法',
  'unexpected-solidus-in-tag': '标签中的斜杠位置错误',
  'invalid-first-character-of-tag-name': '标签名称开头无效',
  'unexpected-equals-sign-before-attribute-name': '属性缺少名称',
  'unexpected-character-in-attribute-name': '属性名称含无效字符',
  'unexpected-character-in-unquoted-attribute-value': '属性值含无效字符，请检查引号',
  'missing-attribute-value': '属性缺少值',
  'missing-whitespace-between-attributes': '属性之间缺少空格',
  'duplicate-attribute': '标签包含重复属性',
  'eof-in-comment': 'HTML 注释未闭合',
  'eof-in-doctype': 'DOCTYPE 声明未闭合',
};

export function articleHtmlSourceMask(source: string, tree: MarkdownNode): string {
  const raw: Range[] = [], protectedRanges: Range[] = [];
  const visit = (node: MarkdownNode) => {
    const start = node.position?.start?.offset, end = node.position?.end?.offset;
    if (start !== undefined && end !== undefined) {
      if (node.type === 'html') raw.push([start, end]);
      if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'link' && source[start] === '<') {
        protectedRanges.push([start, end]);
      }
      if (['link', 'image', 'definition'].includes(node.type)) {
        const text = source.slice(start, end);
        const destination = node.type === 'definition' ? /\]:\s*(<[^>\r\n]*>)/.exec(text) : /\]\(\s*(<[^>\r\n]*>)/.exec(text);
        if (destination) {
          const offset = start + destination.index + destination[0].indexOf('<');
          protectedRanges.push([offset, offset + destination[1].length]);
        }
      }
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  const inside = (offset: number, ranges: Range[]) => ranges.some(([start, end]) => offset >= start && offset < end);
  // Markdown can treat an unfinished tag or an invalid closing tag as ordinary text.
  // Keep those candidates too, while leaving code, autolinks and escaped examples alone.
  for (const match of source.matchAll(/<\/?([a-z][\w:-]*)(?=[\s/>]|$)|<\/\s*>/gi)) {
    const start = match.index;
    if (inside(start, raw) || inside(start, protectedRanges)) continue;
    if (match[1] && !KNOWN_TAGS.has(match[1].toLowerCase()) && !match[0].startsWith('</')) continue;
    let slashes = 0;
    for (let offset = start - 1; offset >= 0 && source[offset] === '\\'; offset -= 1) slashes += 1;
    if (slashes % 2) continue;
    let quote = '', end = source.length;
    for (let offset = start + match[0].length; offset < source.length; offset += 1) {
      const character = source[offset];
      if (quote) { if (character === quote) quote = ''; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') { end = offset + 1; break; }
    }
    // The empty closing-tag candidate already includes its final angle bracket.
    if (match[0].endsWith('>')) end = start + match[0].length;
    raw.push([start, end]);
  }
  const masked = source.replace(/[^\r\n]/g, ' ').split('');
  for (const [start, end] of raw) for (let offset = start; offset < end; offset += 1) masked[offset] = source[offset];
  for (const [start, end] of protectedRanges) for (let offset = start; offset < end; offset += 1) {
    if (source[offset] !== '\r' && source[offset] !== '\n') masked[offset] = ' ';
  }
  return masked.join('');
}

export function validateArticleMarkup(source: string, tree: MarkdownNode, label: string): ArticleFormatIssue[] {
  const masked = articleHtmlSourceMask(source, tree);
  const issues: ArticleFormatIssue[] = [], stack: OpenTag[] = [];
  let lastTokenEnd = 0;
  const lineAt = (offset: number) => source.slice(0, offset).split(/\r\n|\r|\n/).length;
  const report = (name: string, line: number, message = name) => {
    if (!issues.some(issue => issue.name === name && issue.line === line)) {
      issues.push({ kind: 'element', name, source: `${label} · HTML 标签结构`, tier: 'danger', message, line });
    }
  };
  const markEnd = (token: { location: { endOffset: number } | null }) => { lastTokenEnd = token.location?.endOffset ?? lastTokenEnd; };
  const closeOptionalForStart = (name: string) => {
    const closes = (open: string) => open === 'p' && P_CLOSING_STARTS.has(name)
      || open === 'li' && name === 'li'
      || ['dt', 'dd'].includes(open) && ['dt', 'dd'].includes(name)
      || ['rt', 'rp'].includes(open) && ['rt', 'rp'].includes(name)
      || open === 'option' && ['option', 'optgroup'].includes(name)
      || open === 'optgroup' && name === 'optgroup'
      || ['td', 'th'].includes(open) && ['td', 'th', 'tr', 'thead', 'tbody', 'tfoot'].includes(name)
      || open === 'tr' && ['tr', 'thead', 'tbody', 'tfoot'].includes(name)
      || ['thead', 'tbody', 'tfoot'].includes(open) && ['thead', 'tbody', 'tfoot'].includes(name);
    while (stack.length && closes(stack.at(-1)!.name)) stack.pop();
  };
  const handler: TokenHandler = {
    onStartTag(token) {
      markEnd(token);
      closeOptionalForStart(token.tagName);
      const foreign = ['svg', 'math'].includes(token.tagName) || stack.some(item => ['svg', 'math'].includes(item.name));
      if (!VOID_TAGS.has(token.tagName) && !(token.selfClosing && foreign)) {
        const line = token.location?.startLine ?? 1;
        if (token.selfClosing) report(`<${token.tagName}/> 不能自闭合，应补充 </${token.tagName}>`, line);
        stack.push({ name: token.tagName, line, reported: token.selfClosing });
      }
      tokenizer.inForeignNode = stack.some(item => ['svg', 'math'].includes(item.name));
      if (token.tagName === 'script') tokenizer.state = TokenizerMode.SCRIPT_DATA;
      else if (['style', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript'].includes(token.tagName)) tokenizer.state = TokenizerMode.RAWTEXT;
      else if (['textarea', 'title'].includes(token.tagName)) tokenizer.state = TokenizerMode.RCDATA;
    },
    onEndTag(token) {
      markEnd(token);
      const line = token.location?.startLine ?? 1;
      if (VOID_TAGS.has(token.tagName)) { report(`空元素 <${token.tagName}> 不应有闭合标签 </${token.tagName}>`, line); return; }
      const index = stack.findLastIndex(item => item.name === token.tagName);
      if (index < 0) {
        const open = stack.at(-1);
        report(open ? `闭合标签 </${token.tagName}> 不匹配，当前应为 </${open.name}>` : `闭合标签 </${token.tagName}> 没有对应的开始标签`, line);
        if (open) open.reported = true;
        return;
      }
      const unclosed = stack.slice(index + 1).filter(item => !OPTIONAL_END_TAGS.has(item.name));
      if (unclosed.length) report(`闭合顺序错误：${unclosed.map(item => `<${item.name}>`).join('、')} 尚未闭合，就遇到 </${token.tagName}>`, line);
      stack.splice(index);
      tokenizer.inForeignNode = stack.some(item => ['svg', 'math'].includes(item.name));
    },
    onParseError(error) {
      const message = SYNTAX_ERRORS[error.code];
      if (!message) return;
      const relative = masked.slice(lastTokenEnd, error.startOffset).indexOf('<');
      const line = error.code.startsWith('eof-') && relative >= 0 ? lineAt(lastTokenEnd + relative) : error.startLine;
      report(message, line);
    },
    onEof() {
      for (const open of stack) if (!open.reported && !OPTIONAL_END_TAGS.has(open.name)) report(`<${open.name}> 未闭合，缺少 </${open.name}>`, open.line);
    },
    onComment: markEnd,
    onDoctype: markEnd,
    onCharacter: markEnd,
    onNullCharacter: markEnd,
    onWhitespaceCharacter: markEnd,
  };
  const tokenizer = new Tokenizer({ sourceCodeLocationInfo: true }, handler);
  tokenizer.write(masked, true);
  return issues;
}
