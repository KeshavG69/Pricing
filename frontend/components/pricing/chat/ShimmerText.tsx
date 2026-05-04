'use client';

import { memo } from 'react';

/**
 * Pure-CSS character wave shimmer. Visually equivalent to Kroolo's
 * ShimmeringText (which uses framer-motion) but without an extra dep.
 *
 * Each character animates opacity in a staggered loop so the eye sees a
 * left-to-right wave moving across the word.
 */
interface ShimmerTextProps {
  text: string;
  className?: string;
  /** Loop duration in seconds. Default 1.4s — matches Kroolo's "wave" feel. */
  duration?: number;
}

const ShimmerText = memo(({ text, className, duration = 1.4 }: ShimmerTextProps) => {
  const chars = [...text];
  const total = chars.length || 1;
  return (
    <>
      <style>{`
        @keyframes priceiq-shimmer-char {
          0%   { opacity: 1; }
          50%  { opacity: 0.25; }
          100% { opacity: 1; }
        }
      `}</style>
      <span className={className} aria-label={text}>
        {chars.map((c, i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              whiteSpace: 'pre',
              animation: `priceiq-shimmer-char ${duration}s ease-in-out infinite`,
              animationDelay: `${(i / total) * duration}s`,
            }}
          >
            {c}
          </span>
        ))}
      </span>
    </>
  );
});

ShimmerText.displayName = 'ShimmerText';

export default ShimmerText;
