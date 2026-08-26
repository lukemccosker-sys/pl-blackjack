import React from 'react';

/**
 * Full-width segmented control for switching views on a page.
 * Every segment is at least 44px tall so it's a comfortable thumb target.
 */
export default function SegmentedControl({ value, onChange, options, className = '', ariaLabel }) {
  return (
    <div className={`flex gap-2 ${className}`} role="tablist" aria-label={ariaLabel}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              active ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
