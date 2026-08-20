import { type ArchiveDependencies, createArchiveHandler } from "./acervo.ts";
import {
  type ArchiveRuntimeConfig,
  createSupabaseArchiveDependencies,
} from "./supabase-adapter.ts";

export const readRuntimeConfig = (): ArchiveRuntimeConfig => ({
  supabaseUrl: String(Deno.env.get("SUPABASE_URL") || "").trim(),
  serviceRoleKey: String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  ).trim(),
});

let cachedDependencies: ArchiveDependencies | null = null;

const dependencies = (): ArchiveDependencies => {
  if (!cachedDependencies) {
    cachedDependencies = createSupabaseArchiveDependencies(
      readRuntimeConfig(),
    );
  }
  return cachedDependencies;
};

// Inicialização tardia preserva respostas 401 sem exigir secrets no import e
// mantém o service_role restrito à RPC atômica interna e ao Storage.
const runtimeDependencies: ArchiveDependencies = {
  authenticate: (bearer) => dependencies().authenticate(bearer),
  resolveAuthorizedArtifact: (identity, input) =>
    dependencies().resolveAuthorizedArtifact(identity, input),
  createSignedDownload: (input) => dependencies().createSignedDownload(input),
};

export const handleRequest = createArchiveHandler(runtimeDependencies);

if (import.meta.main) Deno.serve(handleRequest);
