'use client';

import { useState } from 'react';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useAnimatedMaxHeight } from '../../hooks/useAnimatedMaxHeight';
import { articleFormatSeverity, articleFormatTierLabel, type ArticleFormatIssue, type ArticleFormatSeverity } from '../../lib/articleFormat';
import { hasFormatConcerns, type ArticleFormatReport, type FormatCheckSection } from '../../lib/articleFormatReport';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from './DialogFrame';

type FormatTab = 'theme' | 'body';
const TABS: Array<{ id: FormatTab; label: string }> = [{ id: 'theme', label: '主题' }, { id: 'body', label: '正文' }];
const ISSUE_SOURCES = [
  { id: 'html', label: 'HTML' },
  { id: 'styles', label: '样式' },
  { id: 'check', label: '检查' },
] as const;
const GROUPS: Array<{ severity: ArticleFormatSeverity; label: string; summary: (count: number) => string }> = [
  { severity: 'safe', label: '通过', summary: count => `${count} 项通过` },
  { severity: 'warning', label: '警告', summary: count => `${count} 项需核对` },
  { severity: 'error', label: '错误', summary: count => `${count} 项需处理` },
];

function FormatTabIcon({ tab }: { tab: FormatTab }) {
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {tab === 'theme' ? <path d="M4 19h16M6 15 16 5l3 3-10 10H6v-3Z" /> : <path d="M12 6.2C9.5 4.7 6.5 4.5 3 5v13c3.5-.5 6.5-.3 9 1.2 2.5-1.5 5.5-1.7 9-1.2V5c-3.5-.5-6.5-.3-9 1.2ZM12 6.2v13" />}
  </svg>;
}

function FormatActionIcon({ copy = false }: { copy?: boolean }) {
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {copy ? <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></> : <path d="m6 6 12 12M6 18 18 6" />}
  </svg>;
}

function issueSource(issue: ArticleFormatIssue): (typeof ISSUE_SOURCES)[number]['id'] {
  if (issue.kind === 'element' || issue.kind === 'attribute') return 'html';
  if (issue.kind === 'engine') return 'check';
  return 'styles';
}

function issueLocation(issue: ArticleFormatIssue, tab: FormatTab): string | null {
  const lines = issue.lines?.length ? issue.lines : issue.line ? [issue.line] : [];
  if (!lines.length) return issue.source === '主题节点样式' ? issue.source : null;
  return `${tab === 'body' ? '正文' : '主题 CSS '}第 ${lines.join('、')} 行`;
}

function FormatDisclosure({ section, tab, group }: { section: FormatCheckSection; tab: FormatTab; group: (typeof GROUPS)[number] }) {
  const issues = section.issues.filter(issue => articleFormatSeverity(issue.tier) === group.severity);
  const names = group.severity === 'safe' ? section.passed : [];
  const count = group.severity === 'safe' ? names.length : issues.length;
  const [open, setOpen] = useState(group.severity === 'error' && count > 0);
  const bodyRef = useAnimatedMaxHeight(open);
  const bodyId = `format-check-${tab}-${group.severity}`;
  const tone = count === 0 ? 'text-faint' : group.severity === 'safe' ? 'text-success' : group.severity === 'warning' ? 'text-warning-strong' : 'text-danger';

  return <section className="rounded-lg border border-line bg-list/50 p-4">
    <button type="button" className="group/format flex w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)}>
      <span className={`text-sm font-medium ${tone}`}>{group.label}</span>
      <span className="flex items-center gap-2 text-xs text-muted"><span>{group.summary(count)}</span><svg className="size-4 shrink-0 text-faint transition-transform duration-200 ease-out motion-reduce:transition-none group-aria-expanded/format:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></span>
    </button>
    <div id={bodyId} ref={bodyRef} className="overflow-hidden transition-[max-height] duration-200 ease-out motion-reduce:transition-none">
      {count ? <div className="grid gap-3 pt-3">
        {names.length ? <ul className="grid gap-2 text-sm text-secondary">{names.map(name => <li key={name} className="break-words">{name}</li>)}</ul> : null}
        {ISSUE_SOURCES.map(source => {
          const entries = issues.filter(issue => issueSource(issue) === source.id);
          return entries.length ? <section key={source.id} className="grid gap-2">
            <h3 className="text-xs font-medium text-muted">{source.label} · {entries.length} 项</h3>
            <ul className="grid gap-3 text-sm text-secondary">{entries.map((issue, index) => {
              const location = issueLocation(issue, tab);
              const provenance = issue.source.startsWith('工具类 ') ? `来自${issue.source}` : null;
              return <li key={`${issue.kind}:${issue.name}:${issue.line ?? ''}:${index}`} className="break-words">
                <span className="font-medium text-primary">{issue.name}</span>
                <span className="ml-2 text-xs text-faint">{articleFormatTierLabel(issue.tier)}</span>
                {location || provenance ? <p className="mt-1 text-xs text-faint">{[location, provenance].filter(Boolean).join(' · ')}</p> : null}
                {issue.message !== issue.name ? <p className="mt-1 text-sm text-muted">{issue.message}</p> : null}
              </li>;
            })}</ul>
          </section> : null;
        })}
      </div> : <p className="pt-3 text-sm text-faint">暂无项目。</p>}
    </div>
  </section>;
}

