import { cancelBaneseBoleto } from '../banese/core/adapter/boleto-cancellation.ts';
import { normalizeBaneseFinancialTerms } from '../banese/internal/financial-terms.ts';
import { assertBaneseFinancialTermsEqual } from '../banese/internal/financial-terms-response.ts';
import { buildOtherCreditPlanBaneseFinancialTerms } from '../gateways/api/banese-other-credit-financial-terms.ts';
import type { Claim } from './store.ts';

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
export type BankCancellation = Awaited<ReturnType<typeof cancelBaneseBoleto>>;
export type CancellationBank = (
  claim: Claim, onMutationStart: () => Promise<void>,
) => Promise<BankCancellation>;

export function cancellationBankIdentity(claim: Claim, metadata: Record<string, unknown>) {
  const row = claim.receivable;
  if (!row || !['production', 'sandbox'].includes(row.gateway_environment) ||
    row.gateway_provider !== 'banese_card' || row.gateway_payment_method !== 'BOLETO' ||
    row.gateway_submission_channel !== 'API' || row.gateway_submission_status !== 'API_REGISTERED' ||
    row.gateway_cnab_file_id != null || !['PENDENTE', 'VENCIDO'].includes(row.status) ||
    row.data_pagamento != null || Number(row.valor_pago ?? 0) !== 0 || row.manual_settlement_id != null ||
    row.categoria !== 'OUTROS_CREDITOS' || row.matricula_id != null || row.turma_id != null ||
    row.origem_cronograma_id != null || /PROESC|SISTEMA_ANTERIOR/.test(String(row.origem_pagamento)) ||
    !/^\d{9}$/.test(row.gateway_boleto_nosso_numero ?? '') ||
    row.gateway_payment_id !== row.gateway_boleto_nosso_numero ||
    !/^\d{47}$/.test(digits(row.gateway_boleto_linha_digitavel)) ||
    !/^\d{44}$/.test(digits(row.gateway_boleto_codigo_barras)) ||
    !/^\d{11}$|^\d{14}$/.test(String(claim.payerDocument ?? ''))) {
    throw new Error('CANCELLATION_IDENTITY_REQUIRES_REVIEW');
  }
  const convenio = digits(row.gateway_boleto_convenio);
  const agency = digits(row.gateway_boleto_agencia).padStart(3, '0');
  const account = digits(metadata.baneseConta || metadata.baneseContaDisplay);
  if (!convenio || convenio !== digits(metadata.baneseBoletoConvenio || metadata.baneseConvenio) ||
    !/^\d{3}$/.test(agency) || agency === '000' ||
    agency !== digits(metadata.baneseAgencia).padStart(3, '0') || !account ||
    !row.gateway_financial_terms || !row.gateway_financial_terms_confirmed_at) {
    throw new Error('CANCELLATION_BANK_CONFIGURATION_REQUIRES_REVIEW');
  }
  const financialTerms = normalizeBaneseFinancialTerms(row.gateway_financial_terms);
  if (financialTerms.nominalAmount !== Number(row.valor) || financialTerms.dueDate !== row.data_vencimento) {
    throw new Error('CANCELLATION_TERMS_REQUIRE_REVIEW');
  }
  const planTerms = buildOtherCreditPlanBaneseFinancialTerms(row);
  if (planTerms) assertBaneseFinancialTermsEqual(planTerms, financialTerms);
  return {
    convenio, nossoNumero: row.gateway_boleto_nosso_numero,
    expectedAmount: Number(row.valor), expectedDueDate: row.data_vencimento,
    expectedAgency: agency, expectedAccount: account,
    expectedDocumentNumber: row.id.slice(0, 15), expectedCompanyTitleId: row.id.slice(0, 25),
    expectedPayerDocument: claim.payerDocument,
    expectedDigitableLine: row.gateway_boleto_linha_digitavel,
    expectedBarcode: row.gateway_boleto_codigo_barras,
    expectedFinancialTerms: financialTerms, strictEffectivePayments: true,
    stopWhenPixAvailable: false,
  };
}

export const createCancellationBank = (admin: any, cancel = cancelBaneseBoleto): CancellationBank =>
  async (claim, onMutationStart) => {
    const environment = claim.receivable?.gateway_environment;
    const credential = await admin.from('payment_gateway_credentials').select('metadata')
      .eq('provider_code', 'banese_card').eq('environment', environment).single();
    if (credential.error) throw new Error('CANCELLATION_BANK_CONFIGURATION_UNAVAILABLE');
    const input = cancellationBankIdentity(claim, credential.data?.metadata ?? {});
    return await cancel(admin, environment, {
      ...input, signal: AbortSignal.timeout(25_000),
      onMutationStart: async () => {
        // A previous PUT with uncertain outcome is only queried. A fresh GET
        // returning code 5 exits the adapter before this callback.
        if (claim.mode !== 'CANCEL_ALLOWED') throw new Error('CONFIRM_ONLY_MUTATION_BLOCKED');
        await onMutationStart();
      },
    });
  };
