import React from 'react';
import { usePlayers, useSeasonStats, useActiveGameweek } from '@/lib/queries';
import ClubBadge from '@/components/ClubBadge';
import PageHeader from '@/components/PageHeader';
import SegmentedControl from '@/components/SegmentedControl';
import { useUrlState } from '@/lib/useUrlState';
import { BarChart3 } from 'lucide-react';

const TABLES = [
  { title: 'Top Goals', key: 'goals', suffix: '' },
  { title: 'Top Assists', key: 'assists', suffix: '' },
  { title: 'Top Clean Sheets', key: 'clean_sheets', suffix: '' },
  { title: 'Defensive Contributions', key: 'dc_hits', suffix: ' hits' },
];

export default function Stats({ embedded = false }) {
  // URL-backed so back/refresh keep the view, and it's linkable.
  const [scope, setScope] = useUrlState('scope', ['season', 'gameweek'], 'season');
  const [viewMode, setViewMode] = useUrlState('mode', ['stats', 'points'], 'stats');

  const { active, isLoading: gwLoading } = useActiveGameweek();
  const { data: players = [], isLoading: playersLoading } = usePlayers();
  const { data: stats = [], isPending: statsPending } = useSeasonStats(active?.season, {
    enabled: !gwLoading,
  });

  const activeGwNumber = active?.number || null;
  const loading = gwLoading || playersLoading || statsPending;

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  const pad = embedded ? '' : 'p-4 pb-nav';

  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const scopedStats = scope === 'gameweek' && activeGwNumber
    ? stats.filter(s => s.gameweek === activeGwNumber)
    : stats;

  const aggregated = {};
  scopedStats.forEach(s => {
    if (!aggregated[s.player_id]) {
      aggregated[s.player_id] = {
        player_id: s.player_id,
        goals: 0, assists: 0, clean_sheets: 0, dc_hits: 0, points: 0,
        _gws: new Set(),
      };
    }
    aggregated[s.player_id].goals += s.goals || 0;
    aggregated[s.player_id].assists += s.assists || 0;
    aggregated[s.player_id].clean_sheets += s.clean_sheets || 0;
    aggregated[s.player_id].dc_hits += s.defensive_contribution_hit ? 1 : 0;
    aggregated[s.player_id].points += s.points || 0;
    if (s.gameweek) aggregated[s.player_id]._gws.add(s.gameweek);
  });

  const maxSyncedGw = stats.length > 0 ? Math.max(...stats.map(s => s.gameweek || 0)) : null;

  const getTop5 = (key) =>
    Object.values(aggregated)
      .filter(a => a[key] > 0)
      .sort((a, b) => b[key] - a[key])
      .slice(0, 5);

  const medalColors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

  return (
    <div className={pad}>
      {!embedded && (
        <PageHeader
          title="Stats"
          subtitle={<p className="text-sm text-muted-foreground">
            {scope === 'gameweek' ? `Gameweek ${activeGwNumber || '—'}` : 'Season totals across all gameweeks'}
          </p>}
        />
      )}
      {embedded && (
        <p className="text-sm text-muted-foreground mb-3 flex items-center gap-1.5">
          <BarChart3 size={14} />
          {scope === 'gameweek' ? `Gameweek ${activeGwNumber || '—'}` : 'Season totals across all gameweeks'}
        </p>
      )}

      <SegmentedControl
        ariaLabel="Stat type"
        value={viewMode}
        onChange={setViewMode}
        className="mb-2"
        options={[
          { value: 'stats', label: 'Raw Stats' },
          { value: 'points', label: 'Game Points' },
        ]}
      />

      <SegmentedControl
        ariaLabel="Time range"
        value={scope}
        onChange={setScope}
        className="mb-4"
        options={[
          { value: 'season', label: 'Season Total' },
          { value: 'gameweek', label: 'This Gameweek' },
        ]}
      />

      {viewMode === 'points' ? (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Top Game Points</h2>
          <div className="space-y-1.5">
            {Object.values(aggregated)
              .filter(a => a.points > 0)
              .sort((a, b) => b.points - a.points)
              .slice(0, 15)
              .map((a, i) => {
                const player = playerMap[a.player_id];
                if (!player) return null;
                return (
                  <div
                    key={a.player_id}
                    className="flex items-center gap-3 bg-card rounded-xl p-2.5"
                    title={scope === 'season' ? `Based on ${a._gws.size} gameweek${a._gws.size === 1 ? '' : 's'}` : undefined}
                  >
                    <span className={`w-5 text-center font-bold text-sm ${medalColors[i] || 'text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <ClubBadge code={player.club_code} name={player.club} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{player.web_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {player.position} · {player.club_short}
                        {scope === 'season' && maxSyncedGw && (
                          <span className="text-muted-foreground/60"> · Synced to GW{maxSyncedGw}</span>
                        )}
                      </p>
                    </div>
                    <span className="flex items-center justify-center min-w-[34px] h-9 px-2 rounded-full bg-primary text-white text-sm font-bold shrink-0">{a.points}</span>
                  </div>
                );
              })}
            {Object.values(aggregated).filter(a => a.points > 0).length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-4">No game points accumulated yet</p>
            )}
          </div>
        </div>
      ) : (
      <div className="space-y-6">
        {TABLES.map(({ title, key, suffix }) => {
          const top5 = getTop5(key);
          return (
            <div key={key}>
              <h2 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{title}</h2>
              <div className="space-y-1.5">
                {top5.map((a, i) => {
                  const player = playerMap[a.player_id];
                  if (!player) return null;
                  return (
                    <div
                      key={a.player_id}
                      className="flex items-center gap-3 bg-card rounded-xl p-2.5"
                      title={scope === 'season' ? `Based on ${a._gws.size} gameweek${a._gws.size === 1 ? '' : 's'}` : undefined}
                    >
                      <span className={`w-5 text-center font-bold text-sm ${medalColors[i] || 'text-muted-foreground'}`}>
                        {i + 1}
                      </span>
                      <ClubBadge code={player.club_code} name={player.club} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{player.web_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {player.position} · {player.club_short}
                          {scope === 'season' && maxSyncedGw && (
                            <span className="text-muted-foreground/60"> · Synced to GW{maxSyncedGw}</span>
                          )}
                        </p>
                      </div>
                      <span className="flex items-center justify-center min-w-[34px] h-9 px-2 rounded-full bg-primary text-white text-sm font-bold shrink-0">{a[key]}{suffix}</span>
                    </div>
                  );
                })}
                {top5.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-4">No data yet</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}