import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createDatabase, id, seed } from './diario_extra_classe.fixture.mjs';

const migration = await readFile(new URL(
  '../migrations/20261109114644_extra_class_legacy_rollout_evidence.sql', import.meta.url,
), 'utf8');
const hours = async (db) => Number((await db.query(
  'select internal_academic.diario_extra_classe_horas($1,$2,$3) hours', [id(2), id(3), id(5)],
)).rows[0].hours);
const result = async (db) => (await db.query(
  'select * from public.get_diario_resultados($1,$2) where aluno_id=$3', [id(2), id(3), id(5)],
)).rows[0];
const projection = async (db, expected) => {
  const diary = await result(db);
  const enrollment = (await db.query(
    'select * from internal_academic.get_enrollment_results($1)', [id(6)],
  )).rows[0];
  const legacy = (await db.query(
    'select * from public.v_diario_notas_resultados where aluno_id=$1', [id(5)],
  )).rows[0];
  for (const item of [diary, enrollment, legacy]) {
    assert.equal(Number(item.frequencia_percent), expected);
  }
  return diary;
};
const preserved = async (db) => (await db.query(`select jsonb_build_object(
  'enrollments',(select jsonb_agg(to_jsonb(m) order by m.id) from public.matriculas m),
  'movements',(select jsonb_agg(to_jsonb(m) order by m.id) from public.matricula_movimentacoes m),
  'attendance',(select jsonb_agg(to_jsonb(f) order by f.aula_id) from public.diario_frequencia f),
  'grades',(select jsonb_agg(to_jsonb(n)) from public.diario_notas n),
  'activities',(select jsonb_agg(to_jsonb(a) order by a.id) from public.atividades_extra_classe a),
  'function',(select jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl,
    'security',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile)
    from pg_proc p where p.oid='internal_academic.diario_extra_classe_credito(uuid,uuid)'::regprocedure)
) snapshot`)).rows[0].snapshot;

async function isolated(run, options) {
  const db = await createDatabase(options);
  try { await run(db); } finally { await db.close(); }
}

async function seedLegacy(db) {
  await seed(db, { presencial: false, extra: false });
  await db.exec(`update public.matriculas set data_matricula=current_date-61;
    update public.turmas_disciplinas set instrumentos_avaliativos=
      '{"p":true,"ti":true,"tg":false,"s":false,"cq":false,"o":true}';
    update public.diario_notas set nota_p=2.5,nota_ti=4.5;
    insert into public.matricula_movimentacoes
      (id,matricula_id,tipo,status_anterior,status_novo,data_movimentacao,metadados) values
      ('${id(79)}','${id(6)}','MATRICULA',null,'PENDENTE',current_date-61,'{}'),
      ('${id(80)}','${id(6)}','MATRICULA','PENDENTE','ATIVO',current_date-60,
        '{"origem":"IMPLANTACAO_LEGADA"}');`);
  for (let i = 0; i < 12; i += 1) {
    const days = [150, 143, 136, 122, 115, 108][Math.floor(i / 2)];
    await db.query('insert into public.aulas_turma values($1,$2,$3,current_date-$4::integer,4)',
      [id(100 + i), id(2), id(3), days]);
    await db.query('insert into public.diario_frequencia values($1,$2,$3,$4,$5)',
      [id(2), id(3), id(5), id(100 + i), [0, 1, 8, 9].includes(i) ? 'F' : 'P']);
  }
  for (let i = 0; i < 6; i += 1) {
    await db.query(`insert into public.atividades_extra_classe
      (id,turma_id,disciplina_id,titulo,status,carga_horaria_compensacao,prazo_entrega)
      values($1,$2,$3,'Atividade retroativa','PUBLICADA',$4,current_date-$5::integer)`,
    [id(200 + i), id(2), id(3), [5, 5, 5, 6, 6, 5][i], [144, 137, 130, 116, 109, 102][i]]);
  }
}

