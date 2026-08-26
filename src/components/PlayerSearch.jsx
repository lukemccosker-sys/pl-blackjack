import React, { useState, useMemo } from 'react';
import ClubBadge from '@/components/ClubBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Check, Sparkles, Home as HomeIcon, Plane } from 'lucide-react';
import { POSITIONS, POSITION_LABELS } from '@/lib/plData';
import { fixtureEaseClasses } from '@/lib/playerForm';

function FixtureChip({ rating }) {
  if (!rating) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-muted-foreground/70 shrink-0">
        No game
      </span>
    );
  }
  const Icon = rating.isHome ? HomeIcon : Plane;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1 ${fixtureEaseClasses(rating.ease)}`}
      title={`${rating.isHome ? 'Home' : 'Away'} vs ${rating.opponent}`}
    >
      <Icon size={9} />
      {rating.opponentShort}
    </span>
  );
}

function PlayerRow({ player, isSelected, isDisabled, onToggle, form, rating, livePoints, showLivePoints, rank }) {
  const formAvg = form && form.appearances > 0 ? Math.round(form.perStart * 10) / 10 : null;

  return (
    <button
      onClick={() => onToggle(player)}
      disabled={isDisabled}
      className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left ${
        isSelected ? 'bg-primary/15 ring-1 ring-primary' : 'hover:bg-accent'
      } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {rank != null && (
        <span className="w-4 text-center text-[10px] font-bold text-muted-foreground shrink-0">{rank}</span>
      )}
      <ClubBadge code={player.club_code} name={player.club} size={32} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{player.web_name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {player.position} · {player.club_short}
        </p>
      </div>

      <FixtureChip rating={rating} />

      {showLivePoints ? (
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${livePoints > 0 ? 'bg-primary/15 text-white' : 'text-muted-foreground/70'}`}>
          {livePoints} pt{livePoints === 1 ? '' : 's'}
        </span>
      ) : (
        <span
          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${formAvg ? 'bg-primary/15 text-white' : 'text-muted-foreground/50'}`}
          title="Average pool points per appearance over recent gameweeks"
        >
          {formAvg != null ? `${formAvg} avg` : '—'}
        </span>
      )}

      {isSelected && <Check className="text-white shrink-0" size={18} />}
    </button>
  );
}

export default function PlayerSearch({
  players,
  selectedIds,
  onToggle,
  pointsByPlayerId = {},
  gameweekNumber,
  shortlist = [],
  formIndex = {},
  fixtureByClub = {},
  showLivePoints = false,
}) {
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState(() => (shortlist.length > 0 ? 'suggested' : 'position'));

  const searching = query.trim().length > 0;

  const filtered = useMemo(() => {
    if (!searching) return players;
    const q = query.toLowerCase();
    return players.filter(p =>
      p.web_name?.toLowerCase().includes(q) ||
      p.full_name?.toLowerCase().includes(q) ||
      p.club?.toLowerCase().includes(q)
    );
  }, [players, query, searching]);

  const groups = useMemo(() => {
    if (groupBy === 'points') {
      const sorted = [...filtered].sort((a, b) => (pointsByPlayerId[b.id] || 0) - (pointsByPlayerId[a.id] || 0));
      return { 'All Players': sorted };
    }
    const g = {};
    filtered.forEach(p => {
      const key = groupBy === 'club' ? (p.club || 'Unknown') : (p.position || 'Unknown');
      if (!g[key]) g[key] = [];
      g[key].push(p);
    });
    const posOrder = (a, b) => {
      const ia = POSITIONS.indexOf(a.position);
      const ib = POSITIONS.indexOf(b.position);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    };
    Object.values(g).forEach(arr => arr.sort(posOrder));
    return g;
  }, [filtered, groupBy, pointsByPlayerId]);

  const groupKeys = groupBy === 'club'
    ? Object.keys(groups).sort()
    : groupBy === 'points'
    ? Object.keys(groups)
    : POSITIONS.filter(p => groups[p]).concat(Object.keys(groups).filter(k => !POSITIONS.includes(k)));

  const rowProps = (p) => ({
    player: p,
    isSelected: selectedIds.includes(p.id),
    isDisabled: !selectedIds.includes(p.id) && selectedIds.length >= 5,
    onToggle,
    form: formIndex[p.id],
    rating: fixtureByClub[p.club],
    livePoints: pointsByPlayerId[p.id] || 0,
    showLivePoints,
  });

  // The suggested list is the landing view, but typing always searches
  // the whole league so nothing is ever hidden behind it.
  const showSuggested = groupBy === 'suggested' && !searching && shortlist.length > 0;

  return (
    <div className="mb-4">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all players..."
          className="pl-9"
        />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {shortlist.length > 0 && (
          <Button size="sm" variant={groupBy === 'suggested' ? 'default' : 'outline'} onClick={() => setGroupBy('suggested')}>
            <Sparkles size={12} className="mr-1" /> Suggested
          </Button>
        )}
        <Button size="sm" variant={groupBy === 'club' ? 'default' : 'outline'} onClick={() => setGroupBy('club')}>
          By Club
        </Button>
        <Button size="sm" variant={groupBy === 'position' ? 'default' : 'outline'} onClick={() => setGroupBy('position')}>
          By Position
        </Button>
        <Button size="sm" variant={groupBy === 'points' ? 'default' : 'outline'} onClick={() => setGroupBy('points')}>
          By Points
        </Button>
      </div>

      {showSuggested ? (
        <div>
          <div className="mb-2 px-1">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Sparkles size={11} /> In form, playing this week
            </h3>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Ranked on recent scoring and how kind this week&apos;s fixture looks. Search above for anyone else.
            </p>
          </div>
          <div className="space-y-1">
            {shortlist.map((entry, i) => (
              <PlayerRow key={entry.player.id} {...rowProps(entry.player)} rank={i + 1} />
            ))}
          </div>
        </div>
      ) : (
        <>
          {gameweekNumber && showLivePoints && (
            <p className="text-xs text-muted-foreground mb-2 px-1">Points shown are live for Gameweek {gameweekNumber}</p>
          )}
          {gameweekNumber && !showLivePoints && (
            <p className="text-xs text-muted-foreground mb-2 px-1">
              Showing recent form and the Gameweek {gameweekNumber} fixture
            </p>
          )}
          <div className="space-y-3">
            {groupKeys.map(key => (
              <div key={key}>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 px-1">
                  {groupBy === 'position' ? POSITION_LABELS[key] || key : key}
                </h3>
                <div className="space-y-1">
                  {groups[key].map(p => (
                    <PlayerRow key={p.id} {...rowProps(p)} />
                  ))}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No players found</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
