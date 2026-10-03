import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE_PATH) throw new Error('Defina PGLITE_MODULE_PATH.');
const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href);
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const db = new PGlite();

const ids = {
  company: '00000000-0000-0000-0000-000000000001',
  polo: '00000000-0000-0000-0000-000000000010',
  otherPolo: '00000000-0000-0000-0000-000000000011',
  actor: '00000000-0000-0000-0000-000000000500',
  otherActor: '00000000-0000-0000-0000-000000000501',
  partner: '00000000-0000-0000-0000-000000000100',
  account: '00000000-0000-0000-0000-000000000200',
};

const uuid = (group, suffix) => `00000000-0000-0000-${group}-${String(suffix).padStart(12, '0')}`;

const setClaims = async ({ role = 'authenticated', sub = ids.actor,
  canFinanceiro = true, canTab = true, poloId = ids.polo } = {}) => {
  await db.query(`select
    set_config('request.jwt.claim.role', $1, false),
    set_config('request.jwt.claim.sub', $2, false),
    set_config('test.can_financeiro', $3, false),
    set_config('test.can_tab', $4, false),
    set_config('test.polo_id', $5, false)`, [
    role ?? '', sub || '', String(canFinanceiro), String(canTab), poloId,
  ]);
};

const expectCode = async (code, action) => {
  await assert.rejects(action, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });
};

const createConvenio = async (number, options = {}) => {
  const convenioId = uuid('1000', number);
  const competenciaId = uuid('2000', number);
  const createRequestId = uuid('3000', number);
  const status = options.status || 'ABERTO';
  const snapshots = status === 'FINALIZADO'
    ? [0, 0, 0, '2026-10-31T12:00:00Z', ids.actor]
    : [null, null, null, null, null];
  await db.query(`insert into public.convenios_financeiros (
      id, company_id, polo_id, parceiro_id, nome, status, request_id, created_by
    ) values ($1,$2,$3,$4,$5,'ATIVO',$6,$7)`, [
    convenioId, ids.company, ids.polo, ids.partner, `Convênio ${number}`,
    createRequestId, ids.actor,
  ]);
  await db.query(`insert into public.convenios_financeiros_competencias (
      id, convenio_id, company_id, polo_id, competencia, status, saldo_inicial,
      creditos_fechamento, despesas_fechamento, saldo_final, fechado_em, fechado_por,
      created_by
    ) values ($1,$2,$3,$4,'2026-10-01',$5,0,$6,$7,$8,$9,$10,$11)`, [
    competenciaId, convenioId, ids.company, ids.polo, status,
    ...snapshots, ids.actor,
  ]);
  await db.query(`insert into public.convenios_financeiros_operacoes_requisicoes (
      request_id, convenio_id, competencia_id, operacao, actor_id, payload_hash, resultado
    ) values ($1,$2,$3,'CRIAR_CONVENIO',$4,$5,'{}')`, [
    createRequestId, convenioId, competenciaId, ids.actor, 'a'.repeat(64),
  ]);
  return { convenioId, competenciaId, createRequestId };
};

const archive = async (requestId, convenioId, poloId = ids.polo) => (
  await db.query(`select public.excluir_convenio_financeiro_secure(
    $1::uuid, $2::uuid, $3::uuid
  ) as result`, [requestId, poloId, convenioId])
).rows[0].result;

const readList = () => db.query(`select public.listar_convenios_financeiros_meses_secure(
  $1::uuid, 'TODOS', null
)`, [ids.polo]);
const readCaixa = () => db.query(`select public.get_caixa_convenios_resumo_secure(
  $1::uuid, '2026-10-01'::date
)`, [ids.polo]);
const readDetail = (competenciaId) => db.query(`select
  public.obter_convenio_financeiro_mes_secure($1::uuid)`, [competenciaId]);

