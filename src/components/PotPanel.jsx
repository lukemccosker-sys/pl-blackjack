import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { usePoolAuth } from '@/lib/PoolAuth';
import { fetchAllPlayers, fetchAllPlayerStats } from '../../base44/shared/playerQueries.js';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed } from '@/lib/scoring';
import MemberAvatar from '@/components/MemberAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Coins, Check, Crown, Lock, Plus, TrendingUp, TrendingDown, ChevronDown, ChevronUp, ShieldAlert, Trophy } from 'lucide-react';

const REINVEST_AMOUNT = 20;
const MIN_BUYIN = 20;

export default function PotPanel() {
  const { member } = usePoolAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gameweeks, setGameweeks] = useState([]);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [allMembers, setAllMembers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [allPicks, setAllPicks] = useState([]);
  const [allStats, setAllStats] = useState([]);
  const [potSeason, setPotSeason] = useState(null);
  const [entries, setEntries] = useState([]);
  const [potWeeks, setPotWeeks] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [buyInInput, setBuyInInput] = useState(String(MIN_BUYIN));
  const [weekStakeInput, setWeekStakeInput] = useState('10');
  const [busy, setBusy] = useState(false);
  const [confirmingCloseSeason, setConfirmingCloseSeason] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const gws = await base44.entities.Gameweek.list('number', 50);
      const sorted = gws.sort((a, b) => a.number - b.number);
      const active = sorted.find(g => g.is_active) || sorted[sorted.length - 1];
      const currentSeason = active?.season;

      const [configs, members, allPlayers, picks, stats, potSeasons] = await Promise.all([
        base44.entities.ScoringConfig.filter({ is_active: true }),
        base44.entities.PoolMember.list('', 50),
        fetchAllPlayers(base44.entities),
        currentSeason ? base44.entities.Pick.filter({ season: currentSeason }) : base44.entities.Pick.list('', 1000),
        fetchAllPlayerStats(base44.entities, currentSeason),
        currentSeason ? base44.entities.PotSeason.filter({ season: currentSeason }) : Promise.resolve([]),
      ]);

      setGameweeks(sorted);
      setScoringConfig(configs[0] || null);
      setAllMembers(members);
      setPlayers(allPlayers);
      setAllPicks(picks);
      setAllStats(stats);
      setPotSeason(potSeasons[0] || null);

      if (currentSeason) {
        const [potEntries, weeks, contribs] = await Promise.all([
          base44.entities.PotEntry.filter({ season: currentSeason }),
          base44.entities.PotWeek.filter({ season: currentSeason }),
          base44.entities.PotContribution.filter({ season: currentSeason }),
        ]);
        setContributions(contribs);
        setEntries(potEntries);
        setPotWeeks(weeks);
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

  const active = gameweeks.find(g => g.is_active) || gameweeks[gameweeks.length - 1];
  const currentSeason = active?.season;
  const myEntry = entries.find(e => e.member_id === member?.id);
  const thisWeekBet = currentSeason ? potWeeks.find(w => w.gameweek === active.number) : null;
  const weekLocked = active ? isDeadlinePassed(active) : false;
  const iBetThisWeek = thisWeekBet?.bettor_ids?.includes(member?.id);

  const myContributions = contributions
    .filter(c => c.member_id === member?.id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const myFirstContribution = myContributions[0];
  const buyInConfirmed = myFirstContribution?.paid_in === true;

  const getPickScore = (memberId, gwNumber) => {
    const pick = allPicks.find(p => p.member_id === memberId && p.gameweek === gwNumber);
    if (!pick) return 0;
    const stats = (pick.player_ids || []).map(pid => allStats.find(s => s.player_id === pid && s.gameweek === gwNumber));
    const points = stats.map(stat => calculatePlayerPoints(stat, scoringConfig));
    return calculatePickTotal(points, scoringConfig, stats).score;
  };

  const unresolvedFinalized = currentSeason ? potWeeks.filter(w => {
    if (w.is_resolved) return false;
    const gw = gameweeks.find(g => g.number === w.gameweek);
    return gw?.is_finalized;
  }) : [];

  const resolvedWeeks = [...potWeeks].filter(w => w.is_resolved).sort((a, b) => b.gameweek - a.gameweek);
  const standings = [...entries].sort((a, b) => b.balance - a.balance);
  const pendingContributions = contributions.filter(c => !c.paid_in);

  const totalPotAmount = (thisWeekBet?.stake_amount || 0) * (thisWeekBet?.bettor_ids?.length || 0);
  const medalColors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];
  const thisWeekLeaderboard = weekLocked && thisWeekBet?.bettor_ids?.length > 0
    ? thisWeekBet.bettor_ids
        .map(id => ({
          memberId: id,
          name: entries.find(e => e.member_id === id)?.member_name || allMembers.find(m => m.id === id)?.name || 'Unknown',
          score: getPickScore(id, active.number),
        }))
        .sort((a, b) => b.score - a.score)
    : [];

  // --- Actions ---

  const handleBuyIn = async () => {
    const amount = Number(buyInInput);
    if (!amount || amount < MIN_BUYIN) return;
    setBusy(true);
    try {
      let season = potSeason;
      if (!season) {
        season = await base44.entities.PotSeason.create({ season: currentSeason, min_buyin: MIN_BUYIN, rollover_pool: 0 });
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
    if (!myEntry || myEntry.balance > 0) return;
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

  const handlePlaceFirstBet = async () => {
    const amount = Number(weekStakeInput);
    if (!amount || amount <= 0 || !myEntry || !buyInConfirmed || myEntry.balance < amount || !thisWeekBet) return;
    setBusy(true);
    try {
      const updatedWeek = await base44.entities.PotWeek.update(thisWeekBet.id, {
        stake_amount: amount, set_by_member_id: member.id, set_by_member_name: member.name,
        bettor_ids: [member.id],
      });
      const updatedEntry = await base44.entities.PotEntry.update(myEntry.id, { balance: myEntry.balance - amount });
      setPotWeeks(prev => prev.map(w => (w.id === updatedWeek.id ? updatedWeek : w)));
      setEntries(prev => prev.map(e => (e.id === updatedEntry.id ? updatedEntry : e)));
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinWeek = async () => {
    if (!myEntry || !buyInConfirmed || !thisWeekBet || myEntry.balance < thisWeekBet.stake_amount) return;
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

  const handleRemoveBettor = async (week, bettorMemberId) => {
    setBusy(true);
    try {
      const bettorEntry = entries.find(e => e.member_id === bettorMemberId);
      const remainingBettors = (week.bettor_ids || []).filter(id => id !== bettorMemberId);
      const wasLastBettor = remainingBettors.length === 0;

      const weekUpdate = wasLastBettor
        ? { bettor_ids: [], stake_amount: !weekLocked && (week.stake_amount > 0 || (week.bettor_ids || []).length === 0) ? 0 : week.stake_amount, set_by_member_id: null, set_by_member_name: null }
        : { bettor_ids: remainingBettors };
      const updatedWeek = await base44.entities.PotWeek.update(week.id, weekUpdate);
      setPotWeeks(prev => prev.map(w => (w.id === updatedWeek.id ? updatedWeek : w)));

      if (bettorEntry) {
        const updatedEntry = await base44.entities.PotEntry.update(bettorEntry.id, {
          balance: bettorEntry.balance + week.stake_amount,
        });
        setEntries(prev => prev.map(e => (e.id === updatedEntry.id ? updatedEntry : e)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleResolveWeek = async (week) => {
    setBusy(true);
    try {
      const humanScores = (week.bettor_ids || []).map(id => ({ id, score: getPickScore(id, week.gameweek) }));
      humanScores.sort((a, b) => b.score - a.score);
      const topHuman = humanScores[0];
      const weekPot = week.stake_amount * (week.bettor_ids || []).length;

      if (topHuman) {
        const winnerEntry = entries.find(e => e.member_id === topHuman.id);
        const updatedWeek = await base44.entities.PotWeek.update(week.id, {
          is_resolved: true,
          winner_member_id: topHuman.id, winner_member_name: winnerEntry?.member_name,
          pot_amount: weekPot, resolved_at: new Date().toISOString(),
        });
        setPotWeeks(prev => prev.map(w => (w.id === updatedWeek.id ? updatedWeek : w)));
        if (winnerEntry) {
          const updatedEntry = await base44.entities.PotEntry.update(winnerEntry.id, {
            balance: winnerEntry.balance + weekPot,
          });
          setEntries(prev => prev.map(e => (e.id === updatedEntry.id ? updatedEntry : e)));
        }
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
    if (!confirmingCloseSeason) {
      setConfirmingCloseSeason(true);
      return;
    }
    setBusy(true);
    try {
      const updated = await base44.entities.PotSeason.update(potSeason.id, {
        is_closed: true, closed_at: new Date().toISOString(),
      });
      setPotSeason(updated);
    } finally {
      setBusy(false);
      setConfirmingCloseSeason(false);
    }
  };

  const toggleSettled = async () => {
    const updated = await base44.entities.PotSeason.update(potSeason.id, { settled: !potSeason.settled });
    setPotSeason(updated);
  };

  const isAdmin = !!member?.is_admin;
  const hasAdminWork = isAdmin && (
    pendingContributions.length > 0 ||
    unresolvedFinalized.length > 0 ||
    (thisWeekBet?.bettor_ids?.length > 0 && !thisWeekBet.is_resolved) ||
    (potSeason && !potSeason.is_closed)
  );

  // --- Collapsed summary line ---
  let summaryLine = 'Loading...';
  if (!loading) {
    if (!currentSeason) {
      summaryLine = 'No season data yet';
    } else if (!myEntry) {
      summaryLine = 'Tap to buy in';
    } else if (thisWeekBet?.stake_amount > 0 && iBetThisWeek) {
      summaryLine = `$${myEntry.balance} bankroll · in for $${thisWeekBet.stake_amount} this week`;
    } else {
      summaryLine = `$${myEntry.balance} bankroll`;
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Coins size={18} className="text-white" />
          <span className="font-medium text-sm">The Pot</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{summaryLine}</span>
          {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-4">
          {loading ? (
            <p className="text-center text-muted-foreground text-sm py-4">Loading...</p>
          ) : !currentSeason ? (
            <p className="text-center text-muted-foreground text-sm py-4">
              Nothing to show yet — check back once the season's underway.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs mb-3">
                Totally optional. Buy in for at least ${MIN_BUYIN}, bet whatever you like each week, and top up ${REINVEST_AMOUNT} anytime you run dry — highest scorer takes the pot.
              </p>

              {/* This week's pot — the headline number */}
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-3 text-center">
                <p className="text-xs uppercase tracking-wide text-white/80 font-semibold">This Week's Pot</p>
                <p className="text-4xl font-bold font-display text-white mt-1">${totalPotAmount}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {thisWeekBet?.bettor_ids?.length > 0
                    ? `${thisWeekBet.bettor_ids.length} betting at $${thisWeekBet.stake_amount} each`
                    : 'Nobody has bet yet this week'}
                </p>
              </div>

              {/* This week's leaderboard — who's currently winning the bet */}
              {thisWeekBet?.bettor_ids?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1 flex items-center gap-1">
                    <Trophy size={12} /> This Week's Leaderboard
                  </p>
                  {!weekLocked ? (
                    <div className="bg-background/50 rounded-xl p-4 border border-border text-center">
                      <p className="text-sm text-muted-foreground">Scores visible once picks lock</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {thisWeekLeaderboard.map((row, i) => (
                        <div key={row.memberId} className="flex items-center gap-3 bg-background/50 rounded-lg p-2.5 border border-border">
                          <span className={`w-4 text-center font-bold text-sm ${medalColors[i] || 'text-muted-foreground'}`}>{i + 1}</span>
                          <MemberAvatar member={allMembers.find(m => m.id === row.memberId)} size={26} />
                          <span className="flex-1 min-w-0 text-sm font-medium truncate">
                            {row.name}
                            {row.memberId === member?.id && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                          </span>
                          <span className="text-sm font-bold text-white">{row.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* My bankroll */}
              {!myEntry ? (
                <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-3">
                  <p className="text-xs uppercase tracking-wide text-white/80 font-semibold mb-2">Your Bankroll</p>
                  <p className="text-sm mb-3">Buy in to get started — minimum ${MIN_BUYIN}.</p>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-muted-foreground">$</span>
                    <Input type="number" min={MIN_BUYIN} value={buyInInput} onChange={(e) => setBuyInInput(e.target.value)} className="w-24" />
                  </div>
                  <Button onClick={handleBuyIn} disabled={busy || Number(buyInInput) < MIN_BUYIN} className="w-full">
                    {busy ? 'Buying in...' : `Buy in for $${buyInInput || 0}`}
                  </Button>
                </div>
              ) : (
                <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-3">
                  <p className="text-xs uppercase tracking-wide text-white/80 font-semibold mb-1">Your Bankroll</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-5xl font-bold font-display text-white leading-none">${myEntry.balance}</p>
                      <p className="text-xs text-muted-foreground mt-1.5">available to bet</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">${myEntry.total_contributed}</p>
                      <p className="text-xs text-muted-foreground">put in total</p>
                    </div>
                  </div>
                  <Button onClick={handleReinvest} disabled={busy || myEntry.balance > 0} variant="outline" size="sm" className="w-full mt-3">
                    <Plus size={14} className="mr-1" /> Reinvest ${REINVEST_AMOUNT}
                  </Button>
                  {myEntry.balance > 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center mt-1.5">Reinvest unlocks once your bankroll hits $0</p>
                  ) : !buyInConfirmed ? (
                    <p className="text-[11px] text-muted-foreground text-center mt-1.5">Waiting on admin to confirm your last top-up before you can spend it</p>
                  ) : null}
                </div>
              )}

              {/* This week's bet */}
              {myEntry && !potSeason?.is_closed && (
                <div className="bg-background/50 rounded-xl p-3 border border-border mb-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Gameweek {active.number}</p>

                  {!buyInConfirmed && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Lock size={14} /> Waiting on admin to confirm your ${myFirstContribution?.amount || MIN_BUYIN} buy-in before you can bet
                    </p>
                  )}

                  {buyInConfirmed && thisWeekBet?.stake_amount === 0 && !weekLocked && (
                    <>
                      <p className="text-sm mb-3">Nobody's set this week's stake yet — name an amount and you'll be first in.</p>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-muted-foreground">$</span>
                        <Input type="number" min="1" value={weekStakeInput} onChange={(e) => setWeekStakeInput(e.target.value)} className="w-24" />
                      </div>
                      <Button onClick={handlePlaceFirstBet} disabled={busy || Number(weekStakeInput) > myEntry.balance} className="w-full">
                        {busy ? 'Placing bet...' : `Bet $${weekStakeInput || 0} on this week`}
                      </Button>
                      {Number(weekStakeInput) > myEntry.balance && (
                        <p className="text-xs text-destructive mt-2">Not enough in your bankroll — reinvest above first.</p>
                      )}
                    </>
                  )}

                  {buyInConfirmed && thisWeekBet?.stake_amount > 0 && !weekLocked && !iBetThisWeek && (
                    <>
                      <p className="text-sm mb-3">
                        This week's stake is <span className="font-semibold text-foreground">${thisWeekBet.stake_amount}</span>, set by {thisWeekBet.set_by_member_name}. Want in?
                      </p>
                      <Button onClick={handleJoinWeek} disabled={busy || myEntry.balance < thisWeekBet.stake_amount} className="w-full">
                        {busy ? 'Joining...' : `I'm in for $${thisWeekBet.stake_amount}`}
                      </Button>
                      {myEntry.balance < thisWeekBet.stake_amount && (
                        <p className="text-xs text-destructive mt-2">Not enough in your bankroll — reinvest above first.</p>
                      )}
                    </>
                  )}

                  {buyInConfirmed && thisWeekBet?.stake_amount > 0 && iBetThisWeek && (
                    <div className="flex items-center gap-2 text-sm text-white">
                      <Check size={16} /> You're in for ${thisWeekBet.stake_amount} · {thisWeekBet.bettor_ids.length} betting · ${thisWeekBet.stake_amount * thisWeekBet.bettor_ids.length} pot
                    </div>
                  )}

                  {buyInConfirmed && thisWeekBet?.stake_amount === 0 && weekLocked && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Lock size={14} /> Nobody bet this week
                    </p>
                  )}

                  {buyInConfirmed && thisWeekBet?.stake_amount > 0 && weekLocked && !thisWeekBet.is_resolved && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Lock size={14} /> Locked · ${thisWeekBet.stake_amount * thisWeekBet.bettor_ids.length} pot · {thisWeekBet.bettor_ids.length} betting · winner shown once the gameweek's final
                    </p>
                  )}
                </div>
              )}

              {/* Recent results */}
              {resolvedWeeks.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">Recent Results</p>
                  <div className="space-y-1.5">
                    {resolvedWeeks.map(w => (
                      <div key={w.id} className="flex items-center justify-between bg-background/50 rounded-lg p-2.5 border border-border text-sm">
                        <span className="text-muted-foreground">GW{w.gameweek}</span>
                        <span className="font-medium">{w.winner_member_name}</span>
                        <span className="font-bold text-white">
                          +${w.pot_amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bankroll standings */}
              {entries.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">Everyone's Bankroll</p>
                  <div className="space-y-2">
                    {standings.map((e, i) => {
                      const net = e.balance - e.total_contributed;
                      const isMe = e.member_id === member?.id;
                      return (
                        <div key={e.id} className={`flex items-center gap-3 rounded-lg p-2.5 border ${isMe ? 'bg-primary/10 border-primary/30' : 'bg-background/50 border-border'}`}>
                          <span className="text-sm text-muted-foreground w-4">{i + 1}</span>
                          <MemberAvatar member={allMembers.find(m => m.id === e.member_id)} size={28} />
                          <span className="flex-1 min-w-0 text-sm font-medium truncate">
                            {e.member_name}
                            {isMe && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                          </span>
                          <span className="text-sm font-bold">${e.balance}</span>
                          <span className={`text-xs flex items-center gap-0.5 w-16 justify-end ${net >= 0 ? 'text-white' : 'text-destructive'}`}>
                            {net >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {net >= 0 ? '+' : ''}{net}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Season closed / settlement */}
              {potSeason?.is_closed && (
                <div className="bg-background/50 rounded-xl p-4 border border-border text-center mb-3">
                  <Crown size={28} className="text-white mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Season pot closed — settle up based on each person's net below.</p>
                  <div className="space-y-2 text-left mb-4">
                    {standings.map(e => {
                      const net = e.balance - e.total_contributed;
                      return (
                        <div key={e.id} className="flex items-center justify-between text-sm">
                          <span>{e.member_name}</span>
                          <span className={net >= 0 ? 'text-white font-semibold' : 'text-destructive font-semibold'}>
                            {net >= 0 ? `owed $${net}` : `owes $${Math.abs(net)}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {isAdmin && (
                    <Button onClick={toggleSettled} variant={potSeason.settled ? 'outline' : 'default'} className="w-full">
                      {potSeason.settled ? 'Settled up ✓' : 'Mark settled'}
                    </Button>
                  )}
                </div>
              )}

              {/* Admin-only section */}
              {isAdmin && hasAdminWork && (
                <div className="mt-4 pt-4 border-t-2 border-dashed border-border">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
                    <ShieldAlert size={13} /> Admin only — not visible to other players
                  </p>

                  {pendingContributions.length > 0 && (
                    <div className="bg-background/50 rounded-xl p-3 border border-border mb-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Awaiting cash — {pendingContributions.length}</p>
                      <div className="space-y-2">
                        {pendingContributions.map(c => (
                          <div key={c.id} className="flex items-center gap-2 justify-between">
                            <span className="text-sm truncate flex-1 min-w-0">{c.member_name} · ${c.amount}</span>
                            <Button onClick={() => markContributionPaid(c)} size="sm" variant="outline" className="shrink-0">Mark paid</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {unresolvedFinalized.length > 0 && (
                    <div className="bg-background/50 rounded-xl p-3 border border-border mb-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Ready to resolve</p>
                      <div className="space-y-2">
                        {unresolvedFinalized.map(w => (
                          <div key={w.id} className="flex items-center justify-between">
                            <span className="text-sm">GW{w.gameweek} · ${w.stake_amount * (w.bettor_ids || []).length} pot · {(w.bettor_ids || []).length} betting</span>
                            <Button onClick={() => handleResolveWeek(w)} disabled={busy} size="sm">Resolve</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {thisWeekBet?.bettor_ids?.length > 0 && !thisWeekBet.is_resolved && (
                    <div className="bg-background/50 rounded-xl p-3 border border-border mb-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                        Remove a bettor from GW{thisWeekBet.gameweek} — refunds their ${thisWeekBet.stake_amount} stake
                      </p>
                      <div className="space-y-1.5">
                        {thisWeekBet.bettor_ids.map(bid => {
                          const bettorEntry = entries.find(e => e.member_id === bid);
                          return (
                            <div key={bid} className="flex items-center gap-2 justify-between">
                              <span className="text-sm truncate flex-1 min-w-0">{bettorEntry?.member_name || 'Unknown'}</span>
                              <Button onClick={() => handleRemoveBettor(thisWeekBet, bid)} disabled={busy} size="sm" variant="outline" className="shrink-0">
                                Remove & refund
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {potSeason && !potSeason.is_closed && (
                    <div className="bg-background/50 rounded-xl p-3 border border-border">
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Only for the very end of the season — stops betting for everyone and moves straight to final settlement. Can't be undone.
                      </p>
                      {confirmingCloseSeason ? (
                        <div className="flex flex-col gap-2">
                          <Button onClick={handleCloseSeason} variant="destructive" className="w-full" disabled={busy}>
                            {busy ? 'Ending...' : 'Confirm: end the season'}
                          </Button>
                          <Button onClick={() => setConfirmingCloseSeason(false)} variant="outline" className="w-full" disabled={busy}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button onClick={handleCloseSeason} variant="outline" className="w-full" disabled={entries.length === 0}>
                          End the pot for the season
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}