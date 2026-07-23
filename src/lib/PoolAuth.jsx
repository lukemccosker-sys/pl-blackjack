import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const PoolAuthContext = createContext(null);
const STORAGE_KEY = 'pl_blackjack_member';

export const ADMIN_NAME = "Luke McCosker";

export function isAdminName(name) {
  return !!name && name.trim().toLowerCase() === ADMIN_NAME.toLowerCase();
}

export function PoolAuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setMember(JSON.parse(stored));
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = async (name, pin) => {
    const trimmed = name.trim();
    if (isAdminName(trimmed)) {
      return await adminLogin(trimmed, pin.trim());
    }
    const results = await base44.entities.PoolMember.filter({
      name: trimmed,
      pin: pin.trim()
    });
    if (results.length === 0) {
      throw new Error('Invalid name or PIN');
    }
    const m = results[0];
    if (m.is_admin && !isAdminName(m.name)) {
      await base44.entities.PoolMember.update(m.id, { is_admin: false });
      m.is_admin = false;
    }
    setMember(m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
    return m;
  };

  const adminLogin = async (name, pin) => {
    const settings = await base44.entities.PoolSettings.list('', 10);
    const settingsRecord = settings.find(s => s.admin_pin);

    if (!settingsRecord) {
      await base44.entities.PoolSettings.create({ admin_pin: pin });
      return await loginOrCreateAdmin(name, pin);
    }

    if (settingsRecord.admin_pin !== pin) {
      throw new Error('Incorrect admin PIN');
    }
    return await loginOrCreateAdmin(name, pin);
  };

  const loginOrCreateAdmin = async (name, pin) => {
    const members = await base44.entities.PoolMember.filter({ name });
    let m;
    if (members.length > 0) {
      m = members[0];
      if (!m.is_admin) {
        await base44.entities.PoolMember.update(m.id, { is_admin: true });
        m = { ...m, is_admin: true };
      }
    } else {
      m = await base44.entities.PoolMember.create({
        name,
        pin,
        is_admin: true,
      });
    }
    setMember(m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
    return m;
  };

  const register = async (name, pin) => {
    const trimmed = name.trim();
    if (isAdminName(trimmed)) {
      throw new Error('This name is reserved. Use login instead.');
    }
    const existing = await base44.entities.PoolMember.filter({ name: trimmed });
    if (existing.length > 0) {
      throw new Error('That name is already taken');
    }
    const m = await base44.entities.PoolMember.create({
      name: trimmed,
      pin: pin.trim(),
      is_admin: false,
    });
    setMember(m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
    return m;
  };

  const checkAdminSetup = async () => {
    const settings = await base44.entities.PoolSettings.list('', 10);
    return settings.some(s => s.admin_pin);
  };

  const logout = () => {
    setMember(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const updateProfilePhoto = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.PoolMember.update(member.id, { profile_photo: file_url });
    const newMember = { ...member, profile_photo: file_url };
    setMember(newMember);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newMember));
    return newMember;
  };

  const updateMemberName = async (newName) => {
    const trimmed = newName.trim();
    const existing = await base44.entities.PoolMember.filter({ name: trimmed });
    if (existing.length > 0 && existing[0].id !== member.id) {
      throw new Error('That name is already taken');
    }
    await base44.entities.PoolMember.update(member.id, { name: trimmed });
    const newMember = { ...member, name: trimmed };
    setMember(newMember);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newMember));
    return newMember;
  };

  const changePin = async (currentPin, newPin) => {
    if (member.is_admin) {
      const settings = await base44.entities.PoolSettings.list('', 10);
      const settingsRecord = settings.find(s => s.admin_pin);
      if (!settingsRecord || settingsRecord.admin_pin !== currentPin.trim()) {
        throw new Error('Current PIN is incorrect');
      }
      await base44.entities.PoolSettings.update(settingsRecord.id, { admin_pin: newPin.trim() });
    } else {
      if (member.pin !== currentPin.trim()) {
        throw new Error('Current PIN is incorrect');
      }
      await base44.entities.PoolMember.update(member.id, { pin: newPin.trim() });
    }
    const newMember = { ...member, pin: newPin.trim() };
    setMember(newMember);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newMember));
  };

  return (
    <PoolAuthContext.Provider value={{
      member, loading, login, register, logout,
      updateProfilePhoto, updateMemberName, changePin, checkAdminSetup
    }}>
      {children}
    </PoolAuthContext.Provider>
  );
}

export function usePoolAuth() {
  const ctx = useContext(PoolAuthContext);
  if (!ctx) throw new Error('usePoolAuth must be used within PoolAuthProvider');
  return ctx;
}