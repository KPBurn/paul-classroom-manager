import { CircleCheck, CircleX, Clock } from 'lucide-react';

/** How each enrollment status is labelled; the icon means the status never relies on colour alone. */
export const ENROLLMENT_STATUS = {
  pending: { label: 'Pending', tone: 'warning', icon: Clock },
  approved: { label: 'Approved', tone: 'success', icon: CircleCheck },
  rejected: { label: 'Not approved', tone: 'danger', icon: CircleX },
};

/** A window event: the number of applications waiting for a decision may have changed. */
export const ENROLLMENT_CHANGED_EVENT = 'enrollment:changed';

export const GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};

/** Age in whole years from a "YYYY-MM-DD" birthday, or `null` when it is not a past date. */
export function ageFrom(birthday, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday ?? '')) return null;
  const [year, month, day] = birthday.split('-').map(Number);
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  const age = today.getFullYear() - year - (hadBirthday ? 0 : 1);
  return age >= 0 && age < 130 ? age : null;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

/** A "YYYY-MM-DD" calendar date, written out without shifting it into the reader's timezone. */
export function formatCalendarDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year, month - 1, day));
}
