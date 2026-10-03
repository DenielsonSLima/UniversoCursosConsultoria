import { ActivationError, type ActivationDependencies, type ActivationRequest,
  parseActivationRequest, UUID_RE } from "./contract.ts";
import { activationFailure, runActivation } from "./orchestrator.ts";

export type ActivationHandlerDependencies = {
  authorize: (request: Request, activation: ActivationRequest) => Promise<{ operationId: string }>;
  privileged: (authorized: { operationId: string }) => ActivationDependencies;
  headers?: (request: Request) => ConstructorParameters<typeof Headers>[0];
};

const response = (request: Request, dependencies: ActivationHandlerDependencies,
  body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: {
    ...Object.fromEntries(new Headers(dependencies.headers?.(request))),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  },
});

export const createActivationHandler = (dependencies: ActivationHandlerDependencies) =>
async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return response(request, dependencies, { ok: true }, 200);
  if (request.method !== "POST") return response(request, dependencies, { error: "Método não permitido." }, 405);
  try {
    if (!/^Bearer\s+\S+$/i.test(request.headers.get("Authorization") || "")) {
      throw new ActivationError("AUTHENTICATION_REQUIRED", "Autenticação obrigatória.", false, 401);
    }
    if (Number(request.headers.get("Content-Length") || 0) > 4096) {
      throw new ActivationError("INVALID_REQUEST", "Requisição inválida.", false, 400);
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 4096) {
      throw new ActivationError("INVALID_REQUEST", "Requisição inválida.", false, 400);
    }
    let value: unknown;
    try { value = JSON.parse(text); } catch {
      throw new ActivationError("INVALID_REQUEST", "JSON inválido.", false, 400);
    }
    const activation = parseActivationRequest(value);
    // No privileged client or bank dependency is initialized before auth + RBAC/polo/start CAS.
    const authorized = await dependencies.authorize(request, activation);
    if (!UUID_RE.test(authorized.operationId)) {
      throw new ActivationError("START_NOT_CONFIRMED", "A operação não foi confirmada pelo servidor.");
    }
    const executor = dependencies.privileged(authorized);
    const result = await runActivation(activation, { ...executor, start: async () => authorized });
    return response(request, dependencies, result,
      result.success ? 200 : result.retryable ? 202 : 409);
  } catch (cause) {
    const error = activationFailure(cause);
    return response(request, dependencies, { error: error.message, code: error.code }, error.status);
  }
};
