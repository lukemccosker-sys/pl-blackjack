import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchAllPlayers, fetchAllPlayerStats } from '../../base44/shared/playerQueries.js';
import ClubBadge from '@/components/ClubBadge';
import { BarChart3 } from 'lucide-react';

const TABLES = [
  { title: 'Top Goals', key: 'goals', suffix: '' },
  { title: 'Top Assists', key: 'assists', suffix: '' },
  { title: 'Top Clean Sheets', key: 'clean_sheets', suffix: '' },
  { title: 'Defensive Contributions', key: 'dc_hits', suffix: ' hits' },
];

export default function Stats() {
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState([]);
  const [activeGwNumber, setActiveGwNumber] = useState(null);
  const [scope, setScope] = useState('season');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [allPlayers, gws] = await Promise.all([
        fetchAllPlayers(base44.entities),
        base44.entities.Gameweek.list('number', 50),
      ]);
      const sortedGws = gws.sort((a, b) => a.number - b.number);
      const activeGw = sortedGws.find(g => g.is_active) || sortedGws[sortedGws.length - 1];
      const currentSeason = activeGw?.season;
      const allStats = await fetchAllPlayerStats(base44.entities, currentSeason);
      setActiveGwNumber(activeGw?.number || null);
      setPlayers(allPlayers);
      setStats(allStats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let timer = null;
    const unsubStats = base44.entities.PlayerStat.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => loadData(), 500);
    });
    const unsubGws = base44.entities.Gameweek.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => loadData(), 500);
    });
    return () => {
      unsubStats();
      unsubGws();
      clearTimeout(timer);
    };
  }, []);

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

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
        goals: 0, assists: 0, clean_sheets: 0, dc_hits: 0,
        _gws: new Set(),
      };
    }
    aggregated[s.player_id].goals += s.goals || 0;
    aggregated[s.player_id].assists += s.assists || 0;
    aggregated[s.player_id].clean_sheets += s.clean_sheets || 0;
    aggregated[s.player_id].dc_hits += s.defensive_contribution_hit ? 1 : 0;
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
    <div className="p-4 pb-20">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="text-primary" size={20} />
        <div>
          <h1 className="text-2xl font-bold font-heading">Stats</h1>
          <p className="text-sm text-muted-foreground">
            {scope === 'gameweek' ? `Gameweek ${activeGwNumber || '—'}` : 'Season totals across all gameweeks'}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setScope('season')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            scope === 'season' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
          }`}
        >
          Season Total
        </button>
        <button
          onClick={() => setScope('gameweek')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            scope === 'gameweek' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
          }`}
        >
          This Gameweek
        </button>
      </div>

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
                      <span className="text-lg font-bold text-white">{a[key]}{suffix}</span>
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
    </div>
  );
}