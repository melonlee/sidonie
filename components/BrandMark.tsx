import React, { useId } from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

// Compact squircle (4 cubics) matching the 100..924 tile of the masters closely enough at UI sizes.
const TILE = 'M512 100C919 100 924 105 924 512C924 919 919 924 512 924C105 924 100 919 100 512C100 105 105 100 512 100Z';

/**
 * Sidonie mark: the moon rabbit (玉兔) of the FantasyAI Lab mascot family, head-only glyph
 * tuned for 20–48 px. Source of truth: docs/assets/brand/src/mascot/rabbit-moon-small.svg
 * (ids are namespaced with useId so several marks can share a page).
 */
const BrandMark: React.FC<BrandMarkProps> = ({ size = 32, className = '' }) => {
  const id = useId().replace(/:/g, '');
  const ref = (name: string) => `url(#${id}-${name})`;
  return (
    <svg width={size} height={size} viewBox="100 100 824 824" className={className} aria-hidden="true">
      <defs>
        <clipPath id={`${id}-clip`}><path d={TILE} /></clipPath>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f3833" /><stop offset="0.55" stopColor="#292524" /><stop offset="1" stopColor="#1c1917" />
        </linearGradient>
        <radialGradient id={`${id}-moon`} cx="0.38" cy="0.34" r="0.75">
          <stop offset="0" stopColor="#ffd596" /><stop offset="0.6" stopColor="#f0a948" /><stop offset="1" stopColor="#e79a3b" />
        </radialGradient>
        {/* glossy cream body, key light from the upper left */}
        <radialGradient id={`${id}-body`} cx="0.30" cy="0.18" r="0.95">
          <stop offset="0" stopColor="#fffcf9" /><stop offset="0.38" stopColor="#f7f1ec" /><stop offset="0.62" stopColor="#e2d9d1" />
          <stop offset="0.86" stopColor="#bfb4aa" /><stop offset="1" stopColor="#958a80" />
        </radialGradient>
        {/* soft warm shade on the upper-left edges + a thin highlight on the lower-right (the family "sculpt") */}
        <filter id={`${id}-sculpt`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="30" result="b1" />
          <feOffset in="b1" dx="-34" dy="-26" result="o1" />
          <feComposite in="SourceAlpha" in2="o1" operator="out" result="edge1" />
          <feFlood floodColor="#463d36" floodOpacity="0.55" />
          <feComposite in2="edge1" operator="in" result="shade" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b2" />
          <feOffset in="b2" dx="10" dy="12" result="o2" />
          <feComposite in="SourceAlpha" in2="o2" operator="out" result="edge2" />
          <feFlood floodColor="#ffffff" floodOpacity="0.9" />
          <feComposite in2="edge2" operator="in" result="shine" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="shade" /><feMergeNode in="shine" /></feMerge>
        </filter>
      </defs>
      <path d={TILE} fill={ref('bg')} />
      <g clipPath={ref('clip')}>
        <circle cx="282" cy="270" r="132" fill={ref('moon')} />
        <g transform="translate(512 1040) scale(1.12) translate(-512 -1000) rotate(6 512 760)">
          <g filter={ref('sculpt')} fill={ref('body')}>
            <path d="M350 560C300 440 290 260 330 168Q372 92 430 152C476 240 494 420 484 540Z" />
            <path d="M674 560C724 440 734 260 694 168Q652 92 594 152C548 240 530 420 540 540Z" />
            <path d="M112 1110C112 884 152 766 228 692C216 544 352 440 512 440C672 440 808 544 796 692C872 766 912 884 912 1110Z" />
          </g>
          {/* pink inner ears */}
          <path d="M368 500C334 400 330 260 362 196Q384 160 406 200C436 270 446 400 440 500Z" fill="#e6bdb4" />
          <path d="M656 500C690 400 694 260 662 196Q640 160 618 200C588 270 578 400 584 500Z" fill="#e6bdb4" />
          {/* glossy eyes and nose */}
          <rect x="366" y="584" width="88" height="136" rx="44" fill="#120f0d" />
          <circle cx="424" cy="620" r="18" fill="#fff" />
          <rect x="570" y="584" width="88" height="136" rx="44" fill="#120f0d" />
          <circle cx="628" cy="620" r="18" fill="#fff" />
          <path d="M486 744Q512 732 538 744Q532 764 512 772Q492 764 486 744Z" fill="#b98580" />
        </g>
      </g>
    </svg>
  );
};

export default BrandMark;
