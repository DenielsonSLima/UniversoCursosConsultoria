import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createDatabase, functionSql, id, seed } from './diario_extra_classe.fixture.mjs';

const read = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
let db;
const credit = async () => (await db.query(
  'select public.get_diario_extra_classe_credito($1,$2) as credit',[id(2),id(3)],
)).rows[0].credit;
const manage = (action, origin = id(11), expected = null) => db.query(`
  select result.* from public.gerenciar_atividade_extra_classe($1,$2,$3,$4,$5,$6,$7) result`,
[id(20),action,'Atividade revisada',null,4,expected,origin]);
const activityInsert = (origin, turma = id(2), subject = id(3)) => db.query(`
  insert into public.atividades_extra_classe
    (turma_id,disciplina_id,titulo,status,carga_horaria_compensacao,prazo_entrega,aula_origem_id)
  values($1,$2,'Novo complemento','PUBLICADA',2,current_date-15,$3) returning *`,[turma,subject,origin]);
const rejectCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);

before(async () => {
  db = await createDatabase();
  await seed(db);
  await db.exec(`alter table public.aulas_turma add column titulo text default 'Aula sintética',
    add column sessao char(1) default 'U',add column created_at timestamptz default now();
    alter table public.atividades_extra_classe add column tema text,
    add column status_antes_arquivo text,add column atualizado_por_auth_id uuid;
    create function public.can_operate_atividade_extra(uuid,uuid) returns boolean
      language sql stable as $$ select coalesce(current_setting('test.manager',true)='true',false); $$;
    create function public.can_prepare_atividade_extra(uuid,uuid) returns boolean
      language sql stable as $$ select false; $$;`);
  await db.exec(functionSql(await read('20261002191442_manage_retroactive_extra_class_activities.sql'),
    'public.gerenciar_atividade_extra_classe'));
  await db.exec(await read('20260913123351_diario_grouped_lesson_read.sql'));
  await db.exec(await read('20261110184000_extra_class_lesson_origin.sql'));
  await db.exec(await read('20261110184100_extra_class_diary_chronology.sql'));
  await db.exec(`create table public.test_answers(atividade_id uuid);
    create function public.protect_answered_content() returns trigger language plpgsql as $$
    begin
      if exists(select 1 from public.test_answers where atividade_id=old.id)
        and (new.titulo is distinct from old.titulo or new.prazo_entrega is distinct from old.prazo_entrega
          or new.carga_horaria_compensacao is distinct from old.carga_horaria_compensacao)
      then raise exception 'Answered content is immutable' using errcode='42501'; end if;
      return new;
    end; $$;
    create trigger protect_answered_content before update on public.atividades_extra_classe
      for each row execute function public.protect_answered_content();`);
});
after(async () => { await db?.close(); });

async function isolated(run) {
  await db.exec('begin');
  try { await run(); } finally { await db.exec('rollback'); }
}

test('preserva legado sem vínculo e crédito de frequência; cronologia é canônica', async () => isolated(async () => {
  const data = await credit();
  assert.equal(data.activities[0].aulaOrigemId,null,'No inferred relationship by date');
  assert.deepEqual(data.contentOrder,[
    {tipo:'AULA',id:id(11)},{tipo:'AULA',id:id(12)},
    {tipo:'AULA',id:id(13)},{tipo:'EXTRA_CLASSE',id:id(20)},
  ]);
  assert.equal(Number((await db.query(
    'select internal_academic.diario_extra_classe_horas($1,$2,$3) hours',[id(2),id(3),id(5)],
  )).rows[0].hours),4);
  assert.equal(Number((await db.query(
    'select frequencia_percent from public.get_diario_resultados($1,$2)',[id(2),id(3)],
  )).rows[0].frequencia_percent),80);
}));

test('nova atividade exige origem e FK composta impede outra turma/disciplina', async () => isolated(async () => {
  // SAVEPOINTs keep checking the real failed statements in this transaction.
  for (const [origin,turma,subject,code] of [
    [null,id(2),id(3),'23514'],[id(999),id(2),id(3),'23503'],
    [id(11),id(99),id(3),'23503'],[id(11),id(2),id(99),'23503'],
  ]) {
    await db.exec('savepoint rejected');
    await rejectCode(activityInsert(origin,turma,subject),code);
    await db.exec('rollback to savepoint rejected');
  }
  const inserted = (await activityInsert(id(11))).rows[0];
  assert.equal(inserted.aula_origem_id,id(11));
  assert.equal(inserted.turma_id,id(2));
}));

