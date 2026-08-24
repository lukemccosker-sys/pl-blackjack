import React from 'react';
import PlayerCard from '@/components/PlayerCard';

export default function CardHand({ playerData, isBust, isBlackjack, isNatural, threshold, showPoints = true, spread = false, large = false }) {
  return (
    <div className="relative py-6 overflow-hidden">
      <div
        className="flex flex-nowrap justify-center items-center transition-[gap,padding] duration-300 ease-out"
        style={{
          gap: spread ? '4px' : '0px',
          paddingLeft: spread ? '4px' : '12px',
          paddingRight: spread ? '4px' : '12px',
          perspective: spread ? undefined : '800px',
        }}
      >
        {playerData.map((data, i) => (
          <PlayerCard
            key={data.player.id}
            player={data.player}
            stat={data.stat}
            points={data.points}
            index={i}
            total={playerData.length}
            showPoints={showPoints}
            spread={spread}
            large={large}
          />
        ))}
      </div>

      {isBust && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="bust-stamp font-display font-black text-3xl">
            BUST
          </span>
        </div>
      )}

      {isBlackjack && !isBust && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className={`font-display font-black text-2xl ${isNatural ? 'natural-reveal' : 'blackjack-reveal'}`}>
            {isNatural ? 'NATURAL 21' : 'BLACKJACK'}
          </span>
        </div>
      )}
    </div>
  );
}