import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';

// PGlite is an isolated test tool, never a connection to the remote project.
// npm install --prefix /tmp/universo-atividade-test-deps --no-save --no-package-lock @electric-sql/pglite@0.3.16
// ATIVIDADE_TEST_PGLITE_PATH=/tmp/universo-atividade-test-deps/node_modules/@electric-sql/pglite node --test supabase/tests/atividade_extra_management.isolated.test.mjs
const packagePath = process.env.ATIVIDADE_TEST_PGLITE_PATH;
const { PGlite } = await import(packagePath
  ? pathToFileURL(resolve(packagePath, 'dist/index.js')).href
  : '@electric-sql/pglite');
const db = new PGlite();
const sql = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const managementMigration = '../migrations/20261002191442_manage_retroactive_extra_class_activities.sql';
const writeMigration = '../migrations/20260714232000_activity_write_hardening.sql';
const responseMigration = '../migrations/20260714233000_activity_response_hardening.sql';
const workloadMigration = '../migrations/20260714233500_activity_academic_integration.sql';
const permissionMigration = '../migrations/20260719030645_separate_academic_operation_permissions.sql';
const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const scalar = async (query, params = []) => Object.values((await db.query(query, params)).rows[0])[0];
let nextId = 100;
let dates;
let originalDeadlineGuardReproduced = false;

async function actor(context, { gestor = true, academics = gestor, professor = '', aluno = '', actorId = uuid(1) } = {}) {
  await db.exec('reset role');
  for (const [key, value] of Object.entries({
    'test.actor': actorId, 'test.gestor': String(gestor), 'test.academics': String(academics),
    'test.professor': professor, 'test.aluno': aluno, 'test.scope_turma': context.turma,
    'request.jwt.claim.role': 'authenticated',
  })) await db.query('select set_config($1,$2,false)', [key, value]);
  await db.exec('set role authenticated');
}

async function setup({ status = 'EM_ANDAMENTO', period = 'ABERTO', limit = 30, modality = 'TECNICO' } = {}) {
  await db.exec('reset role');
  const context = Object.fromEntries(['curso', 'turma', 'modulo', 'disciplina', 'periodo', 'professor']
    .map((key) => [key, uuid(nextId++)]));
  await db.query('insert into cursos values ($1,$2)', [context.curso, modality]);
  await db.query('insert into turmas values ($1,$2,$3)', [context.turma, context.curso, status]);
  await db.query('insert into modulos (id,curso_id) values ($1,$2)', [context.modulo, context.curso]);
  await db.query('insert into disciplinas (id,modulo_id,carga_horaria) values ($1,$2,$3)',
    [context.disciplina, context.modulo, limit]);
  await db.query('insert into periodos_letivos (id,status) values ($1,$2)', [context.periodo, period]);
  await db.query('insert into turmas_disciplinas (turma_id,disciplina_id,periodo_letivo_id,professor_id) values ($1,$2,$3,$4)',
    [context.turma, context.disciplina, context.periodo, context.professor]);
  await actor(context);
  return context;
}

async function create(context, { deadline = dates.past, status = 'PUBLICADA', hours = 4, title = 'Atividade sintética' } = {}) {
  return (await db.query(`insert into atividades_extra_classe
    (turma_id,disciplina_id,titulo,tema,carga_horaria_compensacao,prazo_entrega,status)
    values ($1,$2,$3,$3,$4,$5::date,$6) returning *`,
  [context.turma, context.disciplina, title, hours, deadline, status])).rows[0];
}

async function manage(id, action, title = null, deadline = null, hours = null, expectedAt = null) {
  return (await db.query('select * from gerenciar_atividade_extra_classe($1,$2,$3,$4::date,$5::numeric,$6::timestamptz)',
    [id, action, title, deadline, hours, expectedAt])).rows[0];
}

async function row(id) {
  return (await db.query('select *, prazo_entrega::text as deadline from atividades_extra_classe where id=$1', [id])).rows[0];
}

async function hours(context) {
  return Number(await scalar('select horas_realizadas from get_diarios_turma($1) where disciplina_id=$2',
    [context.turma, context.disciplina]));
}

async function lesson(context, count) {
  await db.query('insert into aulas_turma (turma_id,disciplina_id,carga_horaria) values ($1,$2,$3)',
    [context.turma, context.disciplina, count]);
}

