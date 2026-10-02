import { useEffect, useState } from 'react';
import Alert from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Card from '../../components/common/Card.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { systemSettingsService } from '../../services/systemSettings.service.js';
import { getErrorMessage } from '../../utils/errors.js';

export default function Settings() {
  const [roleTestingEnabled, setRoleTestingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    systemSettingsService.get()
      .then((settings) => {
        if (!cancelled) setRoleTestingEnabled(settings.roleTestingEnabled);
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

  const setRoleTesting = async (enabled) => {
    if (enabled && !window.confirm(
      'Enabling this allows anyone to enter as an active administrator, teacher, or student account without a password. Continue only for a controlled test.',
    )) return;

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const settings = await systemSettingsService.update({ roleTestingEnabled: enabled });
      setRoleTestingEnabled(settings.roleTestingEnabled);
      setNotice(`Temporary role testing ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (updateError) {
      setError(getErrorMessage(updateError, 'Unable to update system settings.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="System Settings"
        description="Control temporary access used for live role testing."
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
              disabled={loading || saving}
              onClick={() => setRoleTesting(!roleTestingEnabled)}
              className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${roleTestingEnabled ? 'bg-red-600' : 'bg-ink-300'}`}
            >
              <span className={`inline-block size-4.5 rounded-full bg-white transition-transform ${roleTestingEnabled ? 'translate-x-4.5' : 'translate-x-1'}`} />
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
