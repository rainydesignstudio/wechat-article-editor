'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function InformationButton({ icon, title, subtitle, titleClassName = '', className = '', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & {
  icon: ReactNode; title: ReactNode; subtitle: ReactNode; titleClassName?: string;
}) {
  return <button {...props} type="button" className={`information-button ${className}`}>
    <span className="information-badge" aria-hidden="true">{icon}</span>
    <span className="information-copy"><strong className={`information-title ${titleClassName}`}>{title}</strong><small className="information-subtitle">{subtitle}</small></span>
  </button>;
}

export function InformationIcon({ book = false }: { book?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{book ? <><path d="M12 5v16M3 4c3-1 6 0 9 1 3-1 6-2 9-1v15c-3-1-6 0-9 2-3-2-6-3-9-2V4Z" /></> : <><path d="M5 3h9l5 5v13H5V3Z" /><path d="M14 3v5h5M8 13h8M8 17h6" /></>}</svg>;
}
