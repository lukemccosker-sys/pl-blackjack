import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const PoolAuthContext = createContext(null);
const STORAGE_KEY = 'pl_blackjack_member';

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
    const results = await base44.entities.PoolMember.filter({
      name: name.trim(),
      pin: pin.trim()
    });
    if (results.length === 0) {
      throw new Error('Invalid name or PIN');
    }
    const m = results[0];
    setMember(m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
    return m;
  };

  const register = async (name, pin) => {
    const trimmed = name.trim();
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

  const unlockAdmin = async (pin) => {
    const settings = await base44.entities.PoolSettings.filter({ admin_pin: pin.trim() });
    if (settings.length === 0) {
      throw new Error('Incorrect admin PIN');
    }
    await base44.entities.PoolMember.update(member.id, { is_admin: true });
    const newMember = { ...member, is_admin: true };
    setMember(newMember);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newMember));
    return newMember;
  };

  const logout = () => {
    setMember(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <PoolAuthContext.Provider value={{ member, loading, login, register, logout, unlockAdmin }}>
      {children}
    </PoolAuthContext.Provider>
  );
}

export function usePoolAuth() {
  const ctx = useContext(PoolAuthContext);
  if (!ctx) throw new Error('usePoolAuth must be used within PoolAuthProvider');
  return ctx;
}