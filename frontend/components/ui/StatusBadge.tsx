import { formatStatus, getStatusBadgeClasses } from '@/lib/utils/permissions';

interface StatusBadgeProps {
  status: 'active' | 'removed' | 'suspended';
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border ${getStatusBadgeClasses(
        status
      )} ${sizeClasses}`}
    >
      {formatStatus(status)}
    </span>
  );
}
