export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export type Environment = "sandbox" | "production";

export const ONLINE_MODALIDADES = ["EAD", "LIVRE", "ESPECIALIZACAO", "TECNICO"];
export const PENDENTE_INSCRICAO_STATUS = "AGUARDANDO_PAGAMENTO";

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export const mapBillingType = (billingType?: string | null) => {
  if (billingType === "CREDIT_CARD") return "CARTAO";
  if (billingType === "PIX") return "PIX";
  if (billingType === "BOLETO") return "BOLETO";
  return null;
};

export const paymentDate = (payment: any) =>
  String(payment.paymentDate || payment.clientPaymentDate || payment.confirmedDate || new Date().toISOString()).slice(0, 10);

export const isPaymentConfirmedEvent = (eventType: string, payment: any) =>
  ["CONFIRMED", "RECEIVED"].includes(String(payment?.status || "").toUpperCase())
  || ((eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") && !payment?.status);

export const localStatusForPaymentEvent = (
  eventType: string,
  isPaymentConfirmed: boolean,
) =>
  eventType === "PAYMENT_OVERDUE" ? "VENCIDO"
  : eventType === "PAYMENT_DELETED" ? "CANCELADO"
  : eventType === "PAYMENT_RECEIVED" ? (isPaymentConfirmed ? "PAGO" : "AGUARDANDO_CONFIRMACAO")
  : eventType === "PAYMENT_CONFIRMED" ? (isPaymentConfirmed ? "PAGO" : "AGUARDANDO_CONFIRMACAO")
  : null;
