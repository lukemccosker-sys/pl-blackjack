import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { calculatePlayerPoints } from '@/lib/scoring';
import ClubBadge from '@/components/ClubBadge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

const STAT_FIELDS = [
  { key: 'goals', label: 'G', max: 10 },
  { key: 'assists', label: 'A', max: 10 },
  { key: 'clean_sheets', label: 'CS', max: 1 },
  { key: 'minutes', label: 'MIN', max: 120 },
  { key: 'yellow_cards', label: 'Y', max: 2 },
  { key: 'red_cards', label: 'R', max: 1 },
];

export default function StatEditor() {
  const [gameweeks, setGameweeks] = useState([]);
  const [selectedGw, setSelectedGw] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [stats, setStats] = useState([]);
  const [picks, setPicks] = useState([]);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [gws, configs, players] = await Promise.all([
          base44.entities.Gameweek.list('number', 50),
          base44.entities.ScoringConfig.filter({ is_active: true }),
          base44.entities.Player.list('', 600),
        ]);
        const sorted = gws.sort((a, b) => b.number - a.number);
        setGameweeks(sorted);
        setScoringConfig(configs[0]);
        setAllPlayers(players);
        if (sorted[0]) {
          setSelectedGw(sorted[0].number);
          await loadGwData(sorted[0].number);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const loadGwData = async (gw) => {
    const [gwStats, gwPicks] = await Promise.all([
      base44.entities.PlayerStat.filter({ gameweek: gw }),
      base44.entities.Pick.filter({ gameweek: gw }),
    ]);
    setStats(gwStats);
    setPicks(gwPicks);
  };

  const handleGwChange = async (gw) => {
    setSelectedGw(gw);
    await loadGwData(gw);
  };

  const pickedPlayerIds = new Set(picks.flatMap(p => p.player_ids || []));

  const shownPlayers = allPlayers.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      return p.web_name?.toLowerCase().includes(q) || p.full_name?.toLowerCase().includes(q) || p.club?.toLowerCase().includes(q);
    }
    return pickedPlayerIds.has(p.id) || stats.some(s => s.player_id === p.id);
  });

  const getStat = (playerId) => stats.find(s => s.player_id === playerId);

  const handleFieldChange = async (player, field, value) => {
    const num = Math.max(0, parseInt(value) || 0);
    const existing = getStat(player.id);
    if (existing) {
      const updated = { ...existing, [field]: num };
      updated.points = calculatePlayerPoints(updated, scoringConfig);
      await base44.entities.PlayerStat.update(existing.id, { [field]: num, points: updated.points });
      setStats(prev => prev.map(s => s.id === existing.id ? updated : s));
    } else {
      const newStat = {
        player_id: player.id, player_name: player.web_name, fpl_id: player.fpl_id,
        gameweek: selectedGw,
        goals: 0, assists: 0, clean_sheets: 0, minutes: 0, yellow_cards: 0, red_cards: 0,
        points: 0,
      };
      newStat[field] = num;
      newStat.points = calculatePlayerPoints(newStat, scoringConfig);
      const created = await base44.entities.PlayerStat.create(newStat);
      setStats(prev => [...prev, created]);
    }
  };

  if (loading) return <div className="text-center text-muted-foreground py-8">Loading...</div>;

  return (
    <div>
      <select
        value={selectedGw || ''}
        onChange={(e) => handleGwChange(Number(e.target.value))}
        className="w-full bg-accent rounded-lg px-3 py-2 mb-3 text-sm"
      >
        {gameweeks.map(gw => (
          <option key={gw.id} value={gw.number}>Gameweek {gw.number}{gw.is_finalized ? ' ✓' : ''}</option>
        ))}
      </select>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players..." className="pl-9" />
      </div>

      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary" /> Has picks this gameweek
      </p>

      {shownPlayers.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {search ? 'No players found' : 'No picks for this gameweek yet'}
        </p>
      ) : (
        <div className="space-y-2">
          {shownPlayers.map(p => {
            const stat = getStat(p.id) || { goals: 0, assists: 0, clean_sheets: 0, minutes: 0, yellow_cards: 0, red_cards: 0, points: 0 };
            const hasPick = pickedPlayerIds.has(p.id);
            return (
              <div key={p.id} className={`bg-card rounded-xl p-3 ${hasPick ? 'ring-1 ring-primary/30' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  <ClubBadge code={p.club_code} name={p.club} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.web_name}</p>
                    <p className="text-xs text-muted-foreground">{p.position} · {p.club_short}</p>
                  </div>
                  <span className="text-xl font-bold text-primary w-8 text-right">{stat.points || 0}</span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {STAT_FIELDS.map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] text-muted-foreground block text-center">{f.label}</label>
                      <input
                        type="number" min="0" max={f.max}
                        value={stat[f.key] || 0}
                        onChange={(e) => handleFieldChange(p, f.key, e.target.value)}
                        className="w-full bg-accent rounded-md px-1 py-1 text-sm text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}