test('reproduz 66,67% e corrige para 80% sem mudar dados, OID ou permissões', async () => {
  await isolated(async (db) => {
    await seedLegacy(db);
    assert.equal(await hours(db), 0);
    assert.equal((await projection(db, 66.67)).resultado_final, 'REPROVADO_FREQUENCIA');
    const before = await preserved(db);
    await db.exec(migration);
    assert.deepEqual(await preserved(db), before);
    assert.equal(await hours(db), 32);
    const corrected = await projection(db, 80);
    assert.equal(corrected.resultado_final, 'APROVADO');
    assert.equal(Number(corrected.media_final), 7);
    assert.equal(corrected.total_aulas, 12);
    assert.equal(corrected.total_faltas, 4);
    await db.exec(migration);
    assert.deepEqual(await preserved(db), before, 'Repeat deployment is data-idempotent');
    await projection(db, 80);
  }, { legacyPatched: false });
});

test('cadastro tardio sem marcador, sem prova individual ou fora da oferta não ganha crédito', async () => {
  await isolated(async (db) => {
    await seedLegacy(db);
    await db.exec(`update public.matricula_movimentacoes set metadados='{}' where id='${id(80)}'`);
    assert.equal(await hours(db), 0, 'Late registration alone is not evidence');
    await db.exec(`update public.matricula_movimentacoes
      set metadados='{"origem":"IMPLANTACAO_LEGADA"}' where id='${id(80)}';
      update public.diario_frequencia set disciplina_id='${id(999)}'`);
    assert.equal(await hours(db), 0, 'Other subject cannot prove this offer');
    await db.exec(`update public.diario_frequencia set disciplina_id='${id(3)}',turma_id='${id(999)}'`);
    assert.equal(await hours(db), 0, 'Other class cannot prove this offer');
    await db.exec(`delete from public.diario_frequencia`);
    assert.equal(await hours(db), 0, 'A grade and rollout marker are insufficient');
    assert.equal((await result(db)).resultado_final, 'FREQUENCIA_PENDENTE');
  });
});

test('primeira chamada delimita evidência; extra anterior fica fora e chamada incompleta continua pendente', async () => {
  await isolated(async (db) => {
    await seedLegacy(db);
    await db.exec(`delete from public.diario_frequencia where aula_id not in ('${id(108)}','${id(109)}')`);
    assert.equal(await hours(db), 11, 'Only the last two activities follow the first recorded lesson');
    assert.equal((await result(db)).frequencia_percent, null);
    assert.equal((await result(db)).resultado_final, 'FREQUENCIA_PENDENTE');
    await db.exec('update public.atividades_extra_classe set prazo_entrega=current_date-115');
    assert.equal(await hours(db), 32, 'Lesson and activity on the same date are eligible');
    await db.exec('update public.atividades_extra_classe set prazo_entrega=current_date-116');
    assert.equal(await hours(db), 0, 'Earlier activity is not inferred');
  });
});

test('sem nota não aprova; presença anterior é prova de vínculo mesmo quando marcada F', async () => {
  await isolated(async (db) => {
    await seedLegacy(db);
    await db.exec('delete from public.diario_notas');
    assert.equal((await result(db)).resultado_final, 'SEM_LANCAMENTO');
    assert.equal(Number((await result(db)).frequencia_percent), 80);
    assert.equal((await db.query('select * from public.v_diario_notas_resultados')).rows.length, 0);
    await db.exec("update public.diario_frequencia set status='F'");
    assert.equal(await hours(db), 32, 'Roll-call proves membership, not presence');
    assert.equal((await result(db)).resultado_final, 'SEM_LANCAMENTO');
    assert.equal(Number((await result(db)).frequencia_percent), 40);
  });
});

test('trancamento e saídas reais antes/no dia excluem; depois preservam; sem movimento não presumem ATIVO', async () => {
  await isolated(async (db) => {
    await seedLegacy(db);
    await db.exec('update public.atividades_extra_classe set prazo_entrega=current_date-120');
    for (const status of ['TRANCADO', 'TRANSFERIDO', 'CANCELADO', 'DESISTENTE']) {
      await db.query('update public.matriculas set status=$1', [status]);
      await db.query(`insert into public.matricula_movimentacoes
        (id,matricula_id,tipo,status_anterior,status_novo,data_movimentacao)
        values($1,$2,'ALTERACAO_STATUS','ATIVO',$3,current_date-121)`, [id(81), id(6), status]);
      assert.equal(await hours(db), 0, `${status} before activity`);
      await db.exec(`update public.matricula_movimentacoes set data_movimentacao=current_date-120 where id='${id(81)}'`);
      assert.equal(await hours(db), 0, `${status} on activity date`);
      await db.exec(`update public.matricula_movimentacoes set data_movimentacao=current_date-119 where id='${id(81)}'`);
      assert.equal(await hours(db), 32, `${status} after activity preserves credit`);
      await db.exec(`delete from public.matricula_movimentacoes where id='${id(81)}'`);
      assert.equal(await hours(db), 0, `${status} without a real dated transition stays conservative`);
    }
  });
});

