import {
  createReauthenticationHandler,
  type ReauthenticationDependencies,
} from "./reauthentication.ts";
import {
  createSupabaseReauthenticationDependencies,
  type SupabaseRuntimeConfig,
} from "./supabase-adapter.ts";

export const readRuntimeConfig = (): SupabaseRuntimeConfig => ({
  supabaseUrl: String(Deno.env.get("SUPABASE_URL") || "").trim(),
  serviceRoleKey: String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  ).trim(),
  publicApiKey: String(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") || "",
  ).trim(),
});

let cachedDependencies: ReauthenticationDependencies | null = null;

const dependencies = (): ReauthenticationDependencies => {
  if (!cachedDependencies) {
    cachedDependencies = createSupabaseReauthenticationDependencies(
      readRuntimeConfig(),
    );
  }
  return cachedDependencies;
};

// A criação é tardia para que requisições sem bearer falhem como 401 e para
// que testes de contrato possam importar o módulo sem depender de secrets.
const runtimeDependencies: ReauthenticationDependencies = {
  authenticate: (bearer) => dependencies().authenticate(bearer),
  prepareReauthentication: (input) =>
    dependencies().prepareReauthentication(input),
  verifyPassword: (email, password) =>
    dependencies().verifyPassword(email, password),
  revokeSecondarySession: (accessToken) =>
    dependencies().revokeSecondarySession(accessToken),
  registerReauthentication: (input) =>
    dependencies().registerReauthentication(input),
  confirmSignature: (input) => dependencies().confirmSignature(input),
};

export const handleRequest = createReauthenticationHandler(
  runtimeDependencies,
);

if (import.meta.main) Deno.serve(handleRequest);
