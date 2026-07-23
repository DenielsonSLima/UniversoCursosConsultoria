import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  requireGestorAtivo,
  requireGlobalFinancialTabAccess,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";
import {
  generateRemittance,
  getCnabOverview,
  previewRemittance,
} from "./remittance-service.ts";
import {
  applyReturn,
  createSignedCnabDownload,
  getCnabFileDetails,
  loadCnabContext,
  previewReturn,
  retryReturnActivation,
  revalidateReturn,
} from "./return-service.ts";
import {
  assertCnabProductionConfirmation,
  normalizeUuidList,
  safeCnabError,
} from "./policy.ts";

const ALLOWED_ACTIONS = new Set([
  "overview",
  "preview-remittance",
  "generate-remittance",
  "preview-return",
  "get-file",
  "revalidate-return",
  "apply-return",
  "retry-activation",
  "download-file",
]);

const PRODUCTION_CONFIRMATION_ACTIONS = new Set([
  "generate-remittance",
  "revalidate-return",
  "apply-return",
  "retry-activation",
]);

const parseBody = async (req: Request) => {
  const text = await req.text();
  if (!text || text.length > 7_200_000) {
    throw new Error("Requisição CNAB vazia ou acima do limite permitido.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("Requisição CNAB inválida.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Requisição CNAB inválida.");
  }
  return body as Record<string, unknown>;
};

const secureJson = (
  body: unknown,
  status: number,
  req: Request,
) => {
  const response = json(body, status, req);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
};

const expectedErrorStatus = (message: string) => {
  if (/autentica|sess[aã]o inv[aá]lida/i.test(message)) return 401;
  if (/acesso|apenas gestor global|n[aã]o autorizado/i.test(message)) {
    return 403;
  }
  if (
    /inv[aá]lid|selecione|confirme|arquivo|retorno|remessa|cobran[cç]a|conv[eê]nio|EDI7|ambiente|pr[eé]via|Nosso N[uú]mero|pagador|benefici[aá]r|t[ií]tulo|NSA|API|CNAB|faixa|snapshot|transa[cç][aã]o|ag[eê]ncia|conta/i
      .test(message)
  ) return 400;
  return 500;
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, { methods: "POST, OPTIONS" });
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return secureJson({ error: "Método não permitido." }, 405, req);
  }
  if (
    isRateLimitExceeded(
      `banese-cnab240-api:${getClientIp(req)}`,
      60,
      60_000,
    )
  ) {
    return secureJson(
      { error: "Muitas requisições. Aguarde alguns instantes." },
      429,
      req,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return secureJson({ error: "Configuração indisponível." }, 500, req);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await parseBody(req);
    const action = String(body.action || "").trim();
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new Error("Ação CNAB inválida.");
    }
    const gestor = await requireGestorAtivo(req, admin);
    // A primeira versão opera um convênio empresarial único. Até existir
    // escopo por polo dentro dos arquivos, toda ação permanece global.
    requireGlobalFinancialTabAccess(gestor, "conciliacao-bancaria");

    if (PRODUCTION_CONFIRMATION_ACTIONS.has(action)) {
      const context = await loadCnabContext(admin, body.environment);
      assertCnabProductionConfirmation(
        context.environment,
        body.confirmProduction,
      );
    }

    let result: unknown;
    if (action === "overview") {
      result = await getCnabOverview(admin, body.environment);
    } else if (action === "preview-remittance") {
      result = await previewRemittance(admin, body);
    } else if (action === "generate-remittance") {
      result = await generateRemittance(admin, gestor, body);
    } else if (action === "preview-return") {
      result = await previewReturn(admin, gestor, body);
    } else {
      const fileId = normalizeUuidList([body.fileId], 1)[0];
      if (action === "apply-return") {
        result = await applyReturn(admin, gestor, fileId, body.environment);
      } else if (action === "get-file") {
        result = await getCnabFileDetails(admin, fileId, body.environment);
      } else if (action === "revalidate-return") {
        result = await revalidateReturn(
          admin,
          gestor,
          fileId,
          body.environment,
        );
      } else if (action === "retry-activation") {
        result = await retryReturnActivation(
          admin,
          gestor,
          fileId,
          body.environment,
        );
      } else {
        result = await createSignedCnabDownload(
          admin,
          gestor,
          fileId,
          body.environment,
        );
      }
    }
    return secureJson({ success: true, data: result }, 200, req);
  } catch (error) {
    const message = safeCnabError(error);
    const status = expectedErrorStatus(message);
    if (status >= 500) {
      console.error("banese-cnab240-api failed", { message });
    }
    return secureJson(
      {
        error: status >= 500
          ? "Não foi possível concluir a operação CNAB240."
          : message,
      },
      status,
      req,
    );
  }
});
