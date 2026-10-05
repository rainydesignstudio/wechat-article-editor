import type { HTMLAttributes } from 'react';

export function ButtonBar({ label, className = '', children, ...props }: HTMLAttributes<HTMLDivElement> & { label: string }) {
  return <div {...props} className={`button-bar ${className}`.trim()} role="group" aria-label={label}>{children}</div>;
}
