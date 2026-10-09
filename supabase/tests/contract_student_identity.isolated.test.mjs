import assert from 'node:assert/strict';
import test from 'node:test';
import { createContractIdentityDatabase, createContractIdentityFixtures,
  contractFixtureSnapshot, contractFixtureTemplate } from './fixtures/contract-identity-harness.mjs';

const polo = '10000000-0000-0000-0000-000000000001';
const otherPolo = '10000000-0000-0000-0000-000000000002';
const enrollment = n => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const request = n => `80000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const student = n => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const body = rendered => rendered.pages.map(page => page.body).join('\n');
const newFields = ['tipoDocumento', 'cpf', 'rg', 'orgaoExpedidor', 'rgUfEmissao', 'rgDataEmissao'];

test('actual contract migrations preserve identity, models, authorization and immutable emissions', async t => {
  const db = await createContractIdentityDatabase();
  const issue = async (n = 1, key = n, targetPolo = polo) => (await db.query(
    'select public.preparar_emissao_contrato_aluno_secure($1,$2,$3,null,$4) as response',
    [targetPolo, 'INDIVIDUAL', [enrollment(n)], request(key)],
  )).rows[0].response;
  const search = async (targetPolo = polo) => (await db.query(
    'select public.search_secretaria_emissions_secure($1) as response', [targetPolo],
  )).rows[0].response;
  const rows = async () => (await db.query('select to_jsonb(document) as document from public.documentos_validacao document order by codigo')).rows;
  const reset = async () => {
    await db.exec(`truncate public.documentos_validacao,public.secretaria_documentos_emissao_requisicoes,public.assinatura_eletronica_envelopes;
      select set_config('test.allowed_polo','${polo}',false);
      select set_config('test.allowed_tab','true',false);
      select set_config('request.jwt.claim.role','authenticated',false);
      update public.matriculas set status = 'ATIVO';
      update public.turmas set polo_id = '${polo}';
      update public.documentos_modelos_configuracoes set status = 'ATIVO', revisao = 7;
      update public.parceiros set tipo_documento = case id
        when '${student(1)}' then 'CIN' when '${student(2)}' then 'RG (ANTIGO)' else null end;`);
    await db.query('update public.documentos_modelos_configuracoes set conteudo = $1', [contractFixtureTemplate]);
  };
  const scenario = (name, fn) => t.test(name, async () => { await reset(); await fn(); });
  const legacy = async ({ studentFields = {}, document = 'contrato_aluno', pages } = {}) => {
    const snapshot = { ...contractFixtureSnapshot, aluno: { ...contractFixtureSnapshot.aluno,
      rg: '12345678909', orgaoExpedidor: 'SSP', ...studentFields } };
    const rendered = { kind: 'CONTRATO_ALUNO', pageSize: 'A4_RETRATO',
      pages: pages || [{ header: 'Cabeçalho congelado', title: 'Contrato antigo', body: 'CPF: 12345678909, RG: 12345678909.', footer: 'Assinaturas congeladas' }],
      qr: { enabled: true, code: 'LEGACY-SYNTHETIC' }, watermark: { enabled: false } };
    await db.query(`insert into public.documentos_validacao(id,documento,matricula_id,aluno_id,polo_id,codigo,
      dados_emissao,quantidade_emissoes,emitido_em,ultima_emissao_em,validade_ate)
      values ('70000000-0000-0000-0000-000000000001',$1,$2,$3,$4,'LEGACY-SYNTHETIC',$5,3,'2026-01-01','2026-02-01','2099-01-01')`,
    [document, enrollment(1), student(1), polo, { templateKey: 'contrato_aluno', templateRevision: 2,
      templateSnapshot: contractFixtureTemplate, contractSnapshot: snapshot, renderedDocument: rendered }]);
    return { snapshot, rendered };
  };
  try {
    await scenario('new CIN, CPF/RG and CPF-only contracts freeze discriminator and null metadata individually', async () => {
      for (const [n, type] of [[1, 'CIN'], [2, 'RG (ANTIGO)'], [3, null]]) {
        const payload = (await issue(n)).documents[0].render_payload;
        const frozen = payload.snapshot.aluno;
        for (const key of newFields) assert.ok(Object.hasOwn(frozen, key), `missing frozen ${key}`);
        assert.equal(frozen.tipoDocumento, type);
        if (n === 1) {
          assert.match(body(payload.rendered), /CIN: 123\.456\.789-09/);
          assert.ok(!body(payload.rendered).includes('RG: 12345678909'));
        } else if (n === 2) {
          assert.match(body(payload.rendered), /CPF: 987\.654\.321-00, RG: 4\.139\.462-3/);
          assert.match(body(payload.rendered), /Órgão Expedidor: SSP, UF de emissão: SE, Data de emissão: 24\/01\/2020/);
        } else {
          assert.equal(frozen.rg, null);
          assert.equal(frozen.orgaoExpedidor, null);
          assert.ok(!body(payload.rendered).includes('RG/Documento:'));
        }
        assert.deepEqual(payload.template, contractFixtureTemplate);
        assert.match(body(payload.rendered), /CLÁUSULA PERSONALIZADA/);
        assert.equal(payload.snapshot.financeiro.valorParcela, 260);
      }
    });

    await scenario('authorized replay keeps original snapshot, prices and counters after registration/model changes', async () => {
      const first = await issue();
      const original = await rows();
      await db.exec(`update public.parceiros set tipo_documento = 'RG (ANTIGO)' where id = '${student(1)}';
        update public.matriculas set valor_parcela_individual = 999;
        update public.documentos_modelos_configuracoes set conteudo = '{"corpo":"TEXTO SUBSTITUÍDO"}';`);
      try {
        const replay = await issue();
        assert.deepEqual(replay, first);
        assert.deepEqual(await rows(), original);
        await assert.rejects(db.query("update public.documentos_validacao set dados_emissao = '{}'"), error => error.code === '55000');
      } finally { await db.exec('update public.matriculas set valor_parcela_individual = 260'); }
    });

    await scenario('authorization precedes replay and new issuance rejects another polo, missing enrollment or incomplete model', async () => {
      await issue();
      await db.exec("select set_config('test.allowed_tab','false',false)");
      await assert.rejects(issue(), error => error.code === '42501');
      await db.exec("select set_config('test.allowed_tab','true',false)");
      await assert.rejects(issue(1, 4, otherPolo), error => error.code === '42501');
      await assert.rejects(issue(99, 5), error => error.code === '42501');
      await db.exec(`update public.matriculas set status = 'CANCELADO' where id = '${enrollment(1)}'`);
      await assert.rejects(issue(1, 6), error => error.code === '42501');
      await db.exec("update public.matriculas set status = 'ATIVO'; update public.documentos_modelos_configuracoes set conteudo = '{}' ");
      await assert.rejects(issue(1, 7), error => error.code === '55000');
      assert.equal((await rows()).length, 1);
    });

    await scenario('legacy history adds only missing identity metadata and renders the frozen model without writes', async () => {
      const original = await legacy();
      const before = await rows();
      const response = await search();
      const item = response.items[0];
      assert.match(body(item.dados_emissao.renderedDocument), /CIN: 123\.456\.789-09/);
      assert.deepEqual(item.dados_emissao.templateSnapshot, contractFixtureTemplate);
      assert.deepEqual(item.dados_emissao.contractSnapshot.financeiro, original.snapshot.financeiro);
      assert.deepEqual(item.dados_emissao.contractSnapshot.instituicao, original.snapshot.instituicao);
      assert.equal(item.dados_emissao.templateRevision, 2);
      assert.equal(item.codigo, before[0].document.codigo);
      assert.equal(item.quantidade_emissoes, 3);
      assert.equal(item.emitido_em, before[0].document.emitido_em);
      assert.equal(item.validade_ate, before[0].document.validade_ate);
      assert.deepEqual(await rows(), before);
    });

    await scenario('explicit frozen null or known type is never inferred from a later student registration', async () => {
      for (const type of [null, '', 'RG (ANTIGO)']) {
        await db.exec('truncate public.documentos_validacao');
        const original = await legacy({ studentFields: { tipoDocumento: type } });
        const returned = (await search()).items[0].dados_emissao;
        assert.deepEqual(returned.contractSnapshot, original.snapshot);
        assert.deepEqual(returned.renderedDocument, original.rendered);
      }
    });

    await scenario('any signature envelope bypasses projection and repagination, preserving the exact original render', async () => {
      for (const status of ['PREPARADO', 'ASSINADO', 'SUBSTITUIDO']) {
        await db.exec('truncate public.documentos_validacao,public.assinatura_eletronica_envelopes');
        const original = await legacy({ pages: [{ header: 'Original', title: 'Original',
          body: 'Texto assinado congelado. '.repeat(800), footer: 'Fecho assinado' }] });
        await db.query(`insert into public.assinatura_eletronica_envelopes(documento_validacao_id,status)
          values ('70000000-0000-0000-0000-000000000001',$1)`, [status]);
        const before = await rows();
        const returned = (await search()).items[0].dados_emissao;
        assert.deepEqual(returned.renderedDocument, original.rendered);
        assert.deepEqual(returned.contractSnapshot, original.snapshot);
        assert.deepEqual(await rows(), before);
      }
    });

    await scenario('history respects polo and route guards and leaves other document kinds unchanged', async () => {
      const original = await legacy({ document: 'declaracao_matricula' });
      assert.deepEqual((await search()).items[0].dados_emissao.renderedDocument, original.rendered);
      await assert.rejects(search(otherPolo), error => error.code === '42501');
      await db.exec("select set_config('test.allowed_tab','false',false)");
      await assert.rejects(search(), error => error.code === '42501');
      await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
      assert.equal((await search(otherPolo)).total, 0);
    });

    await scenario('identity helpers remain private and security-definer entry points preserve empty search paths', async () => {
      for (const signature of ['internal_academic.contract_student_identity_text(text,jsonb)',
        'internal_academic.project_contract_identity_emission(jsonb)',
        'public.preparar_emissao_contrato_aluno_base_secure(uuid,text,uuid[],text,uuid)']) {
        const result = await db.query(`select has_function_privilege('anon',$1,'EXECUTE') as anon,
          has_function_privilege('authenticated',$1,'EXECUTE') as authenticated`, [signature]);
        assert.deepEqual(result.rows[0], { anon: false, authenticated: false });
      }
      const result = await db.query(`select proconfig from pg_proc where proname in
        ('contract_student_identity_text','project_contract_identity_emission',
         'preparar_emissao_contrato_aluno_base_secure','renderizar_contrato_aluno_documento','search_secretaria_emissions_secure')`);
      assert.equal(result.rows.length, 5);
      for (const row of result.rows) assert.deepEqual(row.proconfig, ['search_path=""']);
    });

    await scenario('explicit CPF, CNI, CNH, unknown types and missing-value sentinels keep distinct identities', async () => {
      const source = 'CPF: {{aluno.cpf}}, RG/Documento: {{aluno.rg}}, Órgão Expedidor: {{aluno.orgaoExpedidor}}, UF de emissão: {{aluno.rgUfEmissao}}, Data de emissão: {{aluno.rgDataEmissao}}';
      const renderIdentity = async fields => (await db.query(
        'select internal_academic.contract_student_identity_text($1,$2) as text',
        [source, { cpf: '12345678909', orgaoExpedidor: 'SSP', rgUfEmissao: 'SE', ...fields }],
      )).rows[0].text;
      assert.equal(await renderIdentity({ tipoDocumento: 'CPF', rg: '' }), 'CPF: 123.456.789-09');
      assert.equal(await renderIdentity({ tipoDocumento: null, rg: '12345678909' }), 'CPF: 123.456.789-09');
      assert.equal(await renderIdentity({ tipoDocumento: 'CNI', rg: '777777777' }), 'CIN: 123.456.789-09');
      const cnh = await renderIdentity({ tipoDocumento: 'CNH', rg: '01234567890' });
      assert.equal(cnh, 'CPF: 123.456.789-09, CNH: 01234567890');
      for (const missing of ['Não informado', 'não informada', '—', '–', '-', 'n/a', 'null']) {
        assert.equal(await renderIdentity({ tipoDocumento: 'RG (ANTIGO)', rg: missing }), 'CPF: 123.456.789-09');
      }
      const ambiguous = await renderIdentity({ tipoDocumento: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO', rg: null });
      assert.equal(ambiguous, 'CPF: 123.456.789-09');
      const formatted = await renderIdentity({ tipoDocumento: 'RG (ANTIGO)', rg: '1.234.567-X' });
      assert.match(formatted, /RG: 1\.234\.567-X/);
    });
  } finally { await db.close(); }
});

test('PDF fixture source uses the actual SQL renderer and preserves configured clauses and responsible CPF', async () => {
  for (const fixture of await createContractIdentityFixtures()) {
    const text = body(fixture.rendered);
    for (const expected of fixture.identity) assert.ok(text.includes(expected), expected);
    for (const absent of fixture.absent) assert.ok(!text.includes(absent), absent);
    assert.match(text, /CPF: 987\.654\.321-00/);
    assert.match(text, /CLÁUSULA PERSONALIZADA/);
    assert.equal(fixture.rendered.pages[0].title, contractFixtureTemplate.tituloDocumento);
    assert.equal(fixture.rendered.pages.at(-1).footer, contractFixtureTemplate.rodape);
  }
});
