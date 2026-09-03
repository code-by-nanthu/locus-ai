import { useEffect, RefObject } from 'react';

type ShortcutsOptions = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onNewChat: () => void;
  onAbort: () => void;
  isGenerating: boolean;
  shortcutsOpen: boolean;
  setShortcutsOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  onCloseModals?: () => void;
};

export function useShortcuts({
  inputRef,
  onNewChat,
  onAbort,
  isGenerating,
  shortcutsOpen,
  setShortcutsOpen,
  onCloseModals,
}: ShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        onNewChat();
      } else if (e.key === 'Escape') {
        if (isGenerating) {
          e.preventDefault();
          onAbort();
        } else if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else if (onCloseModals) {
          onCloseModals();
        }
      } else if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(tag)) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputRef, onNewChat, onAbort, isGenerating, shortcutsOpen, setShortcutsOpen, onCloseModals]);
}
