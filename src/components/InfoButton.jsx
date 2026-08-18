import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Info } from 'lucide-react';

export default function InfoButton({ scoringConfig }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('rules');

  const threshold = scoringConfig?.bust_threshold || 21;
  const bonus = scoringConfig?.blackjack_bonus || 10;

  const rules = [
    { icon: '🎯', title: 'The Goal', text: `Pick 2–7 Premier League players each gameweek. Their combined stats aim to hit ${threshold} exactly — blackjack!` },
    { icon: '♠️', title: 'Card Positions', text: 'Each player is a card by position: GK ♠, DEF ♦, MID ♣, FWD ♥.' },
    { icon: '🔒', title: 'Locking In', text: 'Picks lock at the gameweek deadline. After that, everyone\'s picks are revealed and scores update live as matches play.' },
    { icon: '💥', title: 'Bust', text: `Go over ${threshold} and you bust — your score for the gameweek is 0.` },
    { icon: '🃏', title: 'Blackjack', text: `Hit ${threshold} exactly and you score ${threshold + bonus} (${threshold} + ${bonus} bonus).` },
    { icon: '✨', title: 'Natural 21', text: `If a goalkeeper you picked scores a goal, it's a "Natural 21" — automatic blackjack worth ${threshold + bonus}, regardless of your raw total.` },
    { icon: '🤝', title: 'The Dealer', text: 'Each week the Dealer draws 5 random players. Beat the Dealer\'s total to win the pot.' },
  ];

  const scoringRows = [
    { label: 'Goals (GK)', key: 'points_per_goal_gk' },
    { label: 'Goals (DEF)', key: 'points_per_goal_def' },
    { label: 'Goals (MID)', key: 'points_per_goal_mid' },
    { label: 'Goals (FWD)', key: 'points_per_goal_fwd' },
    { label: 'Assists', key: 'points_per_assist' },
    { label: 'Clean Sheets (GK)', key: 'points_per_cleansheet_gk' },
    { label: 'Clean Sheets (DEF)', key: 'points_per_cleansheet_def' },
    { label: 'Clean Sheets (MID)', key: 'points_per_cleansheet_mid' },
    { label: 'Clean Sheets (FWD)', key: 'points_per_cleansheet_fwd' },
    { label: 'Appearance (any minutes)', key: 'points_per_appearance' },
    { label: 'Yellow Card', key: 'points_per_yellow_card' },
    { label: 'Red Card', key: 'points_per_red_card' },
    { label: 'Defensive Contribution', key: 'points_per_defensive_contribution' },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Rules and scoring info"
      >
        <Info size={20} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-center">How PL Blackjack Works</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTab('rules')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'rules' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
              }`}
            >
              Rules
            </button>
            <button
              onClick={() => setTab('scoring')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'scoring' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
              }`}
            >
              Scoring
            </button>
          </div>

          {tab === 'rules' ? (
            <div className="space-y-3">
              {rules.map((r, i) => (
                <div key={i} className="flex gap-3 bg-accent/40 rounded-lg p-3">
                  <span className="text-xl shrink-0">{r.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Each player earns points from their match stats. Your hand's total is the sum of all picked players' points.
              </p>
              <div className="rounded-lg overflow-hidden border border-border">
                {scoringRows.map((row, i) => {
                  const val = scoringConfig?.[row.key] ?? 0;
                  return (
                    <div
                      key={row.key}
                      className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 === 0 ? 'bg-card' : 'bg-accent/30'}`}
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className={`font-bold font-display ${val < 0 ? 'text-destructive' : 'text-primary'}`}>
                        {val > 0 ? '+' : ''}{val}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="bg-primary/10 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Bust threshold</span>
                  <span className="font-bold font-display text-primary">{threshold}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Blackjack bonus</span>
                  <span className="font-bold font-display text-primary">+{bonus}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Blackjack score</span>
                  <span className="font-bold font-display text-primary">{threshold + bonus}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Points are configured by the admin and may change between seasons.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}