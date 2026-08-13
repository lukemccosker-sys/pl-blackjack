import React from 'react';
import ClubBadge from '@/components/ClubBadge';

const SUITS = { GK: '♠', DEF: '♦', MID: '♣', FWD: '♥' };
const INK = 'hsl(280 15% 12%)';
const INK_LIGHT = 'hsl(280 10% 38%)';

export default function PlayerCard({ player, stat, points, index, total, showPoints = true, spread = false }) {
  const suit = SUITS[player.position] || '♣';
  const center = (total - 1) / 2;
  const rotation = spread ? 0 : (index - center) * 5;
  const yOffset = spread ? 0 : Math.abs(index - center) * 4;
  const pointsColor = points > 0 ? 'hsl(155 55% 20%)' : points < 0 ? 'hsl(355 65% 45%)' : INK_LIGHT;

  return (
    <div
      className="relative rounded-xl shadow-md flex flex-col overflow-hidden"
      style={{
        width: '88px',
        height: spread ? '134px' : '124px',
        backgroundColor: 'hsl(43 35% 95%)',
        color: INK,
        transform: `rotate(${rotation}deg) translateY(${yOffset}px)`,
        marginLeft: spread ? 0 : (index === 0 ? 0 : '-52px'),
        zIndex: index,
      }}
    >
      <div className="absolute top-1 left-1.5 leading-none">
        <span className="text-sm">{suit}</span>
      </div>
      <div className="absolute bottom-1 right-1.5 leading-none rotate-180">
        <span className="text-sm">{suit}</span>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 px-1.5 pt-5 pb-5">
        <ClubBadge code={player.club_code} name={player.club} size={26} />
        <p className="text-[10px] font-bold text-center mt-1 truncate w-full" style={{ color: INK }}>
          {player.web_name}
        </p>
        <p className="text-[8px] text-center" style={{ color: INK_LIGHT }}>
          {player.position} · {player.club_short}
        </p>

        {showPoints && spread && (
          <p className="text-[12px] font-extrabold mt-1 leading-none" style={{ color: pointsColor }}>
            {points > 0 ? '+' : ''}{points} pts
          </p>
        )}

        {stat && (
          <p className="text-[7px] text-center mt-1" style={{ color: INK_LIGHT }}>
            {stat.goals}G · {stat.assists}A · {stat.clean_sheets}CS
          </p>
        )}
      </div>

      {showPoints && !spread && (
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{
            color: pointsColor,
            backgroundColor: 'hsl(43 35% 88%)',
          }}
        >
          {points > 0 ? '+' : ''}{points}
        </div>
      )}
    </div>
  );
}
