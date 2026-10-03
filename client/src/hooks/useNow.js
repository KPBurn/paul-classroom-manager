import { useEffect, useState } from 'react';

const clocks = new Set();

/** Brings every `useNow` up to date at once, for when something has just happened (a class starting). */
export const refreshNow = () => {
  for (const tick of clocks) tick();
};

/** The current time, refreshed on an interval so "live" and "starts in" labels stay current. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    clocks.add(tick);
    const timer = window.setInterval(tick, intervalMs);
    return () => {
      clocks.delete(tick);
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
