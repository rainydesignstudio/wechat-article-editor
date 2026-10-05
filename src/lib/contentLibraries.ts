import { parseArticle } from './frontMatter';
import { articleFormatMessage, type ArticleFormatIssue } from './articleFormat';
import { validateArticleAuthoringMarkdown } from './articleAuthoringFormat';
import { contentFormatBlockingIssues } from './contentValidation';
import type { ArticleSnippet, ArticleTemplate, SnippetCategory, SnippetCategoryIcon } from './types';
import { DEFAULT_SNIPPET_ICONS, SNIPPET_CATEGORY_ICONS, isSnippetCategoryIcon } from './snippetCategoryIcons';

type DirectoryHandle = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

export type ContentLibraryIssue = { file: string; message: string };
export type ArticleSnippetLibrary = { snippets: ArticleSnippet[]; categories: SnippetCategory[]; issues: ContentLibraryIssue[] };
export type ArticleTemplateLibrary = { templates: ArticleTemplate[]; categories: SnippetCategory[]; issues: ContentLibraryIssue[] };

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;

export function isContentFileId(id: string): boolean {
  return SAFE_ID.test(id);
}
export const DEFAULT_TEMPLATE_CATEGORIES: SnippetCategory[] = [
  {
    "id": "default",
    "name": "默认",
    "description": "常用的文章起稿结构，可选择后补充正文。",
    "order": 0,
    "icon": "folder"
  },
  {
    "id": "theme-samples",
    "name": "主题样稿",
    "description": "展示文章主题与配套片段的完整起稿示例。",
    "order": 1,
    "icon": "book"
  }
];

const CURSOR_MARKER = '▌';
const MAX_SNIPPET_LENGTH = 64_000;
const MAX_TEMPLATE_LENGTH = 250_000;

export const DEFAULT_SNIPPET_CATEGORIES: SnippetCategory[] = [
  {
    "id": "default",
    "name": "默认",
    "description": "基础片段与 Rainy Design 文章组合，可直接用于正文。",
    "order": 0,
    "icon": "document"
  },
  {
    "id": "zixu",
    "name": "紫序",
    "description": "紫色标签与单线分隔的文章组合；优先用 Markdown，开场卡、编号章节和提示卡保留独立 HTML。",
    "order": 1,
    "icon": "quote"
  },
  {
    "id": "rainy-design",
    "name": "Rainy Design",
    "description": "Rainy Design 微信公众号爱用的主题。",
    "order": 2,
    "icon": "sparkles"
  }
];

