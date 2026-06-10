import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";

const UNREACHABLE_MSG =
  "Couldn't reach the sign-in service. Check your connection and reload the page.";

export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // If Supabase never responds, don't leave the admin on a spinner forever
    const timer = setTimeout(() => {
      if (cancelled) return;
      setSession((s) => {
        if (s !== undefined) return s;
        setAuthError(UNREACHABLE_MSG);
        return null;
      });
    }, 10_000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => { if (!cancelled) setSession(session ?? null); })
      .catch(() => {
        if (!cancelled) { setAuthError(UNREACHABLE_MSG); setSession(null); }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) { setAuthError(null); setSession(session ?? null); }
    });

    return () => { cancelled = true; clearTimeout(timer); subscription.unsubscribe(); };
  }, []);

  const signIn = (email) =>
    supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/admin" },
    }).then(({ error }) => { if (error) throw error; });

  const signOut = () => supabase.auth.signOut();

  return { session, loading: session === undefined, authError, signIn, signOut };
}
