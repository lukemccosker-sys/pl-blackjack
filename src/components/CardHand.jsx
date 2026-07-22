import React from 'react';
import PlayerCard from '@/components/PlayerCard';

export default function CardHand({ playerData, isBust, isBlackjack, threshold, showPoints = true }) {
  return (
    <div className="relative py-6">
      <div className="flex justify-center items-center" style={{ perspective: '800px' }}>
        {playerData.map((data, i) => (
          <PlayerCard
            key={data.player.id}
            player={data.player}
            stat={data.stat}
            points={data.points}
            index={i}
            total={playerData.length}
            showPoints={showPoints}
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
          <span className="blackjack-reveal font-display font-black text-2xl">
            BLACKJACK
          </span>
        </div>
      )}
    </div>
  );
}