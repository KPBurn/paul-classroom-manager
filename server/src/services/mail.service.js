import { env, isTest } from '../config/environment.js';

const RESEND_URL = 'https://api.resend.com/emails';

/** In tests nothing is sent; the messages are kept here so a test can read them. */
export const testOutbox = [];

export const mailConfigured = () => Boolean(env.resendApiKey) || isTest;

/**
 * Sends a plain-text email. Sending must never break the request that caused
 * it, so a failure is reported in the log and `false` is returned.
 */
export async function sendMail({ to, subject, text }, fetchImpl = fetch) {
  if (isTest) {
    testOutbox.push({ to, subject, text });
    return true;
  }
  if (!env.resendApiKey) {
    console.warn(`Email not sent (RESEND_API_KEY is not set): "${subject}" to ${to}`);
    return false;
  }
  try {
    const response = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.mailFrom, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`Email "${subject}" was refused by the mail service`, response.status, await response.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Unable to send email "${subject}"`, error.name);
    return false;
  }
}

const SIGN_OFF = '\n\nClassroom Manager';
const link = (path) => `${env.appUrl}${path}`;
const classLine = ({ subject, name }) => `  - ${[subject, name].filter(Boolean).join(' / ')}`;

export const sendApplicationReceived = ({ to, firstName, referenceNumber }) => sendMail({
  to,
  subject: `Your enrollment application ${referenceNumber}`,
  text: `Hello ${firstName},

We received your enrollment application.

Your reference number is ${referenceNumber}

Keep it: with the student's birthday it is how you check your status and create your account once you are approved.

Check your status: ${link(`/enroll/status?ref=${referenceNumber}`)}${SIGN_OFF}`,
});

/** `classes` are `{ subject, name, status }` for each class asked for; empty for an applicant who chose none. */
export function sendApplicationDecided({ to, firstName, referenceNumber, status, classes, adminNote, hasAccount }) {
  const approved = classes.filter((item) => item.status === 'approved');
  const rejected = classes.filter((item) => item.status === 'rejected');
  const pending = classes.filter((item) => item.status === 'pending');
  const lines = [
    `Hello ${firstName},`,
    '',
    status === 'rejected'
      ? `Your school reviewed your enrollment request ${referenceNumber} and did not approve it.`
      : `Your school reviewed your enrollment request ${referenceNumber}.`,
    ...(approved.length ? ['', 'Approved:', ...approved.map(classLine)] : []),
    ...(rejected.length ? ['', 'Not approved:', ...rejected.map(classLine)] : []),
    ...(pending.length ? ['', 'Still being reviewed:', ...pending.map(classLine)] : []),
    ...(status === 'approved' && !classes.length ? ['', 'You have been approved.'] : []),
    ...(adminNote ? ['', `Note from your school: ${adminNote}`] : []),
    '',
    status === 'approved' && !hasAccount
      ? `Next step: create your account, then sign in and open My Classrooms to choose your classes.\n${link(`/enroll/status?ref=${referenceNumber}`)}`
      : status === 'approved'
        ? `Sign in to see your classes: ${link('/login')}`
        : `You can check the details here: ${link(`/enroll/status?ref=${referenceNumber}`)}`,
  ];
  return sendMail({ to, subject: `Update on your enrollment ${referenceNumber}`, text: `${lines.join('\n')}${SIGN_OFF}` });
}

export const sendReferenceReminder = ({ to, firstName, referenceNumbers }) => sendMail({
  to,
  subject: 'Your enrollment reference number',
  text: `Hello ${firstName},

You asked for your enrollment reference number.

${referenceNumbers.join('\n')}

Check your status: ${link('/enroll/status')}

If you did not ask for this, you can ignore this email.${SIGN_OFF}`,
});

export const sendPasswordReset = ({ to, firstName, token, minutes }) => sendMail({
  to,
  subject: 'Reset your Classroom Manager password',
  text: `Hello ${firstName},

Use this link to choose a new password. It works once and for ${minutes} minutes.

${link(`/reset-password?token=${token}`)}

If you did not ask for this, you can ignore this email: your password stays the same.${SIGN_OFF}`,
});
