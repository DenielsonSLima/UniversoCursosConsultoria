import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { configuredBulletin, createStudentBulletinDatabase, issueBulletin,
  enrollmentId, studentId, moduleId, otherModuleId, futureModuleId } from './fixtures/student-bulletin-harness.mjs';

async function scenario(run, options) {
  const db = await createStudentBulletinDatabase(options);
  try { await run(db); } finally { await db.close(); }
}
const noEmissions = async db => assert.equal((await db.query(
  'SELECT count(*)::int AS count FROM public.documentos_validacao')).rows[0].count, 0);
const reject = async (operation, code = '42501') => assert.rejects(operation, error => error.code === code);

test('malformed frozen issue date fails without replacing the authoritative date', async () => {
  await scenario(async db => {
    const first = await issueBulletin(db);
    for (const date of [null, [], {}, '', '2026-02-30', '2026-13-01']) {
      await db.query(`UPDATE public.documentos_validacao SET dados_emissao=jsonb_set(dados_emissao,
        '{documentIssueDate}',$1::jsonb) WHERE codigo=$2`, [JSON.stringify(date), first.emission.codigo]);
      await reject(() => issueBulletin(db), '55000');
      const snapshot = (await db.query('SELECT dados_emissao FROM public.documentos_validacao WHERE codigo=$1',
        [first.emission.codigo])).rows[0].dados_emissao;
      assert.deepEqual(snapshot.documentIssueDate, date);
    }
  });
});

test('own started module emits canonical matrícula, exact identity, server grades and complete model', async () => {
  await scenario(async db => {
    const source = await issueBulletin(db);
    assert.equal(source.emission.periodo_referencia, moduleId);
    assert.equal(source.emission.aluno_id, studentId);
    assert.equal(source.emission.quantidade_emissoes, 1);
    assert.equal(source.emission.validacao_publica, true);
    const businessDate = (await db.query("SELECT (now() AT TIME ZONE 'America/Maceio')::date::text AS value")).rows[0].value;
    assert.equal(source.emission.dados_emissao.documentIssueDate, businessDate);
    const academic = source.preview.academicData;
    assert.equal(academic.studentMatricula, 'UNIV-260001');
    assert.equal(academic.studentDocumentType, 'RG (ANTIGO)');
    assert.equal(academic.studentRg, '1.234.567-X');
    assert.equal(academic.studentCpf, '12345678909');
    assert.deepEqual(academic.componentes.map(row => row.discipline), ['Componente A','Componente B']);
    assert.ok(academic.componentes.every(row => row.moduleId === moduleId));
    assert.equal(academic.mediaGeral, 7);
    assert.equal(academic.frequenciaGeral, 80);
    assert.equal(academic.cargaHorariaCumprida, 40);
    assert.equal(academic.cargaHorariaTotal, 120);
    assert.equal(source.preview.template.v, 4);
    assert.deepEqual(source.preview.template.absoluteFields, configuredBulletin.absoluteFields);
    assert.deepEqual(source.preview.template.cover, configuredBulletin.cover);
    assert.deepEqual(source.emission.dados_emissao.documentTemplateSnapshot, source.preview.template);
    assert.deepEqual(source.emission.dados_emissao.academicDataSnapshot, academic);
    assert.deepEqual(source.preview.watermark, { id: '10000000-0000-0000-0000-000000000001',
      nomeFantasia: 'Polo sintético A', cidade: 'Cidade Teste', uf: 'SE',
      watermarkUrl: 'data:image/png;base64,BACKGROUND', watermarkOpacity: 0, watermarkScale: 100, watermarkRotate: false });
    assert.equal(source.emission.dados_emissao.studentRgIssuer, 'SSP');
  }, { template: configuredBulletin });
});

