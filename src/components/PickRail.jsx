import React from 'react';
import ClubBadge from '@/components/ClubBadge';
import { Button } from '@/components/ui/button';
import { Save, Check, X } from 'lucide-react';

const MAX_PICKS = 5;
const MIN_PICKS = 2;

export default function PickRail({ selectedPlayers, onRemove, onSave, saving, saved, hasFive }) {
  const slots = Array.from({ length: MAX_PICKS }, (_, i) => selectedPlayers[i] || null);

  return (
    <div className="w-[74px] shrink-0 sticky top-4 flex flex-col gap-2">
      {slots.map((player, i) => (
        <div
          key={player?.id || `empty-${i}`}
          className={`relative rounded-lg border flex flex-col items-center justify-center py-2 px-1 ${
            player ? 'bg-card border-primary/40' : 'border-dashed border-border'
          }`}
          style={{ minHeight: '68px' }}
        >
          {player ? (
            <>
              <button
                onClick={() => onRemove(player)}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center"
                aria-label={`Remove ${player.web_name}`}
              >
                <X size={10} />
              </button>
              <ClubBadge code={player.club_code} name={player.club} size={24} />
              <p className="text-[9px] font-medium text-center mt-1 leading-tight truncate w-full">
                {player.web_name}
              </p>
            </>
          ) : (
            <span className="text-muted-foreground/40 text-xs font-medium">{i + 1}</span>
          )}
        </div>
      ))}

      <p className="text-[10px] text-muted-foreground text-center leading-tight">
        {selectedPlayers.length}/{MAX_PICKS}
        {selectedPlayers.length < MIN_PICKS && <span className="block">min {MIN_PICKS}</span>}
      </p>

      <Button onClick={onSave} disabled={!hasFive || saving} size="sm" className="w-full px-1">
        {saving ? '...' : saved ? <Check size={14} /> : <Save size={14} />}
      </Button>
    </div>
  );
}
