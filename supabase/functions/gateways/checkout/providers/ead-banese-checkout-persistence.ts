import type { GatewayChargeResult } from "../../router.ts";
import {
  loadBaneseExpectedTransactions,
  persistBaneseReconciliationSnapshot,
} from "../../api/banese-reconciliation-persistence.ts";
import type { EadCheckoutContext } from "../types.ts";

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export const isEadBaneseBoletoCheckout = (
  context: Pick<EadCheckoutContext, "course" | "charge" | "route">,
) =>
  String(context.course?.modalidade ?? "").trim().toUpperCase() === "EAD" &&
  context.route.providerCode === "banese_card" &&
  context.charge.method === "BOLETO";

export const persistEadBaneseCheckoutResult = async (
  context: EadCheckoutContext,
  receivable: Record<string, any>,
  result: GatewayChargeResult,
  dependencies = {
    loadExpectedTransactions: loadBaneseExpectedTransactions,
    persistSnapshot: persistBaneseReconciliationSnapshot,
  },
) => {
  if (!isEadBaneseBoletoCheckout(context)) {
    throw new Error(
      "Persistencia atomica BolePix de checkout aceita somente cobranca EAD Banese.",
    );
  }

  const nossoNumero = digits(result.bankSlipOurNumber);
  const digitableLine = digits(result.bankSlipDigitableLine);
  const barcode = digits(result.bankSlipBarcode);
  const convenio = digits(receivable.gateway_boleto_convenio);
  const financialTerms = result.financialTerms ||
    receivable.gateway_financial_terms;
  if (
    nossoNumero.length !== 9 || digitableLine.length !== 47 ||
    barcode.length !== 44 || !convenio || !financialTerms
  ) {
    throw new Error(
      "Resultado BolePix EAD incompleto para persistencia atomica.",
    );
  }

  const expectedTransactions = await dependencies.loadExpectedTransactions(
    context.admin,
    {
      receivableId: String(receivable.id),
      environment: context.environment,
    },
  );
  const updated = await dependencies.persistSnapshot(context.admin, {
    receivable,
    environment: context.environment,
    convenio,
    nossoNumero,
    remoteStatus: result.remoteStatus || "PENDING",
    financialTerms,
    confirmApiSubmission: true,
    remotePaid: false,
    postSettlementRequired: false,
    shouldSettle: false,
    paymentTotal: 0,
    paymentDate: null,
    settlementMethod: "NAO_IDENTIFICADO",
    pixPayload: result.pixPayload || "",
    pixEncodedImage: result.pixEncodedImage || "",
    bankNumbers: { digitableLine, barcode },
    snapshot: {
      raw: result.rawPayload || {},
      payments: [],
      pixPayload: result.pixPayload || null,
    },
    expectedTransactions,
  });

  // URL e emissor sao projecoes acessorias. O núcleo bancario e a transacao
  // canonica ja foram confirmados juntos pelo RPC acima; uma falha aqui deixa
  // o titulo recuperavel, nunca um Pix orfao no recebivel.
  const projectionUpdatedAt = new Date().toISOString();
  const { data, error } = await context.admin.from("contas_receber").update({
    gateway_issuer_polo_id: result.issuerPoloId,
    gateway_installments: context.charge.installmentCount,
    gateway_customer_id: result.remoteCustomerId,
    gateway_payment_link_id: result.remotePaymentLinkId,
    gateway_invoice_url: result.invoiceUrl,
    gateway_bank_slip_url: result.bankSlipUrl,
    gateway_transaction_receipt_url:
      (result.rawPayload as any)?.transactionReceiptUrl || null,
    updated_at: projectionUpdatedAt,
  }).eq("id", updated.id).eq("updated_at", updated.updated_at).select()
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "Cobranca EAD mudou antes de persistir as projecoes do boleto Banese.",
    );
  }
  return data;
};
