import assert from 'node:assert/strict';
import test from 'node:test';
import { newDatabase, submit, state, pending, emit, other, certId }
  from './fixtures/ead-certificate-test-harness.mjs';

test('aprovação real emite EAD na mesma transação, sem livro/página/número ou gestor', async () => {
  const db = await newDatabase();
  try {
    const result = await submit(db);
    const data = await state(db);
    assert.equal(result.summary.quizPassed, true);
    assert.equal(data.certificates.length, 1);
    assert.equal(data.documents.length, 1);
    const certificate = data.certificates[0];
    assert.equal(result.summary.certificateId, certificate.id);
    assert.equal(certificate.status, 'FINALIZADO');
    assert.equal(certificate.nota_final, 100);
    assert.equal(certificate.emitido_por, null);
    for (const field of ['certificado_numero','pagina_livro','livro_registro']) assert.equal(certificate[field], null);
    assert.equal(certificate.emitido_em, data.documents[0].emitido_em);
    assert.equal(data.documents[0].dados_emissao.certificateId, certificate.id);
    assert.equal(data.documents[0].dados_emissao.finalGrade, 100);
    assert.equal(data.enrollment.status, 'CONCLUIDO');
    assert.equal(data.progress.certificateId, certificate.id);
  } finally { await db.close(); }
});

test('nota enviada pelo cliente não libera reprovado; requisitos de aula seguem obrigatórios', async () => {
  const db = await newDatabase();
  const incomplete = await newDatabase({ lessons: false });
  try {
    const result = await submit(db, 6);
    assert.equal(result.summary.quizPassed, false);
    assert.equal(result.summary.certificateId, null);
    assert.equal((await state(db)).certificates.length, 0);
    assert.equal((await state(db)).enrollment.status, 'ATIVO');
    await assert.rejects(submit(incomplete), /Conclua aulas/);
    assert.equal((await state(incomplete)).documents.length, 0);
  } finally { await db.close(); await incomplete.close(); }
});

test('outra identidade e matrícula sem ativação não podem concluir ou emitir', async () => {
  const db = await newDatabase();
  const inactive = await newDatabase({ status: 'PENDENTE' });
  try {
    await assert.rejects(submit(db, 10, other), /próprio aluno/);
    await assert.rejects(submit(inactive), /matrícula ativa ou concluída/);
    const privileges = (await db.query(`SELECT
      has_function_privilege('authenticated', 'internal_academic.ead_emitir_certificado_automatico(uuid)', 'EXECUTE') AS aluno,
      has_function_privilege('service_role', 'internal_academic.ead_emitir_certificado_automatico(uuid)', 'EXECUTE') AS service`)).rows[0];
    assert.deepEqual(privileges, { aluno: false, service: false });
    assert.equal((await state(db)).documents.length, 0);
    await db.exec("SELECT set_config('test.aluno_id','',false)");
    await assert.rejects(submit(db), /próprio aluno/);
    assert.equal((await state(db)).documents.length, 0);
  } finally { await db.close(); await inactive.close(); }
});