test('anonymous, non-student and another enrollment are denied before issuing', async () => {
  await scenario(async db => {
    await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
    await reject(() => issueBulletin(db));
    await db.exec("SELECT set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',false)");
    await reject(() => issueBulletin(db));
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${studentId}',false)`);
    await reject(() => issueBulletin(db, '50000000-0000-0000-0000-000000000002'));
    await noEmissions(db);
  });
});

test('foreign, null and not-started module cannot emit', async () => {
  await scenario(async db => {
    await reject(() => issueBulletin(db, enrollmentId, '90000000-0000-0000-0000-000000000001'));
    await reject(() => issueBulletin(db, enrollmentId, futureModuleId));
    await reject(() => issueBulletin(db, enrollmentId, null));
    await noEmissions(db);
  });
});

test('a period from another class and a not-started offering inside a started module do not leak components', async () => {
  await scenario(async db => {
    await db.exec(`UPDATE public.periodos_letivos SET turma_id='30000000-0000-0000-0000-000000000002'
      WHERE id='${moduleId}'`);
    await reject(() => issueBulletin(db));
    await noEmissions(db);
    await db.exec(`UPDATE public.periodos_letivos SET turma_id='30000000-0000-0000-0000-000000000001'
      WHERE id='${moduleId}';
      UPDATE public.periodos_letivos SET modulo_id='${moduleId}' WHERE id='${futureModuleId}';
      UPDATE public.disciplinas SET modulo_id='${moduleId}'
      WHERE id='70000000-0000-0000-0000-000000000004'`);
    const source = await issueBulletin(db);
    assert.equal(source.preview.academicData.componentes.length,2);
    assert.ok(source.preview.academicData.componentes.every(row => row.discipline !== 'Componente futuro'));
  });
});

test('private core, model and generic issuer grants do not create a student bypass', async () => {
  await scenario(async db => {
    const grants = await db.query(`SELECT
      has_function_privilege('authenticated','internal_academic.get_document_payload(uuid,text,uuid)','EXECUTE') AS core,
      has_function_privilege('authenticated','internal_academic.get_bulletin_template()','EXECUTE') AS model,
      has_function_privilege('authenticated','internal_academic.assert_bulletin_watermark(jsonb,uuid)','EXECUTE') AS watermark,
      has_function_privilege('authenticated','public.emitir_documento_validacao_interno(text,uuid,text,text,timestamptz,uuid,boolean)','EXECUTE') AS issuer,
      has_function_privilege('anon','public.obter_boletim_aluno_pdf(uuid,uuid)','EXECUTE') AS anon,
      has_function_privilege('authenticated','public.obter_boletim_aluno_pdf(uuid,uuid)','EXECUTE') AS student`);
    assert.deepEqual(grants.rows[0], { core: false, model: false, watermark: false, issuer: false, anon: false, student: true });
    await reject(() => db.query('SELECT public.get_secretaria_documento_academico($1,$2)',[enrollmentId,'boletim']));
    await db.exec('SET ROLE authenticated');
    assert.equal((await issueBulletin(db)).emission.documento, 'boletim');
    await reject(() => db.query('SELECT internal_academic.get_document_payload($1,$2,NULL)',[enrollmentId,'boletim']));
    await db.exec('RESET ROLE');
  });
});

test('gestor wrapper preserves its authorization and full-course results with added identity', async () => {
  await scenario(async db => {
    await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)");
    const payload = (await db.query('SELECT public.get_secretaria_documento_academico($1,$2) AS payload',
      [enrollmentId,'boletim'])).rows[0].payload;
    assert.equal(payload.componentes.length, 4);
    assert.equal(payload.cargaHorariaTotal, 1200);
    assert.equal(payload.studentMatricula, 'UNIV-260001');
    await reject(() => db.query('SELECT public.get_secretaria_documento_academico($1,$2)',[enrollmentId,'invalid']), '22023');
  });
});

