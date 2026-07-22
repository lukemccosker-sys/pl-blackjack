export function getClubBadgeUrl(code) {
  if (!code) return null;
  return `https://resources.premierleague.com/premierleague/badges/50/t${code}.png`;
}

export function getPlayerPhotoUrl(photoId) {
  if (!photoId) return null;
  return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photoId}.png`;
}

export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

export const POSITION_LABELS = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
};

export const POSITION_COLORS = {
  GK: 'text-yellow-400',
  DEF: 'text-blue-400',
  MID: 'text-green-400',
  FWD: 'text-red-400',
};