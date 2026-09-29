export const ATTENDANCE_GRACE_PERIOD_MS = 5 * 60 * 1000;

export function attendanceStatusForCheckIn(startsAt, checkedInAt) {
  return checkedInAt.getTime() - startsAt.getTime() > ATTENDANCE_GRACE_PERIOD_MS ? 'late' : 'present';
}
