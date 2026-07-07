export type GatewayEnvironment = "sandbox" | "production";
export type GatewayProviderCode = "mercado_pago" | "banese_card";

export type GatewayWebhookContext = {
  admin: any;
  supabaseUrl: string;
  providerCode: GatewayProviderCode;
  environment: GatewayEnvironment;
  eventId: string;
  payload: any;
  remotePaymentId: string | null;
};
