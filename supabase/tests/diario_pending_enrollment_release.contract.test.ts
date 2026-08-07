import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260729204559_release_pending_enrollments_for_class_diaries.sql',
  import.meta.url,
);
const permissionHardeningMigrationUrl = new URL(
  '../migrations/20260729221655_close_academic_planning_direct_write_gaps.sql',
  import.meta.url,
);

Deno.test('liberação para diário é auditável e fechada por RLS', async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(source, /create table public\.matricula_liberacoes_diario/i);
  assert.match(
    source,
    /alter table public\.matricula_liberacoes_diario enable row level security/i,
  );
  assert.match(
    source,
    /revoke all on table public\.matricula_liberacoes_diario\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    source,
    /grant (?:select|insert|update|delete|all) on table public\.matricula_liberacoes_diario to authenticated/i,
  );
  assert.match(
    source,
    /create unique index matricula_liberacoes_diario_ativa_uidx[\s\S]*where revogado_em is null/i,
  );
  assert.match(
    source,
    /create trigger trg_protect_matricula_liberacoes_diario_audit[\s\S]*before update or delete/i,
  );
  assert.match(source, /liberado_por_sistema/i);
  assert.match(source, /on delete restrict/i);
});

Deno.test('RPC limita liberação ao técnico pendente e sem financeiro', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.set_matricula_liberacao_diario/i,
  );
  const end = source.indexOf('$$;', start);
  const rpc = source.slice(start, end);

  assert.match(rpc, /security definer/i);
  assert.match(rpc, /set search_path = ''/i);
  assert.match(rpc, /public\.is_gestor_for_polo\(v_turma\.polo_id\)/i);
  assert.match(rpc, /auth\.role\(\)/i);
  assert.match(rpc, /auth\.uid\(\)/i);
  assert.match(rpc, /v_modalidade not in \('TECNICO', 'TÉCNICO'\)/i);
  assert.match(rpc, /v_matricula\.status[\s\S]*<> 'PENDENTE'/i);
  assert.match(rpc, /v_turma\.status[\s\S]*<> 'EM_ANDAMENTO'/i);
  assert.match(rpc, /gerar_cobranca_inicial/i);
  assert.match(rpc, /gerar_cobranca_futura/i);
  assert.match(rpc, /sincronizar_asaas/i);
  assert.match(rpc, /from public\.contas_receber/i);
  assert.doesNotMatch(rpc, /update public\.matriculas/i);
  assert.doesNotMatch(rpc, /insert into public\.contas_receber/i);
  assert.doesNotMatch(rpc, /documentos_aluno/i);
});

Deno.test('liberação exige permissão explícita de Gestão acadêmica', async () => {
  const source = await Deno.readTextFile(permissionHardeningMigrationUrl);

  assert.match(
    source,
    /alter function public\.set_matricula_liberacao_diario\(uuid, boolean, text\)\s+set schema internal_academic/i,
  );
  assert.match(
    source,
    /not public\.can_operate_turma_academics\(v_turma_id\)/i,
  );
  assert.match(
    source,
    /revoke all on function internal_academic\.p1_set_matricula_liberacao_diario_20260729\(uuid, boolean, text\)\s+from public, anon, authenticated/i,
  );
});

Deno.test('escrita de notas e frequências exige liberação vigente e roster', async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /create or replace function internal_academic\.is_student_released_for_diary/i,
  );
  assert.match(
    source,
    /create or replace function internal_academic\.can_write_student_in_diary[\s\S]*is_student_released_for_diary[\s\S]*diario_matriculas_roster/i,
  );
  assert.match(
    source,
    /create or replace function public\.enforce_diario_frequencia_context\(\)[\s\S]*can_write_student_in_diary/i,
  );
  assert.match(
    source,
    /create or replace function public\.enforce_diario_notas_context\(\)[\s\S]*can_write_student_in_diary/i,
  );
  assert.match(
    source,
    /create policy "portal_diario_frequencia_insert"[\s\S]*can_write_student_in_diary/i,
  );
  assert.match(
    source,
    /create policy "portal_diario_notas_insert"[\s\S]*can_write_student_in_diary/i,
  );
  assert.doesNotMatch(
    source,
    /create or replace function internal_academic\.is_active_student_in_turma/i,
  );
  assert.doesNotMatch(source, /create or replace function public\.enforce_estagio_operacional/i);
  assert.match(
    source,
    /create or replace function public\.revogar_liberacao_diario_ao_mudar_matricula/i,
  );
  assert.match(
    source,
    /after update of status, aluno_id, turma_id[\s\S]*on public\.matriculas/i,
  );
});

Deno.test('roster legado preserva participantes por disciplina', async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(source, /create table public\.diario_matriculas_roster/i);
  assert.match(
    source,
    /alter table public\.diario_matriculas_roster enable row level security/i,
  );
  assert.match(
    source,
    /create or replace function internal_academic\.is_student_in_diary_roster/i,
  );
  assert.match(
    source,
    /create or replace function public\.get_diario_alunos[\s\S]*is_student_in_diary_roster/i,
  );
  assert.match(
    source,
    /create or replace function public\.get_diario_resultados[\s\S]*is_student_in_diary_roster/i,
  );
  assert.match(
    source,
    /foreign key \(turma_id, disciplina_id\)[\s\S]*references public\.turmas_disciplinas/i,
  );
  assert.match(
    source,
    /foreign key \(matricula_id, turma_id, aluno_id\)[\s\S]*references public\.matriculas/i,
  );
});

Deno.test('exceção histórica preserva carga oficial sem ampliar outras turmas', async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /create table public\.turma_disciplina_carga_excecoes/i,
  );
  assert.match(
    source,
    /left join public\.turma_disciplina_carga_excecoes excecao[\s\S]*excecao\.turma_id = new\.turma_id/i,
  );
  assert.match(
    source,
    /create or replace function public\.validate_turma_disciplina_carga_horaria\(\)[\s\S]*security definer/i,
  );
  assert.match(
    source,
    /'Noções de Primeiros Socorros', 48::numeric/i,
  );
  assert.match(
    source,
    /aula\.data_aula = date '2025-09-24'/i,
  );
  assert.match(
    source,
    /\(112, 454::numeric, 111\)/i,
  );
});

Deno.test('seed T41 preserva documentação, status pendente e financeiro zerado', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.indexOf('DO $seed_t41$');
  const end = source.indexOf('$seed_t41$;', start);
  const seed = source.slice(start, end);

  assert.match(seed, /codigo = 'ENF-T41-SEM-AQU'/i);
  assert.match(seed, /v_matriculas <> 32/i);
  assert.match(seed, /from public\.contas_receber/i);
  assert.match(seed, /conta\.matricula_id/i);
  assert.match(seed, /from public\.inscricoes_online/i);
  assert.match(seed, /gerar_cobranca_inicial = false/i);
  assert.match(seed, /gerar_cobranca_futura = false/i);
  assert.match(seed, /sincronizar_asaas = false/i);
  assert.match(seed, /origem[\s\S]*'MIGRACAO_LEGADA'/i);
  assert.doesNotMatch(seed, /set\s+status\s*=/i);
  assert.doesNotMatch(seed, /insert into public\.documentos_aluno/i);
  assert.doesNotMatch(seed, /insert into public\.contas_receber/i);
});
