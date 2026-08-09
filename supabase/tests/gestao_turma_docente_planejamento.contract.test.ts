import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260808223000_fix_gestao_turma_docente_planejamento.sql",
  import.meta.url,
);

function functionBody(
  source: string,
  signature: string,
  nextSignature?: string,
) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Função não encontrada: ${signature}`);
  const end = nextSignature
    ? source.indexOf(nextSignature, start + signature.length)
    : source.indexOf("$function$;", start) + "$function$;".length;
  assert.ok(end > start, `Fim da função não encontrado: ${signature}`);
  return source.slice(start, end);
}

Deno.test("atribuição de docente é atômica, canônica e restrita à Gestão da turma", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const body = functionBody(
    source,
    "create or replace function public.atribuir_docente_disciplinas_turma(",
    "create or replace function public.salvar_encontro_turma(",
  );

  assert.match(body, /p_disciplina_ids uuid\[\]/i);
  assert.match(
    body,
    /returns table\s*\(\s*disciplina_id uuid,\s*professor_id uuid,\s*professor_nome text,\s*concluida boolean/i,
  );
  assert.match(body, /security definer\s+set search_path = ''/i);
  assert.match(body, /public\.can_operate_turma_academics\(p_turma_id\)/i);
  assert.match(body, /upper\(coalesce\(v_turma_status, ''\)\) = 'FINALIZADA'/i);
  assert.match(body, /upper\(coalesce\(professor\.tipo, ''\)\) = 'PROFESSOR'/i);
  assert.match(body, /upper\(coalesce\(professor\.status, ''\)\) = 'ATIVO'/i);
  assert.match(body, /v_vinculos_count <> cardinality\(v_disciplina_ids\)/i);
  assert.match(
    body,
    /upper\(coalesce\(vinculo\.bloqueio_diario, 'ABERTO'\)\) = 'TOTAL'[\s\S]*using errcode = '42501'/i,
  );
  assert.match(
    body,
    /set professor_id = v_professor_id,\s*professor_nome = v_professor_nome/i,
  );
  assert.doesNotMatch(body, /set[\s\S]{0,160}concluida\s*=/i);
  assert.match(body, /vinculo\.concluida/i);
});

Deno.test("RPC deriva nome no banco e expõe somente os grants necessários", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const body = functionBody(
    source,
    "create or replace function public.atribuir_docente_disciplinas_turma(",
    "create or replace function public.salvar_encontro_turma(",
  );

  assert.match(
    source,
    /select professor\.id, btrim\(professor\.nome\)[\s\S]*from public\.parceiros professor/i,
  );
  assert.match(
    source,
    /revoke all on function public\.atribuir_docente_disciplinas_turma\(uuid, uuid\[\], uuid\)\s+from public, anon/i,
  );
  assert.match(
    source,
    /grant execute on function public\.atribuir_docente_disciplinas_turma\(uuid, uuid\[\], uuid\)\s+to authenticated, service_role/i,
  );
  assert.doesNotMatch(body, /insert into public\.gestao_realtime_events/i);
});

Deno.test("guarda de planejamento não herda a janela do diário", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const guard = functionBody(
    source,
    "create or replace function internal_academic.can_manage_turma_lesson_planning(",
    "create or replace function public.atribuir_docente_disciplinas_turma(",
  );

  assert.match(guard, /public\.can_operate_turma_academics\(turma\.id\)/i);
  assert.match(
    guard,
    /upper\(coalesce\(turma\.status, ''\)\) <> 'FINALIZADA'/i,
  );
  assert.match(
    guard,
    /upper\(coalesce\(vinculo\.bloqueio_diario, 'ABERTO'\)\) <> 'TOTAL'/i,
  );
  assert.doesNotMatch(guard, /can_write_academic_record_open/i);
  assert.doesNotMatch(guard, /current_professor_id|is_professor_assigned/i);
});

Deno.test("criar, remover e definir horário usam a mesma guarda de Gestão", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const save = functionBody(
    source,
    "create or replace function public.salvar_encontro_turma(",
    "create or replace function public.remover_encontro_turma(",
  );
  const remove = functionBody(
    source,
    "create or replace function public.remover_encontro_turma(",
    "create or replace function public.remove_turma_aula_planejada(",
  );
  const legacyRemove = functionBody(
    source,
    "create or replace function public.remove_turma_aula_planejada(",
    "create or replace function public.definir_horario_encontro_turma(",
  );
  const time = functionBody(
    source,
    "create or replace function public.definir_horario_encontro_turma(",
    "alter function public.atualizar_horario_encontro_gestor",
  );

  for (const body of [save, remove, legacyRemove, time]) {
    assert.match(body, /internal_academic\.can_manage_turma_lesson_planning/i);
    assert.doesNotMatch(
      body,
      /can_write_academic_record_open|current_professor_id|is_professor_assigned/i,
    );
  }

  assert.match(save, /p_carga_horaria = 8 then 2 else 1/i);
  assert.match(save, /'M'\),\s*\(p_turma_id[\s\S]*'T'\)/i);
  assert.match(time, /p_hora_fim <= p_hora_inicio/i);
  assert.match(
    legacyRemove,
    /delete from public\.aulas_turma aula[\s\S]*get diagnostics v_deleted_count = row_count/i,
  );
});

Deno.test("endpoint legado de horário também exige a guarda de Gestão", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const wrapper = functionBody(
    source,
    "create function public.atualizar_horario_encontro_gestor(",
  );

  assert.match(
    source,
    /alter function public\.atualizar_horario_encontro_gestor\(uuid, numeric, date\)\s+set schema internal_academic/i,
  );
  assert.match(wrapper, /internal_academic\.can_manage_turma_lesson_planning/i);
  assert.match(
    wrapper,
    /internal_academic\.p1_atualizar_horario_encontro_gestor_20260808/i,
  );
  assert.doesNotMatch(
    wrapper,
    /public\.can_write_turma|can_write_academic_record_open/i,
  );
});
