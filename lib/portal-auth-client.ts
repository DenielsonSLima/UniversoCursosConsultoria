import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { withAuthDeadline } from '../modules/login/auth-request';

/** Endpoint público: não deve aguardar refresh de uma sessão anterior. */
export const createPortalAuthRequest = (url: string, publicKey: string) => (
  body: Record<string, unknown>,
  signal?: AbortSignal,
) => withAuthDeadline(async requestSignal => {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/portal-auth`, {
      method: 'POST',
      headers: {
        apikey: publicKey,
        ...(!publicKey.startsWith('sb_publishable_')
          ? { Authorization: `Bearer ${publicKey}` }
          : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: requestSignal,
      cache: 'no-store',
    });
    if (!response.ok) {
      return { data: null, error: new FunctionsHttpError(response) };
    }
    return { data: await response.json(), error: null };
  } catch (error) {
    if (requestSignal.aborted) throw requestSignal.reason;
    return { data: null, error: new FunctionsFetchError(error) };
  }
}, { signal });
