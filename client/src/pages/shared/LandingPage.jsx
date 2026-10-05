import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCheck,
  FolderOpen,
  GraduationCap,
  Megaphone,
  MessageSquareText,
  MonitorSmartphone,
  ShieldCheck,
  Star,
  UserCog,
  UserRound,
  UsersRound,
  Video,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Badge from '../../components/common/Badge.jsx';
import Brand from '../../components/common/Brand.jsx';
import { buttonClass, ButtonLink } from '../../components/common/Button.jsx';
import Login from '../auth/Login.jsx';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#roles', label: 'Who it’s for' },
  { href: '#how-it-works', label: 'How it works' },
];

// Every item describes something the app does today.
const FEATURES = [
  {
    icon: CalendarDays,
    title: 'Class scheduling',
    description: 'Plan one-time lessons or weekly series for each classroom, and find any session by date, class or teacher.',
  },
  {
    icon: Video,
    title: 'Live online lessons',
    description: 'Teach in a built-in class room with video, audio, screen sharing, chat and file sharing. Nothing to install.',
  },
  {
    icon: ClipboardCheck,
    title: 'Automatic attendance',
    description: 'Attendance is recorded when people join a lesson: present, late or absent. Teachers can correct it afterwards.',
  },
  {
    icon: Megaphone,
    title: 'Announcements',
    description: 'Share school-wide notices with teachers, and post reminders and homework to each class.',
  },
  {
    icon: FolderOpen,
    title: 'Class materials',
    description: 'Attach files and images to a class, release them now or on a set date, and let students view or download them.',
  },
  {
    icon: MessageSquareText,
    title: 'Teacher feedback',
    description: 'Write structured feedback for each student after a lesson, with ratings for fluency, pronunciation and confidence.',
  },
];

const ROLES = [
  {
    icon: UserCog,
    title: 'Administrators',
    summary: 'Set up the school and keep it organized.',
    points: [
      'Create teacher and student accounts',
      'Build classes for each subject and schedule them from teacher availability',
      'Review enrollment requests and place students in classes',
      'Schedule sessions across every classroom',
      'Publish announcements and review teacher feedback',
    ],
  },
  {
    icon: GraduationCap,
    title: 'Teachers',
    summary: 'Everything for the lesson, before and after.',
    points: [
      'See today’s lessons and join in one click',
      'Teach live and manage the room',
      'Post announcements and materials to a class',
      'Give each student feedback, with reminders for what is left',
    ],
  },
  {
    icon: UserRound,
    title: 'Students',
    summary: 'One place to show up and keep up.',
    points: [
      'Apply online for the classes they want',
      'Join scheduled lessons from any device',
      'Have attendance recorded automatically',
      'Read class announcements',
      'View and download class materials',
    ],
  },
];

const STEPS = [
  {
    title: 'Your school sets it up',
    description: 'An administrator creates accounts, builds classrooms and assigns teachers and students.',
  },
  {
    title: 'Teachers schedule and teach',
    description: 'Teachers plan their sessions, then open the class room when it is time for the lesson.',
  },
  {
    title: 'Everyone stays up to date',
    description: 'Attendance, announcements, materials and feedback are kept with the class they belong to.',
  },
];

const ASSURANCES = [
  { icon: ShieldCheck, title: 'Access by role', description: 'Each person only sees the tools and classes for their role.' },
  { icon: UsersRound, title: 'Accounts from your school', description: 'Students apply for enrollment and get an account once the school approves them. Administrators create every other account.' },
  { icon: MonitorSmartphone, title: 'Works in the browser', description: 'Use it on a computer, tablet or phone without installing anything.' },
];

const section = 'scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24 lg:px-8';
const sectionLabel = 'text-xs font-medium uppercase tracking-wider text-ink-500';
const sectionTitle = 'mt-3 text-balance font-display text-3xl font-medium leading-[1.15] tracking-[-0.02em] text-ink-900 sm:text-4xl';
const sectionLead = 'mt-4 text-base leading-7 text-ink-600';

