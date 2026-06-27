import type { Environment } from "./shared.ts";

export interface AsaasRuntime {
  config: any;
  apiKey: string;
  environment: Environment;
  baseUrl: string;
}

export const callAsaas = async (
  runtime: AsaasRuntime,
  path: string,
  init: RequestInit = {},
) => {
  const response = await fetch(`${runtime.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Universo-Cursos-Gestao",
      access_token: runtime.apiKey,
      ...(init.headers || {}),
    },
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.errors?.map((item: any) => item.description).join(" ")
      || payload?.message
      || `Erro ${response.status} na API do Asaas.`;
    throw new Error(message);
  }

  return payload;
};

export const fetchAsaasFile = async (
  runtime: AsaasRuntime,
  url: string,
) => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Universo-Cursos-Gestao",
        access_token: runtime.apiKey,
      },
    });

    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1500 * (attempt + 1);
      await response.text().catch(() => "");
      await sleep(delay);
      continue;
    }

    if (response.status === 429) {
      throw new Error("O Asaas limitou temporariamente o download dos boletos oficiais. Tente novamente em alguns instantes ou gere o carnê em lotes menores.");
    }

    throw new Error(`Não foi possível baixar o boleto oficial do Asaas (${response.status}).`);
  }

  throw new Error("Não foi possível baixar o boleto oficial do Asaas.");
};
