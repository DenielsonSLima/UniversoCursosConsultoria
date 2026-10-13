import { createClient } from "npm:@supabase/supabase-js@2";
import { createAsaasApiContext } from "./request-context.ts";
import { handleAsaasConfigurationAction } from "./configuration.actions.ts";
import { handleAsaasEnrollmentAction } from "./enrollment.actions.ts";
import { handleAsaasCancellationAction } from "./cancellation.actions.ts";
import { handleAsaasSettlementAction } from "./settlement.actions.ts";
import { handleAsaasReceivableSyncAction } from "./receivable-sync.action.ts";
import { requireFinanceWriteAccess, requireGestorAtivo, requireGestorForPolo, requireGestorGlobal,
  requireOtherCreditsWriteAccess, requireReceivablesSettlementAccess } from "./authz.ts";
import { reconcileBaneseReceivable } from "../../gateways/api/banese.ts";
import { syncRouteAwareFutureInstallments } from "./route-aware-future-sync.ts";
import { resolveExistingAsaasEnvironmentForMany } from "./receivable-runtime.ts";
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json,
  normalizeEnvironment, UUID_RE } from "./shared.ts";
import { createOtherCreditServerSide, normalizeOtherCreditRequest } from "./other-credit.service.ts";

const GESTOR_ACTIONS = new Set([
  "get-config",
  "save-config",
  "save-notification-preferences",
  "sync-enrollment",
  "preflight-enrollment-charge",
  "test-connection",
  "ensure-webhook",
  "reconcile-online-payment",
  "create-other-credit",
  "sync-receivable",
  "cancel-receivable",
  "generate-official-carnet",
  "refresh-receivable-status",
  "manual-settlement",
  "reverse-manual-settlement",
  "create-course-link",
]);

const GLOBAL_CONFIG_ACTIONS = new Set([
  "save-config",
  "save-notification-preferences",
  "test-connection",
  "ensure-webhook",
  "create-course-link",
]);

const FINANCE_WRITE_ACTIONS = new Set([
  "reconcile-online-payment",
  "create-other-credit",
  "sync-enrollment",
  "sync-receivable",
  "refresh-receivable-status",
  "cancel-receivable",
  "generate-official-carnet",
  "reverse-manual-settlement",
]);

