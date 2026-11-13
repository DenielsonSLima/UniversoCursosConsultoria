import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { readWorkerSecret, type WorkerSecretRuntime } from "../_shared/worker-secret-read.ts";
import { readRequestBody, safeEqual } from "../banese-reconciliation-worker/request-guards.ts";
import { processNextServiceBankJob } from "./dispatcher.ts";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
type Runtime = WorkerSecretRuntime<typeof createClient> & { process?: typeof processNextServiceBankJob };
export async function handleServiceBolepixRequest(req: Request, dependencies: Runtime = {}) {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const env = dependencies.getEnv ?? (key => Deno.env.get(key));
  const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Configuração indisponível." }, 503);
  const admin = (dependencies.createAdmin ?? createClient)(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const secret = await (dependencies.readSecret ?? readWorkerSecret)(admin, "get_banese_reconciliation_worker_secret", { minimumLength: 32 });
  if (!secret.ok) return json({ error: "Configuração indisponível." }, 503);
  if (!safeEqual(String(req.headers.get("X-Banese-Worker-Token") || "").trim(), secret.secret)) return json({ error: "Não autorizado." }, 401);
  try {
    const body = await readRequestBody(req);
    if (body !== undefined && (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)) {
      return json({ error: "Requisição inválida." }, 400);
    }
  } catch { return json({ error: "Requisição inválida." }, 400); }
  try { return json({ success: true, ...(await (dependencies.process ?? processNextServiceBankJob)(admin, url)) }); }
  catch { return json({ error: "Não foi possível concluir o processamento seguro do boleto." }, 503); }
}
