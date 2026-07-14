import { GRAPH_BASE_URL } from "./metaGraph.ts";
import type { AdminClient, CurrentWhatsAppConfig, PhoneNumberStatus } from "./types.ts";
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
    statusPayload,
  }: {
    wabaId: string;
    phoneNumberId: string;
    graphVersion: string;
    appId: string;
    configurationId: string | null;
    statusPayload: PhoneNumberStatus | null;
  },
) => {
  const { error } = await admin
    .from("mensageria_config")
    .upsert({
      tipo: "whatsapp",
      wa_provider: "meta_cloud",
      wa_instance_url: GRAPH_BASE_URL,
      wa_status: "configurado",
      wa_business_account_id: wabaId,
      wa_phone_number_id: phoneNumberId,
      wa_display_phone_number: trimOrNull(statusPayload?.display_phone_number),
      wa_graph_version: graphVersion,
      wa_app_id: appId,
      wa_embedded_signup_config_id: configurationId,
      wa_account_currency: "BRL",
      wa_quality_rating: trimOrNull(statusPayload?.quality_rating),
      wa_enabled: true,
      wa_last_health_check_at: new Date().toISOString(),
    }, { onConflict: "tipo" });
  if (error) throw error;
};
