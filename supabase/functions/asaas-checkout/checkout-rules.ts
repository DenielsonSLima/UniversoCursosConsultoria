import {
  buildCoursePaymentDescription,
  buildOnlinePaymentPayload,
  normalizeCourseFinanceiroConfig,
  resolveBillingType,
} from "../asaas/core/checkout.ts";
import { mapBillingType } from "../asaas/core/status.ts";
import { resolveEadCheckoutCharge } from "../asaas/ead/checkout.ts";
import { resolveEspecializacaoCheckoutCharge } from "../asaas/especializacao/checkout.ts";
import { resolveLivreCheckoutCharge } from "../asaas/livres/checkout.ts";
import { resolveTecnicoInitialEnrollmentCharge } from "../asaas/tecnico/checkout.ts";

export {
  buildCoursePaymentDescription,
  buildOnlinePaymentPayload,
  mapBillingType,
  normalizeCourseFinanceiroConfig,
  resolveBillingType,
};

export const resolveOnlineCharge = (course: any, turma: any, dueDate: string) => {
  const modalidade = String(course?.modalidade || "").toUpperCase();
  if (modalidade === "EAD") return resolveEadCheckoutCharge(course, turma, dueDate);
  if (modalidade === "LIVRE") return resolveLivreCheckoutCharge(course, turma, dueDate);
  if (modalidade === "ESPECIALIZACAO") return resolveEspecializacaoCheckoutCharge(course, turma, dueDate);
  if (modalidade === "TECNICO") return resolveTecnicoInitialEnrollmentCharge(course, turma, dueDate);
  throw new Error("Modalidade sem regra de checkout Asaas.");
};
