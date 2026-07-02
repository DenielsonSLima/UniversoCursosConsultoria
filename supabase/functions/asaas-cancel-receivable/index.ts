import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json as sendJson,
} from "../asaas-api/shared.ts";

type Environment = "sandbox" | "production";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const isActiveStatus = (status: unknown) =>
  ["ativo", "active"].includes(normalize(status));
const canCancelReceivable = (perfil: unknown) =>
  ["gestor", "financeiro"].includes(normalize(perfil));

const json = (body: unknown, status = 200, req?: Request) =>
  sendJson(body, status, req);

Deno.serve(async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);

  if (isRateLimitExceeded(`asaas-cancel:${getClientIp(req)}`, 30, 60000)) {
    return json({
      error: "Muitas tentativas em curto intervalo. Tente novamente em alguns segundos.",
    }, 429, req);
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersForRequest });
  if (req.method !== "POST") return json({ error: "Metodo nao permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new Error("Autenticacao obrigatoria para esta acao.");

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user?.email) {
      throw new Error("Sessao invalida para esta acao.");
    }

    const { data: usuario, error: usuarioError } = await admin
      .from("usuarios_sistema")
      .select("id, perfil, status, context")
      .ilike("email", authData.user.email)
      .maybeSingle();
    if (usuarioError) throw usuarioError;
    if (
      !usuario
      || !isActiveStatus(usuario.status)
      || !canCancelReceivable(usuario.perfil)
    ) {
      throw new Error("Apenas gestor ou financeiro ativo pode cancelar cobranca no Asaas.");
    }

    const context = usuario.context ? String(usuario.context).trim() : null;
    let gestorPoloId: string | null = UUID_RE.test(context || "") ? context : null;
    let gestorGlobal = normalize(context) === "global";
    if (gestorPoloId) {
      const { data: polo, error: poloError } = await admin
        .from("polos")
        .select("is_matriz")
        .eq("id", gestorPoloId)
        .maybeSingle();
      if (poloError) throw poloError;
      if (polo?.is_matriz === true) gestorGlobal = true;
    }

    const body = await req.json();
    const receivableId = String(body.receivableId || "").trim();
    if (!UUID_RE.test(receivableId)) {
      throw new Error("Cobranca invalida para cancelamento.");
    }

    const { data: config, error: configError } = await admin
      .from("asaas_config")
      .select("environment")
      .maybeSingle();
    if (configError) throw configError;

    const environment: Environment = config?.environment === "production" ? "production" : "sandbox";
    const secretName = environment === "production"
      ? "asaas_production_api_key"
      : "asaas_sandbox_api_key";
    const baseUrl = environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";

    const { data: apiKey, error: secretError } = await admin.rpc("asaas_get_secret", {
      p_secret_name: secretName,
    });
    if (secretError) throw secretError;
    if (!apiKey) throw new Error(`A chave do ambiente ${environment} ainda nao foi configurada.`);

    const { data: receivable, error } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .single();
    if (error) throw error;
    if (!gestorGlobal && !receivable.polo_id) {
      throw new Error("Cobranca sem polo definido nao pode ser cancelada por usuario de polo.");
    }
    if (!gestorGlobal && receivable.polo_id && gestorPoloId !== receivable.polo_id) {
      throw new Error("Gestor sem permissao para cancelar cobranca deste polo.");
    }

    if (receivable.status === "PAGO" || ["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)) {
      throw new Error("Cobrancas pagas/confirmadas nao podem ser canceladas por este fluxo.");
    }

    let asaasCanceled = false;
    let asaasDeleteStatus: number | null = null;
    let asaasPaymentLinkCanceled = false;
    let asaasPaymentLinkDeleteStatus: number | null = null;

    if (receivable.asaas_payment_id) {
      const response = await fetch(`${baseUrl}/payments/${receivable.asaas_payment_id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Universo-Cursos-Gestao",
          access_token: String(apiKey),
        },
      });
      asaasDeleteStatus = response.status;
      const payload = response.status === 204 ? null : await response.json().catch(() => null);

      if (response.ok) {
        asaasCanceled = true;
      } else if (response.status === 404) {
        if (String(receivable.asaas_status || "").toUpperCase() !== "DELETED") {
          throw new Error("Cobranca Asaas nao encontrada no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.");
        }
      } else {
        const message = payload?.errors?.map((item: any) => item.description).join(" ")
          || payload?.message
          || `Erro ${response.status} ao cancelar cobranca no Asaas.`;
        throw new Error(message);
      }
    }

    if (receivable.asaas_payment_link_id) {
      const response = await fetch(`${baseUrl}/paymentLinks/${receivable.asaas_payment_link_id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Universo-Cursos-Gestao",
          access_token: String(apiKey),
        },
      });
      asaasPaymentLinkDeleteStatus = response.status;
      const payload = response.status === 204 ? null : await response.json().catch(() => null);

      if (response.ok) {
        asaasPaymentLinkCanceled = true;
      } else if (response.status === 404) {
        if (!asaasCanceled && String(receivable.asaas_status || "").toUpperCase() !== "DELETED") {
          throw new Error("Link de pagamento Asaas nao encontrado no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.");
        }
        asaasPaymentLinkCanceled = true;
      } else {
        const message = payload?.errors?.map((item: any) => item.description).join(" ")
          || payload?.message
          || `Erro ${response.status} ao remover link de pagamento no Asaas.`;
        throw new Error(message);
      }
    }

    const { data: canceled, error: updateError } = await admin
      .from("contas_receber")
      .update({
        status: "CANCELADO",
        asaas_status: "DELETED",
        asaas_payment_link_id: null,
        nosso_numero_asaas: receivable.asaas_payment_link_id && !receivable.asaas_payment_id ? null : receivable.nosso_numero_asaas,
        asaas_invoice_url: null,
        asaas_bank_slip_url: null,
        asaas_transaction_receipt_url: null,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .in("status", ["PENDENTE", "VENCIDO"])
      .select()
      .maybeSingle();
    if (updateError) throw updateError;
    if (!canceled) {
      throw new Error("Cobranca mudou de status antes do cancelamento. Atualize a tela e tente novamente.");
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
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 400);
  }
});
