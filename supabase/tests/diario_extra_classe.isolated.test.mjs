import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCandidates, createDatabase, id, seed } from './diario_extra_classe.fixture.mjs';

const results = async (db, fn = 'public.get_diario_resultados') => (
  (await db.query(`select * from ${fn}($1,$2) where aluno_id=$3`, [id(2),id(3),id(5)])).rows[0]
);
const hours = async (db, student = id(5)) => Number((await db.query(
  'select internal_academic.diario_extra_classe_horas($1,$2,$3) as hours',[id(2),id(3),student],
)).rows[0].hours);
const credit = async (db) => (await db.query(
  'select internal_academic.diario_extra_classe_credito($1,$2) as credit',[id(2),id(3)],
)).rows[0].credit;
const existingMetadata = async (db) => (await db.query(`select p.proname,p.proowner,
  p.proacl::text,p.provolatile,p.prosecdef,p.proconfig
  from pg_proc p where p.oid in (
    'internal_academic.p1_get_diario_resultados_20260719(uuid,uuid)'::regprocedure,
    'internal_academic.p1_get_enrollment_results_20260730(uuid)'::regprocedure,
    'internal_academic.p1_get_pendencias_fechamento_periodo_20260719(uuid)'::regprocedure)
  order by p.proname`)).rows;
const frequency = async (db, expected) => {
  const rpc = await results(db);
  const enrollment = (await db.query(
    'select * from internal_academic.get_enrollment_results($1)',[id(6)],
  )).rows[0];
  const view = (await db.query('select * from public.v_diario_notas_resultados where aluno_id=$1',[id(5)])).rows[0];
  assert.equal(Number(rpc.frequencia_percent),expected,'Diary RPC');
  assert.equal(Number(enrollment.frequencia_percent),expected,'Enrollment result');
  assert.equal(Number(view.frequencia_percent),expected,'Canonical snapshot view');
  return rpc;
};
async function isolated(run, options) {
  const db = await createDatabase(options);
  try { await run(db); } finally { await db.close(); }
}

test('reproduz ausência das4h extras no cálculo anterior e credita sem fabricar chamada', async () => {
  await isolated(async (db) => {
    await seed(db);
    assert.equal(Number((await results(db)).frequencia_percent),75);
    const stored = (await db.query('select * from public.diario_frequencia order by aula_id')).rows;
    const beforeMetadata = await existingMetadata(db);
    await applyCandidates(db);
    assert.deepEqual(await existingMetadata(db),beforeMetadata,'Existing owner,ACL,volatility and definer boundary');
    assert.deepEqual((await db.query("select reloptions from pg_class where oid='public.v_diario_notas_resultados'::regclass")).rows,
      [{reloptions:['security_invoker=true']}]);
    const result = await frequency(db,80);
    assert.equal(result.total_aulas,3);
    assert.equal(result.total_faltas,1);
    assert.equal(result.resultado_final,'APROVADO');
    assert.equal(await hours(db),4);
    assert.equal(await hours(db,id(404)),0,'Unknown student receives no automatic hours');
    const payload = await credit(db);
    assert.equal(payload.schemaVersion,1);
    assert.deepEqual(payload.activities.map((activity) => [activity.id,activity.titulo,activity.cargaHoraria]),
      [[id(20),'Atividade domiciliar',4]]);
    assert.deepEqual(payload.eligibleActivityIdsByStudent[id(5)],[id(20)]);
    assert.deepEqual((await db.query('select * from public.diario_frequencia order by aula_id')).rows,stored);
  },{patched:false});
});

test('75% exatos aprovam e carga abaixo do limiar mantém reprovação por frequência', async () => {
  await isolated(async (db) => {
    await seed(db);
    await db.exec(`update public.diario_frequencia set status='F' where aula_id='${id(11)}';
      update public.diario_frequencia set status='P' where aula_id='${id(13)}';
      update public.atividades_extra_classe set carga_horaria_compensacao=16;`);
    assert.equal((await frequency(db,75)).resultado_final,'APROVADO');
    await db.exec('update public.atividades_extra_classe set carga_horaria_compensacao=15.98');
    assert.equal((await frequency(db,74.98)).resultado_final,'REPROVADO_FREQUENCIA');
  });
});

test('atividade vencida não exige resposta, nota nem presença; presencial ausente continua pendente', async () => {
  await isolated(async (db) => {
    await seed(db);
    await frequency(db,80);
    await db.exec(`delete from public.diario_frequencia where aula_id='${id(12)}'`);
    const result = await results(db);
    assert.equal(result.frequencia_percent,null);
    assert.equal(result.resultado_final,'FREQUENCIA_PENDENTE');
    assert.equal(await hours(db),4);
  });
});

