import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { remarkHeadingIds, rehypeAlignSanitizedFragmentLinks } from '../articleTableOfContents';
import { remarkArticleBlankParagraphs, remarkArticleSoftBreaks, rehypeArticleSourcePositions } from '../articleBlankParagraphs';
import { rehypeArticleCodeHighlight, rehypeArticleCodeWhitespace } from '../articleCodeHighlight';
import { SAFE_REHYPE_SCHEMA, rehypeSafeStyles } from './sanitize';
import { getFormatSnapshot, type FormatSnapshot } from './runtime';

export function articleMarkdownPlugins(): PluggableList {
  return [remarkGfm, remarkHeadingIds, remarkArticleBlankParagraphs, remarkArticleSoftBreaks];
}
export function articleHtmlPlugins(snapshot: FormatSnapshot = getFormatSnapshot()): PluggableList {
  return [rehypeRaw, rehypeAlignSanitizedFragmentLinks, [rehypeSanitize, SAFE_REHYPE_SCHEMA], ...(snapshot.bundle.formatter.codeHighlight.enabled ? [rehypeArticleCodeHighlight] : []), rehypeArticleCodeWhitespace, rehypeSafeStyles, rehypeArticleSourcePositions];
}