test('existing academic eligibility is unchanged, including final class with dependency enrollment', async () => {
  await scenario(async db => {
    await db.exec(`UPDATE public.matriculas SET status='CONCLUIDO' WHERE id='${enrollmentId}'`);
    await reject(() => issueBulletin(db));
    await db.exec(`UPDATE public.matriculas SET status='EM_DEPENDENCIA' WHERE id='${enrollmentId}';
      UPDATE public.turmas SET status='FINALIZADA' WHERE id='30000000-0000-0000-0000-000000000001'`);
    assert.equal((await issueBulletin(db)).emission.documento, 'boletim');
    await db.exec("UPDATE public.cursos SET modalidade='LIVRE'");
    await reject(() => issueBulletin(db));
  });
});

test('same current content retries the same code without changing snapshots, count or validity', async () => {
  await scenario(async db => {
    const first = await issueBulletin(db);
    const replay = await issueBulletin(db);
    assert.match(first.emission.referencia_externa, /^boletim-v1:[0-9a-f]{64}$/);
    assert.equal(replay.emission.codigo, first.emission.codigo);
    assert.equal(replay.emission.quantidade_emissoes, 1);
    assert.equal(replay.emission.ultima_emissao_em, first.emission.ultima_emissao_em);
    assert.equal(replay.emission.validade_ate, first.emission.validade_ate);
    assert.deepEqual(replay.emission.dados_emissao, first.emission.dados_emissao);
    assert.deepEqual(replay.preview, first.preview);
  }, { template: configuredBulletin });
});

test('changed grades issue current results with a new code and keep the previous document immutable', async () => {
  await scenario(async db => {
    const first = await issueBulletin(db);
    const before = (await db.query('SELECT * FROM public.documentos_validacao WHERE codigo=$1',
      [first.emission.codigo])).rows[0];
    await db.exec("UPDATE public.test_diary_results SET media_final=10,frequencia_percent=100,resultado_final='APROVADO'");
    const current = await issueBulletin(db);
    assert.notEqual(current.emission.codigo, first.emission.codigo);
    assert.notEqual(current.emission.referencia_externa, first.emission.referencia_externa);
    assert.equal(current.preview.academicData.mediaGeral, 10);
    assert.equal(current.preview.academicData.frequenciaGeral, 100);
    assert.equal(first.preview.academicData.mediaGeral, 7);
    assert.equal(first.preview.academicData.frequenciaGeral, 80);
    assert.deepEqual((await db.query('SELECT * FROM public.documentos_validacao WHERE codigo=$1',
      [first.emission.codigo])).rows[0], before);
    assert.equal((await issueBulletin(db)).emission.codigo, current.emission.codigo);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.documentos_validacao')).rows[0].count, 2);
  });
});

test('session timezones cannot change the same content fingerprint or its frozen dates', async () => {
  await scenario(async db => {
    await db.exec("SET TIMEZONE='Pacific/Auckland'");
    const first = await issueBulletin(db);
    await db.exec("SET TIMEZONE='America/Los_Angeles'");
    const retry = await issueBulletin(db);
    assert.equal(retry.emission.codigo, first.emission.codigo);
    assert.deepEqual(retry.preview, first.preview);
    assert.equal((await db.query('SHOW TIMEZONE')).rows[0].TimeZone, 'America/Los_Angeles');
  });
});

test('identity, full model and institutional watermark changes create versions without rewriting history', async () => {
  await scenario(async db => {
    let previous = await issueBulletin(db);
    for (const update of [
      "UPDATE public.parceiros SET tipo_documento='CIN',rg=NULL",
      "UPDATE public.documentos_templates SET conteudo=jsonb_set(conteudo,'{footer}','{\"custom\":\"new\"}')",
      "UPDATE public.polos SET nome='Instituição atual', watermark_opacity=0.8, watermark_scale=10, watermark_rotate=true",
      "UPDATE public.documentos_validacao_politicas SET validade_dias=45"
    ]) {
      const before = (await db.query('SELECT * FROM public.documentos_validacao WHERE codigo=$1',
        [previous.emission.codigo])).rows[0];
      await db.exec(update);
      const current = await issueBulletin(db);
      assert.notEqual(current.emission.codigo, previous.emission.codigo);
      assert.deepEqual((await db.query('SELECT * FROM public.documentos_validacao WHERE codigo=$1',
        [previous.emission.codigo])).rows[0], before);
      previous = current;
    }
    assert.equal(previous.preview.watermark.watermarkOpacity, 0.8);
    assert.equal(previous.preview.watermark.watermarkScale, 10);
    assert.equal(previous.preview.watermark.watermarkRotate, true);
  }, { template: configuredBulletin });
});

