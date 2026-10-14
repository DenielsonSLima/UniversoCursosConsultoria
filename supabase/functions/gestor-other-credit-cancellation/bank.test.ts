import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancellationBankIdentity, createCancellationBank } from './bank.ts';
import type { Claim } from './store.ts';

const ID = '22222222-2222-4222-8222-222222222222';
const metadata = { baneseBoletoConvenio: '123', baneseAgencia: '033', baneseConta: '03/123456-7' };
const claim = (): Claim => ({
  mode: 'CANCEL_ALLOWED', payerDocument: '00000000000', transactionId: 'synthetic-transaction',
  receivable: {
    id: ID, polo_id: '11111111-1111-4111-8111-111111111111', categoria: 'OUTROS_CREDITOS',
    status: 'PENDENTE', valor: 100, data_vencimento: '2026-11-01',
    gateway_provider: 'banese_card', gateway_environment: 'sandbox', gateway_payment_method: 'BOLETO',
    gateway_submission_channel: 'API', gateway_submission_status: 'API_REGISTERED',
    gateway_boleto_nosso_numero: '123456789', gateway_payment_id: '123456789',
    gateway_boleto_convenio: '123', gateway_boleto_agencia: '033',
    gateway_boleto_linha_digitavel: '1'.repeat(47), gateway_boleto_codigo_barras: '1'.repeat(44),
    gateway_financial_terms: { nominalAmount: 100, dueDate: '2026-11-01', discount: null, interest: null, penalty: null },
    gateway_financial_terms_confirmed_at: '2026-10-14T10:00:00Z',
  },
});
const admin = {
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { metadata }, error: null }) }) }) }) }),
};

test('bank identity includes amount, due date, payer, account, line, barcode and complete terms', () => {
  const value = cancellationBankIdentity(claim(), metadata);
  assert.equal(value.expectedAmount, 100);
  assert.equal(value.expectedDueDate, '2026-11-01');
  assert.equal(value.expectedAccount, '031234567');
  assert.equal(value.expectedPayerDocument, '00000000000');
  assert.equal(value.expectedDocumentNumber, ID.slice(0, 15));
  assert.equal(value.expectedCompanyTitleId, ID.slice(0, 25));
  assert.equal(value.strictEffectivePayments, true);
  assert.equal(value.stopWhenPixAvailable, false);
  assert.deepEqual(value.expectedFinancialTerms, { nominalAmount: 100, dueDate: '2026-11-01', discount: null, interest: null, penalty: null });
});

test('bank identity refuses paid, partial, CNAB, academic, ambiguous and changed financial terms', () => {
  for (const patch of [
    { status: 'PAGO' }, { valor_pago: 1 }, { data_pagamento: '2026-10-14' },
    { manual_settlement_id: ID }, { gateway_submission_channel: 'CNAB240' },
    { gateway_submission_status: 'API_AMBIGUOUS' }, { gateway_cnab_file_id: ID },
    { matricula_id: ID }, { turma_id: ID }, { origem_cronograma_id: ID },
    { origem_pagamento: 'PROESC' }, { categoria: 'MENSALIDADE' },
    { gateway_payment_id: '987654321' }, { gateway_environment: 'unknown' },
    { gateway_financial_terms_confirmed_at: null }, { gateway_financial_terms: null },
    { valor: 101 }, { data_vencimento: '2026-11-02' },
  ]) {
    const row = claim(); Object.assign(row.receivable!, patch);
    assert.throws(() => cancellationBankIdentity(row, metadata), JSON.stringify(patch));
  }
  assert.throws(() => cancellationBankIdentity(claim(), { ...metadata, baneseBoletoConvenio: '999' }));
  assert.throws(() => cancellationBankIdentity(claim(), { ...metadata, baneseAgencia: '999' }));
});

test('adapter callback cannot PUT in confirm-only recovery', async () => {
  let put = false; let started = false;
  const bank = createCancellationBank(admin, async (_admin, _environment, input) => {
    await input.onMutationStart?.(); put = true;
    throw new Error('MUST_NOT_REACH');
  });
  await assert.rejects(bank({ ...claim(), mode: 'CONFIRM_ONLY' }, async () => { started = true; }), /CONFIRM_ONLY/);
  assert.equal(put, false); assert.equal(started, false);
});

test('adapter receives deadline, strict payments and onMutationStart durably before mutation', async () => {
  let started = false;
  const bank = createCancellationBank(admin, async (_admin, environment, input) => {
    assert.equal(environment, 'sandbox');
    assert.equal(input.strictEffectivePayments, true);
    assert.ok(input.signal);
    await input.onMutationStart?.(); assert.equal(started, true);
    return { convenio: '123', nossoNumero: '123456789', situationCode: 5, remoteStatus: 'CANCELED',
      alreadyCanceled: false, mutationAttempted: true, pixAvailable: false, pixPayload: null, pixEncodedImage: null, raw: {} };
  });
  const result = await bank(claim(), async () => { started = true; });
  assert.equal(result.situationCode, 5);
});
