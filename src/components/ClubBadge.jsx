import React, { useState } from 'react';
import { getClubBadgeUrl } from '@/lib/plData';

export default function ClubBadge({ code, name, size = 24 }) {
  const [error, setError] = useState(false);

  if (!code || error) {
    return (
      <div
        className="rounded-full bg-accent flex items-center justify-center text-[10px] font-bold shrink-0 text-muted-foreground"
        style={{ width: size, height: size }}
      >
        {name?.charAt(0)?.toUpperCase() || '?'}
      </div>
    );
  }

  return (
    <img
      src={getClubBadgeUrl(code)}
      alt={name || ''}
      onError={() => setError(true)}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}