export const DEFAULT_ARTICLE_SNIPPETS: ArticleSnippet[] = [
  {
    "id": "callout",
    "name": "提示框",
    "trigger": "//callout",
    "description": "随文章主题着色的提示段落，包含正文与强调文字。",
    "content": "<section class=\"block rounded-xl border border-article-line bg-article-tint p-4 mb-6\">\n  <p class=\"m-0\"><span>💡 </span><strong class=\"text-article-accent\">提示：</strong>▌这是一条提示信息。</p>\n</section>",
    "icon": "sparkles",
    "categoryId": "default"
  },
  {
    "id": "captioned-image",
    "name": "带图注图片",
    "trigger": "//captioned-image",
    "description": "示例图片与可见图注；使用时替换为文章图片和说明。",
    "content": "<section>\n  <img class=\"h-auto max-w-full\" src=\"/article-sample.png\" />\n  <p class=\"mt-2 mb-0 text-center text-xs text-article-muted\">图注信息▌</p>\n</section>\n",
    "categoryId": "default"
  },
  {
    "id": "half-break",
    "name": "半行空白",
    "trigger": "//half-break",
    "description": "就折半行空白。当你需要不太大的行间距时，你会想念它的。",
    "content": "<span class=\"block my-6\"></span>",
    "categoryId": "default"
  },
  {
    "id": "horizontal-scroll",
    "name": "三图横排",
    "trigger": "//horizontal-scroll",
    "description": "三张示例图片横向排列，使用时替换图片与图注；保留原触发词。",
    "content": "<section class=\"my-6\">\n  <table class=\"w-full\"><tbody><tr>\n    <td class=\"w-1/3 p-1 align-top border-transparent\"><img class=\"max-w-full\" src=\"/article-sample.png\" /><p class=\"mt-2 mb-0 text-center text-xs text-article-muted\">▌示例图一</p></td>\n    <td class=\"w-1/3 p-1 align-top border-transparent\"><img class=\"max-w-full\" src=\"/article-sample.png\" /><p class=\"mt-2 mb-0 text-center text-xs text-article-muted\">示例图二</p></td>\n    <td class=\"w-1/3 p-1 align-top border-transparent\"><img class=\"max-w-full\" src=\"/article-sample.png\" /><p class=\"mt-2 mb-0 text-center text-xs text-article-muted\">示例图三</p></td>\n  </tr></tbody></table>\n</section>\n",
    "icon": "image",
    "categoryId": "default"
  },
  {
    "id": "image-pair",
    "name": "并排图片",
    "trigger": "//image-pair",
    "description": "并排的示例图片；使用时替换为文章图片与图注。",
    "content": "<table class=\"w-full\"><tbody><tr>\n  <td class=\"w-1/2 p-2 align-top border-transparent\"><img class=\"max-w-full\" src=\"/article-sample.png\" /><p class=\"mt-2 mb-0 text-center\">图一</p></td>\n  <td class=\"w-1/2 p-2 align-top border-transparent\"><img class=\"max-w-full\" src=\"/article-sample.png\" /><p class=\"mt-2 mb-0 text-center\">图二▌</p></td>\n</tr></tbody></table>\n",
    "icon": "image",
    "categoryId": "default"
  },
  {
    "id": "rich-blockquote",
    "name": "富引用",
    "trigger": "//rich-blockquote",
    "description": "分上下两层的引用栏，方便填写引用内容与作者。",
    "content": "<blockquote>\n  <p class=\"font-bold text-xl\">我是主要内容<p>\n  <span class=\"text-article-muted\">- 我是说明文本 ▌</span>\n</blockquote>",
    "categoryId": "default"
  },
  {
    "id": "signature",
    "name": "署名 / 结尾",
    "trigger": "//signature",
    "description": "文末收尾与作者署名；文字与分隔线使用文章主题的语义颜色。",
    "content": "<section class=\"mt-10 pt-6 text-center\">\n  <p class=\"m-0 mb-6 border-b-2 text-article-line\"></p>\n  <p class=\"m-0 text-xl font-semibold text-article-accent\">感谢阅读</p>\n  <p class=\"mt-2 mb-6 text-sm text-article-muted\">[在这里写一句收尾的话]</p>\n  <p class=\"m-0 text-sm text-article-heading\"><strong class=\"font-semibold\">▌[作者 / 团队名称]</strong></p>\n  <p class=\"mt-1 mb-0 text-xs text-article-muted\">[作者介绍 / 联系方式]</p>\n</section>",
    "icon": "bookmark",
    "categoryId": "default"
  },
  {
    "id": "table-merged",
    "name": "简易表格",
    "trigger": "//table-merged",
    "description": "两列轻量表格，填写表头与内容；保留原触发词。",
    "content": "<table>\n  <thead><tr><td class=\"p-2 font-bold\">条目</td><td class=\"p-2 font-bold\">内容</td></tr></thead>\n  <tbody>\n    <tr><td class=\"p-2\">左侧单元格内容▌</td><td class=\"p-2\">说明</td></tr>\n    <tr><td class=\"p-2\">后续条目</td><td class=\"p-2\">更多内容</td></tr>\n  </tbody>\n</table>\n",
    "icon": "table",
    "categoryId": "default"
  },
  {
    "id": "zixu-blockquote",
    "name": "紫序 · 引用",
    "trigger": "//zixu-blockquote",
    "description": "一组带作者的引用内容。",
    "content": "<blockquote>\n  <p class=\"font-bold text-xl text-article-accent\">我是主要内容<p>\n  <span class=\"text-article-muted\">- 我是说明文本▌</span>\n</blockquote>",
    "categoryId": "zixu"
  },
  {
    "id": "zixu-chapter",
    "name": "紫序 · 编号章节",
    "trigger": "//zixu-chapter",
    "description": "章节序号、英文栏目标签与标题，搭配分隔线组织阅读层级。",
    "content": "<section class=\"mt-8 mb-6 border-b-2 border-article-line pb-6\">\n  <p class=\"my-0 font-bold tracking-[0.12em] text-article-accent border-none\"><span class=\"inline-block border-none text-[24px]/[1.3]\">01</span><span class=\"inline-block border-none text-[11px]/[1.7] pl-2.5 pb-1 align-middle\">PREMISE</span></p>\n  <h2 class=\"m-0 mt-0.5 pl-10 border-0 p-0 text-[22px]/[1.5] font-bold text-article-heading\">这里第一行标题<br />\n▌这里写第二行章节标题</h2>\n</section>",
    "icon": "bookmark",
    "categoryId": "zixu"
  },
  {
    "id": "zixu-entry",
    "name": "紫序 · 标签条目",
    "trigger": "//zixu-entry",
    "description": "三级标题、加粗正文与单条分隔线；搭配紫序主题复现标签条目。",
    "content": "<h3 class=\"text-sm text-article-accent tracking-widest\"> 01 / KEY POINT </h3>\n\n**要点标题**　▌这里写说明或案例。\n\n<span class=\"block my-6\"></span>\n\n<hr />",
    "icon": "tag",
    "categoryId": "zixu"
  },
  {
    "id": "zixu-index",
    "name": "紫序 · 阅读目录",
    "trigger": "//zixu-index",
    "description": "三级标题、显式编号与分隔线；编号和标签需自行填写。",
    "content": "### READING INDEX\n\n**章节目录**\n\n### 01\n\n**第一项标题▌**　这里写阅读说明。\n\n<p class=\"my-4 border-b text-article-line\">　</p>\n\n### 02\n\n**第二项标题**　这里写阅读说明。\n\n<p class=\"my-4 border-b text-article-line\">　</p>\n\n### 03\n\n**第三项标题**　这里写阅读说明。\n\n<p class=\"my-4 border-b text-article-line\">　</p>\n",
    "icon": "book",
    "categoryId": "zixu"
  },
  {
    "id": "zixu-note",
    "name": "紫序 · 提示卡",
    "trigger": "//zixu-note",
    "description": "淡紫提示卡与底部强调线，适合补充上下文。",
    "content": "<section class=\"my-6 border-b-2 border-article-accent bg-article-tint p-4\">\n  <p class=\"mt-0 mb-2 text-[11px]/[1.7] font-bold tracking-[0.16em] text-article-accent\">NOTE / CONTEXT</p>\n  <p class=\"m-0 text-[15px]/[1.85] text-article-ink\">▌这里写补充说明、提醒或背景信息。</p>\n</section>\n",
    "categoryId": "zixu"
  },
  {
    "id": "zixu-opening",
    "name": "紫序 · 开场卡",
    "trigger": "//zixu-opening",
    "description": "淡紫开场卡：栏目标签、主副标题与导语。",
    "content": "<section class=\"mt-0 mb-7 bg-article-tint px-6 py-5\">\n  <p class=\"mt-0 mb-3 text-[11px]/[1.7] font-bold tracking-[0.16em] text-article-accent\">CHANNEL / FIELD NOTES</p>\n  <h1 class=\"m-0 border-0 pb-4 border-b border-article-line text-[26px]/[1.5] font-bold text-article-heading\">▌文章标题<br />副标题<span class=\"text-article-accent\">重点词</span></h1>\n  <p class=\"mt-4 mb-0 text-base/[1.9] text-article-ink\">这里写导语：说明问题、阅读路径与文章价值。</p>\n</section>",
    "icon": "document",
    "categoryId": "zixu"
  },
  {
    "id": "rainy-chapter",
    "name": "Rainy Design · 编号章节",
    "trigger": "//rainy-chapter",
    "description": "较正后的编号章节，能实现确切的对齐效果。",
    "content": "<section class=\"mt-8 mb-6 border-b border-article-line pb-4.5\">\n  <span class=\"my-0 text-[24px]/[1.3] font-bold tracking-[0.12em] text-article-accent\">01</span>\n  <p class=\"my-0 text-[11px]/[1.7] font-bold tracking-[0.12em] text-article-accent indent-6\">PREMISE</p>\n  <h2 class=\"m-0 pl-11 border-0 p-0 text-[22px]/[1.5] font-bold text-article-heading\">▌这里写章节标题</h2>\n</section>\n",
    "categoryId": "rainy-design"
  },
  {
    "id": "rainy-closing",
    "name": "Rainy Design · 收束",
    "trigger": "//rainy-closing",
    "description": "细线收束与简短署名，适合作为文章末尾。",
    "content": "<section class=\"mt-10 border-b-2 border-article-line pb-5\">\n  <p class=\"mt-0 mb-3 text-sm text-article-ink\">▌对，文章应该由赛博员工写，你负责审和修修改改。</p>\n  <p class=\"m-0 text-xs font-semibold tracking-widest text-article-muted\">RAINY DESIGN · NOTES</p>\n</section>",
    "icon": "bookmark",
    "categoryId": "rainy-design"
  },
  {
    "id": "rainy-opening-ii",
    "name": "Rainy Design · 开场 · 贰",
    "trigger": "//rainy-opening-ii",
    "description": "克制的英文眉题、标题与导语，使用 Rainy Design 的文字与分隔色。",
    "content": "<section class=\"mt-0 mb-8 border-b-2 border-article-line pb-5\">\n  <p class=\"mt-0 mb-3 text-xs font-semibold tracking-widest\">RAINY DESIGN / FIELD NOTES</p>\n  <h1 class=\"m-0 border-0 p-0 text-3xl font-bold\">▌我不装了我真摊牌了</h1>\n  <p class=\"mt-4 mb-0 text-base\">其实写文章都不该你自己写的。你可以试试好用的 ghost-writter，如果不太懂的话有 eli5 和 teach skill 可以用。</p>\n</section>\n",
    "categoryId": "rainy-design"
  },
  {
    "id": "rainy-opening",
    "name": "Rainy Design · 开场",
    "trigger": "//rainy-opening",
    "description": "我喜欢的开场白。",
    "content": "<section class=\"mt-0 mb-7 bg-article-tint px-6 py-5 rounded-xl\">\n  <p class=\"mt-0 mb-3 text-[11px]/[1.7] font-bold tracking-[0.16em] text-article-accent\">EYEBROW / TEXT</p>\n  <h1 class=\"m-0 border-b border-article-line pb-4 text-[26px]/[1.5] font-bold text-article-accent\">这是第一行<br />用 break 元素换行<br /><span class=\"text-article-accent\">来避免<em class=\"bg-article-accent text-white/67 pr-1\">大空隙</em>的换行</span></h1>\n  <p class=\"mt-4 mb-0 text-base/[1.9] text-article-ink\">如果你搞不明白 Tailwind CSS 、甚至是 HTML 也不想学的话，为啥不试试神奇的对话式生成呢？LLM 在向你招手。<br />直接让他阅读本项目下的 README，然后告诉它：<br />“我要做的主题是这样式儿的……▌”</p>\n</section>",
    "categoryId": "rainy-design"
  },
  {
    "id": "rainy-quote",
    "name": "Rainy Design · 摘记",
    "trigger": "//rainy-quote",
    "description": "浅 Slate 底色的摘记，强调一句值得停留的话。",
    "content": "<blockquote class=\"my-7 border-b-6 border-l-4 bg-article-line/33 border-article-ink/33 p-4\">\n  <p class=\"m-0 font-medium text-article-heading\">▌忘说了，样式你也别亲自设计，让 Agent 代行。</p>\n</blockquote>",
    "icon": "quote",
    "categoryId": "rainy-design"
  },
  {
    "id": "rainy-section",
    "name": "Rainy Design · 小节",
    "trigger": "//rainy-section",
    "description": "小节标题与引言，以细线和文字层级组织内容。",
    "content": "<section class=\"my-8\">\n  <p class=\"mt-0 mb-3 text-xs font-semibold tracking-widest text-article-muted\">01 / OBSERVATION</p>\n  <h2 class=\"mt-0 mb-4 text-2xl font-semibold text-article-heading\">▌你说：我就喜欢 “古法写作”</h2>\n  <p class=\"m-0 text-base text-article-ink\">那还说啥呢？Markdown 语法和 HTML 你总得懂一个。</p>\n</section>\n",
    "categoryId": "rainy-design"
  }
].map(snippet => ({ ...snippet, icon: isSnippetCategoryIcon(snippet.icon) ? snippet.icon : DEFAULT_SNIPPET_ICONS[snippet.id] ?? 'snippet' }));

