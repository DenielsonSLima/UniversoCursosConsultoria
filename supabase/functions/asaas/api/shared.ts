export {
  buildCorsHeaders,
  corsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
  UUID_RE,
} from "../../_shared/http.ts";

export type { Environment } from "../core/runtime.ts";
export { ONLINE_MODALIDADES } from "../core/modality.ts";
export {
  apiSecretName,
  baseUrlFor,
  normalizeEnvironment,
  webhookSecretName,
} from "../core/runtime.ts";
export { isValidCpf } from "../core/customer.ts";

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;