async function respond(context, activityId) {
  const aluno = uuid(nextId++);
  await db.exec('reset role');
  await db.query("insert into matriculas values ($1,$2,$3,'ATIVO')", [uuid(nextId++), context.turma, aluno]);
  await actor(context, { gestor: false, aluno, actorId: aluno });
  const response = (await db.query(`insert into atividade_extra_classe_respostas
    (atividade_id,aluno_id,resposta_texto) values ($1,$2,'Resposta sintética') returning *`,
  [activityId, aluno])).rows[0];
  await actor(context);
  return response;
}

before(async () => {
  await db.exec(sql('./atividade_extra_management.fixture.sql'));
  await db.exec(sql(writeMigration));
  for (const name of ['can_prepare_atividade_extra','can_operate_atividade_extra']) {
    const definition = sql(permissionMigration).match(new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, 'i'))?.[0];
    assert.ok(definition, `load the current ${name} permission helper`);
    await db.exec(definition);
  }
  await db.exec(sql(responseMigration));
  const workload = sql(workloadMigration);
  await db.exec(workload.slice(0, workload.indexOf('CREATE OR REPLACE FUNCTION public.can_access_atividade_extra_turma')));
  await db.exec(sql('./atividade_extra_workload_current.fixture.sql'));
  const diary = workload.match(/CREATE OR REPLACE FUNCTION public\.get_diarios_turma\([\s\S]*?\n\$\$;/)?.[0];
  assert.ok(diary, 'load the real diary projection, not a duplicate test implementation');
  await db.exec(diary);
  await db.exec('grant execute on function public.get_diarios_turma(uuid) to authenticated');
  dates = (await db.query(`select
    ((now() at time zone 'America/Maceio')::date - 30)::text as past,
    ((now() at time zone 'America/Maceio')::date)::text as today,
    ((now() at time zone 'America/Maceio')::date + 30)::text as future`)).rows[0];
  const original = await setup();
  await assert.rejects(create(original), /prazo.*vencido/i);
  originalDeadlineGuardReproduced = true;
  await db.exec('reset role');
  await db.exec(sql(managementMigration));
});
after(async () => { await db.close(); });

test('reproduces the original rejection before installing the corrective migration', () => {
  assert.equal(originalDeadlineGuardReproduced, true);
});

test('authorized operational staff can publish a past activity with real audit fields', async () => {
  const context = await setup();
  const activity = await create(context);
  const stored = await row(activity.id);
  assert.equal(stored.deadline, dates.past);
  assert.equal(stored.status, 'PUBLICADA');
  assert.equal(stored.criado_por_auth_id, uuid(1));
  assert.equal(stored.criado_por_tipo, 'GESTOR');
});

test('past, today and future deadlines remain valid and preserve due-date workload semantics', async () => {
  for (const deadline of [dates.past, dates.today, dates.future]) {
    const context = await setup();
    await lesson(context, 16);
    await create(context, { deadline });
    assert.equal(await hours(context), deadline === dates.future ? 16 : 20);
  }
});

test('editing accepts past deadlines and preserves identity and original authorship', async () => {
  const context = await setup();
  const activity = await create(context, { deadline: dates.future });
  const before = await row(activity.id);
  await actor(context, { actorId: uuid(2) });
  await manage(activity.id, 'EDITAR', 'Conteúdo corrigido', dates.past, 6);
  const after = await row(activity.id);
  assert.equal(after.titulo, 'Conteúdo corrigido');
  assert.equal(after.deadline, dates.past);
  assert.equal(Number(after.carga_horaria_compensacao), 6);
  for (const key of ['id','turma_id','disciplina_id','created_at','criado_por_auth_id','criado_por_tipo','criado_por_id']) {
    assert.deepEqual(after[key], before[key], key);
  }
  assert.equal(after.atualizado_por_auth_id, uuid(2));
});

test('full edit payload permits clearing a deadline but rejects missing title or hours', async () => {
  const context = await setup();
  const activity = await create(context);
  await manage(activity.id, 'EDITAR', 'Sem prazo', null, 4);
  assert.equal((await row(activity.id)).deadline, null);
  for (const [title, value] of [[null,4],['   ',4],['Título',null],['Título',0],['Título',-1],['Título','NaN']]) {
    await assert.rejects(manage(activity.id, 'EDITAR', title, dates.past, value));
  }
  assert.equal((await row(activity.id)).titulo, 'Sem prazo');
});

test('the date type still rejects impossible dates', async () => {
  const context = await setup();
  const activity = await create(context);
  await assert.rejects(manage(activity.id, 'EDITAR', 'Inválida', '2026-02-30', 4));
  assert.equal((await row(activity.id)).deadline, dates.past);
});

