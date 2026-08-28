import React from 'react';

/**
 * Standard page header.
 *
 * Layout pins the profile avatar at `absolute top-4 right-4` over every page,
 * so headers have to keep clear of that corner. This reserves the space once
 * (`pr-14` = the avatar button's 44px plus its 12px offset) instead of each
 * page inventing its own dodge — Home previously carried a hardcoded `mr-10`
 * on its info button for exactly this reason.
 *
 * `children` renders as right-aligned actions, clear of the avatar.
 */
export default function PageHeader({ title, subtitle, children, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 mb-4 pr-14 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold font-heading truncate">{title}</h1>
        {subtitle}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
