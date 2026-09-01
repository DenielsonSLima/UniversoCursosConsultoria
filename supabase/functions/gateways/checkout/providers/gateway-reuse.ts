import {
  type GatewayProviderCode,
  repairGatewayTransactionFromReceivable,
} from "../../router.ts";
import {
  hasRepairableOnlineInscriptionIdentity,
  repairOnlineInscription,
} from "../../online-inscription.ts";
import type { EadCheckoutContext } from "../types.ts";
import { paymentMethodForLegacyField } from "../utils.ts";
import { revalidateGatewayCheckoutReceivable } from "./gateway-receivable.ts";
import { shouldReuseReceivable } from "./gateway-view.ts";
import { recoverMissingEadBanesePix } from "../../ead-banese-pix-recovery.ts";

export const repairCheckoutInscricao = async (
  context: EadCheckoutContext,
  receivable: any,
  requireGatewayTransaction = false,
) => {
  if (!hasRepairableOnlineInscriptionIdentity(receivable)) return null;
  return await repairOnlineInscription({
    admin: context.admin,
    receivable,
    legacyPaymentMethod: paymentMethodForLegacyField(
      receivable.gateway_payment_method || context.charge.method,
    ),
    academic: {
      course: context.course,
      turma: context.turma,
      aluno: context.aluno,
      matricula: context.matricula,
    },
    requireGatewayTransaction,
  });
};

export const repairAndRevalidateGatewayReuse = async (
  context: EadCheckoutContext,
  receivable: any,
  providerCode: GatewayProviderCode,
  dependencies: {
    repairGatewayTransaction: (admin: any, receivable: any) => Promise<unknown>;
    repairInscricao: (
      context: EadCheckoutContext,
      receivable: any,
      requireGatewayTransaction: boolean,
    ) => Promise<unknown>;
    recoverEadBanesePix?: typeof recoverMissingEadBanesePix;
  } = {
    repairGatewayTransaction: repairGatewayTransactionFromReceivable,
    repairInscricao: repairCheckoutInscricao,
  },
) => {
  const revalidate = () =>
    revalidateGatewayCheckoutReceivable({
      admin: context.admin,
      matriculaId: context.matricula.id,
      receivableId: String(receivable.id),
      expectation: {
        alunoId: context.aluno.id,
        turmaId: context.turma.id,
        value: context.charge.value,
        dueDate: context.charge.dueDate,
        description: context.charge.description,
      },
      canReuse: (current) =>
        shouldReuseReceivable(current, context, providerCode),
    });

  let validatedReceivable = await revalidate();
  await dependencies.repairGatewayTransaction(
    context.admin,
    validatedReceivable,
  );
  validatedReceivable = await revalidate();
  if (
    providerCode === "banese_card" &&
    context.charge.method === "BOLETO" &&
    String(context.course?.modalidade ?? "").trim().toUpperCase() === "EAD"
  ) {
    const recovery = await (dependencies.recoverEadBanesePix ??
      recoverMissingEadBanesePix)(context.admin, {
        courseModality: context.course.modalidade,
        receivable: validatedReceivable,
      });
    if (recovery.refreshRecommended) validatedReceivable = await revalidate();
  }
  await dependencies.repairInscricao(context, validatedReceivable, true);
  return await revalidate();
};
