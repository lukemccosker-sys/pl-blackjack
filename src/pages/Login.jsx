import React, { useState, useEffect } from 'react';
import { usePoolAuth, isAdminName } from '@/lib/PoolAuth';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spade, Club, Heart, Diamond, Shield } from 'lucide-react';

export default function Login() {
  const { login, register, checkAdminSetup } = usePoolAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminSetup, setAdminSetup] = useState(null);

  const adminName = isAdminName(name);

  useEffect(() => {
    if (!adminName) { setAdminSetup(null); return; }
    setAdminSetup(null);
    checkAdminSetup().then(setAdminSetup).catch(() => setAdminSetup(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (adminName || mode === 'login') {
        await login(name, pin);
      } else {
        await register(name, pin);
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const pinLabel = adminName
    ? (adminSetup === false ? 'Set Admin PIN' : 'Admin PIN')
    : 'PIN';
  const buttonText = adminName
    ? (adminSetup === false ? 'Set Admin PIN' : adminSetup === null ? 'Checking...' : 'Admin Login')
    : (mode === 'login' ? 'Login' : 'Register');

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="mb-12 text-center">
        <div className="flex justify-center gap-2 mb-4">
          <Spade className="text-primary" size={32} />
          <Club className="text-primary" size={32} />
          <Heart className="text-primary" size={32} />
          <Diamond className="text-primary" size={32} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">PL Blackjack</h1>
        <p className="text-muted-foreground mt-2 text-sm">Get to 21. Don't bust.</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" disabled={loading} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-1">
            {adminName && <Shield size={14} className="text-primary" />}
            {pinLabel}
          </label>
          <Input
            type="password" value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4-digit PIN" maxLength={4} inputMode="numeric"
            disabled={loading}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || !name || !pin || (adminName && adminSetup === null)}>
          {loading ? 'Please wait...' : buttonText}
        </Button>
        {!adminName && (
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === 'login' ? "Don't have an account? Register" : 'Already registered? Login'}
          </button>
        )}
        {adminName && adminSetup === false && (
          <p className="text-xs text-muted-foreground text-center">
            First time setup — choose a 4-digit PIN for admin access.
          </p>
        )}
        {adminName && adminSetup === true && (
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <Shield size={12} className="text-primary" /> Admin login
          </p>
        )}
      </form>
    </div>
  );
}