import { cancelBaneseBoleto, queryBaneseBoleto } from "../banese/core/adapter.ts";
import { BaneseCancellationRequiresReviewError } from "../banese/core/adapter/types.ts";
import { assertBaneseBankNumbers, assertBaneseDueDateFactor } from "../banese/internal/bank-fields.ts";
import { assertBaneseFinancialTermsEqual } from "../banese/internal/financial-terms-response.ts";
import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import { type Admin, canonicalTerms, record } from "./contract.ts";
import { type CancellationMaterial, type CancellationProof, cancellationFingerprint } from "./cancellation-contract.ts";

export interface CancellationBankDependencies {
  query?: typeof queryBaneseBoleto; cancel?: typeof cancelBaneseBoleto; reconcile?: typeof reconcileBaneseReceivable;
}
type Snapshot = Awaited<ReturnType<typeof queryBaneseBoleto>>;
const expectation = (material: CancellationMaterial) => {
  const c = material.receivable, m = material.metadata;
  const convenio=c.gateway_boleto_convenio || m.baneseBoletoConvenio || m.baneseConvenio;
  const agency=String(c.gateway_boleto_agencia || m.baneseAgencia || "").replace(/\D/g,"").padStart(3,"0");
  const account=m.baneseConta || m.baneseContaDisplay;
  if(!/^\d{1,20}$/.test(String(convenio))||!/^\d{3}$/.test(String(agency))||String(agency)==="000"
    ||!String(account||"").replace(/\D/g,"")||!/^\d{11}$|^\d{14}$/.test(String(material.payer.cpf_cnpj||"").replace(/\D/g,"")))throw new Error("INVALID_EVIDENCE");
  return { convenio,
    nossoNumero: c.gateway_boleto_nosso_numero, validateTitleIdentity: true, strictEffectivePayments: true,
    expectedAmount: c.valor, expectedDueDate: String(c.data_vencimento).slice(0,10),
    expectedAgency: agency, expectedAccount: account,
    expectedDocumentNumber: String(c.id).slice(0,15), expectedCompanyTitleId: String(c.id).slice(0,25),
    expectedPayerDocument: material.payer.cpf_cnpj };
};
const validateSnapshot = (snapshot: Snapshot, material: CancellationMaterial) => {
  if (snapshot.paymentsError) throw snapshot.paymentsError;
  if (snapshot.financialTermsError || !snapshot.financialTerms) throw new Error("INVALID_EVIDENCE");
  assertBaneseFinancialTermsEqual(canonicalTerms(material.receivable), snapshot.financialTerms);
  const raw = record(snapshot.raw), bank = assertBaneseBankNumbers(raw.NumeroLinhaDigitavel, raw.NumeroCodigoBarras);
  assertBaneseDueDateFactor(bank.barcode, String(material.receivable.data_vencimento).slice(0,10));
  if (snapshot.nossoNumero !== String(material.receivable.gateway_boleto_nosso_numero)
    || bank.barcode.slice(30,39) !== snapshot.nossoNumero
    || Number(bank.barcode.slice(9,19))/100 !== Number(material.receivable.valor)) throw new Error("INVALID_EVIDENCE");
  return bank;
};
const proof = async (snapshot: Snapshot, material: CancellationMaterial, mutationAttempted: boolean, alreadyCanceled: boolean): Promise<CancellationProof> => {
  const bank = validateSnapshot(snapshot, material);
  if (snapshot.situationCode !== 5 || snapshot.remoteStatus !== "CANCELED" || snapshot.paid || snapshot.payments.length) throw new Error("INVALID_EVIDENCE");
  const evidence = { convenio: snapshot.convenio, nossoNumero: snapshot.nossoNumero, ...bank,
    amount: material.receivable.valor, dueDate: material.receivable.data_vencimento, situationCode: 5, paymentsCount: 0 };
  return { outcome:"CANCELLED",confirmedAt:new Date().toISOString(),evidenceFingerprint:await cancellationFingerprint(evidence),
    remoteStatus:"CANCELED",situationCode:5,convenio:snapshot.convenio,nossoNumero:snapshot.nossoNumero,
    strictEffectivePayments:true,identityValidated:true,termsValidated:true,paymentsCount:0,
    mutationAttempted,alreadyCanceled,bankSlipDigitableLine:bank.digitableLine,bankSlipBarcode:bank.barcode,
    financialTerms:canonicalTerms(material.receivable) };
};
export async function cancelServiceBolepix(admin: Admin, material: CancellationMaterial, begin: () => Promise<void>, dependencies: CancellationBankDependencies = {}): Promise<CancellationProof> {
  const query = dependencies.query ?? queryBaneseBoleto;
  const read = async () => {
    const snapshot = await query(admin as Parameters<typeof queryBaneseBoleto>[0],"production",{
      ...expectation(material),signal:AbortSignal.timeout(8_000),
    });
    validateSnapshot(snapshot,material);return snapshot;
  };
  const paid = async (): Promise<CancellationProof> => {
    const result = await (dependencies.reconcile ?? reconcileBaneseReceivable)(admin,String(material.receivable.id),{
      signal:AbortSignal.timeout(8_000),queryBoleto:async(client,environment,input)=>query(client,environment,{...input,strictEffectivePayments:true}),
    });
    if (result.receivable?.status !== "PAGO") throw new Error("PAYMENT_HISTORY");
    return {outcome:"PAID",remoteStatus:"PAID",confirmedAt:new Date().toISOString(),
      evidenceFingerprint:await cancellationFingerprint({receivableId:material.receivable.id,status:"PAGO",updatedAt:result.receivable.updated_at})};
  };
  const current = await read();
  if (current.paid || current.payments.length || current.situationCode === 3) return paid();
  if (current.situationCode === 5) return proof(current,material,false,true);
  if (current.situationCode === 0) throw new Error("TRANSPORT");
  if (current.situationCode !== 2) throw new Error("INVALID_EVIDENCE");
  if (material.action === "OBSERVE_BANK" || material.cancelIntent) throw new Error("TRANSPORT");
  const bank = validateSnapshot(current,material);
  let started = false;
  try {
    const canceled = await (dependencies.cancel ?? cancelBaneseBoleto)(admin as Parameters<typeof cancelBaneseBoleto>[0],"production",{
      ...expectation(material),expectedDigitableLine:bank.digitableLine,expectedBarcode:bank.barcode,
      expectedFinancialTerms:canonicalTerms(material.receivable),signal:AbortSignal.timeout(25_000),
      onMutationStart:async()=>{await begin();started=true;},
    });
    if (canceled.situationCode !== 5 || canceled.remoteStatus !== "CANCELED") throw new Error("INVALID_EVIDENCE");
    return proof({...current,raw:canceled.raw,situationCode:5,remoteStatus:"CANCELED",paid:false,payments:[]},material,
      canceled.mutationAttempted === true,canceled.alreadyCanceled === true);
  } catch (error) {
    if (started || error instanceof BaneseCancellationRequiresReviewError) {
      const observed = await read();
      if (observed.paid || observed.payments.length || observed.situationCode === 3) return paid();
      if (observed.situationCode === 5) return proof(observed,material,started,true);
      // An accepted request can precede the bank's status transition. Once its
      // durable intent exists, keep observing this title without another PUT.
      if (started && [0,2].includes(observed.situationCode)) throw new Error("TRANSPORT", { cause: error });
    }
    throw error;
  }
}
