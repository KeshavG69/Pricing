'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // TEMPORARILY DISABLED: Auth initialization causing death spiral on Railway
    // Will re-enable with better error handling once deployment is stable
    // useAuthStore.getState().initializeAuth().catch(console.error);
  }, []);

  return <>{children}</>;
}
