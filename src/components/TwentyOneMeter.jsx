import React from 'react';
import { TrendingUp, Zap, AlertTriangle, Sparkles } from 'lucide-react';

const MIN_PICKS = 2;
const MAX_PICKS = 5;

/**
 * The always-on "how close am I to 21" bar for the picking screen.
 *
 * Before the deadline every player's live score is 0, so a live meter would
 * be useless — pre-deadline it shows a PROJECTED total built from recent form
 * and fixture difficulty. Once picks lock it switches to the real live score.
 */
export default function TwentyOneMeter({
  total = 0,
  threshold = 21,
  count = 0,
  live = false,
  className = '',
}) {
  const rounded = Math.round(total * 10) / 10;
  const isBust = rounded > threshold;
  const isExact = Math.abs(rounded - threshold) < 0.05;
  const remaining = Math.round((threshold - rounded) * 10) / 10;
  const cardsLeft = Math.max(0, MAX_PICKS - count);
  const pct = Math.min(100, Math.max(0, (rounded / threshold) * 100));
  const nearBust = !isBust && !isExact && rounded >= threshold - 3;

  const barClass = isBust
    ? 'bg-destructive'
    : isExact
    ? 'bg-emerald-400'
    : nearBust
    ? 'bg-amber-400'
    : 'bg-primary';

  const valueClass = isBust
    ? 'text-destructive'
    : isExact
    ? 'text-emerald-400'
    : nearBust
    ? 'text-amber-400'
    : 'text-white';

  let message;
  let MessageIcon = TrendingUp;
  if (count < MIN_PICKS) {
    message = `Pick at least ${MIN_PICKS} players to get a hand going`;
  } else if (isBust) {
    message = `${Math.round((rounded - threshold) * 10) / 10} over — that's a bust, drop someone`;
    MessageIcon = AlertTriangle;
  } else if (isExact) {
    message = 'Bang on — that is a Blackjack';
    MessageIcon = Sparkles;
  } else {
    message = `${remaining} to go · ${cardsLeft} card${cardsLeft === 1 ? '' : 's'} left`;
  }

  return (
    <div className={`bg-card rounded-xl p-3 ring-1 ring-border ${className}`}>
      <div className="flex items-end justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {live ? (
            <Zap size={12} className="text-primary" />
          ) : (
            <TrendingUp size={12} className="text-muted-foreground" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {live ? 'Live total' : 'Projected total'}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold font-display leading-none ${valueClass}`}>{rounded}</span>
          <span className="text-xs text-muted-foreground">/ {threshold}</span>
        </div>
      </div>

      <div className="relative h-2 rounded-full bg-accent overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-2 gap-2">
        <p className={`text-xs flex items-center gap-1 min-w-0 ${
          isBust ? 'text-destructive' : isExact ? 'text-emerald-400' : 'text-muted-foreground'
        }`}>
          <MessageIcon size={11} className="shrink-0" />
          <span className="truncate">{message}</span>
        </p>
        <span className="text-xs text-muted-foreground shrink-0">{count}/{MAX_PICKS}</span>
      </div>

      {!live && count > 0 && (
        <p className="text-[10px] text-muted-foreground/70 mt-1.5">
          Projection uses recent form and this week's fixture — real points start at kick-off.
        </p>
      )}
    </div>
  );
}
