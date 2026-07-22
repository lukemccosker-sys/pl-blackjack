import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import ClubBadge from '@/components/ClubBadge';

const formatScorers = (list) => (list || []).map(s => s.count > 1 ? `${s.name} ×${s.count}` : s.name).join(', ');
const hasMatchStats = (f) => f.home_goalscorers?.length > 0 || f.home_assists?.length > 0 || f.away_goalscorers?.length > 0 || f.away_assists?.length > 0;

export default function Fixtures() {
  const [fixtures, setFixtures] = useState([]);
  const [gameweek, setGameweek] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [gws, allFixtures] = await Promise.all([
        base44.entities.Gameweek.list('number', 50),
        base44.entities.Fixture.list('', 500),
      ]);
      const sorted = gws.sort((a, b) => a.number - b.number);
      const active = sorted.find(g => g.is_active) || sorted[sorted.length - 1];
      setGameweek(active);
      if (active) {
        const gwFixtures = allFixtures.filter(f => f.gameweek === active.number);
        gwFixtures.sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
        setFixtures(gwFixtures);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-1">
        {gameweek ? `Gameweek ${gameweek.number}` : 'Fixtures'}
      </h1>
      <p className="text-sm text-muted-foreground mb-4">{fixtures.length} matches</p>

      {fixtures.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No fixtures yet. Ask your admin to sync from FPL.
        </p>
      ) : (
        <div className="space-y-3">
          {fixtures.map(f => (
            <div key={f.id} className="bg-card rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center justify-end gap-2">
                  <span className="text-sm font-medium text-right">{f.home_team}</span>
                  <ClubBadge code={f.home_team_code} name={f.home_team} size={32} />
                </div>
                <div className="flex flex-col items-center min-w-[60px]">
                  {f.finished ? (
                    <span className="text-lg font-bold">
                      {f.home_score} - {f.away_score}
                    </span>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground text-center">
                        {f.kickoff_time ? new Date(f.kickoff_time).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'TBD'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {f.kickoff_time ? new Date(f.kickoff_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <ClubBadge code={f.away_team_code} name={f.away_team} size={32} />
                  <span className="text-sm font-medium">{f.away_team}</span>
                </div>
              </div>
              {hasMatchStats(f) && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {f.home_goalscorers?.length > 0 && (
                    <p className="text-xs text-muted-foreground">⚽ {formatScorers(f.home_goalscorers)}</p>
                  )}
                  {f.home_assists?.length > 0 && (
                    <p className="text-xs text-muted-foreground">🅰️ {formatScorers(f.home_assists)}</p>
                  )}
                  {f.away_goalscorers?.length > 0 && (
                    <p className="text-xs text-muted-foreground">⚽ {formatScorers(f.away_goalscorers)}</p>
                  )}
                  {f.away_assists?.length > 0 && (
                    <p className="text-xs text-muted-foreground">🅰️ {formatScorers(f.away_assists)}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}