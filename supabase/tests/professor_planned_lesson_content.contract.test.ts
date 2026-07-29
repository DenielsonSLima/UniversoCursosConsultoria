import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260729211324_professor_fills_planned_lesson_content.sql',
  import.meta.url,
);
const roleBoundaryMigrationUrl = new URL(
  '../migrations/20260729211658_enforce_lesson_planning_role_boundaries.sql',
  import.meta.url,
);
const columnBoundaryMigrationUrl = new URL(
  '../migrations/20260729212731_close_lesson_role_boundary_column_gaps.sql',
  import.meta.url,
);
const directWriteHardeningMigrationUrl = new URL(
  '../migrations/20260729221655_close_academic_planning_direct_write_gaps.sql',
  import.meta.url,
);

Deno.test('professor altera somente o conteúdo do encontro planejado', async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(source, /create or replace function public\.atualizar_titulo_encontro_professor/i);
  assert.match(source, /security invoker/i);
  assert.match(source, /is_professor_assigned_disciplina_open/i);
  assert.match(source, /set titulo = v_titulo/i);
  assert.doesNotMatch(source, /set[\s\S]{0,120}(data_aula|carga_horaria|sessao)\s*=/i);
});

Deno.test('todas as sessões do mesmo encontro recebem o mesmo conteúdo', async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(source, /aula\.data_aula is not distinct from v_data_aula/i);
  assert.match(source, /pg_advisory_xact_lock/i);
  assert.match(
    source,
    /grant execute on function public\.atualizar_titulo_encontro_professor\(uuid, text\)\s+to authenticated, service_role/i,
  );
  assert.match(
    source,
    /revoke all on function public\.atualizar_titulo_encontro_professor\(uuid, text\)\s+from public, anon/i,
  );
});

Deno.test('Gestão ajusta data e carga sem sobrescrever conteúdo do professor', async () => {
  const source = await Deno.readTextFile(roleBoundaryMigrationUrl);
  const scheduleFunction = source.slice(
    source.indexOf('create or replace function public.atualizar_horario_encontro_gestor'),
  );

  assert.match(scheduleFunction, /public\.can_write_turma\(v_turma_id\)/i);
  assert.match(scheduleFunction, /set data_aula = p_data_aula/i);
  assert.match(scheduleFunction, /carga_horaria = case/i);
  assert.doesNotMatch(scheduleFunction, /set titulo\s*=/i);
});

Deno.test('Professor não consegue criar, excluir ou alterar o horário da aula', async () => {
  const source = await Deno.readTextFile(roleBoundaryMigrationUrl);

  assert.match(source, /before insert or update or delete on public\.aulas_turma/i);
  assert.match(source, /new\.data_aula is not distinct from old\.data_aula/i);
  assert.match(source, /new\.carga_horaria is not distinct from old\.carga_horaria/i);
  assert.match(source, /new\.sessao is not distinct from old\.sessao/i);
  assert.match(
    source,
    /A Gestão define data e carga horária; o professor pode alterar somente o conteúdo programático/i,
  );
});

Deno.test('fronteira final protege título da Gestão e metadados do professor', async () => {
  const source = await Deno.readTextFile(columnBoundaryMigrationUrl);

  assert.match(source, /new\.titulo is not distinct from old\.titulo/i);
  assert.match(source, /new\.id = old\.id/i);
  assert.match(source, /new\.created_at is not distinct from old\.created_at/i);
  assert.match(source, /new\.turma_id = old\.turma_id/i);
  assert.match(source, /new\.disciplina_id = old\.disciplina_id/i);
  assert.match(source, /new\.titulo = 'Conteúdo a definir pelo professor'/i);
  assert.match(source, /char_length\(trim\(new\.titulo\)\) <= 1000/i);
  assert.match(source, /universo\.deleted_lesson_title/i);
});

Deno.test('escrita de encontros fica restrita às RPCs canônicas', async () => {
  const source = await Deno.readTextFile(directWriteHardeningMigrationUrl);

  assert.match(source, /drop policy if exists portal_aulas_turma_insert/i);
  assert.match(source, /drop policy if exists portal_aulas_turma_update/i);
  assert.match(source, /drop policy if exists portal_aulas_turma_delete/i);
  assert.match(
    source,
    /alter function public\.atualizar_horario_encontro_gestor\(uuid, numeric, date\)\s+security definer/i,
  );
  assert.match(
    source,
    /alter function public\.atualizar_titulo_encontro_professor\(uuid, text\)\s+security definer/i,
  );
});

Deno.test('exclusão de encontro nunca apaga lançamentos por cascata', async () => {
  const source = await Deno.readTextFile(directWriteHardeningMigrationUrl);

  assert.match(
    source,
    /tg_op = 'DELETE'[\s\S]*from public\.diario_frequencia[\s\S]*from public\.diario_praticas/i,
  );
  assert.match(
    source,
    /O encontro não pode ser removido porque possui frequência ou prática lançada/i,
  );
});

Deno.test('Gestão preserva a composição canônica de carga e sessão', async () => {
  const source = await Deno.readTextFile(directWriteHardeningMigrationUrl);

  assert.match(source, /public\.can_operate_turma_academics\(v_turma_id\)/i);
  assert.match(source, /new\.data_aula is not null/i);
  assert.match(source, /new\.carga_horaria > 0/i);
  assert.match(source, /new\.sessao = 'U' and new\.carga_horaria <> 8/i);
  assert.match(source, /new\.sessao in \('M', 'T'\) and new\.carga_horaria = 4/i);
});
