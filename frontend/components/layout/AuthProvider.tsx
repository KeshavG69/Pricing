'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);

  useEffect(() => {
    // Only run once, even in React strict mode
    if (initialized.current) return;
    initialized.current = true;

    // Initialize auth with timeout protection
    const initAuth = async () => {
      try {
        await Promise.race([
          useAuthStore.getState().initializeAuth(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auth timeout')), 5000)
          )
        ]);
      } catch (error) {
        console.error('Auth initialization failed:', error);
        // Silent fail - don't crash the app
      }
    };

    initAuth();
  }, []);

  return <>{children}</>;
}
