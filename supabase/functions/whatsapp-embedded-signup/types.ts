import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AdminClient = SupabaseClient;

export interface EmbeddedSignupBody {
  code?: unknown;
  mode?: unknown;
  appId?: unknown;
  appSecret?: unknown;
  graphVersion?: unknown;
  configurationId?: unknown;
  sessionEvent?: unknown;
}

export interface CurrentWhatsAppConfig {
  wa_app_id?: string | null;
  wa_embedded_signup_config_id?: string | null;
  wa_graph_version?: string | null;
}

export type PhoneNumberStatus = Record<string, unknown> & {
  id?: string | null;
  is_on_biz_app?: boolean;
  platform_type?: string | null;
  display_phone_number?: string | null;
  quality_rating?: string | null;
  verified_name?: string | null;
};

export interface SyncRequestResult {
  syncType: string;
  requestId: string | null;
}
