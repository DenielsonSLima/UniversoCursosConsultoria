import assert from 'node:assert/strict';
import test from 'node:test';
import {
  database, applyRevisions, publishRevision, progress, submit, upgrade, state,
  alumno, other, course, secondCourse, revision, legacy, configFor, pending, enrollment,
} from './ead_assessment_revision.harness.mjs';

test('versão antiga mantém questões, gabarito e nota até troca explícita com arquivo completo', async () => {
  const db = await database();
  try {
    await submit(db, 'old', 6);
    await applyRevisions(db);
    const before = await state(db);
    await publishRevision(db);
    const historical = await progress(db);
    assert.equal(historical.progress.quizScore, 60);
    assert.equal(historical.assessmentRevision.current, legacy);
    assert.equal(historical.assessmentRevision.available, revision);
    assert.equal(historical.assessmentRevision.canUpgrade, true);
    assert.equal(historical.effectiveEadConfig.conteudos[0].id, 'old-lesson');
    assert.equal(historical.assessmentFeedback.quiz.results['old-q0'].correctIndex, 0);
    assert.equal(historical.effectiveEadConfig.provas[0].questoes[0].respostaCorreta, undefined);
    assert.equal(historical.effectiveEadConfig.atividades[0].respostaCorreta, undefined);
    assert.equal(historical.effectiveEadConfig.provas[0].questoes[0].explicacao, undefined);
    assert.equal(historical.assessmentFeedback.quiz.results['old-q0'].explanation,
      'Resolução privada old 0: alternativa 0.');
    assert.deepEqual((await state(db)).progress, before.progress);

    const updated = await upgrade(db);
    assert.equal(updated.assessmentRevision.current, revision);
    assert.equal(updated.assessmentRevision.canUpgrade, false);
    assert.equal(updated.effectiveEadConfig.conteudos[0].id, 'new-lesson');
    assert.deepEqual(updated.progress.quizAnswers, {});
    assert.equal(updated.progress.quizScore, undefined);
    assert.deepEqual(updated.assessmentFeedback.quiz.results, {});
    assert.deepEqual(updated.assessmentFeedback.activities, {});
    assert.equal(updated.effectiveEadConfig.atividades[0].explicacao, undefined);
    const after = await state(db);
    assert.equal(after.archives.length, 1);
    assert.deepEqual(after.archives[0].progress, before.progress.progress);
    assert.equal(after.archives[0].started_at, before.progress.started_at);
    assert.equal(after.progress.started_at, before.progress.started_at);
    assert.deepEqual(after.certificates, before.certificates);
    assert.deepEqual(after.enrollment, before.enrollment);
    await upgrade(db);
    assert.deepEqual(await state(db), after);

    await assert.rejects(submit(db, 'old'), /Conclua aulas|todas as questões/);
    await db.query("SELECT ead_update_aluno_progress($1,$2,'toggle_content','new-lesson','{}')", [alumno, course]);
    await db.query("SELECT ead_update_aluno_progress($1,$2,'set_activity_answer','new-activity','{\"answer\":1}')", [alumno, course]);
    await db.query("SELECT ead_update_aluno_progress($1,$2,'complete_activity','new-activity','{}')", [alumno, course]);
    const approved = await submit(db, 'new', 10, 1);
    assert.equal(approved.summary.quizPassed, true);
    assert.equal(approved.summary.quizScore, '100');
    assert.equal(approved.assessmentFeedback.quiz.results['new-q0'].correctIndex, 1);
    assert.equal(approved.assessmentFeedback.quiz.results['new-q0'].explanation,
      'Resolução privada new 0: alternativa 1.');
    assert.equal(approved.assessmentFeedback.activities['new-activity'].explanation,
      'Resolução privada new: alternativa 1.');
  } finally { await db.close(); }
});