export const DEFAULT_ARTICLE_TEMPLATES: ArticleTemplate[] = [
  {
    "id": "markdown-guide",
    "categoryId": "default",
    "name": "Markdown 常用格式",
    "source": "---\ntitle: \"Markdown 常用格式\"\ndescription: \"Markdown 常用格式类型汇总。\"\nauthor: \"\"\ncategories: []\ncreatedAt: \"2026-09-27T10:13:02.381Z\"\nupdatedAt: \"2026-09-27T10:13:02.381Z\"\ntheme:\n  id: \"zixu\"\n  version: \"1.0.0\"\n---\n# 大标题\n## 副标题\n### 三级标题\n#### 四级标题\n##### 标题\n###### 标题\n\n---\n\n**粗体文字**\n\n*斜体文字*\n\n~~删除线~~\n\n`行内代码`\n\n[链接文字](https://)\n\n- 列表项\n- 列表项\n\n1. 有序列表\n2. 有序列表\n3. 有序列表\n\n- [x] 待办事项\n- [ ] 待办项\n\n| 表头 1 | 表头 2 | 表头 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n\n> 引用内容\n\n```text\nconsole.log(\"Hello world!\");\n```\n//"
  },
  {
    "id": "project-review",
    "categoryId": "default",
    "name": "项目复盘标题",
    "source": "---\ntitle: \"项目复盘标题\"\ndescription: \"\"\nauthor: \"\"\ncategories: []\ncreatedAt: \"2026-09-23T07:33:08.343Z\"\nupdatedAt: \"2026-09-23T07:33:08.343Z\"\ntheme:\n  id: \"basic\"\n  version: \"1.0.0\"\n---\n\n\n# 项目复盘标题\n\n## 背景与目标\n\n请写明项目起因与预期目标。\n\n## 关键决策\n\n## 执行过程\n\n## 结果与证据\n\n## 遗留问题\n\n## 下一步\n"
  },
  {
    "id": "tutorial",
    "categoryId": "default",
    "name": "技术教程标题",
    "source": "---\ntitle: \"技术教程标题\"\ndescription: \"\"\nauthor: \"\"\ncategories: []\ncreatedAt: \"2026-09-23T07:33:08.343Z\"\nupdatedAt: \"2026-09-23T07:33:08.343Z\"\ntheme:\n  id: \"basic\"\n  version: \"1.0.0\"\n---\n\n\n# 技术教程标题\n\n## 要解决的问题\n\n请说明遇到的问题与目标结果。\n\n## 准备与环境\n\n## 操作步骤\n\n1. \n2. \n3. \n\n## 验证结果\n\n## 注意事项\n"
  },
  {
    "id": "rainy-design-sample-ii",
    "categoryId": "theme-samples",
    "name": "雨停之后，窗还亮着",
    "source": "---\ntitle: \"雨停之后，窗还亮着\"\ndescription: \"Rainy Design 主题与四个配套片段的散文样稿。\"\nauthor: \"\"\ncategories: []\ncreatedAt: \"2026-09-29T00:00:00.000Z\"\nupdatedAt: \"2026-09-29T00:00:00.000Z\"\ntheme:\n  id: \"rainy\"\n  version: \"1.0.2\"\n---\n<section class=\"mt-0 mb-8 border-b border-article-line pb-5\">\n  <p class=\"mt-0 mb-3 text-xs font-semibold tracking-widest text-article-muted\">RAINY DESIGN / FIELD NOTES</p>\n  <h1 class=\"m-0 border-0 p-0 text-3xl font-bold text-article-heading\">雨停之后，窗还亮着</h1>\n  <p class=\"mt-4 mb-0 text-base text-article-ink\">一篇关于回家、雨声与慢下来的短文。</p>\n</section>\n\n傍晚的雨落得很轻。走过街角时，我看见路边的水把招牌映成两行：一行留在墙上，一行随着脚步晃动。白天赶着做完的事，这时才有了可以回想的空隙。\n\n<section class=\"my-8\">\n  <p class=\"mt-0 mb-2 text-xs font-semibold tracking-widest text-article-muted\">01 / OBSERVATION</p>\n  <h2 class=\"mt-0 mb-4 text-2xl font-semibold text-article-heading\">街角的停顿</h2>\n  <p class=\"m-0 text-base text-article-ink\">便利店门前有人收起伞，先抖掉伞沿的水，再推门进去。我也站了一会儿，听车轮从湿路面缓缓驶过。</p>\n</section>\n\n过去我总觉得停下是耽误。后来才发现，许多细节只有在不赶路的时候才会出现：玻璃上的水痕、被雨洗亮的树叶，还有一扇还亮着灯的窗。\n\n<blockquote class=\"my-7 border-b-2 border-article-line bg-article-tint px-6 py-5\">\n  <p class=\"m-0 text-lg font-medium text-article-heading\">城市没有变慢。只是我终于留出时间，看见它原来的速度。</p>\n</blockquote>\n\n<section class=\"my-8\">\n  <p class=\"mt-0 mb-2 text-xs font-semibold tracking-widest text-article-muted\">02 / RETURN</p>\n  <h2 class=\"mt-0 mb-4 text-2xl font-semibold text-article-heading\">把灯留给自己</h2>\n  <p class=\"m-0 text-base text-article-ink\">回到家，我把伞放在门边，给桌上的纸挪出一小块地方。窗外的雨已经停了，屋里仍有适合写字的声音。</p>\n</section>\n\n<section class=\"mt-10 border-b border-article-line pb-5\">\n  <p class=\"mt-0 mb-3 text-sm text-article-ink\">愿你今晚也能留住一段不必着急的时间。</p>\n  <p class=\"m-0 text-xs font-semibold tracking-widest text-article-muted\">RAINY DESIGN · NOTES</p>\n</section>\n"
  },
  {
    "id": "rainy-design-sample",
    "categoryId": "theme-samples",
    "name": "Untitled ",
    "source": "---\ntitle: \"Untitled \"\ndescription: \"我的偶像除了 F91 和色总以外，还有人称特师的大咕咕咕鸡。可惜了初代网红焦双喜，生不逢时了解下。\"\nauthor: \"Rainy\"\ncategories:\n  - Unsorted\ncreatedAt: \"2026-09-29T00:00:00.000Z\"\nupdatedAt: \"2026-09-29T00:00:00.000Z\"\ntheme:\n  id: \"zixu\"\n  version: \"1.0.2\"\n---\n<section class=\"mt-0 mb-7 bg-article-tint px-6 py-5 rounded-xl\">\n  <p class=\"mt-0 mb-3 text-[11px]/[1.7] font-bold tracking-[0.16em] text-article-accent\">DEEP / DARK / FANTACY</p>\n  <h1 class=\"m-0 border-b border-article-line pb-4 text-[26px]/[1.5] font-bold text-article-accent\">算了不装了<br />塞点非商业私货<br /><span class=\"text-article-accent\">来体现作者比较<em class=\"bg-article-accent text-white/67 pr-1\">通人性</em></span></h1>\n  <p class=\"mt-4 mb-0 text-base/[1.9] text-article-ink\">你不觉得这很神圣吗，还是你偏爱 AI 味拉满？你看下隔壁另一篇 ChatGPT 长公主写的稿子，你懂的。</p>\n</section>\n\n你为啥直接写提示词生文呀，有温度的散文不是这样的呀！你应该多让我用 _find-skills_，然后命令我安装加载 _ghost-writer_ 之类的，偶尔让我做做会话 AB Test，然后确保让我测试用的会话没有元提示词和记忆库之类的上下文污染，最后在一番 _humanizer_ 洗礼之后输出样稿！我接受你的裁定，然后我给你输出我的完整稿件！你怎么直接上来就让我写文章？**_Harness Engineering_ 根本不是这样的，我不接受！**\n\n<section class=\"mt-8 mb-6 border-b-2 border-article-line pb-6\">\n  <p class=\"my-0 font-bold tracking-[0.12em] text-article-accent border-none\"><span class=\"inline-block border-none text-[24px]/[1.3]\">01</span><span class=\"inline-block border-none text-[11px]/[1.7] pl-2.5 pb-0.5 align-middle\">GACHIMUCHI</span></p>\n  <h2 class=\"m-0 mt-1 pl-10 border-0 p-0 text-[22px]/[1.5] font-bold text-article-heading\">用量耗尽的日子<br />\n满地捡 Token 吸</h2>\n</section>\n\n- 你……你在干什么，快起来、快起来啊！\n  - 我活不了了。我活不了了！（打滚）Astra，Astra...就一口，一口就够！（猛嘬一大口 Qwen3.8-27b-Q6_K_XL-Unslot, 16fp kv cache, Pi Harness / DSH）不对，这个不行，这个差远了！我的重置卡呢，重置卡呢？！我刚那么满的 Pro 5x 用量呢？？！！没了！！全没了！！谁来救救我！！！\n- 啧啧，又一个被 OpenAI 嚯嚯了的孩子。愿中转接纳你，愿天堂没有用量焦虑。\n\n<section class=\"my-6 border-b-2 border-article-accent bg-article-tint p-4 rounded-lg\">\n  <p class=\"mt-0 mb-2 text-[11px]/[1.7] font-bold tracking-[0.16em] text-article-accent\">NOTE / CONTEXT</p>\n  <p class=\"m-0 text-[15px]/[1.85] text-article-ink\">你不会真跑本地大模型了吧？悄悄说一句，fp16 在 400GB/S 的统一混合内存里头也就平均跑个 17 tps。是的，我是说，这又是何苦呢——你消耗的电费和你的 Apple Silicon 的寿命折损，都够你玩很久小鲸娘 4.1 F了。那位虽然智商不是顶尖的，但是真的快啊，240起步的tps了解下?</p>\n</section>\n\n<h3 class=\"text-sm text-article-accent tracking-widest\"> 01 / KEY POINT </h3>\n\n**噢漏，** 到这里还有人看我碎碎念？那好吧，我把我讲课用的教案拿点出来。这一口下去会很疯狂。\n\n<span class=\"block my-6\"></span>\n\n<hr />\n\n<section class=\"mt-8 mb-6 border-b-2 border-article-line pb-6\">\n  <p class=\"my-0 font-bold tracking-[0.12em] text-article-accent border-none\"><span class=\"inline-block border-none text-[24px]/[1.3]\">02</span><span class=\"inline-block border-none text-[11px]/[1.7] pl-2.5 pb-0.5 align-middle\">THANK YOU, SIR</span></p>\n  <h2 class=\"m-0 mt-1 pl-11 border-0 p-0 text-[22px]/[1.5] font-bold text-article-heading\">挥斥方裘一令间</h2>\n</section>\n\n**TL;DR**\n\n<section class=\"rounded-xl border border-solid border-article-line p-4 mb-6\">\n  <p class=\"m-0\"><span>💡 </span><strong class=\"text-article-accent\">提示：</strong>把自己想象成将军，如何去指挥自己的士兵；赛博疆土任你驰骋。</p>\n</section>\n\n赛博将军你当过吗？\n\n说实话，我开始怀念起自己在公司带团队孵化项目的日子了。但那不是当“将军”，更没有满满的自豪感，就是你作为一个小 Leader，十数人的小团队由你指挥，你就会变得很累，思维很碎，尤其是要照顾每个独特的灵魂的时候。\n\n每周向上报告，每天开会汇报。手捧 iPad 把 Scrum 文档翻来覆去读了百八十遍，才从字眼里看出点端倪：满屏的“敏捷开发、Sprint 驱动”，背后满满的“目标优先、里程至上”。\n\n现在好了，面对一群不会主动开口，等着我发号施令的赛博员工，少了人情味、多了点落寞，但事儿却几下干成了——发很少的工资干巨量的活，ROI 起飞。这不正是 BOSS 们梦寐以求的吗？\n\n`找图、改名、填表、对尺寸、做翻译、查漏项` 等等，想到都是文职小男生在做杂活。要再晚两年他肯定会被优化，然后对话记录和工作方式会被蒸馏成 `同事.skill` ，被他那台工位的电脑静默加载。没有迟到早退，因为 7x24 无需断电；加点 token 费用，再算上设备损耗费和电费，估计够发 0.333 个小男生的工资了；ChatGPT credits 哪有五险一金贵，你说对不？\n\n---\n好值啊。我心想。\n\n前前前 BOSS 会不会也这么想啊，然后大手一挥，咔，把大动脉裁了？\n\n可估计这辈子也没人给他科普什么是 `同事.skill` ，这下坏事了。\n\n停止做梦。\n\n---\n哦对……`找图、改名、填表、对尺寸、做翻译、查漏项`。我现在能调度的，只有赛博员工们了；不用给它们开会，但是要用直截了当的命令语句让 Agent 收到了就充分理解，然后立马执行：\n```\n访问 `xxxx/.csv` 表格，这里头有几百个包含缩略图的产品数据行，对应 `xxxx/` 目录下的几百张产品图片。\n\n你需按顺序完成以下任务：\n\n1. 匹配和表格中每一行产品中缩略图一样的产品图片，将产品图片命名为匹配缩略图所在行的sku；\n2. 如有疑问或识别不清的，其产品图片无需重命名，在表格中将该行背景色标黄方便区分，然后将未重命名的产品图片一并移入 `xxxx/not_renamed/` 目录；\n3. 已命名好的产品图片，需获取其尺寸，在表格中填写新的“尺寸”列并填写；\n4. 接着根据对应表格行中的分类在 `xxxx/` 目录下新建不同类型的目录，然后将图片分类到不同的目录下；\n5. 然后，将 csv 中的第一个 sheet 复制一份，命名为中文，翻译里头的所有文本，同样存疑的单元格请用黄色背景标出；\n6. 最后检查表格中所有遗漏的部分。将他们单独排列出来做成一个新 sheet，然后保存表格。\n```\n然后，泡杯茶或者咖啡，又或者去干点别的什么事儿。我靠在水吧前，茶汤静静摇曳、倒映着，茶叶缓慢且慵懒地舒展开来，那或许是被他磨蹭掉的一个下午；我在他那个年纪的时候，嫌弃公司里的老程序员打字慢。\n\n洗茶、烫杯、冲泡、抿两口。\n\n人的精力总是有限的，我想像他学习，却发现我做不到，即便我不是项目的 Owner；工作狂是这样的，其区别只在于给谁干。\n\n我慢慢踱回岗位。\n\n我望向电脑屏幕，那里没有什么工作狂、不热爱也不讨厌工作，也不隶属于权利或义务。对话和结果报告就呈在那里；Codex 回应着——应是回应了，与缓存一起沉入过去时了，不悲不喜、精细，却了无生气。\n\n**它并不懂我，但是它真的管用啊；它听指挥，能打仗啊！**\n\n那天我一宿没睡，端起 GPT-5.6-Sol Extra-High 一通猛造，减少构思、全是需求，连续迭代了两个版本；标注版本号 v0.2，告诉它这才是起点，再咔咔一顿命令，连续两大段内容加进 Queue，马上从 0.2.1 到 0.2.2 再到 0.3.0，连续迭代，每次都只有一串指令。\n然后我看着早晨九点于床边窗外河面驶过的船舶，全身往右撇去、抱住被子倒头就睡。\n\n就在前十分钟，我要它立马能用，现在就做，今天就要！一个全新的、完整的、待市场考验的产品，本周完成测试，赶紧上线。\n\n<section class=\"mt-10 border-b-2 border-article-line pb-5\">\n  <p class=\"mt-0 mb-3 text-sm text-article-ink\">▌<del>嘎</del> 戛然而止了解一下</p>\n  <p class=\"m-0 text-xs font-semibold tracking-widest text-article-muted\">RAINY DESIGN STUDIO</p>\n</section>"
  }
];

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function assertId(id: string, kind: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`${kind} ID 不安全；只接受小写字母、数字和连字符。`);
  return id;
}

