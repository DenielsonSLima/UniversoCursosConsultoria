import { callAsaas } from "../asaas/core/http.ts";
import { baseUrlFor } from "../asaas/core/runtime.ts";
import type { AsaasRuntime } from "../asaas/core/runtime.ts";

export type AsaasWebhookRuntime = AsaasRuntime;
export { baseUrlFor };

export const createCallAsaas = (runtime: AsaasWebhookRuntime) => async (
  path: string,
  init: RequestInit = {},
) => callAsaas(runtime, path, init, "Universo-Cursos-Webhook");
