import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Environment = "sandbox" | "production";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
      .select("id, perfil, status")
      .eq("email", authData.user.email)
      .maybeSingle();
    if (usuarioError) throw usuarioError;
    if (
      !usuario
      || String(usuario.status).toLowerCase() !== "ativo"
      || String(usuario.perfil).toLowerCase() !== "gestor"
    ) {
      throw new Error("Apenas gestor ativo pode cancelar cobranca no Asaas.");
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

    const environment: Environment = body.environment === "production"
      ? "production"
      : config?.environment === "production"
        ? "production"
        : "sandbox";
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

    if (receivable.status === "PAGO" || ["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)) {
      throw new Error("Cobrancas pagas/confirmadas nao podem ser canceladas por este fluxo.");
    }

    let asaasCanceled = false;
    let asaasDeleteStatus: number | null = null;

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
      } else if (response.status !== 404) {
        const message = payload?.errors?.map((item: any) => item.description).join(" ")
          || payload?.message
          || `Erro ${response.status} ao cancelar cobranca no Asaas.`;
        throw new Error(message);
      }
    }

    const { data: canceled, error: updateError } = await admin
      .from("contas_receber")
      .update({
        status: "CANCELADO",
        asaas_status: "DELETED",
        asaas_invoice_url: null,
        asaas_bank_slip_url: null,
        asaas_transaction_receipt_url: null,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .select()
      .single();
    if (updateError) throw updateError;

    return json({
      success: true,
      receivable: canceled,
      asaasCanceled,
      asaasDeleteStatus,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 400);
  }
});
