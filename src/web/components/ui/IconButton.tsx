import { ReactNode } from 'react';

export function IconButton({
  label,
  onClick,
  children,
  className = '',
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-9 w-9 inline-flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
