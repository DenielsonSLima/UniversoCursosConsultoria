import { BANESE_DOCUMENT_FIXTURE as bank } from "../banese/internal/testing/document-fixture.ts";
import { makeBaneseTitleResponse, validInput } from "../banese/core/adapter-test-fixtures.ts";
import { RENEGOTIATION_RECEIPT_INSTRUCTION } from "../banese/internal/renegotiation-billing.ts";
import type { ActivationContext, ActivationReplacement, ActivationSource } from "./contract.ts";

export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const syntheticSource = (): ActivationSource => ({
  receivableId: bank.receivableId, kind: "BANESE", state: "PENDING", attemptKey: fixtureId(9),
  sourceFingerprint: "a".repeat(64),
  bankSnapshot: {
    provider: "banese_card", environment: "production", paymentMethod: "BOLETO",
    convenio: bank.beneficiary.agreement, nossoNumero: bank.ourNumber,
    amount: bank.amount, dueDate: bank.dueDate, agency: bank.beneficiary.agency,
    account: bank.beneficiary.account,
    documentNumber: bank.receivableId.slice(0, 15), companyTitleId: bank.receivableId.slice(0, 25),
    payerDocument: validInput.payer.document,
    digitableLine: makeBaneseTitleResponse().NumeroLinhaDigitavel,
    barcode: makeBaneseTitleResponse().NumeroCodigoBarras,
    financialTerms: { nominalAmount: bank.amount, dueDate: bank.dueDate },
  },
});
export const syntheticContext = (): ActivationContext => ({
  operationId: fixtureId(1), agreementId: fixtureId(2), requestId: fixtureId(3), leaseToken: fixtureId(4),
  state: "CANCELING_SOURCES", courseType: "TECNICO",
  identity: { alunoId: fixtureId(5), matriculaId: fixtureId(6), turmaId: fixtureId(7), poloId: fixtureId(8) },
  payerDocument: validInput.payer.document,
  sources: [syntheticSource()], replacements: [],
  replacementPlan: [{ sequence: 1, kind: "INSTALLMENT", dueDate: "2030-01-15", amountCents: 15000,
    financialTerms: { nominalAmount: 150, dueDate: "2030-01-15" },
    collectionPolicy: { daysAfterDue: 60, instruction: RENEGOTIATION_RECEIPT_INSTRUCTION } }],
  runtime: { routeId: fixtureId(10), credentialId: fixtureId(11), issuerPoloId: fixtureId(12), environment: "production",
    convenio: bank.beneficiary.agreement, agency: bank.beneficiary.agency,
    account: bank.beneficiary.account.replace(/\D/g, ""),
    metadata: { baneseBoletoConvenio: bank.beneficiary.agreement, baneseAgencia: bank.beneficiary.agency,
      baneseConta: bank.beneficiary.account, baneseCodigoEspecie: 21 }, metadataFingerprint: "b".repeat(64) },
});
export const syntheticReplacement = (): ActivationReplacement => ({
  receivableId: bank.receivableId, state: "PENDING", attemptKey: fixtureId(17),
  financialTerms: { nominalAmount: bank.amount, dueDate: bank.dueDate },
});
export const syntheticReplacementRow = () => {
  const context = syntheticContext();
  const item = syntheticReplacement();
  return {
    id: item.receivableId, cliente_id: context.identity.alunoId,
    matricula_id: context.identity.matriculaId, turma_id: context.identity.turmaId,
    polo_id: context.identity.poloId, valor: bank.amount, data_vencimento: bank.dueDate,
    tipo_lancamento: "RENEGOCIACAO", status: "PENDENTE", gateway_provider: "banese_card",
    gateway_environment: "production", gateway_payment_method: "BOLETO",
    gateway_status: "CREATING", gateway_creation_token: item.attemptKey,
    gateway_issuer_polo_id: context.runtime.issuerPoloId,
    gateway_boleto_convenio: bank.beneficiary.agreement,
    gateway_boleto_agencia: bank.beneficiary.agency,
    regra_financeira_renegociacao_snapshot: { version: 1, origin: "RENEGOTIATION", agreementId: context.agreementId,
      receiptPolicy: context.replacementPlan[0].collectionPolicy, financialTerms: item.financialTerms },
  };
};
