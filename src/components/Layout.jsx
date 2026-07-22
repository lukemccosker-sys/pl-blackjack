import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { usePoolAuth } from '@/lib/PoolAuth';
import BottomNav from '@/components/BottomNav';
import AdminUnlock from '@/components/AdminUnlock';

export default function Layout() {
  const { member, loading } = usePoolAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!member) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-lg mx-auto min-h-screen pb-20 relative">
        <AdminUnlock />
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}