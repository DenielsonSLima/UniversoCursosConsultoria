import assert from 'node:assert/strict';
import { test } from 'node:test';
import { database, applyRevisions, configFor } from '../../supabase/tests/ead_assessment_revision.harness.mjs';
import { generateAlignmentPublication } from './alignment-publication.mjs';

const id='99999999-9999-4999-8999-999999999999';
test('vínculo é corrigido sem trocar itens, chave ou configuração das aulas/prova', async () => {
  const db=await database();
  try {
    await applyRevisions(db);
    const config=configFor('aligned');
    config.conteudos.push({id:'aligned-lesson-2',titulo:'Outra aula'});
    config.atividades[0].etapaId='aligned-lesson';
    await db.query('INSERT INTO cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES($1,$2,$3,$4,120)',
      [id,'Curso de vínculo sintético','EAD',config]);
    const before=(await db.query('SELECT ead_config,md5(ead_config::text) hash FROM cursos WHERE id=$1',[id])).rows[0];
    const patch={courseId:id,courseName:'Curso de vínculo sintético',hours:120,expectedConfigHash:before.hash,
      activities:[{activityId:'aligned-activity',expected:{aulaId:'aligned-lesson',etapaId:'aligned-lesson'},
        next:{aulaId:'aligned-lesson-2',etapaId:'aligned-lesson-2'}}]};
    await db.exec(generateAlignmentPublication([patch]));
    const after=(await db.query('SELECT ead_config FROM cursos WHERE id=$1',[id])).rows[0].ead_config;
    assert.equal(after.atividades[0].aulaId,'aligned-lesson-2');
    assert.equal(after.atividades[0].etapaId,'aligned-lesson-2');
    assert.deepEqual(after.conteudos,before.ead_config.conteudos);
    assert.deepEqual(after.provas,before.ead_config.provas);
    after.atividades[0].aulaId='aligned-lesson';after.atividades[0].etapaId='aligned-lesson';
    assert.deepEqual(after,before.ead_config);
    await assert.rejects(db.exec(generateAlignmentPublication([patch])),/mudou/);
    await db.exec('ROLLBACK');
  } finally {await db.close();}
});