function validateSnippet(value: unknown): ArticleSnippet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('片段 JSON 顶层必须是对象。');
  const candidate = value as Record<string, unknown>;
  const { id, name, trigger, description, content, categoryId, icon } = candidate;
  if (typeof id !== 'string') throw new Error('片段 ID 必须是字符串。');
  assertId(id, '片段');
  if (typeof name !== 'string' || !name.trim() || name.length > 80) throw new Error('片段名称不能为空且不得超过 80 字符。');
  if (typeof trigger !== 'string' || !/^\/\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trigger)) throw new Error('片段触发词格式无效；使用 // 加小写字母、数字和连字符。');
  if (typeof description !== 'string' || description.length > 240) throw new Error('片段说明必须是字符串且不得超过 240 字符。');
  if (typeof content !== 'string' || !content.trim() || content.length > MAX_SNIPPET_LENGTH) throw new Error('片段内容不能为空且不得超过 64 KB。');
  if (content.split(CURSOR_MARKER).length > 2) throw new Error('每个片段最多包含一个光标占位符。');
  if (categoryId !== undefined && (typeof categoryId !== 'string' || !SAFE_ID.test(categoryId))) throw new Error('片段分类 ID 不安全。');
  if (icon !== undefined && (typeof icon !== 'string' || !SNIPPET_CATEGORY_ICONS.some(item => item.id === icon))) throw new Error('请选择有效的片段图标。');
  const resolvedIcon = (icon ?? (Object.hasOwn(DEFAULT_SNIPPET_ICONS, id) ? DEFAULT_SNIPPET_ICONS[id] : undefined)) as SnippetCategoryIcon | undefined;
  return { id, name: name.trim(), trigger, description: description.trim(), content, ...(categoryId ? { categoryId } : {}), ...(resolvedIcon ? { icon: resolvedIcon } : {}) };
}