export function FormatCheckDialog({ mode, report, onDecision }: { mode: 'save' | 'copy' | 'inspect' | 'export'; report: ArticleFormatReport; onDecision: (proceed: boolean) => void }) {
  const format = useFormatSnapshot();
  const [tab, setTab] = useState<FormatTab>(() => TABS.find(item => report[item.id].issues.some(issue => articleFormatSeverity(issue.tier) === 'error'))?.id ?? (report.theme.issues.length ? 'theme' : report.body.issues.length ? 'body' : 'theme'));
  const concerns = hasFormatConcerns(report);
  const chooseTab = (next: FormatTab) => setTab(next);

  return <DialogFrame titleId="format-check-title" descriptionId="format-check-description" onClose={() => onDecision(false)} large wide>
    <DialogHeader titleId="format-check-title" eyebrow="FORMAT CHECK" title="格式检查" onClose={() => onDecision(false)} />
    <p id="format-check-description" className="p-4 text-sm text-muted">{mode === 'save'
      ? '原文已保存。以下项目按当前资料库配置核对；未完成项不记通过。'
      : mode === 'inspect' ? '以下结果按当前编辑稿与资料库配置核对；未完成项不记通过。'
      : mode === 'export' ? '导出前请核对主题与正文。未完成项不记通过，继续导出后仍需核对成品。' : concerns ? '复制前请核对主题与正文。未完成项不记通过，继续复制后仍需检查接收结果。' : '主题与正文未发现需处理项；仍可查看本次检查的通过项。'}<span className="mt-1 block text-xs text-faint">{format.bundle.support.meta.name}{format.officialDefault ? ' · 官方默认配置' : ' · 资料库自定义配置'}{report.complete === false ? ' · 实际布局／转换尚未完成核对' : ''}</span></p>
    <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-line p-4" role="tablist" aria-label="检查对象">
      {TABS.map((item, index) => {
        const errorCount = report[item.id].issues.filter(issue => articleFormatSeverity(issue.tier) === 'error').length;
        return <button key={item.id} id={`format-check-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls="format-check-panel" aria-label={errorCount ? `${item.label}，${errorCount} 项错误` : undefined} tabIndex={tab === item.id ? 0 : -1} onClick={() => chooseTab(item.id)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
        if (next !== null) { event.preventDefault(); chooseTab(TABS[next].id); document.getElementById(`format-check-tab-${TABS[next].id}`)?.focus(); }
      }} className={`flex min-h-9 items-center justify-center gap-2 rounded-md border border-transparent px-4 py-2 text-sm font-medium hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${errorCount ? 'text-danger aria-selected:border-danger aria-selected:bg-danger/10 aria-selected:text-danger' : 'text-muted aria-selected:border-accent-line aria-selected:bg-accent-soft aria-selected:text-accent-text'}`}><FormatTabIcon tab={item.id} />{item.label}</button>;
      })}
    </div>
    <div id="format-check-panel" role="tabpanel" aria-labelledby={`format-check-tab-${tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-x-clip overflow-y-auto p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
      <div className="grid gap-3">{GROUPS.map(group => <FormatDisclosure key={`${tab}:${group.severity}`} section={report[tab]} tab={tab} group={group} />)}</div>
    </div>
    <DialogFooter><DialogActions>
      {mode === 'copy' || mode === 'export' ? <><DialogButton autoFocus onClick={() => onDecision(false)}><FormatActionIcon />{mode === 'export' ? '取消导出' : '先不复制'}</DialogButton><DialogButton variant="primary" onClick={() => onDecision(true)}><FormatActionIcon copy />{mode === 'export' ? (concerns ? '仍然导出' : '继续导出') : concerns ? '仍然复制' : '复制富文本'}</DialogButton></> : <DialogButton autoFocus variant="primary" onClick={() => onDecision(false)}><FormatActionIcon />关闭</DialogButton>}
    </DialogActions></DialogFooter>
  </DialogFrame>;
}
