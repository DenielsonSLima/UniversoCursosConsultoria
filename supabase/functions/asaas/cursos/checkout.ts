import {
  buildCoursePaymentDescription,
  buildOnlinePaymentPayload,
  normalizeCourseFinanceiroConfig,
  resolveBillingType,
} from "../core/checkout.ts";
import { mapBillingType } from "../core/status.ts";
import { resolveEadCheckoutCharge } from "../ead/checkout.ts";
import { resolveEspecializacaoCheckoutCharge } from "../especializacao/checkout.ts";
import { resolveLivreCheckoutCharge } from "../livres/checkout.ts";
import { resolveTecnicoInitialEnrollmentCharge } from "../tecnico/checkout.ts";
import type { CoursePaymentRequest } from "../core/payment-methods.ts";

export {
  buildCoursePaymentDescription,
  buildOnlinePaymentPayload,
  mapBillingType,
  normalizeCourseFinanceiroConfig,
  resolveBillingType,
};

export const resolveOnlineCharge = (
  course: any,
  turma: any,
  dueDate: string,
  options: {
    payment?: CoursePaymentRequest;
    eadPayment?: { method?: unknown; installments?: unknown };
    matricula?: any;
  } = {},
) => {
  const modalidade = String(course?.modalidade || "").toUpperCase();
  if (modalidade === "EAD") {
    return resolveEadCheckoutCharge(course, turma, dueDate, options.eadPayment);
  }
  if (modalidade === "LIVRE") {
    return resolveLivreCheckoutCharge(
      course,
      turma,
      dueDate,
      options.payment,
      options.matricula,
    );
  }
  if (modalidade === "ESPECIALIZACAO") {
    return resolveEspecializacaoCheckoutCharge(
      course,
      turma,
      dueDate,
      options.payment,
      options.matricula,
    );
  }
  if (modalidade === "TECNICO") {
    return resolveTecnicoInitialEnrollmentCharge(
      course,
      turma,
      dueDate,
      options.payment,
      options.matricula,
    );
  }
  throw new Error("Modalidade sem regra de checkout Asaas.");
};
