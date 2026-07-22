import React, { useState } from 'react';
import { usePoolAuth } from '@/lib/PoolAuth';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spade, Club, Heart, Diamond } from 'lucide-react';

export default function Login() {
  const { login, register } = usePoolAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
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
          <label className="text-sm text-muted-foreground mb-2 block">PIN</label>
          <Input
            type="password" value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4-digit PIN" maxLength={4} inputMode="numeric"
            disabled={loading}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || !name || !pin}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'}
        </Button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already registered? Login'}
        </button>
      </form>
    </div>
  );
}