'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api-client';

const ADMIN_ROLE = 3202;

const AuthContext = createContext({ user: null, loading: true, setUser: () => {}, logOut: () => {} });

// Session identity comes from the httpOnly cookie; /api/auth/me resolves it and
// slides the expiry while the app is in use.
export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet('/api/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logOut = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout', {});
    } catch {
      // The cookie is gone either way; leaving the session locally is enough.
    }
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function isAdmin(user) {
  return user?.role === ADMIN_ROLE;
}

// The site names this user can work with; admins resolve 'all' from /api/sites.
export function assignedSiteNames(user) {
  if (!user?.assignedSite || user.assignedSite === 'all') return null;
  return user.assignedSite.split(',').filter(Boolean);
}
