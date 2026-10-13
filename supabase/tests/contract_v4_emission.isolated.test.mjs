import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createContractIdentityDatabase } from './fixtures/contract-identity-harness.mjs';

// Actual base/wrapper, model approval gate, renderer and snapshot trigger.
// The unchanged auth/ledger boundaries come from the identity harness. The
// financial SOURCE is a synthetic per-enrollment rule table in this test only;
// its pure plan/summary SQL is real. The full financial loader has its own suite.
const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const migration = (name) => read(`supabase/migrations/${name}.sql`);
function definition(source, name) {
  const start = source.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  const tag = /\bas\s+(\$[a-z_]*\$)/i.exec(tail);
  const end = tail.indexOf(`${tag[1]};`, tag.index + tag[0].length);
  return tail.slice(0, end + tag[1].length + 1);
}
const polo = '10000000-0000-0000-0000-000000000001';
const enrollment = (n) => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const request = (n) => `80000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const student = (n) => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const body = (payload) => payload.rendered.pages.map((page) => page.body).join('\n');
const db = await createContractIdentityDatabase();
const issue = async (n, key = n) => (await db.query(
  'select public.preparar_emissao_contrato_aluno_secure($1,$2,$3,null,$4) as response',
  [polo, 'INDIVIDUAL', [enrollment(n)], request(key)],
)).rows[0].response;
const count = async () => (await db.query('select count(*)::integer as n from public.documentos_validacao')).rows[0].n;
let passed = 0;
async function check(label, fn) { await fn(); console.log(`ok ${++passed} - ${label}`); }
try {
  const historical = await issue(3, 90);
  const originalLedger = (await db.query('select dados_emissao from public.documentos_validacao')).rows[0].dados_emissao;
  await db.exec(`alter table public.documentos_modelos_configuracoes add column atualizado_por uuid,
    add column updated_at timestamptz;
    create table public.documentos_modelos_historico(template_key text, modalidade text, revisao integer,
      status text, conteudo jsonb, atualizado_por uuid, request_id uuid);
    create schema test_contract_v4;
    create table test_contract_v4.financial_rules(matricula_id uuid primary key, rule jsonb);
    update public.parceiros set data_nascimento=(current_date-interval '30 years')::date;
    update public.parceiros set data_nascimento=(current_date-interval '12 years')::date,
      responsavel_nome='RESPONSAVEL LEGAL SINTETICO', responsavel_cpf='98765432100',
      responsavel_parentesco='Responsável legal', responsavel_telefone='79900000001'
      where id='${student(2)}';`);
  const baseRule = {
    origem: 'INDIVIDUAL', identidade: {},
    cobranca: { matricula: { habilitada: false, valor: '150.00' },
      mensalidade: { habilitada: true, quantidade: 8, valor: '300.00' },
      rematricula: { habilitada: true, valor: '80.00' } },
    encargos: { descontoPontualidade: '20.00', jurosAtrasoPercentual: '1', multaAtrasoPercentual: '2' },
    aplicacao: { matricula: { desconto: false, multaJuros: false },
      mensalidade: { desconto: true, multaJuros: true }, rematricula: { desconto: false, multaJuros: false } },
    continuidade: { maxCiclos: 2 }, vencimento: { diaBase: 10 },
  };
  const secondRule = structuredClone(baseRule);
  secondRule.cobranca.mensalidade = { habilitada: true, quantidade: 5, valor: '240.00' };
  secondRule.cobranca.rematricula.habilitada = false;
  secondRule.continuidade.maxCiclos = 1;
  secondRule.encargos.descontoPontualidade = '0.00';
  secondRule.aplicacao.mensalidade = { desconto: false, multaJuros: false };
  for (const [n, rule] of [[1, baseRule], [2, secondRule], [3, baseRule]]) {
    await db.query('insert into test_contract_v4.financial_rules values ($1,$2)', [enrollment(n), rule]);
  }
  await db.exec(definition(await migration('20260622161000_integrate_enrollment_receivables'), 'public.data_vencimento_mensal'));
  await db.exec(definition(await migration('20260807050000_create_secretaria_documentos_contrato_preceptor_calendario'), 'public.formatar_valor_brl_documento'));
  for (const name of ['20261013120000_contract_individual_financial_plan', '20261013120100_contract_financial_summary']) {
    await db.exec(await migration(name));
  }
  await db.exec(`create function internal_academic.freeze_contract_individual_finance(uuid,jsonb)
    returns jsonb language sql as $$
      select jsonb_set($2,'{financeiro}',internal_academic.contract_financial_summary(
        internal_academic.contract_financial_plan(rule,null,'[]',date '2027-01-10')))
      from test_contract_v4.financial_rules where matricula_id=$1;
    $$; revoke all on function internal_academic.freeze_contract_individual_finance(uuid,jsonb)
      from public,anon,authenticated,service_role;`);
  const wireSource = await migration('20261013120200_freeze_contract_individual_finance');
  const wireStart = wireSource.indexOf('do $wire$');
  const wireEnd = wireSource.indexOf('$wire$;', wireStart);
  await db.exec(wireSource.slice(wireStart, wireEnd + '$wire$;'.length));
  const draftSource = await migration('20260809210000_create_full_technical_contract_draft');
  const factoryStart = draftSource.indexOf('do $create_full_contract_draft$');
  const factoryEnd = draftSource.indexOf('$create_full_contract_draft$;', factoryStart);
  await db.exec('update public.documentos_modelos_configuracoes set revisao=3');
  await db.exec(draftSource.slice(factoryStart, factoryEnd + '$create_full_contract_draft$;'.length));
  for (const name of ['20261013121000_contract_party_snapshot', '20261013121100_contract_individual_terms_render',
    '20261013121200_revise_technical_contract_individual_terms',
    '20261013123000_contract_v4_pagination', '20261013123010_contract_v4_renderer_pagination']) {
    await db.exec(await migration(name));
  }
  const model = (await db.query('select * from public.documentos_modelos_configuracoes')).rows[0];
  await check('revised model remains blocked until its own approval; nonempty header passes the unchanged gate', async () => {
    assert.equal(model.status, 'EM_REVISAO');
    assert.ok(model.conteudo.cabecalho.trim());
    await assert.rejects(() => issue(1), (error) => error.code === '55000');
    await db.exec("update public.documentos_modelos_configuracoes set status='ATIVO'");
    await assert.rejects(() => issue(1), (error) => error.code === '55000' && /aprovação/.test(error.message));
    assert.equal(await count(), 1, 'failed preparation leaves no ledger rows');
    await db.query(`insert into public.documentos_modelos_aprovacoes(template_key,modalidade,revisao,termo_confirmacao)
      values ('contrato_aluno','TECNICO',$1,'APROVADO_JURIDICAMENTE')`, [model.revisao]);
    await db.exec(`update public.documentos_modelos_configuracoes set conteudo=jsonb_set(conteudo,'{cabecalho}','""')`);
    await assert.rejects(() => issue(1), (error) => error.code === '55000' && /incompleta/.test(error.message));
    await db.query('update public.documentos_modelos_configuracoes set conteudo=$1', [model.conteudo]);
  });
  let adult;
  let minor;
  await check('actual RPC freezes adult and minor parties plus different individual financial plans', async () => {
    adult = await issue(1);
    minor = await issue(2);
    const a = adult.documents[0].render_payload;
    const b = minor.documents[0].render_payload;
    assert.equal(a.snapshot.contratante.tipo, 'ALUNO');
    assert.equal(a.snapshot.contratante.nome, a.snapshot.aluno.nome);
    assert.equal(b.snapshot.contratante.tipo, 'RESPONSAVEL_LEGAL');
    assert.equal(b.snapshot.contratante.nome, 'RESPONSAVEL LEGAL SINTETICO');
    assert.equal(a.snapshot.financeiro.quantidadeParcelas, 16);
    assert.equal(a.snapshot.financeiro.valorTotalContrato, 4880);
    assert.equal(b.snapshot.financeiro.quantidadeParcelas, 5);
    assert.equal(b.snapshot.financeiro.valorTotalContrato, 1200);
    assert.match(body(a), /R\$ 4\.880,00/);
    assert.match(body(b), /R\$ 1\.200,00/);
    assert.doesNotMatch(body(b), /juros de 1%|desconto de pontualidade de R\$/);
    assert.equal(a.template.presentationVersion, 'CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL');
    assert.equal(a.snapshot.instituicao.presentationVersion, a.template.presentationVersion);
    assert.deepEqual(a.template, model.conteudo);
    for (const payload of [a, b]) {
      assert.doesNotMatch(body(payload), /\{\{/);
      assert.ok(payload.rendered.pages.length > 1);
      const row = (await db.query('select dados_emissao from public.documentos_validacao where codigo=$1',
        [payload.rendered.qr.code])).rows[0].dados_emissao;
      assert.deepEqual(row.contractSnapshot, payload.snapshot);
      assert.deepEqual(row.templateSnapshot, payload.template);
      assert.deepEqual(row.renderedDocument, payload.rendered);
    }
  });
  await check('failed party validation rolls back the newly created validation record', async () => {
    const before = await count();
    await db.exec(`update public.parceiros set data_nascimento=null where id='${student(3)}'`);
    await assert.rejects(() => issue(3, 3), (error) => error.code === '22023');
    assert.equal(await count(), before);
  });
  await check('new and historical replays ignore later edits while authorization and immutability remain enforced', async () => {
    const before = await count();
    await db.exec(`update public.parceiros set nome='NOME ALTERADO DEPOIS';
      update test_contract_v4.financial_rules set rule='{}';
      update public.documentos_modelos_configuracoes set status='EM_REVISAO',conteudo='{}';`);
    assert.deepEqual(await issue(1), adult);
    assert.deepEqual(await issue(2), minor);
    assert.deepEqual(await issue(3, 90), historical);
    assert.equal(await count(), before);
    const historicalRow = (await db.query('select dados_emissao from public.documentos_validacao where codigo=$1',
      [historical.documents[0].validation_code])).rows[0].dados_emissao;
    assert.deepEqual(historicalRow, originalLedger);
    await assert.rejects(() => issue(2, 1), (error) => error.code === '22023');
    await db.exec("select set_config('test.allowed_tab','false',false)");
    await assert.rejects(() => issue(1), (error) => error.code === '42501');
    await db.exec("select set_config('test.allowed_tab','true',false)");
    await assert.rejects(db.query("update public.documentos_validacao set dados_emissao='{}'"),
      (error) => error.code === '55000');
  });
  console.log(`PASS: ${passed} real-emitter contract scenarios; finance source/auth/ledger boundaries explicitly isolated.`);
} catch (error) {
  console.error({ message: error.message, code: error.code, where: error.where, stack: error.code ? undefined : error.stack });
  process.exitCode = 1;
} finally { await db.close(); }
