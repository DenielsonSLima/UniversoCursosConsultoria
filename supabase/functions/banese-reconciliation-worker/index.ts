import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import { syncRouteAwareFutureInstallments } from "../asaas/api/route-aware-future-sync.ts";
import { requireGatewayEnvironment } from "../gateways/api/environment.ts";

const MAX_BATCH_SIZE = 10;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const safeEqual = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
};

const readBatchSize = async (req: Request) => {
  const text = await req.text();
  if (!text) return MAX_BATCH_SIZE;
  if (text.length > 1_024) throw new Error("Corpo da requisição inválido.");
  const body = JSON.parse(text) as Record<string, unknown>;
  const parsed = Number(body.batchSize ?? MAX_BATCH_SIZE);
  return Number.isInteger(parsed)
    ? Math.max(1, Math.min(MAX_BATCH_SIZE, parsed))
    : MAX_BATCH_SIZE;
};

const safeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 500);
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("banese reconciliation worker missing Supabase environment");
    return json({ error: "Configuração indisponível." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: configuredSecret, error: secretError } = await admin.rpc(
    "get_banese_reconciliation_worker_secret",
  );
  const requestSecret = String(
    req.headers.get("X-Banese-Worker-Token") ?? "",
  ).trim();
  const expectedSecret = String(configuredSecret ?? "").trim();
  if (
    secretError || expectedSecret.length < 32 ||
    !safeEqual(requestSecret, expectedSecret)
  ) {
    return json({ error: "Não autorizado." }, 401);
  }

  let batchSize: number;
  try {
    batchSize = await readBatchSize(req);
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }

  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_banese_reconciliation_batch",
    { p_limit: batchSize },
  );
  if (claimError) {
    console.error("banese reconciliation claim failed", {
      message: safeError(claimError),
    });
    return json({ error: "Não foi possível iniciar a conciliação." }, 500);
  }

  const ids = (Array.isArray(claimed) ? claimed : [])
    .map((item) => String(item?.receivable_id ?? item?.id ?? ""))
    .filter(Boolean);
  let reconciled = 0;
  let paid = 0;
  let failed = 0;

  for (const receivableId of ids) {
    try {
      const result = await reconcileBaneseReceivable(admin, receivableId, {
        syncFutureInstallments: (matriculaId, environment) =>
          syncRouteAwareFutureInstallments(
            admin,
            matriculaId,
            environment,
          ),
      });
      reconciled += 1;
      if (result.paid) paid += 1;
    } catch (error) {
      failed += 1;
      const message = safeError(error);
      console.error("banese reconciliation item failed", {
        receivableId,
        message,
      });
      await admin
        .from("contas_receber")
        .update({
          gateway_last_error: message,
          gateway_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivableId)
        .eq("gateway_provider", "banese_card");
    }
  }

  const { data: futureSyncQueue, error: futureSyncQueueError } = await admin
    .from("contas_receber")
    .select("id, matricula_id, gateway_environment")
    .eq("status", "PAGO")
    .eq("gateway_provider", "banese_card")
    .eq("tipo_lancamento", "MATRICULA")
    .like(
      "gateway_last_error",
      "Pagamento Banese conciliado; parcelas futuras pendentes:%",
    )
    .order("updated_at", { ascending: true })
    .limit(MAX_BATCH_SIZE);
  if (futureSyncQueueError) {
    console.error("banese future installment retry query failed", {
      message: safeError(futureSyncQueueError),
    });
  }

  let futureRetried = 0;
  let futureRecovered = 0;
  for (const item of futureSyncQueue || []) {
    if (!item.matricula_id) continue;
    futureRetried += 1;
    try {
      await syncRouteAwareFutureInstallments(
        admin,
        item.matricula_id,
        requireGatewayEnvironment(
          item.gateway_environment,
          "recebivel Banese da fila de parcelas futuras",
        ),
      );
      const { error: clearError } = await admin
        .from("contas_receber")
        .update({
          gateway_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("status", "PAGO")
        .eq("gateway_provider", "banese_card")
        .like(
          "gateway_last_error",
          "Pagamento Banese conciliado; parcelas futuras pendentes:%",
        );
      if (clearError) throw clearError;
      futureRecovered += 1;
    } catch (error) {
      const message = safeError(error);
      console.error("banese future installment retry failed", {
        receivableId: item.id,
        message,
      });
      await admin
        .from("contas_receber")
        .update({
          gateway_last_error:
            `Pagamento Banese conciliado; parcelas futuras pendentes: ${message}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("status", "PAGO")
        .eq("gateway_provider", "banese_card");
    }
  }

  return json({
    success: true,
    claimed: ids.length,
    reconciled,
    paid,
    failed,
    futureRetried,
    futureRecovered,
  });
});
