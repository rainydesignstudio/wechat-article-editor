'use client';

import { monthKey } from '../../lib/fileSystem';
import type { ArticleSummary, ThemeConfig } from '../../lib/types';
import { DialogActions, DialogButton, DialogFrame, DialogHeader } from '../global/DialogFrame';

export function CopyDialog({ article, title, month, months, applyTheme, usesCurrentDraft, fromThemeLibrary = false, onChangeTitle, onChangeMonth, onClose, onConfirm }: {
  article: ArticleSummary;
  title: string;
  month: string;
  months: string[];
  applyTheme: ThemeConfig | null;
  usesCurrentDraft: boolean;
  fromThemeLibrary?: boolean;
  onChangeTitle: (value: string) => void;
  onChangeMonth: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const monthOptions = Array.from(new Set([article.month, ...months])).sort().reverse();
  const currentMonth = monthKey();
  const currentMonthAlreadyListed = monthOptions.includes(currentMonth);
  return (
    <DialogFrame titleId="copy-dialog-title" onClose={onClose}>
      <DialogHeader titleId="copy-dialog-title" eyebrow="FORK MANUSCRIPT" title="Fork 为独立文稿" onClose={onClose} />
      <div className="dialog-content">
        <label className="field-stack"><span className="field-label">Fork 标题</span><input className="field" autoFocus value={title} onChange={(event) => onChangeTitle(event.target.value)} /></label>
        <label className="field-stack"><span className="field-label">保存年月</span><select className="field" value={month} onChange={(event) => onChangeMonth(event.target.value)}>{monthOptions.map((value) => <option key={value} value={value}>{value}</option>)}{!currentMonthAlreadyListed ? <option value={currentMonth}>{currentMonth} · 当前月</option> : null}</select></label>
        <p className="status-copy">{fromThemeLibrary ? '副本使用当前编辑内容与选中的文章主题；原稿磁盘文件保持不变，确认后打开副本。' : usesCurrentDraft ? 'Fork 使用当前编辑内容与主题快照，原稿的未保存状态保持不变。' : 'Fork 使用这篇已保存文章的当前版本。'}图片素材复制到新目录，历史记录从新稿开始。{applyTheme ? `主题：${applyTheme.name} v${applyTheme.version}。` : ''}{month !== article.month ? ` 新稿归档为 ${month}。` : ''}</p>
        <DialogActions><DialogButton onClick={onClose}>取消</DialogButton><DialogButton variant="primary" onClick={onConfirm} disabled={!title.trim()}>{fromThemeLibrary ? '复制并应用' : '创建 Fork'}</DialogButton></DialogActions>
      </div>
    </DialogFrame>
  );
}

export function DeleteDialog({ articles, archived, onClose, onConfirm }: { articles: ArticleSummary[]; archived: boolean; onClose: () => void; onConfirm: () => void }) {
  const count = articles.length;
  const title = count === 1
    ? (archived ? '删除归档文稿？' : '永久删除文稿？')
    : (archived ? `删除所选的 ${count} 篇归档文稿？` : `永久删除所选的 ${count} 篇文稿？`);
  const suffix = count > 1 ? `（${count} 篇）` : '';
  return (
    <DialogFrame titleId="delete-dialog-title" descriptionId="delete-dialog-copy" role="alertdialog" onClose={onClose}>
      <DialogHeader titleId="delete-dialog-title" eyebrow={archived ? 'DELETE ARCHIVE' : 'DELETE MANUSCRIPT'} title={title} onClose={onClose} />
      <div className="grid gap-5 p-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning-line bg-warning-surface p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-panel text-warning-strong" aria-hidden="true"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.8 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v5M12 17.5h.01" /></svg></span>
          <div className="min-w-0"><p id="delete-dialog-copy" className="m-0 text-sm font-semibold text-warning-strong">删除后将无法恢复，是否继续？</p><p className="m-0 mt-1 text-sm text-muted">正文、主题快照、本地素材及历史版本都会从资料目录中永久删除。</p></div>
        </div>
        <div className="grid gap-1 border-l-2 border-warning pl-3"><span className="text-xs font-medium text-faint">{count > 1 ? `即将删除 ${count} 篇` : '即将删除'}</span>
          <div className="grid max-h-56 gap-2 overflow-x-clip overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">{articles.map((item) => <div key={item.id} className="grid gap-0.5"><strong className="break-words text-sm font-semibold text-primary">{item.parse.metadata.title || '未命名文章'}</strong><span className="break-all font-mono text-xs text-muted">{item.month}/{item.folder}</span></div>)}</div>
        </div>
        <DialogActions><DialogButton autoFocus onClick={onClose}>保留文稿</DialogButton><DialogButton variant="danger" onClick={onConfirm}>{archived ? '删除归档' : '确认删除'}{suffix}</DialogButton></DialogActions>
      </div>
    </DialogFrame>
  );
}