Deno.serve(async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);
  const respondJson = (body: unknown, status = 200) => json(body, status, req);

  if (isRateLimitExceeded(`asaas-api:${getClientIp(req)}`, 180, 60000)) {
    return new Response(
      JSON.stringify({
        error: "Muitas requisições em curto período. Aguarde alguns instantes.",
      }),
      {
        status: 429,
        headers: {
          ...corsHeadersForRequest,
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest });
  }
  if (req.method !== "POST") {
    return respondJson({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const gestor = GESTOR_ACTIONS.has(action)
      ? await requireGestorAtivo(req, admin)
      : null;
    if (gestor && GLOBAL_CONFIG_ACTIONS.has(action)) {
      requireGestorGlobal(gestor);
    }
    if (gestor && FINANCE_WRITE_ACTIONS.has(action)) {
      requireFinanceWriteAccess(gestor);
    }
    if (gestor && action === "manual-settlement") {
      requireReceivablesSettlementAccess(gestor);
    }
    if (gestor && action === "create-other-credit") {
      requireOtherCreditsWriteAccess(gestor);
    }

    const context = createAsaasApiContext(admin, body, gestor, supabaseUrl);
    const { getConfig, getRuntime, getRuntimeForMovement, getRuntimeForReceivableMovement,
      getGatewayRuntimeForReceivableMovement, syncReceivable, refreshReceivableStatus, online, carnet } = context;
    for (const handler of [handleAsaasConfigurationAction, handleAsaasEnrollmentAction,
      handleAsaasCancellationAction, handleAsaasSettlementAction, handleAsaasReceivableSyncAction]) {
      const response = await handler(action, context, respondJson);
      if (response) return response;
    }

    if (action === "create-other-credit") {
      const request = normalizeOtherCreditRequest(body);
      if (gestor) requireGestorForPolo(gestor, request.poloId);

      const config = await getConfig();
      const environment = normalizeEnvironment(config.environment);
      const result = await createOtherCreditServerSide({
        admin,
        environment,
        request,
        syncGateway: async (receivable) => {
          const receivableRuntime =
            await getGatewayRuntimeForReceivableMovement(
              receivable,
            );
          return syncReceivable(receivableRuntime, receivable.id);
        },
      });

      return respondJson({ success: true, ...result });
    }

    if (action === "reconcile-online-payment") {
      if (gestor && !gestor.isGlobal && !gestor.poloId) {
        throw new Error(
          "Usuário financeiro sem polo definido não pode reconciliar pagamento online.",
        );
      }
      const runtime = await getRuntimeForMovement();
      return respondJson(
        await online.reconcileOnlinePayment(runtime, body, {
          poloId: gestor && !gestor.isGlobal ? gestor.poloId : null,
        }),
      );
    }

    if (action === "generate-official-carnet") {
      const receivableIds: string[] = Array.isArray(body.receivableIds)
        ? body.receivableIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];
      const uniqueReceivableIds: string[] = [...new Set(receivableIds)];
      if (!uniqueReceivableIds.length) {
        throw new Error(
          "Selecione ao menos uma cobrança para gerar o carnê oficial.",
        );
      }
      if (uniqueReceivableIds.some((id) => !UUID_RE.test(id))) {
        throw new Error("A seleção do carnê possui cobrança inválida.");
      }
      const { data: selectedReceivables, error: selectedReceivablesError } =
        await admin
          .from("contas_receber")
          .select(
            "id, polo_id, asaas_payment_id, asaas_payment_link_id, asaas_status, gateway_provider, gateway_environment, gateway_payment_id, gateway_payment_link_id, gateway_boleto_nosso_numero, gateway_status",
          )
          .in("id", uniqueReceivableIds);
      if (selectedReceivablesError) throw selectedReceivablesError;
      if ((selectedReceivables || []).length !== uniqueReceivableIds.length) {
        throw new Error(
          "Uma ou mais cobranças selecionadas não foram encontradas.",
        );
      }
      if (gestor) {
        for (const row of selectedReceivables || []) {
          requireGestorForPolo(gestor, row.polo_id);
        }
      }
      const runtime = await getRuntime(
        resolveExistingAsaasEnvironmentForMany(selectedReceivables || []) ||
          undefined,
      );
      return respondJson(
        await carnet.generateOfficialCarnet(runtime, uniqueReceivableIds),
      );
    }

    if (action === "refresh-receivable-status") {
      const receivableId = String(body.receivableId || "").trim();
      if (!UUID_RE.test(receivableId)) {
        throw new Error("Cobrança inválida para atualização.");
      }
      const { data: receivable, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivableId)
        .single();
      if (error) throw error;
      if (gestor) {
        requireGestorForPolo(gestor, receivable.polo_id);
        if (receivable.outros_creditos_plano_id) requireOtherCreditsWriteAccess(gestor);
      }
      if (receivable.gateway_provider === "banese_card") {
        const reconciliation = await reconcileBaneseReceivable(
          admin,
          receivableId,
          {
            syncFutureInstallments: (matriculaId, environment) =>
              syncRouteAwareFutureInstallments(
                admin,
                matriculaId,
                environment,
              ),
          },
        );
        return respondJson({
          success: true,
          receivable: reconciliation.receivable,
        });
      }
      const runtime = await getRuntimeForReceivableMovement(receivable);
      const refreshed = await refreshReceivableStatus(runtime, receivable);
      return respondJson({ success: true, receivable: refreshed });
    }

    if (action === "create-course-link") {
      return respondJson(await online.createCourseLink(null as any, body));
    }

    return respondJson({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    console.error(error);
    return respondJson({
      error: error instanceof Error ? error.message : "Erro interno.",
    }, 400);
  }
});
