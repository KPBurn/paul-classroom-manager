import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import Alert from '../common/Alert.jsx';
import Button, { IconButton } from '../common/Button.jsx';
import { inputClass } from '../common/TextField.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { sortSlots, WEEKDAYS } from '../../utils/schedule.js';

const NEW_SLOT = { weekday: 1, startTime: '09:00', endTime: '17:00' };

/**
 * Edits the weekly times a teacher can teach: one row per time slot, several
 * per day if needed. `onSave` receives the slots and should reject on failure.
 */
export default function AvailabilityEditor({ initial = [], onSave, onCancel, saveLabel = 'Save availability' }) {
  const [slots, setSlots] = useState(() => sortSlots(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (index, field, value) => setSlots((current) => current.map((slot, position) => (
    position === index ? { ...slot, [field]: value } : slot
  )));

  const submit = async (event) => {
    event.preventDefault();
    if (slots.some((slot) => !slot.startTime || !slot.endTime || slot.endTime <= slot.startTime)) {
      setError('Each time slot needs an end time after its start time.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = sortSlots(slots);
      await onSave(saved);
      setSlots(saved);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save availability.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {slots.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-300 px-4 py-6 text-center text-sm text-ink-500">
          No availability yet. Add the days and hours when classes can be scheduled.
        </p>
      ) : (
        <ul className="space-y-2">
          {slots.map((slot, index) => (
            // Slots have no identity of their own; the row position is stable while editing.
            <li key={index} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_auto]">
              <select
                aria-label={`Day for slot ${index + 1}`}
                value={slot.weekday}
                onChange={(event) => change(index, 'weekday', Number(event.target.value))}
                className={inputClass(false, 'h-10.5 pr-8 max-sm:col-span-2')}
              >
                {WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
              <input
                type="time"
                aria-label={`Start time for slot ${index + 1}`}
                value={slot.startTime}
                onChange={(event) => change(index, 'startTime', event.target.value)}
                className={inputClass(false)}
              />
              <input
                type="time"
                aria-label={`End time for slot ${index + 1}`}
                value={slot.endTime}
                onChange={(event) => change(index, 'endTime', event.target.value)}
                className={inputClass(slot.endTime <= slot.startTime)}
              />
              <IconButton
                label={`Remove slot ${index + 1}`}
                icon={Trash2}
                tone="danger"
                onClick={() => setSlots((current) => current.filter((_, position) => position !== index))}
                className="max-sm:col-start-2 max-sm:row-start-1"
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSlots((current) => [...current, { ...NEW_SLOT, weekday: ((current.at(-1)?.weekday ?? 0) + 1) % 7 }])}
          disabled={saving || slots.length >= 42}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add time slot
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {onCancel && <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>}
          <Button type="submit" isLoading={saving}>{saveLabel}</Button>
        </div>
      </div>
    </form>
  );
}
