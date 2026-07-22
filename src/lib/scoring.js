export function calculatePlayerPoints(stats, config) {
  if (!stats || !config) return 0;
  const appearance = stats.minutes > 0 ? 1 : 0;
  return (
    (stats.goals || 0) * (config.points_per_goal || 0) +
    (stats.assists || 0) * (config.points_per_assist || 0) +
    (stats.clean_sheets || 0) * (config.points_per_clean_sheet || 0) +
    appearance * (config.points_per_appearance || 0) +
    (stats.yellow_cards || 0) * (config.points_per_yellow_card || 0) +
    (stats.red_cards || 0) * (config.points_per_red_card || 0)
  );
}

export function calculatePickTotal(playerPoints, config) {
  const total = playerPoints.reduce((sum, p) => sum + (p || 0), 0);
  const threshold = config?.bust_threshold || 21;
  const bonus = config?.blackjack_bonus || 10;
  let tier, score;
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
  return {
    total,
    isBust: tier === 'bust',
    score,
    tier,
  };
}

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