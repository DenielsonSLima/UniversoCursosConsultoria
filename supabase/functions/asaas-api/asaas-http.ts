import { callAsaas as callAsaasCore } from "../asaas/core/http.ts";
import type { AsaasRuntime } from "../asaas/core/runtime.ts";

export type { AsaasRuntime } from "../asaas/core/runtime.ts";

export const callAsaas = (runtime: AsaasRuntime, path: string, init: RequestInit = {}) =>
  callAsaasCore(runtime, path, init, "Universo-Cursos-Gestao");

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
