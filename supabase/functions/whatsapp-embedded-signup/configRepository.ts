import { GRAPH_BASE_URL } from "./metaGraph.ts";
import type {
  AdminClient,
  CurrentWhatsAppConnection,
  PhoneNumberStatus,
} from "./types.ts";
import { trimOrNull } from "./utils.ts";

export const loadWhatsAppConnection = async (
  admin: AdminClient,
  connectionId: string,
) => {
  const { data, error } = await admin
    .from("whatsapp_conexoes")
    .select(
      "id,nome,app_id,embedded_signup_config_id,graph_version,is_matriz_financeira",
    )
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Linha WhatsApp não encontrada.");

  return data as CurrentWhatsAppConnection;
};

export const saveCompletedEmbeddedSignup = async (
  admin: AdminClient,
  {
    connectionId,
    wabaId,
    phoneNumberId,
    graphVersion,
    appId,
    configurationId,
    businessId,
    statusPayload,
    verifyTokenConfigured,
  }: {
    connectionId: string;
    wabaId: string;
    phoneNumberId: string;
    graphVersion: string;
    appId: string;
    configurationId: string | null;
    businessId: string | null;
    statusPayload: PhoneNumberStatus | null;
    verifyTokenConfigured: boolean;
  },
) => {
  const now = new Date().toISOString();
  const { data: connection, error } = await admin
    .from("whatsapp_conexoes")
    .update({
      connection_mode: "coexistence",
      status: "ativo",
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      telefone: trimOrNull(statusPayload?.display_phone_number),
      graph_version: graphVersion,
      app_id: appId,
      embedded_signup_config_id: configurationId,
      business_portfolio_id: businessId,
      token_configured: true,
      app_secret_configured: true,
      verify_token_configured: verifyTokenConfigured,
      waba_subscribed_at: now,
      coexistence_verified_at: now,
      contacts_sync_status: "not_requested",
      contacts_sync_request_id: null,
      history_sync_status: "not_requested",
      history_sync_request_id: null,
      history_sync_progress: null,
      last_account_event: "EMBEDDED_SIGNUP_COMPLETED",
      last_account_event_at: now,
      last_health_check_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", connectionId)
    .select("id,nome,is_matriz_financeira")
    .single();
  if (error) throw error;

  if (connection.is_matriz_financeira) {
    const { error: legacyError } = await admin
      .from("mensageria_config")
      .upsert({
        tipo: "whatsapp",
        wa_provider: "meta_cloud",
        wa_connection_mode: "coexistence",
        wa_instance_name: connection.nome,
        wa_instance_url: GRAPH_BASE_URL,
        wa_status: "configurado",
        wa_business_account_id: wabaId,
        wa_phone_number_id: phoneNumberId,
        wa_display_phone_number: trimOrNull(
          statusPayload?.display_phone_number,
        ),
        wa_graph_version: graphVersion,
        wa_app_id: appId,
        wa_embedded_signup_config_id: configurationId,
        wa_business_portfolio_id: businessId,
        wa_account_currency: "BRL",
        wa_estimated_balance: null,
        wa_quality_rating: trimOrNull(statusPayload?.quality_rating),
        wa_messaging_limit: null,
        wa_enabled: true,
        wa_last_health_check_at: now,
        wa_coexistence_verified_at: now,
        wa_contacts_sync_status: "not_requested",
        wa_contacts_sync_request_id: null,
        wa_history_sync_status: "not_requested",
        wa_history_sync_request_id: null,
        wa_history_sync_progress: null,
        wa_last_account_event: "EMBEDDED_SIGNUP_COMPLETED",
        wa_last_account_event_at: now,
      }, { onConflict: "tipo" });
    if (legacyError) throw legacyError;
  }
};

export const updateBusinessAppSyncState = async (
  admin: AdminClient,
  {
    connectionId,
    syncType,
    status,
    requestId,
  }: {
    connectionId: string;
    syncType: string;
    status?: "requested" | "error";
    requestId?: string | null;
  },
) => {
  const isContacts = syncType === "smb_app_state_sync";
  const update: Record<string, unknown> = {};

  if (status) {
    update[isContacts ? "contacts_sync_status" : "history_sync_status"] =
      status;
  }
  if (requestId !== undefined) {
    update[
      isContacts ? "contacts_sync_request_id" : "history_sync_request_id"
    ] = requestId;
  }
  update.last_health_check_at = new Date().toISOString();
  update.updated_at = new Date().toISOString();

  const { data: connection, error } = await admin
    .from("whatsapp_conexoes")
    .update(update)
    .eq("id", connectionId)
    .select("is_matriz_financeira")
    .single();
  if (error) throw error;

  if (connection.is_matriz_financeira) {
    const legacyUpdate: Record<string, unknown> = {
      wa_last_health_check_at: update.last_health_check_at,
    };
    if (status) {
      legacyUpdate[
        isContacts ? "wa_contacts_sync_status" : "wa_history_sync_status"
      ] = status;
    }
    if (requestId !== undefined) {
      legacyUpdate[
        isContacts
          ? "wa_contacts_sync_request_id"
          : "wa_history_sync_request_id"
      ] = requestId;
    }
    const { error: legacyError } = await admin
      .from("mensageria_config")
      .update(legacyUpdate)
      .eq("tipo", "whatsapp");
    if (legacyError) throw legacyError;
  }
};