test('replay da aprovação preserva integralmente certificado, snapshot, emissão e nota', async () => {
  const db = await newDatabase();
  try {
    await submit(db);
    const before = await state(db);
    await submit(db);
    assert.deepEqual(await state(db), before);
    await assert.rejects(submit(db, 9), /outro conjunto de respostas/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('falha na emissão reverte aprovação, matrícula e criação de certificado', async () => {
  const db = await newDatabase();
  try {
    await db.exec("DELETE FROM documentos_validacao_politicas WHERE documento='certificado_ead'");
    const before = await state(db);
    await assert.rejects(submit(db), /Tipo de documento não permitido/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('legado EAD pendente elegível é liberado sem tocar data de conclusão; cancelado não renasce', async () => {
  const db = await newDatabase();
  const canceled = await newDatabase();
  try {
    await pending(db);
    await emit(db);
    assert.equal((await state(db)).certificates[0].data_conclusao, '2026-10-01');
    await pending(canceled, { status: 'CANCELADO' });
    const before = await state(canceled);
    await assert.rejects(emit(canceled), /pendente sem emissão/);
    assert.deepEqual(await state(canceled), before);
  } finally { await db.close(); await canceled.close(); }
});

test('validação revogada ou expirada impede emissão, inclusive em certificado já finalizado', async () => {
  for (const kind of ['revoked', 'expired']) {
    const db = await newDatabase();
    try {
      await submit(db);
      await db.exec(kind === 'revoked'
        ? "UPDATE documentos_validacao SET status='REVOGADO'"
        : "UPDATE documentos_validacao SET validade_ate='2000-01-01'");
      const before = await state(db);
      await assert.rejects(emit(db), /validação documental ativa/);
      assert.deepEqual(await state(db), before);
      await db.exec("UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL");
      const pendingState = await state(db);
      await assert.rejects(emit(db), /revogado|expirado/);
      assert.deepEqual(await state(db), pendingState);
    } finally { await db.close(); }
  }
});

test('snapshot ativo reutilizado permanece intacto e divergência exige revisão', async () => {
  const db = await newDatabase();
  try {
    await submit(db);
    const issued = await state(db);
    await db.exec("UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL");
    await emit(db);
    assert.deepEqual((await state(db)).documents, issued.documents);
    await db.exec("UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL");
    await db.exec(`UPDATE documentos_validacao SET dados_emissao = dados_emissao || '{"finalGrade":60}'::jsonb`);
    const before = await state(db);
    await assert.rejects(emit(db), /revisão administrativa/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('finalizador de Secretaria preserva autorização e dispensa registro somente para EAD', async () => {
  for (const modality of ['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO']) {
    const db = await newDatabase({ modality });
    try {
      await pending(db, { modality });
      await assert.rejects(db.query('SELECT finalizar_certificado_academico($1)', [certId]), /não autorizado/);
      await db.exec("SELECT set_config('test.gestor','true',false)");
      if (modality === 'TECNICO') {
        await assert.rejects(db.query('SELECT finalizar_certificado_academico($1)', [certId]), /número.*página e livro/);
        await db.query("SELECT finalizar_certificado_academico($1,'TEC-1','10','A')", [certId]);
        const cert = (await state(db)).certificates[0];
        assert.equal(cert.certificado_numero, 'TEC-1');
        assert.equal(cert.pagina_livro, '10');
        assert.equal(cert.livro_registro, 'A');
      } else {
        await db.query('SELECT finalizar_certificado_academico($1)', [certId]);
      }
      const cert = (await state(db)).certificates[0];
      assert.equal(cert.status, 'FINALIZADO');
      assert.equal(cert.modalidade, modality);
    } finally { await db.close(); }
  }
});

test('estado do documento é revalidado sob lock mesmo com resposta anterior ATIVO do emissor', async () => {
  const db = await newDatabase();
  try {
    // Simula deterministicamente mudança entre o retorno do emissor e o lock
    // do helper; a emissão real continua sendo executada pelo delegado original.
    await db.exec(`ALTER FUNCTION emitir_documento_validacao_interno(
      text,uuid,text,text,timestamptz,uuid,boolean
    ) RENAME TO emitir_documento_validacao_fixture;
    CREATE FUNCTION emitir_documento_validacao_interno(
      text,uuid,text,text,timestamptz,uuid,boolean
    ) RETURNS TABLE(codigo text,documento text,emitido_em timestamptz,
      ultima_emissao_em timestamptz,validade_ate timestamptz,status text,
      quantidade_emissoes integer,reutilizado boolean)
    LANGUAGE plpgsql AS $$ DECLARE result record; BEGIN
      SELECT * INTO result FROM public.emitir_documento_validacao_fixture($1,$2,$3,$4,$5,$6,$7);
      UPDATE public.documentos_validacao dv SET status='REVOGADO' WHERE dv.codigo=result.codigo;
      RETURN QUERY SELECT result.codigo,result.documento,result.emitido_em,
        result.ultima_emissao_em,result.validade_ate,result.status,
        result.quantidade_emissoes,result.reutilizado;
    END $$;`);
    const before = await state(db);
    await assert.rejects(submit(db), /validação documental não corresponde/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('documento de outro polo nunca é reutilizado para finalizar o EAD', async () => {
  const db = await newDatabase();
  try {
    await submit(db);
    await db.exec("UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL");
    await db.query('UPDATE documentos_validacao SET polo_id=$1', [other]);
    const before = await state(db);
    await assert.rejects(emit(db), /validação documental não corresponde/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});
