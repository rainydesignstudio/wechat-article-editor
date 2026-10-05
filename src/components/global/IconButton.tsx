'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { TooltipButton } from './TooltipButton';

const tones = { default: '', danger: 'text-danger' };
const variants = {
  surface: 'button button-quiet size-9 min-h-9 aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent-text aria-expanded:border-accent-line aria-expanded:bg-accent-soft aria-expanded:text-accent-text',
  inline: 'inline-flex size-6 min-h-6 items-center justify-center rounded-md text-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
};

/** Shared compact action: fixed square, existing button theme and tooltip behavior. */
export function IconButton({ icon, tooltip, tone = 'default', variant = 'surface', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode; tooltip: ReactNode; tone?: 'default' | 'danger'; variant?: keyof typeof variants; as?: 'button' | 'summary';
}) {
  return <TooltipButton {...props} tooltip={tooltip} aria-label={props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined)}
    className={`relative shrink-0 p-0 ${variants[variant]} ${tones[tone]} ${className}`}>
    {icon}{children}
  </TooltipButton>;
}