test('archive and restore are reversible and recalculate due workload', async () => {
  const context = await setup();
  await lesson(context, 16);
  const activity = await create(context);
  assert.equal(await hours(context), 20);
  await manage(activity.id, 'ARQUIVAR');
  assert.equal((await row(activity.id)).status, 'ARQUIVADA');
  assert.equal((await row(activity.id)).status_antes_arquivo, 'PUBLICADA');
  assert.equal(await hours(context), 16);
  await manage(activity.id, 'RESTAURAR');
  assert.equal((await row(activity.id)).status, 'PUBLICADA');
  assert.equal(await hours(context), 20);
});

test('preparatory drafts restore as drafts, without publishing or adding workload', async () => {
  for (const status of ['PLANEJADA','INSCRICOES_ABERTAS']) {
    const context = await setup({ status });
    const activity = await create(context, { status: 'RASCUNHO' });
    await manage(activity.id, 'EDITAR', 'Rascunho corrigido', dates.past, 3);
    await manage(activity.id, 'ARQUIVAR');
    assert.equal((await row(activity.id)).status_antes_arquivo, 'RASCUNHO');
    await manage(activity.id, 'RESTAURAR');
    assert.equal((await row(activity.id)).status, 'RASCUNHO');
    assert.equal(await hours(context), 0);
  }
});

test('published activities cannot be restored after the class becomes preparatory', async () => {
  const context = await setup();
  const activity = await create(context);
  await manage(activity.id, 'ARQUIVAR');
  await db.exec('reset role');
  await db.query("update turmas set status='PLANEJADA' where id=$1", [context.turma]);
  await actor(context);
  await assert.rejects(manage(activity.id, 'RESTAURAR'));
  assert.equal((await row(activity.id)).status, 'ARQUIVADA');
});

test('closed periods and finalized classes remain read-only for every management action', async () => {
  for (const state of ['FECHADO','FINALIZADA']) {
    const context = await setup();
    const active = await create(context);
    const archived = await create(context);
    await manage(archived.id, 'ARQUIVAR');
    await db.exec('reset role');
    if (state === 'FECHADO') await db.query("update periodos_letivos set status='FECHADO' where id=$1", [context.periodo]);
    else await db.query("update turmas set status='FINALIZADA' where id=$1", [context.turma]);
    await actor(context);
    await assert.rejects(create(context));
    await assert.rejects(manage(active.id, 'EDITAR', 'Proibido', dates.past, 4));
    await assert.rejects(manage(active.id, 'ARQUIVAR'));
    await assert.rejects(manage(archived.id, 'RESTAURAR'));
    assert.equal((await row(active.id)).titulo, 'Atividade sintética');
  }
});

test('unassigned, out-of-scope and unauthenticated actors cannot manage another activity', async () => {
  const context = await setup();
  const activity = await create(context);
  for (const identity of [{gestor:false}, {gestor:false,professor:uuid(999)}, {actorId:''}]) {
    await actor(context, identity);
    await assert.rejects(manage(activity.id, 'EDITAR', 'Proibido', dates.past, 4));
    await assert.rejects(manage(activity.id, 'ARQUIVAR'));
  }
  await actor({ ...context, turma: uuid(999) });
  await assert.rejects(manage(activity.id, 'ARQUIVAR'));
  await actor(context);
  assert.equal((await row(activity.id)).status, 'PUBLICADA');
});

test('assigned teachers retain existing operational permission without gaining preparatory permission', async () => {
  const context = await setup();
  const activity = await create(context);
  await actor(context, {gestor:false,professor:context.professor});
  await manage(activity.id, 'EDITAR', 'Professor autorizado', dates.past, 4);
  assert.equal((await row(activity.id)).titulo, 'Professor autorizado');
  const planned = await setup({status:'PLANEJADA'});
  const draft = await create(planned, {status:'RASCUNHO'});
  await actor(planned, {gestor:false,professor:planned.professor});
  await assert.rejects(manage(draft.id, 'ARQUIVAR'));
});

test('workload limits reject excessive create, edit and restore atomically', async () => {
  const context = await setup({limit:20});
  await lesson(context, 16);
  const activity = await create(context);
  await assert.rejects(create(context, {hours:1}), /[Cc]arga.*excedida/);
  await assert.rejects(manage(activity.id, 'EDITAR', 'Excesso', dates.past, 5), /[Cc]arga.*excedida/);
  assert.equal(Number((await row(activity.id)).carga_horaria_compensacao), 4);
  await manage(activity.id, 'ARQUIVAR');
  await lesson(context, 4);
  await assert.rejects(manage(activity.id, 'RESTAURAR'), /[Cc]arga.*excedida/);
  assert.equal((await row(activity.id)).status, 'ARQUIVADA');
});

