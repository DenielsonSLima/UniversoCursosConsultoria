import { mapBillingType } from "./checkout-rules.ts";
import type { CheckoutContext } from "./checkout-context.ts";
import { normalizeErrorMessage, resolveCheckoutUrl } from "./checkout-utils.ts";
import {
  type GatewayProviderCode,
  repairGatewayTransactionFromReceivable,
} from "../router.ts";
import {
  boletoIssuedAtAfterReset,
  isRemoteTitleNonPayable,
} from "../checkout/remote-title-guard.ts";
import {
  isGatewayReceivableLocallyPayable,
  revalidateGatewayCheckoutReceivable,
} from "../checkout/providers/gateway-receivable.ts";
import {
  hasRepairableOnlineInscriptionIdentity,
  repairOnlineInscription,
} from "../online-inscription.ts";

export const markRemotePaymentCreated = (error: unknown) => {
  const marked = error && typeof error === "object"
    ? error
    : new Error(String(normalizeErrorMessage(error)));
  (marked as unknown as Record<string, unknown>).remotePaymentCreated = true;
  return marked;
};

export const repairCheckoutInscricao = async (
  context: CheckoutContext,
  receivable: any,
  requireGatewayTransaction = false,
) => {
  if (!hasRepairableOnlineInscriptionIdentity(receivable)) return null;
  return await repairOnlineInscription({
    admin: context.admin,
    receivable,
    legacyPaymentMethod: mapBillingType(
      receivable.gateway_payment_method ||
        context.gatewayPaymentMethodForCharge,
    ),
    academic: {
      course: context.course,
      turma: context.turma,
      aluno: context.aluno,
      matricula: context.matricula,
      technicalSchoolSnapshot: context.technicalSchoolSnapshot,
    },
    requireGatewayTransaction,
  });
};

export const shouldReuseProviderReceivable = (
  receivable: any,
  context: CheckoutContext,
  providerCode: GatewayProviderCode,
) =>
  Boolean(
    isGatewayReceivableLocallyPayable(receivable) &&
      receivable.gateway_provider === providerCode &&
      receivable.gateway_payment_method ===
        context.gatewayPaymentMethodForCharge &&
      receivable.gateway_environment === context.environment &&
      Number(receivable.gateway_installments || 1) ===
        Number(context.charge.installmentCount || 1) &&
      Math.round(Number(receivable.valor || 0) * 100) ===
        Math.round(Number(context.charge.value || 0) * 100) &&
      String(receivable.data_vencimento || "").slice(0, 10) ===
        String(context.dataVencimento || "").slice(0, 10) &&
      !isRemoteTitleNonPayable(receivable) &&
      (
        providerCode !== "mercado_pago" ||
        context.gatewayPaymentMethodForCharge !== "PIX" ||
        Boolean(
          receivable.gateway_pix_payload ||
            receivable.gateway_pix_encoded_image,
        )
      ) &&
      resolveCheckoutUrl(receivable),
  );

export const repairAndRevalidateProviderReuse = async (
  context: CheckoutContext,
  receivable: any,
  providerCode: GatewayProviderCode,
  dependencies: {
    repairGatewayTransaction: (admin: any, receivable: any) => Promise<unknown>;
    repairInscricao: (
      context: CheckoutContext,
      receivable: any,
      requireGatewayTransaction: boolean,
    ) => Promise<unknown>;
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
        dueDate: context.dataVencimento,
        description: context.charge.description,
      },
      canReuse: (current) =>
        shouldReuseProviderReceivable(current, context, providerCode),
    });

  let validatedReceivable = await revalidate();
  await dependencies.repairGatewayTransaction(
    context.admin,
    validatedReceivable,
  );
  validatedReceivable = await revalidate();
  await dependencies.repairInscricao(context, validatedReceivable, true);
  return await revalidate();
};

export const shouldPreserveReservedBaneseNumber = (
  receivable: any,
  context: CheckoutContext,
  providerCode: GatewayProviderCode,
) =>
  Boolean(
    isGatewayReceivableLocallyPayable(receivable) &&
      receivable?.gateway_provider === "banese_card" &&
      providerCode === "banese_card" &&
      receivable?.gateway_environment === context.environment &&
      receivable?.gateway_payment_method === "BOLETO" &&
      context.gatewayPaymentMethodForCharge === "BOLETO" &&
      Number(receivable?.gateway_installments || 1) ===
        Number(context.charge.installmentCount || 1) &&
      Math.round(Number(receivable?.valor || 0) * 100) ===
        Math.round(Number(context.charge.value || 0) * 100) &&
      String(receivable?.data_vencimento || "").slice(0, 10) ===
        String(context.dataVencimento || "").slice(0, 10) &&
      !isRemoteTitleNonPayable(receivable) &&
      receivable?.gateway_boleto_nosso_numero,
  );

export const buildStaleGatewayFields = (
  receivable: any,
  preserveReservedBaneseNumber: boolean,
) =>
  receivable?.id
    ? {
      asaas_payment_id: null,
      asaas_payment_link_id: null,
      nosso_numero_asaas: null,
      asaas_invoice_url: null,
      asaas_bank_slip_url: null,
      asaas_installment_id: null,
      asaas_transaction_receipt_url: null,
      asaas_status: null,
      asaas_synced_at: null,
      asaas_last_error: null,
      gateway_payment_id: null,
      gateway_customer_id: null,
      gateway_payment_link_id: null,
      gateway_installment_id: null,
      gateway_invoice_url: null,
      gateway_bank_slip_url: null,
      gateway_pix_payload: null,
      gateway_pix_encoded_image: null,
      gateway_boleto_linha_digitavel: preserveReservedBaneseNumber
        ? receivable.gateway_boleto_linha_digitavel || null
        : null,
      gateway_boleto_codigo_barras: preserveReservedBaneseNumber
        ? receivable.gateway_boleto_codigo_barras || null
        : null,
      gateway_boleto_nosso_numero: preserveReservedBaneseNumber
        ? receivable.gateway_boleto_nosso_numero
        : null,
      gateway_boleto_issued_at: boletoIssuedAtAfterReset(
        receivable,
        preserveReservedBaneseNumber,
      ),
      gateway_financial_terms: preserveReservedBaneseNumber
        ? receivable.gateway_financial_terms || null
        : null,
      gateway_financial_terms_confirmed_at: preserveReservedBaneseNumber
        ? receivable.gateway_financial_terms_confirmed_at || null
        : null,
      gateway_transaction_receipt_url: null,
      gateway_synced_at: null,
    }
    : {};
