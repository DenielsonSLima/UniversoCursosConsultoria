import { createGatewayCharge, type GatewayChargeResult } from "../gateways/router.ts";
import { queryBaneseBoleto } from "../banese/core/adapter.ts";
import { buildBaneseBoletoPayload } from "../banese/core/adapter/boleto-payload.ts";
import { canonicalTerms, type Admin, type Material, record } from "./contract.ts";
import type { BaneseCreationEvidence } from "../banese/core/adapter/creation-evidence.ts";
import { preserveServiceCreationEvidence } from "./creation-evidence.ts";

const chargeInput = (admin: Admin, supabaseUrl: string, material: Material) => {
  const c = material.receivable;
  return {
    admin, supabaseUrl, providerCode: "banese_card" as const, credentialId: material.credentialId,
    environment: "production" as const, paymentMethod: "BOLETO" as const, receivable: c,
    payer: material.payer, amount: Number(c.valor), description: String(c.descricao),
    dueDate: String(c.data_vencimento).slice(0, 10), installments: 1,
    financialTerms: canonicalTerms(c), allowPendingBolePix: true,
    onCreationEvidence: async (evidence: BaneseCreationEvidence) => {
      await preserveServiceCreationEvidence(admin, material.jobId, c.gateway_creation_token, evidence);
    },
  };
};
/** Only this first-issue branch calls the shared reserve/preflight/atomic POST marker adapter. */
export const createServiceBolepix = (admin: Admin, supabaseUrl: string, material: Material) =>
  createGatewayCharge(chargeInput(admin, supabaseUrl, material));

/** Ambiguous or registered titles are exclusively queried using their original bank identity. */
export const recoverServiceBolepix = async (admin: Admin, supabaseUrl: string, material: Material,
  query: typeof queryBaneseBoleto = queryBaneseBoleto): Promise<GatewayChargeResult> => {
  const c = material.receivable, metadata = material.metadata;
  const number = String(c.gateway_boleto_nosso_numero || "");
  const snapshot = await query(admin as Parameters<typeof queryBaneseBoleto>[0], "production", {
    convenio: c.gateway_boleto_convenio || metadata.baneseBoletoConvenio || metadata.baneseConvenio,
    nossoNumero: number, recoverPix: true, validateTitleIdentity: true, strictEffectivePayments: true,
    expectedAmount: c.valor, expectedDueDate: String(c.data_vencimento).slice(0, 10),
    expectedAgency: c.gateway_boleto_agencia || metadata.baneseAgencia,
    expectedAccount: metadata.baneseConta || metadata.baneseContaDisplay,
    expectedDocumentNumber: String(c.id).slice(0, 15), expectedCompanyTitleId: String(c.id).slice(0, 25),
    expectedPayerDocument: material.payer.cpf_cnpj, signal: AbortSignal.timeout(8_000),
  });
  if (snapshot.paymentsError) throw snapshot.paymentsError;
  if (snapshot.financialTermsError) throw new Error("INVALID_EVIDENCE");
  if (!snapshot.paid && !snapshot.payments.length && ["REGISTERING","PROCESSING"].includes(snapshot.remoteStatus)) throw new Error("TRANSPORT");
  if (snapshot.paid || snapshot.payments.length || snapshot.remoteStatus !== "PENDING" || !snapshot.financialTerms) throw new Error("INVALID_EVIDENCE");
  const raw = record(snapshot.raw);
  const request = buildBaneseBoletoPayload({ ...chargeInput(admin, supabaseUrl, material),
    admin: { rpc: async (name, args) => await admin.rpc(name, args) }, receivable: {
    ...c, metadata: { ...metadata, baneseNossoNumero: number, baneseAgencia: c.gateway_boleto_agencia || metadata.baneseAgencia },
  } });
  return {
    providerCode: "banese_card", remotePaymentId: number, remotePaymentLinkId: null, remoteCustomerId: null,
    remoteStatus: snapshot.remoteStatus, invoiceUrl: null, bankSlipUrl: null,
    bankSlipOurNumber: number, bankSlipDigitableLine: String(raw.NumeroLinhaDigitavel || raw.numeroLinhaDigitavel || ""),
    bankSlipBarcode: String(raw.NumeroCodigoBarras || raw.numeroCodigoBarras || ""),
    pixPayload: snapshot.pixPayload, pixEncodedImage: snapshot.pixEncodedImage,
    financialTerms: snapshot.financialTerms, issuerPoloId: String(c.gateway_issuer_polo_id),
    rawPayload: { request, response: raw, recovered: true, recoveryMode: "NFSE_SERVICE_EXACT_GET_ONLY" },
  };
};
