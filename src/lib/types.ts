export type DiagnosticLevel = 'error' | 'warning' | 'info';

export type ArticleDiagnostic = {
  level: DiagnosticLevel;
  message: string;
  line?: number;
};

export type ArticleMeta = {
  title: string;
  description: string;
  author: string;
  categories: string[];
  createdAt: string;
  updatedAt: string;
  theme: {
    id: string;
    version: string;
  };
  [key: string]: unknown;
};

export type ParsedArticle = {
  source: string;
  body: string;
  metadata: ArticleMeta;
  hasFrontMatter: boolean;
  frontMatterRange: { start: number; end: number } | null;
  diagnostics: ArticleDiagnostic[];
  canCopy: boolean;
};

export type ArticleThemeConfig = {
  kind?: 'article-theme';
  id: string;
  name: string;
  version: string;
  formatVersion: number;
  tokens: Record<string, string>;
  css: string;
  nodes?: Partial<Record<ThemeNodeKey, ThemeNodeOverrides>>;
};

export type ThemeConfig = ArticleThemeConfig;

export type ThemeNodeKey =
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'paragraph' | 'blockquote' | 'inlineCode' | 'codeBlock' | 'table' | 'caption' | 'divider';

export type ThemeNodeOverrides = {
  fontSize?: string;
  lineHeight?: string;
  color?: string;
};

export type ArticleSnippet = {
  id: string;
  name: string;
  trigger: string;
  description: string;
  content: string;
  categoryId?: string;
  icon?: SnippetCategoryIcon;
};

export type SnippetCategoryIcon = 'snippet' | 'folder' | 'book' | 'document' | 'bookmark' | 'layers' | 'quote' | 'image' | 'table' | 'code' | 'sparkles' | 'tag';
export type ContentCategory = { id: string; name: string; description: string; order: number; icon?: SnippetCategoryIcon };
export type SnippetCategory = ContentCategory;

export type ArticleTemplate = {
  id: string;
  name: string;
  source: string;
  categoryId?: string;
  icon?: SnippetCategoryIcon;
};

export type WorkingArticle = {
  source: string;
  folder: string | null;
  month: string | null;
  theme: ThemeConfig;
  themeValid: boolean;
  dirty: boolean;
};

export type StoredArticle = {
  id: string;
  folder: string;
  month: string;
  source: string;
  theme: ThemeConfig;
  filePath: string;
  parse: ParsedArticle;
  themeValid: boolean;
};

// List entries deliberately contain no body or theme CSS. Open/check operations read the document.
export type ArticleSummary = Pick<StoredArticle, 'id' | 'folder' | 'month' | 'filePath'> & {
  parse: Pick<ParsedArticle, 'metadata' | 'diagnostics'>;
  theme: Pick<ThemeConfig, 'id' | 'name' | 'version'>;
  indexState?: 'ready' | 'repair-needed';
};

export type ArticleIndexIssue = { month: string; message: string };

export type SaveResult = {
  article: StoredArticle;
  sourceSaved: boolean;
  indexUpdated: boolean;
  indexError?: string;
};
