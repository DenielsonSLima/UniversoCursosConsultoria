import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Isolated PostgreSQL only. Optional output is synthetic QA data, never a live model.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
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
const legacySnapshot = {
  aluno: { nome: 'Aluno de Teste', cpf: '00000000000', tipoDocumento: 'CIN', nascimento: '2000-01-01' },
  financeiro: { descontoPontualidadeExibicao: 'R$ 10,00', jurosAtrasoExibicao: 'R$ 1,00' },
};
const render = async (content, snapshot) => (await db.query(
  'select public.renderizar_contrato_aluno_documento($1,$2,$3,null) as rendered', [content, snapshot, 'TESTE']
)).rows[0].rendered;

try {
  await db.exec(await read('supabase/tests/contract_individual_finance.fixture.sql'));
  await db.exec(`
    create table public.documentos_modelos_configuracoes (
      template_key text, modalidade text, revisao integer, status text, conteudo jsonb,
      atualizado_por uuid, updated_at timestamptz, primary key (template_key, modalidade));
    create table public.documentos_modelos_historico (
      template_key text, modalidade text, revisao integer, status text,
      conteudo jsonb, atualizado_por uuid, request_id uuid);
    create table public.secretaria_documentos_emissao_requisicoes (
      request_id uuid, tipo text, fingerprint text, resposta jsonb);
    insert into public.documentos_modelos_configuracoes
      values ('contrato_aluno','TECNICO',3,'EM_REVISAO','{}',null,now());
  `);
  const original = await migration('20260807050000_create_secretaria_documentos_contrato_preceptor_calendario');
  await db.exec(definition(original, 'public.formatar_valor_brl_documento'));
  await db.exec(definition(original, 'public.paginar_texto_documento_canonico'));
  await db.exec(definition(await migration('20260622161000_integrate_enrollment_receivables'), 'public.data_vencimento_mensal'));
  await db.exec(definition(await migration('20261010190000_external_transfer_schedule_contract'), 'internal_academic.normalize_transfer_schedule'));
  await db.exec(await migration('20261007142216_fix_contract_v3_line_aware_pagination'));
  await db.exec(await migration('20261009163050_contract_student_identity_render'));
  await db.exec(await migration('20261009163100_contract_student_identity_snapshot'));
  // Run the original, versioned template factory; no copied production content.
  const draftMigration = await migration('20260809210000_create_full_technical_contract_draft');
  const factoryStart = draftMigration.indexOf('do $create_full_contract_draft$');
  const factoryEnd = draftMigration.indexOf('$create_full_contract_draft$;', factoryStart);
  assert.ok(factoryStart > 0 && factoryEnd > factoryStart);
  await db.exec(draftMigration.slice(factoryStart, factoryEnd + '$create_full_contract_draft$;'.length));
  const configuredLayout = { version: 1, elements: { qr: { x: 170, y: 238, width: 21 } } };
  await db.query(`update public.documentos_modelos_configuracoes set status='ATIVO',
    conteudo=jsonb_set(conteudo,'{layoutEncerramento}',$1)`, [configuredLayout]);
  const model = (await db.query('select * from public.documentos_modelos_configuracoes')).rows[0];
  const legacyRendered = await render(model.conteudo, legacySnapshot);

  for (const name of [
    '20261013120000_contract_individual_financial_plan', '20261013120100_contract_financial_summary',
    '20261013120200_freeze_contract_individual_finance', '20261013121000_contract_party_snapshot',
    '20261013121100_contract_individual_terms_render', '20261013121200_revise_technical_contract_individual_terms',
    '20261013123000_contract_v4_pagination', '20261013123010_contract_v4_renderer_pagination',
  ]) await db.exec(await migration(name));
  await db.exec(await read('supabase/tests/contract_individual_terms.rollback.sql'));
  const revised = (await db.query('select * from public.documentos_modelos_configuracoes')).rows[0];
  assert.equal(revised.revisao, model.revisao + 1);
  assert.equal(revised.status, 'EM_REVISAO');
  assert.equal(revised.conteudo.presentationVersion, 'CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL');
  for (const key of ['tituloDocumento', 'cabecalho', 'corpo', 'rodape']) {
    assert.ok(revised.conteudo[key]?.trim(), `emitter required model field: ${key}`);
  }
  for (const key of ['layoutEncerramento', 'qr', 'marcaDagua', 'sourceDocument', 'regrasDinamicas']) {
    assert.deepEqual(revised.conteudo[key], model.conteudo[key], key);
  }
  assert.deepEqual(await render(model.conteudo, legacySnapshot), legacyRendered, 'historical render parity');
  const emitter = (await db.query(`select pg_get_functiondef(
    'public.preparar_emissao_contrato_aluno_base_secure(uuid,text,uuid[],text,uuid)'::regprocedure) as value`)).rows[0].value;
  assert.match(emitter, /contract_party_snapshot\(\s*v_snapshot, \(v_issued\.emitido_em at time zone 'America\/Maceio'\)::date/u);
  assert.equal(emitter.split('internal_academic.freeze_contract_individual_finance').length - 1, 1);
  assert.ok(emitter.indexOf('internal_academic.freeze_contract_individual_finance')
    < emitter.indexOf('v_rendered := public.renderizar_contrato_aluno_documento'));

  const rule = {
    origem: 'TURMA', identidade: { efetivaFingerprint: 'synthetic-fingerprint' },
    cobranca: { matricula: { habilitada: true, valor: 180 },
      mensalidade: { habilitada: true, quantidade: 10, valor: 310.25 },
      rematricula: { habilitada: true, valor: 90 } },
    encargos: { descontoPontualidade: 15.25, jurosAtrasoPercentual: 1.5, multaAtrasoPercentual: 2 },
    aplicacao: { matricula: { desconto: false, multaJuros: false },
      mensalidade: { desconto: true, multaJuros: true }, rematricula: { desconto: false, multaJuros: true } },
    continuidade: { maxCiclos: 2 }, vencimento: { diaBase: 12 },
  };
  const finance = (await db.query(`select internal_academic.contract_financial_summary(
    internal_academic.contract_financial_plan($1,null,'[]',date '2027-01-12')) as result`, [rule])).rows[0].result;
  const snapshot = (await db.query(`select internal_academic.contract_party_snapshot($1,date '2026-10-13') as snapshot`, [{
    aluno: { ...legacySnapshot.aluno, nascimentoExibicao: '01/01/2000', telefone: 'Contato fictício',
      endereco: { logradouro: 'Rua de Teste', numero: '100', cep: '00000-000', cidade: 'Cidade de Teste', uf: 'SE' } },
    curso: { nome: 'Curso Técnico de Teste', modalidade: 'TECNICO', cargaHoraria: 1800 },
    turma: { nome: 'Turma de Teste', inicioExibicao: '01/01/2027', previsaoTerminoExibicao: '31/12/2028' },
    instituicao: { nome: 'Instituição de Teste', razaoSocial: 'Instituição de Teste LTDA', cnpj: '00.000.000/0000-00',
      endereco: 'Rua Institucional de Teste', numero: '10', bairro: 'Bairro de Teste', cidade: 'Cidade de Teste', uf: 'SE',
      cep: '00000-000', presentationVersion: revised.conteudo.presentationVersion },
    emissao: { dataExibicao: '13/10/2026' }, financeiro: finance,
  }])).rows[0].snapshot;
  const rendered = await render(revised.conteudo, snapshot);
  const body = rendered.pages.map((page) => page.body).join('\n');
  assert.ok(body.includes('CONTRATANTE: Aluno de Teste'));
  assert.ok(body.includes('Valor total do contrato, incluindo matrícula e rematrículas previstas: R$ 6.475,00'));
  assert.ok(body.includes('1,5% ao mês'));
  assert.doesNotMatch(body, /\{\{|canônic|CONTRATANTE: Não informado/u);
  assert.ok(rendered.pages.length > 1 && rendered.pages.at(-1).footer);
  await assert.rejects(db.query('select internal_academic.revise_contract_individual_terms($1)', [
    { ...model.conteudo, corpo: model.conteudo.corpo.replace('condicionado à validação jurídica', 'texto personalizado') },
  ]));
  if (process.env.CONTRACT_TERMS_OUTPUT) await writeFile(process.env.CONTRACT_TERMS_OUTPUT, JSON.stringify({
    template: revised.conteudo, template_revision: revised.revisao, snapshot, rendered,
  }, null, 2));
  console.log(`PASS: source template, 8 candidate migrations, party SQL cases, financial plan → renderer → V4 (${rendered.pages.length} pages), historical parity and model safeguards.`);
} finally {
  await db.close();
}
