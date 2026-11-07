import { supabase } from '../../../../lib/supabase';
import { withAuthDeadline } from '../../../login/auth-request';
import { createNfseAccessReader } from './nfse-access.contract';

// A sessão identifica a chave de cache. Somente a RPC autoriza pelo auth.uid().
export const getNfseAccess = createNfseAccessReader({
  async currentAuthUserId() {
    const { data, error } = await withAuthDeadline(() => supabase.auth.getSession());
    if (error) throw error;
    return data.session?.user.id || null;
  },
  async request(contextId, signal) {
    const { data, error } = await withAuthDeadline(
      requestSignal => supabase.rpc('get_nfse_access_secure', { p_context_id: contextId })
        .retry(false).abortSignal(requestSignal),
      { signal, timeoutMs: 8_000 },
    );
    if (error) throw error;
    return data;
  },
});
