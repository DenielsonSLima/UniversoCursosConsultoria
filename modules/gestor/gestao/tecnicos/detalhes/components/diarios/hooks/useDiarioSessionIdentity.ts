import { useEffect, useState } from 'react';
import { supabase } from '../../../../../../../../lib/supabase';

// This identity scopes client cache only. The RPC remains the authority for access.
export const useDiarioSessionIdentity = () => {
  const [identity, setIdentity] = useState<{ actorId: string | null; ready: boolean }>({
    actorId: null, ready: false,
  });
  useEffect(() => {
    let alive = true;
    let receivedAuthEvent = false;
    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      receivedAuthEvent = true;
      setIdentity({ actorId: session?.user.id || null, ready: true });
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || receivedAuthEvent) return;
      setIdentity({ actorId: error ? null : data.session?.user.id || null, ready: true });
    }).catch(() => {
      if (alive && !receivedAuthEvent) setIdentity({ actorId: null, ready: true });
    });
    return () => { alive = false; subscription.data.subscription.unsubscribe(); };
  }, []);
  return identity;
};
