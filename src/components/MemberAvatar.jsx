import React, { useState } from 'react';

const COLORS = [
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500',
  'bg-violet-500', 'bg-purple-500', 'bg-pink-500', 'bg-rose-500',
];

function getColorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function MemberAvatar({ member, size = 36, photo, name }) {
  const [error, setError] = useState(false);
  const displayName = name || member?.name || '?';
  const photoUrl = photo || member?.profile_photo;

  if (photoUrl && !error) {
    return (
      <img
        src={photoUrl}
        alt={displayName}
        onError={() => setError(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 ${getColorForName(displayName)}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {displayName.charAt(0).toUpperCase()}
    </div>
  );
}