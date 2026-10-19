'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api-client';
import { invalidate } from '@/lib/data-cache';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { forgetAccount, offlineCounts, rememberedUser, setAccount, wipeAccount } from '@/lib/offline';

const ADMIN_ROLE = 3202;

// Why the login screen is showing, when it is not the person's own doing. Read
// once by the login screen.
const LOGIN_NOTICE_KEY = 'ifc.loginNotice';

function leaveLoginNotice(text) {
  try {
    sessionStorage.setItem(LOGIN_NOTICE_KEY, text);
  } catch {
    // The login screen opens without the explanation.
  }
}

export function takeLoginNotice() {
  try {
    const text = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    return text || '';
  } catch {
    return '';
  }
}

// On one bar of signal the check of who is signed in can hang; past this the
// app opens with what the phone kept, as it does with no signal at all.
const ME_TIMEOUT_MS = 8000;

const AuthContext = createContext({ user: null, loading: true, setUser: () => {}, logOut: () => {} });

// Session identity comes from the httpOnly cookie; /api/auth/me resolves it and
// slides the expiry while the app is in use.
//
// Without signal (STOIC-2771) the server cannot answer, and a site user's
// phone opens as the account it last confirmed: the same as a session left
// open, which is what it is. When the signal comes back the server is asked
// again, and decides.
export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  // Counts taken without signal and not sent yet, when signing out was asked.
  const [unsentOnLogOut, setUnsentOnLogOut] = useState(0);

  const setUser = useCallback((next) => {
    setAccount(next);
    setUserState(next);
  }, []);

  const resolve = useCallback(
    () =>
      apiGet('/api/auth/me', { timeoutMs: ME_TIMEOUT_MS })
        .then((res) => setUser(res?.data ?? null))
        .catch((err) => {
          const remembered = rememberedUser();
          if (err.status !== 401 && err.status !== 403) {
            // No connection, or the server failing for a moment: keep whoever
            // is on screen, or open as the remembered account. Only the server
            // saying so ends a session.
            if (remembered) setUser(remembered);
            return;
          }
          if (err.status === 403) {
            // Deactivated: what the phone kept for the account goes with it.
            wipeAccount(remembered?.id);
            leaveLoginNotice('This account is no longer active. Contact your administrator.');
          } else if (remembered) {
            // Ended while the phone was offline, or simply ran out. What the
            // account kept stays under its id and is back after signing in.
            forgetAccount();
            leaveLoginNotice('Your session ended. Sign in again to keep going.');
          }
          invalidate();
          setUserState(null);
        }),
    [setUser]
  );

  useEffect(() => {
    let cancelled = false;
    resolve().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [resolve]);

  // The signal is back: the server confirms the session (and restarts a site
  // user's 14 days), or ends it.
  useEffect(() => {
    const onOnline = () => resolve();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [resolve]);

  const signOut = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout', {});
    } catch {
      // The cookie is gone either way; leaving the session locally is enough.
    }
    // The cached site list and calendar are this account's. Without this, the
    // next person to sign in on the same tab saw them for up to a minute - an
    // administrator landing on a dashboard with only the previous user's site.
    invalidate();
    forgetAccount();
    setUserState(null);
    router.push('/login');
  }, [router]);

  // Signing out does not lose a count taken without signal, but it does take it
  // out of sight until the same account signs in again, so it is said first.
  const logOut = useCallback(() => {
    const unsent = offlineCounts().length;
    if (unsent) setUnsentOnLogOut(unsent);
    else signOut();
  }, [signOut]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logOut }}>
      {children}
      <ConfirmDialog
        open={unsentOnLogOut > 0}
        onOpenChange={(open) => !open && setUnsentOnLogOut(0)}
        title={unsentOnLogOut === 1 ? 'You have a count that was not sent' : `You have ${unsentOnLogOut} counts that were not sent`}
        description={`${unsentOnLogOut === 1 ? 'It was' : 'They were'} taken without a connection.`}
        consequences={[
          `${unsentOnLogOut === 1 ? 'It stays' : 'They stay'} on this phone for 7 days and ${unsentOnLogOut === 1 ? 'comes' : 'come'} back when you sign in again.`,
          `Nobody else who signs in on this phone sees ${unsentOnLogOut === 1 ? 'it' : 'them'}.`,
        ]}
        confirmLabel="Log out"
        tone="warning"
        onConfirm={signOut}
      />
    </AuthContext.Provider>
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
