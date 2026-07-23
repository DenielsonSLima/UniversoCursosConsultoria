import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json as sendJson,
} from "../../_shared/http.ts";
import {
  applyReceivableSnapshotFields,
  applyRemoteIdentitySnapshot,
  assertAsaasReceivableCancellationAllowed,
} from "../../gateways/checkout/remote-title-guard.ts";
import {
  requireFinanceWriteAccess,
  requireGestorAtivo,
  requireGestorForPolo,
} from "../api/authz.ts";
import { resolveExistingAsaasEnvironment } from "../api/receivable-runtime.ts";

type Environment = "sandbox" | "production";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200, req?: Request) =>
  sendJson(body, status, req);

Deno.serve(async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);

  if (isRateLimitExceeded(`asaas-cancel:${getClientIp(req)}`, 30, 60000)) {
    return json(
      {
        error:
          "Muitas tentativas em curto intervalo. Tente novamente em alguns segundos.",
      },
      429,
      req,
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest });
  }
  if (req.method !== "POST") {
    return json({ error: "Metodo nao permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const gestor = await requireGestorAtivo(req, admin);
    requireFinanceWriteAccess(gestor);

    const body = await req.json();
    const receivableId = String(body.receivableId || "").trim();
    if (!UUID_RE.test(receivableId)) {
      throw new Error("Cobranca invalida para cancelamento.");
    }

    const { data: receivable, error } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .single();
    if (error) throw error;
    requireGestorForPolo(gestor, receivable.polo_id);
    assertAsaasReceivableCancellationAllowed(receivable);

    if (
      receivable.status === "PAGO" ||
      ["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)
    ) {
      throw new Error(
        "Cobrancas pagas/confirmadas nao podem ser canceladas por este fluxo.",
      );
    }

    const existingEnvironment = resolveExistingAsaasEnvironment(receivable);
    let environment: Environment;
    if (existingEnvironment) {
      environment = existingEnvironment;
    } else {
      const { data: config, error: configError } = await admin
        .from("asaas_config")
        .select("environment")
        .maybeSingle();
      if (configError) throw configError;
      environment = config?.environment === "production"
        ? "production"
        : "sandbox";
    }
    const secretName = environment === "production"
      ? "asaas_production_api_key"
      : "asaas_sandbox_api_key";
    const baseUrl = environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";

    const { data: apiKey, error: secretError } = await admin.rpc(
      "asaas_get_secret",
      {
        p_secret_name: secretName,
      },
    );
    if (secretError) throw secretError;
    if (!apiKey) {
      throw new Error(
        `A chave do ambiente ${environment} ainda nao foi configurada.`,
      );
    }

    let asaasCanceled = false;
    let asaasDeleteStatus: number | null = null;
    let asaasPaymentLinkCanceled = false;
    let asaasPaymentLinkDeleteStatus: number | null = null;

    if (receivable.asaas_payment_id) {
      const response = await fetch(
        `${baseUrl}/payments/${receivable.asaas_payment_id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: String(apiKey),
          },
        },
      );
      asaasDeleteStatus = response.status;
      const payload = response.status === 204
        ? null
        : await response.json().catch(() => null);

      if (response.ok) {
        asaasCanceled = true;
      } else if (response.status === 404) {
        if (String(receivable.asaas_status || "").toUpperCase() !== "DELETED") {
          throw new Error(
            "Cobranca Asaas nao encontrada no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.",
          );
        }
      } else {
        const message = payload?.errors?.map((item: any) =>
          item.description
        ).join(" ") ||
          payload?.message ||
          `Erro ${response.status} ao cancelar cobranca no Asaas.`;
        throw new Error(message);
      }
    }

    if (receivable.asaas_payment_link_id) {
      const response = await fetch(
        `${baseUrl}/paymentLinks/${receivable.asaas_payment_link_id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: String(apiKey),
          },
        },
      );
      asaasPaymentLinkDeleteStatus = response.status;
      const payload = response.status === 204
        ? null
        : await response.json().catch(() => null);

      if (response.ok) {
        asaasPaymentLinkCanceled = true;
      } else if (response.status === 404) {
        if (
          !asaasCanceled &&
          String(receivable.asaas_status || "").toUpperCase() !== "DELETED"
        ) {
          throw new Error(
            "Link de pagamento Asaas nao encontrado no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.",
          );
        }
        asaasPaymentLinkCanceled = true;
      } else {
        const message = payload?.errors?.map((item: any) =>
          item.description
        ).join(" ") ||
          payload?.message ||
          `Erro ${response.status} ao remover link de pagamento no Asaas.`;
        throw new Error(message);
      }
    }

    const cancelUpdate = admin
      .from("contas_receber")
      .update({
        status: "CANCELADO",
        asaas_status: "DELETED",
        asaas_payment_link_id: null,
        nosso_numero_asaas:
          receivable.asaas_payment_link_id && !receivable.asaas_payment_id
            ? null
            : receivable.nosso_numero_asaas,
        asaas_invoice_url: null,
        asaas_bank_slip_url: null,
        asaas_transaction_receipt_url: null,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .in("status", ["PENDENTE", "VENCIDO"]);
    let guardedCancelUpdate = applyRemoteIdentitySnapshot(
      cancelUpdate,
      receivable,
    );
    guardedCancelUpdate = applyReceivableSnapshotFields(
      guardedCancelUpdate,
      receivable,
      [
        "origem_pagamento",
        "asaas_status",
        "gateway_status",
        "updated_at",
      ],
    );
    const { data: canceled, error: updateError } = await guardedCancelUpdate
      .select()
      .maybeSingle();
    if (updateError) throw updateError;
    if (!canceled) {
      throw new Error(
        "Cobranca mudou de status antes do cancelamento. Atualize a tela e tente novamente.",
      );
    }

    return json({
      success: true,
      receivable: canceled,
      asaasCanceled,
      asaasDeleteStatus,
      asaasPaymentLinkCanceled,
      asaasPaymentLinkDeleteStatus,
    });
  } catch (error) {
    console.error(error);
    return json({
      error: error instanceof Error ? error.message : "Erro interno.",
    }, 400);
  }
});
