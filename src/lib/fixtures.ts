import { createArticleSource, updateFrontMatter } from './frontMatter';

const DEMO_BODY = `
# M1：标准文章闭环

这是一篇**本地演示技术文稿**。它用于验证源码、Front Matter、即时预览、按需样式生成和富文本复制，不代表已经完成公众号联调。

## 标准格式夹具

### 代码与列表

- **粗体**、*斜体*、~~删除线~~和行内 \`const revision = 1\`。
- 有序步骤：
  1. 选择资料目录
  2. 编辑原始 Markdown＋HTML
  3. 保存并显式生成样式

> 引用保持为文章内容，不会混入编辑器诊断。

\`\`\`ts
export function stableRevision(source: string, version: number) {
  return { version, sourceLength: source.length };
}
\`\`\`

### 表格与链接

| 阶段 | 事实来源 | 结果 |
| --- | --- | --- |
| 保存 | article.md | 原文优先 |
| 索引 | 月 index.json | 可重建缓存 |
| 复制 | ClipboardItem | text/html＋text/plain |

更多说明见 [文件存档边界](https://example.com/local-only)。

<figure>
  <div class="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-950">这是一个明确标为实验的 Tailwind 类名片段；它只在当前文章样式生成时参与。</div>
  <figcaption>实验片段：样式可生成，但未声称公众号正式兼容。</figcaption>
</figure>

<hr>

## 输出边界

本地图片路径会保留为待补素材，不假称已经上传。Front Matter 只用于文件元数据，不进入复制正文。
`;

const DEMO_TIMESTAMP = '2026-09-22T00:00:00.000Z';

export const DEMO_ARTICLE_SOURCE = updateFrontMatter(createArticleSource('M1 标准文章闭环', 'basic') + DEMO_BODY, {
  description: '用于 M1 本地闭环与高风险样式原型的自写测试文稿。',
  categories: ['M1', '技术教程'],
  createdAt: DEMO_TIMESTAMP,
  updatedAt: DEMO_TIMESTAMP,
});

export const EMPTY_ARTICLE_SOURCE = updateFrontMatter(createArticleSource('未命名技术文稿', 'basic'), {
  description: '',
  categories: [],
});

export const EXPERIMENTAL_SNIPPETS = [
  { name: '//callout', description: '实验提示框，保留 Tailwind 类名供按需生成验证。', source: '\n<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">▌</div>\n' },
  { name: '//table-merged', description: '实验合并单元格表格，验证 rowspan/colspan 不被清洗掉。', source: '\n<table><tbody><tr><th rowspan="2">▌</th><td>保留结构</td></tr><tr><td>手写 HTML</td></tr></tbody></table>\n' },
  { name: '//signature', description: '普通 HTML 署名片段，不代表品牌事实承诺。', source: '\n<p class="text-slate-600">— 本文由 Rainy 文稿台整理</p>\n' },
] as const;