test('the local issue date changes at Maceio midnight and avoids an eternally expired content identity', async () => {
  await scenario(async db => {
    const sql = await readFile(new URL('../migrations/20261011150200_student_bulletin_pdf.sql', import.meta.url), 'utf8');
    // Replace only the clock dependency; keep the timezone conversion and all RPC logic intact.
    const setClock = async instant => db.exec(sql.replace("now() AT TIME ZONE 'America/Maceio'",
      "'" + instant + "'::timestamptz AT TIME ZONE 'America/Maceio'"));
    await setClock('2026-10-12T02:59:00Z');
    const first = await issueBulletin(db);
    await setClock('2026-10-12T03:01:00Z');
    const nextDay = await issueBulletin(db);
    assert.notEqual(nextDay.emission.codigo, first.emission.codigo);
    assert.equal((await issueBulletin(db)).emission.codigo, nextDay.emission.codigo);
    await db.query("UPDATE public.documentos_validacao SET validade_ate=now()-interval '1 day' WHERE codigo=$1",[first.emission.codigo]);
    await setClock('2026-11-15T15:00:00Z');
    assert.notEqual((await issueBulletin(db)).emission.codigo, first.emission.codigo);
  });
});

test('different modules produce separate stable identities and reject corrupted cross-module snapshot', async () => {
  await scenario(async db => {
    const first = await issueBulletin(db);
    const second = await issueBulletin(db, enrollmentId, otherModuleId);
    assert.notEqual(first.emission.codigo, second.emission.codigo);
    assert.equal(second.preview.academicData.componentes.length, 1);
    assert.equal(second.preview.academicData.mediaGeral, 10);
    await db.query(`UPDATE public.documentos_validacao SET dados_emissao=jsonb_set(dados_emissao,
      '{academicDataSnapshot}', $1::jsonb) WHERE codigo=$2`, [second.preview.academicData,first.emission.codigo]);
    await reject(() => issueBulletin(db), '55000');
  });
});

test('a new content version leaves legacy snapshots and explicit null identity intact', async () => {
  await scenario(async db => {
    const issued = (await db.query(`SELECT * FROM public.emitir_documento_validacao_interno(
      'boletim',$1,$2,NULL,NULL,NULL,false)`,[enrollmentId,moduleId])).rows[0];
    await db.query(`UPDATE public.documentos_validacao SET dados_emissao=dados_emissao ||
      jsonb_build_object('studentCpf',NULL,'studentRg',NULL,'studentDocumentType',NULL,
        'documentTemplateSnapshot',$1::jsonb) WHERE codigo=$2`,[configuredBulletin,issued.codigo]);
    const before = (await db.query('SELECT * FROM public.documentos_validacao WHERE codigo=$1',[issued.codigo])).rows[0];
    const current = await issueBulletin(db);
    assert.notEqual(current.emission.codigo, issued.codigo);
    assert.deepEqual((await db.query('SELECT * FROM public.documentos_validacao WHERE codigo=$1',[issued.codigo])).rows[0], before);
    assert.equal(before.dados_emissao.studentCpf, null);
    assert.equal(current.preview.academicData.studentMatricula, 'UNIV-260001');
  });
});