test('current workload guard preserves authorized exceptions scoped to the exact class and discipline', async () => {
  const context = await setup({limit:20});
  await lesson(context, 16);
  const activity = await create(context);
  await assert.rejects(manage(activity.id, 'EDITAR', 'Acima do limite', dates.past, 8));
  await db.exec('reset role');
  await db.query('insert into turma_disciplina_carga_excecoes values ($1,$2,24)', [context.turma,context.disciplina]);
  await actor(context);
  await manage(activity.id, 'EDITAR', 'Exceção autorizada', dates.past, 8);
  assert.equal(await hours(context),24);
  await assert.rejects(manage(activity.id, 'EDITAR', 'Além da exceção', dates.past, 9));
  const other = await setup({limit:20});
  await lesson(other,20);
  await assert.rejects(create(other), /[Cc]arga.*excedida/);
  await db.exec('reset role');
  assert.equal(await scalar("select prosecdef from pg_proc where oid='public.validate_turma_disciplina_carga_horaria()'::regprocedure"),true);
});

test('a response arriving after the editor opened blocks stale content edits', async () => {
  const context = await setup();
  const activity = await create(context, {deadline:dates.future});
  const draft = await row(activity.id);
  const answer = await respond(context, activity.id);
  await assert.rejects(manage(activity.id, 'EDITAR', 'Formulário obsoleto', dates.past, 5));
  assert.equal((await row(activity.id)).titulo, draft.titulo);
  const stored = (await db.query('select * from atividade_extra_classe_respostas where id=$1', [answer.id])).rows[0];
  assert.deepEqual(stored, answer);
});

test('archive and restore preserve submitted answers and student visibility', async () => {
  const context = await setup();
  const activity = await create(context, {deadline:dates.future});
  const answer = await respond(context, activity.id);
  await manage(activity.id, 'ARQUIVAR');
  await actor(context, {gestor:false,aluno:answer.aluno_id,actorId:answer.aluno_id});
  assert.equal(await row(activity.id), undefined);
  assert.equal(await scalar('select can_submit_atividade_extra($1)', [activity.id]), false);
  await actor(context);
  await manage(activity.id, 'RESTAURAR');
  const stored = (await db.query('select * from atividade_extra_classe_respostas where id=$1', [answer.id])).rows[0];
  assert.deepEqual(stored, answer);
  await actor(context, {gestor:false,aluno:answer.aluno_id,actorId:answer.aluno_id});
  assert.equal((await row(activity.id)).status, 'PUBLICADA');
});

test('retroactive staff registration does not grant students late submission rights', async () => {
  const context = await setup();
  const activity = await create(context);
  await assert.rejects(respond(context, activity.id));
  await actor(context);
  assert.equal(Number(await scalar('select count(*) from atividade_extra_classe_respostas where atividade_id=$1', [activity.id])), 0);
});

test('unknown ids, unsupported actions and edits to archived rows fail rather than silently succeeding', async () => {
  const context = await setup();
  const activity = await create(context);
  await assert.rejects(manage(uuid(999999), 'ARQUIVAR'));
  await assert.rejects(manage(activity.id, 'APAGAR'));
  await manage(activity.id, 'ARQUIVAR');
  await assert.rejects(manage(activity.id, 'EDITAR', 'Não alterar', dates.past, 4));
  assert.equal((await row(activity.id)).status, 'ARQUIVADA');
});

test('optimistic revision check rejects a stale editor before replacing newer content', async () => {
  const context = await setup();
  const activity = await create(context);
  // PostgreSQL timestamps carry microseconds, so retain the exact text token.
  const revision = await scalar('select updated_at::text from atividades_extra_classe where id=$1', [activity.id]);
  await manage(activity.id, 'EDITAR', 'Edição mais nova', dates.today, 4, revision);
  await assert.rejects(manage(activity.id, 'EDITAR', 'Edição obsoleta', dates.past, 5, revision),
    (error) => error.code === '40001');
  assert.equal((await row(activity.id)).titulo, 'Edição mais nova');
});

test('linked titles update their theme while independent themes are preserved', async () => {
  const context = await setup();
  const activity = await create(context);
  await manage(activity.id, 'EDITAR', 'Novo título', dates.past, 4);
  assert.equal((await row(activity.id)).tema, 'Novo título');
  await db.query("update atividades_extra_classe set tema='Tema independente' where id=$1", [activity.id]);
  await manage(activity.id, 'EDITAR', 'Outro título', dates.past, 4);
  assert.equal((await row(activity.id)).tema, 'Tema independente');
});

