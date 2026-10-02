import { ChevronDown, ChevronUp, PictureInPicture2, UsersRound, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { canFloatVideo, createCompositeVideo } from './compositePip.js';
import ParticipantTile from './ParticipantTile.jsx';
import { usePaneSelection } from './usePaneSelection.js';

const STORAGE_KEY = 'ctms.classMonitor';
const PANEL_WIDTH = 320;
const EDGE = 12;

// How this browser can keep the monitor above other windows, if at all.
const canFloatPanel = () => 'documentPictureInPicture' in window;

/** Where the teacher left the panel and whether it was minimised, kept for next time. */
function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}
function save(changes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readSaved(), ...changes }));
  } catch {
    // Nothing is lost if the preference cannot be kept.
  }
}

const headerButton = 'flex size-7 shrink-0 items-center justify-center rounded-md text-ink-300 transition hover:bg-ink-700 hover:text-white focus-visible:outline-2 focus-visible:outline-white';

/** The monitor's contents, shown either in the page or in the floating window. */
function MonitorPanel({ panes, hiddenCount, studentCount, speakingNames, unreadMessages, minimised, sharing, actions, dragHandle }) {
  const summary = speakingNames.length
    ? `${speakingNames.slice(0, 2).join(', ')}${speakingNames.length > 2 ? ` +${speakingNames.length - 2}` : ''} speaking`
    : `${studentCount} ${studentCount === 1 ? 'student' : 'students'}`;
  return (
    <section aria-label="Class monitor" className="flex h-full flex-col bg-ink-900 text-ink-100">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-ink-700 pl-3 pr-1.5" {...dragHandle}>
        <UsersRound className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-xs font-medium" aria-live="polite">
          <span className={speakingNames.length ? 'text-emerald-300' : 'text-ink-100'}>{summary}</span>
        </p>
        {unreadMessages > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white" title="Unread chat messages">
            {unreadMessages > 99 ? '99+' : unreadMessages}
            <span className="sr-only"> unread chat messages</span>
          </span>
        )}
        {actions}
      </header>
      {!minimised && (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {panes.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-ink-400">No students have joined yet.</p>
          ) : (
            <div className={`grid gap-2 ${panes.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {panes.map((student) => <ParticipantTile key={student.id} participant={student} size="pane" />)}
            </div>
          )}
          {hiddenCount > 0 && (
            <p className="mt-2 text-center text-[11px] text-ink-400">
              +{hiddenCount} more {hiddenCount === 1 ? 'student' : 'students'} in the room
            </p>
          )}
          {sharing && (
            <p className="mt-2 text-[11px] leading-4 text-ink-400">
              Share a window or a tab, not your whole screen, so students do not see this panel.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * A small panel for the teacher showing up to four students, chosen by who is
 * speaking and who has a camera on. It sits over the room and can be dragged
 * and minimised. Where the browser allows, it can float above other windows,
 * so it stays visible while the teacher presents something else.
 *
 * `students` are the room's students with `id`, `name`, `stream`, `muted`,
 * `cameraEnabled` and `isSpeaking`.
 */
export default function ClassMonitor({ students, unreadMessages = 0, sharing = false, onClose }) {
  const { panes, hiddenCount } = usePaneSelection(students);
  const speakingNames = students.filter((student) => student.isSpeaking).map((student) => student.name.split(/\s+/)[0]);
  const [minimised, setMinimised] = useState(() => Boolean(readSaved().minimised));
  const [position, setPosition] = useState(() => readSaved().position ?? null);
  const [floatingWindow, setFloatingWindow] = useState(null);
  const [videoFloating, setVideoFloating] = useState(false);
  const [floatError, setFloatError] = useState('');
  const panelRef = useRef(null);
  const floatMode = canFloatPanel() ? 'panel' : canFloatVideo() ? 'video' : null;

  const toggleMinimised = () => setMinimised((current) => {
    save({ minimised: !current });
    return !current;
  });

  // Dragging by the header. The panel is kept inside the window, including after a resize.
  const clamp = useCallback(({ left, top }) => {
    const height = panelRef.current?.offsetHeight ?? 0;
    return {
      left: Math.min(Math.max(EDGE, left), Math.max(EDGE, window.innerWidth - PANEL_WIDTH - EDGE)),
      top: Math.min(Math.max(EDGE, top), Math.max(EDGE, window.innerHeight - height - EDGE)),
    };
  }, []);
  const startDrag = (event) => {
    if (event.target.closest('button') || !panelRef.current) return;
    event.preventDefault();
    const box = panelRef.current.getBoundingClientRect();
    const offset = { x: event.clientX - box.left, y: event.clientY - box.top };
    let latest = { left: box.left, top: box.top };
    const move = (moveEvent) => {
      latest = clamp({ left: moveEvent.clientX - offset.x, top: moveEvent.clientY - offset.y });
      setPosition(latest);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      save({ position: latest });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
  useEffect(() => {
    const keepInView = () => setPosition((current) => (current ? clamp(current) : current));
    window.addEventListener('resize', keepInView);
    return () => window.removeEventListener('resize', keepInView);
  }, [clamp]);

  // Floating as a whole panel (Chrome, Edge): a small always-on-top window that shows the same panel.
  const floatPanel = async () => {
    const floating = await window.documentPictureInPicture.requestWindow({ width: 340, height: 300 });
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
      floating.document.head.appendChild(node.cloneNode(true));
    }
    Object.assign(floating.document.body.style, { margin: '0', height: '100vh', background: '#141413' });
    floating.document.title = 'Class monitor';
    floating.addEventListener('pagehide', () => setFloatingWindow(null), { once: true });
    setFloatingWindow(floating);
  };
  useEffect(() => () => floatingWindow?.close(), [floatingWindow]);

  // Floating as one video (Safari): the panes are painted into a video the browser can float.
  const compositeRef = useRef(null);
  const latest = useRef({ panes, studentCount: students.length });
  latest.current = { panes, studentCount: students.length };
  useEffect(() => {
    if (floatMode !== 'video') return undefined;
    const composite = createCompositeVideo({
      getPanes: () => latest.current.panes,
      getStatus: () => (latest.current.studentCount ? '' : 'No students have joined yet.'),
      onFloatingChange: setVideoFloating,
    });
    compositeRef.current = composite;
    return () => {
      composite.stop();
      compositeRef.current = null;
    };
  }, [floatMode]);

  const floating = Boolean(floatingWindow) || videoFloating;
  const toggleFloat = async () => {
    setFloatError('');
    try {
      if (floatingWindow) floatingWindow.close();
      else if (videoFloating) await compositeRef.current?.dock();
      else if (floatMode === 'panel') await floatPanel();
      else await compositeRef.current?.float();
    } catch {
      setFloatError('This browser would not open the floating window.');
    }
  };

  const panel = (inFloatingWindow) => (
    <MonitorPanel
      panes={panes}
      hiddenCount={hiddenCount}
      studentCount={students.length}
      speakingNames={speakingNames}
      unreadMessages={unreadMessages}
      minimised={!inFloatingWindow && (minimised || floating)}
      sharing={sharing}
      dragHandle={inFloatingWindow ? undefined : { onPointerDown: startDrag, style: { cursor: 'grab', touchAction: 'none' } }}
      actions={(
        <>
          {floatMode && (
            <button
              type="button"
              className={headerButton}
              onClick={toggleFloat}
              aria-pressed={floating}
              title={floating ? 'Bring back into the room' : 'Keep on top of other windows'}
              aria-label={floating ? 'Bring the class monitor back into the room' : 'Keep the class monitor on top of other windows'}
            >
              <PictureInPicture2 className="size-4" aria-hidden="true" />
            </button>
          )}
          {!inFloatingWindow && !floating && (
            <button
              type="button"
              className={headerButton}
              onClick={toggleMinimised}
              aria-expanded={!minimised}
              title={minimised ? 'Show students' : 'Minimise'}
              aria-label={minimised ? 'Show students' : 'Minimise the class monitor'}
            >
              {minimised ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
            </button>
          )}
          {!inFloatingWindow && (
            <button type="button" className={headerButton} onClick={onClose} title="Close" aria-label="Close the class monitor">
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </>
      )}
    />
  );

  return (
    <>
      <div
        ref={panelRef}
        className="fixed z-30 overflow-hidden rounded-xl border border-ink-700 shadow-xl max-sm:hidden"
        style={{
          width: PANEL_WIDTH,
          ...(position ? clamp(position) : { right: EDGE + 4, bottom: 96 }),
        }}
      >
        {panel(false)}
        {floating && (
          <p className="border-t border-ink-700 bg-ink-900 px-3 py-2 text-[11px] text-ink-400">
            The class monitor is floating above your other windows.
          </p>
        )}
        {floatError && <p className="border-t border-ink-700 bg-ink-900 px-3 py-2 text-[11px] text-amber-300" role="alert">{floatError}</p>}
      </div>
      {floatingWindow && createPortal(panel(true), floatingWindow.document.body)}
    </>
  );
}
