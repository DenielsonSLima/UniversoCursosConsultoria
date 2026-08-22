import { createClient } from "@supabase/supabase-js";
import { normalizeEmail } from "./auth-users.ts";
import type {
  TemporaryPasswordVerificationResult,
  TemporaryPasswordVerifier,
} from "./types.ts";

type EphemeralAuthClient = {
  auth: {
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<{
      data?: {
        session?: { access_token?: string | null } | null;
        user?: { id?: string | null; email?: string | null } | null;
      } | null;
      error?: unknown;
    }>;
    signOut: (options: { scope: "local" }) => Promise<{ error?: unknown }>;
  };
};

/**
 * Confirma a credencial no próprio GoTrue e encerra somente a sessão criada
 * para a prova. Token, sessão e senha nunca saem desta função.
 */
export const verifyTemporaryPasswordWithClient = async (
  client: EphemeralAuthClient,
  email: string,
  password: string,
  authUserId: string,
): Promise<TemporaryPasswordVerificationResult> => {
  let verified = false;
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    const sessionUserId = String(data?.user?.id || "").trim();
    verified = !error && Boolean(data?.session?.access_token) &&
      sessionUserId === authUserId &&
      normalizeEmail(data?.user?.email) === email;
  } catch {
    verified = false;
  }

  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    return { verified, sessionClosed: !error };
  } catch {
    return { verified, sessionClosed: false };
  }
};

export const createTemporaryPasswordVerifier = (
  supabaseUrl: string,
  publicApiKey: string,
): TemporaryPasswordVerifier =>
async (email, password, authUserId) => {
  const ephemeralClient = createClient(supabaseUrl, publicApiKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return verifyTemporaryPasswordWithClient(
    ephemeralClient,
    normalizeEmail(email),
    password,
    authUserId,
  );
};
