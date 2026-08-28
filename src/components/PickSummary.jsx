import React from 'react';
import { Button } from '@/components/ui/button';
import TwentyOneMeter from '@/components/TwentyOneMeter';
import { Lock, Save, Check, AlertTriangle, X } from 'lucide-react';

const MIN_PICKS = 2;

/**
 * The persistent bottom sheet for the picking screen — used while picking AND
 * once locked, so there's a single pick UI rather than a side rail on one and
 * a sheet on the other. Keeping it at the bottom leaves the player list the
 * full width of the phone, which the old 74px side rail did not.
 */
export default function PickSummary({
  selectedPlayers,
  playerPoints,
  isBust,
  onSave,
  onRemove,
  saving,
  saved,
  isLocked,
  hasMinimum,
  isFinalized,
  tier,
  meterTotal = 0,
  threshold = 21,
}) {
  const showBadge = isBust || tier === 'blackjack' || isFinalized || isLocked;

  return (
    <div className="fixed above-nav left-0 right-0 z-40">
      <div className="max-w-lg mx-auto bg-card border-t border-border rounded-t-2xl shadow-lg p-4">
        {/* While picking, the running total lives here so it stays visible as
            you scroll the player list. Once locked the page header already
            shows the score, so the meter would only duplicate it. */}
        {!isLocked && (
          <TwentyOneMeter
            total={meterTotal}
            threshold={threshold}
            count={selectedPlayers.length}
            live={false}
            compact
            className="mb-3"
          />
        )}

        {showBadge && (
          <div className="flex items-center justify-end mb-3">
            {isBust ? (
              <span className="flex items-center gap-1 text-destructive text-sm font-semibold">
                <AlertTriangle size={16} /> BUST
              </span>
            ) : tier === 'blackjack' ? (
              <span className="text-white text-sm font-bold tracking-wide">
                BLACKJACK!
              </span>
            ) : isFinalized ? (
              <span className="flex items-center gap-1 text-white text-sm font-medium">
                <Check size={16} /> Final
              </span>
            ) : isLocked ? (
              <span className="flex items-center gap-1 text-muted-foreground text-sm">
                <Lock size={14} /> Locked
              </span>
            ) : null}
          </div>
        )}

        <div className="flex gap-1.5 mb-3 min-h-[36px] flex-wrap">
          {selectedPlayers.length === 0 && (
            <p className="text-sm text-muted-foreground self-center">
              {isLocked ? 'No picks saved' : `Pick ${MIN_PICKS}–5 players`}
            </p>
          )}
          {selectedPlayers.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1 bg-accent rounded-lg pl-2 pr-1 py-1">
              <span className="text-xs font-medium">{p.web_name}</span>
              {isFinalized && (
                <span className={`text-xs font-bold ${playerPoints[i] > 0 ? 'text-white' : 'text-muted-foreground'}`}>
                  {playerPoints[i]}
                </span>
              )}
              {!isLocked && (
                <button
                  onClick={() => onRemove?.(p)}
                  aria-label={`Remove ${p.web_name}`}
                  className="min-w-[32px] min-h-[32px] -my-1 flex items-center justify-center text-muted-foreground hover:text-foreground active:text-destructive"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {!isLocked && (
          <Button onClick={onSave} disabled={!hasMinimum || saving} className="w-full h-12">
            {saving ? 'Saving...' : saved ? <><Check size={16} /> Saved</> : <><Save size={16} /> Save Picks</>}
          </Button>
        )}
      </div>
    </div>
  );
}