test('invalid saved model fails atomically and never falls back or leaves an emission', async () => {
  await scenario(async db => {
    await reject(() => issueBulletin(db), '55000');
    await noEmissions(db);
  }, { template: { textContent: '', absoluteFields: [], v: 3 } });
});

test('malformed frozen model text or explicit null snapshot is rejected without replacement', async () => {
  await scenario(async db => {
    const first=await issueBulletin(db);
    for(const template of [{textContent:12,absoluteFields:[]},null]){
      await db.query(`UPDATE public.documentos_validacao SET dados_emissao=jsonb_set(dados_emissao,
        '{documentTemplateSnapshot}',$1::jsonb) WHERE codigo=$2`,[JSON.stringify(template),first.emission.codigo]);
      await reject(() => issueBulletin(db),'55000');
      const snapshot=(await db.query('SELECT dados_emissao FROM public.documentos_validacao WHERE codigo=$1',
        [first.emission.codigo])).rows[0].dados_emissao;
      assert.deepEqual(snapshot.documentTemplateSnapshot,template);
    }
  });
});

test('malformed frozen institution cannot fall back to a generic live header', async () => {
  await scenario(async db => {
    const first=await issueBulletin(db);
    for(const institution of [null,{},[]]){
      await db.query(`UPDATE public.documentos_validacao SET dados_emissao=jsonb_set(dados_emissao,
        '{institutionSnapshot}',$1::jsonb) WHERE codigo=$2`,[JSON.stringify(institution),first.emission.codigo]);
      await reject(() => issueBulletin(db),'55000');
      assert.deepEqual((await db.query('SELECT dados_emissao FROM public.documentos_validacao WHERE codigo=$1',
        [first.emission.codigo])).rows[0].dados_emissao.institutionSnapshot,institution);
    }
  });
});

test('malformed frozen watermark fails without replacing the snapshot or omitting the brand', async () => {
  await scenario(async db => {
    const first = await issueBulletin(db);
    const valid = first.preview.watermark;
    for (const watermark of [null, [], {}, { ...valid, watermarkUrl: {} },
      { ...valid, watermarkOpacity: '0.5' }, { ...valid, watermarkOpacity: 2 },
      { ...valid, watermarkScale: -1 }, { ...valid, watermarkRotate: null }]) {
      await db.query(`UPDATE public.documentos_validacao SET dados_emissao=jsonb_set(dados_emissao,
        '{watermarkSnapshot}',$1::jsonb) WHERE codigo=$2`, [JSON.stringify(watermark),first.emission.codigo]);
      await reject(() => issueBulletin(db), '55000');
      assert.deepEqual((await db.query('SELECT dados_emissao FROM public.documentos_validacao WHERE codigo=$1',
        [first.emission.codigo])).rows[0].dados_emissao.watermarkSnapshot, watermark);
    }
  });
});

test('an explicitly absent configured watermark URL is valid and preserves zero opacity and false rotation', async () => {
  await scenario(async db => {
    for (const url of [null, '']) {
      await db.query('UPDATE public.polos SET watermark_url=$1', [url]);
      const first = await issueBulletin(db);
      assert.equal(first.preview.watermark.watermarkUrl, url);
      assert.equal(first.preview.watermark.watermarkOpacity, 0);
      assert.equal(first.preview.watermark.watermarkScale, 100);
      assert.equal(first.preview.watermark.watermarkRotate, false);
      assert.deepEqual((await issueBulletin(db)).preview.watermark, first.preview.watermark);
    }
  });
});

test('identity revalidation after the enrollment locks rejects a changed student context before emission', async () => {
  await scenario(async db => {
    await db.exec(`CREATE TABLE public.test_identity_reads(counter integer); INSERT INTO public.test_identity_reads VALUES(0);
      CREATE OR REPLACE FUNCTION public.current_aluno_id() RETURNS uuid
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $identity$
      DECLARE count integer;
      BEGIN UPDATE public.test_identity_reads SET counter=counter+1 RETURNING counter INTO count;
        IF count=1 THEN RETURN '${studentId}'::uuid; END IF;
        RETURN NULL;
      END; $identity$`);
    await reject(() => issueBulletin(db));
    await noEmissions(db);
  });
});