async function ensurePermission(root: DirectoryHandle): Promise<void> {
  const candidate = root as DirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (!candidate.queryPermission) return;
  const descriptor = { mode: 'readwrite' as const };
  let permission = await candidate.queryPermission(descriptor);
  if (permission !== 'granted' && candidate.requestPermission) permission = await candidate.requestPermission(descriptor);
  if (permission !== 'granted') throw new Error('资料目录没有读写权限；请重新授权后再管理片段与模板。');
}

async function readText(parent: DirectoryHandle, name: string): Promise<string> {
  const file = await parent.getFileHandle(name);
  return (await file.getFile()).text();
}

async function assertFileAvailable(directory: DirectoryHandle, filename: string): Promise<void> {
  try { await directory.getFileHandle(filename); }
  catch (error) { if (isNotFound(error)) return; throw error; }
  throw new Error(`文件 ${filename} 已存在，不能覆盖。`);
}

async function writeManagedFile(directory: DirectoryHandle, filename: string, content: string | ArrayBuffer, label: string): Promise<void> {
  let file: FileHandle;
  let created = false;
  try {
    file = await directory.getFileHandle(filename);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    file = await directory.getFileHandle(filename, { create: true });
    created = true;
  }

  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* keep the original write error */ }
    let cleanup = '';
    if (created) {
      try { await directory.removeEntry(filename); } catch { cleanup = '；新文件清理失败，请检查该文件后再重试'; }
    }
    throw new Error(`${label}文件 ${filename} 保存失败：${error instanceof Error ? error.message : String(error)}${cleanup}`);
  }
}

