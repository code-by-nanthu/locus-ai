import React, { useState, useEffect, useRef } from 'react';
import { Text } from 'ink';

export function ElapsedTimer({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  if (!running) return null;

  const s = elapsed % 60;
  const m = Math.floor(elapsed / 60);
  const label = m > 0 ? `${m}m ${s}s` : `${s}s`;
  return <Text dimColor> {label}</Text>;
}
