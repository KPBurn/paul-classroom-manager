import { Construction } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader.jsx';

export default function ComingSoon({ title, phase }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Construction className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-semibold text-slate-900">Not built yet</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-600">
          The {title.toLowerCase()} module is planned for phase {phase} of development.
        </p>
      </div>
    </>
  );
}
