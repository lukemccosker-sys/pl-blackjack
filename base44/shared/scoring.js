/**
 * SHARED SCORING LOGIC — imported by BOTH:
 *   - Client:  src/lib/scoring.js (re-exports for live preview calculations)
 *   - Server:   base44/functions/syncFplData/entry.ts (official scoring in sync)
 *
 * Do NOT duplicate this logic elsewhere. Update here only.
 *
 * Position-weighted scoring: goal and clean sheet points vary by player
 * position (GK, DEF, MID, FWD). All other stats use flat config values.
 */

export function calculatePlayerPoints(stats, config) {
  if (!stats || !config) return 0;
  const pos = (stats.position || 'mid').toLowerCase();
  const goalKey = `points_per_goal_${pos}`;
  const csKey = `points_per_cleansheet_${pos}`;
  const appearance = stats.minutes > 0 ? 1 : 0;
  return (
    (stats.goals || 0) * (config[goalKey] ?? 0) +
    (stats.assists || 0) * (config.points_per_assist || 0) +
    (stats.clean_sheets || 0) * (config[csKey] ?? 0) +
    appearance * (config.points_per_appearance || 0) +
    (stats.yellow_cards || 0) * (config.points_per_yellow_card || 0) +
    (stats.red_cards || 0) * (config.points_per_red_card || 0) +
    (stats.defensive_contribution_hit ? (config.points_per_defensive_contribution || 0) : 0)
  );
}

export function calculatePickTotal(playerPoints, config, playerStats) {
  const total = (playerPoints || []).reduce((sum, p) => sum + (p || 0), 0);
  const threshold = config?.bust_threshold || 21;
  const bonus = config?.blackjack_bonus || 10;

  // Natural 21: if any picked goalkeeper scores a genuine goal, override
  // the entire result — score becomes bust_threshold + blackjack_bonus,
  // treated as a blackjack for standings but flagged for display.
  const isNatural = (playerStats || []).some(
    s => s && s.position === 'GK' && (s.goals || 0) > 0
  );

  let tier, score;
  if (isNatural) {
    tier = 'blackjack';
    score = threshold + bonus;
    return { total: score, isBust: false, score, tier, isNatural: true };
  }
  if (total > threshold) {
    tier = 'bust';
    score = 0;
  } else if (total === threshold) {
    tier = 'blackjack';
    score = total + bonus;
  } else {
    tier = 'safe';
    score = total;
  }
  return { total, isBust: tier === 'bust', score, tier, isNatural: false };
}