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

const ASAAS_FILE_HOSTS = new Set([
  "api.asaas.com",
  "api-sandbox.asaas.com",
  "www.asaas.com",
  "sandbox.asaas.com",
]);

const assertAsaasFileUrl = (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL do boleto oficial Asaas inválida.");
  }

  if (parsed.protocol !== "https:" || !ASAAS_FILE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("URL do boleto oficial fora dos domínios permitidos do Asaas.");
  }

  return parsed.toString();
};

export const fetchAsaasFile = async (
  runtime: AsaasRuntime,
  url: string,
) => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const safeUrl = assertAsaasFileUrl(url);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(safeUrl, {
      redirect: "manual",
      headers: {
        "User-Agent": "Universo-Cursos-Gestao",
        access_token: runtime.apiKey,
      },
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error("O Asaas redirecionou o boleto oficial. Gere o carnê novamente para obter uma URL direta válida.");
    }

    if (response.ok) {
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > 15 * 1024 * 1024) {
        throw new Error("Boleto oficial Asaas acima do tamanho permitido.");
      }
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType && !contentType.includes("pdf") && !contentType.includes("octet-stream")) {
        throw new Error("O arquivo retornado pelo Asaas não parece ser um PDF oficial.");
      }
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