test('aprovação e documento antigos permanecem idênticos na leitura e replay depois da revisão', async () => {
  const db = await database();
  try {
    await submit(db);
    await applyRevisions(db);
    const before = await state(db);
    await publishRevision(db);
    const publicConfig = (await db.query('SELECT ead_config FROM cursos WHERE id=$1', [course])).rows[0].ead_config;
    assert.doesNotMatch(JSON.stringify(publicConfig), /Resolução privada new/);
    assert.match(JSON.stringify((await db.query('SELECT config FROM internal_academic.ead_course_revisions WHERE course_id=$1 AND revision=$2', [course, revision])).rows[0].config), /Resolução privada new/);
    const result = await progress(db);
    assert.equal(result.summary.quizPassed, true);
    assert.equal(result.assessmentRevision.canUpgrade, false);
    assert.equal(result.effectiveEadConfig.provas[0].questoes[0].id, 'old-q0');
    await submit(db);
    assert.deepEqual(await state(db), before);
    await assert.rejects(upgrade(db), /matrícula EAD ativa|preservados/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('certificado legado pendente emite com currículo aprovado e não com material revisado', async () => {
  const db = await database();
  try {
    await pending(db);
    await applyRevisions(db);
    await publishRevision(db);
    await db.query('SELECT internal_academic.ead_emitir_certificado_automatico($1)', [enrollment]);
    const result = await state(db);
    assert.equal(result.certificates[0].status, 'FINALIZADO');
    assert.equal(result.certificates[0].nota_final, 100);
    assert.match(JSON.stringify(result.documents[0].dados_emissao), /Aula old|Componente old/);
    assert.doesNotMatch(JSON.stringify(result.documents[0].dados_emissao), /Aula new|Componente new/);
    const before = await state(db);
    await db.query('SELECT internal_academic.ead_emitir_certificado_automatico($1)', [enrollment]);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('aluno novo recebe versão atual; outro curso mantém comportamento sem revisão', async () => {
  const db = await database();
  try {
    await applyRevisions(db);
    await publishRevision(db);
    await db.query('INSERT INTO parceiros(id,nome) VALUES($1,$2)', [other, 'Pessoa sintética']);
    await db.query('INSERT INTO matriculas(id,aluno_id,turma_id,status) SELECT gen_random_uuid(),$1,turma_id,\'ATIVO\' FROM matriculas WHERE aluno_id=$2', [other, alumno]);
    await db.query("SELECT set_config('test.aluno_id',$1,false)", [other]);
    const fresh = await progress(db, other);
    assert.equal(fresh.assessmentRevision.current, revision);
    assert.equal(fresh.assessmentRevision.canUpgrade, false);
    assert.equal(fresh.progress.assessmentRevision, undefined);
    assert.equal(fresh.effectiveEadConfig.provas[0].questoes[0].id, 'new-q0');
    await db.query("UPDATE cursos SET nome='Curso independente' WHERE id=$1", [secondCourse]);
    const unrelated = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const classId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await db.query('INSERT INTO cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES($1,$2,$3,$4,120)',
      [unrelated, 'Curso não revisionado', 'EAD', configFor('other')]);
    await db.query('INSERT INTO turmas(id,curso_id) VALUES($1,$2)', [classId, unrelated]);
    await db.query("INSERT INTO matriculas(id,aluno_id,turma_id,status) VALUES(gen_random_uuid(),$1,$2,'ATIVO')", [other, classId]);
    const ordinary = await progress(db, other, unrelated);
    assert.equal(ordinary.assessmentRevision, undefined);
    assert.equal(ordinary.effectiveEadConfig, undefined);
    assert.equal(ordinary.progress.assessmentRevision, undefined);
    assert.equal(ordinary.summary.questionsTotal, 10);
  } finally { await db.close(); }
});

test('nega troca por outro aluno, revisão divergente, cancelamento e certificado existente', async () => {
  const db = await database();
  try {
    await applyRevisions(db);
    await progress(db);
    await publishRevision(db);
    const before = await state(db);
    await assert.rejects(upgrade(db, other), /próprio aluno/);
    await assert.rejects(upgrade(db, alumno, 'outra-versao'), /disponível mudou/);
    assert.deepEqual(await state(db), before);
    await db.exec("UPDATE matriculas SET status='CANCELADO'");
    await assert.rejects(upgrade(db), /matrícula EAD ativa/);
    assert.equal((await state(db)).archives.length, 0);
    await db.exec("UPDATE matriculas SET status='ATIVO'");
    await db.query(`INSERT INTO certificados_academicos(matricula_id,aluno_id,curso_id,modalidade,status)
      VALUES($1,$2,$3,'EAD','PENDENTE')`, [enrollment, alumno, course]);
    const protectedState = await state(db);
    assert.equal((await progress(db)).assessmentRevision.canUpgrade, false);
    await assert.rejects(upgrade(db), /certificados anteriores permanecem preservados/);
    assert.deepEqual(await state(db), protectedState);
  } finally { await db.close(); }
});

test('progresso preexistente vazio recebe material novo e prende versão na primeira interação', async () => {
  const db = await database();
  try {
    await db.query(`UPDATE ead_aluno_progresso SET progress=$1`, [{
      completedContentIds: [], completedActivityIds: [], completedVideoIds: [],
      activityAnswers: {}, quizAnswers: {},
    }]);
    await applyRevisions(db);
    await progress(db);
    await publishRevision(db);
    const fresh = await progress(db);
    assert.equal(fresh.assessmentRevision.current, revision);
    assert.equal(fresh.assessmentRevision.canUpgrade, false);
    assert.equal(fresh.progress.assessmentRevision, undefined);
    await db.query("SELECT ead_update_aluno_progress($1,$2,'toggle_content','new-lesson','{}')", [alumno, course]);
    assert.equal((await progress(db)).progress.assessmentRevision, revision);
    assert.equal((await state(db)).archives.length, 0);
  } finally { await db.close(); }
});

test('protege registro privado, gabaritos e importador sem impedir edição de apresentação', async () => {
  const db = await database();
  try {
    await applyRevisions(db);
    await publishRevision(db);
    await assert.rejects(db.query('UPDATE cursos SET ead_config=$1 WHERE id=$2', [configFor(), course]), /Preserve assessmentRevision/);
    await assert.rejects(db.query('UPDATE cursos SET ead_config=$1 WHERE id=$2',
      [{ ...configFor('bad'), assessmentRevision: revision }, course]), /nova assessmentRevision/);
    await assert.rejects(db.query('UPDATE cursos SET ead_config=$1 WHERE id=$2',
      [{ ...configFor(), assessmentRevision: legacy }, course]), /anterior.*sobrescrita/);
    await db.query("UPDATE cursos SET ead_config=jsonb_set(ead_config,'{pagina,subtitulo}','\"Nova apresentação\"') WHERE id=$1", [course]);
    assert.equal((await db.query('SELECT config#>>\'{pagina,subtitulo}\' AS title FROM internal_academic.ead_course_revisions WHERE course_id=$1 AND revision=$2', [course, revision])).rows[0].title, 'Nova apresentação');
    await db.query('UPDATE cursos SET ead_config=$1 WHERE id=$2',
      [{ ...configFor('third', 1), assessmentRevision: 'matematica-futura-v3' }, course]);
    const futurePublic = (await db.query('SELECT ead_config FROM cursos WHERE id=$1', [course])).rows[0].ead_config;
    assert.equal(futurePublic.provas[0].questoes[0].explicacao, undefined);
    const acl = (await db.query(`SELECT
      has_table_privilege('authenticated','internal_academic.ead_course_revisions','SELECT') AS snapshots,
      has_table_privilege('service_role','internal_academic.ead_progress_revision_archives','SELECT') AS archives,
      has_function_privilege('anon','public.ead_start_assessment_revision(uuid,uuid,text)','EXECUTE') AS anonymous,
      has_function_privilege('authenticated','internal_academic.ead_revision_context(uuid,uuid)','EXECUTE') AS resolver`)).rows[0];
    assert.deepEqual(acl, { snapshots: false, archives: false, anonymous: false, resolver: false });
  } finally { await db.close(); }
});

test('pacote de publicação privado calcula hash e permanece inacessível aos papéis da API', async () => {
  const db = await database();
  try {
    await applyRevisions(db);
    const confidential = { ...configFor('package', 1), assessmentRevision: revision };
    await db.query(`INSERT INTO internal_academic.ead_revision_publication_packages
      (course_id,revision,expected_config_hash,config) VALUES($1,$2,md5('synthetic-old-config'),$3)`,
    [course, revision, confidential]);
    const stored = (await db.query(`SELECT config_hash,md5(config::text) AS calculated,
      config#>>'{provas,0,questoes,0,respostaCorreta}' AS answer
      FROM internal_academic.ead_revision_publication_packages WHERE course_id=$1`, [course])).rows[0];
    assert.equal(stored.config_hash, stored.calculated);
    assert.equal(stored.answer, '1');
    const acl = (await db.query(`SELECT role_name,
      has_table_privilege(role_name,'internal_academic.ead_revision_publication_packages','SELECT') AS can_read,
      has_table_privilege(role_name,'internal_academic.ead_revision_publication_packages','INSERT') AS can_write
      FROM unnest(ARRAY['anon','authenticated','service_role']) roles(role_name)`)).rows;
    assert.ok(acl.every(role => !role.can_read && !role.can_write));
    assert.equal((await db.query(`SELECT relrowsecurity FROM pg_class
      WHERE oid='internal_academic.ead_revision_publication_packages'::regclass`)).rows[0].relrowsecurity, true);
    await assert.rejects(db.query(`INSERT INTO internal_academic.ead_revision_publication_packages
      (course_id,revision,expected_config_hash,config) VALUES($1,'different',md5('old'),$2)`,
    [course, confidential]), /ead_publication_package_revision_matches/);
    await assert.rejects(db.query(`UPDATE internal_academic.ead_revision_publication_packages
      SET config_hash='arbitrary' WHERE course_id=$1`, [course]), /generated column|DEFAULT/);
  } finally { await db.close(); }
});
