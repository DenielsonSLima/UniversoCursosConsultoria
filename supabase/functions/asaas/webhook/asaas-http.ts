import { callAsaas } from "../core/http.ts";
import { baseUrlFor } from "../core/runtime.ts";
import type { AsaasRuntime } from "../core/runtime.ts";

export type AsaasWebhookRuntime = AsaasRuntime;
export { baseUrlFor };

export const createCallAsaas = (runtime: AsaasWebhookRuntime) =>
async (
  path: string,
  init: RequestInit = {},
) => callAsaas(runtime, path, init, "Universo-Cursos-Webhook");