try {
  await db.exec(read('supabase/tests/convenios_financeiros_exclusao_logica_pglite.sql'));
  await db.exec(read('supabase/migrations/20261003160000_convenios_financeiros_exclusao_logica.sql'));
  await db.exec(read('supabase/migrations/20261003160001_convenios_financeiros_leituras_ativas.sql'));
  await db.query(`insert into public.empresas values ($1)`, [ids.company]);
  await db.query(`insert into public.polos values ($1,$2,'Polo A'),($3,$2,'Polo B')`,
    [ids.polo, ids.company, ids.otherPolo]);
  await db.query(`insert into public.parceiros values ($1,'Faculdade parceira')`, [ids.partner]);
  await db.query(`insert into public.contas_bancarias values ($1,'Banco','1')`, [ids.account]);
  await setClaims();

  const pristine = await createConvenio(1);
  const request = uuid('4000', 1);
  const before = (await db.query(`select public.listar_convenios_financeiros_meses_secure(
    $1::uuid, 'ABERTOS', null
  ) as payload`, [ids.polo])).rows[0].payload;
  assert.equal(before.itens.some((item) => item.convenio_id === pristine.convenioId), true);

  const result = await archive(request, pristine.convenioId);
  assert.deepEqual(result, {
    replayed: false,
    convenio_id: pristine.convenioId,
    polo_id: ids.polo,
    competencia_ids: [pristine.competenciaId],
  });
  assert.equal((await db.query(`select status from public.convenios_financeiros where id=$1`,
    [pristine.convenioId])).rows[0].status, 'ARQUIVADO');
  assert.equal((await db.query(`select count(*)::int as total
    from public.convenios_financeiros_competencias where convenio_id=$1`,
  [pristine.convenioId])).rows[0].total, 1);
  assert.equal((await db.query(`select count(*)::int as total from public.parceiros where id=$1`,
    [ids.partner])).rows[0].total, 1);
  const audit = (await db.query(`select operacao, actor_id, payload_hash, resultado
    from public.convenios_financeiros_operacoes_requisicoes
    where convenio_id=$1 order by created_at, operacao`, [pristine.convenioId])).rows;
  assert.deepEqual(audit.map((item) => item.operacao), ['CRIAR_CONVENIO', 'ARQUIVAR_CONVENIO']);
  assert.equal(audit.find((item) => item.operacao === 'ARQUIVAR_CONVENIO').actor_id, ids.actor);
  assert.match(audit.find((item) => item.operacao === 'ARQUIVAR_CONVENIO').payload_hash,
    /^[0-9a-f]{64}$/);

  const replay = await archive(request, pristine.convenioId);
  assert.equal(replay.replayed, true);
  assert.equal((await db.query(`select count(*)::int as total
    from public.convenios_financeiros_operacoes_requisicoes
    where convenio_id=$1 and operacao='ARQUIVAR_CONVENIO'`,
  [pristine.convenioId])).rows[0].total, 1);

  await setClaims({ canTab: false });
  await expectCode('42501', () => archive(request, pristine.convenioId));
  await expectCode('42501', readList);
  await expectCode('42501', readCaixa);
  await expectCode('42501', () => readDetail(pristine.competenciaId));
  await setClaims({ sub: null });
  await expectCode('42501', () => archive(uuid('4000', 2), pristine.convenioId));
  await expectCode('42501', readList);
  await expectCode('42501', readCaixa);
  await setClaims({ role: null });
  await expectCode('42501', () => archive(uuid('4000', 9), pristine.convenioId));
  await expectCode('42501', readList);
  await expectCode('42501', readCaixa);
  await setClaims({ canTab: null });
  await expectCode('42501', readList);
  await expectCode('42501', readCaixa);
  await setClaims({ canFinanceiro: null });
  await expectCode('42501', readList);
  await expectCode('42501', readCaixa);
  await setClaims();

  const after = (await db.query(`select public.listar_convenios_financeiros_meses_secure(
    $1::uuid, 'TODOS', null
  ) as payload`, [ids.polo])).rows[0].payload;
  assert.equal(after.itens.some((item) => item.convenio_id === pristine.convenioId), false);
  const caixaPayload = (await db.query(`select public.get_caixa_convenios_resumo_secure(
    $1::uuid, '2026-10-01'::date
  ) as payload`, [ids.polo])).rows[0].payload;
  assert.equal(caixaPayload.itens.some((item) => item.convenio_id === pristine.convenioId), false);
  await expectCode('P0002', () => readDetail(pristine.competenciaId));

  await expectCode('23514', () => db.query(`update public.convenios_financeiros_competencias
    set observacao='tentativa' where id=$1`, [pristine.competenciaId]));
  await expectCode('23514', () => db.query(`insert into public.convenios_financeiros_competencias (
    id, convenio_id, company_id, polo_id, competencia, saldo_inicial
  ) values ($1,$2,$3,$4,'2026-11-01',0)`, [
    uuid('2100', 1), pristine.convenioId, ids.company, ids.polo,
  ]));

  const withHistory = await createConvenio(2);
  const receivableId = uuid('5000', 2);
  const creditId = uuid('5100', 2);
  const expenseId = uuid('5200', 2);
  const expenseLinkId = uuid('5300', 2);
  await db.query(`insert into public.contas_receber values ($1)`, [receivableId]);
  await db.query(`insert into public.despesas_lancamentos (
    id,status,data_pagamento,data_lancamento,data_vencimento,descricao,conta_bancaria_id
  ) values ($1,'PAGO','2026-10-10','2026-10-10','2026-10-10','Despesa',$2)`,
  [expenseId, ids.account]);
  await db.query(`insert into public.convenios_financeiros_creditos (
    id,competencia_id,convenio_id,company_id,polo_id,conta_receber_id,
    conta_bancaria_id,data_credito,valor,forma_recebimento,descricao
  ) values ($1,$2,$3,$4,$5,$6,$7,'2026-10-10',50,'PIX','Crédito')`, [
    creditId, withHistory.competenciaId, withHistory.convenioId, ids.company, ids.polo,
    receivableId, ids.account,
  ]);
  await db.query(`insert into public.convenios_financeiros_despesas (
    id,competencia_id,convenio_id,company_id,polo_id,despesa_lancamento_id,
    valor_vinculado,status,estorno_motivo,estornado_em,estornado_por
  ) values ($1,$2,$3,$4,$5,$6,50,'ESTORNADO','Teste',now(),$7)`, [
    expenseLinkId, withHistory.competenciaId, withHistory.convenioId,
    ids.company, ids.polo, expenseId, ids.actor,
  ]);
  const net = (await db.query(`select
    (select sum(valor) from public.convenios_financeiros_creditos where convenio_id=$1)
    - (select sum(valor_vinculado) from public.convenios_financeiros_despesas where convenio_id=$1)
      as total`, [withHistory.convenioId])).rows[0].total;
  assert.equal(Number(net), 0, 'Saldo líquido zero não apaga o histórico.');
  await expectCode('23514', () => archive(uuid('4000', 3), withHistory.convenioId));

  const finalized = await createConvenio(3, { status: 'FINALIZADO' });
  await expectCode('23514', () => archive(uuid('4000', 4), finalized.convenioId));

  const successor = await createConvenio(4, { status: 'FINALIZADO' });
  await db.query(`insert into public.convenios_financeiros_competencias (
    id,convenio_id,company_id,polo_id,competencia,status,saldo_inicial,competencia_anterior_id
  ) values ($1,$2,$3,$4,'2026-11-01','ABERTO',0,$5)`, [
    uuid('2100', 4), successor.convenioId, ids.company, ids.polo, successor.competenciaId,
  ]);
  await expectCode('23514', () => archive(uuid('4000', 5), successor.convenioId));

  const audited = await createConvenio(5);
  await db.query(`insert into public.convenios_financeiros_operacoes_requisicoes (
    request_id,convenio_id,competencia_id,operacao,actor_id,payload_hash,resultado
  ) values ($1,$2,$3,'FINALIZAR_MES',$4,$5,'{}')`, [
    uuid('3100', 5), audited.convenioId, audited.competenciaId, ids.actor, 'b'.repeat(64),
  ]);
  await expectCode('23514', () => archive(uuid('4000', 6), audited.convenioId));

  const other = await createConvenio(6);
  await setClaims({ canFinanceiro: false });
  await expectCode('42501', () => archive(uuid('4000', 7), other.convenioId));
  await setClaims({ poloId: ids.otherPolo });
  await expectCode('P0002', () => archive(uuid('4000', 8), other.convenioId, ids.otherPolo));
  await setClaims();
  await expectCode('23505', () => archive(request, other.convenioId));

  console.log(JSON.stringify({
    status: 'PASS',
    remoteMutations: false,
    scenarios: [
      'pristine-archive-preserves-partner-competence-audit',
      'idempotent-replay-and-revoked-replay-denied',
      'active-list-caixa-and-detail-hide-archived',
      'archived-child-mutations-blocked',
      'zero-net-credit-and-reversed-expense-history-blocked',
      'finalized-or-successor-competence-blocked',
      'extra-audit-history-blocked',
      'null-role-uid-helper-tab-finance-polo-and-request-reuse-guards',
    ],
  }, null, 2));
} finally {
  await db.close();
}
