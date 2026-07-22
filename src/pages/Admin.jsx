import React, { useState } from 'react';
import { usePoolAuth } from '@/lib/PoolAuth';
import GameweekManager from '@/components/GameweekManager';
import StatEditor from '@/components/StatEditor';
import ScoringEditor from '@/components/ScoringEditor';
import SyncPanel from '@/components/SyncPanel';

export default function Admin() {
  const { member } = usePoolAuth();
  const [tab, setTab] = useState('gameweeks');

  if (!member?.is_admin) {
    return <div className="p-6 text-center text-muted-foreground">Admin access required</div>;
  }

  const tabs = [
    { key: 'gameweeks', label: 'Gameweeks' },
    { key: 'stats', label: 'Stats' },
    { key: 'scoring', label: 'Scoring' },
    { key: 'sync', label: 'Sync' },
  ];

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'gameweeks' && <GameweekManager />}
      {tab === 'stats' && <StatEditor />}
      {tab === 'scoring' && <ScoringEditor />}
      {tab === 'sync' && <SyncPanel member={member} />}
    </div>
  );
}