test('somente PUBLICADA positiva com prazo vencido/hoje ou sem prazo recebe crédito', async () => {
  await isolated(async (db) => {
    await seed(db);
    await db.exec(`insert into public.atividades_extra_classe
      (id,turma_id,disciplina_id,titulo,status,carga_horaria_compensacao,prazo_entrega) values
      ('${id(21)}','${id(2)}','${id(3)}','Futura','PUBLICADA',30,current_date+1),
      ('${id(22)}','${id(2)}','${id(3)}','Rascunho','RASCUNHO',30,current_date-1),
      ('${id(23)}','${id(2)}','${id(3)}','Arquivada','ARQUIVADA',30,current_date-1),
      ('${id(24)}','${id(2)}','${id(3)}','Sem horas','PUBLICADA',0,current_date-1),
      ('${id(25)}','${id(2)}','${id(3)}','Hoje','PUBLICADA',2,current_date),
      ('${id(26)}','${id(2)}','${id(3)}','Sem prazo','PUBLICADA',3,null),
      ('${id(27)}','${id(99)}','${id(3)}','Outra turma','PUBLICADA',30,current_date-1),
      ('${id(28)}','${id(2)}','${id(99)}','Outra disciplina','PUBLICADA',30,current_date-1);`);
    assert.equal(await hours(db),9);
    assert.deepEqual((await credit(db)).activities.map((a) => a.id).sort(),[id(20),id(25),id(26)].sort());
    await frequency(db,84);
  });
});

test('trancamento/transferência/cancelamento/desistência respeitam data da atividade', async () => {
  await isolated(async (db) => {
    await seed(db);
    for (const status of ['TRANCADO','TRANSFERIDO','CANCELADO','DESISTENTE']) {
      await db.query('update public.matriculas set status=$1',[status]);
      await db.exec('delete from public.matricula_movimentacoes');
      await db.query(`insert into public.matricula_movimentacoes
        (matricula_id,status_anterior,status_novo,data_movimentacao)
        values($1,'ATIVO',$2,current_date-11)`,[id(6),status]);
      assert.equal(await hours(db),0,`${status} before activity`);
      await db.exec('update public.matricula_movimentacoes set data_movimentacao=current_date-10');
      assert.equal(await hours(db),0,`${status} on the activity date`);
      await db.exec('update public.matricula_movimentacoes set data_movimentacao=current_date-9');
      assert.equal(await hours(db),4,`${status} after activity preserves earned hours`);
      await db.exec('delete from public.matricula_movimentacoes');
      assert.equal(await hours(db),0,`${status} without evidence stays conservative`);
    }
  });
});

test('reativação preserva intervalo trancado e volta a creditar após retomada', async () => {
  await isolated(async (db) => {
    await seed(db);
    await db.exec(`insert into public.matricula_movimentacoes
      (id,matricula_id,status_anterior,status_novo,data_movimentacao,created_at) values
      ('${id(31)}','${id(6)}','ATIVO','TRANCADO',current_date-11,now()-interval '2 days'),
      ('${id(32)}','${id(6)}','TRANCADO','ATIVO',current_date-9,now()-interval '1 day');`);
    assert.equal(await hours(db),0,'Activity during leave is not retroactively credited');
    await db.exec('update public.atividades_extra_classe set prazo_entrega=current_date-8');
    assert.equal(await hours(db),4,'Activity after readmission is credited');
  });
});

test('ingresso após atividade exclui crédito e movimento retroativo prevalece sobre cadastro tardio', async () => {
  await isolated(async (db) => {
    await seed(db);
    await db.exec('update public.matriculas set data_matricula=current_date-5');
    assert.equal(await hours(db),0,'Later registration cannot earn an earlier activity');
    await frequency(db,75);
    for (const tipo of ['MATRICULA','TRANSFERENCIA_EXTERNA_RECEBIDA']) {
      await db.exec('delete from public.matricula_movimentacoes');
      await db.query(`insert into public.matricula_movimentacoes
        (matricula_id,tipo,status_novo,data_movimentacao)
        values($1,$2,'ATIVO',current_date-30)`,[id(6),tipo]);
      assert.equal(await hours(db),4,`${tipo}: effective admission predates late import`);
      await frequency(db,80);
      await db.exec('update public.matricula_movimentacoes set data_movimentacao=current_date-10');
      assert.equal(await hours(db),4,`${tipo}: admission on the activity date is eligible`);
      await db.exec('update public.matricula_movimentacoes set data_movimentacao=current_date-5');
      assert.equal(await hours(db),0,`${tipo}: effective admission after the activity is excluded`);
    }
  });
});

