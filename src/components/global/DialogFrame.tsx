'use client';

import { useRef, type ButtonHTMLAttributes, type KeyboardEventHandler, type ReactNode } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { ButtonBar } from './ButtonBar';

type DialogFrameProps = {
  titleId: string;
  descriptionId?: string;
  role?: 'dialog' | 'alertdialog';
  onClose: () => void;
  dismissible?: boolean;
  wide?: boolean;
  large?: boolean;
  focusActive?: boolean;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  children: ReactNode;
};

export function DialogFrame({ titleId, descriptionId, role = 'dialog', onClose, dismissible = true, wide = false, large = false, focusActive = true, className = '', onKeyDown, children }: DialogFrameProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  useDialogFocus(panelRef, () => { if (dismissible) onClose(); }, focusActive);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (dismissible && event.currentTarget === event.target) onClose(); }}>
      <section ref={panelRef} tabIndex={-1} className={`${large ? `dialog-card flex h-4/5 min-h-0 flex-col overflow-hidden ${wide ? 'max-w-2xl' : 'max-w-6xl'}` : wide ? 'dialog-card max-w-xl' : 'dialog-card'} ${className}`} role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={onKeyDown}>
        {children}
      </section>
    </div>
  );
}

type DialogButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: 'quiet' | 'primary' | 'danger';
  iconOnly?: boolean;
};

export function DialogButton({ variant = 'quiet', iconOnly = false, type = 'button', children, ...props }: DialogButtonProps) {
  const className = {
    quiet: 'button button-quiet',
    primary: 'button button-primary',
    danger: 'button button-danger',
  }[variant];
  return <button {...props} type={type} className={iconOnly ? `${className} size-10 shrink-0 p-0` : className}>{children}</button>;
}

export function DialogHeader({ titleId, eyebrow, title, onClose, closeDisabled = false, actions }: {
  titleId: string;
  eyebrow: string;
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  actions?: ReactNode;
}) {
  return (
    <header className="dialog-header">
      <div className="min-w-0"><p className="eyebrow">{eyebrow}</p><h2 className="font-heading dialog-title" id={titleId}>{title}</h2></div>
      <ButtonBar label={actions ? '弹窗操作' : '关闭弹窗'}>{actions}<DialogButton iconOnly aria-label="关闭弹窗" disabled={closeDisabled} onClick={onClose}>
        <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l14 14M19 5 5 19" /></svg>
      </DialogButton></ButtonBar>
    </header>
  );
}

export function DialogActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <ButtonBar label="弹窗操作" className={`dialog-actions ${className}`}>{children}</ButtonBar>;
}

export function DialogFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`dialog-footer ${className}`.trim()}>{children}</div>;
}
