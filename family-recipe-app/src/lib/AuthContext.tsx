import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { type User, type Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { syncUserData } from './sync';

// Guest mode is deliberately NOT a Supabase anonymous sign-in. An anonymous
// session still carries the `authenticated` role, which inherits every write
// policy the family has -- including meal_plan's `for all to authenticated
// using (true)` -- so a guest could edit or wipe the household's week.
//
// Staying signed out keeps the request on the `anon` role, which
// supabase-guest-access.sql gives SELECT policies and nothing else. Postgres
// RLS denies by default, so the database itself refuses every guest write.
// Read-only is structural rather than a promise the UI has to keep.
//
// The other half falls out for free: `user` stays null for a guest, so the
// ~30 `if (!user) return` guards already in the app double as the client-side
// half, and the existing signed-out prompts explain each gated feature.
//
// sessionStorage, not localStorage: a demo should end with the tab rather
// than leave a returning family member mysteriously stuck in read-only.
const GUEST_KEY = 'vault.guest';

// Storage access throws in some privacy modes; guest mode is not worth
// crashing the provider over, so every touch is guarded.
const readGuestFlag = (): boolean => {
  try {
    return sessionStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  // True once the is_admin check has resolved for the current user, so
  // consumers can tell "still checking" apart from "confirmed not admin".
  isAdminChecked: boolean;
  /** Browsing the shared vault read-only. Never true while signed in. */
  isGuest: boolean;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  isAdminChecked: false,
  isGuest: false,
  enterGuestMode: () => {},
  exitGuestMode: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminChecked, setIsAdminChecked] = useState(false);
  const [isGuest, setIsGuest] = useState(readGuestFlag);

  const enterGuestMode = useCallback(() => {
    try {
      sessionStorage.setItem(GUEST_KEY, '1');
    } catch {
      // Private mode: guest browsing still works, it just won't survive a reload.
    }
    setIsGuest(true);
  }, []);

  const exitGuestMode = useCallback(() => {
    try {
      sessionStorage.removeItem(GUEST_KEY);
    } catch {
      // Nothing was stored, so nothing to clear.
    }
    setIsGuest(false);
  }, []);

  useEffect(() => {
    const applySession = (session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        // A real account supersedes guest browsing -- otherwise signing in
        // from the guest tour would leave the read-only chrome up.
        try {
          sessionStorage.removeItem(GUEST_KEY);
        } catch {
          // Nothing was stored, so nothing to clear.
        }
        setIsGuest(false);

        syncUserData(session.user.id);
        setIsAdminChecked(false);
        supabase.rpc('is_admin').then(({ data, error }) => {
          setIsAdmin(!error && data === true);
          setIsAdminChecked(true);
        });
      } else {
        setIsAdmin(false);
        setIsAdminChecked(true);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, isAdmin, isAdminChecked, isGuest, enterGuestMode, exitGuestMode }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