test('original archive status cannot be forged and repeated archive is idempotent', async () => {
  const context = await setup({status:'PLANEJADA'});
  const activity = await create(context, {status:'RASCUNHO'});
  await db.query("update atividades_extra_classe set status_antes_arquivo='PUBLICADA' where id=$1", [activity.id]);
  assert.equal((await row(activity.id)).status_antes_arquivo, null);
  await manage(activity.id, 'ARQUIVAR');
  await manage(activity.id, 'ARQUIVAR');
  assert.equal((await row(activity.id)).status_antes_arquivo, 'RASCUNHO');
  await manage(activity.id, 'RESTAURAR');
  assert.equal((await row(activity.id)).status, 'RASCUNHO');
});

test('legacy unknown archive origin cannot be restored or directly published and preserves answers', async () => {
  const context = await setup();
  const activity = await create(context, {deadline:dates.future});
  const answer = await respond(context, activity.id);
  await db.exec('reset role');
  // Simulate a row archived before this new column existed, in the isolated fixture only.
  await db.exec('alter table atividades_extra_classe disable trigger stamp_and_validate_atividade_extra_trigger');
  await db.query("update atividades_extra_classe set status='ARQUIVADA',status_antes_arquivo=null where id=$1", [activity.id]);
  await db.exec('alter table atividades_extra_classe enable trigger stamp_and_validate_atividade_extra_trigger');
  await actor(context);
  await assert.rejects(manage(activity.id, 'RESTAURAR'), /estado original|restauração/i);
  await assert.rejects(db.query("update atividades_extra_classe set status='PUBLICADA' where id=$1", [activity.id]));
  await assert.rejects(db.query("update atividades_extra_classe set status='RASCUNHO' where id=$1", [activity.id]));
  await db.query("update atividades_extra_classe set status_antes_arquivo='PUBLICADA' where id=$1", [activity.id]);
  assert.equal((await row(activity.id)).status, 'ARQUIVADA');
  assert.equal((await row(activity.id)).status_antes_arquivo, null);
  const stored = (await db.query('select * from atividade_extra_classe_respostas where id=$1', [answer.id])).rows[0];
  assert.deepEqual(stored, answer);
});

test('Cadastros-only access cannot create, edit, archive or restore academic activities', async () => {
  const context = await setup();
  const active = await create(context);
  const archived = await create(context);
  await manage(archived.id, 'ARQUIVAR');
  await actor(context, {gestor:true,academics:false});
  assert.equal(await scalar('select can_write_turma($1)', [context.turma]), true);
  assert.equal(await scalar('select can_operate_turma_academics($1)', [context.turma]), false);
  await assert.rejects(create(context));
  await assert.rejects(manage(active.id, 'EDITAR', 'Sem permissão', dates.past, 4));
  await assert.rejects(manage(active.id, 'ARQUIVAR'));
  await assert.rejects(manage(archived.id, 'RESTAURAR'));
  const preparatory = await setup({status:'PLANEJADA'});
  const draft = await create(preparatory, {status:'RASCUNHO'});
  await actor(preparatory, {gestor:true,academics:false});
  await assert.rejects(create(preparatory, {status:'RASCUNHO'}));
  await assert.rejects(manage(draft.id, 'ARQUIVAR'));
});

test('question, immutable identity and response-deletion guards remain active', async () => {
  const context = await setup();
  const activity = await create(context, {deadline:dates.future});
  await assert.rejects(db.query("update atividades_extra_classe set tipo_resposta='PERGUNTAS' where id=$1", [activity.id]));
  await assert.rejects(db.query('update atividades_extra_classe set criado_por_auth_id=$1 where id=$2', [uuid(999),activity.id]));
  await respond(context, activity.id);
  await db.exec('reset role');
  await assert.rejects(db.query('delete from atividades_extra_classe where id=$1', [activity.id]));
});

test('RPC grants and SQL row-lock contracts remain explicit; this is not a multi-session concurrency test', async () => {
  await db.exec('reset role');
  const functionName = 'public.gerenciar_atividade_extra_classe(uuid,text,text,date,numeric,timestamptz)';
  assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['anon',functionName,'EXECUTE']), false);
  assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['authenticated',functionName,'EXECUTE']), true);
  const body = await scalar('select pg_get_functiondef($1::regprocedure)', [functionName]);
  assert.match(body, /FOR UPDATE/i);
  assert.match(body, /SET search_path TO ''|SET search_path = ''/i);
  assert.match(sql(responseMigration), /WHERE id = NEW\.atividade_id\s+FOR SHARE/i);
});
