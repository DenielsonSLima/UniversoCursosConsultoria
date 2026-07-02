import type { AsaasRuntime } from "./runtime.ts";

export const callAsaas = async (
  runtime: AsaasRuntime,
  path: string,
  init: RequestInit = {},
  userAgent = "Universo-Cursos-Gestao",
) => {
  const response = await fetch(`${runtime.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": userAgent,
      access_token: runtime.apiKey,
      ...(init.headers || {}),
    },
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.errors?.map((item: any) => item.description).join(" ")
      || payload?.errors?.[0]?.description
      || payload?.message
      || `Erro ${response.status} na API do Asaas.`;
    throw new Error(message);
  }

  return payload;
};
