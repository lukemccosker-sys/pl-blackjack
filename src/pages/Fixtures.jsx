import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isDeadlinePassed } from '@/lib/scoring';
import ClubBadge from '@/components/ClubBadge';
import { Check, Lock, Star, ChevronLeft, List } from 'lucide-react';

const formatScorers = (list) => (list || []).map(s => {
  const og = s.is_own_goal ? ' (OG)' : '';
  return s.count > 1 ? `${s.name}${og} ×${s.count}` : `${s.name}${og}`;
}).join(', ');
const hasMatchStats = (f) => f.home_goalscorers?.length > 0 || f.home_assists?.length > 0 || f.away_goalscorers?.length > 0 || f.away_assists?.length > 0;

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const isKickoffConfirmed = (kickoffTime, deadline) => {
  if (!kickoffTime) return false;
  if (!deadline) return true;
  return Math.abs(new Date(kickoffTime) - new Date(deadline)) <= FOURTEEN_DAYS_MS;
};

export default function Fixtures() {
  const [gameweeks, setGameweeks] = useState([]);
  const [allFixtures, setAllFixtures] = useState([]);
  const [selectedGwNumber, setSelectedGwNumber] = useState(null);
  const [view, setView] = useState('fixtures'); // 'fixtures' | 'all'
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [gws, fixtures] = await Promise.all([
        base44.entities.Gameweek.list('number', 50),
        base44.entities.Fixture.list('', 500),
      ]);
      const sorted = gws.sort((a, b) => a.number - b.number);
      const active = sorted.find(g => g.is_active) || sorted[sorted.length - 1];
      setGameweeks(sorted);
      setAllFixtures(fixtures);
      setSelectedGwNumber(active?.number ?? null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  const selectedGw = gameweeks.find(g => g.number === selectedGwNumber) || null;
  const fixtures = selectedGwNumber
    ? allFixtures.filter(f => f.gameweek === selectedGwNumber).sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time))
    : [];

  const gwStatus = (gw) => {
    if (gw.is_finalized) {
      return <span className="text-xs flex items-center gap-1 bg-primary text-white px-2 py-0.5 rounded-full shrink-0"><Check size={12} /> Final</span>;
    }
    if (gw.is_active) {
      return <span className="text-xs flex items-center gap-1 text-primary font-medium shrink-0"><Star size={12} className="fill-primary" /> Active</span>;
    }
    if (isDeadlinePassed(gw)) {
      return <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0"><Lock size={12} /> Locked</span>;
    }
    return <span className="text-xs text-muted-foreground shrink-0">Upcoming</span>;
  };

  if (view === 'all') {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-1">All Gameweeks</h1>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">{gameweeks.length} gameweeks synced</p>
          <button
            onClick={() => setView('fixtures')}
            className="flex items-center gap-1 text-xs text-primary font-medium bg-primary/10 px-2.5 py-1.5 rounded-full"
          >
            <ChevronLeft size={14} /> Back
          </button>
        </div>

        {gameweeks.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No gameweeks yet. Ask your admin to sync from FPL.
          </p>
        ) : (
          <div className="space-y-2">
            {gameweeks.map(gw => {
              const gwFixtures = allFixtures.filter(f => f.gameweek === gw.number);
              const finishedCount = gwFixtures.filter(f => f.finished).length;
              return (
                <button
                  key={gw.id}
                  onClick={() => { setSelectedGwNumber(gw.number); setView('fixtures'); }}
                  className="w-full text-left bg-card rounded-xl p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium">Gameweek {gw.number}</span>
                    {gwStatus(gw)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate">
                      {gw.deadline ? new Date(gw.deadline).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Deadline TBC'}
                    </span>
                    {gwFixtures.length > 0 && (
                      <span className="text-xs text-muted-foreground shrink-0">{finishedCount}/{gwFixtures.length} played</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">
          {selectedGw ? `Gameweek ${selectedGw.number}` : 'Fixtures'}
        </h1>
        <button
          onClick={() => setView('all')}
          className="flex items-center gap-1 text-xs text-primary font-medium bg-primary/10 px-2.5 py-1.5 rounded-full"
        >
          <List size={14} /> All Gameweeks
        </button>
      </div>
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
                <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
                  <span className="text-sm font-medium text-right truncate">{f.home_team}</span>
                  <ClubBadge code={f.home_team_code} name={f.home_team} size={32} />
                </div>
                <div className="flex flex-col items-center min-w-[60px] shrink-0">
                  {f.home_score != null && f.away_score != null ? (
                    <>
                      <span className="text-lg font-bold">
                        {f.home_score} - {f.away_score}
                      </span>
                      {!f.finished && (
                        <span className="text-[9px] text-destructive font-semibold flex items-center gap-1 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" /> LIVE
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {(() => {
                        const confirmed = isKickoffConfirmed(f.kickoff_time, selectedGw?.deadline);
                        return (
                          <>
                            <span className="text-xs text-muted-foreground text-center">
                              {confirmed ? new Date(f.kickoff_time).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Date TBC'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {confirmed ? new Date(f.kickoff_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <ClubBadge code={f.away_team_code} name={f.away_team} size={32} />
                  <span className="text-sm font-medium truncate">{f.away_team}</span>
                </div>
              </div>
              {hasMatchStats(f) && (
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2">
                  <div className="text-right space-y-1">
                    {f.home_goalscorers?.length > 0 && (
                      <p className="text-xs text-muted-foreground">⚽ {formatScorers(f.home_goalscorers)}</p>
                    )}
                    {f.home_assists?.length > 0 && (
                      <p className="text-xs text-muted-foreground">🅰️ {formatScorers(f.home_assists)}</p>
                    )}
                  </div>
                  <div className="text-left space-y-1">
                    {f.away_goalscorers?.length > 0 && (
                      <p className="text-xs text-muted-foreground">⚽ {formatScorers(f.away_goalscorers)}</p>
                    )}
                    {f.away_assists?.length > 0 && (
                      <p className="text-xs text-muted-foreground">🅰️ {formatScorers(f.away_assists)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
