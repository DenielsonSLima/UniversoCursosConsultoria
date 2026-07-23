import { GRAPH_BASE_URL } from "./metaGraph.ts";
import type {
  AdminClient,
  CurrentWhatsAppConfig,
  PhoneNumberStatus,
} from "./types.ts";
import { trimOrNull } from "./utils.ts";

export const loadCurrentWhatsAppConfig = async (admin: AdminClient) => {
  const { data, error } = await admin
    .from("mensageria_config")
    .select("wa_app_id, wa_embedded_signup_config_id, wa_graph_version")
    .eq("tipo", "whatsapp")
    .maybeSingle();
  if (error) throw error;

  return (data || null) as CurrentWhatsAppConfig | null;
};

export const saveCompletedEmbeddedSignup = async (
  admin: AdminClient,
  {
    wabaId,
    phoneNumberId,
    graphVersion,
    appId,
    configurationId,
    businessId,
    statusPayload,
  }: {
    wabaId: string;
    phoneNumberId: string;
    graphVersion: string;
    appId: string;
    configurationId: string | null;
    businessId: string | null;
    statusPayload: PhoneNumberStatus | null;
  },
) => {
  const { error } = await admin
    .from("mensageria_config")
    .upsert({
      tipo: "whatsapp",
      wa_provider: "meta_cloud",
      wa_connection_mode: "coexistence",
      wa_instance_url: GRAPH_BASE_URL,
      wa_status: "configurado",
      wa_business_account_id: wabaId,
      wa_phone_number_id: phoneNumberId,
      wa_display_phone_number: trimOrNull(statusPayload?.display_phone_number),
      wa_graph_version: graphVersion,
      wa_app_id: appId,
      wa_embedded_signup_config_id: configurationId,
      wa_business_portfolio_id: businessId,
      wa_account_currency: "BRL",
      wa_estimated_balance: null,
      wa_quality_rating: trimOrNull(statusPayload?.quality_rating),
      wa_messaging_limit: null,
      wa_enabled: true,
      wa_last_health_check_at: new Date().toISOString(),
      wa_coexistence_verified_at: new Date().toISOString(),
      wa_contacts_sync_status: "not_requested",
      wa_contacts_sync_request_id: null,
      wa_history_sync_status: "not_requested",
      wa_history_sync_request_id: null,
      wa_history_sync_progress: null,
      wa_last_account_event: "EMBEDDED_SIGNUP_COMPLETED",
      wa_last_account_event_at: new Date().toISOString(),
    }, { onConflict: "tipo" });
  if (error) throw error;
};

export const updateBusinessAppSyncState = async (
  admin: AdminClient,
  {
    syncType,
    status,
    requestId,
  }: {
    syncType: string;
    status?: "requested" | "error";
    requestId?: string | null;
  },
) => {
  const isContacts = syncType === "smb_app_state_sync";
  const update: Record<string, unknown> = {};

  if (status) {
    update[isContacts ? "wa_contacts_sync_status" : "wa_history_sync_status"] =
      status;
  }
  if (requestId !== undefined) {
    update[
      isContacts ? "wa_contacts_sync_request_id" : "wa_history_sync_request_id"
    ] = requestId;
  }

  const { error } = await admin
    .from("mensageria_config")
    .update(update)
    .eq("tipo", "whatsapp");
  if (error) throw error;
};
