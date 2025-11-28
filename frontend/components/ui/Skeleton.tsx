import React from 'react';

export interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className = '' }: SkeletonProps) => {
  return (
    <div
      className={`animate-pulse bg-muted rounded ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
};

export default Skeleton;
