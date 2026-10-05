import { ArrowLeft, ArrowRight, Check, Copy, ImagePlus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Alert, { ErrorState } from '../../components/common/Alert.jsx';
import Button, { ButtonLink } from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import TextField, { SelectField, TextAreaField } from '../../components/common/TextField.jsx';
import ClassPicker from '../../components/enrollment/ClassPicker.jsx';
import { ageFrom, formatCalendarDate, GENDER_LABELS } from '../../components/enrollment/enrollmentMeta.js';
import PublicPage from '../../components/enrollment/PublicPage.jsx';
import { enrollmentService } from '../../services/enrollment.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatSchedule } from '../../utils/schedule.js';

const STEPS = ['Student', 'Guardian', 'Classes', 'Photo', 'Review'];
const PHOTO_SIDE = 600;
const CLASS_REFRESH_MS = 20_000;
const GENDER_OPTIONS = [
  { value: '', label: 'Select (optional)' },
  ...Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label })),
];

// Keep in sync with server/src/validators/enrollment.validators.js.
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const isContactNumber = (value) => /^\+?[\d\s()-]{7,20}$/.test(value.trim());
const today = () => new Date().toLocaleDateString('en-CA');

/** What is wrong on a step, as `{ fieldId: message }`. An empty object means the step can be left. */
function problemsOn(step, { student, guardian, agreed }) {
  const problems = {};
  if (step === 0) {
    if (!student.firstName.trim()) problems['student-first-name'] = 'Enter the student’s first name.';
    if (!student.lastName.trim()) problems['student-last-name'] = 'Enter the student’s last name.';
    if (ageFrom(student.birthday) === null || student.birthday < '1900-01-01') problems['student-birthday'] = 'Enter the student’s birthday.';
    if (!isContactNumber(student.contactNumber)) problems['student-contact'] = 'Enter a contact number, such as 0917 123 4567.';
    if (!isEmail(student.email)) problems['student-email'] = 'Enter a valid email address.';
  }
  if (step === 1) {
    if (!guardian.name.trim()) problems['guardian-name'] = 'Enter the parent or guardian’s name.';
    if (!guardian.relationship.trim()) problems['guardian-relationship'] = 'Enter their relationship to the student.';
    if (!isContactNumber(guardian.contactNumber)) problems['guardian-contact'] = 'Enter a contact number, such as 0917 123 4567.';
    if (guardian.email.trim() && !isEmail(guardian.email)) problems['guardian-email'] = 'Enter a valid email address, or leave it empty.';
  }
  if (step === 4 && !agreed) problems.agreed = 'Confirm the statement to submit your application.';
  return problems;
}

/** Crops an image to a centred square of at most 600px and returns it as a JPEG, small enough to upload anywhere. */
async function squarePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(side, PHOTO_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Unable to read the photo'))), 'image/jpeg', 0.9);
  });
}

