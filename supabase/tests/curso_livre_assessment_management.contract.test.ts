import assert from "node:assert/strict";

declare const Deno: {
  readTextFile(path: string | URL): Promise<string>;
  test(name: string, fn: () => void | Promise<void>): void;
};

const [schema, management, classContract, professorPortal, attemptSchema, questionHardening] = await Promise.all([
  Deno.readTextFile(new URL("../migrations/20260822160000_create_curso_livre_assessment_schema.sql", import.meta.url)),
  Deno.readTextFile(new URL("../migrations/20260822160100_create_curso_livre_assessment_management.sql", import.meta.url)),
  Deno.readTextFile(new URL("../migrations/20260822160200_create_curso_livre_class_contract.sql", import.meta.url)),
  Deno.readTextFile(new URL("../migrations/20260822160300_include_livre_in_professor_portal.sql", import.meta.url)),
  Deno.readTextFile(new URL("../migrations/20260822160400_create_curso_livre_attempt_schema.sql", import.meta.url)),
  Deno.readTextFile(new URL("../migrations/20260822162100_protect_published_curso_livre_question_origin.sql", import.meta.url)),
]);

function body(sql: string, marker: string): string {
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start >= 0, `função ausente: ${marker}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(end > start, `fim ausente: ${marker}`);
  return sql.slice(start, end + "$function$;".length);
}

Deno.test("avaliação Livre é versionada, imutável e publica com banco mínimo", () => {
  assert.match(schema, /status text not null default 'RASCUNHO'[\s\S]*'RASCUNHO', 'PUBLICADA'/i);
  assert.match(schema, /unique \(curso_id, versao\)/i);
  assert.match(schema, /quantidade_sorteada smallint not null default 10[\s\S]*quantidade_sorteada = 10/i);
  assert.match(schema, /minimo_banco smallint not null default 50[\s\S]*minimo_banco = 50/i);
  const publication = body(schema, "create or replace function internal_academic.protect_curso_livre_avaliacao()");
  assert.match(publication, /question\.ativa/i);
  assert.match(publication, /v_active_questions < new\.minimo_banco or v_active_questions < 50/i);
  assert.match(publication, /old\.status = 'PUBLICADA'[\s\S]*imutável/i);
  assert.match(schema, /revoke all on table public\.curso_livre_questoes[\s\S]*anon, authenticated/i);
  assert.match(questionHardening, /v_old_assessment_id[\s\S]*old\.avaliacao_id/i);
  assert.match(questionHardening, /v_new_assessment_id[\s\S]*new\.avaliacao_id/i);
  assert.match(questionHardening, /assessment\.id in \(v_old_assessment_id, v_new_assessment_id\)/i);
});

Deno.test("RPCs de Gestão preservam assinatura, concorrência e autorização", () => {
  assert.match(management, /public\.obter_avaliacao_curso_livre_gestao_secure\(\s*p_curso_id uuid\s*\)/i);
  assert.match(management, /public\.salvar_avaliacao_curso_livre_gestao_secure\(\s*p_request_id uuid,\s*p_curso_id uuid,\s*p_avaliacao_id uuid,\s*p_expected_revisao integer,\s*p_publicar boolean,\s*p_config jsonb,\s*p_questoes jsonb/is);
  const save = body(management, "create or replace function public.salvar_avaliacao_curso_livre_gestao_secure(");
  assert.ok(save.indexOf("assert_can_manage_curso_livre") < save.indexOf("curso_livre_avaliacao_requests request"));
  assert.match(save, /p_expected_revisao <> v_assessment\.revisao[\s\S]*errcode = '40001'/i);
  assert.match(save, /pg_advisory_xact_lock/i);
  assert.match(save, /payload_hash/i);
  assert.ok(save.indexOf("return jsonb_set(v_stored.response") < save.indexOf("perform 1 from public.cursos course"));
  assert.match(save, /delete from public\.curso_livre_questoes[\s\S]*insert into public\.curso_livre_questoes/i);
  assert.match(management, /grant execute on function public\.salvar_avaliacao_curso_livre_gestao_secure[\s\S]*authenticated, service_role/i);
});

Deno.test("turma Livre fixa avaliação e um único professor em toda a grade", () => {
  assert.match(classContract, /create table public\.turmas_livres_academico[\s\S]*avaliacao_id uuid[\s\S]*professor_id uuid/i);
  assert.match(classContract, /turmas_livres_academico_avaliacao_idx[\s\S]*\(avaliacao_id\)/i);
  assert.match(classContract, /turmas_livres_academico_professor_idx[\s\S]*\(professor_id\)/i);
  assert.match(classContract, /assessment\.status = 'PUBLICADA'/i);
  assert.match(classContract, /count\(distinct binding\.professor_id\) > 1/i);
  assert.match(classContract, /insert into public\.turmas_disciplinas\(turma_id, disciplina_id\)[\s\S]*public\.modulos[\s\S]*public\.disciplinas/i);
  const assignment = body(classContract, "create or replace function public.atribuir_docente_disciplinas_turma(");
  assert.match(assignment, /v_expected is distinct from[\s\S]*unnest\(p_disciplina_ids\)/i);
  assert.match(assignment, /update public\.turmas_livres_academico[\s\S]*professor_id = p_professor_id/i);
  assert.match(attemptSchema, /Avaliação e professor não mudam após o início de uma tentativa/i);
  const structure = body(classContract, "create or replace function internal_academic.sync_turma_livre_structure()");
  assert.match(structure, /new\.curso_id is distinct from old\.curso_id[\s\S]*v_old_is_livre[\s\S]*curso de uma turma Livre é imutável/i);
});

Deno.test("portal do professor agrega Livre sem exigir período técnico", () => {
  assert.match(professorPortal, /get_professor_disciplinas_portal_pre_livre/i);
  assert.match(professorPortal, /upper\(coalesce\(course\.modalidade, ''\)\) = 'LIVRE'/i);
  assert.match(professorPortal, /item\.turma_status = 'EM_ANDAMENTO' and item\.bloqueio_diario = 'ABERTO'/i);
  assert.match(professorPortal, /'periodo_letivo_id', null/i);
  assert.match(professorPortal, /coalesce\(v_technical, '\[\]'::jsonb\) \|\| coalesce\(v_livre, '\[\]'::jsonb\)/i);
});
