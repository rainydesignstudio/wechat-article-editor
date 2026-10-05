'use client';

import { useEffect, useState, type ButtonHTMLAttributes } from 'react';
import { tailwindColorInformation, type TailwindColorInformation } from '../../lib/tailwindPalette';
import { TooltipButton } from './TooltipButton';

export function useTailwindColorInformation(color: string, preferredName?: string): TailwindColorInformation {
  const [resolved, setResolved] = useState<{ color: string; preferredName?: string; info: TailwindColorInformation } | null>(null);
  useEffect(() => {
    setResolved({ color, preferredName, info: tailwindColorInformation(color, document, preferredName) });
  }, [color, preferredName]);
  return resolved?.color === color && resolved.preferredName === preferredName ? resolved.info : tailwindColorInformation(color);
}

export function ColorSwatchButton({ color, colorName, children, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { color: string; colorName?: string }) {
  const info = useTailwindColorInformation(color, colorName);
  return <TooltipButton {...props} title={undefined} style={{ ...style, backgroundColor: children ? style?.backgroundColor : color }} tooltip={
    <span className="grid gap-0.5 font-mono">
      {info.name ? <span className="text-xs font-medium" data-tailwind-color-name="true">{info.name}</span> : null}
      <span className="text-2xs" data-color-hex="true">{info.hex.toUpperCase()}</span>
    </span>
  }>{children}</TooltipButton>;
}
