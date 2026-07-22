/**
 * Client scoring utilities.
 *
 * The core scoring math (calculatePlayerPoints, calculatePickTotal) is
 * imported from base44/shared/scoring.js — the SAME module the backend
 * sync function uses. This ensures client previews and server calculations
 * never drift. Do not duplicate the scoring math here.
 */
export { calculatePlayerPoints, calculatePickTotal } from '../../base44/shared/scoring.js';

export function formatGameweekLabel(gw) {
  if (!gw) return '';
  return `Gameweek ${gw.number}`;
}

export function isDeadlinePassed(gw) {
  if (!gw) return false;
  if (!gw.deadline) return false;
  return new Date(gw.deadline) < new Date();
}

export function isGameweekFinished(fixtures, gameweekNumber) {
  const gwFixtures = fixtures.filter(f => f.gameweek === gameweekNumber);
  if (gwFixtures.length === 0) return false;
  return gwFixtures.every(f => f.finished);
}