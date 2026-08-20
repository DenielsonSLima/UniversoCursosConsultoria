import { buildCorsHeaders } from "../_shared/http.ts";
import {
  createDiarioArtifactHandler,
  type DiarioArtifactDependencies,
} from "./artifacts.ts";
import {
  createSupabaseDiarioArtifactDependencies,
  type DiarioArtifactRuntimeConfig,
} from "./supabase-adapter.ts";

const requiredSecret = (name: string) => {
  const value = String(Deno.env.get(name) || "").trim();
  if (!value) throw new Error(`A configuração ${name} não está disponível.`);
  return value;
};

// Origem pública canônica do verificador. Não é segredo e não deve variar por
// deploy, porque integra o manifesto/hash congelado dos documentos oficiais.
export const SIGNATURE_VALIDATION_ORIGIN = "https://universocc.com.br";

export const readDiarioArtifactRuntimeConfig =
  (): DiarioArtifactRuntimeConfig => {
    return {
      supabaseUrl: requiredSecret("SUPABASE_URL"),
      serviceRoleKey: requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
      validationOrigin: SIGNATURE_VALIDATION_ORIGIN,
      validationAllowedOrigins: [SIGNATURE_VALIDATION_ORIGIN],
    };
  };

let cachedDependencies: DiarioArtifactDependencies | null = null;

const unavailable = (request: Request) =>
  new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "O serviço de documentos está temporariamente indisponível.",
      },
    }),
    {
      status: 503,
      headers: {
        ...buildCorsHeaders(request),
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );

export const handleRequest = async (request: Request) => {
  try {
    cachedDependencies ??= createSupabaseDiarioArtifactDependencies(
      readDiarioArtifactRuntimeConfig(),
    );
    return await createDiarioArtifactHandler(cachedDependencies)(request);
  } catch {
    // Falha fechada: configuração, segredos e detalhes internos nunca são
    // registrados nem devolvidos ao chamador.
    return unavailable(request);
  }
};

if (import.meta.main) Deno.serve(handleRequest);
