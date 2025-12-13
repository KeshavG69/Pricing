import { formatRole, getRoleBadgeClasses } from '@/lib/utils/permissions';

interface RoleBadgeProps {
  role: 'admin' | 'user';
  size?: 'sm' | 'md';
}

export default function RoleBadge({ role, size = 'sm' }: RoleBadgeProps) {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border ${getRoleBadgeClasses(
        role
      )} ${sizeClasses}`}
    >
      {formatRole(role)}
    </span>
  );
}
