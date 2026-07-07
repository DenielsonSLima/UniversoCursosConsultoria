export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export type { Environment } from "../core/runtime.ts";
export { ONLINE_MODALIDADES } from "../core/modality.ts";

export const PENDENTE_INSCRICAO_STATUS = "AGUARDANDO_PAGAMENTO";

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export {
  isPaymentConfirmedEvent,
  localStatusForPaymentEvent,
  mapBillingType,
  paymentDate,
} from "./events.ts";
