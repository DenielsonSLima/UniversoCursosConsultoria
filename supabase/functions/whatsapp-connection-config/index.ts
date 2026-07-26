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

const validateAppSecretCandidate = async ({
  graphVersion,
  appId,
  appSecret,
}: {
  graphVersion: string;
  appId: string;
  appSecret: string;
}) => {
  const response = await fetch(
    `${graphBaseUrl}/${graphVersion}/${appId}?fields=id,name`,
    { headers: { Authorization: `Bearer ${appId}|${appSecret}` } },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || String(payload?.id || "") !== appId) {
    throw new Error(
      metaErrorMessage(
        payload,
        "A Meta recusou o App Secret para este App ID.",
      ),
    );
  }
};

type CredentialState = "valid" | "verified" | "stored" | "missing" | "invalid";

type CredentialCheck = {
  state: CredentialState;
  message: string;
};

const validateStoredCredentials = async ({
  admin,
  connection,
}: {
  admin: any;
  connection: any;
}) => {
  const [accessToken, appSecret, verifyToken] = await Promise.all([
    getConnectionSecret(admin, connection.id, "access_token"),
    getConnectionSecret(admin, connection.id, "app_secret"),
    getConnectionSecret(admin, connection.id, "verify_token"),
  ]);
  const graphVersion = normalizeGraphVersion(connection.graph_version);
  const phoneNumberId = trimOrNull(connection.phone_number_id);
  const appId = trimOrNull(connection.app_id);

  const accessTokenCheck = async (): Promise<CredentialCheck> => {
    if (!accessToken) {
      return { state: "missing", message: "Access Token não configurado." };
    }
    const target = phoneNumberId || "me";
    const fields = phoneNumberId
      ? "id,display_phone_number,verified_name"
      : "id,name";
    const response = await fetch(
      `${graphBaseUrl}/${graphVersion}/${target}?fields=${fields}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        state: "invalid",
        message: metaErrorMessage(
          payload,
          "A Meta recusou o Access Token armazenado.",
        ),
      };
    }
    return {
      state: "valid",
      message: phoneNumberId
        ? "Access Token aceito pela Meta para este número."
        : "Access Token aceito pela Meta.",
    };
  };

  const appSecretCheck = async (): Promise<CredentialCheck> => {
    if (!appSecret) {
      return { state: "missing", message: "App Secret não configurado." };
    }
    if (!appId) {
      return {
        state: "stored",
        message: "App Secret salvo; informe o App ID para validar na Meta.",
      };
    }
    const response = await fetch(
      `${graphBaseUrl}/${graphVersion}/${appId}?fields=id,name`,
      { headers: { Authorization: `Bearer ${appId}|${appSecret}` } },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || String(payload?.id || "") !== appId) {
      return {
        state: "invalid",
        message: metaErrorMessage(
          payload,
          "A Meta recusou o App Secret para este App ID.",
        ),
      };
    }
    return {
      state: "valid",
      message: "App Secret aceito pela Meta para este App ID.",
    };
  };

  const [accessTokenResult, appSecretResult] = await Promise.all([
    accessTokenCheck(),
    appSecretCheck(),
  ]);
  const verifyTokenResult: CredentialCheck = !verifyToken
    ? { state: "missing", message: "Verify Token não configurado." }
    : connection.webhook_verified_at
    ? {
      state: "verified",
      message: "Verify Token confirmado pela última validação do webhook.",
    }
    : {
      state: "stored",
      message:
        "Verify Token salvo. A confirmação ocorre quando a Meta valida o webhook.",
    };

  return {
    accessToken: accessTokenResult,
    appSecret: appSecretResult,
    verifyToken: verifyTokenResult,
  };
};

const validatePhoneForOutbound = async ({
  graphVersion,
  phoneNumberId,
  accessToken,
}: {
  graphVersion: string;
  phoneNumberId: string;
  accessToken: string;
}) => {
  const phoneResponse = await fetch(
    `${graphBaseUrl}/${graphVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,is_on_biz_app`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const phone = await phoneResponse.json().catch(() => ({}));
  if (
    !phoneResponse.ok ||
    String(phone?.id || "").trim() !== phoneNumberId
  ) {
    throw new Error(
      metaErrorMessage(
        phone,
        "Não foi possível validar o Phone Number ID com este Access Token.",
      ),
    );
  }

  return {
    displayPhoneNumber: trimOrNull(phone.display_phone_number),
    isOnBusinessApp: phone?.is_on_biz_app === true,
  };
};

const subscribeWabaWebhook = async ({
  graphVersion,
  wabaId,
  accessToken,
}: {
  graphVersion: string;
  wabaId: string;
  accessToken: string;
}) => {
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

  return new Date().toISOString();
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
    const action = String(body.action || "save").trim().toLowerCase();

    if (action === "validate_credentials" || action === "remove_secret") {
      if (!trimOrNull(body.id)) {
        throw new Error("Salve a linha antes de gerenciar as credenciais.");
      }
      const { data: connection, error: connectionError } = await admin
        .from("whatsapp_conexoes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (connectionError) throw connectionError;
      if (!connection) throw new Error("Conexão WhatsApp não encontrada.");

      if (action === "validate_credentials") {
        const credentials = await validateStoredCredentials({
          admin,
          connection,
        });
        const requiredCredentialKeys = connection.connection_mode ===
            "coexistence"
          ? ["accessToken", "appSecret", "verifyToken"]
          : ["accessToken"];
        const attentionMessages = requiredCredentialKeys
          .map((key) => credentials[key as keyof typeof credentials])
          .filter((check) => !["valid", "verified"].includes(check.state))
          .map((check) => check.message);
        const checkedAt = new Date().toISOString();
        const lastError = attentionMessages.length
          ? attentionMessages.join(" ")
          : null;
        const { data: updated, error: updateError } = await admin
          .from("whatsapp_conexoes")
          .update({
            last_health_check_at: checkedAt,
            last_error: lastError,
            updated_at: checkedAt,
          })
          .eq("id", id)
          .select("*")
          .single();
        if (updateError) throw updateError;

        return respondJson({
          ok: attentionMessages.length === 0,
          checkedAt,
          credentials,
          connection: updated,
        });
      }

      const secretKind = String(body.secretKind || "").trim();
      if (!["access_token", "app_secret", "verify_token"].includes(secretKind)) {
        throw new Error("Credencial inválida para remoção.");
      }
      const { error: deleteError } = await admin.rpc(
        "whatsapp_remove_connection_secret",
        {
          p_connection_id: id,
          p_secret_kind: secretKind,
        },
      );
      if (deleteError) throw deleteError;

      const { data: updated, error: updateError } = await admin
        .from("whatsapp_conexoes")
        .select("*")
        .eq("id", id)
        .single();
      if (updateError) throw updateError;

      return respondJson({ ok: true, connection: updated });
    }

    if (action !== "save") {
      throw new Error("Ação de configuração WhatsApp inválida.");
    }

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
    const isCoexistence = connectionMode === "coexistence";
    const hasConfirmedIdentity = Boolean(
      current?.phone_number_id ||
        current?.waba_id ||
        current?.waba_subscribed_at ||
        current?.coexistence_verified_at,
    );
    const changesConfirmedIdentity = Boolean(
      current &&
        (
          current.connection_mode !== connectionMode ||
          trimOrNull(current.phone_number_id) !== phoneNumberId ||
          trimOrNull(current.waba_id) !== wabaId ||
          trimOrNull(current.app_id) !== appId
        ),
    );
    if (hasConfirmedIdentity && changesConfirmedIdentity) {
      throw new Error(
        "Esta identidade já foi confirmada pela Meta. Para trocar o modo, o app, a WABA ou o número, adicione uma nova linha e preserve o histórico desta conexão.",
      );
    }
    const [
      storedAccessToken,
      storedAppSecret,
      storedVerifyToken,
    ] = current
      ? await Promise.all([
        getConnectionSecret(admin, id, "access_token"),
        getConnectionSecret(admin, id, "app_secret"),
        getConnectionSecret(admin, id, "verify_token"),
      ])
      : [null, null, null];
    const canReuseToken = Boolean(storedAccessToken);
    const canReuseAppSecret = Boolean(storedAppSecret);
    const canReuseVerifyToken = Boolean(storedVerifyToken);

    if (requestedActive) {
      if (!phoneNumberId) {
        throw new Error("Informe o Phone Number ID desta linha.");
      }
      if (!accessToken && !canReuseToken) {
        throw new Error("Informe o Access Token desta linha.");
      }
      if (isCoexistence) {
        if (!wabaId) throw new Error("Informe o WABA ID desta linha.");
        if (!appId) throw new Error("Informe o App ID da Meta.");
        if (!appSecret && !canReuseAppSecret) {
          throw new Error("Informe o App Secret desta linha.");
        }
        if (!verifyToken && !canReuseVerifyToken) {
          throw new Error("Informe o Verify Token do webhook.");
        }
      }
    }

    const configuredAccessToken = accessToken || storedAccessToken;
    let metaState: {
      displayPhoneNumber: string | null;
      isOnBusinessApp: boolean;
    } | null = null;
    if (requestedActive && phoneNumberId && configuredAccessToken) {
      metaState = await validatePhoneForOutbound({
        graphVersion: normalizeGraphVersion(body.graph_version),
        phoneNumberId,
        accessToken: configuredAccessToken,
      });
      if (!isCoexistence && metaState.isOnBusinessApp) {
        throw new Error(
          "A Meta informa que este número ainda está no WhatsApp Business App. Conclua a desconexão da plataforma empresarial ou cadastre-o no modo Coexistência.",
        );
      }
      if (isCoexistence && !metaState.isOnBusinessApp) {
        throw new Error(
          "A Meta não confirmou este número no WhatsApp Business App. Use “Entrar com Facebook” para concluir a coexistência.",
        );
      }
    }
    if (appSecret && appId) {
      await validateAppSecretCandidate({
        graphVersion: normalizeGraphVersion(body.graph_version),
        appId,
        appSecret,
      });
    }

    let subscribedAt = current?.waba_subscribed_at || null;
    let webhookSubscriptionWarning: string | null = null;
    const hasWebhookCredentials = Boolean(
      wabaId &&
        appId &&
        (appSecret || storedAppSecret) &&
        (verifyToken || storedVerifyToken),
    );
    if (
      requestedActive &&
      configuredAccessToken &&
      wabaId &&
      hasWebhookCredentials
    ) {
      try {
        subscribedAt = await subscribeWabaWebhook({
          graphVersion: normalizeGraphVersion(body.graph_version),
          wabaId,
          accessToken: configuredAccessToken,
        });
      } catch (error) {
        webhookSubscriptionWarning = error instanceof Error
          ? error.message
          : "A linha foi salva, mas a assinatura do webhook não foi confirmada.";
      }
    }

    const { error: promoteSecretsError } = await admin.rpc(
      "whatsapp_set_connection_secrets",
      {
        p_connection_id: id,
        p_access_token: accessToken,
        p_app_secret: appSecret,
        p_verify_token: verifyToken,
      },
    );
    if (promoteSecretsError) throw promoteSecretsError;

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
      embedded_signup_config_id: isCoexistence
        ? trimOrNull(body.embedded_signup_config_id) ||
          current?.embedded_signup_config_id || null
        : null,
      app_secret: null,
      verify_token: null,
      token_configured: Boolean(accessToken || storedAccessToken),
      app_secret_configured: Boolean(appSecret || storedAppSecret),
      verify_token_configured: Boolean(verifyToken || storedVerifyToken),
      webhook_verified_at: verifyToken ||
          current?.connection_mode !== connectionMode
        ? null
        : current?.webhook_verified_at || null,
      waba_subscribed_at: subscribedAt,
      coexistence_verified_at: isCoexistence
        ? current?.coexistence_verified_at || null
        : null,
      contacts_sync_status: isCoexistence
        ? current?.contacts_sync_status || "not_requested"
        : "not_requested",
      contacts_sync_request_id: isCoexistence
        ? current?.contacts_sync_request_id || null
        : null,
      history_sync_status: isCoexistence
        ? current?.history_sync_status || "not_requested"
        : "not_requested",
      history_sync_request_id: isCoexistence
        ? current?.history_sync_request_id || null
        : null,
      history_sync_progress: isCoexistence
        ? current?.history_sync_progress || null
        : null,
      last_health_check_at: requestedActive
        ? new Date().toISOString()
        : current?.last_health_check_at || null,
      last_error: webhookSubscriptionWarning,
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

      const cloudApiReady = Boolean(
        requestedActive &&
          phoneNumberId &&
          saved.token_configured,
      );
      const coexistenceReady = Boolean(
        cloudApiReady &&
          saved.app_secret_configured &&
          saved.verify_token_configured &&
          saved.webhook_verified_at &&
          saved.coexistence_verified_at,
      );
      const operational = isCoexistence
        ? coexistenceReady
        : cloudApiReady;

      const { error } = await admin.from("mensageria_config").upsert({
        tipo: "whatsapp",
        wa_provider: "meta_cloud",
        wa_connection_mode: connectionMode,
        wa_instance_name: saved.nome,
        wa_status: operational ? "configurado" : "inativo",
        wa_business_account_id: saved.waba_id,
        wa_phone_number_id: saved.phone_number_id,
        wa_display_phone_number: saved.telefone,
        wa_graph_version: saved.graph_version,
        wa_app_id: saved.app_id,
        wa_embedded_signup_config_id: saved.embedded_signup_config_id,
        wa_enabled: operational,
        wa_last_health_check_at: new Date().toISOString(),
      }, { onConflict: "tipo" });
      if (error) throw error;
    }

    return respondJson({
      ok: true,
      connection: saved,
      warnings: webhookSubscriptionWarning ? [webhookSubscriptionWarning] : [],
    });
  } catch (error) {
    console.error("whatsapp-connection-config error:", error);
    return respondJson({
      error: error instanceof Error
        ? error.message
        : "Erro inesperado ao salvar a linha WhatsApp.",
    }, 400);
  }
});
