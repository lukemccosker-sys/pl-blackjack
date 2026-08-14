import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { usePoolAuth } from '@/lib/PoolAuth';
import { fetchAllPlayerStats } from '../../base44/shared/playerQueries.js';
import { calculatePlayerPoints, calculatePickTotal } from '@/lib/scoring';
import MemberAvatar from '@/components/MemberAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Coins, Check, Crown, RotateCcw } from 'lucide-react';

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
  const [stakeInput, setStakeInput] = useState('50');
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

      const season = potSeasons[0] || null;
      setPotSeason(season);

      if (season && currentSeason) {
        const potEntries = await base44.entities.PotEntry.filter({ season: currentSeason });
        setEntries(potEntries);
      } else {
        setEntries([]);
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

  const getPickScore = (memberId, gwNumber) => {
    const pick = allPicks.find(p => p.member_id === memberId && p.gameweek === gwNumber);
    if (!pick) return 0;
    const stats = (pick.player_ids || []).map(pid => allStats.find(s => s.player_id === pid && s.gameweek === gwNumber));
    const points = stats.map(stat => calculatePlayerPoints(stat, scoringConfig));
    return calculatePickTotal(points, scoringConfig, stats).score;
  };

  const finalizedGws = gameweeks.filter(g => g.is_finalized && g.season === currentSeason);

  const standings = entries
    .map(e => {
      let total = 0;
      finalizedGws.forEach(gw => { total += getPickScore(e.member_id, gw.number); });
      return { ...e, total };
    })
    .sort((a, b) => b.total - a.total);

  const potTotal = entries.length * (potSeason?.stake_amount || 0);
  const paidCount = entries.filter(e => e.paid_in).length;

  const handleSetStake = async () => {
    const amount = Number(stakeInput);
    if (!amount || amount <= 0) return;
    setBusy(true);
    try {
      const created = await base44.entities.PotSeason.create({
        season: currentSeason,
        stake_amount: amount,
        set_by_member_id: member.id,
        set_by_member_name: member.name,
        is_locked: true,
      });
      const entry = await base44.entities.PotEntry.create({
        member_id: member.id,
        member_name: member.name,
        season: currentSeason,
        amount,
        joined_at: new Date().toISOString(),
      });
      setPotSeason(created);
      setEntries([entry]);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    try {
      const entry = await base44.entities.PotEntry.create({
        member_id: member.id,
        member_name: member.name,
        season: currentSeason,
        amount: potSeason.stake_amount,
        joined_at: new Date().toISOString(),
      });
      setEntries(prev => [...prev, entry]);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const togglePaid = async (entry) => {
    const updated = await base44.entities.PotEntry.update(entry.id, { paid_in: !entry.paid_in });
    setEntries(prev => prev.map(e => (e.id === entry.id ? updated : e)));
  };

  const handleClosePot = async () => {
    if (standings.length === 0) return;
    const winner = standings[0];
    const updated = await base44.entities.PotSeason.update(potSeason.id, {
      is_closed: true,
      winner_member_id: winner.member_id,
      winner_member_name: winner.member_name,
      winner_amount: potTotal,
      closed_at: new Date().toISOString(),
    });
    setPotSeason(updated);
  };

  const togglePayoutConfirmed = async () => {
    const updated = await base44.entities.PotSeason.update(potSeason.id, {
      payout_confirmed: !potSeason.payout_confirmed,
    });
    setPotSeason(updated);
  };

  const handleResetPot = async () => {
    if (entries.some(e => e.paid_in)) return;
    setBusy(true);
    try {
      await Promise.all(entries.map(e => base44.entities.PotEntry.delete(e.id)));
      await base44.entities.PotSeason.delete(potSeason.id);
      setPotSeason(null);
      setEntries([]);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 pb-24">
      <div className="mb-4">
        <h1 className="text-2xl font-bold font-heading flex items-center gap-2">
          <Coins size={24} className="text-primary" /> The Pot
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Optional side stake for this season. Nobody's forced in — the app just keeps score, you settle up yourselves.
        </p>
      </div>

      {!potSeason && (
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-sm mb-3">
            No pot set for this season yet. Set the stake and you're the first one in — everyone else can join at the same amount, no haggling.
          </p>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-muted-foreground">$</span>
            <Input type="number" min="1" value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} className="w-24" />
          </div>
          <Button onClick={handleSetStake} disabled={busy} className="w-full">
            {busy ? 'Setting up...' : `I'm in for $${stakeInput || 0}`}
          </Button>
        </div>
      )}

      {potSeason && !potSeason.is_closed && (
        <>
          <div className="bg-card rounded-xl p-4 border border-border mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Stake, set by {potSeason.set_by_member_name}</p>
                <p className="text-2xl font-bold font-display text-primary">${potSeason.stake_amount}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Pot total</p>
                <p className="text-2xl font-bold font-display">${potTotal}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{entries.length} in · {paidCount} paid up</p>
          </div>

          {!myEntry ? (
            <Button onClick={handleJoin} disabled={busy} className="w-full mb-4">
              {busy ? 'Joining...' : `I'm in for $${potSeason.stake_amount}`}
            </Button>
          ) : (
            <div className="flex items-center gap-2 mb-4 text-sm text-primary">
              <Check size={16} /> You're in for ${myEntry.amount}
            </div>
          )}

          {entries.length > 0 && (
            <div className="space-y-2 mb-4">
              {standings.map((e, i) => (
                <div key={e.id} className="flex items-center gap-3 bg-card rounded-lg p-2.5 border border-border">
                  <span className="text-sm text-muted-foreground w-4">{i + 1}</span>
                  <MemberAvatar member={allMembers.find(m => m.id === e.member_id)} size={28} />
                  <span className="flex-1 text-sm font-medium truncate">{e.member_name}</span>
                  <span className="text-sm font-bold">{e.total} pts</span>
                  {member?.is_admin && (
                    <button
                      onClick={() => togglePaid(e)}
                      className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                        e.paid_in ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {e.paid_in ? 'Paid' : 'Unpaid'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {member?.is_admin && (
            <div className="space-y-2">
              <Button onClick={handleClosePot} variant="outline" className="w-full" disabled={entries.length === 0}>
                Close pot & declare winner
              </Button>
              {!entries.some(e => e.paid_in) && (
                <Button onClick={handleResetPot} variant="ghost" disabled={busy} className="w-full text-destructive text-sm">
                  <RotateCcw size={14} className="mr-1" /> Reset pot (no one's paid in yet)
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {potSeason?.is_closed && (
        <div className="bg-card rounded-xl p-6 border border-border text-center">
          <Crown size={32} className="text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Season champion</p>
          <p className="text-xl font-bold font-display">{potSeason.winner_member_name}</p>
          <p className="text-3xl font-bold font-display text-primary mt-1">${potSeason.winner_amount}</p>
          {member?.is_admin && (
            <Button
              onClick={togglePayoutConfirmed}
              variant={potSeason.payout_confirmed ? 'outline' : 'default'}
              className="mt-4"
            >
              {potSeason.payout_confirmed ? 'Payout confirmed ✓' : 'Mark payout as sent'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
