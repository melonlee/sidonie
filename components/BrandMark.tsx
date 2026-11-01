import React, { useId } from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

// Compact squircle (4 cubics) matching the 100..924 tile of the masters closely enough at UI sizes.
const TILE = 'M512 100C919 100 924 105 924 512C924 919 919 924 512 924C105 924 100 919 100 512C100 105 105 100 512 100Z';
// The open book along the bottom edge (cover behind, then the left and right pages).
const BOOK = 'M512 812C420 776 300 772 190 790L196 960L828 960L834 790C724 772 604 776 512 812Z';

/**
 * Sidonie mark: the reading moon rabbit (玉兔) of the FantasyAI Lab mascot family, simplified glyph
 * tuned for 20–48 px (big head over the amber moon, open book along the bottom edge).
 * Source of truth: docs/assets/brand/src/mascot/rabbit-book-small.svg
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
          <stop offset="0" stopColor="#ffd596" /><stop offset="0.45" stopColor="#f2b25a" />
          <stop offset="0.85" stopColor="#e79a3b" /><stop offset="1" stopColor="#cf7f25" />
        </radialGradient>
        {/* glossy cream body, key light from the upper left */}
        <radialGradient id={`${id}-body`} cx="0.30" cy="0.18" r="0.95">
          <stop offset="0" stopColor="#fffcf9" /><stop offset="0.38" stopColor="#f7f1ec" /><stop offset="0.62" stopColor="#e2d9d1" />
          <stop offset="0.86" stopColor="#bfb4aa" /><stop offset="1" stopColor="#958a80" />
        </radialGradient>
        <linearGradient id={`${id}-cover`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9893a" /><stop offset="1" stopColor="#a95f1f" />
        </linearGradient>
        <linearGradient id={`${id}-page`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf8" /><stop offset="1" stopColor="#efe4d4" />
        </linearGradient>
        <linearGradient id={`${id}-pageR`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6ede0" /><stop offset="1" stopColor="#e2d4c1" />
        </linearGradient>
        {/* soft warm shade on the upper-left edges + a thin warm highlight on the lower-right (the family "sculpt") */}
        <filter id={`${id}-sculpt`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="30" result="b1" />
          <feOffset in="b1" dx="-34" dy="-26" result="o1" />
          <feComposite in="SourceAlpha" in2="o1" operator="out" result="edge1" />
          <feFlood floodColor="#463d36" floodOpacity="0.55" />
          <feComposite in2="edge1" operator="in" result="shade" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b2" />
          <feOffset in="b2" dx="10" dy="12" result="o2" />
          <feComposite in="SourceAlpha" in2="o2" operator="out" result="edge2" />
          <feFlood floodColor="#ffe3bd" floodOpacity="0.9" />
          <feComposite in2="edge2" operator="in" result="shine" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="shade" /><feMergeNode in="shine" /></feMerge>
        </filter>
        {/* the book's soft shadow on the rabbit */}
        <filter id={`${id}-cast`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="22" /><feOffset dx="10" dy="6" />
          <feComponentTransfer><feFuncA type="linear" slope="0.7" /></feComponentTransfer>
        </filter>
      </defs>
      <path d={TILE} fill={ref('bg')} />
      <g clipPath={ref('clip')}>
        <circle cx="512" cy="300" r="230" fill={ref('moon')} />
        <g transform="translate(512 560) rotate(-3) scale(0.82) translate(-512 -600)">
          <g filter={ref('sculpt')} fill={ref('body')}>
            <path d="M350 560C300 440 290 260 330 168Q372 92 430 152C476 240 494 420 484 540Z" />
            <path d="M572 500C566 404 588 290 652 236C712 186 806 196 852 262C892 320 902 420 894 524Q888 578 854 574Q822 568 824 520C826 440 816 366 776 324C738 286 694 314 684 372C676 420 678 470 674 512Z" />
            <path d="M228 692C216 544 352 440 512 440C672 440 808 544 796 692C802 828 682 902 512 902C342 902 222 828 228 692Z" />
          </g>
          {/* pink inner ears (the right one curls over) */}
          <path d="M368 500C334 400 330 260 362 196Q384 160 406 200C436 270 446 400 440 500Z" fill="#e6bdb4" />
          <path d="M600 480C598 400 618 318 662 280C700 250 748 248 780 272C734 282 702 322 692 372C684 412 682 448 676 484Q638 496 600 480Z" fill="#e6bdb4" />
          {/* glossy eyes looking down at the page, and the nose */}
          <rect x="364" y="584" width="92" height="138" rx="46" fill="#120f0d" />
          <circle cx="425" cy="684" r="19" fill="#fff" />
          <rect x="568" y="584" width="92" height="138" rx="46" fill="#120f0d" />
          <circle cx="629" cy="684" r="19" fill="#fff" />
          <path d="M484 750Q512 736 540 750Q534 772 512 780Q490 772 484 750Z" fill="#b98580" />
        </g>
        <path d={BOOK} fill="#000" filter={ref('cast')} />
        <path d={BOOK} fill={ref('cover')} />
        <path d="M512 800C424 766 312 762 214 778L220 960L512 960Z" fill={ref('page')} />
        <path d="M512 800C600 766 712 762 810 778L804 960L512 960Z" fill={ref('pageR')} />
      </g>
    </svg>
  );
};

export default BrandMark;
