import React, { useState, useEffect } from 'react';
import { Clock, Lock } from 'lucide-react';

function parts(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function format({ days, hours, minutes, seconds }) {
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Live countdown to a gameweek deadline. Ticks every second under an hour
 * and every minute above it, so a long wait isn't re-rendering needlessly.
 */
export default function Countdown({ deadline, prefix = 'Locks in', className = '', showIcon = true }) {
  const target = deadline ? new Date(deadline).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  const remaining = target ? target - now : null;
  const underAnHour = remaining != null && remaining < 60 * 60 * 1000;

  useEffect(() => {
    if (!target) return undefined;
    if (now >= target) return undefined;
    const tick = underAnHour ? 1000 : 30 * 1000;
    const id = setInterval(() => setNow(Date.now()), tick);
    return () => clearInterval(id);
  }, [target, underAnHour, now]);

  if (!target || Number.isNaN(target)) {
    return (
      <p className={`text-muted-foreground flex items-center gap-1 text-sm ${className}`}>
        {showIcon && <Clock size={14} />} No deadline set
      </p>
    );
  }

  if (remaining <= 0) {
    return (
      <p className={`text-destructive flex items-center gap-1 text-sm ${className}`}>
        {showIcon && <Lock size={14} />} Picks locked
      </p>
    );
  }

  const p = parts(remaining);
  const urgent = remaining < 24 * 60 * 60 * 1000;
  const critical = remaining < 60 * 60 * 1000;

  return (
    <p
      className={`flex items-center gap-1 text-sm ${
        critical ? 'text-destructive font-semibold' : urgent ? 'text-amber-400 font-medium' : 'text-muted-foreground'
      } ${className}`}
      title={new Date(target).toLocaleString()}
    >
      {showIcon && <Clock size={14} className={critical ? 'animate-pulse' : ''} />}
      {prefix} {format(p)}
    </p>
  );
}