test('PENDENTE real e retomada mantêm efeitos; transferência de ingresso real impede exceção', async () => {
  await isolated(async (db) => {
    await seedLegacy(db);
    await db.exec(`insert into public.matricula_movimentacoes
      (id,matricula_id,tipo,status_anterior,status_novo,data_movimentacao) values
      ('${id(81)}','${id(6)}','ALTERACAO_STATUS','ATIVO','PENDENTE',current_date-145),
      ('${id(82)}','${id(6)}','REATIVACAO','PENDENTE','ATIVO',current_date-140);`);
    assert.equal(await hours(db), 27, 'Real pending period excludes first activity');
    await db.exec(`insert into public.matricula_liberacoes_diario values('${id(6)}',null)`);
    assert.equal(await hours(db), 32, 'Explicit diary release is respected');
    await db.exec('update public.matricula_liberacoes_diario set revogado_em=now()');
    assert.equal(await hours(db), 27, 'Revoked release cannot authorize historical pending state');
    await db.exec(`delete from public.matricula_movimentacoes where id in ('${id(81)}','${id(82)}');
      insert into public.matricula_movimentacoes
        (id,matricula_id,tipo,status_novo,data_movimentacao)
      values('${id(81)}','${id(6)}','TRANSFERENCIA_EXTERNA_RECEBIDA','ATIVO',current_date-61);`);
    assert.equal(await hours(db), 0, 'Explicit real admission is not rewritten by rollout proof');
  });
});

test('edição de carga/data, arquivamento e restauração recalculam sem duplicar crédito', async () => {
  await isolated(async (db) => {
    await seedLegacy(db);
    await db.exec(`update public.atividades_extra_classe set status='ARQUIVADA' where id='${id(200)}'`);
    assert.equal(await hours(db), 27);
    await projection(db, 78.67);
    await db.exec(`update public.atividades_extra_classe set status='PUBLICADA' where id='${id(200)}'`);
    assert.equal(await hours(db), 32);
    await db.exec(`update public.atividades_extra_classe set carga_horaria_compensacao=10 where id='${id(200)}'`);
    assert.equal(await hours(db), 37);
    await projection(db, 81.18);
    await db.exec(`update public.atividades_extra_classe set prazo_entrega=current_date-151 where id='${id(200)}'`);
    assert.equal(await hours(db), 27, 'Edited date before evidence is excluded');
    await db.exec(`update public.atividades_extra_classe set prazo_entrega=current_date+1 where id='${id(200)}'`);
    assert.equal(await hours(db), 27, 'Future activity is excluded');
    await db.exec(`update public.atividades_extra_classe
      set carga_horaria_compensacao=5,prazo_entrega=current_date-144 where id='${id(200)}'`);
    assert.equal(await hours(db), 32);
    await projection(db, 80);
  });
});

test('roster congelado e histórico importado continuam prevalecendo sobre prova legada', async () => {
  await isolated(async (db) => {
    await seedLegacy(db);
    await db.exec(`insert into public.diario_matriculas_roster values
      ('${id(2)}','${id(3)}','${id(90)}','${id(91)}')`);
    assert.equal(await hours(db), 0);
    await db.exec(`delete from public.diario_matriculas_roster;
      insert into internal_academic.diario_resultados_importados
        (id,matricula_id,ativo,turma_id,disciplina_id,aluno_id,total_aulas,total_faltas,
         frequencia_percent,media_parcial,media_final,resultado_final)
      values('${id(40)}','${id(6)}',true,'${id(2)}','${id(3)}','${id(5)}',12,4,66.67,7,7,'REPROVADO_FREQUENCIA');`);
    assert.equal(await hours(db), 0, 'Documentary result is never silently recalculated');
    assert.equal(Number((await result(db)).frequencia_percent), 66.67);
    assert.equal((await result(db)).resultado_final, 'REPROVADO_FREQUENCIA');
  });
});
