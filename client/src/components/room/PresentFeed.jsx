import { Eye, EyeOff, Maximize2, Minimize2, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ParticipantTile from './ParticipantTile.jsx';
import { FEED_ROW_HEIGHTS } from './presentFeed.js';

const menuItem = 'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink-200 transition hover:bg-ink-700 hover:text-white focus-visible:outline-2 focus-visible:outline-white';

/**
 * The people in the room while a class is being presented: a floating menu that
 * shows or hides them, plus the row itself docked under the shared screen.
 *
 * The row sits beneath the presentation instead of beside or over it, so a wide
 * screen stays wide and no feed covers the content. Mounted only while a
 * presentation is active, so every presentation starts with the row showing.
 */
export default function PresentFeed({ participants, isLocalId }) {
  const [open, setOpen] = useState(true);
  const [size, setSize] = useState('small');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on a click outside or Escape, like the room's other menus.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  return (
    <>
      <div ref={menuRef} className="absolute right-3 top-3 z-20">
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls="present-feed-menu"
          aria-label="Feeds while presenting"
          title="Feeds while presenting"
          className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white"
        >
          <UsersRound className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Feeds</span>
          <span className={`size-1.5 rounded-full ${open ? 'bg-emerald-400' : 'bg-ink-500'}`} aria-hidden="true" />
        </button>
        {menuOpen && (
          <div
            id="present-feed-menu"
            role="menu"
            className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 p-1 shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => setOpen((current) => !current)}
              className={menuItem}
            >
              {open ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              {open ? 'Hide the feeds' : 'Show the feeds'}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!open}
              onClick={() => setSize((current) => (current === 'large' ? 'small' : 'large'))}
              className={`${menuItem} disabled:opacity-50`}
            >
              {size === 'large'
                ? <Minimize2 className="size-4" aria-hidden="true" />
                : <Maximize2 className="size-4" aria-hidden="true" />}
              {size === 'large' ? 'Small tiles' : 'Large tiles'}
            </button>
            <p className="border-t border-ink-700 px-2.5 py-2 text-[11px] leading-4 text-ink-500">
              Your view only: nobody else&apos;s screen changes.
            </p>
          </div>
        )}
      </div>

      {open && participants.length > 0 && (
        <div
          className={`flex shrink-0 gap-2 overflow-x-auto rounded-lg border border-ink-800/70 bg-black/50 p-2 ${FEED_ROW_HEIGHTS[size]}`}
          aria-label="People in the room while you present"
        >
          {participants.map((participant) => (
            <ParticipantTile
              key={participant.id}
              participant={participant}
              isLocal={participant.id === isLocalId}
              size="feed"
            />
          ))}
        </div>
      )}
    </>
  );
}