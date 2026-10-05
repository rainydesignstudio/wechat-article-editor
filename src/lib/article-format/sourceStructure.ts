import { Tokenizer, TokenizerMode, type TokenHandler } from 'parse5';
import { articleHtmlSourceMask } from '../articleMarkupValidation';
import { standardFormatIssue, type ArticleFormatIssue } from '../articleFormat';
import { SOURCE_STRUCTURE_SELECTOR } from './contracts';
import { getFormatSnapshot } from './runtime';

type RawNode = { tag: string; attributes: Set<string>; line: number };
type SourceTree = { type: string; children?: SourceTree[]; position?: { start?: { offset?: number }; end?: { offset?: number } } };
const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const matches = (node: RawNode, selector: string) => {
  const match = SOURCE_STRUCTURE_SELECTOR.exec(selector);
  return Boolean(match && node.tag === match[1] && (!match[2] || node.attributes.has(match[2])));
};
// Inspect the authored token chain before Markdown's generated paragraphs and the
// HTML parser can repair prohibited nesting. Tokenization/masking is shared with syntax checks.
export function inspectSourceStructure(source: string, tree: SourceTree, label: string): ArticleFormatIssue[] {
  const rules = getFormatSnapshot().bundle.validator.rules.filter(rule => rule.enabled && rule.stages.includes('authoring') && ['dom.leaf-content', 'dom.nodeleaf-content'].includes(rule.operator));
  if (!rules.length) return [];
  const stack: RawNode[] = [], issues: ArticleFormatIssue[] = [];
  const report = (rule: (typeof rules)[number], node: RawNode, detail?: string, review = false) => {
    if (issues.some(issue => issue.ruleId === rule.id && issue.line === node.line)) return;
    const issue = standardFormatIssue(rule, label, node.line, detail); if (review) issue.tier = 'warning'; issues.push(issue);
  };
  const handler: TokenHandler = {
    onStartTag(token) {
      const node = { tag: token.tagName, attributes: new Set(token.attrs.map(attr => attr.name)), line: token.location?.startLine ?? 1 };
      for (const rule of rules) {
        const p = rule.parameters;
        if (rule.operator === 'dom.leaf-content') {
          for (const parent of stack) if (matches(parent, String(p.selector)) && (p.blockElements as string[]).includes(node.tag)) report(rule, parent);
        } else {
          const parent = stack.at(-1);
          if (!parent || !matches(parent, String(p.selector))) continue;
          if ((p.disallowedElements as string[]).includes(node.tag)) report(rule, parent);
          else if (!(p.allowedElements as string[]).includes(node.tag)) report(rule, parent, '组件未在当前白名单中，需核对。', p.unknownComponents === 'review');
        }
      }
      if (!voidTags.has(node.tag) && !token.selfClosing) stack.push(node);
      tokenizer.inForeignNode = stack.some(item => ['svg', 'math'].includes(item.tag));
      if (node.tag === 'script') tokenizer.state = TokenizerMode.SCRIPT_DATA;
      else if (['style', 'xmp', 'iframe', 'noembed', 'noframes'].includes(node.tag)) tokenizer.state = TokenizerMode.RAWTEXT;
    },
    onEndTag(token) { const index = stack.findLastIndex(node => node.tag === token.tagName); if (index >= 0) stack.splice(index); tokenizer.inForeignNode = stack.some(node => ['svg', 'math'].includes(node.tag)); },
    onCharacter(token) { if (!token.chars.trim()) return; const node = stack.at(-1); if (!node) return; for (const rule of rules) if (rule.operator === 'dom.nodeleaf-content' && matches(node, String(rule.parameters.selector))) report(rule, node); },
    onWhitespaceCharacter() {}, onNullCharacter() {}, onComment() {}, onDoctype() {}, onEof() {}, onParseError() {},
  };
  const tokenizer = new Tokenizer({ sourceCodeLocationInfo: true }, handler);
  tokenizer.write(articleHtmlSourceMask(source, tree), true);
  return issues;
}
