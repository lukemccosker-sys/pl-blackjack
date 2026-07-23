import React, { useState, useMemo } from 'react';
import ClubBadge from '@/components/ClubBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Check } from 'lucide-react';
import { POSITIONS, POSITION_LABELS } from '@/lib/plData';

export default function PlayerSearch({ players, selectedIds, onToggle }) {
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState('position');

  const filtered = useMemo(() => {
    if (!query.trim()) return players;
    const q = query.toLowerCase();
    return players.filter(p =>
      p.web_name?.toLowerCase().includes(q) ||
      p.full_name?.toLowerCase().includes(q) ||
      p.club?.toLowerCase().includes(q)
    );
  }, [players, query]);

  const groups = useMemo(() => {
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
  }, [filtered, groupBy]);

  const groupKeys = groupBy === 'club'
    ? Object.keys(groups).sort()
    : POSITIONS.filter(p => groups[p]).concat(Object.keys(groups).filter(k => !POSITIONS.includes(k)));

  return (
    <div className="mb-4">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players..."
          className="pl-9"
        />
      </div>
      <div className="flex gap-2 mb-3">
        <Button size="sm" variant={groupBy === 'club' ? 'default' : 'outline'} onClick={() => setGroupBy('club')}>
          By Club
        </Button>
        <Button size="sm" variant={groupBy === 'position' ? 'default' : 'outline'} onClick={() => setGroupBy('position')}>
          By Position
        </Button>
      </div>
      <div className="space-y-3">
        {groupKeys.map(key => (
          <div key={key}>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 px-1">
              {groupBy === 'position' ? POSITION_LABELS[key] || key : key}
            </h3>
            <div className="space-y-1">
              {groups[key].map(p => {
                const isSelected = selectedIds.includes(p.id);
                const isDisabled = !isSelected && selectedIds.length >= 5;
                return (
                  <button
                    key={p.id}
                    onClick={() => onToggle(p)}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                      isSelected ? 'bg-primary/15 ring-1 ring-primary' : 'hover:bg-accent'
                    } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <ClubBadge code={p.club_code} name={p.club} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.web_name}</p>
                      <p className="text-xs text-muted-foreground">{p.position} · {p.club_short}</p>
                    </div>
                    {isSelected && <Check className="text-primary" size={18} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No players found</p>
        )}
      </div>
    </div>
  );
}