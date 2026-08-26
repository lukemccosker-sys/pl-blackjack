import React from 'react';
import { useUrlState } from '@/lib/useUrlState';
import PageHeader from '@/components/PageHeader';
import SegmentedControl from '@/components/SegmentedControl';
import Fixtures from '@/pages/Fixtures';
import Stats from '@/pages/Stats';
import { Calendar, BarChart3 } from 'lucide-react';

/**
 * Fixtures and Stats used to be two separate tabs, which pushed the bottom nav
 * to six items. They're the same thing in use — reference you consult while
 * deciding who to pick — so they share one tab and a segmented control.
 */
export default function Football() {
  const [view, setView] = useUrlState('view', ['fixtures', 'stats'], 'fixtures');

  return (
    <div className="p-4 pb-20">
      <PageHeader title="Football" className="mb-3" />

      <SegmentedControl
        ariaLabel="Football view"
        value={view}
        onChange={setView}
        className="mb-4"
        options={[
          { value: 'fixtures', label: 'Fixtures', icon: <Calendar size={14} /> },
          { value: 'stats', label: 'Stats', icon: <BarChart3 size={14} /> },
        ]}
      />

      {view === 'fixtures' ? <Fixtures embedded /> : <Stats embedded />}
    </div>
  );
}
