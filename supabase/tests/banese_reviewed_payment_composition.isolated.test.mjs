import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const rpcSignature = 'public.persist_banese_reconciliation_snapshot(uuid,text,text,timestamp with time zone,text,text,numeric,date,text,text,jsonb,boolean,boolean,boolean,boolean,numeric,date,text,text,text,text,text,jsonb,jsonb,jsonb)';
const resolverSignature = 'public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamp with time zone,bigint,bigint,bigint,bigint,bigint,bigint)';
const terms = {
  nominalAmount: 200, dueDate: '2026-06-10', discount: null,
  penalty: { type: 'percentage', value: 2, startsOn: '2026-06-11' },
  interest: { type: 'monthly-percentage', value: 2, startsOn: '2026-06-11' },
};
const review = {
  receivableId: id(1), environment: 'production', nossoNumero: '000000111',
  amount: 206.52, paymentDate: '2026-06-27', financialTerms: terms,
  calculatedRange: { minimumAmount: 206.26, expectedAmount: 206.27, maximumAmount: 206.28 },
  authority: 'EXPLICIT_MANAGER_REVIEW', reason: 'OFFICIAL_PAYMENT_CONFIRMED_WITH_UNITEMIZED_VARIANCE',
  reviewedAt: '2026-11-15T08:00:00.000Z', varianceFromCalculatedExpected: 0.25,
  varianceFromNominal: 6.52, paidComponents: null,
};
const stateKeys = ['status','origem_pagamento','forma_pagamento','gateway_status',
  'gateway_creation_token','gateway_financial_terms','gateway_financial_terms_confirmed_at',
  'gateway_submission_channel','gateway_submission_status','gateway_cnab_file_id',
  'gateway_boleto_agencia','gateway_boleto_linha_digitavel','gateway_boleto_codigo_barras',
  'gateway_pix_payload','gateway_pix_encoded_image','gateway_last_error','gateway_payment_id',
  'gateway_boleto_nosso_numero','updated_at'];
const transactionKeys = ['id','amount','raw_payload','remote_payment_id','remote_status',
  'last_error','synced_at','bank_slip_our_number','bank_slip_digitable_line','bank_slip_barcode',
  'pix_payload','pix_encoded_image','updated_at'];
const pick = (record, keys) => Object.fromEntries(keys.map(key => [key, record[key] ?? null]));
const receipt = () => scalar('select to_jsonb(c) value from public.contas_receber c where id=$1', [id(1)]);
const fingerprint = () => scalar(`select md5(jsonb_build_object(
  'receipts',(select jsonb_agg(to_jsonb(c)) from public.contas_receber c),
  'transactions',(select jsonb_agg(to_jsonb(t)) from public.payment_gateway_transactions t))::text) value`);
const composition = async ({ paid = 206.52, paidOn = '2026-06-27', manual = false } = {}) => (
  await db.query(`select * from public.resolve_integrated_receivable_financial_composition(
    $1,200,$2,'2026-06-10',$3,(select gateway_financial_terms from public.contas_receber where id=$1),
    $4,null,20000,125,400,0,0,20525)`, [id(1), paid, paidOn, manual ? id(77) : null])
).rows[0];
const rpcArgs = async (marker = review) => {
  const row = await receipt();
  const transactions = (await db.query('select to_jsonb(t) value from public.payment_gateway_transactions t')).rows;
  return [row.id, row.gateway_environment, row.gateway_boleto_nosso_numero,
    row.updated_at, row.status, row.gateway_status, row.valor, row.data_vencimento,
    row.gateway_boleto_convenio, 'PAID', terms, false, true, true, row.status !== 'PAGO',
    206.52, '2026-06-27', 'BOLETO', null, null, null, null,
    { payments: [{ ValorPago: 206.52, DataPagamento: '2026-06-27' }],
      ...(marker === undefined ? {} : { paymentVarianceReview: marker }) },
    transactions.map(({ value }) => pick(value, transactionKeys)), pick(row, stateKeys)];
};
const persist = args => db.query(`select public.persist_banese_reconciliation_snapshot(
  ${args.map((_, index) => `$${index + 1}`).join(',')})`, args);