/** An illustration of the teacher portal built from the app's own features; the content is sample data. */
function PortalPreview() {
  return (
    <div className="landing-preview relative mx-auto w-full max-w-lg" aria-hidden="true">
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lg">
        <div className="flex items-center gap-1.5 border-b border-ink-200 px-4 py-3">
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="ml-auto font-mono text-[11px] text-ink-400">Sample</span>
        </div>

        <div className="bg-canvas p-4">
          <p className={sectionLabel}>Today’s schedule</p>

          <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4">
            <div className="min-w-0">
              <Badge tone="success">
                <span className="size-1.5 rounded-full bg-emerald-600" /> Live now
              </Badge>
              <p className="mt-2 truncate text-sm font-semibold text-ink-900">English · Speaking practice</p>
              <p className="mt-0.5 text-xs text-ink-500">Intermediate class · 7:00–8:30 PM</p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-xs font-medium text-white">
              <Video className="size-3.5" /> Join
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-200 bg-white p-4">
              <p className="text-xs font-semibold text-ink-900">Attendance</p>
              <ul className="mt-3 space-y-2 text-xs text-ink-600">
                {[
                  ['Student A', 'Present', 'success'],
                  ['Student B', 'Late', 'warning'],
                  ['Student C', 'Present', 'success'],
                ].map(([name, status, tone]) => (
                  <li key={name} className="flex items-center justify-between">
                    {name}
                    <Badge tone={tone}>{status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-ink-200 bg-white p-4">
              <p className="text-xs font-semibold text-ink-900">Teacher feedback</p>
              <div className="mt-3 space-y-3 text-xs text-ink-600">
                {[
                  ['Fluency', 4],
                  ['Pronunciation', 3],
                  ['Confidence', 5],
                ].map(([label, rating]) => (
                  <div key={label} className="flex items-center justify-between">
                    {label}
                    <span className="flex">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`size-3 ${rating >= star ? 'fill-amber-400 text-amber-400' : 'text-ink-300'}`} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-4">
            <Megaphone className="size-4 shrink-0 text-ink-400" />
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-ink-900">Quiz on Friday</p>
              <p className="truncate text-ink-500">Class announcement · Review units 3 and 4.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const loginOpen = location.pathname === '/login';

  return (
    <div className="min-h-dvh bg-white text-ink-900">
      <a
        href="#main"
        className="sr-only rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="rounded-lg">
            <Brand />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className={buttonClass({ variant: 'ghost', size: 'sm', className: 'max-md:hidden' })}>
                {link.label}
              </a>
            ))}
            <ButtonLink to="/enroll" variant="secondary" size="sm" className="ml-2">
              Enroll
            </ButtonLink>
            <ButtonLink to="/login" size="sm">
              Sign in
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="border-b border-ink-200 bg-ink-50">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-8 lg:py-28">
            <div className="landing-copy max-w-xl">
              <p className={sectionLabel}>Classroom and teacher management</p>
              <h1 className="mt-4 text-balance font-display text-[2.5rem] font-medium leading-[1.08] tracking-[-0.03em] text-ink-900 sm:text-[3.25rem]">
                Run your classes, lessons and student feedback in one place.
              </h1>
              <p className="mt-6 text-lg leading-8 text-ink-600">
                Classroom Manager gives schools and learning centers one portal for scheduling, live online lessons,
                attendance, class materials and teacher feedback, with a separate space for administrators, teachers
                and students.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <ButtonLink to="/login" size="lg" className="group">
                  Sign in to your portal
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </ButtonLink>
                <a href="#features" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
                  See what it does
                </a>
              </div>
              <p className="mt-4 text-sm text-ink-500">
                New student?{' '}
                <Link to="/enroll" className="font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">Apply for enrollment</Link>
                {' '}or{' '}
                <Link to="/enroll/status" className="font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">check your application</Link>.
              </p>
            </div>
            <PortalPreview />
          </div>
        </section>

        <section id="features" className={section}>
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className={sectionLabel}>Features</p>
              <h2 className={sectionTitle}>What you can do with it</h2>
              <p className={sectionLead}>
                The daily work of running classes, kept together so nothing lives in a separate spreadsheet or chat group.
              </p>
            </div>
            {/* The 1px gaps over a grey background draw the dividers between cells. */}
            <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li key={title} className="bg-white p-6 sm:p-8">
                  <Icon className="size-5 text-ink-900" aria-hidden="true" />
                  <h3 className="mt-5 text-base font-semibold text-ink-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="roles" className={`${section} border-y border-ink-200 bg-ink-50`}>
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className={sectionLabel}>Who it’s for</p>
              <h2 className={sectionTitle}>A portal for each role</h2>
              <p className={sectionLead}>
                Everyone signs in at the same place and lands in the space made for their work.
              </p>
            </div>
            <ul className="mt-12 grid gap-4 lg:grid-cols-3">
              {ROLES.map(({ icon: Icon, title, summary, points }) => (
                <li key={title} className="flex flex-col rounded-xl border border-ink-200 bg-white p-6 sm:p-8">
                  <Icon className="size-5 text-ink-900" aria-hidden="true" />
                  <h3 className="mt-5 font-display text-2xl font-medium tracking-[-0.02em] text-ink-900">{title}</h3>
                  <p className="mt-1 text-sm text-ink-600">{summary}</p>
                  <ul className="mt-6 space-y-3 border-t border-ink-200 pt-6 text-sm text-ink-700">
                    {points.map((point) => (
                      <li key={point} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className={section}>
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className={sectionLabel}>How it works</p>
              <h2 className={sectionTitle}>From setup to the next lesson</h2>
            </div>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="border-t border-ink-900 pt-5">
                  <span className="font-mono text-xs text-ink-500">Step {String(index + 1).padStart(2, '0')}</span>
                  <h3 className="mt-3 text-base font-semibold text-ink-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{step.description}</p>
                </li>
              ))}
            </ol>

            <ul className="mt-16 grid gap-8 border-t border-ink-200 pt-10 sm:grid-cols-3">
              {ASSURANCES.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex gap-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-ink-400" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-ink-600">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 rounded-2xl border border-ink-200 bg-ink-50 px-6 py-10 sm:px-10 sm:py-12 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="text-balance font-display text-3xl font-medium tracking-[-0.02em] text-ink-900">Ready for your next class?</h2>
              <p className="mt-2 text-base text-ink-600">
                Sign in with the account your school gave you to open your portal.
              </p>
            </div>
            <ButtonLink to="/login" size="lg" className="group shrink-0">
              Sign in
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-200 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Link to="/" className="inline-block rounded-lg">
              <Brand />
            </Link>
            <p className="mt-3 text-sm leading-6 text-ink-600">
              One portal for scheduling, live lessons, attendance, materials and teacher feedback.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-600">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="rounded-sm py-1 transition hover:text-ink-900">
                {link.label}
              </a>
            ))}
            <Link to="/login" className="rounded-sm py-1 transition hover:text-ink-900">
              Sign in
            </Link>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl border-t border-ink-200 pt-6 text-sm text-ink-500">
          © {new Date().getFullYear()} Classroom Manager
        </p>
      </footer>

      {loginOpen && (
        <Login
          onClose={() => {
            navigate('/', { replace: true });
          }}
        />
      )}
    </div>
  );
}
