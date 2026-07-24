import { createClient } from "npm:@supabase/supabase-js@2";
import {
  requireGestorAtivo,
  requireGestorGlobal,
  requireGestorTab,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";
import { normalizeGraphVersion } from "../_shared/whatsapp-connection.ts";

const trimOrNull = (value: unknown) => {
  const text = String(value || "").trim();
  return text || null;
};

const allowedInstitutions = new Set(["universo", "anhanguera", "unopar"]);
const allowedModes = new Set(["cloud_api", "coexistence"]);
const graphBaseUrl = "https://graph.facebook.com";

const getConnectionSecret = async (
  admin: any,
  connectionId: string,
  kind: "access_token" | "app_secret" | "verify_token",
) => {
  const { data, error } = await admin.rpc("whatsapp_get_connection_secret", {
    p_connection_id: connectionId,
    p_secret_kind: kind,
  });
  if (error) throw error;
  return trimOrNull(data);
};

const metaErrorMessage = (payload: any, fallback: string) =>
  String(payload?.error?.message || fallback).trim();

const validateAndSubscribeConnection = async ({
  graphVersion,
  wabaId,
  phoneNumberId,
  accessToken,
}: {
  graphVersion: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}) => {
  const phonesResponse = await fetch(
    `${graphBaseUrl}/${graphVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type&limit=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const phonesPayload = await phonesResponse.json().catch(() => ({}));
  if (!phonesResponse.ok) {
    throw new Error(
      metaErrorMessage(
        phonesPayload,
        "Não foi possível validar os números desta WABA.",
      ),
    );
  }
  const phone = (Array.isArray(phonesPayload?.data) ? phonesPayload.data : [])
    .find((item: any) => String(item?.id || "").trim() === phoneNumberId);
  if (!phone) {
    throw new Error("O Phone Number ID informado não pertence à WABA.");
  }

  const subscribeResponse = await fetch(
    `${graphBaseUrl}/${graphVersion}/${wabaId}/subscribed_apps`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const subscribePayload = await subscribeResponse.json().catch(() => ({}));
  if (!subscribeResponse.ok || subscribePayload?.success !== true) {
    throw new Error(
      metaErrorMessage(
        subscribePayload,
        "A Meta não confirmou a assinatura de webhooks da WABA.",
      ),
    );
  }

  return {
    displayPhoneNumber: trimOrNull(phone.display_phone_number),
    subscribedAt: new Date().toISOString(),
  };
};

Deno.serve(async (req: Request) => {
  const respondJson = (body: unknown, status = 200) => json(body, status, req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return respondJson({ error: "Método não permitido." }, 405);
  }
  if (
    isRateLimitExceeded(
      `whatsapp-connection-config:${getClientIp(req)}`,
      20,
      60_000,
    )
  ) {
    return respondJson({
      error: "Muitas alterações em curto período. Aguarde alguns instantes.",
    }, 429);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson({ error: "Ambiente Supabase incompleto." }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const gestor = await requireGestorAtivo(req, admin);
    requireGestorTab(gestor, "comunicacao", "comunicacao-whatsapp");
    requireGestorGlobal(gestor);

    const body = await req.json();
    const id = trimOrNull(body.id) || crypto.randomUUID();
    const nome = trimOrNull(body.nome);
    const instituicao = String(body.instituicao || "universo").trim()
      .toLowerCase();
    const connectionMode = String(body.connection_mode || "cloud_api").trim();
    if (!nome) throw new Error("Informe o nome da linha.");
    if (!allowedInstitutions.has(instituicao)) {
      throw new Error("Instituição da linha inválida.");
    }
    if (!allowedModes.has(connectionMode)) {
      throw new Error("Modo de conexão inválido.");
    }

    const { data: current, error: currentError } = await admin
      .from("whatsapp_conexoes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw currentError;

    const accessToken = trimOrNull(body.tokenInput || body.token);
    const appSecret = trimOrNull(body.appSecretInput || body.app_secret);
    const verifyToken = trimOrNull(body.verifyTokenInput || body.verify_token);
    const phoneNumberId = trimOrNull(body.phone_number_id);
    const wabaId = trimOrNull(body.waba_id);
    const appId = trimOrNull(body.app_id);
    const requestedActive = body.status !== "inativo";
    const canReuseToken = current?.token_configured === true;
    const canReuseAppSecret = current?.app_secret_configured === true;
    const canReuseVerifyToken = current?.verify_token_configured === true;

    if (requestedActive && phoneNumberId) {
      if (!wabaId) throw new Error("Informe o WABA ID desta linha.");
      if (!appId) throw new Error("Informe o App ID da Meta.");
      if (!accessToken && !canReuseToken) {
        throw new Error("Informe o access token permanente desta linha.");
      }
      if (!appSecret && !canReuseAppSecret) {
        throw new Error("Informe o App Secret desta linha.");
      }
      if (!verifyToken && !canReuseVerifyToken) {
        throw new Error("Informe o Verify Token do webhook.");
      }
    }

    for (
      const [kind, value] of [
        ["access_token", accessToken],
        ["app_secret", appSecret],
        ["verify_token", verifyToken],
      ] as const
    ) {
      if (!value) continue;
      const { error } = await admin.rpc("whatsapp_set_connection_secret", {
        p_connection_id: id,
        p_secret_kind: kind,
        p_secret_value: value,
      });
      if (error) throw error;
    }

    const configuredAccessToken = accessToken ||
      await getConnectionSecret(admin, id, "access_token");
    let metaState: {
      displayPhoneNumber: string | null;
      subscribedAt: string;
    } | null = null;
    if (
      requestedActive &&
      phoneNumberId &&
      wabaId &&
      configuredAccessToken
    ) {
      metaState = await validateAndSubscribeConnection({
        graphVersion: normalizeGraphVersion(body.graph_version),
        wabaId,
        phoneNumberId,
        accessToken: configuredAccessToken,
      });
    }

    if (body.is_default === true) {
      const { error } = await admin
        .from("whatsapp_conexoes")
        .update({ is_default: false })
        .neq("id", id);
      if (error) throw error;
    }
    if (body.is_matriz_financeira === true) {
      const { error } = await admin
        .from("whatsapp_conexoes")
        .update({ is_matriz_financeira: false })
        .neq("id", id);
      if (error) throw error;
    }

    const payload = {
      id,
      nome,
      instituicao,
      telefone: metaState?.displayPhoneNumber || trimOrNull(body.telefone),
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      is_default: body.is_default === true,
      is_matriz_financeira: body.is_matriz_financeira === true,
      status: requestedActive ? "ativo" : "inativo",
      connection_mode: connectionMode,
      graph_version: normalizeGraphVersion(body.graph_version),
      app_id: appId,
      embedded_signup_config_id: trimOrNull(
        body.embedded_signup_config_id,
      ) || current?.embedded_signup_config_id || null,
      app_secret: null,
      verify_token: null,
      token_configured: Boolean(accessToken || canReuseToken),
      app_secret_configured: Boolean(appSecret || canReuseAppSecret),
      verify_token_configured: Boolean(
        verifyToken || canReuseVerifyToken,
      ),
      waba_subscribed_at: metaState?.subscribedAt ||
        current?.waba_subscribed_at ||
        null,
      last_health_check_at: metaState?.subscribedAt ||
        current?.last_health_check_at ||
        null,
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await admin
      .from("whatsapp_conexoes")
      .upsert(payload)
      .select("*")
      .single();
    if (saveError) throw saveError;

    const mainMenu =
      "Olá! Sou o *Uni*, assistente virtual da *Universo Cursos e Consultoria*.\n" +
      "Como posso ajudar?\n\n" +
      "1️⃣ Já sou aluno\n" +
      "2️⃣ Quero me matricular\n" +
      "3️⃣ Financeiro\n" +
      "4️⃣ Cursos disponíveis\n" +
      "5️⃣ Falar com atendente";
    const institutionalMenu =
      `Olá! Você está falando com o atendimento ${saved.nome}.\n\n` +
      "1️⃣ Boleto ou link de pagamento\n" +
      "2️⃣ PIX Copia e Cola\n" +
      "3️⃣ Declaração para IRPF\n" +
      "4️⃣ Falar com atendente";
    const { error: flowError } = await admin
      .from("whatsapp_flow_settings")
      .upsert({
        scope: `connection:${saved.id}`,
        conexao_id: saved.id,
        flow_type: saved.is_default ? "universo_main" : "institutional",
        routing_config: {},
        enabled: false,
        menu_message: saved.is_default ? mainMenu : institutionalMenu,
        welcome_message:
          "Para proteger seus dados e localizar seu cadastro com segurança, informe seu CPF. Pode enviar com ou sem pontuação.",
        fallback_message:
          "Não consegui entender sua resposta. Envie o número de uma das opções apresentadas.",
        handoff_message:
          "Certo. Seu atendimento foi encaminhado para a equipe responsável. Em breve alguém continuará por aqui.",
        updated_at: new Date().toISOString(),
      }, { onConflict: "conexao_id", ignoreDuplicates: true });
    if (flowError) throw flowError;
    const { error: flowScopeError } = await admin
      .from("whatsapp_flow_settings")
      .update({
        scope: `connection:${saved.id}`,
        flow_type: saved.is_default ? "universo_main" : "institutional",
        updated_at: new Date().toISOString(),
      })
      .eq("conexao_id", saved.id);
    if (flowScopeError) throw flowScopeError;

    if (saved.is_matriz_financeira) {
      if (accessToken) {
        const { error } = await admin.rpc("whatsapp_set_secret", {
          p_secret_name: "whatsapp_meta_access_token",
          p_secret_value: accessToken,
        });
        if (error) throw error;
      }
      if (appSecret) {
        const { error } = await admin.rpc("whatsapp_set_secret", {
          p_secret_name: "whatsapp_app_secret",
          p_secret_value: appSecret,
        });
        if (error) throw error;
      }
      if (verifyToken) {
        const { error } = await admin.rpc("whatsapp_set_secret", {
          p_secret_name: "whatsapp_webhook_verify_token",
          p_secret_value: verifyToken,
        });
        if (error) throw error;
      }

      const { error } = await admin.from("mensageria_config").upsert({
        tipo: "whatsapp",
        wa_provider: "meta_cloud",
        wa_connection_mode: connectionMode,
        wa_instance_name: saved.nome,
        wa_status: requestedActive &&
            phoneNumberId &&
            saved.token_configured &&
            saved.app_secret_configured &&
            saved.verify_token_configured &&
            saved.waba_subscribed_at
          ? "configurado"
          : "inativo",
        wa_business_account_id: saved.waba_id,
        wa_phone_number_id: saved.phone_number_id,
        wa_display_phone_number: saved.telefone,
        wa_graph_version: saved.graph_version,
        wa_app_id: saved.app_id,
        wa_embedded_signup_config_id: saved.embedded_signup_config_id,
        wa_enabled: Boolean(
          requestedActive &&
            phoneNumberId &&
            saved.token_configured &&
            saved.app_secret_configured &&
            saved.verify_token_configured &&
            saved.waba_subscribed_at,
        ),
        wa_last_health_check_at: new Date().toISOString(),
      }, { onConflict: "tipo" });
      if (error) throw error;
    }

    return respondJson({ ok: true, connection: saved });
  } catch (error) {
    console.error("whatsapp-connection-config error:", error);
    return respondJson({
      error: error instanceof Error
        ? error.message
        : "Erro inesperado ao salvar a linha WhatsApp.",
    }, 400);
  }
});
