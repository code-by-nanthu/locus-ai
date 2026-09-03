import { useRef, useEffect } from 'react';

export function useScrollAnchor(deps: any[]) {
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  const handleScroll = () => {
    if (!mainScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = mainScrollRef.current;
    isNearBottomRef.current = scrollHeight - (scrollTop + clientHeight) < 120;
  };

  useEffect(() => {
    if (isNearBottomRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, deps);

  return { mainScrollRef, chatEndRef, handleScroll };
}
