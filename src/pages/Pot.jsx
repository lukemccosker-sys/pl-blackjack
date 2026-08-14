import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { usePoolAuth } from '@/lib/PoolAuth';
import { fetchAllPlayers, fetchAllPlayerStats } from '../../base44/shared/playerQueries.js';
import { calculatePlayerPoints, calculatePickTotal, isDeadlinePassed } from '@/lib/scoring';
import MemberAvatar from '@/components/MemberAvatar';
import ClubBadge from '@/components/ClubBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Coins, Check, Crown, Lock, Plus, TrendingUp, TrendingDown, Spade } from 'lucide-react';

const REINVEST_AMOUNT = 20;
const MIN_BUYIN = 20;
const DEALER_HAND_SIZE = 5;

function pickDealerHand(players) {
  const pool = [...players];
  const hand = [];
  for (let i = 0; i < DEALER_HAND_SIZE && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    hand.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return hand;
}

export default function Pot() {
  const { member } = usePoolAuth();
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
      const season = potSeasons[0] || null;
      setPotSeason(season);

      if (currentSeason) {
        const [potEntries, weeks, contribs] = await Promise.all([
          base44.entities.PotEntry.filter({ season: currentSeason }),
          base44.entities.PotWeek.filter({ season: currentSeason }),
          base44.entities.PotContribution.filter({ season: currentSeason }),
        ]);
        setContributions(contribs);
        setEntries(potEntries);

        // Deal the dealer's hand for the active gameweek if nobody has yet,
        // as long as the pot exists and betting hasn't locked.
        const weekLocked = isDeadlinePassed(active);
        const existingWeek = weeks.find(w => w.gameweek === active.number);
        if (season && !existingWeek && !weekLocked && allPlayers.length > 0) {
          const dealerHand = pickDealerHand(allPlayers);
          const created = await base44.entities.PotWeek.create({
            season: currentSeason, gameweek: active.number, stake_amount: 0,
            bettor_ids: [], dealer_player_ids: dealerHand, is_resolved: false,
          });
          setPotWeeks([...weeks, created]);
        } else {
          setPotWeeks(weeks);
        }
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
  const dealerHandPlayers = (thisWeekBet?.dealer_player_ids || []).map(id => players.find(p => p.id === id)).filter(Boolean);
  const rolloverPool = potSeason?.rollover_pool || 0;

  const getPickScore = (memberId, gwNumber) => {
    const pick = allPicks.find(p => p.member_id === memberId && p.gameweek === gwNumber);
    if (!pick) return 0;
    const stats = (pick.player_ids || []).map(pid => allStats.find(s => s.player_id === pid && s.gameweek === gwNumber));
    const points = stats.map(stat => calculatePlayerPoints(stat, scoringConfig));
    return calculatePickTotal(points, scoringConfig, stats).score;
  };

  const getDealerScore = (week) => {
    const stats = (week.dealer_player_ids || []).map(pid => allStats.find(s => s.player_id === pid && s.gameweek === week.gameweek));
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

  const handlePlaceFirstBet = async () => {
    const amount = Number(weekStakeInput);
    if (!amount || amount <= 0 || !myEntry || myEntry.balance < amount || !thisWeekBet) return;
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
      const dealerScore = getDealerScore(week);
      const humanScores = (week.bettor_ids || []).map(id => ({ id, score: getPickScore(id, week.gameweek) }));
      humanScores.sort((a, b) => b.score - a.score);
      const topHuman = humanScores[0];
      const weekPot = week.stake_amount * (week.bettor_ids || []).length;
      const houseWon = !topHuman || dealerScore > topHuman.score;

      if (houseWon) {
        const updatedWeek = await base44.entities.PotWeek.update(week.id, {
          is_resolved: true, dealer_score: dealerScore, house_won: true,
          pot_amount: weekPot, resolved_at: new Date().toISOString(),
        });
        setPotWeeks(prev => prev.map(w => (w.id === updatedWeek.id ? updatedWeek : w)));
        if (weekPot > 0) {
          const updatedSeason = await base44.entities.PotSeason.update(potSeason.id, {
            rollover_pool: (potSeason.rollover_pool || 0) + weekPot,
          });
          setPotSeason(updatedSeason);
        }
      } else {
        const winnerEntry = entries.find(e => e.member_id === topHuman.id);
        const claimedRollover = potSeason.rollover_pool || 0;
        const totalWin = weekPot + claimedRollover;
        const updatedWeek = await base44.entities.PotWeek.update(week.id, {
          is_resolved: true, dealer_score: dealerScore, house_won: false,
          winner_member_id: topHuman.id, winner_member_name: winnerEntry?.member_name,
          pot_amount: totalWin, resolved_at: new Date().toISOString(),
        });
        setPotWeeks(prev => prev.map(w => (w.id === updatedWeek.id ? updatedWeek : w)));
        if (winnerEntry) {
          const updatedEntry = await base44.entities.PotEntry.update(winnerEntry.id, {
            balance: winnerEntry.balance + totalWin,
          });
          setEntries(prev => prev.map(e => (e.id === updatedEntry.id ? updatedEntry : e)));
        }
        if (claimedRollover > 0) {
          const updatedSeason = await base44.entities.PotSeason.update(potSeason.id, { rollover_pool: 0 });
          setPotSeason(updatedSeason);
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
          Optional. Buy in for at least ${MIN_BUYIN}, bet whatever you like each week, top up ${REINVEST_AMOUNT} whenever you run dry — and watch out for the dealer.
        </p>
      </div>

      {rolloverPool > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 mb-4 text-center">
          <p className="text-xs text-primary/80 font-medium">House is on a streak — jackpot rolling</p>
          <p className="text-2xl font-bold font-display text-primary">${rolloverPool}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Beat the dealer this week to scoop it</p>
        </div>
      )}

      {/* The dealer's hand for this week */}
      {thisWeekBet && dealerHandPlayers.length > 0 && (
        <div className="bg-card rounded-xl p-4 border border-border mb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <Spade size={12} /> The Dealer — Gameweek {active.number}
          </p>
          <div className="flex gap-2 flex-wrap">
            {dealerHandPlayers.map(p => (
              <div key={p.id} className="flex flex-col items-center w-14">
                <ClubBadge code={p.club_code} name={p.club} size={26} />
                <p className="text-[9px] font-medium text-center mt-1 truncate w-full">{p.web_name}</p>
              </div>
            ))}
          </div>
          {thisWeekBet.is_resolved && (
            <p className={`text-sm font-semibold mt-3 ${thisWeekBet.house_won ? 'text-destructive' : 'text-primary'}`}>
              Dealer scored {thisWeekBet.dealer_score} · {thisWeekBet.house_won ? 'House wins this week' : 'Beaten by ' + thisWeekBet.winner_member_name}
            </p>
          )}
        </div>
      )}

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

          {thisWeekBet?.stake_amount === 0 && !weekLocked && (
            <>
              <p className="text-sm mb-3">No stake set for this week yet — name one and you're the first in.</p>
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

          {thisWeekBet?.stake_amount > 0 && !weekLocked && !iBetThisWeek && (
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

          {thisWeekBet?.stake_amount > 0 && iBetThisWeek && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <Check size={16} /> You're in this week for ${thisWeekBet.stake_amount} · {thisWeekBet.bettor_ids.length} betting · ${thisWeekBet.stake_amount * thisWeekBet.bettor_ids.length} pot
            </div>
          )}

          {thisWeekBet?.stake_amount === 0 && weekLocked && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Lock size={14} /> No bets placed this week
            </p>
          )}

          {thisWeekBet?.stake_amount > 0 && weekLocked && !thisWeekBet.is_resolved && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Lock size={14} /> Locked · ${thisWeekBet.stake_amount * thisWeekBet.bettor_ids.length} pot · {thisWeekBet.bettor_ids.length} betting · resolves once the gameweek's finalized
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
                <span className="text-sm">GW{w.gameweek} · ${w.stake_amount * (w.bettor_ids || []).length} pot · {(w.bettor_ids || []).length} betting</span>
                <Button onClick={() => handleResolveWeek(w)} disabled={busy} size="sm">Resolve</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly history */}
      {resolvedWeeks.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">Weekly results</p>
          <div className="space-y-1.5">
            {resolvedWeeks.map(w => (
              <div key={w.id} className="flex items-center justify-between bg-card rounded-lg p-2.5 border border-border text-sm">
                <span className="text-muted-foreground">GW{w.gameweek}</span>
                {w.house_won ? (
                  <span className="font-medium text-destructive flex items-center gap-1"><Spade size={12} /> House won</span>
                ) : (
                  <span className="font-medium">{w.winner_member_name}</span>
                )}
                <span className={`font-bold ${w.house_won ? 'text-muted-foreground' : 'text-primary'}`}>
                  {w.house_won ? `+$${w.pot_amount} → jackpot` : `+$${w.pot_amount}`}
                </span>
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
          {rolloverPool > 0 && (
            <p className="text-xs text-muted-foreground mb-3">
              Note: ${rolloverPool} was still sitting unclaimed in the house jackpot when the pot closed.
            </p>
          )}
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
