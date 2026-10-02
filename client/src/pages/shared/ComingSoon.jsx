import { Construction } from 'lucide-react';
import EmptyState from '../../components/common/EmptyState.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';

export default function ComingSoon({ title, phase }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={Construction}
        title="Not built yet"
        message={`The ${title.toLowerCase()} module is planned for phase ${phase} of development.`}
        className="py-16"
      />
    </>
  );
}