test('PENDENTE precisa liberação vigente e fora do roster não ganha horas', async () => {
  await isolated(async (db) => {
    await seed(db,{status:'PENDENTE'});
    assert.equal(await hours(db),0);
    await db.exec(`insert into public.matricula_liberacoes_diario values('${id(6)}',null)`);
    assert.equal(await hours(db),4);
    await db.exec('update public.matricula_liberacoes_diario set revogado_em=now()');
    assert.equal(await hours(db),0);
    await db.exec(`update public.matriculas set status='ATIVO';
      insert into public.diario_matriculas_roster values('${id(2)}','${id(3)}','${id(80)}','${id(81)}');`);
    assert.equal(await hours(db),0,'Frozen roster excludes an unlisted student');
  });
});

test('dependência usa matrícula de origem sem criar matrícula na reoferta', async () => {
  await isolated(async (db) => {
    await seed(db);
    await db.exec(`update public.matriculas set turma_id='${id(70)}',status='EM_DEPENDENCIA';
      insert into public.matricula_componentes(id,matricula_id,disciplina_id,status)
      values('${id(71)}','${id(6)}','${id(3)}','EM_CURSO');
      insert into public.matricula_disciplina_tentativas(id,componente_id,turma_id,disciplina_id,status)
      values('${id(72)}','${id(71)}','${id(2)}','${id(3)}','EM_CURSO');`);
    assert.equal(await hours(db),4);
    assert.equal(Number((await results(db)).frequencia_percent),80);
    assert.equal((await db.query('select count(*)::integer as count from public.matriculas')).rows[0].count,1);
  });
});

test('aproveitamento e histórico importado continuam prioritários', async () => {
  await isolated(async (db) => {
    await seed(db);
    await db.exec(`insert into public.matricula_aproveitamentos(matricula_id,disciplina_id,media_final,frequencia_percent)
      values('${id(6)}','${id(3)}',9.05,93.25);`);
    const aproveitado = await results(db);
    assert.equal(aproveitado.resultado_final,'APROVEITADO');
    assert.equal(Number(aproveitado.frequencia_percent),93.25);
    await db.exec(`insert into internal_academic.diario_resultados_importados
      (id,matricula_id,ativo,turma_id,disciplina_id,aluno_id,total_aulas,total_faltas,
      frequencia_percent,media_parcial,media_final,resultado_final)
      values('${id(40)}','${id(6)}',true,'${id(2)}','${id(3)}','${id(5)}',7,2,81.5,7.25,7.25,'APROVADO');
      insert into internal_academic.test_history_rows(turma_id,disciplina_id,aluno_id,total_aulas,total_faltas,
      frequencia_percent,media_parcial,media_final,resultado_final)
      values('${id(2)}','${id(3)}','${id(5)}',7,2,81.5,7.25,7.25,'APROVADO');`);
    const historical = await frequency(db,81.5);
    assert.equal(Number(historical.media_final),7.25);
    assert.equal(historical.total_aulas,7);
    assert.equal(historical.total_faltas,2);
  });
});

test('disciplina só com extra tem100% mas nota ausente não aprova', async () => {
  await isolated(async (db) => {
    await seed(db,{presencial:false});
    const approved = await frequency(db,100);
    assert.equal(approved.total_aulas,0);
    assert.equal(approved.total_faltas,0);
    assert.equal(approved.resultado_final,'APROVADO');
    await db.exec('delete from public.diario_notas');
    assert.equal((await results(db)).resultado_final,'SEM_LANCAMENTO');
  });
});

test('ACL e guarda da RPC negam acesso sem identidade e não ampliam helpers privados', async () => {
  await isolated(async (db) => {
    await seed(db);
    const metadata = (await db.query(`select p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='internal_academic' and p.proname in
      ('diario_extra_classe_credito','diario_extra_classe_horas')`)).rows;
    assert.equal(metadata.length,3,'JSON and UUID overloads remain private');
    assert.ok(metadata.every((p) => !p.anon && !p.authenticated));
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
    await assert.rejects(db.query('select * from public.get_diario_resultados($1,$2)',[id(2),id(3)]),
      (error) => error.code==='42501');
    await assert.rejects(db.query('select * from public.get_diario_extra_classe_credito($1,$2)',[id(2),id(3)]),
      (error) => error.code==='42501');
    await db.exec('grant usage on schema internal_academic to authenticated; set role authenticated');
    await assert.rejects(db.query('select internal_academic.diario_extra_classe_horas($1,$2,$3)',[id(2),id(3),id(5)]),
      (error) => error.code==='42501');
  });
});
