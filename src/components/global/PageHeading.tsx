import type { ReactNode } from 'react';
// All page headings share the same mobile stack and desktop action alignment.
export function PageHeading({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <header className={`flex shrink-0 flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between ${className}`}>{children}</header>;
}
