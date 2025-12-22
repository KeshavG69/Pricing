import { User, TeamMember, Proposal } from '@/types';

/**
 * Check if user is an admin
 */
export const isAdmin = (user: User | null): boolean => {
  return user?.role === 'admin';
};

/**
 * Check if user can manage team (invite, remove members)
 */
export const canManageTeam = (user: User | null): boolean => {
  return isAdmin(user);
};

/**
 * Check if user can share proposals
 */
export const canShareProposals = (user: User | null): boolean => {
  return isAdmin(user);
};

/**
 * Check if user can manage organization settings
 */
export const canManageSettings = (user: User | null): boolean => {
  return isAdmin(user);
};

/**
 * Check if current user can remove a specific team member
 * - Must be admin
 * - Cannot remove yourself
 * - Cannot remove organization owner (owner_id check would need org data)
 */
export const canRemoveUser = (
  currentUser: User | null,
  targetUser: TeamMember,
  organizationOwnerId?: string
): boolean => {
  if (!currentUser || currentUser.role !== 'admin') {
    return false;
  }

  // Cannot remove yourself
  if (targetUser.id === currentUser.id) {
    return false;
  }

  // Cannot remove organization owner
  if (organizationOwnerId && targetUser.id === organizationOwnerId) {
    return false;
  }

  return true;
};

/**
 * Check if user can edit a proposal
 * - Admins can edit all proposals in their org
 * - Users can edit their own proposals
 */
export const canEditProposal = (
  user: User | null,
  proposal: Proposal
): boolean => {
  if (!user) return false;

  // Different organization
  if (proposal.organization_id !== user.organization_id) {
    return false;
  }

  // Admin can edit all
  if (user.role === 'admin') {
    return true;
  }

  // User can edit their own
  return proposal.user_id === user.id;
};

/**
 * Check if user can delete a proposal
 * Same rules as editing
 */
export const canDeleteProposal = (
  user: User | null,
  proposal: Proposal
): boolean => {
  return canEditProposal(user, proposal);
};

/**
 * Check if user can view a proposal
 * - Admins can view all proposals in their org
 * - Users can view their own proposals
 * - Users can view proposals shared with them
 */
export const canViewProposal = (
  user: User | null,
  proposal: Proposal
): boolean => {
  if (!user) return false;

  // Different organization
  if (proposal.organization_id !== user.organization_id) {
    return false;
  }

  // Admin can view all
  if (user.role === 'admin') {
    return true;
  }

  // User can view their own
  if (proposal.user_id === user.id) {
    return true;
  }

  // User can view if shared with them
  if (proposal.shared_with && proposal.shared_with.includes(user.id)) {
    return true;
  }

  return false;
};

/**
 * Get user's display name
 */
export const getUserDisplayName = (user: User | TeamMember): string => {
  return `${user.firstName} ${user.lastName}`;
};

/**
 * Get user's initials for avatar
 */
export const getUserInitials = (user: User | TeamMember): string => {
  return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
};

/**
 * Format role for display
 */
export const formatRole = (role: 'admin' | 'user'): string => {
  return role === 'admin' ? 'Admin' : 'User';
};

/**
 * Format status for display
 */
export const formatStatus = (
  status: 'active' | 'removed' | 'suspended'
): string => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'removed':
      return 'Removed';
    case 'suspended':
      return 'Suspended';
    default:
      return status;
  }
};

/**
 * Get role badge color classes
 */
export const getRoleBadgeClasses = (role: 'admin' | 'user'): string => {
  return role === 'admin'
    ? 'bg-purple-100 text-purple-800 border-purple-200'
    : 'bg-blue-100 text-blue-800 border-blue-200';
};

/**
 * Get status badge color classes
 */
export const getStatusBadgeClasses = (
  status: 'active' | 'removed' | 'suspended'
): string => {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'removed':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'suspended':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};
