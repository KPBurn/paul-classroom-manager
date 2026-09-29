import AnnouncementFeed from '../../components/announcements/AnnouncementFeed.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { useAnnouncements } from '../../hooks/useAnnouncements.js';

const PAGE_SIZE = 10;

export default function TeacherAnnouncements() {
  const list = useAnnouncements(PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Updates from your school administrators. Post to your own classes from My Classrooms."
      />
      <div className="max-w-3xl">
        <AnnouncementFeed list={list} emptyMessage="New announcements from administrators will appear here." />
      </div>
    </>
  );
}