test('revoked or expired emissions cannot be revived by the student', async () => {
  await scenario(async db => {
    await issueBulletin(db);
    await db.exec("UPDATE public.documentos_validacao SET status='REVOGADO'");
    await reject(() => issueBulletin(db), '55000');
    await db.exec("UPDATE public.documentos_validacao SET status='ATIVO',validade_ate=now()-interval '1 day'");
    await reject(() => issueBulletin(db), '55000');
    assert.equal((await db.query('SELECT quantidade_emissoes FROM public.documentos_validacao')).rows[0].quantidade_emissoes, 1);
  });
});

test('canonical matrícula honors the persisted academic configuration', async () => {
  await scenario(async db => {
    await db.query('INSERT INTO public.documentos_templates(id,conteudo) VALUES ($1,$2)',
      ['academicos_config',{ matriculaPrefix: 'ACA-', matriculaDigits: 5, yearFormat: 'yyyy', usePoloCode: true }]);
    assert.equal((await issueBulletin(db)).preview.academicData.studentMatricula, 'ACA-20260100001');
  });
});

test('CNI/CIN and absent document data are transported exactly without type or number inference', async () => {
  await scenario(async db => {
    await db.exec(`UPDATE public.parceiros SET tipo_documento='CNI',rg=NULL,orgao_emissor=NULL WHERE id='${studentId}'`);
    const cin = await issueBulletin(db);
    assert.equal(cin.emission.dados_emissao.studentDocumentType, 'CNI');
    assert.equal(cin.emission.dados_emissao.studentRg, null);
    await db.exec(`UPDATE public.parceiros SET tipo_documento=NULL,cpf_cnpj=NULL,rg=NULL WHERE id='${studentId}'`);
    const absent = await issueBulletin(db,enrollmentId,otherModuleId);
    assert.equal(absent.emission.dados_emissao.studentDocumentType, null);
    assert.equal(absent.emission.dados_emissao.studentCpf, null);
    assert.equal(absent.emission.dados_emissao.studentRg, null);
  });
});

test('default server template exactly matches the editor and custom live templates remain intact', async () => {
  const editor = await readFile(new URL('../../modules/gestor/cadastros/modelos-documentos/boletim/boletim.service.ts',import.meta.url),'utf8');
  const source = editor.slice(editor.indexOf('const BOLETIM_TEMPLATE_VERSION'), editor.indexOf('/**')) + '\nexport default defaultTemplate;';
  const bundle = await build({ stdin:{ contents:source, loader:'ts' }, format:'esm', write:false });
  const template = (await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))).default;
  await scenario(async db => assert.deepEqual((await issueBulletin(db)).preview.template,template));
  const custom = { ...configuredBulletin, textContent:'<p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p><p>Texto personalizado</p>' };
  await scenario(async db => {
    assert.deepEqual((await db.query("SELECT conteudo FROM public.documentos_templates WHERE id='boletim_tecnico'")).rows[0].conteudo,custom);
    assert.deepEqual((await issueBulletin(db)).preview.template,custom);
  },{template:custom});
});

test('legacy escaped quotes recognize only the full default body and preserve custom fields', async () => {
  const escaped={...configuredBulletin,textContent:configuredBulletin.textContent.replaceAll('"','\\"')};
  await scenario(async db => {
    const source=await issueBulletin(db);
    assert.equal(source.preview.template.v,4);
    assert.ok(source.preview.template.textContent.includes('class=\\"text-sm\\"'));
    assert.deepEqual(source.preview.template.absoluteFields,configuredBulletin.absoluteFields);
  },{template:escaped});
});
