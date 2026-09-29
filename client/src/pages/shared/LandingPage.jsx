import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  GraduationCap,
  MessageCircle,
  MonitorUp,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Login from '../auth/Login.jsx';

const features = [
  {
    icon: CalendarDays,
    title: 'A clearer class schedule',
    description: 'Keep sessions, recurring lessons, and attendance together in one dependable place.',
    color: 'bg-blue-50 text-blue-700',
  },
  {
    icon: MessageCircle,
    title: 'A room to learn together',
    description: 'Meet in a shared classroom with live chat, voice, and screen presentations.',
    color: 'bg-violet-50 text-violet-700',
  },
  {
    icon: ShieldCheck,
    title: 'The right access for everyone',
    description: 'Students, teachers, and administrators each get the tools for their role.',
    color: 'bg-emerald-50 text-emerald-700',
  },
];

function Brand() {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 text-slate-950">
      <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
        <GraduationCap className="size-6" aria-hidden="true" />
      </span>
      <span className="text-base font-bold tracking-tight">Classroom Manager</span>
    </Link>
  );
}

function ClassroomPreview() {
  return (
    <div className="landing-preview relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-200/70 via-violet-100/70 to-sky-100/80 blur-2xl" />
      <div className="relative rounded-[1.75rem] border border-white/80 bg-white/90 p-3 shadow-[0_32px_90px_-32px_rgba(58,56,122,0.38)] backdrop-blur">
        <div className="overflow-hidden rounded-[1.25rem] bg-slate-50">
          <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <BookOpen className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Your classroom</p>
                <p className="text-xs text-slate-500">A good day to learn something new</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              In session
            </span>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-[1.3fr_0.9fr]">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-5 text-white">
              <div className="flex items-start justify-between">
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-indigo-50">
                  TODAY · 10:30 AM
                </span>
                <span className="flex size-8 items-center justify-center rounded-full bg-white/15">
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-8 text-xs font-medium text-indigo-100">UP NEXT</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Science &amp; discovery</h2>
              <p className="mt-1 text-xs text-indigo-100">Room 04 · Teacher Olivia</p>
              <div className="mt-6 flex items-center justify-between border-t border-white/20 pt-4">
                <div className="flex -space-x-2">
                  {['bg-amber-300', 'bg-pink-300', 'bg-cyan-300', 'bg-lime-300'].map((color, index) => (
                    <span key={color} className={`flex size-7 items-center justify-center rounded-full border-2 border-indigo-600 ${color} text-[9px] font-bold text-slate-800`}>
                      {['M', 'J', 'A', 'S'][index]}
                    </span>
                  ))}
                </div>
                <span className="flex items-center gap-1.5 text-xs font-medium text-indigo-50">
                  <UsersRound className="size-3.5" aria-hidden="true" /> 18 learners
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <CalendarDays className="size-4.5" aria-hidden="true" />
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">THIS WEEK</span>
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">12</p>
                <p className="text-xs text-slate-500">classes scheduled</p>
              </div>
              <div className="flex-1 rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <MessageCircle className="size-4" aria-hidden="true" />
                  </span>
                  <p className="text-xs font-semibold text-slate-800">Class chat</p>
                </div>
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
                  “That was a great question! Let’s explore it together.”
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
                  <Check className="size-3" aria-hidden="true" /> Everyone is welcome
                </div>
              </div>
            </div>
          </div>

          <div className="mx-4 mb-4 flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <MonitorUp className="size-4" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium text-slate-700">A shared space for every lesson</span>
            </div>
            <span className="size-2 rounded-full bg-emerald-400 ring-4 ring-emerald-50" />
          </div>
        </div>
      </div>
      <div className="absolute -right-3 top-10 hidden items-center gap-2 rounded-2xl border border-white bg-white px-3 py-2.5 shadow-lg sm:flex">
        <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Check className="size-4" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-xs font-semibold text-slate-800">All caught up</span>
          <span className="block text-[10px] text-slate-500">You’re right on track</span>
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const loginOpen = location.pathname === '/login';

  return (
    <div className="min-h-screen overflow-hidden bg-white text-slate-900">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Brand />
        <nav className="flex items-center gap-3 sm:gap-7" aria-label="Main navigation">
          <a href="#features" className="hidden text-sm font-medium text-slate-600 transition hover:text-indigo-700 sm:inline">
            Features
          </a>
          <a href="#about" className="hidden text-sm font-medium text-slate-600 transition hover:text-indigo-700 sm:inline">
            About
          </a>
          <Link
            to="/login"
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Sign in
          </Link>
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 hover:shadow-md sm:px-5"
          >
            Get started <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main>
        <section className="relative isolate mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-8 lg:px-12 lg:pb-28 lg:pt-16">
          <div className="absolute -left-40 top-10 -z-10 size-[28rem] rounded-full bg-indigo-100/60 blur-3xl" />
          <div className="absolute right-0 top-0 -z-10 size-[30rem] rounded-full bg-violet-50/80 blur-3xl" />
          <div className="landing-copy relative z-10 max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm">
              <Sparkles className="size-3.5" aria-hidden="true" />
              A better way to bring class together
            </span>
            <h1 className="mt-7 text-[2.75rem] font-bold leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-[4.25rem]">
              Learning works
              <span className="block text-indigo-600">better together.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              One welcoming place to manage classes, meet for lessons, and stay connected—wherever learning happens.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="group inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700"
              >
                Enter your classroom
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
              >
                Explore the features <ArrowDown className="size-4" aria-hidden="true" />
              </a>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-2"><Check className="size-4 text-emerald-600" /> Made for every role</span>
              <span className="inline-flex items-center gap-2"><Check className="size-4 text-emerald-600" /> Simple to get started</span>
            </div>
          </div>
          <ClassroomPreview />
        </section>

        <section id="features" className="scroll-mt-8 border-y border-slate-100 bg-slate-50/80 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Everything in sync</span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                More time for what matters.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Spend less time keeping things organized and more time making every class count.
              </p>
            </div>
            <div className="mt-11 grid gap-4 md:grid-cols-3">
              {features.map(({ icon: Icon, title, description, color }, index) => (
                <article key={title} className="landing-feature rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                  <span className={`flex size-12 items-center justify-center rounded-2xl ${color}`}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-xs font-semibold text-slate-400">0{index + 1}</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_auto] lg:items-center lg:px-12">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Your learning community</span>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Every learner belongs in the conversation.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Create a welcoming space for students and teachers to meet, share ideas, and learn side by side.
            </p>
          </div>
          <Link
            to="/login"
            className="group inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700"
          >
            Go to your classroom <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-slate-100 bg-white px-5 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Brand />
          <p className="text-xs text-slate-500">A little more connected, one class at a time.</p>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Classroom Manager</p>
        </div>
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
