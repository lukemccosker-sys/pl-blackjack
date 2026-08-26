import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bell, Check, AlertCircle, Send } from 'lucide-react';

export default function ReminderSettings() {
  const [settings, setSettings] = useState(null);
  const [webhook, setWebhook] = useState('');
  const [hours, setHours] = useState('24');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const rows = await base44.entities.PoolSettings.list('', 10);
        const row = rows.find(s => s.admin_pin) || rows[0] || null;
        setSettings(row);
        setWebhook(row?.reminder_webhook_url || '');
        setHours(String(row?.reminder_hours_before ?? 24));
        setEnabled(row?.reminder_enabled === true);
      } catch (err) {
        setError(err.message || 'Could not load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!settings?.id) {
      setError('No pool settings record yet — log in as admin once to create it.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await base44.entities.PoolSettings.update(settings.id, {
        reminder_webhook_url: webhook.trim(),
        reminder_hours_before: Number(hours) || 24,
        reminder_enabled: enabled,
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const resp = await base44.functions.invoke('remindPickers', { test: true });
      setTestResult(resp.data);
    } catch (err) {
      setError(err.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <p className="text-center text-muted-foreground py-6">Loading...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Posts a message to your group chat when the deadline is close, naming whoever
        hasn&apos;t picked. Works with any Discord or Slack incoming webhook. Only one
        message goes out per gameweek, however often the check runs.
      </p>

      <div className="space-y-2">
        <label htmlFor="webhook" className="text-sm text-muted-foreground block">
          Webhook URL
        </label>
        <Input
          id="webhook"
          value={webhook}
          onChange={(e) => { setWebhook(e.target.value); setSaved(false); }}
          placeholder="https://discord.com/api/webhooks/..."
          className="h-12"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Discord: Server Settings &rarr; Integrations &rarr; Webhooks &rarr; New Webhook &rarr; Copy URL.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="hours" className="text-sm text-muted-foreground block">
          Hours before the deadline
        </label>
        <Input
          id="hours"
          type="number"
          inputMode="numeric"
          min="1"
          max="168"
          value={hours}
          onChange={(e) => { setHours(e.target.value); setSaved(false); }}
          className="h-12"
        />
      </div>

      <label className="flex items-center gap-3 bg-card rounded-xl p-3 min-h-[56px] cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => { setEnabled(e.target.checked); setSaved(false); }}
          className="w-5 h-5 accent-current"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">Reminders on</span>
          <span className="block text-xs text-muted-foreground">
            Leave off while you&apos;re still testing the webhook
          </span>
        </span>
        <Bell size={16} className={enabled ? 'text-primary' : 'text-muted-foreground'} />
      </label>

      {error && (
        <p className="text-destructive text-sm flex items-start gap-1">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {saved && (
        <p className="text-primary text-sm flex items-center gap-1">
          <Check size={14} /> Saved
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1 h-12">
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button
          onClick={handleTest}
          disabled={testing || !webhook.trim()}
          variant="outline"
          className="flex-1 h-12"
        >
          <Send size={14} /> {testing ? 'Sending...' : 'Send test'}
        </Button>
      </div>

      {testResult && (
        <div className="bg-card rounded-xl p-4 text-sm space-y-1">
          {testResult.sent ? (
            <>
              <p className="text-primary flex items-center gap-1 font-medium">
                <Check size={14} /> Posted to your group chat
              </p>
              <p className="text-xs text-muted-foreground break-words">
                &ldquo;{testResult.message}&rdquo;
              </p>
            </>
          ) : (
            <p className="text-yellow-400 flex items-start gap-1">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {testResult.reason || testResult.error || 'Nothing sent'}
              {testResult.detail ? ` — ${testResult.detail}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