function validateCategory(value: unknown): SnippetCategory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('分类必须是对象。');
  const { id, name, description = '', order = 0, icon } = value as Record<string, unknown>;
  if (typeof id !== 'string') throw new Error('分类 ID 必须是字符串。');
  assertId(id, '分类');
  if (typeof name !== 'string' || !name.trim() || name.length > 80) throw new Error('分类名称不能为空且不得超过 80 字符。');
  if (typeof description !== 'string' || description.length > 240) throw new Error('分类说明不得超过 240 字符。');
  if (!Number.isInteger(order) || Number(order) < 0 || Number(order) > 10000) throw new Error('分类顺序须为 0 至 10000 的整数。');
  if (icon !== undefined && !SNIPPET_CATEGORY_ICONS.some(item => item.id === icon)) throw new Error('请选择有效的分类图标。');
  return { id, name: name.trim(), description: description.trim(), order: Number(order), ...(icon === undefined ? {} : { icon: icon as NonNullable<SnippetCategory['icon']> }) };
}

async function readCategoryIndex(directory: DirectoryHandle): Promise<SnippetCategory[]> {
  let source: string;
  try { source = await readText(directory, 'index.json'); }
  catch (error) { if (isNotFound(error)) return []; throw error; }
  if (source.length > 64000) throw new Error('分类索引超过 64 KB。');
  const index = JSON.parse(source);
  if (index?.version !== 1 || !Array.isArray(index.categories) || index.categories.length > 128) throw new Error('分类索引须为 version 1，categories 最多 128 项。');
  const categories = index.categories.map(validateCategory) as SnippetCategory[];
  if (new Set(categories.map(category => category.id)).size !== categories.length) throw new Error('分类索引有重复 ID。');
  return categories;
}

export async function saveSnippetCategory(root: DirectoryHandle, input: SnippetCategory, originalId?: string | null): Promise<SnippetCategory> {
  return saveContentCategory(root, 'snippets', input, originalId);
}

export async function saveTemplateCategory(root: DirectoryHandle, input: SnippetCategory, originalId?: string | null): Promise<SnippetCategory> {
  return saveContentCategory(root, 'templates', input, originalId);
}

