import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authorizationErrorHttpStatus,
  bearerTokenFromRequest,
  requireFinanceWriteAccess,
  requireGestorAtivo,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";
import {
  errorMessage,
  IssuanceHttpError,
  parseIssuanceRequest,
} from "./contract.ts";
import { createManualCycleIssuanceDependencies } from "./dependencies.ts";
import { runManualCycleIssuance } from "./orchestrator.ts";

const MAX_BODY_BYTES = 8_192;

const secureJson = (
  body: unknown,
  status: number,
  request: Request,
) => {
  const response = json(body, status, request);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
};

const readBody = async (request: Request) => {
  const text = await request.text();
  if (!text || text.length > MAX_BODY_BYTES) {
    throw new IssuanceHttpError(400, "Requisição inválida.", "INVALID_REQUEST");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new IssuanceHttpError(400, "JSON inválido.", "INVALID_REQUEST");
  }
};

Deno.serve(async (request: Request) => {
  const cors = buildCorsHeaders(request, { methods: "POST, OPTIONS" });
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }
  if (request.method !== "POST") {
    return secureJson({ error: "Método não permitido." }, 405, request);
  }
  if (
    isRateLimitExceeded(
      `technical-manual-cycle-issuance:${getClientIp(request)}`,
      20,
      60_000,
    )
  ) {
    return secureJson(
      { error: "Muitas tentativas. Aguarde alguns instantes." },
      429,
      request,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const token = bearerTokenFromRequest(request);
    if (!supabaseUrl || !serviceRoleKey || !anonKey || !token) {
      throw new Error("Configuração segura da emissão indisponível.");
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const gestor = await requireGestorAtivo(request, admin);
    requireFinanceWriteAccess(gestor);
    const issuanceRequest = parseIssuanceRequest(await readBody(request));
    const result = await runManualCycleIssuance(
      issuanceRequest,
      createManualCycleIssuanceDependencies({
        admin,
        userClient,
        gestor,
        supabaseUrl,
      }),
    );
    console.info("technical manual cycle BolePix issuance completed", {
      matriculaId: issuanceRequest.matriculaId,
      cycleNumber: issuanceRequest.cicloNumero,
      requestId: result.requestId,
      replayed: result.replayed,
      issued: result.ciclo.emitidosBanese,
    });
    return secureJson(result, 200, request);
  } catch (error) {
    if (error instanceof IssuanceHttpError) {
      console.warn("technical manual cycle BolePix issuance stopped", {
        code: error.code,
        progress: error.progress,
      });
      return secureJson(
        {
          error: error.message,
          code: error.code,
          ...(error.progress ? { progress: error.progress } : {}),
        },
        error.status,
        request,
      );
    }
    const authorizationStatus = authorizationErrorHttpStatus(
      errorMessage(error),
    );
    if (authorizationStatus) {
      return secureJson(
        {
          error: authorizationStatus === 401
            ? "Autenticação obrigatória ou sessão inválida."
            : "Usuário sem acesso para gerar e emitir este ciclo.",
        },
        authorizationStatus,
        request,
      );
    }
    console.error("technical manual cycle BolePix issuance failed", {
      message: errorMessage(error),
    });
    return secureJson(
      { error: "Não foi possível iniciar a emissão BolePix do ciclo." },
      500,
      request,
    );
  }
});
