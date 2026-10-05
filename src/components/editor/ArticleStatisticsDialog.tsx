'use client';

import type { ArticleStatistics } from '../../lib/articleStatistics';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from '../global/DialogFrame';

type StatisticsIconName = 'heading' | 'paragraph' | 'image' | 'link' | 'code';

function StatisticsIcon({ name }: { name: StatisticsIconName }) {
  const paths: Record<Exclude<StatisticsIconName, 'image'>, string> = {
    heading: 'M5 5v14M19 5v14M5 12h14',
    paragraph: 'M13 4v16M18 4v16M18 4H9a5 5 0 0 0 0 10h4',
    link: 'm10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
    code: 'm8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16',
  };
  return <svg className="size-4 shrink-0 text-accent-text" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === 'image' ? <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m3 17 6-6 4 4 3-3 5 5" /></> : <path d={paths[name]} />}
  </svg>;
}

export function ArticleStatisticsDialog({ title, dirty, statistics, issue, onClose }: {
  title: string;
  dirty: boolean;
  statistics: ArticleStatistics | null;
  issue?: string;
  onClose: () => void;
}) {
  const count = (value: number) => value.toLocaleString('zh-CN');
  return <DialogFrame titleId="article-statistics-title" descriptionId="article-statistics-description" onClose={onClose} className="max-w-2xl">
    <DialogHeader titleId="article-statistics-title" eyebrow="ARTICLE STATISTICS" title="文章统计" onClose={onClose} />
    <div className="grid gap-4 p-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-list/50 p-4">
        <strong className="min-w-0 truncate font-sub-heading text-sm text-primary">{title}</strong>
        <span className="text-xs text-muted">当前编辑稿{dirty ? ' · 含未保存修改' : ''}</span>
      </div>
      {statistics ? <>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-panel p-4"><p className="text-xs text-muted">正文字符</p><strong className="mt-2 block font-mono text-3xl font-semibold text-primary">{count(statistics.characters)}</strong></div>
          <div className="rounded-lg border border-line bg-panel p-4"><p className="text-xs text-muted">预计阅读</p><strong className="mt-2 block font-mono text-3xl font-semibold text-primary">约 {count(statistics.readingMinutes)} 分钟</strong></div>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-list/50 p-4 text-sm md:grid-cols-5">
          {([['标题', statistics.headings, 'heading'], ['段落', statistics.paragraphs, 'paragraph'], ['图片', statistics.images, 'image'], ['链接', statistics.links, 'link'], ['代码块', statistics.codeBlocks, 'code']] as const).map(([label, value, icon]) => <div key={label}><dt className="flex items-center gap-2 text-xs text-muted"><StatisticsIcon name={icon} />{label}</dt><dd className="mt-2 font-mono font-semibold text-primary">{count(value)}</dd></div>)}
        </dl>
        <p id="article-statistics-description" className="text-xs text-faint">按当前预览正文统计；不计元数据、空白占位段及空白字符。阅读时间按每分钟 300 字符估算。</p>
      </> : <p id="article-statistics-description" className="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-strong" role="status">{issue || '正文预览尚未就绪，请稍后重试。'}</p>}
    </div>
    <DialogFooter><DialogActions><DialogButton onClick={onClose}>关闭</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>;
}
