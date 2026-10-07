import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContratosAlunoPdf } from '../../modules/gestor/secretaria/contratos-aluno/contratos-aluno.pdf.ts';
import { createDatabase, sql, fixture, closing, page, plain, id, version } from './contract_v3_pagination.test-support.mjs';

const db = await createDatabase();
const scalar = async (query, args = []) => (await db.query(query, args)).rows[0].value;
const paginate = (body, footer = closing, title = page('').title) => scalar(
  'select public.paginar_contrato_aluno_minuta_completa($1,$2,$3,$4) value',
  ['Minuta sintética', title, body, footer],
);
const project = (rendered) => scalar('select public.repaginar_render_contrato_v3($1,$2) value',
  [JSON.stringify(rendered), version]);
let checks = 0;
const checked = (label) => { checks += 1; console.log(`PASS ${checks}: ${label}`); };

try {
  const doc = fixture();
  const body = doc.renderPayload.template.corpo.replace(/\{\{[^}]+\}\}/gu, 'Informação sintética');
  doc.renderPayload.rendered.pages = await paginate(body);
  doc.renderPayload.rendered.pages.splice(2, 0, page(
    Array(61).fill('Cláusula sintética para testar o limite físico.').join('\n'),
  ));
  const frozenBody = doc.renderPayload.rendered.pages.map((p) => p.body).join(' ');
  // A mensagem do incidente deve ser reproduzida antes de corrigir o paginador.
  await assert.rejects(createContratosAlunoPdf([doc]), /ultrapassa a área segura/u);
  checked('regressão reproduz o erro anterior no compositor oficial');

  const publicSignatures = [
    'public.preparar_emissao_contrato_aluno_secure(uuid,text,uuid[],text,uuid)',
    'public.search_secretaria_emissions_secure(uuid,text,uuid,text,integer,integer)',
  ];
  const access = async () => (await db.query(`select oid::regprocedure::text signature,
    proacl::text acl,prosecdef,proconfig from pg_proc where oid=any($1::regprocedure[])`,
  [publicSignatures])).rows;
  const beforeAccess = await access();
  await db.exec(sql('20261007142216_fix_contract_v3_line_aware_pagination.sql'));
  await db.exec(sql('20261007142245_project_safe_contract_render_on_existing_reads.sql'));
  assert.deepEqual(await access(), beforeAccess);
  const helpers = (await db.query(`select proname,
    has_function_privilege('anon',oid,'execute') as anon,
    has_function_privilege('authenticated',oid,'execute') as authenticated
    from pg_proc where proname in ('estimar_linhas_contrato_v3',
      'repaginar_render_contrato_v3','repaginar_resposta_contrato_v3')`)).rows;
  assert.equal(helpers.length, 3);
  assert.ok(helpers.every((helper) => !helper.anon && !helper.authenticated));
  checked('assinaturas, ACL e guardas públicas preservadas; helpers privados');

  const projected = await project(doc.renderPayload.rendered);
  assert.equal(plain(projected.pages.map((p) => p.body).join(' ')), plain(frozenBody));
  assert.equal(projected.pages.at(-1).footer, closing);
  assert.deepEqual(projected.watermark, doc.renderPayload.rendered.watermark);
  assert.deepEqual(projected.qr, doc.renderPayload.rendered.qr);
  assert.deepEqual(await project(projected), projected);
  const safeDoc = structuredClone(doc);
  safeDoc.renderPayload.rendered = projected;
  const pdf = await createContratosAlunoPdf([safeDoc]);
  assert.ok(pdf.blob.size > 1000);
  checked('projeção determinística preserva texto, encerramento, QR e marca; PDF real passa');

  const safeBody = await paginate(body);
  const newDoc = structuredClone(doc);
  newDoc.renderPayload.rendered.pages = safeBody;
  await createContratosAlunoPdf([newDoc]);
  assert.equal(plain(safeBody.map((p) => p.body).join(' ')), plain(body));
  checked('nova emissão recebe paginação segura diretamente do servidor');

  for (const input of ['', 'linha\n'.repeat(150), 'linha\r\n'.repeat(100),
    'linha\r'.repeat(100), `${'W'.repeat(40)} `.repeat(80),
    'texto sintético com espaço '.repeat(250), 'cláusula\n\n'.repeat(100),
    Array(600).fill('responsabilidade').join('\u00a0'),
    Array(150).fill('Cláusula').join('\\n')]) {
    const pages = await paginate(input, closing,
      'Contrato de teste com título suficientemente longo para quebrar em duas linhas e preservar a margem segura');
    const boundary = structuredClone(doc);
    boundary.renderPayload.rendered.pages = pages;
    await createContratosAlunoPdf([boundary]);
    assert.equal(plain(pages.map((p) => p.body).join(' ')), plain(input));
  }
  await assert.rejects(paginate('W'.repeat(1000)), /palavra maior/u);
  const longFooter = structuredClone(doc);
  longFooter.renderPayload.rendered.pages = [page('', 'Rodapé muito longo.\n'.repeat(100))];
  await assert.rejects(createContratosAlunoPdf([longFooter]), /área segura/u);
  checked('limites: duas linhas de título, vazio, CR/LF, palavras largas e rodapé impossível');

  const frozen = { templateSnapshot: doc.renderPayload.template, templateRevision: 4,
    contractSnapshot: doc.renderPayload.snapshot, renderedDocument: doc.renderPayload.rendered };
  await db.query(`insert into documentos_validacao values($1,'CON-QA-SINTETICO',
    'contrato_aluno',$2,'ATIVO','2026-10-07', $3,null,null)`, [id(2), id(1), JSON.stringify(frozen)]);
  const response = { documents: [{ emission_id: 'CON-QA-SINTETICO',
    validation_code: 'CON-QA-SINTETICO', render_payload: {
      template: doc.renderPayload.template, template_revision: 4,
      snapshot: doc.renderPayload.snapshot, rendered: doc.renderPayload.rendered,
    } }], generated_at: '2026-10-07T00:00:00Z' };
  await db.query(`insert into secretaria_documentos_emissao_requisicoes values($1,'CONTRATO_ALUNO',
    md5($2),$3)`, [id(3), `${id(1)}|INDIVIDUAL||${id(4)}`, JSON.stringify(response)]);
  const records = async () => scalar(`select jsonb_build_object(
    'ledger',(select jsonb_agg(to_jsonb(d)) from documentos_validacao d),
    'requests',(select jsonb_agg(to_jsonb(r)) from secretaria_documentos_emissao_requisicoes r)
  ) value`);
  const before = await records();
  const replaySql = `select public.preparar_emissao_contrato_aluno_secure(
    '${id(1)}','INDIVIDUAL',array['${id(4)}'::uuid],null,'${id(3)}') value`;
  await assert.rejects(scalar(replaySql), /não autorizado/u);
  await db.exec("set test.authorized='true';set test.history='true'");
  const replay = await scalar(replaySql);
  assert.deepEqual(replay.documents[0].render_payload.rendered, projected);
  assert.equal(replay.documents[0].validation_code, 'CON-QA-SINTETICO');
  assert.equal(replay.documents[0].render_payload.template_revision, 4);
  assert.deepEqual(replay.documents[0].render_payload.template, doc.renderPayload.template);
  assert.deepEqual(await scalar(replaySql), replay);
  assert.deepEqual(await records(), before);
  await assert.rejects(scalar(replaySql.replace('INDIVIDUAL', 'LOTE')), /chave de idempotência/u);
  checked('replay autorizado é idempotente, preserva aprovação/snapshot/ID, sem novo contrato');

  const historySql = `select public.search_secretaria_emissions_secure(
    '${id(1)}','contrato_aluno',null,null,0,1) value`;
  const history = await scalar(historySql);
  assert.deepEqual(history.items[0].dados_emissao.renderedDocument, projected);
  assert.deepEqual(history.items[0].dados_emissao.templateSnapshot, frozen.templateSnapshot);
  // Um documento inválido fora da página não deve ser renderizado nem bloquear a busca.
  const invalid = structuredClone(frozen);
  invalid.renderedDocument.pages = [page('W'.repeat(1000))];
  await db.query(`insert into documentos_validacao values($1,'CON-OFFPAGE','contrato_aluno',
    $2,'ATIVO','2026-10-06',$3,null,null)`, [id(5), id(1), JSON.stringify(invalid)]);
  const bounded = await scalar(historySql);
  assert.equal(bounded.total, 2);
  assert.equal(bounded.items[0].codigo, 'CON-QA-SINTETICO');
  await db.exec("set test.history='false'");
  await assert.rejects(scalar(historySql), /nao autorizado/u);
  await assert.rejects(scalar(historySql.replace(id(1), id(6))), /nao autorizado/u);
  checked('histórico limitado à página; autorização/polo preservados; off-page não bloqueia');

  const legacy = { pages: [page('legado', closing)], qr: { enabled: true } };
  assert.deepEqual(await scalar('select public.repaginar_render_contrato_v3($1,$2) value',
    [JSON.stringify(legacy), 'CONTRATO_A4_INSTITUCIONAL_V2']), legacy);
  const source = readFileSync('modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts','utf8');
  assert.match(source, /contract\.id !== data\.id \|\| contract\.codigo !== data\.codigo/u);
  assert.doesNotMatch(sql('20261007142245_project_safe_contract_render_on_existing_reads.sql'),
    /grant execute|update public\.(documentos_validacao|documentos_modelos)/iu);
  checked('legados inalterados; leitura direta exige mesma identidade; nenhum novo grant');
  console.log(`Contrato V3: ${checks} grupos de regressão aprovados.`);
} finally {
  await db.close();
}
