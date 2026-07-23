import type { AsaasRuntime } from "./runtime.ts";

export class AsaasHttpError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "AsaasHttpError";
    this.status = status;
    this.payload = payload;
  }
}

export const isCanonicalAsaasPostRejection = (error: unknown) =>
  error instanceof AsaasHttpError &&
  error.status >= 400 &&
  error.status < 500 &&
  ![408, 409, 425, 429].includes(error.status);

export const shouldKeepAsaasCreationLock = (
  postAttempted: boolean,
  error: unknown,
) => postAttempted && !isCanonicalAsaasPostRejection(error);

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

  const payload = response.status === 204
    ? null
    : await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.errors?.map((item: any) =>
      item.description
    ).join(" ") ||
      payload?.errors?.[0]?.description ||
      payload?.message ||
      `Erro ${response.status} na API do Asaas.`;
    throw new AsaasHttpError(message, response.status, payload);
  }

  return payload;
};
