import React from 'react';
import { Outlet, Navigate, Link } from 'react-router-dom';
import { usePoolAuth } from '@/lib/PoolAuth';
import { useEntitySync } from '@/lib/queries';
import BottomNav from '@/components/BottomNav';
import MemberAvatar from '@/components/MemberAvatar';

export default function Layout() {
  const { member, loading } = usePoolAuth();
  // One subscription bridge for the whole app, instead of every page running
  // its own subscribe-and-refetch loop.
  useEntitySync();

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
      <div className="max-w-lg mx-auto min-h-screen pb-nav relative pt-safe">
        {/* Sits below the status bar on an installed app (top-safe), and is a
            44px target on a solid background so it reads as a button rather
            than blending into the wallpaper next to the system icons. */}
        <Link
          to="/settings"
          aria-label="Profile and settings"
          className="absolute right-3 top-safe z-30 w-11 h-11 flex items-center justify-center rounded-full bg-card ring-1 ring-border shadow-lg shadow-black/40 hover:ring-primary active:scale-95 transition-all"
        >
          <MemberAvatar member={member} size={30} />
        </Link>
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}