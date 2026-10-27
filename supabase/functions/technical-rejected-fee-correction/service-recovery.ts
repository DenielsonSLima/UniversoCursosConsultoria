import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { queryBaneseBoleto } from "../banese/core/adapter.ts";
import { documentForGateway } from "../gateways/checkout/utils.ts";
import type { GatewayChargeResult } from "../gateways/router.ts";
import type { LoadedReceivable } from "../technical-manual-cycle-issuance/receivable-state.ts";
import type { IssuanceScope } from "../technical-manual-cycle-issuance/receivable-issuance.ts";
import { record } from "./contract.ts";
export const recoverServiceFeeExactTitle = async (input: {
  admin: SupabaseClient;
  loaded: LoadedReceivable;
  scope: IssuanceScope; strictEffectivePayments?: boolean;
}): Promise<GatewayChargeResult> => {
  const receivable = input.loaded.receivable;
  const { data: credential, error: credentialError } = await input.admin
    .from("payment_gateway_credentials").select("metadata")
    .eq("id", input.scope.credentialId).eq("provider_code", "banese_card")
    .eq("environment", "production").maybeSingle();
  if (credentialError) throw credentialError;
  const metadata = record(credential?.metadata);
  const receivableId = String(receivable.id || "");
  const snapshot = await queryBaneseBoleto(
    input.admin as unknown as Parameters<typeof queryBaneseBoleto>[0],
    "production",
    {
      convenio: receivable.gateway_boleto_convenio ||
        metadata.baneseBoletoConvenio || metadata.baneseConvenio,
      nossoNumero: receivable.gateway_boleto_nosso_numero,
      recoverPix: true,
      validateTitleIdentity: true, strictEffectivePayments: input.strictEffectivePayments === true,
      expectedAmount: receivable.valor,
      expectedDueDate: String(receivable.data_vencimento || "").slice(0, 10),
      expectedAgency: receivable.gateway_boleto_agencia ||
        metadata.baneseAgencia,
      expectedAccount: metadata.baneseConta || metadata.baneseContaDisplay,
      expectedDocumentNumber: receivableId.slice(0, 15),
      expectedCompanyTitleId: receivableId.slice(0, 25),
      expectedPayerDocument: documentForGateway(input.loaded.payer.cpf_cnpj),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (
    snapshot.paid || snapshot.payments.length > 0 || snapshot.paymentsError ||
    snapshot.financialTermsError || !snapshot.financialTerms ||
    !snapshot.pixPayload || !snapshot.pixEncodedImage ||
    snapshot.remoteStatus !== "PENDING"
  ) {
    throw new Error(
      "A consulta oficial não confirmou um BolePix aberto e completo.",
    );
  }
  const raw = record(snapshot.raw);
  return {
    providerCode: "banese_card",
    remotePaymentId: snapshot.nossoNumero,
    remotePaymentLinkId: null,
    remoteCustomerId: null,
    remoteStatus: snapshot.remoteStatus,
    invoiceUrl: null,
    bankSlipUrl: null,
    pixPayload: snapshot.pixPayload,
    pixEncodedImage: snapshot.pixEncodedImage,
    bankSlipDigitableLine: String(
      raw.NumeroLinhaDigitavel || raw.numeroLinhaDigitavel || "",
    ),
    bankSlipBarcode: String(
      raw.NumeroCodigoBarras || raw.numeroCodigoBarras || "",
    ),
    bankSlipOurNumber: snapshot.nossoNumero,
    issuerPoloId: input.scope.issuerPoloId,
    financialTerms: snapshot.financialTerms,
    rawPayload: {
      recoveryMode: "BANESE_EXACT_GET_ONLY",
      request: {
        receivableId,
        nossoNumero: snapshot.nossoNumero,
        expectedAmount: receivable.valor,
        expectedDueDate: String(receivable.data_vencimento || "").slice(0, 10),
      },
      response: raw,
      payments: snapshot.payments,
    },
  };
};
