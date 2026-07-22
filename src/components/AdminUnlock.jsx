import React, { useState } from 'react';
import { usePoolAuth } from '@/lib/PoolAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Shield, LogOut, Lock, Check, Camera } from 'lucide-react';
import MemberAvatar from '@/components/MemberAvatar';

export default function AdminUnlock() {
  const { member, unlockAdmin, logout, updateProfilePhoto } = usePoolAuth();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await updateProfilePhoto(file);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleUnlock = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await unlockAdmin(pin);
      setSuccess(true);
      setPin('');
      setTimeout(() => { setOpen(false); setSuccess(false); }, 1500);
    } catch (err) {
      setError(err.message || 'Incorrect PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="absolute top-4 right-4 z-30 p-2 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground transition-colors">
          {member?.is_admin ? <Shield size={18} className="text-primary" /> : <Shield size={18} />}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <MemberAvatar member={member} size={56} />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Logged in as</p>
              <p className="font-medium">{member?.name}</p>
            </div>
            <label className={`flex items-center gap-1 text-xs text-primary cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Camera size={14} />
              {uploading ? 'Uploading...' : 'Photo'}
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>

          {!member?.is_admin && !success && (
            <form onSubmit={handleUnlock} className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Admin PIN</label>
                <Input
                  type="password" value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter admin PIN"
                  disabled={loading}
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={loading || !pin} className="w-full" variant="outline">
                <Lock size={16} /> Unlock Admin Access
              </Button>
            </form>
          )}

          {success && (
            <p className="text-primary text-sm flex items-center gap-2">
              <Check size={16} /> Admin access unlocked!
            </p>
          )}

          {member?.is_admin && !success && (
            <p className="text-primary text-sm flex items-center gap-2">
              <Shield size={16} /> You have admin access
            </p>
          )}

          <Button variant="outline" className="w-full" onClick={() => { logout(); setOpen(false); }}>
            <LogOut size={16} /> Log Out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}