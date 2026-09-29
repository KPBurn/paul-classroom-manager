import { useEffect, useState } from 'react';
import Alert from '../../components/common/Alert.jsx';
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

      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}
        <section className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <h2 className="font-semibold text-slate-900">Temporary role testing</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                When enabled, anyone who can reach the login page can start a session as an active
                student, teacher, or administrator without credentials. The session uses that
                account’s access and data.
              </p>
              <p className="mt-3 text-sm font-semibold leading-6 text-rose-700">
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
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${roleTestingEnabled ? 'bg-rose-600' : 'bg-slate-300'}`}
            >
              <span className={`inline-block size-5 transform rounded-full bg-white shadow transition ${roleTestingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm">
            {loading ? (
              <><Spinner /> <span className="text-slate-500">Loading setting…</span></>
            ) : (
              <>
                <span className={`size-2 rounded-full ${roleTestingEnabled ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <span className="font-medium text-slate-700">{roleTestingEnabled ? 'Enabled' : 'Disabled'}</span>
                {saving && <span className="text-slate-500">Saving…</span>}
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
