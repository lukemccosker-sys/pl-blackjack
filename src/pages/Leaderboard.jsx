import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed } from '@/lib/scoring';
import { AlertTriangle } from 'lucide-react';

export default function Leaderboard() {
  const [tab, setTab] = useState('gameweek');
  const [gameweeks, setGameweeks] = useState([]);
  const [selectedGw, setSelectedGw] = useState(null);
  const [allPicks, setAllPicks] = useState([]);
  const [allStats, setAllStats] = useState([]);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [allMembers, setAllMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadInitial(); }, []);

  const loadInitial = async () => {
    try {
      const [gws, configs, members, picks, stats] = await Promise.all([
        base44.entities.Gameweek.list('number', 50),
        base44.entities.ScoringConfig.filter({ is_active: true }),
        base44.entities.PoolMember.list('', 50),
        base44.entities.Pick.list('', 1000),
        base44.entities.PlayerStat.list('', 2000),
      ]);
      const sorted = gws.sort((a, b) => a.number - b.number);
      setGameweeks(sorted);
      setScoringConfig(configs[0]);
      setAllMembers(members);
      setAllPicks(picks);
      setAllStats(stats);
      const active = sorted.find(g => g.is_active);
      const latestFinalized = sorted.filter(g => g.is_finalized).pop();
      setSelectedGw((active || latestFinalized || sorted[sorted.length - 1])?.number);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getPickScore = (pick) => {
    if (!pick) return { score: 0, total: 0, isBust: false };
    const points = (pick.player_ids || []).map(pid => {
      const stat = allStats.find(s => s.player_id === pid && s.gameweek === pick.gameweek);
      return calculatePlayerPoints(stat, scoringConfig);
    });
    return calculatePickTotal(points, scoringConfig);
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  const gwPicks = allPicks.filter(p => p.gameweek === selectedGw);
  const gwSorted = [...gwPicks].sort((a, b) => getPickScore(b).score - getPickScore(a).score);
  const selectedGwObj = gameweeks.find(g => g.number === selectedGw);

  const finalizedGws = gameweeks.filter(g => g.is_finalized);
  const seasonTotals = allMembers.map(m => {
    let totalScore = 0;
    let busts = 0;
    let blackjacks = 0;
    let played = 0;
    finalizedGws.forEach(gw => {
      const pick = allPicks.find(p => p.member_id === m.id && p.gameweek === gw.number);
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
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Leaderboard</h1>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('gameweek')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'gameweek' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
          }`}
        >
          Gameweek
        </button>
        <button
          onClick={() => setTab('season')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'season' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
          }`}
        >
          Season
        </button>
      </div>

      {tab === 'gameweek' ? (
        <>
          {gameweeks.length > 0 && (
            <select
              value={selectedGw || ''}
              onChange={(e) => setSelectedGw(Number(e.target.value))}
              className="w-full bg-accent rounded-lg px-3 py-2 mb-4 text-sm"
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
                  selectedGwObj?.is_finalized ? 'bg-primary/20 text-primary' : 'bg-accent text-muted-foreground'
                }`}>
                  {selectedGwObj?.is_finalized ? 'Final' : 'Live · In Progress'}
                </span>
              </div>
              {gwSorted.map((pick, i) => {
                const score = getPickScore(pick);
                return (
                  <div
                    key={pick.id}
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      i === 0 ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-card'
                    }`}
                  >
                    <span className={`w-8 text-center font-bold ${medalColors[i] || 'text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium">{pick.member_name}</p>
                      {score.isBust ? (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle size={10} /> BUST · {score.total - (scoringConfig?.bust_threshold || 21)} pts over
                        </p>
                      ) : score.tier === 'blackjack' ? (
                        <p className="text-xs text-primary font-semibold">BLACKJACK!</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${score.isBust ? 'text-destructive' : 'text-primary'}`}>
                        {score.score}
                      </p>
                      {!score.isBust && score.total > 0 && (
                        <p className="text-xs text-muted-foreground">{score.total} pts</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
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
              <div className="flex-1">
                <p className="font-medium">{s.member.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.played} played
                  {s.blackjacks > 0 && ` · ${s.blackjacks} blackjack${s.blackjacks > 1 ? 's' : ''}`}
                  {s.busts > 0 && ` · ${s.busts} bust${s.busts > 1 ? 's' : ''}`}
                </p>
              </div>
              <p className="text-2xl font-bold text-primary">{s.totalScore}</p>
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