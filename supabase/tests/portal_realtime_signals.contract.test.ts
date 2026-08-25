import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationNames = [
  '20260824235100_create_portal_realtime_signals.sql',
  '20260824235150_create_portal_realtime_signal_triggers.sql',
  '20260824235160_create_portal_calendar_chat_signals.sql',
  '20260824235400_move_portal_realtime_authorizer_private.sql',
] as const;

const [foundation, academic, calendarChat, privateAuthorizer] = await Promise.all(
  migrationNames.map((name) => readFile(
    new URL(`../migrations/${name}`, import.meta.url),
    'utf8',
  )),
);
const allMigrations = [foundation, academic, calendarChat].join('\n');

test('outbox publica somente sinal mínimo e bloqueia INSERT direto', () => {
  const tableDefinition = foundation.slice(
    foundation.indexOf('create table public.portal_realtime_signals'),
    foundation.indexOf('create index portal_realtime_signals_topic_id_idx'),
  );

  for (const column of ['source', 'operation', 'entity_id']) {
    assert.doesNotMatch(tableDefinition, new RegExp(`\\b${column}\\s+`));
  }
  assert.match(tableDefinition, /topic text not null/);
  assert.match(tableDefinition, /audience_kind text not null/);
  assert.match(tableDefinition, /created_at timestamptz not null/);
  assert.match(foundation, /revoke all on table public\.portal_realtime_signals[\s\S]*authenticated/);
  assert.match(foundation, /grant select on table public\.portal_realtime_signals to authenticated/);
  assert.doesNotMatch(foundation, /grant insert[\s\S]*portal_realtime_signals/i);
  assert.match(foundation, /alter publication supabase_realtime[\s\S]*portal_realtime_signals/);
});

test('RLS usa audiência estável, escopo gestor de leitura e tópico exato', () => {
  assert.match(foundation, /alter table public\.portal_realtime_signals enable row level security/);
  assert.match(foundation, /is_partner_in_gestor_read_scope/);
  assert.doesNotMatch(foundation, /is_partner_in_gestor_scope\(/);
  assert.match(foundation, /p_audience_id = public\.current_professor_id\(\)/);
  assert.match(foundation, /calendar_private\.current_professor_can_access_polo\(p_polo_id\)/);
  assert.match(foundation, /security definer\s+set search_path = ''/);
});

test('autorizador RLS mantém OID e sai da superfície pública com ACL mínima', () => {
  assert.match(privateAuthorizer, /create schema if not exists portal_private/);
  assert.match(
    privateAuthorizer,
    /revoke all on schema portal_private\s+from public, anon, authenticated, service_role/,
  );
  assert.match(privateAuthorizer, /grant usage on schema portal_private to authenticated/);
  assert.doesNotMatch(
    privateAuthorizer,
    /grant usage on schema portal_private to (?:public|anon|service_role)/,
  );
  assert.doesNotMatch(privateAuthorizer, /grant (?:all|create) on schema portal_private/i);

  assert.match(
    privateAuthorizer,
    /alter function public\.can_read_portal_realtime_signal\(text, uuid, uuid\)\s+set schema portal_private/,
  );
  assert.equal(
    privateAuthorizer.match(/public\.can_read_portal_realtime_signal/g)?.length,
    1,
    'a única referência pública deve ser a origem do SET SCHEMA',
  );
  assert.doesNotMatch(
    privateAuthorizer,
    /(?:create(?: or replace)?|drop) function[^;]*can_read_portal_realtime_signal/i,
  );
  assert.match(
    privateAuthorizer,
    /alter function portal_private\.can_read_portal_realtime_signal\(text, uuid, uuid\)\s+security definer\s+set search_path = ''/,
  );
  assert.match(
    privateAuthorizer,
    /revoke all on function portal_private\.can_read_portal_realtime_signal\([\s\S]*?\) from public, anon, authenticated, service_role/,
  );
  assert.match(
    privateAuthorizer,
    /grant execute on function portal_private\.can_read_portal_realtime_signal\([\s\S]*?\) to authenticated/,
  );
  assert.doesNotMatch(
    privateAuthorizer,
    /grant execute on function portal_private\.can_read_portal_realtime_signal\([\s\S]*?\) to (?:public|anon|service_role)/,
  );
  assert.match(
    foundation,
    /create policy portal_realtime_signals_select[\s\S]*using \(\s*public\.can_read_portal_realtime_signal\(/,
  );
  assert.doesNotMatch(
    privateAuthorizer,
    /(?:create|alter|drop) policy\b/i,
  );
  assert.match(privateAuthorizer, /notify pgrst, 'reload schema';/);
});

test('triggers cobrem fontes auditadas sem publicar DELETE CDC de domínio', () => {
  for (const table of [
    'matriculas',
    'matricula_liberacoes_diario',
    'aluno_vacinas',
    'turmas_disciplinas',
    'aulas_turma',
    'atividades_extra_classe',
    'periodos_letivos',
    'turmas',
    'disciplinas',
    'calendar_events',
    'comunicacao_chats',
    'comunicacao_mensagens',
  ]) {
    assert.match(allMigrations, new RegExp(`on public\\.${table}\\b`), `trigger ausente: ${table}`);
  }
  assert.doesNotMatch(allMigrations, /replica identity/i);
  assert.doesNotMatch(allMigrations, /(?:create|alter|drop)\s+(?:table|function|policy)\s+realtime\./i);
});

test('liberação de matrícula usa aluno estável de OLD e NEW sem lookup', () => {
  const releaseFunction = academic.slice(
    academic.indexOf('create or replace function public.emit_portal_student_release_signal'),
    academic.indexOf('create or replace function public.emit_portal_professor_academic_signal'),
  );
  assert.match(releaseFunction, /old\.aluno_id/);
  assert.match(releaseFunction, /new\.aluno_id/);
  assert.doesNotMatch(releaseFunction, /select|from public\.matriculas/i);
});

test('calendário separa geral, pessoal e turma sem side-channel por polo', () => {
  assert.match(calendarChat, /p_visibility = 'GENERAL'[\s\S]*'POLO_CALENDAR'/);
  assert.match(calendarChat, /p_visibility in \('PROFESSOR', 'PERSONAL'\)[\s\S]*'PROFESSOR_POLO'/);
  assert.match(calendarChat, /p_visibility = 'TURMA'[\s\S]*from public\.turmas_disciplinas/);
  assert.match(calendarChat, /calendar:polo:' \|\| p_polo_id::text \|\| ':general'/);
  assert.match(calendarChat, /p_professor_id::text[\s\S]*p_polo_id::text \|\| ':calendar'/);
  assert.match(calendarChat, /old\.visibility[\s\S]*new\.visibility/);
});

test('chat usa identidade normalizada e emite somente sinal para refetch canônico', () => {
  assert.match(calendarChat, /upper\(coalesce\(old\.remetente_tipo, ''\)\) = 'PROFESSOR'/);
  assert.match(calendarChat, /upper\(coalesce\(new\.remetente_tipo, ''\)\) = 'PROFESSOR'/);
  assert.match(calendarChat, /upper\(coalesce\(chat\.remetente_tipo, ''\)\) = 'PROFESSOR'/);
  assert.doesNotMatch(allMigrations, /\b(?:source|operation|entity_id)\b/i);
});

test('migrations manuais permanecem abaixo do teto operacional', () => {
  migrationNames.forEach((name, index) => {
    const lines = [foundation, academic, calendarChat, privateAuthorizer][index].split('\n').length;
    assert.ok(lines <= 500, `${name} possui ${lines} linhas`);
  });
});