function StepList({ current }) {
  return (
    <ol className="mb-5 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Application steps">
      {STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? 'step' : undefined}
          className={`flex items-center gap-1.5 ${index === current ? 'font-semibold text-ink-900' : index < current ? 'text-ink-600' : 'text-ink-400'}`}
        >
          <span className={`flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums ${index < current ? 'bg-ink-900 text-white' : index === current ? 'border border-ink-900' : 'border border-ink-300'}`}>
            {index < current ? <Check className="size-3" aria-hidden="true" /> : index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function ReviewList({ title, rows }) {
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wider text-ink-500">{title}</h3>
      <dl className="mt-2 divide-y divide-ink-200 rounded-lg border border-ink-200">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="grid gap-0.5 px-3 py-2 sm:grid-cols-3 sm:gap-4">
            <dt className="text-sm text-ink-500">{label}</dt>
            <dd className="wrap-break-word text-sm text-ink-900 sm:col-span-2">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Shown after submitting: the reference number is the only way back to the application, so it leads. */
function Submitted({ result, photoFailed }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.referenceNumber);
      toast.success('Reference number copied.');
    } catch {
      toast.error('Unable to copy. Write the number down instead.');
    }
  };

  return (
    <PublicPage title="Application submitted" description="Your school will review it. You finish enrolling inside the portal once you are approved.">
      <Card className="space-y-5 p-5 sm:p-6">
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-5 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">Your reference number</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-wider text-ink-900 sm:text-3xl">{result.referenceNumber}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={copy}>
            <Copy className="size-4" aria-hidden="true" />
            Copy number
          </Button>
        </div>
        <Alert tone="warning">
          Keep this number. With the student’s birthday it is how you check your status and create your account once you
          are approved. We have also emailed it to the address on the application.
        </Alert>
        {photoFailed && (
          <Alert>Your application was received, but the photo could not be uploaded. You can give it to your school later.</Alert>
        )}
        <div>
          <h2 className="text-sm font-semibold text-ink-900">What happens next</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-600">
            <li>Your application is <span className="font-medium text-ink-900">pending</span> until the school reviews it.</li>
            <li>Check the status any time with your reference number and birthday.</li>
            <li>Once you are approved, create your account on the same page and sign in.</li>
            <li>Inside the portal, open My Classrooms to choose your classes and finish enrolling.</li>
          </ol>
        </div>
        <div className="flex flex-col gap-2 border-t border-ink-200 pt-4 sm:flex-row sm:justify-end">
          <ButtonLink to="/" variant="secondary">Back to home</ButtonLink>
          <ButtonLink to={`/enroll/status?ref=${result.referenceNumber}`}>Check status</ButtonLink>
        </div>
      </Card>
    </PublicPage>
  );
}

export default function Enroll() {
  const [classes, setClasses] = useState(null);
  // Sent back with the application; the server uses it to tell a person at the form from a script.
  const formToken = useRef('');
  const [website, setWebsite] = useState('');
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(0);
  const [student, setStudent] = useState({
    firstName: '', middleName: '', lastName: '', birthday: '', gender: '', address: '', contactNumber: '', email: '',
  });
  const [guardian, setGuardian] = useState({ name: '', relationship: '', contactNumber: '', email: '' });
  const [classroomIds, setClassroomIds] = useState([]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null); // { blob, url }
  const [agreed, setAgreed] = useState(false);
  const [problems, setProblems] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const formRef = useRef(null);
  const fileRef = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadError('');
    try {
      const open = await enrollmentService.openClasses();
      setClasses(open.items);
      // The first token is kept: it shows how long the form has been open.
      formToken.current ||= open.formToken;
    } catch (error) {
      if (!quiet) setLoadError(getErrorMessage(error, 'Unable to load the classes.'));
    }
  }, []);

  useEffect(() => {
    load();
    // There is no account to notify yet, so the class list (and how many seats are left) is checked again regularly.
    const timer = window.setInterval(() => load({ quiet: true }), CLASS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // The preview is an object URL, which the browser keeps until it is released.
  useEffect(() => () => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
  }, [photo]);

  // Each step starts at its heading, so a screen reader and a phone both land at the top.
  useEffect(() => {
    formRef.current?.querySelector('h2')?.focus();
  }, [step]);

  const field = (group, setGroup, key, id) => ({
    id,
    value: group[key],
    error: problems[id],
    onChange: (event) => {
      setGroup((current) => ({ ...current, [key]: event.target.value }));
      setProblems((current) => ({ ...current, [id]: undefined }));
    },
  });
  const studentField = (key, id) => field(student, setStudent, key, id);
  const guardianField = (key, id) => field(guardian, setGuardian, key, id);

  const next = () => {
    const found = problemsOn(step, { student, guardian, agreed });
    setProblems(found);
    const [firstId] = Object.keys(found);
    if (firstId) {
      formRef.current?.querySelector(`#${firstId}`)?.focus();
      return false;
    }
    return true;
  };

  const choosePhoto = async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      const blob = await squarePhoto(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      setProblems((current) => ({ ...current, photo: undefined }));
    } catch {
      setProblems((current) => ({ ...current, photo: 'That file could not be read as a photo. Choose a JPEG or PNG image.' }));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      if (next()) setStep(step + 1);
      return;
    }
    if (!next()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const application = await enrollmentService.submit({
        student, guardian, classroomIds, note, agreed, website, formToken: formToken.current,
      });
      if (photo) {
        try {
          await enrollmentService.uploadPhoto(application.referenceNumber, photo.blob);
        } catch {
          // The photo is optional: the application stands without it.
          setPhotoFailed(true);
        }
      }
      setResult(application);
    } catch (error) {
      const [detail] = error.response?.data?.details ?? [];
      setSubmitError(detail?.message ?? getErrorMessage(error, 'Unable to submit your application.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) return <Submitted result={result} photoFailed={photoFailed} />;

  const age = ageFrom(student.birthday);
  const chosen = (classes ?? []).filter((item) => classroomIds.includes(item.id));

  return (
    <PublicPage
      title="Apply for enrollment"
      description="Tell us who is applying. You do not need an account yet: your school reviews the application first, and you choose or confirm your classes inside the portal afterwards. Your details are used only for this enrollment."
    >
      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : !classes ? (
        <PageLoader label="Loading classes…" />
      ) : (
        <>
          <StepList current={step} />
          <Card>
            <form ref={formRef} onSubmit={submit} noValidate className="space-y-5 p-5 sm:p-6">
              {/* People never see or reach this field; a script that fills in every field gives itself away. */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </div>
              {step === 0 && (
                <>
                  <h2 tabIndex={-1} className="text-base font-semibold text-ink-900 outline-none">Student information</h2>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <TextField label="First name" required maxLength={50} autoComplete="given-name" {...studentField('firstName', 'student-first-name')} />
                    <TextField label="Middle name (optional)" maxLength={50} autoComplete="additional-name" {...studentField('middleName', 'student-middle-name')} />
                    <TextField label="Last name" required maxLength={50} autoComplete="family-name" {...studentField('lastName', 'student-last-name')} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <TextField label="Birthday" type="date" required max={today()} min="1900-01-01" autoComplete="bday" {...studentField('birthday', 'student-birthday')} />
                      {age !== null && <p className="mt-1 text-xs text-ink-500">Age: {age}</p>}
                    </div>
                    <SelectField label="Gender" options={GENDER_OPTIONS} {...studentField('gender', 'student-gender')} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Contact number" type="tel" required maxLength={20} autoComplete="tel" placeholder="0917 123 4567" {...studentField('contactNumber', 'student-contact')} />
                    <div>
                      <TextField label="Email address" type="email" required autoComplete="email" {...studentField('email', 'student-email')} />
                      <p className="mt-1 text-xs text-ink-500">You will sign in with this email once you are approved.</p>
                    </div>
                  </div>
                  <TextField label="Address (optional)" maxLength={300} autoComplete="street-address" {...studentField('address', 'student-address')} />
                </>
              )}

              {step === 1 && (
                <>
                  <h2 tabIndex={-1} className="text-base font-semibold text-ink-900 outline-none">Parent or guardian</h2>
                  <p className="-mt-3 text-sm text-ink-500">The person the school contacts about this student.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Full name" required maxLength={100} autoComplete="off" {...guardianField('name', 'guardian-name')} />
                    <TextField label="Relationship to the student" required maxLength={50} placeholder="For example, Mother" autoComplete="off" {...guardianField('relationship', 'guardian-relationship')} />
                    <TextField label="Contact number" type="tel" required maxLength={20} autoComplete="off" placeholder="0917 123 4567" {...guardianField('contactNumber', 'guardian-contact')} />
                    <TextField label="Email address (optional)" type="email" autoComplete="off" {...guardianField('email', 'guardian-email')} />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <h2 tabIndex={-1} className="text-base font-semibold text-ink-900 outline-none">Classes you want to join — optional</h2>
                  <p className="-mt-3 text-sm text-ink-500">
                    Choose any classes you already know you want, or skip this step. After you are approved you choose
                    your classes inside the portal, and your school decides each one.
                  </p>
                  {classes.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-ink-300 px-4 py-6 text-center text-sm text-ink-500">
                      No classes are open yet. You can still apply and choose your classes later inside the portal.
                    </p>
                  ) : (
                    <ClassPicker classes={classes} selectedIds={classroomIds} onChange={setClassroomIds} />
                  )}
                  <TextAreaField
                    id="application-note"
                    label="Note to the school (optional)"
                    rows={3}
                    maxLength={500}
                    count={note.length}
                    placeholder="Anything the school should know before placing you"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </>
              )}

              {step === 3 && (
                <>
                  <h2 tabIndex={-1} className="text-base font-semibold text-ink-900 outline-none">2x2 photo — optional</h2>
                  <p className="-mt-3 text-sm text-ink-500">
                    A recent photo of the student for the school’s records. You can submit without one and provide it later.
                  </p>
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                    {photo ? (
                      <img src={photo.url} alt="The chosen 2x2 photo" className="size-32 rounded-lg border border-ink-200 object-cover" />
                    ) : (
                      <div className="flex size-32 items-center justify-center rounded-lg border border-dashed border-ink-300 text-ink-400">
                        <ImagePlus className="size-6" aria-hidden="true" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a 2x2 photo" onChange={choosePhoto} />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                          <ImagePlus className="size-4" aria-hidden="true" />
                          {photo ? 'Choose another photo' : 'Choose a photo'}
                        </Button>
                        {photo && (
                          <Button variant="ghost" onClick={() => setPhoto(null)}>
                            <Trash2 className="size-4" aria-hidden="true" />
                            Remove
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-ink-500">JPEG, PNG or WebP. It is cropped to a square automatically.</p>
                      {problems.photo && <p className="text-sm text-red-700">{problems.photo}</p>}
                    </div>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <h2 tabIndex={-1} className="text-base font-semibold text-ink-900 outline-none">Review and submit</h2>
                  <ReviewList
                    title="Student"
                    rows={[
                      ['Name', [student.firstName, student.middleName, student.lastName].map((part) => part.trim()).filter(Boolean).join(' ')],
                      ['Birthday', student.birthday && `${formatCalendarDate(student.birthday)} (age ${age})`],
                      ['Gender', GENDER_LABELS[student.gender]],
                      ['Contact number', student.contactNumber],
                      ['Email', student.email],
                      ['Address', student.address],
                    ]}
                  />
                  <ReviewList
                    title="Parent or guardian"
                    rows={[
                      ['Name', guardian.name],
                      ['Relationship', guardian.relationship],
                      ['Contact number', guardian.contactNumber],
                      ['Email', guardian.email],
                    ]}
                  />
                  <ReviewList
                    title="Enrollment"
                    rows={[
                      ['Classes', chosen.length === 0 ? 'None chosen yet. You will choose inside the portal after you are approved.' : (
                        <ul key="classes" className="space-y-1">
                          {chosen.map((item) => (
                            <li key={item.id}>
                              <span className="font-medium">{[item.subject, item.name].filter(Boolean).join(' / ')}</span>
                              <span className="block text-xs text-ink-500">{formatSchedule(item.schedule)}</span>
                            </li>
                          ))}
                        </ul>
                      )],
                      ['Note', note],
                      ['2x2 photo', photo ? 'Included' : 'Not included'],
                    ]}
                  />
                  <div>
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                      <input
                        id="agreed"
                        type="checkbox"
                        checked={agreed}
                        aria-invalid={Boolean(problems.agreed)}
                        onChange={(event) => {
                          setAgreed(event.target.checked);
                          setProblems((current) => ({ ...current, agreed: undefined }));
                        }}
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <span>
                        I confirm that the information above is true and correct, and I agree that the school may store it
                        and use it to process this enrollment and to contact the student and guardian. For a student under
                        18, I am their parent or guardian, or I have their permission to apply.
                      </span>
                    </label>
                    {problems.agreed && <p className="mt-1.5 text-sm text-red-700">{problems.agreed}</p>}
                  </div>
                  {submitError && <Alert tone="error">{submitError}</Alert>}
                </>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-ink-200 pt-4 sm:flex-row sm:justify-between">
                {step > 0 ? (
                  <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={submitting}>
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Back
                  </Button>
                ) : <span />}
                <Button type="submit" isLoading={submitting}>
                  {step === STEPS.length - 1 ? 'Submit application' : (
                    <>
                      {step === 3 && !photo ? 'Skip photo' : step === 2 && classroomIds.length === 0 ? 'Skip for now' : 'Continue'}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}
    </PublicPage>
  );
}
