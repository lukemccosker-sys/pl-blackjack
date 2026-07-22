import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Save, Check } from 'lucide-react';

const FIELDS = [
  { key: 'points_per_goal', label: 'Points per Goal', min: 0 },
  { key: 'points_per_assist', label: 'Points per Assist', min: 0 },
  { key: 'points_per_clean_sheet', label: 'Points per Clean Sheet', min: 0 },
  { key: 'points_per_appearance', label: 'Points per Appearance', min: 0 },
  { key: 'points_per_yellow_card', label: 'Points per Yellow Card', min: -10 },
  { key: 'points_per_red_card', label: 'Points per Red Card', min: -10 },
  { key: 'points_per_defensive_contribution', label: 'Points per Defensive Contribution', min: 0 },
  { key: 'bust_threshold', label: 'Bust Threshold', min: 0 },
  { key: 'blackjack_bonus', label: 'Blackjack Bonus', min: 0 },
];

export default function ScoringEditor() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const configs = await base44.entities.ScoringConfig.filter({ is_active: true });
      if (configs.length > 0) {
        setConfig(configs[0]);
      } else {
        const created = await base44.entities.ScoringConfig.create({
          points_per_goal: 3, points_per_assist: 2, points_per_clean_sheet: 2,
          points_per_appearance: 1, points_per_yellow_card: -1, points_per_red_card: -3,
          points_per_defensive_contribution: 2,
          bust_threshold: 21, blackjack_bonus: 10, is_active: true,
        });
        setConfig(created);
      }
      setLoading(false);
    })();
  }, []);

  const handleChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: parseInt(value) || 0 }));
  };

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.ScoringConfig.update(config.id, {
      points_per_goal: config.points_per_goal,
      points_per_assist: config.points_per_assist,
      points_per_clean_sheet: config.points_per_clean_sheet,
      points_per_appearance: config.points_per_appearance,
      points_per_yellow_card: config.points_per_yellow_card,
      points_per_red_card: config.points_per_red_card,
      points_per_defensive_contribution: config.points_per_defensive_contribution,
      bust_threshold: config.bust_threshold,
      blackjack_bonus: config.blackjack_bonus,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="text-center text-muted-foreground py-8">Loading...</div>;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Adjust how many points each stat is worth. Players' weekly points add up across your 5 picks — get close to {config.bust_threshold} without going over.
      </p>
      <div className="space-y-3 mb-4">
        {FIELDS.map(f => (
          <div key={f.key} className="flex items-center justify-between bg-card rounded-xl p-3">
            <label className="text-sm">{f.label}</label>
            <input
              type="number" min={f.min ?? 0}
              value={config[f.key] ?? 0}
              onChange={(e) => handleChange(f.key, e.target.value)}
              className="w-20 bg-accent rounded-lg px-3 py-2 text-center text-sm"
            />
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? 'Saving...' : saved ? <><Check size={16} /> Saved</> : <><Save size={16} /> Save Changes</>}
      </Button>
    </div>
  );
}