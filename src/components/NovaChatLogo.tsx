import React from 'react';

interface NovaChatLogoProps {
  size?: number | string;
  variant?: 'hero' | 'sidebar' | 'icon' | 'monochrome-dark' | 'monochrome-light';
  className?: string;
  showGlow?: boolean;
}

/**
 * Refined NovaChat AI Logo Component
 * Preserves the original inverted-V / triangular geometry while slightly lengthening
 * the sleek upper vertical lines and applying a cyan-blue-violet gradient with subtle glow.
 */
export const NovaChatLogo: React.FC<NovaChatLogoProps> = ({
  size = 32,
  variant = 'icon',
  className = '',
  showGlow = true,
}) => {
  const isHero = variant === 'hero';
  const isSidebar = variant === 'sidebar';
  const isMonoDark = variant === 'monochrome-dark';
  const isMonoLight = variant === 'monochrome-light';

  const defaultDimension = isHero ? 80 : isSidebar ? 36 : typeof size === 'number' ? size : 32;
  const gradientId = `nc-grad-${Math.random().toString(36).slice(2, 7)}`;
  const filterId = `nc-glow-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: defaultDimension, height: defaultDimension }}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full overflow-visible"
        aria-label="NovaChat AI Logo"
      >
        <defs>
          {/* Cyan -> Blue -> Violet Gradient */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00D9FF" />
            <stop offset="45%" stopColor="#3285FF" />
            <stop offset="100%" stopColor="#8757FF" />
          </linearGradient>

          {/* Soft Console Ambient Glow Filter */}
          {showGlow && (
            <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={isHero ? "4.5" : "2.5"} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>

        {/* Ambient atmospheric backdrop light for Hero */}
        {isHero && showGlow && (
          <circle
            cx="50"
            cy="50"
            r="38"
            fill="url(#nc-glow-hero)"
            opacity="0.25"
            className="animate-pulse"
          />
        )}

        {/* Primary Inverted-V Outer Wings with slightly lengthened upper tips */}
        {/* Path starts at top-left tip, descends to bottom apex, ascends to top-right tip */}
        <g filter={showGlow && !isMonoDark && !isMonoLight ? `url(#${filterId})` : undefined}>
          {/* Outer Sleek Inverted-V Frame */}
          <path
            d="M 22 14
               L 22 34
               L 50 86
               L 78 34
               L 78 14"
            stroke={
              isMonoDark
                ? '#A5B0CA'
                : isMonoLight
                ? '#F4F7FF'
                : `url(#${gradientId})`
            }
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Upper Horizon Bridge / Accent Bar */}
          <path
            d="M 22 34 L 78 34"
            stroke={
              isMonoDark
                ? '#A5B0CA'
                : isMonoLight
                ? '#F4F7FF'
                : `url(#${gradientId})`
            }
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.85"
          />

          {/* Inner Inverted Geometric Core */}
          <path
            d="M 34 38
               L 50 70
               L 66 38"
            stroke={
              isMonoDark
                ? '#64748B'
                : isMonoLight
                ? '#CBD5E1'
                : '#00D9FF'
            }
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />

          {/* Upper Micro Accent Tips */}
          <circle
            cx="22"
            cy="14"
            r="2.5"
            fill={isMonoDark ? '#A5B0CA' : isMonoLight ? '#FFFFFF' : '#00D9FF'}
          />
          <circle
            cx="78"
            cy="14"
            r="2.5"
            fill={isMonoDark ? '#A5B0CA' : isMonoLight ? '#FFFFFF' : '#3285FF'}
          />
        </g>
      </svg>
    </div>
  );
};
