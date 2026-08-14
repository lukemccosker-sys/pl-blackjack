import React from 'react';
import PlayerCard from '@/components/PlayerCard';

export default function CardHand({ playerData, isBust, isBlackjack, isNatural, threshold, showPoints = true, spread = false }) {
  return (
    <div className="relative py-6">
      <div
        className={`${spread ? 'flex flex-wrap justify-center items-start gap-3' : 'flex justify-center items-center'} transition-[gap] duration-300 ease-out`}
        style={spread ? undefined : { perspective: '800px' }}
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
