export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type { Environment } from "../asaas/core/runtime.ts";
export {
  apiSecretName,
  baseUrlFor,
  normalizeEnvironment,
  webhookSecretName,
} from "../asaas/core/runtime.ts";
export { isValidCpf } from "../asaas/core/customer.ts";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export const ONLINE_MODALIDADES = ["EAD", "LIVRE", "ESPECIALIZACAO", "TECNICO"];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
