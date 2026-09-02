import { createClient } from "npm:@supabase/supabase-js@2";
import { safeEqual } from "../banese-reconciliation-worker/request-guards.ts";
import {
  errorMessage,
  IssuanceHttpError,
  type ManualCycleIssuanceRequest,
} from "../technical-manual-cycle-issuance/contract.ts";
import { createManualCycleIssuanceDependencies } from "../technical-manual-cycle-issuance/dependencies.ts";
import { runManualCycleIssuance } from "../technical-manual-cycle-issuance/orchestrator.ts";
import {
  InternalCycleRecoveryRequestError,
  parseInternalCycleRecoveryRequest,
} from "./contract.ts";
import { recoverReviewedCycleItems } from "./review-recovery.ts";

const MAX_BODY_BYTES = 1_024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const readBody = async (request: Request) => {
  const text = await request.text();
  if (!text || text.length > MAX_BODY_BYTES) {
    throw new InternalCycleRecoveryRequestError("Corpo interno inválido.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InternalCycleRecoveryRequestError("JSON interno inválido.");
  }
};

const resumeRequest = (
  matriculaId: string,
  cicloNumero: number,
): ManualCycleIssuanceRequest => ({
  action: "resume",
  matriculaId,
  cicloNumero,
  primeiroVencimento: null,
  requestId: null,
  expectedRegraFingerprint: null,
  expectedPoliticaFingerprint: null,
  expectedCronogramaFingerprint: null,
});

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Configuração indisponível." }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: configuredSecret, error: secretError } = await admin.rpc(
    "get_banese_reconciliation_worker_secret",
  );
  if (
    secretError || typeof configuredSecret !== "string" ||
    configuredSecret.length < 32
  ) {
    console.error("technical cycle recovery secret unavailable");
    return json({ error: "Configuração indisponível." }, 500);
  }
  const requestSecret = String(
    request.headers.get("X-Banese-Worker-Token") || "",
  ).trim();
  if (!safeEqual(requestSecret, configuredSecret)) {
    return json({ error: "Não autorizado." }, 401);
  }

  try {
    const internal = parseInternalCycleRecoveryRequest(await readBody(request));
    const reviewedRecovered = await recoverReviewedCycleItems(admin, internal);
    const result = await runManualCycleIssuance(
      resumeRequest(internal.matriculaId, internal.cicloNumero),
      createManualCycleIssuanceDependencies({
        admin,
        userClient: admin,
        supabaseUrl,
        internalRecovery: {
          expectedMatriculaId: internal.matriculaId,
          expectedCycleNumber: internal.cicloNumero,
          expectedCycleRequestId: internal.expectedCycleRequestId,
          expectedItemCount: internal.expectedItemCount,
        },
      }),
    );
    console.info("technical manual cycle internal recovery completed", {
      matriculaId: internal.matriculaId,
      cycleNumber: internal.cicloNumero,
      requestId: result.requestId,
      issued: result.ciclo.emitidosBanese,
      pending: result.ciclo.pendentesEmissao,
      review: result.ciclo.emRevisao,
    });
    return json({
      success: result.ciclo.status === "EMITIDO_BANESE" &&
        result.ciclo.emitidosBanese === internal.expectedItemCount &&
        result.ciclo.pendentesEmissao === 0 && result.ciclo.emRevisao === 0,
      replayed: result.replayed,
      reviewedRecovered,
      requestId: result.requestId,
      ciclo: {
        numero: result.ciclo.numero,
        status: result.ciclo.status,
        quantidadeItens: result.ciclo.quantidadeItens,
        emitidosBanese: result.ciclo.emitidosBanese,
        pendentesEmissao: result.ciclo.pendentesEmissao,
        emRevisao: result.ciclo.emRevisao,
      },
    });
  } catch (error) {
    if (error instanceof InternalCycleRecoveryRequestError) {
      return json({ error: error.message, code: "INVALID_REQUEST" }, 400);
    }
    if (error instanceof IssuanceHttpError) {
      console.warn("technical manual cycle internal recovery stopped", {
        code: error.code,
        progress: error.progress,
      });
      return json(
        {
          error: error.message,
          code: error.code,
          ...(error.progress ? { progress: error.progress } : {}),
        },
        error.status,
      );
    }
    console.error("technical manual cycle internal recovery failed", {
      message: errorMessage(error),
    });
    return json({ error: "A recuperação interna não foi concluída." }, 500);
  }
});
