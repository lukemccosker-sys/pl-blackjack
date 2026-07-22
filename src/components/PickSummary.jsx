import React from 'react';
import { Button } from '@/components/ui/button';
import { Lock, Save, Check, AlertTriangle, X } from 'lucide-react';

export default function PickSummary({
  selectedPlayers,
  playerPoints,
  total,
  isBust,
  threshold,
  onSave,
  onRemove,
  saving,
  saved,
  isLocked,
  hasFive,
  isFinalized,
  tier,
}) {
  return (
    <div className="fixed bottom-16 left-0 right-0 z-40">
      <div className="max-w-lg mx-auto bg-card border-t border-border rounded-t-2xl shadow-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className={`text-3xl font-bold ${isBust ? 'text-destructive' : 'text-primary'}`}>
              {total}
            </span>
            <span className="text-sm text-muted-foreground">/ {threshold}</span>
          </div>
          {isBust ? (
            <span className="flex items-center gap-1 text-destructive text-sm font-semibold">
              <AlertTriangle size={16} /> BUST
            </span>
          ) : tier === 'blackjack' ? (
            <span className="text-primary text-sm font-bold tracking-wide">
              BLACKJACK!
            </span>
          ) : isFinalized ? (
            <span className="flex items-center gap-1 text-primary text-sm font-medium">
              <Check size={16} /> Final
            </span>
          ) : isLocked ? (
            <span className="flex items-center gap-1 text-muted-foreground text-sm">
              <Lock size={14} /> Locked
            </span>
          ) : null}
        </div>

        <div className="flex gap-1.5 mb-3 min-h-[36px] flex-wrap">
          {selectedPlayers.length === 0 && (
            <p className="text-sm text-muted-foreground self-center">
              {isLocked ? 'No picks saved' : 'Pick 5 players'}
            </p>
          )}
          {selectedPlayers.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1 bg-accent rounded-lg px-2 py-1">
              {!isLocked && (
                <button onClick={() => onRemove?.(p)} className="text-muted-foreground hover:text-foreground">
                  <X size={12} />
                </button>
              )}
              <span className="text-xs font-medium">{p.web_name}</span>
              {isFinalized && (
                <span className={`text-xs font-bold ${playerPoints[i] > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                  {playerPoints[i]}
                </span>
              )}
            </div>
          ))}
          {!isLocked && Array.from({ length: Math.max(0, 5 - selectedPlayers.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="w-10 h-7 border border-dashed border-border rounded-lg" />
          ))}
        </div>

        {!isLocked && (
          <Button onClick={onSave} disabled={!hasFive || saving} className="w-full">
            {saving ? 'Saving...' : saved ? <><Check size={16} /> Saved</> : <><Save size={16} /> Save Picks</>}
          </Button>
        )}
      </div>
    </div>
  );
}