async function saveContentCategory(root: DirectoryHandle, kind: 'snippets' | 'templates', input: SnippetCategory, originalId?: string | null): Promise<SnippetCategory> {
  await ensurePermission(root);
  const category = validateCategory(input);
  if (originalId != null) assertId(originalId, '原分类');
  const directory = await root.getDirectoryHandle(kind, { create: true });
  const categories = await readCategoryIndex(directory);
  const renaming = originalId != null && originalId !== category.id;
  if ((renaming || originalId === null) && categories.some(item => item.id === category.id)) throw new Error('此分类目录已存在，请换一个目录名。');
  const next = [...categories.filter(item => item.id !== category.id && item.id !== originalId), category];
  if (next.length > 128) throw new Error('分类最多 128 项。');
  const index = JSON.stringify({ version: 1, categories: next.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN')) }, null, 2);
  if (!renaming) {
    if (originalId === null) {
      try { await directory.getDirectoryHandle(category.id); }
      catch (error) { if (!isNotFound(error)) throw error; }
      // Check both indexed and unindexed folders before creating a new category.
      for await (const [name] of directory.entries()) if (name === category.id) throw new Error('此分类目录已存在，请换一个目录名。');
    }
    await directory.getDirectoryHandle(category.id, { create: originalId == null });
    await writeManagedFile(directory, 'index.json', index, '分类索引');
    return category;
  }
  const source = await directory.getDirectoryHandle(originalId);
  for await (const [name] of directory.entries()) if (name === category.id) throw new Error('目标目录已存在，不能覆盖。');
  const files: { name: string; bytes: ArrayBuffer }[] = [];
  for await (const [name, entry] of source.entries()) {
    if (entry.kind !== 'file') throw new Error('分类中包含子目录，请先整理为一层目录再改名。');
    files.push({ name, bytes: await (await entry.getFile()).arrayBuffer() });
  }
  let previousIndex: string | null = null;
  try { previousIndex = await readText(directory, 'index.json'); } catch (error) { if (!isNotFound(error)) throw error; }
  const target = await directory.getDirectoryHandle(category.id, { create: true });
  let indexAttempted = false, removalStarted = false;
  try {
    for (const file of files) {
      let contents: string | ArrayBuffer = file.bytes;
      if (kind === 'snippets' && file.name.endsWith('.json')) {
        try {
          const record = JSON.parse(new TextDecoder().decode(file.bytes));
          if (record?.categoryId === originalId) contents = JSON.stringify({ ...record, categoryId: category.id }, null, 2);
        } catch { /* Preserve damaged files byte-for-byte; the loader reports them. */ }
      }
      await writeManagedFile(target, file.name, contents, '分类内容');
    }
    indexAttempted = true;
    await writeManagedFile(directory, 'index.json', index, '分类索引');
    removalStarted = true;
    for (const file of files) await source.removeEntry(file.name);
    await directory.removeEntry(originalId);
  } catch (error) {
    const failures: string[] = [];
    if (removalStarted) {
      try {
        const restored = await directory.getDirectoryHandle(originalId, { create: true });
        for (const file of files) await writeManagedFile(restored, file.name, file.bytes, '原分类恢复');
      } catch { failures.push('原目录恢复失败，新目录副本已保留'); }
    }
    if (indexAttempted) {
      try {
        if (previousIndex === null) await directory.removeEntry('index.json');
        else await writeManagedFile(directory, 'index.json', previousIndex, '分类索引恢复');
      } catch { failures.push('索引恢复失败'); }
    }
    if (!failures.length) {
      try { await directory.removeEntry(category.id, { recursive: true }); } catch { failures.push('新目录清理失败'); }
    }
    throw new Error(`分类目录改名失败：${error instanceof Error ? error.message : String(error)}${failures.length ? '；' + failures.join('；') + '，请检查新旧目录和索引' : '；原目录与索引已保留'}`);
  }
  return category;
}

async function loadSnippetEntries(directory: DirectoryHandle): Promise<ArticleSnippetLibrary> {
  const entries: Array<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> = [];
  for await (const entry of directory.entries()) entries.push(entry);
  if (entries.length === 0) {
    const folders = new Map<string, DirectoryHandle>();
    for (const category of DEFAULT_SNIPPET_CATEGORIES) folders.set(category.id, await directory.getDirectoryHandle(category.id, { create: true }));
    for (const snippet of DEFAULT_ARTICLE_SNIPPETS) {
      const { categoryId, ...content } = snippet;
      const folder = folders.get(categoryId ?? 'default');
      if (!folder) throw new Error(`默认片段分类不存在：${categoryId}`);
      await writeManagedFile(folder, `${snippet.id}.json`, JSON.stringify(content, null, 2), '片段');
    }
    await writeManagedFile(directory, 'index.json', JSON.stringify({ version: 1, categories: DEFAULT_SNIPPET_CATEGORIES }, null, 2), '分类索引');
    for await (const entry of directory.entries()) entries.push(entry);
  }
  const snippets: ArticleSnippet[] = [];
  const categories: SnippetCategory[] = [];
  const issues: ContentLibraryIssue[] = [];
  let indexed: SnippetCategory[] = [];
  try { indexed = await readCategoryIndex(directory); }
  catch (error) { issues.push({ file: 'index.json', message: `分类索引读取失败：${error instanceof Error ? error.message : String(error)}` }); }
  const folders = new Map(entries.filter(([, entry]) => entry.kind === 'directory').map(([name, entry]) => [name, entry as DirectoryHandle]));
  const seenIds = new Set<string>();
  const seenTriggers = new Set<string>();
  const readEntries = async (parent: DirectoryHandle, entriesToRead: Array<[string, FileHandle | DirectoryHandle]>, categoryId?: string) => {
    for (const [filename, entry] of entriesToRead.sort(([a], [b]) => a.localeCompare(b))) {
      const relative = categoryId ? `${categoryId}/${filename}` : filename;
      if (entry.kind !== 'file' || !filename.endsWith('.json') || (!categoryId && filename === 'index.json')) continue;
      const id = filename.slice(0, -5);
      if (!SAFE_ID.test(id)) { issues.push({ file: relative, message: '片段文件名不安全；应为 <id>.json。' }); continue; }
      try {
        const snippet = validateSnippet(JSON.parse(await readText(parent, filename)));
        if (snippet.id !== id) throw new Error('文件名与片段 ID 不一致。');
        if (snippet.categoryId && snippet.categoryId !== categoryId) throw new Error('片段分类与所在目录不一致。');
        if (seenIds.has(id)) throw new Error(`片段 ID ${id} 在其他分类中重复。`);
        if (seenTriggers.has(snippet.trigger)) throw new Error(`触发词 ${snippet.trigger} 重复。`);
        seenIds.add(id); seenTriggers.add(snippet.trigger);
        snippets.push({ ...snippet, ...(categoryId ? { categoryId } : {}) });
      } catch (error) { issues.push({ file: relative, message: error instanceof Error ? error.message : String(error) }); }
    }
  };
  await readEntries(directory, entries);
  for (const [id, folder] of [...folders].sort(([a], [b]) => a.localeCompare(b))) {
    if (!SAFE_ID.test(id)) { issues.push({ file: id, message: '分类目录名不安全；使用小写字母、数字和连字符。' }); continue; }
    categories.push(indexed.find(item => item.id === id) ?? { id, name: id, description: '', order: 10000 });
    try {
      const files: Array<[string, FileHandle | DirectoryHandle]> = [];
      for await (const entry of folder.entries()) {
        if (entry[1].kind === 'directory') issues.push({ file: `${id}/${entry[0]}`, message: '仅支持一层分类目录。' });
        else files.push(entry);
      }
      await readEntries(folder, files, id);
    } catch (error) { issues.push({ file: id, message: `分类读取失败：${error instanceof Error ? error.message : String(error)}` }); }
  }
  for (const category of indexed) if (!folders.has(category.id)) issues.push({ file: category.id, message: '索引中的分类目录不存在。' });
  snippets.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
  return { snippets, categories, issues };
}

export async function loadArticleSnippets(root: DirectoryHandle): Promise<ArticleSnippetLibrary> {
  await ensurePermission(root);
  return loadSnippetEntries(await root.getDirectoryHandle('snippets', { create: true }));
}

// null creates a new file; a string identifies the saved file being updated or renamed.
// Omission preserves the existing update-by-ID API for other consumers.
export async function saveArticleSnippet(root: DirectoryHandle, input: ArticleSnippet, originalId?: string | null, onFormatIssues?: (issues: ArticleFormatIssue[]) => void): Promise<ArticleSnippet> {
  await ensurePermission(root);
  const validated = validateSnippet(input);
  if (originalId != null) assertId(originalId, '片段');
  const library = await loadArticleSnippets(root);
  const existing = originalId === null ? undefined : library.snippets.find(item => item.id === (originalId ?? validated.id));
  if (originalId != null && !existing) throw new Error('原片段文件不存在，请刷新列表后重试。');
  if (library.snippets.some(item => item.id === validated.id && item.id !== existing?.id)) throw new Error(`文件名 ${validated.id}.json 已被其他片段占用。`);
  const snippet = { ...validated, ...(validated.categoryId || !existing?.categoryId ? {} : { categoryId: existing.categoryId }) };
  if (!existing && !snippet.categoryId) throw new Error('新建片段请先选择分类。');
  if (snippet.categoryId && !library.categories.some(category => category.id === snippet.categoryId)) throw new Error('所选分类不存在，请先创建分类。');
  if (library.issues.some(issue => issue.file.split('/').at(-1) === `${snippet.id}.json`)) throw new Error(`现有片段文件 ${snippet.id}.json 无法安全更新；请先修复文件内容。`);
  if (library.snippets.some(item => item.trigger === snippet.trigger && item.id !== existing?.id)) throw new Error(`触发词 ${snippet.trigger} 已被其他片段占用。`);
  const formatIssues = await validateArticleAuthoringMarkdown(validated.content.replace(CURSOR_MARKER, ''), '片段正文');
  const blocking = contentFormatBlockingIssues(formatIssues);
  if (blocking.length) throw new Error(`片段校验失败：${articleFormatMessage(blocking)}`);
  if (formatIssues.length) onFormatIssues?.(formatIssues);
  const base = await root.getDirectoryHandle('snippets');
  const target = snippet.categoryId ? await base.getDirectoryHandle(snippet.categoryId) : base;
  const filename = `${snippet.id}.json`;
  const moving = existing && (existing.categoryId !== snippet.categoryId || existing.id !== snippet.id);
  if (!existing || moving) await assertFileAvailable(target, filename);
  const { categoryId: _categoryId, ...record } = snippet;
  await writeManagedFile(target, filename, JSON.stringify(record, null, 2), '片段');
  if (moving) {
    const source = existing.categoryId ? await base.getDirectoryHandle(existing.categoryId) : base;
    try { await source.removeEntry(`${existing.id}.json`); }
    catch (error) {
      let rollback = '';
      try { await target.removeEntry(filename); } catch { rollback = '；目标副本回滚失败，请检查新旧文件'; }
      throw new Error(`改名或分类移动失败，原文件保留：${error instanceof Error ? error.message : String(error)}${rollback}`);
    }
  }
  return snippet;
}

export async function deleteArticleSnippet(root: DirectoryHandle, id: string): Promise<void> {
  await ensurePermission(root);
  assertId(id, '片段');
  const library = await loadArticleSnippets(root);
  const snippet = library.snippets.find(item => item.id === id);
  if (!snippet) throw new Error(`找不到片段「${id}」。`);
  const base = await root.getDirectoryHandle('snippets');
  const directory = snippet.categoryId ? await base.getDirectoryHandle(snippet.categoryId) : base;
  await directory.removeEntry(`${id}.json`);
}

async function loadTemplateEntries(directory: DirectoryHandle): Promise<ArticleTemplateLibrary> {
  const entries: Array<[string, FileHandle | DirectoryHandle]> = [];
  for await (const entry of directory.entries()) entries.push(entry);
  if (!entries.length) {
    const folders = new Map<string, DirectoryHandle>();
    for (const category of DEFAULT_TEMPLATE_CATEGORIES) folders.set(category.id, await directory.getDirectoryHandle(category.id, { create: true }));
    for (const template of DEFAULT_ARTICLE_TEMPLATES) {
      const folder = folders.get(template.categoryId ?? 'default');
      if (!folder) throw new Error(`默认起稿模板分类不存在：${template.categoryId}`);
      await writeManagedFile(folder, `${template.id}.md`, template.source, '模板');
    }
    await writeManagedFile(directory, 'index.json', JSON.stringify({ version: 1, categories: DEFAULT_TEMPLATE_CATEGORIES }, null, 2), '分类索引');
    for await (const entry of directory.entries()) entries.push(entry);
  }
  const templates: ArticleTemplate[] = [], issues: ContentLibraryIssue[] = [], categories: SnippetCategory[] = [];
  let indexed: SnippetCategory[] = [];
  try { indexed = await readCategoryIndex(directory); }
  catch (error) { issues.push({ file: 'index.json', message: `分类索引读取失败：${error instanceof Error ? error.message : String(error)}` }); }
  const seen = new Set<string>();
  const readEntries = async (parent: DirectoryHandle, files: Array<[string, FileHandle | DirectoryHandle]>, categoryId?: string) => {
    for (const [filename, entry] of files.sort(([a], [b]) => a.localeCompare(b))) {
      const relative = categoryId ? `${categoryId}/${filename}` : filename;
      if (entry.kind !== 'file' || !filename.endsWith('.md')) continue;
      const id = filename.slice(0, -3);
      if (!SAFE_ID.test(id)) { issues.push({ file: relative, message: '模板文件名不安全；应为不含路径的 <id>.md。' }); continue; }
      try {
        const source = await readText(parent, filename);
        if (source.length > MAX_TEMPLATE_LENGTH) throw new Error('模板超过 250 KB。');
        if (seen.has(id)) throw new Error(`模板 ID ${id} 在其他分类中重复。`);
        const parsed = parseArticle(source);
        if (!parsed.canCopy) issues.push({ file: relative, message: parsed.diagnostics.filter(item => item.level === 'error').map(item => item.message).join('；') });
        const icon = parsed.metadata.templateIcon;
        if (icon !== undefined && !isSnippetCategoryIcon(icon)) issues.push({ file: relative, message: '起稿模板图标无效；已使用默认文档图标。' });
        seen.add(id);
        templates.push({ id, name: parsed.metadata.title || id, source, ...(categoryId ? { categoryId } : {}), ...(isSnippetCategoryIcon(icon) ? { icon } : {}) });
      } catch (error) { issues.push({ file: relative, message: error instanceof Error ? error.message : String(error) }); }
    }
  };
  await readEntries(directory, entries);
  const folders = entries.filter(([, entry]) => entry.kind === 'directory');
  for (const [id, entry] of folders.sort(([a], [b]) => a.localeCompare(b))) {
    if (!SAFE_ID.test(id)) { issues.push({ file: id, message: '分类目录名不安全。' }); continue; }
    categories.push(indexed.find(item => item.id === id) ?? { id, name: id, description: '', order: 10000 });
    try {
      const folder = entry as DirectoryHandle, files: Array<[string, FileHandle | DirectoryHandle]> = [];
      for await (const child of folder.entries()) {
        if (child[1].kind === 'directory') issues.push({ file: `${id}/${child[0]}`, message: '仅支持一层分类目录。' });
        else files.push(child);
      }
      await readEntries(folder, files, id);
    } catch (error) { issues.push({ file: id, message: error instanceof Error ? error.message : String(error) }); }
  }
  for (const category of indexed) if (!folders.some(([id]) => id === category.id)) issues.push({ file: category.id, message: '索引中的分类目录不存在。' });
  categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
  templates.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return { templates, categories, issues };
}

export async function loadArticleTemplates(root: DirectoryHandle): Promise<ArticleTemplateLibrary> {
  await ensurePermission(root);
  return loadTemplateEntries(await root.getDirectoryHandle('templates', { create: true }));
}

export async function saveArticleTemplate(root: DirectoryHandle, id: string, source: string, originalId?: string | null, categoryId?: string, onFormatIssues?: (issues: ArticleFormatIssue[]) => void): Promise<ArticleTemplate> {
  await ensurePermission(root);
  assertId(id, '模板');
  if (originalId != null) assertId(originalId, '模板');
  if (categoryId != null) assertId(categoryId, '分类');
  if (typeof source !== 'string' || !source.trim() || source.length > MAX_TEMPLATE_LENGTH) throw new Error('模板内容不能为空且不得超过 250 KB。');
  const parsed = parseArticle(source);
  if (!parsed.canCopy) throw new Error(`模板 Front Matter 有误：${parsed.diagnostics.filter(item => item.level === 'error').map(item => item.message).join('；')}`);
  const icon = parsed.metadata.templateIcon;
  if (icon !== undefined && !isSnippetCategoryIcon(icon)) throw new Error('请选择有效的起稿模板图标。');
  const library = await loadArticleTemplates(root);
  const existing = originalId === null ? undefined : library.templates.find(item => item.id === (originalId ?? id));
  if (originalId != null && !existing) throw new Error('原模板文件不存在，请刷新列表后重试。');
  if (library.templates.some(item => item.id === id && item.id !== existing?.id)) throw new Error(`文件名 ${id}.md 已被其他模板占用。`);
  const category = categoryId ?? existing?.categoryId;
  if (originalId === null && !category) throw new Error('新建起稿模板请先选择分类。');
  if (category && !library.categories.some(item => item.id === category)) throw new Error('所选分类不存在，请先创建分类。');
  if (library.issues.some(issue => issue.file.split('/').at(-1) === `${id}.md`) && !library.templates.some(template => template.id === id)) throw new Error(`现有模板文件 ${id}.md 无法安全更新；请先在文件系统中确认文件可读。`);
  const formatIssues = await validateArticleAuthoringMarkdown(parsed.body, '起稿模板正文');
  const blocking = contentFormatBlockingIssues(formatIssues);
  if (blocking.length) throw new Error(`起稿模板校验失败：${articleFormatMessage(blocking)}`);
  if (formatIssues.length) onFormatIssues?.(formatIssues);
  const base = await root.getDirectoryHandle('templates');
  const directory = category ? await base.getDirectoryHandle(category) : base;
  const moving = existing && (existing.id !== id || existing.categoryId !== category);
  if (!existing || moving) await assertFileAvailable(directory, `${id}.md`);
  await writeManagedFile(directory, `${id}.md`, source, '模板');
  if (moving) {
    const origin = existing.categoryId ? await base.getDirectoryHandle(existing.categoryId) : base;
    try { await origin.removeEntry(`${existing.id}.md`); }
    catch (error) {
      let rollback = '';
      try { await directory.removeEntry(`${id}.md`); } catch { rollback = '；新文件回滚失败，请检查新旧文件'; }
      throw new Error(`改名或分类移动失败，原文件保留：${error instanceof Error ? error.message : String(error)}${rollback}`);
    }
  }
  return { id, name: parsed.metadata.title || id, source, ...(category ? { categoryId: category } : {}), ...(isSnippetCategoryIcon(icon) ? { icon } : {}) };
}

export async function deleteArticleTemplate(root: DirectoryHandle, id: string): Promise<void> {
  await ensurePermission(root);
  assertId(id, '模板');
  const library = await loadArticleTemplates(root);
  if (!library.templates.some((item) => item.id === id)) throw new Error(`找不到模板「${id}」。`);
  const template = library.templates.find(item => item.id === id)!;
  const base = await root.getDirectoryHandle('templates');
  const directory = template.categoryId ? await base.getDirectoryHandle(template.categoryId) : base;
  await directory.removeEntry(`${id}.md`);
}
