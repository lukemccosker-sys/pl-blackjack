import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Save, Check } from 'lucide-react';

const POSITION_GROUPS = [
  {
    label: 'Goals',
    fields: [
      { key: 'points_per_goal_gk', label: 'GK', min: 0 },
      { key: 'points_per_goal_def', label: 'DEF', min: 0 },
      { key: 'points_per_goal_mid', label: 'MID', min: 0 },
      { key: 'points_per_goal_fwd', label: 'FWD', min: 0 },
    ],
  },
  {
    label: 'Clean Sheets',
    fields: [
      { key: 'points_per_cleansheet_gk', label: 'GK', min: 0 },
      { key: 'points_per_cleansheet_def', label: 'DEF', min: 0 },
      { key: 'points_per_cleansheet_mid', label: 'MID', min: 0 },
      { key: 'points_per_cleansheet_fwd', label: 'FWD', min: 0 },
    ],
  },
];

const FLAT_FIELDS = [
  { key: 'points_per_assist', label: 'Points per Assist', min: 0 },
  { key: 'points_per_appearance', label: 'Points per Appearance', min: 0 },
  { key: 'points_per_yellow_card', label: 'Points per Yellow Card', min: -10 },
  { key: 'points_per_red_card', label: 'Points per Red Card', min: -10 },
  { key: 'points_per_defensive_contribution', label: 'Points per Defensive Contribution', min: 0 },
  { key: 'bust_threshold', label: 'Bust Threshold', min: 0 },
  { key: 'blackjack_bonus', label: 'Blackjack Bonus', min: 0 },
];

const DEFAULT_CONFIG = {
  points_per_goal_gk: 10, points_per_goal_def: 6, points_per_goal_mid: 5, points_per_goal_fwd: 4,
  points_per_cleansheet_gk: 4, points_per_cleansheet_def: 4, points_per_cleansheet_mid: 1, points_per_cleansheet_fwd: 0,
  points_per_assist: 2,
  points_per_appearance: 1, points_per_yellow_card: -1, points_per_red_card: -3,
  points_per_defensive_contribution: 2,
  bust_threshold: 21, blackjack_bonus: 10, is_active: true,
};

const ALL_KEYS = [...POSITION_GROUPS.flatMap(g => g.fields.map(f => f.key)), ...FLAT_FIELDS.map(f => f.key)];

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
        const created = await base44.entities.ScoringConfig.create(DEFAULT_CONFIG);
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
    const update = {};
    ALL_KEYS.forEach(key => { update[key] = config[key] ?? 0; });
    await base44.entities.ScoringConfig.update(config.id, update);
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

      <div className="space-y-4 mb-4">
        {POSITION_GROUPS.map(group => (
          <div key={group.label} className="bg-card rounded-xl p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group.label}</p>
            <div className="grid grid-cols-4 gap-2">
              {group.fields.map(f => (
                <div key={f.key} className="flex flex-col items-center gap-1">
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <input
                    type="number" min={f.min ?? 0}
                    value={config[f.key] ?? 0}
                    onChange={(e) => handleChange(f.key, e.target.value)}
                    className="w-full bg-accent rounded-lg px-2 py-1.5 text-center text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {FLAT_FIELDS.map(f => (
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