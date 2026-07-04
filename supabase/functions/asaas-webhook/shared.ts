export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export type { Environment } from "../asaas/core/runtime.ts";
export { ONLINE_MODALIDADES } from "../asaas/core/modality.ts";

export const PENDENTE_INSCRICAO_STATUS = "AGUARDANDO_PAGAMENTO";

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export {
  isPaymentConfirmedEvent,
  localStatusForPaymentEvent,
  mapBillingType,
  paymentDate,
} from "../asaas/webhook/events.ts";
