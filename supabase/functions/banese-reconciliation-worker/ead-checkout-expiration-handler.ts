import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  logWorkerSecretRead, readWorkerSecret, type WorkerSecretRuntime,
} from "../_shared/worker-secret-read.ts";
import { readRequestBody, safeEqual } from "./request-guards.ts";
import { json } from "./response.ts";
import { processOneBaneseEadCheckoutExpiration } from "./ead-checkout-expiration.ts";

type Runtime = WorkerSecretRuntime<typeof createClient> & {
  processExpiration?: typeof processOneBaneseEadCheckoutExpiration;
};

// Separate cron lane: canceled-title observation never consumes the normal
// reconciliation batch's pacing, OAuth cache or current-payment query budget.
export const handleBaneseEadCheckoutExpirationRequest = async (
  req: Request,
  dependencies: Runtime = {},
): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const getEnv = dependencies.getEnv ?? ((key: string) => Deno.env.get(key));
  const url = getEnv("SUPABASE_URL"), key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Configuração indisponível." }, 503);
  const admin = (dependencies.createAdmin ?? createClient)(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const secret = await (dependencies.readSecret ?? readWorkerSecret)(
    admin, "get_banese_reconciliation_worker_secret", {
      minimumLength: 32,
      logger: (metadata) => logWorkerSecretRead("banese EAD expiration secret read", metadata),
    },
  );
  if (!secret.ok) return json({ error: "Configuração indisponível." }, 503);
  if (!safeEqual(String(req.headers.get("X-Banese-Worker-Token") ?? "").trim(), secret.secret)) {
    return json({ error: "Não autorizado." }, 401);
  }
  try {
    const body = await readRequestBody(req);
    if (body !== undefined && (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 0)) return json({ error: "Requisição inválida." }, 400);
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }
  try {
    const process = dependencies.processExpiration ?? processOneBaneseEadCheckoutExpiration;
    const action = await process(admin, { claimLane: "ACTION" });
    const result = action.handled ? action : await process(admin, { claimLane: "OBSERVE" });
    return json({
      success: !["RETRY", "REVIEW_REQUIRED", "PAID_REVIEW"].includes(result.result ?? "") &&
        !action.reviewRequired,
      skipped: !result.handled,
      eadCheckoutExpiration: result,
      ...(action.reviewRequired ? { actionReviewRequired: true } : {}),
    });
  } catch {
    // Bank errors can contain private response fields. Log only a static code.
    console.error("banese EAD expiration lane failed", { errorClass: "EAD_EXPIRATION_ERROR" });
    return json({ error: "Não foi possível concluir a expiração EAD segura." }, 503);
  }
};
