import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [allPlayers, allStats] = await Promise.all([
          base44.entities.Player.list('', 600),
          base44.entities.PlayerStat.list('', 5000),
        ]);
        setPlayers(allPlayers);
        setStats(allStats);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const aggregated = {};
  stats.forEach(s => {
    if (!aggregated[s.player_id]) {
      aggregated[s.player_id] = {
        player_id: s.player_id,
        goals: 0, assists: 0, clean_sheets: 0, dc_hits: 0,
      };
    }
    aggregated[s.player_id].goals += s.goals || 0;
    aggregated[s.player_id].assists += s.assists || 0;
    aggregated[s.player_id].clean_sheets += s.clean_sheets || 0;
    aggregated[s.player_id].dc_hits += s.defensive_contribution_hit ? 1 : 0;
  });

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
          <h1 className="text-2xl font-bold">Stats</h1>
          <p className="text-sm text-muted-foreground">Season totals across all gameweeks</p>
        </div>
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
                    <div key={a.player_id} className="flex items-center gap-3 bg-card rounded-xl p-2.5">
                      <span className={`w-5 text-center font-bold text-sm ${medalColors[i] || 'text-muted-foreground'}`}>
                        {i + 1}
                      </span>
                      <ClubBadge code={player.club_code} name={player.club} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{player.web_name}</p>
                        <p className="text-xs text-muted-foreground">{player.position} · {player.club_short}</p>
                      </div>
                      <span className="text-lg font-bold text-primary">{a[key]}{suffix}</span>
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