import { useEffect, useState } from 'react';
import Alert from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import Tabs from '../../components/common/Tabs.jsx';
import TextField, { TextAreaField } from '../../components/common/TextField.jsx';
import { systemSettingsService } from '../../services/systemSettings.service.js';
import { getErrorMessage } from '../../utils/errors.js';

const PROVIDER_LABELS = { webrtc: 'WebRTC', zoom: 'Zoom' };

const PROVIDER_OPTIONS = [
  { value: 'webrtc', label: 'WebRTC' },
  { value: 'zoom', label: 'Zoom' },
];

/** The first field-level message from a validation response, if there is one. */
function detailMessage(error) {
  const details = error?.response?.data?.details;
  return Array.isArray(details) && details[0]?.message ? details[0].message : null;
}

/** "Set" / "Not set" for the declared-variables table. */
function setMark(set) {
  return set
    ? <span className="font-medium text-emerald-700">Set</span>
    : <span className="text-ink-400">Not set</span>;
}

export default function Settings() {
  const [roleTestingEnabled, setRoleTestingEnabled] = useState(false);
  const [integration, setIntegration] = useState('webrtc');
  const [webrtc, setWebrtc] = useState({ meteredTurnHost: '', meteredTurnApiKey: '', iceServersJson: '' });
  const [webrtcMeta, setWebrtcMeta] = useState({
    meteredTurnApiKeySet: false,
    envConfigured: { meteredTurnHost: false, meteredTurnApiKey: false, iceServers: false },
  });
  const [zoom, setZoom] = useState({ accountId: '', clientId: '', clientSecret: '' });
  const [zoomMeta, setZoomMeta] = useState({ clientSecretSet: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWebrtc, setSavingWebrtc] = useState(false);
  const [savingZoom, setSavingZoom] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Secrets are never sent back by the API; the loaded flags only say whether one is stored.
  const applySettings = (settings) => {
    setRoleTestingEnabled(settings.roleTestingEnabled);
    setIntegration(settings.classroomIntegration);
    setWebrtc({
      meteredTurnHost: settings.webrtc.meteredTurnHost,
      meteredTurnApiKey: '',
      iceServersJson: settings.webrtc.iceServersJson,
    });
    setWebrtcMeta({
      meteredTurnApiKeySet: settings.webrtc.meteredTurnApiKeySet,
      envConfigured: settings.webrtc.envConfigured,
    });
    setZoom({ accountId: settings.zoom.accountId, clientId: settings.zoom.clientId, clientSecret: '' });
    setZoomMeta({ clientSecretSet: settings.zoom.clientSecretSet });
  };

  useEffect(() => {
    let cancelled = false;
    systemSettingsService.get()
      .then((settings) => {
        if (!cancelled) applySettings(settings);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError, 'Unable to load system settings.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runUpdate = async (payload, { onSuccess, fallback }) => {
    setError('');
    setNotice('');
    try {
      const settings = await systemSettingsService.update(payload);
      applySettings(settings);
      onSuccess?.();
    } catch (updateError) {
      setError(detailMessage(updateError) ?? getErrorMessage(updateError, fallback));
    }
  };

  const setRoleTesting = async (enabled) => {
    if (enabled && !window.confirm(
      'Enabling this allows anyone to enter as an active administrator, teacher, or student account without a password. Continue only for a controlled test.',
    )) return;

    setSaving(true);
    await runUpdate(
      { roleTestingEnabled: enabled },
      {
        onSuccess: () => setNotice(`Temporary role testing ${enabled ? 'enabled' : 'disabled'}.`),
        fallback: 'Unable to update system settings.',
      },
    );
    setSaving(false);
  };

  const changeIntegration = async (value) => {
    if (value === integration || saving) return;
    setSaving(true);
    await runUpdate(
      { classroomIntegration: value },
      {
        onSuccess: () => setNotice(`Classrooms will use ${PROVIDER_LABELS[value]}.`),
        fallback: 'Unable to switch the classroom integration.',
      },
    );
    setSaving(false);
  };

  const saveWebRtc = async () => {
    setSavingWebrtc(true);
    const payload = {
      webrtc: {
        meteredTurnHost: webrtc.meteredTurnHost.trim(),
        iceServersJson: webrtc.iceServersJson,
      },
    };
    // Only send the key when the admin typed one; blank keeps the stored value.
    if (webrtc.meteredTurnApiKey.trim()) payload.webrtc.meteredTurnApiKey = webrtc.meteredTurnApiKey;
    await runUpdate(
      payload,
      { onSuccess: () => setNotice('WebRTC configuration saved.'), fallback: 'Unable to save the WebRTC configuration.' },
    );
    setSavingWebrtc(false);
  };

  const saveZoom = async () => {
    setSavingZoom(true);
    const payload = {
      zoom: {
        accountId: zoom.accountId.trim(),
        clientId: zoom.clientId.trim(),
      },
    };
    if (zoom.clientSecret.trim()) payload.zoom.clientSecret = zoom.clientSecret;
    await runUpdate(
      payload,
      { onSuccess: () => setNotice('Zoom credentials saved.'), fallback: 'Unable to save the Zoom credentials.' },
    );
    setSavingZoom(false);
  };

  const clearSecret = async (provider) => {
    const payload = provider === 'webrtc'
      ? { webrtc: { meteredTurnApiKey: '' } }
      : { zoom: { clientSecret: '' } };
    const setSavingState = provider === 'webrtc' ? setSavingWebrtc : setSavingZoom;
    setSavingState(true);
    await runUpdate(
      payload,
      { onSuccess: () => setNotice(`${PROVIDER_LABELS[provider]} secret cleared.`), fallback: 'Unable to clear the secret.' },
    );
    setSavingState(false);
  };

  const declaredVariables = [
    {
      name: 'METERED_TURN_HOST',
      purpose: 'TURN relay account subdomain, e.g. myschool.metered.live',
      here: Boolean(webrtc.meteredTurnHost),
      env: webrtcMeta.envConfigured.meteredTurnHost,
    },
    {
      name: 'METERED_TURN_API_KEY',
      purpose: 'API key for the TURN relay account',
      here: webrtcMeta.meteredTurnApiKeySet,
      env: webrtcMeta.envConfigured.meteredTurnApiKey,
    },
    {
      name: 'WEBRTC_ICE_SERVERS',
      purpose: 'Static JSON list of STUN/TURN servers, used when no relay account is saved',
      here: Boolean(webrtc.iceServersJson),
      env: webrtcMeta.envConfigured.iceServers,
    },
  ];

  const busy = loading || saving;
  const secretInputBusy = loading || saving || savingWebrtc || savingZoom;

  return (
    <>
      <PageHeader
        title="System Settings"
        description="Choose how live classrooms connect, and control temporary access used for testing."
      />

      <div className="max-w-3xl space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        <Card as="section" className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-xl">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-ink-900">Temporary role testing</h2>
                {loading ? (
                  <span className="flex items-center gap-1.5 text-xs text-ink-500"><Spinner className="size-3.5" /> Loading…</span>
                ) : (
                  <Badge tone={roleTestingEnabled ? 'danger' : 'neutral'}>{roleTestingEnabled ? 'Enabled' : 'Disabled'}</Badge>
                )}
                {saving && <span className="text-xs text-ink-500">Saving…</span>}
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                When enabled, anyone who can reach the login page can start a session as an active
                student, teacher, or administrator without credentials. The session uses that
                account’s access and data.
              </p>
              <p className="mt-2 text-sm leading-6 text-red-700">
                Enabling administrator testing grants visitors administrative access. Turn this off
                immediately after testing.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={roleTestingEnabled}
              aria-label="Temporary role testing"
              disabled={busy}
              onClick={() => setRoleTesting(!roleTestingEnabled)}
              className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${roleTestingEnabled ? 'bg-red-600' : 'bg-ink-300'}`}
            >
              <span className={`inline-block size-4.5 rounded-full bg-white transition-transform ${roleTestingEnabled ? 'translate-x-4.5' : 'translate-x-1'}`} />
            </button>
          </div>
        </Card>

        <Card as="section" className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-900">Classroom integration</h2>
            {loading ? (
              <span className="flex items-center gap-1.5 text-xs text-ink-500"><Spinner className="size-3.5" /> Loading…</span>
            ) : (
              <Badge tone={integration === 'zoom' ? 'warning' : 'success'}>
                {PROVIDER_LABELS[integration]} active
              </Badge>
            )}
            {saving && <span className="text-xs text-ink-500">Saving…</span>}
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Pick which integration live classrooms use. The active provider’s credentials are
            declared and saved right here; values saved here win over the server environment.
          </p>

          <div className="mt-4">
            <Tabs
              label="Classroom integration"
              options={PROVIDER_OPTIONS}
              value={integration}
              onChange={changeIntegration}
            />
          </div>

          {integration === 'webrtc' && (
            <div className="mt-5 space-y-4 border-t border-ink-200 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-ink-900">WebRTC credentials</h3>
                <p className="mt-1 text-sm leading-6 text-ink-600">
                  Classes connect browser to browser. A TURN relay carries the media when a direct
                  connection is blocked (strict networks, symmetric NAT). Save the relay account
                  here so it works without touching the server environment.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="webrtc-turn-host"
                  label="TURN relay host (Metered subdomain)"
                  placeholder="myschool.metered.live"
                  value={webrtc.meteredTurnHost}
                  onChange={(event) => setWebrtc({ ...webrtc, meteredTurnHost: event.target.value })}
                  disabled={secretInputBusy}
                />
                <TextField
                  id="webrtc-turn-key"
                  label="TURN API key"
                  type="password"
                  autoComplete="new-password"
                  placeholder={webrtcMeta.meteredTurnApiKeySet ? 'Saved — enter a new value to replace' : 'Not set'}
                  value={webrtc.meteredTurnApiKey}
                  onChange={(event) => setWebrtc({ ...webrtc, meteredTurnApiKey: event.target.value })}
                  disabled={secretInputBusy}
                  trailing={webrtcMeta.meteredTurnApiKeySet && !webrtc.meteredTurnApiKey ? (
                    <button
                      type="button"
                      onClick={() => clearSecret('webrtc')}
                      disabled={secretInputBusy}
                      className="text-xs font-medium text-ink-500 transition hover:text-ink-900 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  ) : null}
                />
              </div>

              <TextAreaField
                id="webrtc-ice"
                label="Static ICE servers JSON (optional)"
                rows={4}
                placeholder='[{"urls":"stun:stun.l.google.com:3478"}]'
                value={webrtc.iceServersJson}
                onChange={(event) => setWebrtc({ ...webrtc, iceServersJson: event.target.value })}
                disabled={secretInputBusy}
              />
              <p className="-mt-2 text-xs text-ink-500">
                Used when no TURN relay account is saved above. Must be a JSON array of
                {' '}<code className="text-ink-700">{'{"urls": …}'}</code> entries.
              </p>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Declared variables</h4>
                <div className="mt-2 overflow-x-auto rounded-lg border border-ink-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-ink-50 text-ink-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">Variable</th>
                        <th className="px-3 py-2 font-medium">Purpose</th>
                        <th className="px-3 py-2 font-medium">This setting</th>
                        <th className="px-3 py-2 font-medium">Server environment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 bg-white text-ink-700">
                      {declaredVariables.map((variable) => (
                        <tr key={variable.name}>
                          <td className="px-3 py-2 font-mono text-ink-900">{variable.name}</td>
                          <td className="px-3 py-2 text-ink-600">{variable.purpose}</td>
                          <td className="px-3 py-2">{setMark(variable.here)}</td>
                          <td className="px-3 py-2">{setMark(variable.env)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-xs text-ink-500">
                  The server environment column shows what the host (Render → Settings →
                  {' '}Environment) already provides. Values saved here win over those.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                {savingWebrtc && <span className="text-xs text-ink-500">Saving…</span>}
                <Button onClick={saveWebRtc} isLoading={savingWebrtc} disabled={busy}>
                  Save WebRTC settings
                </Button>
              </div>
            </div>
          )}

          {integration === 'zoom' && (
            <div className="mt-5 space-y-4 border-t border-ink-200 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-ink-900">Zoom credentials</h3>
                <Badge tone="warning">Planned — not yet in use</Badge>
              </div>

              <Alert tone="info">
                <p className="font-medium">How the Zoom integration will work</p>
                <ol className="mt-1 list-decimal space-y-1 pl-4">
                  <li>
                    Create a Server-to-Server OAuth app in the Zoom Marketplace and save its
                    Account ID, Client ID and Client Secret below.
                  </li>
                  <li>
                    The server exchanges them for an access token and creates a Zoom meeting for
                    every class session.
                  </li>
                  <li>
                    The class room embeds the Zoom Meeting SDK and joins with the meeting number
                    and a signature generated on the server.
                  </li>
                  <li>
                    Attendance and records stay in this app; Zoom only carries the audio and video.
                  </li>
                </ol>
              </Alert>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="zoom-account-id"
                  label="Account ID"
                  placeholder="abc123def456"
                  value={zoom.accountId}
                  onChange={(event) => setZoom({ ...zoom, accountId: event.target.value })}
                  disabled={secretInputBusy}
                />
                <TextField
                  id="zoom-client-id"
                  label="Client ID"
                  placeholder="Ab12Cd34Ef56"
                  value={zoom.clientId}
                  onChange={(event) => setZoom({ ...zoom, clientId: event.target.value })}
                  disabled={secretInputBusy}
                />
                <TextField
                  id="zoom-client-secret"
                  label="Client Secret"
                  type="password"
                  autoComplete="new-password"
                  placeholder={zoomMeta.clientSecretSet ? 'Saved — enter a new value to replace' : 'Not set'}
                  value={zoom.clientSecret}
                  onChange={(event) => setZoom({ ...zoom, clientSecret: event.target.value })}
                  disabled={secretInputBusy}
                  trailing={zoomMeta.clientSecretSet && !zoom.clientSecret ? (
                    <button
                      type="button"
                      onClick={() => clearSecret('zoom')}
                      disabled={secretInputBusy}
                      className="text-xs font-medium text-ink-500 transition hover:text-ink-900 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  ) : null}
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                {savingZoom && <span className="text-xs text-ink-500">Saving…</span>}
                <Button onClick={saveZoom} isLoading={savingZoom} disabled={busy}>
                  Save Zoom credentials
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
