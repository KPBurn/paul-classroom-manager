import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import Alert from '../common/Alert.jsx';
import Button from '../common/Button.jsx';
import { sessionService } from '../../services/session.service.js';
import { getErrorMessage } from '../../utils/errors.js';

/**
 * Zoom, offered beside the class room when the school has set it up. A
 * teacher adds the meeting and opens it as host; once there is one, everyone
 * allowed into the class can join it. The link is asked for when the button
 * is pressed, so it is never kept in the page.
 */
export default function ZoomOption({ session, canManageRoom }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  // Set when the browser blocked the new tab, so the link can be opened by hand.
  const [blockedUrl, setBlockedUrl] = useState(null);
  if (!session.zoom?.enabled || (!canManageRoom && !session.zoomMeeting)) return null;

  const open = async () => {
    // Opened while the click still counts: a tab opened after waiting for the API is blocked as a pop-up.
    const tab = window.open('', '_blank');
    setOpening(true);
    setError('');
    setBlockedUrl(null);
    try {
      const { url } = canManageRoom
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

  const limit = session.zoom.timeLimitMinutes;
  const detail = canManageRoom
    ? session.zoomMeeting
      ? 'This class has a Zoom meeting. You open it as the host.'
      : 'You can also run this class in Zoom. Your students get a Join in Zoom button once you start it.'
    : 'Your teacher is also running this class in Zoom.';

  return (
    <section className="mt-7 border-t border-ink-800 pt-5" aria-labelledby="lobby-zoom">
      <h2 id="lobby-zoom" className="text-sm font-medium">Zoom</h2>
      <p className="mt-1.5 text-sm text-ink-300">
        {detail}
        {limit > 0 && ` Zoom ends the meeting after ${limit} minutes.`}
        {' '}Attendance is only recorded in the class room.
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
      <Button variant="dark" className="mt-3" onClick={open} isLoading={opening}>
        {!opening && <ExternalLink className="size-4" aria-hidden="true" />}
        {canManageRoom ? (session.zoomMeeting ? 'Open Zoom as host' : 'Start in Zoom') : 'Join in Zoom'}
      </Button>
    </section>
  );
}
