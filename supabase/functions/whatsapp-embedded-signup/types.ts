import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AdminClient = SupabaseClient;

export interface EmbeddedSignupBody {
  connectionId?: unknown;
  code?: unknown;
  mode?: unknown;
  appId?: unknown;
  appSecret?: unknown;
  verifyToken?: unknown;
  graphVersion?: unknown;
  configurationId?: unknown;
  sessionEvent?: unknown;
}

export interface CurrentWhatsAppConnection {
  id: string;
  nome?: string | null;
  app_id?: string | null;
  embedded_signup_config_id?: string | null;
  graph_version?: string | null;
  is_matriz_financeira?: boolean;
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
