import React, { useState } from 'react';
import { usePoolAuth, ADMIN_NAME } from '@/lib/PoolAuth';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import MemberAvatar from '@/components/MemberAvatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Camera, Check, AlertCircle, LogOut, ArrowLeft } from 'lucide-react';

export default function Settings() {
  const { member, updateProfilePhoto, updateMemberName, changePin, logout } = usePoolAuth();

  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const [newName, setNewName] = useState(member?.name || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState(false);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);

  const isAdmin = member?.is_admin;
  const renamingAway = isAdmin
    && newName.trim().toLowerCase() !== ADMIN_NAME.toLowerCase()
    && newName.trim() !== member?.name;
  const nameUnchanged = !newName.trim() || newName.trim() === member?.name;

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setPhotoError('');
    try {
      await updateProfilePhoto(file);
    } catch (err) {
      setPhotoError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleNameSave = async () => {
    setNameSaving(true);
    setNameError('');
    setNameSuccess(false);
    try {
      await updateMemberName(newName);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 2000);
    } catch (err) {
      setNameError(err.message || 'Failed to update name');
    } finally {
      setNameSaving(false);
    }
  };

  const handlePinChange = async (e) => {
    e.preventDefault();
    setPinSaving(true);
    setPinError('');
    setPinSuccess(false);
    try {
      await changePin(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setPinSuccess(true);
      setTimeout(() => setPinSuccess(false), 2000);
    } catch (err) {
      setPinError(err.message || 'Failed to change PIN');
    } finally {
      setPinSaving(false);
    }
  };

  const saveNameButton = renamingAway ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={nameSaving || nameUnchanged} className="w-full sm:w-auto">
          {nameSaving ? 'Saving...' : 'Save Name'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove admin access?</AlertDialogTitle>
          <AlertDialogDescription>
            Renaming away from '{ADMIN_NAME}' will remove admin access on your next login. You'll keep admin access for this session only. Are you sure?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleNameSave}>Yes, save anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : (
    <Button onClick={handleNameSave} disabled={nameSaving || nameUnchanged} className="w-full sm:w-auto">
      {nameSaving ? 'Saving...' : 'Save Name'}
    </Button>
  );

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <section className="bg-card rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Profile Photo</h2>
        <div className="flex items-center gap-4">
          <MemberAvatar member={member} size={64} />
          <label className={`flex items-center gap-2 text-sm text-primary cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Camera size={16} />
            {uploading ? 'Uploading...' : 'Change Photo'}
            <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} className="hidden" />
          </label>
        </div>
        {photoError && <p className="text-destructive text-sm">{photoError}</p>}
      </section>

      <section className="bg-card rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Display Name</h2>
        <Input
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setNameError(''); setNameSuccess(false); }}
          disabled={nameSaving}
          placeholder="Your name"
        />
        {renamingAway && (
          <p className="text-xs text-yellow-400 flex items-start gap-1">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            Renaming away from '{ADMIN_NAME}' will remove admin access on your next login.
          </p>
        )}
        {nameError && <p className="text-destructive text-sm">{nameError}</p>}
        {nameSuccess && <p className="text-primary text-sm flex items-center gap-1"><Check size={14} /> Name updated</p>}
        <div className="flex justify-end">{saveNameButton}</div>
      </section>

      <section className="bg-card rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Change PIN</h2>
        <form onSubmit={handlePinChange} className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Current PIN</label>
            <Input
              type="password" value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="Enter current PIN" maxLength={4} inputMode="numeric"
              disabled={pinSaving}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">New PIN</label>
            <Input
              type="password" value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="Enter new PIN" maxLength={4} inputMode="numeric"
              disabled={pinSaving}
            />
          </div>
          {pinError && <p className="text-destructive text-sm">{pinError}</p>}
          {pinSuccess && <p className="text-primary text-sm flex items-center gap-1"><Check size={14} /> PIN changed</p>}
          <Button type="submit" disabled={pinSaving || !currentPin || !newPin} className="w-full">
            {pinSaving ? 'Saving...' : 'Change PIN'}
          </Button>
        </form>
      </section>

      <Button variant="outline" className="w-full" onClick={logout}>
        <LogOut size={16} /> Log Out
      </Button>
    </div>
  );
}