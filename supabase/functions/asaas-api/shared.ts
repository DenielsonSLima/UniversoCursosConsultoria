export {
  buildCorsHeaders,
  corsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
  UUID_RE,
} from "../_shared/http.ts";

export type { Environment } from "../asaas/core/runtime.ts";
export { ONLINE_MODALIDADES } from "../asaas/core/modality.ts";
export {
  apiSecretName,
  baseUrlFor,
  normalizeEnvironment,
  webhookSecretName,
} from "../asaas/core/runtime.ts";
export { isValidCpf } from "../asaas/core/customer.ts";

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;
