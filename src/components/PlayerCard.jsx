import React from 'react';
import ClubBadge from '@/components/ClubBadge';

const SUITS = { GK: '♠', DEF: '♦', MID: '♣', FWD: '♥' };
const INK = 'hsl(280 15% 12%)';
const INK_LIGHT = 'hsl(280 10% 38%)';
const TRANSITION = 'transform 320ms cubic-bezier(0.34, 1.2, 0.64, 1), margin-left 320ms cubic-bezier(0.34, 1.2, 0.64, 1), width 320ms ease-out, height 320ms ease-out';

export default function PlayerCard({ player, stat, points, index, total, showPoints = true, spread = false, large = false }) {
  const suit = SUITS[player.position] || '♣';
  const center = (total - 1) / 2;
  const rotation = spread ? 0 : (index - center) * 5;
  const yOffset = spread ? 0 : Math.abs(index - center) * (large ? 7 : 4);
  const pointsColor = points > 0 ? 'hsl(155 55% 20%)' : points < 0 ? 'hsl(355 65% 45%)' : INK_LIGHT;
  const pointsVisible = showPoints && spread;

  const width = large ? (spread ? 92 : 128) : (spread ? 50 : 68);
  const height = large ? (spread ? '236px' : '224px') : (spread ? '134px' : '124px');
  const badgeSize = large ? (spread ? 34 : 42) : (spread ? 18 : 22);
  const overlap = large ? (spread ? 0 : (index === 0 ? 0 : '-78px')) : (spread ? 0 : (index === 0 ? 0 : '-40px'));
  const nameSize = large ? 'text-sm' : 'text-[10px]';
  const subSize = large ? 'text-[10px]' : 'text-[8px]';
  const statsSize = large ? 'text-[9px]' : 'text-[7px]';
  const ptsSize = large ? 'text-base' : 'text-[11px]';
  const suitSize = large ? 'text-2xl' : 'text-sm';
  const badgePtsSize = large ? 'text-sm' : 'text-[10px]';
  const padding = large ? 'pt-8 pb-8' : 'pt-5 pb-5';

  return (
    <div
      className="relative rounded-xl shadow-md flex flex-col overflow-hidden shrink-0"
      style={{
        width: `${width}px`,
        height: height,
        backgroundColor: 'hsl(43 35% 95%)',
        color: INK,
        transform: `rotate(${rotation}deg) translateY(${yOffset}px)`,
        marginLeft: overlap,
        zIndex: index,
        transition: TRANSITION,
      }}
    >
      <div className="absolute top-1 left-1.5 leading-none">
        <span className={suitSize}>{suit}</span>
      </div>
      <div className="absolute bottom-1 right-1.5 leading-none rotate-180">
        <span className={suitSize}>{suit}</span>
      </div>

      <div className={`flex flex-col items-center justify-center flex-1 px-1 ${padding}`}>
        <ClubBadge code={player.club_code} name={player.club} size={badgeSize} />
        <p className={`${nameSize} font-bold text-center mt-1 truncate w-full`} style={{ color: INK }}>
          {player.web_name}
        </p>
        <p className={`${subSize} text-center truncate w-full`} style={{ color: INK_LIGHT }}>
          {player.position} · {player.club_short}
        </p>

        <p
          className={`${ptsSize} font-extrabold leading-none overflow-hidden`}
          style={{
            color: pointsColor,
            opacity: pointsVisible ? 1 : 0,
            maxHeight: pointsVisible ? (large ? '24px' : '16px') : '0px',
            marginTop: pointsVisible ? '6px' : '0px',
            transition: 'opacity 250ms ease-out 80ms, max-height 250ms ease-out, margin-top 250ms ease-out',
          }}
        >
          {points > 0 ? '+' : ''}{points} pts
        </p>

        {stat && (
          <p className={`${statsSize} text-center mt-1`} style={{ color: INK_LIGHT }}>
            {stat.goals}G · {stat.assists}A · {stat.clean_sheets}CS
          </p>
        )}
      </div>

      <div
        className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 font-bold"
        style={{
          color: pointsColor,
          backgroundColor: 'hsl(43 35% 88%)',
          fontSize: large ? '14px' : '10px',
          opacity: showPoints && !spread ? 1 : 0,
          pointerEvents: showPoints && !spread ? 'auto' : 'none',
          transition: 'opacity 200ms ease-out',
        }}
      >
        {points > 0 ? '+' : ''}{points}
      </div>
    </div>
  );
}