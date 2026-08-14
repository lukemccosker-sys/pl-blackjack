import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { usePoolAuth } from '@/lib/PoolAuth';
import { fetchAllPlayerStats } from '../../base44/shared/playerQueries.js';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed } from '@/lib/scoring';
import MemberAvatar from '@/components/MemberAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Coins, Check, Crown, Lock, Plus, TrendingUp, TrendingDown } from 'lucide-react';

const REINVEST_AMOUNT = 20;
const MIN_BUYIN = 20;

export default function Pot() {
  const { member } = usePoolAuth();
  const [loading, setLoading] = useState(true);
  const [gameweeks, setGameweeks] = useState([]);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [allMembers, setAllMembers] = useState([]);
  const [allPicks, setAllPicks] = useState([]);
  const [allStats, setAllStats] = useState([]);
  const [potSeason, setPotSeason] = useState(null);
  const [entries, setEntries] = useState([]);
  const [potWeeks, setPotWeeks] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [buyInInput, setBuyInInput] = useState(String(MIN_BUYIN));
  const [weekStakeInput, setWeekStakeInput] = useState('10');
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const gws = await base44.entities.Gameweek.list('number', 50);
      const sorted = gws.sort((a, b) => a.number - b.number);
      const active = sorted.find(g => g.is_active) || sorted[sorted.length - 1];
      const currentSeason = active?.season;

      const [configs, members, picks, stats, potSeasons] = await Promise.all([
        base44.entities.ScoringConfig.filter({ is_active: true }),
        base44.entities.PoolMember.list('', 50),
        currentSeason ? base44.entities.Pick.filter({ season: currentSeason }) : base44.entities.Pick.list('', 1000),
        fetchAllPlayerStats(base44.entities, currentSeason),
        currentSeason ? base44.entities.PotSeason.filter({ season: currentSeason }) : Promise.resolve([]),
      ]);

      setGameweeks(sorted);
      setScoringConfig(configs[0] || null);
      setAllMembers(members);
      setAllPicks(picks);
      setAllStats(stats);
      setPotSeason(potSeasons[0] || null);

      if (currentSeason) {
        const [potEntries, weeks, contribs] = await Promise.all([
          base44.entities.PotEntry.filter({ season: currentSeason }),
          base44.entities.PotWeek.filter({ season: currentSeason }),
          base44.entities.PotContribution.filter({ season: currentSeason }),
        ]);
        setEntries(potEntries);
        setPotWeeks(weeks);
        setContributions(contribs);
      } else {
        setEntries([]);
        setPotWeeks([]);
        setContributions([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  const active = gameweeks.find(g => g.is_active) || gameweeks[gameweeks.length - 1];
  const currentSeason = active?.season;

  if (!currentSeason) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No season data yet — sync gameweeks first (Admin → Sync).
      </div>
    );
  }

  const myEntry = entries.find(e => e.member_id === member?.id);
  const thisWeekBet = potWeeks.find(w => w.gameweek === active.number);
  const weekLocked = isDeadlinePassed(active);
  const iBetThisWeek = thisWeekBet?.bettor_ids?.includes(member?.id);

  const getPickScore = (memberId, gwNumber) => {
    const pick = allPicks.find(p => p.member_id === memberId && p.gameweek === gwNumber);
    if (!pick) return 0;
    const stats = (pick.player_ids || []).map(pid => allStats.find(s => s.player_id === pid && s.gameweek === gwNumber));
    const points = stats.map(stat => calculatePlayerPoints(stat, scoringConfig));
    return calculatePickTotal(points, scoringConfig, stats).score;
  };

  const unresolvedFinalized = potWeeks.filter(w => {
    if (w.is_resolved) return false;
    const gw = gameweeks.find(g => g.number === w.gameweek);
    return gw?.is_finalized;
  });

  const resolvedWeeks = [...potWeeks].filter(w => w.is_resolved).sort((a, b) => b.gameweek - a.gameweek);
  const standings = [...entries].sort((a, b) => b.balance - a.balance);
  const pendingContributions = contributions.filter(c => !c.paid_in);

  // --- Actions ---

  const handleBuyIn = async () => {
    const amount = Number(buyInInput);
    if (!amount || amount < MIN_BUYIN) return;
    setBusy(true);
    try {
      let season = potSeason;
      if (!season) {
        season = await base44.entities.PotSeason.create({ season: currentSeason, min_buyin: MIN_BUYIN });
        setPotSeason(season);
      }
      const entry = await base44.entities.PotEntry.create({
        member_id: member.id, member_name: member.name, season: currentSeason,
        balance: amount, total_contributed: amount, joined_at: new Date().toISOString(),
      });
      await base44.entities.PotContribution.create({
        member_id: member.id, member_name: member.name, season: currentSeason,
        amount, paid_in: false, created_at: new Date().toISOString(),
      });
      setEntries(prev => [...prev, entry]);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleReinvest = async () => {
    if (!myEntry) return;
    setBusy(true);
    try {
      const updated = await base44.entities.PotEntry.update(myEntry.id, {
        balance: myEntry.balance + REINVEST_AMOUNT,
        total_contributed: myEntry.total_contributed + REINVEST_AMOUNT,
      });
      await base44.entities.PotContribution.create({
        member_id: member.id, member_name: member.name, season: currentSeason,
        amount: REINVEST_AMOUNT, paid_in: false, created_at: new Date().toISOString(),
      });
      setEntries(prev => prev.map(e => (e.id === updated.id ? updated : e)));
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSetWeekStake = async () => {
    const amount = Number(weekStakeInput);
    if (!amount || amount <= 0 || !myEntry || myEntry.balance < amount) return;
    setBusy(true);
    try {
      const week = await base44.entities.PotWeek.create({
        season: currentSeason, gameweek: active.number, stake_amount: amount,
        set_by_member_id: member.id, set_by_member_name: member.name,
        bettor_ids: [member.id], is_resolved: false,
      });
      const updatedEntry = await base44.entities.PotEntry.update(myEntry.id, { balance: myEntry.balance - amount });
      setPotWeeks(prev => [...prev, week]);
      setEntries(prev => prev.map(e => (e.id === updatedEntry.id ? updatedEntry : e)));
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinWeek = async () => {
    if (!myEntry || !thisWeekBet || myEntry.balance < thisWeekBet.stake_amount) return;
    setBusy(true);
    try {
      const updatedWeek = await base44.entities.PotWeek.update(thisWeekBet.id, {
        bettor_ids: [...thisWeekBet.bettor_ids, member.id],
      });
      const updatedEntry = await base44.entities.PotEntry.update(myEntry.id, {
        balance: myEntry.balance - thisWeekBet.stake_amount,
      });
      setPotWeeks(prev => prev.map(w => (w.id === updatedWeek.id ? updatedWeek : w)));
      setEntries(prev => prev.map(e => (e.id === updatedEntry.id ? updatedEntry : e)));
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleResolveWeek = async (week) => {
    setBusy(true);
    try {
      const scores = (week.bettor_ids || []).map(id => ({ id, score: getPickScore(id, week.gameweek) }));
      scores.sort((a, b) => b.score - a.score);
      const winnerId = scores[0]?.id;
      const winnerEntry = entries.find(e => e.member_id === winnerId);
      const potAmount = week.stake_amount * (week.bettor_ids || []).length;
      const updatedWeek = await base44.entities.PotWeek.update(week.id, {
        is_resolved: true,
        winner_member_id: winnerId,
        winner_member_name: winnerEntry?.member_name,
        pot_amount: potAmount,
        resolved_at: new Date().toISOString(),
      });
      setPotWeeks(prev => prev.map(w => (w.id === updatedWeek.id ? updatedWeek : w)));
      if (winnerEntry) {
        const updatedEntry = await base44.entities.PotEntry.update(winnerEntry.id, {
          balance: winnerEntry.balance + potAmount,
        });
        setEntries(prev => prev.map(e => (e.id === updatedEntry.id ? updatedEntry : e)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const markContributionPaid = async (contribution) => {
    const updated = await base44.entities.PotContribution.update(contribution.id, { paid_in: true });
    setContributions(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  };

  const handleCloseSeason = async () => {
    const updated = await base44.entities.PotSeason.update(potSeason.id, {
      is_closed: true, closed_at: new Date().toISOString(),
    });
    setPotSeason(updated);
  };

  const toggleSettled = async () => {
    const updated = await base44.entities.PotSeason.update(potSeason.id, { settled: !potSeason.settled });
    setPotSeason(updated);
  };

  return (
    <div className="p-4 pb-24">
      <div className="mb-4">
        <h1 className="text-2xl font-bold font-heading flex items-center gap-2">
          <Coins size={24} className="text-primary" /> The Pot
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Optional. Buy in for at least ${MIN_BUYIN}, bet whatever you like each week, top up ${REINVEST_AMOUNT} whenever you run dry.
        </p>
      </div>

      {/* My bankroll */}
      {!myEntry ? (
        <div className="bg-card rounded-xl p-4 border border-border mb-4">
          <p className="text-sm mb-3">Buy in to get started (minimum ${MIN_BUYIN}).</p>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-muted-foreground">$</span>
            <Input type="number" min={MIN_BUYIN} value={buyInInput} onChange={(e) => setBuyInInput(e.target.value)} className="w-24" />
          </div>
          <Button onClick={handleBuyIn} disabled={busy || Number(buyInInput) < MIN_BUYIN} className="w-full">
            {busy ? 'Buying in...' : `Buy in for $${buyInInput || 0}`}
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl p-4 border border-border mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Your bankroll</p>
              <p className="text-2xl font-bold font-display text-primary">${myEntry.balance}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Put in total</p>
              <p className="text-lg font-semibold">${myEntry.total_contributed}</p>
            </div>
          </div>
          <Button onClick={handleReinvest} disabled={busy} variant="outline" size="sm" className="w-full mt-3">
            <Plus size={14} className="mr-1" /> Reinvest ${REINVEST_AMOUNT}
          </Button>
        </div>
      )}

      {/* This week's bet */}
      {myEntry && !potSeason?.is_closed && (
        <div className="bg-card rounded-xl p-4 border border-border mb-4">
          <p className="text-xs text-muted-foreground mb-2">Gameweek {active.number}</p>

          {!thisWeekBet && !weekLocked && (
            <>
              <p className="text-sm mb-3">No stake set for this week yet — name one and you're the first in.</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-muted-foreground">$</span>
                <Input type="number" min="1" value={weekStakeInput} onChange={(e) => setWeekStakeInput(e.target.value)} className="w-24" />
              </div>
              <Button onClick={handleSetWeekStake} disabled={busy || Number(weekStakeInput) > myEntry.balance} className="w-full">
                {busy ? 'Placing bet...' : `Bet $${weekStakeInput || 0} on this week`}
              </Button>
              {Number(weekStakeInput) > myEntry.balance && (
                <p className="text-xs text-destructive mt-2">Not enough in your bankroll — reinvest above first.</p>
              )}
            </>
          )}

          {thisWeekBet && !weekLocked && !iBetThisWeek && (
            <>
              <p className="text-sm mb-3">
                This week's stake is <span className="font-semibold text-foreground">${thisWeekBet.stake_amount}</span>, set by {thisWeekBet.set_by_member_name}. You in?
              </p>
              <Button onClick={handleJoinWeek} disabled={busy || myEntry.balance < thisWeekBet.stake_amount} className="w-full">
                {busy ? 'Joining...' : `I'm in for $${thisWeekBet.stake_amount}`}
              </Button>
              {myEntry.balance < thisWeekBet.stake_amount && (
                <p className="text-xs text-destructive mt-2">Not enough in your bankroll — reinvest above first.</p>
              )}
            </>
          )}

          {thisWeekBet && iBetThisWeek && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <Check size={16} /> You're in this week for ${thisWeekBet.stake_amount} · {thisWeekBet.bettor_ids.length} betting · ${thisWeekBet.stake_amount * thisWeekBet.bettor_ids.length} pot
            </div>
          )}

          {!thisWeekBet && weekLocked && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Lock size={14} /> No bets placed this week
            </p>
          )}

          {thisWeekBet && weekLocked && !thisWeekBet.is_resolved && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Lock size={14} /> Locked · ${thisWeekBet.stake_amount * thisWeekBet.bettor_ids.length} pot · {thisWeekBet.bettor_ids.length} betting · winner shown once the gameweek's finalized
            </p>
          )}
        </div>
      )}

      {/* Admin: resolve finalized weeks */}
      {member?.is_admin && unresolvedFinalized.length > 0 && !potSeason?.is_closed && (
        <div className="bg-card rounded-xl p-4 border border-border mb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Ready to resolve</p>
          <div className="space-y-2">
            {unresolvedFinalized.map(w => (
              <div key={w.id} className="flex items-center justify-between">
                <span className="text-sm">GW{w.gameweek} · ${w.stake_amount * w.bettor_ids.length} pot · {w.bettor_ids.length} betting</span>
                <Button onClick={() => handleResolveWeek(w)} disabled={busy} size="sm">Resolve</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly history */}
      {resolvedWeeks.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">Weekly winners</p>
          <div className="space-y-1.5">
            {resolvedWeeks.map(w => (
              <div key={w.id} className="flex items-center justify-between bg-card rounded-lg p-2.5 border border-border text-sm">
                <span className="text-muted-foreground">GW{w.gameweek}</span>
                <span className="font-medium">{w.winner_member_name}</span>
                <span className="font-bold text-primary">+${w.pot_amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bankroll standings */}
      {entries.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">Bankrolls</p>
          <div className="space-y-2">
            {standings.map((e, i) => {
              const net = e.balance - e.total_contributed;
              return (
                <div key={e.id} className="flex items-center gap-3 bg-card rounded-lg p-2.5 border border-border">
                  <span className="text-sm text-muted-foreground w-4">{i + 1}</span>
                  <MemberAvatar member={allMembers.find(m => m.id === e.member_id)} size={28} />
                  <span className="flex-1 text-sm font-medium truncate">{e.member_name}</span>
                  <span className="text-sm font-bold">${e.balance}</span>
                  <span className={`text-xs flex items-center gap-0.5 w-16 justify-end ${net >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {net >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {net >= 0 ? '+' : ''}{net}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin: pending contributions */}
      {member?.is_admin && pendingContributions.length > 0 && (
        <div className="bg-card rounded-xl p-4 border border-border mb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Awaiting cash — {pendingContributions.length}</p>
          <div className="space-y-2">
            {pendingContributions.map(c => (
              <div key={c.id} className="flex items-center justify-between">
                <span className="text-sm">{c.member_name} · ${c.amount}</span>
                <Button onClick={() => markContributionPaid(c)} size="sm" variant="outline">Mark paid</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin: close season */}
      {member?.is_admin && potSeason && !potSeason.is_closed && (
        <Button onClick={handleCloseSeason} variant="outline" className="w-full" disabled={entries.length === 0}>
          Close season pot
        </Button>
      )}

      {/* Season closed / settlement */}
      {potSeason?.is_closed && (
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <Crown size={28} className="text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Season pot closed — settle up based on each person's net below.</p>
          <div className="space-y-2 text-left mb-4">
            {standings.map(e => {
              const net = e.balance - e.total_contributed;
              return (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span>{e.member_name}</span>
                  <span className={net >= 0 ? 'text-primary font-semibold' : 'text-destructive font-semibold'}>
                    {net >= 0 ? `owed $${net}` : `owes $${Math.abs(net)}`}
                  </span>
                </div>
              );
            })}
          </div>
          {member?.is_admin && (
            <Button onClick={toggleSettled} variant={potSeason.settled ? 'outline' : 'default'} className="w-full">
              {potSeason.settled ? 'Settled up ✓' : 'Mark settled'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