test('FK preserva sessão referenciada ao excluir ou mover contexto da aula', async () => isolated(async () => {
  await activityInsert(id(11));
  await db.exec('savepoint rejected');
  await rejectCode(db.query('delete from public.aulas_turma where id=$1',[id(11)]),'23514');
  await db.exec('rollback to savepoint rejected');
  await assert.rejects(db.query('update public.aulas_turma set turma_id=$1 where id=$2',[id(99),id(11)]),
    error => ['23503','23001'].includes(error.code));
}));

test('edição antiga exige seleção explícita mas arquivamento/restauração continuam disponíveis', async () => isolated(async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${id(900)}',true),
    set_config('test.manager','true',true)`);
  await db.exec('savepoint rejected');
  await rejectCode(manage('EDITAR',null),'23514');
  await db.exec('rollback to savepoint rejected');
  const edited = (await manage('EDITAR')).rows[0];
  assert.equal(edited.aula_origem_id,id(11));
  assert.equal(edited.titulo,'Atividade revisada');
  await db.exec(`update public.atividades_extra_classe set aula_origem_id=null where id='${id(20)}'`)
    .then(()=>assert.fail('Existing relationship must not be cleared'), error=>assert.equal(error.code,'23514'));
}));

test('legado pode arquivar sem inventar aula e RPC conserva autorização/conflito', async () => isolated(async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${id(900)}',true),
    set_config('test.manager','true',true)`);
  const archived = (await manage('ARQUIVAR',null)).rows[0];
  assert.equal(archived.status,'ARQUIVADA');
  assert.equal(archived.aula_origem_id,null);
  await db.exec('savepoint rejected');
  await rejectCode(manage('RESTAURAR',null,'2000-01-01T00:00:00Z'),'40001');
  await db.exec('rollback to savepoint rejected');
  await db.exec("select set_config('test.manager','false',true)");
  await rejectCode(manage('RESTAURAR',null),'42501');
}));

test('mesma data coloca aula antes do complemento e não duplica sessão M/T', async () => isolated(async () => {
  await db.query(`update public.aulas_turma set sessao='M' where id=$1`,[id(11)]);
  await db.query(`insert into public.aulas_turma
    (id,turma_id,disciplina_id,data_aula,carga_horaria,sessao)
    values($1,$2,$3,current_date-20,4,'T')`,[id(10),id(2),id(3)]);
  await db.query(`update public.atividades_extra_classe set prazo_entrega=current_date-20,
    aula_origem_id=$1 where id=$2`,[id(10),id(20)]);
  const data = await credit();
  assert.equal(data.activities[0].aulaOrigemId,id(10),'Session identity is preserved');
  assert.deepEqual(data.contentOrder.slice(0,2),[
    {tipo:'AULA',id:id(11)},{tipo:'EXTRA_CLASSE',id:id(20)},
  ]);
  assert.equal(data.contentOrder.filter((row)=>row.tipo==='AULA').length,3);
}));

test('ACL não expõe helpers privados ou RPC a anon', async () => isolated(async () => {
  const grants = (await db.query(`select p.oid::regprocedure::text as name,
    has_function_privilege('anon',p.oid,'execute') as anon,
    has_function_privilege('authenticated',p.oid,'execute') as authenticated
    from pg_proc p where p.oid in (
      'internal_academic.diario_content_order(jsonb,jsonb)'::regprocedure,
      'internal_academic.require_extra_class_origin()'::regprocedure,
      'public.gerenciar_atividade_extra_classe(uuid,text,text,date,numeric,timestamptz,uuid)'::regprocedure)`)).rows;
  assert.ok(grants.every((row)=>!row.anon));
  assert.ok(grants.filter((row)=>row.name.startsWith('internal_academic.')).every((row)=>!row.authenticated));
  assert.equal(grants.find((row)=>row.name.startsWith('gerenciar_')).authenticated,true);
}));


test('VINCULAR_ORIGEM só muda metadado do legado respondido e mantém revisão otimista', async () => isolated(async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${id(900)}',true),
    set_config('test.manager','true',true);
    insert into public.test_answers values('${id(20)}');`);
  const before = (await db.query('select * from public.atividades_extra_classe where id=$1',[id(20)])).rows[0];
  const linked = (await manage('VINCULAR_ORIGEM')).rows[0];
  assert.equal(linked.aula_origem_id,id(11));
  for (const field of ['titulo','tema','prazo_entrega','carga_horaria_compensacao','status']) {
    assert.deepEqual(linked[field],before[field],field);
  }
  assert.equal((await db.query('select count(*) n from public.test_answers')).rows[0].n,1);
  await db.exec('savepoint rejected');
  await rejectCode(manage('VINCULAR_ORIGEM',id(12)),'23514');
  await db.exec('rollback to savepoint rejected');
  await rejectCode(manage('EDITAR',id(12)),'42501');
}));
