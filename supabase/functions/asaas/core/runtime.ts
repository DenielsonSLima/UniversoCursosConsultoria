export type Environment = "sandbox" | "production";

export interface AsaasRuntime {
  config?: any;
  apiKey: string;
  environment: Environment;
  baseUrl: string;
}

export const normalizeEnvironment = (value: unknown): Environment =>
  value === "production" ? "production" : "sandbox";

export const apiSecretName = (environment: Environment) =>
  environment === "production" ? "asaas_production_api_key" : "asaas_sandbox_api_key";

export const webhookSecretName = (environment: Environment) =>
  environment === "production" ? "asaas_production_webhook_token" : "asaas_sandbox_webhook_token";

export const baseUrlFor = (environment: Environment) =>
  environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
