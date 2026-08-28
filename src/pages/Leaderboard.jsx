import React, { useState, useEffect } from 'react';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed } from '@/lib/scoring';
import { useActiveGameweek, useScoringConfig, useMembers, usePicks, useSeasonStats } from '@/lib/queries';
import { AlertTriangle } from 'lucide-react';
import MemberAvatar from '@/components/MemberAvatar';
import PageHeader from '@/components/PageHeader';
import SegmentedControl from '@/components/SegmentedControl';
import { useUrlState } from '@/lib/useUrlState';

export default function Leaderboard() {
  const [tab, setTab] = useUrlState('tab', ['gameweek', 'season'], 'gameweek');
  const [selectedGw, setSelectedGw] = useState(null);

  const { gameweeks, active, isLoading: gwLoading } = useActiveGameweek();
  const { data: scoringConfig } = useScoringConfig();
  const { data: allMembers = [] } = useMembers();
  const { data: allPicks = [] } = usePicks();
  const { data: allStats = [], isPending: statsPending } = useSeasonStats(
    active?.season || gameweeks[gameweeks.length - 1]?.season,
    { enabled: !gwLoading }
  );

  const loading = gwLoading || statsPending;

  // Default the picker to the live gameweek once the list arrives, but never
  // stomp on a gameweek the user has since chosen.
  useEffect(() => {
    if (selectedGw != null || gameweeks.length === 0) return;
    const activeGw = gameweeks.find(g => g.is_active);
    const latestFinalized = gameweeks.filter(g => g.is_finalized).pop();
    const fallback = activeGw || latestFinalized || gameweeks[gameweeks.length - 1];
    if (fallback?.number != null) setSelectedGw(fallback.number);
  }, [gameweeks, selectedGw]);

  const getPickScore = (pick) => {
    if (!pick) return { score: 0, total: 0, isBust: false, isNatural: false };
    const stats = (pick.player_ids || []).map(pid => allStats.find(s => s.player_id === pid && s.gameweek === pick.gameweek));
    const points = stats.map(stat => calculatePlayerPoints(stat, scoringConfig));
    return calculatePickTotal(points, scoringConfig, stats);
  };

  // A pick "matches" a gameweek's season if it has been season-backfilled
  // and agrees, or if it hasn't been backfilled yet (treated as current,
  // best-effort, so nothing silently disappears before a sync runs).
  const matchesSeason = (pick, season) => !season || !pick.season || pick.season === season;

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  const selectedGwObj = gameweeks.find(g => g.number === selectedGw);
  const gwPicks = allPicks.filter(p => p.gameweek === selectedGw && matchesSeason(p, selectedGwObj?.season));
  const pickByMember = {};
  gwPicks.forEach(p => { pickByMember[p.member_id] = p; });
  const gwSorted = allMembers.map(m => {
    const pick = pickByMember[m.id];
    const score = getPickScore(pick);
    return { member: m, pick, ...score };
  }).sort((a, b) => b.score - a.score);

  const currentSeasonGw = gameweeks.find(g => g.is_active) || gameweeks[gameweeks.length - 1];
  const currentSeason = currentSeasonGw?.season;
  const finalizedGws = gameweeks.filter(g => g.is_finalized && (!currentSeason || g.season === currentSeason));
  // Include the active gameweek in season totals once its deadline has passed,
  // so the season leaderboard reflects live (in-progress) scores.
  const liveGws = gameweeks.filter(g => !g.is_finalized && g.is_active && isDeadlinePassed(g) && (!currentSeason || g.season === currentSeason));
  const countedGws = [...finalizedGws, ...liveGws];
  const seasonTotals = allMembers.map(m => {
    let totalScore = 0;
    let busts = 0;
    let blackjacks = 0;
    let played = 0;
    countedGws.forEach(gw => {
      const pick = allPicks.find(p => p.member_id === m.id && p.gameweek === gw.number && matchesSeason(p, gw.season));
      if (pick) {
        const s = getPickScore(pick);
        totalScore += s.score;
        if (s.tier === 'blackjack') blackjacks++;
        if (s.isBust) busts++;
        played++;
      }
    });
    return { member: m, totalScore, blackjacks, busts, played };
  }).sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.blackjacks !== a.blackjacks) return b.blackjacks - a.blackjacks;
    return a.busts - b.busts;
  });

  const medalColors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

  return (
    <div className="p-4 pb-nav">
      <PageHeader title="Leaderboard" />

      <SegmentedControl
        ariaLabel="Leaderboard range"
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: 'gameweek', label: 'Gameweek' },
          { value: 'season', label: 'Season' },
        ]}
      />

      {tab === 'gameweek' ? (
        <>
          {gameweeks.length > 0 && (
            <select
              value={selectedGw || ''}
              onChange={(e) => setSelectedGw(Number(e.target.value))}
              aria-label="Choose gameweek"
              className="w-full bg-accent rounded-lg px-3 min-h-[44px] mb-4 text-sm"
            >
              {[...gameweeks].reverse().map(gw => (
                <option key={gw.id} value={gw.number}>
                  Gameweek {gw.number}{gw.is_finalized ? ' ✓' : ''}
                </option>
              ))}
            </select>
          )}

          {!isDeadlinePassed(selectedGwObj) ? (
            <div className="text-center text-muted-foreground py-12">
              <p className="font-medium mb-1">Picks hidden</p>
              <p className="text-sm">Scores visible after the deadline</p>
            </div>
          ) : gwSorted.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No picks for this gameweek yet</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-end mb-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  selectedGwObj?.is_finalized ? 'bg-primary/20 text-white' : 'bg-accent text-muted-foreground'
                }`}>
                  {selectedGwObj?.is_finalized ? 'Final' : 'Live · In Progress'}
                </span>
              </div>
              {gwSorted.map((entry, i) => (
                <div
                  key={entry.member.id}
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    i === 0 ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-card'
                  }`}
                >
                  <span className={`w-8 text-center font-bold ${medalColors[i] || 'text-muted-foreground'}`}>
                    {i + 1}
                  </span>
                  <MemberAvatar member={entry.member} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.member.name}</p>
                    {entry.pick ? (
                      entry.isBust ? (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle size={10} /> BUST · {entry.total - (scoringConfig?.bust_threshold || 21)} pts over
                        </p>
                      ) : entry.tier === 'blackjack' ? (
                        <p className="text-xs text-white font-semibold">BLACKJACK!</p>
                      ) : null
                    ) : (
                      <p className="text-xs text-muted-foreground">No picks made</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`flex items-center justify-center min-w-[42px] h-10 px-3 rounded-full text-lg font-bold font-display shrink-0 ${entry.isBust ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-white'}`}>
                      {entry.score}
                    </p>
                    {entry.pick && !entry.isBust && entry.total > 0 && (
                      <p className="text-xs text-muted-foreground">{entry.total} pts</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {liveGws.length > 0 && (
            <div className="flex items-center justify-end mb-2">
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-muted-foreground">
                Live · In Progress
              </span>
            </div>
          )}
          {seasonTotals.map((s, i) => (
            <div
              key={s.member.id}
              className={`flex items-center gap-3 p-3 rounded-xl ${
                i === 0 ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-card'
              }`}
            >
              <span className={`w-8 text-center font-bold ${medalColors[i] || 'text-muted-foreground'}`}>
                {i + 1}
              </span>
              <MemberAvatar member={s.member} size={32} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{s.member.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {s.played} played
                  {s.blackjacks > 0 && ` · ${s.blackjacks} blackjack${s.blackjacks > 1 ? 's' : ''}`}
                  {s.busts > 0 && ` · ${s.busts} bust${s.busts > 1 ? 's' : ''}`}
                </p>
              </div>
              <p className="flex items-center justify-center min-w-[42px] h-10 px-3 rounded-full bg-primary text-white text-lg font-bold font-display shrink-0">{s.totalScore}</p>
            </div>
          ))}
          {seasonTotals.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No finalized gameweeks yet</p>
          )}
        </div>
      )}
    </div>
  );
}