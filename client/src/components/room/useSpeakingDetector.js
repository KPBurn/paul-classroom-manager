import { useEffect, useRef, useSyncExternalStore } from 'react';

// Microphone level (0–1) at which someone counts as speaking, and how long a pause is ignored.
export const SPEAKING_START_LEVEL = 0.06;
const SPEAKING_STOP_LEVEL = 0.035;
const SPEAKING_HOLD_MS = 700;
const SAMPLE_INTERVAL_MS = 100;

/** Holds the latest microphone level outside React state, so reading it ten times a second re-renders only the meter. */
function createLevelStore() {
  let level = 0;
  const listeners = new Set();
  return {
    get: () => level,
    set(next) {
      if (next === level) return;
      level = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Listens to the local microphone while `enabled` and reports when the person
 * starts and stops speaking. Starting needs a clearly raised level; once
 * speaking, short pauses between words do not count as stopping, so the room
 * is not told "stopped, started" several times a second.
 *
 * `getTrack` returns the live microphone track. Returns a level store for `useMicLevel`.
 */
export function useSpeakingDetector({ enabled, getTrack, onSpeakingChange, onError }) {
  const storeRef = useRef(null);
  storeRef.current ??= createLevelStore();
  // The latest callbacks, so the listener does not restart every time the room re-renders.
  const callbacks = useRef({});
  callbacks.current = { getTrack, onSpeakingChange, onError };

  useEffect(() => {
    const store = storeRef.current;
    if (!enabled) {
      store.set(0);
      return undefined;
    }
    const track = callbacks.current.getTrack();
    if (!track || typeof window.AudioContext !== 'function') return undefined;

    const context = new window.AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let active = true;
    let interval;
    let speaking = false;
    let lastLoudAt = 0;

    context.resume()
      .then(() => {
        if (!active) return;
        interval = window.setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const normalized = (sample - 128) / 128;
            sum += normalized * normalized;
          }
          const level = Math.min(1, Math.sqrt(sum / samples.length) * 5);
          store.set(level);
          const now = Date.now();
          if (level >= SPEAKING_STOP_LEVEL) lastLoudAt = now;
          const nextSpeaking = speaking ? now - lastLoudAt < SPEAKING_HOLD_MS : level >= SPEAKING_START_LEVEL;
          if (nextSpeaking !== speaking) {
            speaking = nextSpeaking;
            callbacks.current.onSpeakingChange(speaking);
          }
        }, SAMPLE_INTERVAL_MS);
      })
      .catch((error) => callbacks.current.onError(error, 'Unable to monitor microphone input level.'));

    return () => {
      active = false;
      window.clearInterval(interval);
      source.disconnect();
      analyser.disconnect();
      if (context.state !== 'closed') {
        context.close().catch((error) => callbacks.current.onError(error, 'Unable to close microphone level monitor.'));
      }
      if (speaking) callbacks.current.onSpeakingChange(false);
      store.set(0);
    };
  }, [enabled]);

  return storeRef.current;
}

/** The current microphone level from a store returned by `useSpeakingDetector`. */
export const useMicLevel = (store) => useSyncExternalStore(store.subscribe, store.get);
