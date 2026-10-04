import { useEffect, useState } from 'react';
import Alert from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { inputClass, labelClass } from '../../components/common/TextField.jsx';
import { systemSettingsService } from '../../services/systemSettings.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatAmount } from '../../utils/format.js';

export default function Settings() {
  const [roleTestingEnabled, setRoleTestingEnabled] = useState(false);
  const [defaultSessionRate, setDefaultSessionRate] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    systemSettingsService.get()
      .then((settings) => {
        if (!cancelled) {
          setRoleTestingEnabled(settings.roleTestingEnabled);
          setDefaultSessionRate(String(settings.defaultSessionRate));
        }
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

  /** The class rate is what every new schedule pays for a full session. */
  const saveRate = async (event) => {
    event.preventDefault();
    const value = Number(defaultSessionRate);
    if (!Number.isFinite(value) || value < 0) {
      setError('Enter a class rate of zero or more.');
      return;
    }
    setSavingRate(true);
    setError('');
    setNotice('');
    try {
      const settings = await systemSettingsService.update({ defaultSessionRate: value });
      setDefaultSessionRate(String(settings.defaultSessionRate));
      setNotice(`New schedules now pay ${formatAmount(settings.defaultSessionRate)} for a full class.`);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to update the class rate.'));
    } finally {
      setSavingRate(false);
    }
  };

  return (
    <>
      <PageHeader
        title="System Settings"
        description="The rate a class pays its teacher, and temporary access used for live role testing."
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

        <Card as="section" className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-ink-900">Class rate</h2>
                {savingRate && <span className="text-xs text-ink-500">Saving...</span>}
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                What every class pays a teacher who is in the room for the whole session: currently{' '}
                <span className="font-medium tabular-nums text-ink-900">
                  {formatAmount(defaultSessionRate || 0)}
                </span>
                . A shorter visit earns this rate pro rata. Schedules made earlier keep the rate they were created
                with, so changing this only affects new classes.
              </p>
            </div>
            <form onSubmit={saveRate} className="flex items-end gap-2">
              <label className={labelClass} htmlFor="class-rate">
                Rate per class
                <input
                  id="class-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={defaultSessionRate}
                  onChange={(event) => setDefaultSessionRate(event.target.value)}
                  className={`${inputClass(false, 'mt-1.5 font-normal')} w-36`}
                />
              </label>
              <Button type="submit" size="sm" isLoading={savingRate} disabled={loading}>
                Save
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
