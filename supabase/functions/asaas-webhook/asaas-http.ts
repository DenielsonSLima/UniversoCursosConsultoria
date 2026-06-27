import type { Environment } from "./shared.ts";

export interface AsaasWebhookRuntime {
  apiKey: string;
  environment: Environment;
  baseUrl: string;
}

export const baseUrlFor = (environment: Environment) =>
  environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

export const createCallAsaas = (runtime: AsaasWebhookRuntime) => async (
  path: string,
  init: RequestInit = {},
) => {
  const response = await fetch(`${runtime.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Universo-Cursos-Webhook",
      access_token: runtime.apiKey,
      ...(init.headers || {}),
    },
  });

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.errors?.[0]?.description || `Erro ${response.status} no Asaas.`);
  return data;
};
