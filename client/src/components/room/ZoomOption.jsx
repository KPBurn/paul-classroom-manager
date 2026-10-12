import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import Alert from '../common/Alert.jsx';
import Button from '../common/Button.jsx';
import { sessionService } from '../../services/session.service.js';
import { getErrorMessage } from '../../utils/errors.js';

const DETAILS = {
  host: (session) => (session.zoomMeeting
    ? 'This class is held in Zoom. You open it as the host.'
    : 'This class is held in Zoom. Your students get a Join in Zoom button once you start it.'),
  join: () => 'This class is held in Zoom.',
  waiting: () => 'This class is held in Zoom. Your teacher has not started the meeting yet; this page updates when they do.',
  unavailable: (_session, canManageRoom) => (canManageRoom
    ? 'This class is set to Zoom, but Zoom is switched off for the school. Move it back to the class room, or ask an administrator to switch Zoom on.'
    : 'This class is set to Zoom, but Zoom is not available right now. Ask your teacher.'),
};

/**
 * How to get into a class held in Zoom: the teacher opens the meeting as
 * host, students join it. `state` comes from `lobbyMeeting`. The link is
 * asked for when the button is pressed, so it is never kept in the page.
 */
export default function ZoomOption({ session, state, canManageRoom }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  // Set when the browser blocked the new tab, so the link can be opened by hand.
  const [blockedUrl, setBlockedUrl] = useState(null);

  const open = async () => {
    // Opened while the click still counts: a tab opened after waiting for the API is blocked as a pop-up.
    const tab = window.open('', '_blank');
    setOpening(true);
    setError('');
    setBlockedUrl(null);
    try {
      const { url } = state === 'host'
        ? await sessionService.openZoom(session.id)
        : await sessionService.zoomLink(session.id);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        setBlockedUrl(url);
      }
    } catch (openError) {
      tab?.close();
      setError(getErrorMessage(openError, 'Unable to open Zoom.'));
    } finally {
      setOpening(false);
    }
  };

  const limit = session.zoom?.timeLimitMinutes;
  const ready = state === 'host' || state === 'join';

  return (
    <section className="mt-5" aria-labelledby="lobby-zoom">
      <h2 id="lobby-zoom" className="text-sm font-medium">Zoom</h2>
      <p className="mt-1.5 text-sm text-ink-300" aria-live="polite">
        {DETAILS[state](session, canManageRoom)}
        {ready && limit > 0 && ` Zoom ends the meeting after ${limit} minutes.`}
        {ready && (canManageRoom
          ? ' Students are checked in when they open Join in Zoom. Absences are not marked automatically; mark them on the Schedule page.'
          : ' Opening Join in Zoom checks you in.')}
      </p>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      {blockedUrl && (
        <p className="mt-3 text-sm text-ink-300" role="status">
          Your browser blocked the new tab.{' '}
          <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-ink-100 underline">
            Open Zoom
          </a>
        </p>
      )}
      {ready && (
        <Button variant="inverse" size="lg" className="mt-4 w-full sm:w-auto" onClick={open} isLoading={opening}>
          {!opening && <ExternalLink className="size-5" aria-hidden="true" />}
          {state === 'host' ? (session.zoomMeeting ? 'Open Zoom as host' : 'Start in Zoom') : 'Join in Zoom'}
        </Button>
      )}
    </section>
  );
}
