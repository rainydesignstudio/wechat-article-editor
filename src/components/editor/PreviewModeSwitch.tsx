'use client';

export function PreviewModeSwitch({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return <button className="group inline-flex shrink-0 items-center gap-1.5 rounded-md p-1 text-faint hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" type="button" role="switch" aria-checked={dark} aria-label="预览深色模式" onClick={onToggle}>
    <svg className="size-4 text-muted" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    <span className="flex h-5 w-9 items-center rounded-full border border-line-strong bg-rail p-0.5 group-aria-checked:border-accent-line group-aria-checked:bg-accent-strong" aria-hidden="true"><span className="size-3.5 rounded-full bg-primary shadow-sm transition-transform group-aria-checked:translate-x-4 group-aria-checked:bg-on-accent" /></span>
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19.5 15.7A8.4 8.4 0 0 1 8.3 4.5 8.6 8.6 0 1 0 19.5 15.7Z" /></svg>
  </button>;
}
