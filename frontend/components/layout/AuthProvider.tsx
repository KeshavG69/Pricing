'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    // Initialize auth on app mount
    // This will fetch user if valid cookies exist
    initializeAuth().catch(console.error);
  }, [initializeAuth]);

  return <>{children}</>;
}
