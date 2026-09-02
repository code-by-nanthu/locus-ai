// src/components/ascii-art.ts
// Generated with figlet "ANSI Shadow" — do not hand-edit.
// All lines padded to equal width so the gradient aligns per column.
export const LOGO_LONG = [
  '██╗      ██████╗  ██████╗██╗   ██╗███████╗',
  '██║     ██╔═══██╗██╔════╝██║   ██║██╔════╝',
  '██║     ██║   ██║██║     ██║   ██║███████╗',
  '██║     ██║   ██║██║     ██║   ██║╚════██║',
  '███████╗╚██████╔╝╚██████╗╚██████╔╝███████║',
  '╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝',
].join('\n');

export const LOGO_SHORT = [
  '┬  ┌─┐┌─┐┬ ┬┌─┐',
  '│  │ ││  │ │└─┐',
  '┴─┘└─┘└─┘└─┘└─┘',
].join('\n');

export const logoWidth = (art: string) =>
  Math.max(...art.split('\n').map(l => [...l].length));
