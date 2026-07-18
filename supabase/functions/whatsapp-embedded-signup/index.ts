import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
import {
  BUSINESS_APP_SYNC_TYPES,
  COEXISTENCE_FINISH_EVENT,
  exchangeEmbeddedSignupCode,
  fetchFirstPhoneNumberId,
  fetchPhoneNumberStatus,
  startBusinessAppSync,
  subscribeWabaToWebhooks,
} from "./metaGraph.ts";
import {
  loadCurrentWhatsAppConfig,
  saveCompletedEmbeddedSignup,
} from "./configRepository.ts";
import type { EmbeddedSignupBody, PhoneNumberStatus, SyncRequestResult } from "./types.ts";
import { asRecord, getNestedText, normalizeGraphVersion, trimOrNull } from "./utils.ts";
import { getSecret, setSecret } from "./vault.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  const respondJson = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respondJson({ error: "Metodo nao permitido." }, 405);

  if (isRateLimitExceeded(`whatsapp-embedded-signup:${getClientIp(req)}`, 10, 60000)) {
    return respondJson({ error: "Muitas tentativas de conexao em curto periodo. Aguarde alguns instantes." }, 429);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson({ error: "Ambiente Supabase incompleto para Embedded Signup WhatsApp." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const gestor = await requireGestorAtivo(req, admin);
    requireGestorTab(gestor, "comunicacao", "comunicacao-whatsapp");
    requireGestorGlobal(gestor);

    const body = await req.json() as EmbeddedSignupBody;
    const code = trimOrNull(body.code);
    if (!code) throw new Error("Codigo do Embedded Signup nao recebido.");

    const sessionEvent = asRecord(body.sessionEvent);
    const event = trimOrNull(sessionEvent.event);
    if (body.mode === "coexistence" && event !== COEXISTENCE_FINISH_EVENT) {
      throw new Error("A Meta finalizou o fluxo sem evento de coexistencia. Verifique se o App esta habilitado para WhatsApp Business App onboarding.");
    }

    const sessionData = asRecord(sessionEvent.data);
    const wabaId = getNestedText(sessionData, "waba_id");
    let phoneNumberId = getNestedText(sessionData, "phone_number_id");
    const businessId = getNestedText(sessionData, "business_id");
    if (!wabaId) throw new Error("A Meta nao retornou o WABA ID no Embedded Signup.");

    const currentConfig = await loadCurrentWhatsAppConfig(admin);

    const appId = trimOrNull(body.appId) || trimOrNull(currentConfig?.wa_app_id);
    if (!appId) throw new Error("App ID da Meta nao configurado.");

    const appSecretFromBody = trimOrNull(body.appSecret);
    if (appSecretFromBody) {
      await setSecret(admin, "whatsapp_app_secret", appSecretFromBody);
    }

    const appSecret = appSecretFromBody || await getSecret(admin, "whatsapp_app_secret");
    if (!appSecret) throw new Error("App Secret da Meta nao configurado no Vault.");

    const graphVersion = normalizeGraphVersion(body.graphVersion || currentConfig?.wa_graph_version);
    const accessToken = await exchangeEmbeddedSignupCode({
      graphVersion,
      appId,
      appSecret,
      code,
    });

    await setSecret(admin, "whatsapp_meta_access_token", accessToken);

    const warnings: string[] = [];
    if (!phoneNumberId) {
      phoneNumberId = await fetchFirstPhoneNumberId({
        graphVersion,
        wabaId,
        accessToken,
      });
    }
    if (!phoneNumberId) throw new Error("Nao foi possivel identificar o Phone Number ID do WhatsApp.");

    let statusPayload: PhoneNumberStatus | null = null;
    try {
      statusPayload = await fetchPhoneNumberStatus({
        graphVersion,
        phoneNumberId,
        accessToken,
      });
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Nao foi possivel consultar status do numero.");
    }

    try {
      await subscribeWabaToWebhooks({
        graphVersion,
        wabaId,
        accessToken,
      });
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Nao foi possivel assinar webhooks da WABA.");
    }

    const syncRequests: SyncRequestResult[] = [];
    for (const syncType of BUSINESS_APP_SYNC_TYPES) {
      try {
        const syncRequest = await startBusinessAppSync({
          graphVersion,
          phoneNumberId,
          accessToken,
          syncType,
        });
        syncRequests.push(syncRequest);
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : `Nao foi possivel iniciar sincronizacao ${syncType}.`);
      }
    }

    await saveCompletedEmbeddedSignup(admin, {
      wabaId,
      phoneNumberId,
      graphVersion,
      appId,
      configurationId: trimOrNull(body.configurationId) ||
        trimOrNull(currentConfig?.wa_embedded_signup_config_id),
      statusPayload,
    });

    return respondJson({
      ok: true,
      event,
      wabaId,
      phoneNumberId,
      businessId,
      isOnBizApp: typeof statusPayload?.is_on_biz_app === "boolean"
        ? statusPayload.is_on_biz_app
        : null,
      platformType: trimOrNull(statusPayload?.platform_type),
      displayPhoneNumber: trimOrNull(statusPayload?.display_phone_number),
      syncRequests,
      warnings,
    });
  } catch (error) {
    console.error("whatsapp-embedded-signup error:", error);
    return respondJson({
      error: error instanceof Error ? error.message : "Erro inesperado no Embedded Signup WhatsApp.",
    }, 400);
  }
});
