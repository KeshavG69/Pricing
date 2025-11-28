'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize auth on app mount ONCE
    // This will fetch user if valid cookies exist
    useAuthStore.getState().initializeAuth().catch(console.error);
  }, []); // Empty array = run only once on mount

  return <>{children}</>;
}