const expectUnknown = (result, difference = 6.52) => {
  for (const key of ['juros','multa','acrescimo','desconto']) assert.equal(result[key], null, key);
  assert.equal(Number(result.diferenca_nao_discriminada), difference);
  assert.equal(Number(result.valor_recebido), 200 + difference);
};

try {
  await db.exec(readFileSync(new URL('./banese_reviewed_payment_composition.fixture.sql', import.meta.url), 'utf8'));
  await db.exec(source('20260912221000_banese_verified_banking_grace.sql'));
  await db.exec(source('20260827224600_persist_banese_reconciliation_atomically.sql'));
  await db.query(`insert into public.contas_receber(id,status,valor,data_vencimento,updated_at,
    gateway_provider,gateway_environment,gateway_payment_method,gateway_status,gateway_payment_id,
    gateway_boleto_nosso_numero,gateway_boleto_convenio,gateway_financial_terms,
    gateway_financial_terms_confirmed_at,gateway_submission_channel,gateway_submission_status,
    conta_bancaria_id,gateway_fee_value,gateway_net_value)
    values($1,'PENDENTE',200,'2026-06-10','2026-06-01','banese_card','production','BOLETO',
      'PENDING','000000111','000000111','1',$2,'2026-06-01','API','API_REGISTERED',$3,1,199)`,
  [id(1), terms, id(50)]);
  await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,
    provider_code,environment,payment_method,remote_payment_id,bank_slip_our_number,
    amount,remote_status,raw_payload,updated_at)
    values($1,$2,'banese_card','production','BOLETO','000000111','000000111',200,
      'PENDING','{"originalEvidence":"preserved"}','2026-06-01')`, [id(2), id(1)]);

  const before = await composition();
  assert.equal(before.composicao_status, 'CONCILIADO_POR_FORMULA_BANESE');
  assert.equal(Number(before.multa), 4);
  assert.equal(Number(before.juros), 2.52, 'Reproduces the 30-cent formula attribution');

  const rpcHash = await scalar('select md5(pg_get_functiondef($1::regprocedure)) value', [rpcSignature]);
  const resolverHash = await scalar('select md5(pg_get_functiondef($1::regprocedure)) value', [resolverSignature]);
  // Only installation fingerprints differ for the isolated baseline/Postgres build.
  // The production guards, patch needles and installed bodies remain versioned.
  const patch = source('20261115085510_banese_reviewed_payment_composition.sql')
    .replace('daa006fc2c4909612616d2fd65ead9bb', rpcHash)
    .replace('d104221899227e97a2e02fb39f65860a', resolverHash);
  await db.exec(patch);
  assert.equal((await composition()).composicao_status, before.composicao_status,
    'Unmarked titles retain their previous composition');

  const immutableBeforeReject = await fingerprint();
  for (const marker of [null, {}, { ...review, amount: 206.53 },
    { ...review, paymentDate: '2026-06-26' }, { ...review, receivableId: id(3) },
    { ...review, environment: 'sandbox' }, { ...review, nossoNumero: '000000112' },
    { ...review, paidComponents: { interest: 2.52, penalty: 4 } },
    { ...review, varianceFromNominal: 0 },
    { ...review, reviewedAt: '2026-02-30T08:00:00.000Z' },
    { ...review, financialTerms: { ...terms, penalty: null } },
    { ...review, calculatedRange: { ...review.calculatedRange, expectedAmount: 'invalid' } }]) {
    await assert.rejects(persist(await rpcArgs(marker)), /BANESE_PAYMENT_VARIANCE_REVIEW_INVALID/);
    assert.equal(await fingerprint(), immutableBeforeReject, 'Invalid review causes no financial write');
  }

  const unpaidArgs = await rpcArgs();
  unpaidArgs[12] = false;
  unpaidArgs[13] = false;
  unpaidArgs[14] = false;
  unpaidArgs[15] = null;
  unpaidArgs[16] = null;
  await assert.rejects(persist(unpaidArgs), /BANESE_PAYMENT_VARIANCE_REVIEW_INVALID/);
  unpaidArgs[13] = null;
  await assert.rejects(persist(unpaidArgs), /Decisao de conciliacao Banese invalida/);
  assert.equal(await fingerprint(), immutableBeforeReject);

  const unmarkedArgs = await rpcArgs();
  delete unmarkedArgs[22].paymentVarianceReview;
  await db.exec('BEGIN');
  await persist(unmarkedArgs);
  assert.equal((await receipt()).gateway_settlement_evidence.paymentVarianceReview, undefined);
  assert.equal((await composition()).composicao_status, before.composicao_status,
    'Ordinary reconciliation without review retains existing persistence/composition');
  await db.exec('ROLLBACK');
  assert.equal(await fingerprint(), immutableBeforeReject);

  const validArgs = await rpcArgs();
  await db.query(`update public.contas_receber set updated_at=updated_at+interval '1 second' where id=$1`, [id(1)]);
  const conflictedState = await fingerprint();
  await assert.rejects(persist(validArgs), /mudou durante a consulta/);
  assert.equal(await fingerprint(), conflictedState, 'CAS failure does not persist review or payment');

  await persist(await rpcArgs());
  const paid = await receipt();
  assert.equal(paid.status, 'PAGO');
  assert.equal(Number(paid.valor_pago), 206.52);
  assert.equal(paid.data_pagamento, '2026-06-27');
  assert.deepEqual(paid.gateway_financial_terms, terms, 'Contract terms remain unchanged');
  assert.equal(paid.conta_bancaria_id, id(50));
  assert.equal(Number(paid.gateway_fee_value), 1);
  assert.equal(Number(paid.gateway_net_value), 199);
  assert.deepEqual(paid.gateway_settlement_evidence.paymentVarianceReview, review);
  const payload = await scalar('select raw_payload value from public.payment_gateway_transactions where id=$1', [id(2)]);
  assert.deepEqual(payload.paymentVarianceReview, review);
  assert.equal(payload.originalEvidence, 'preserved');
  const reviewed = await composition();
  expectUnknown(reviewed);
  assert.equal(reviewed.composicao_status, 'NAO_DISCRIMINADA_PELO_GATEWAY');
  assert.equal(await scalar('select count(*) value from public.payment_gateway_transactions'), 1);

  await persist(await rpcArgs());
  assert.deepEqual((await receipt()).gateway_settlement_evidence, paid.gateway_settlement_evidence,
    'Replay preserves the original atomic review evidence');
  assert.equal(await scalar('select count(*) value from public.payment_gateway_transactions'), 1);

  for (const marker of [null, {}, { ...review, amount: 1 }, { ...review, authority: 'UNKNOWN' }]) {
    await db.query(`update public.contas_receber set gateway_settlement_evidence=
      jsonb_build_object('paymentVarianceReview',$2::jsonb) where id=$1`, [id(1), marker]);
    const result = await composition();
    expectUnknown(result);
    assert.equal(result.composicao_status, 'NAO_DISCRIMINADA', 'Malformed evidence never restores formula attribution');
  }
  await db.query(`update public.contas_receber set gateway_settlement_evidence=$2,
    gateway_financial_terms=jsonb_set(gateway_financial_terms,'{penalty,value}','3') where id=$1`,
  [id(1), paid.gateway_settlement_evidence]);
  expectUnknown(await composition());
  assert.equal((await composition()).composicao_status, 'NAO_DISCRIMINADA');

  const manual = await composition({ manual: true, paid: 205.25 });
  assert.equal(manual.composicao_status, 'COMPOSICAO_EXPLICITA');
  assert.equal(Number(manual.juros), 1.25, 'Explicit manual composition retains precedence');
  assert.equal(Number(manual.multa), 4);
  console.log('PASS: atomic variance evidence, unchanged terms/account, CAS, replay, unknown components and negative guards');
} finally {
  await db.close();
}
