import assert from "node:assert/strict";

declare const Deno: {
  readTextFile(path: string | URL): Promise<string>;
  test(name: string, fn: () => void | Promise<void>): void;
};

const [
  attemptSchema,
  schedule,
  startSql,
  submitSql,
  certificateBase,
  certificateSync,
  lifecycleHardening,
] = await Promise.all([
  Deno.readTextFile(
    new URL(
      "../migrations/20260822160400_create_curso_livre_attempt_schema.sql",
      import.meta.url,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "../migrations/20260822160500_enforce_curso_livre_schedule_and_access.sql",
      import.meta.url,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "../migrations/20260822160600_create_curso_livre_student_read_start.sql",
      import.meta.url,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "../migrations/20260822160700_create_curso_livre_submit_certificate.sql",
      import.meta.url,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "../migrations/20260622143000_create_certificados_academicos.sql",
      import.meta.url,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "../migrations/20260718205846_fix_academic_certificate_and_student_cpf.sql",
      import.meta.url,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "../migrations/20260822161900_serialize_curso_livre_attempt_lifecycle.sql",
      import.meta.url,
    ),
  ),
]);

function body(sql: string, marker: string): string {
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start >= 0, `função ausente: ${marker}`);
  const functionEnd = sql.indexOf("$function$;", start);
  const dollarEnd = sql.indexOf("$$;", start);
  const useFunctionEnd = functionEnd >= 0 &&
    (dollarEnd < 0 || functionEnd < dollarEnd);
  const end = useFunctionEnd ? functionEnd : dollarEnd;
  assert.ok(end > start, `fim ausente: ${marker}`);
  return sql.slice(
    start,
    end + (useFunctionEnd ? "$function$;".length : "$$;".length),
  );
}

Deno.test("liberação usa carga exata e início do último encontro em Maceió", () => {
  const exact = body(
    attemptSchema,
    "create or replace function internal_academic.curso_livre_carga_planejada_exata(",
  );
  assert.match(exact, /planned\.carga[\s\S]*<> grade\.carga/i);
  assert.match(exact, /sum\(planned\.carga\)[\s\S]*context\.curso_carga/i);
  const release = body(
    attemptSchema,
    "create or replace function internal_academic.curso_livre_liberacao_em(",
  );
  assert.match(release, /coalesce\(meeting\.hora_inicio, time '00:00'\)/i);
  assert.match(release, /at time zone 'America\/Maceio'/i);
  assert.match(release, /order by meeting\.data_aula desc/i);
  const start = body(
    startSql,
    "create or replace function public.iniciar_tentativa_curso_livre_secure(",
  );
  assert.match(start, /curso_livre_carga_planejada_exata/i);
  assert.match(start, /now\(\) < v_release_at/i);
});

Deno.test("cronograma Livre respeita datas, cargas e congela após tentativa", () => {
  const meeting = body(
    schedule,
    "create or replace function internal_academic.guard_curso_livre_meeting()",
  );
  assert.match(meeting, /new\.data_aula not between v_start and v_end/i);
  assert.match(
    meeting,
    /v_planned_course \+ new\.carga_horaria > v_course_hours/i,
  );
  assert.match(
    meeting,
    /v_planned_discipline \+ new\.carga_horaria > v_discipline_hours/i,
  );
  assert.match(
    meeting,
    /curso_livre_tentativas[\s\S]*cronograma não pode mudar/i,
  );
  assert.match(schedule, /A turma Livre exige datas de início e fim válidas/i);
  assert.match(schedule, /curso-livre-schedule:/i);
});

Deno.test("início é próprio, ATIVO, idempotente e sorteia snapshot de 10 únicas", () => {
  assert.match(
    startSql,
    /public\.iniciar_tentativa_curso_livre_secure\(\s*p_request_id uuid,\s*p_matricula_id uuid\s*\)/i,
  );
  const start = body(
    startSql,
    "create or replace function public.iniciar_tentativa_curso_livre_secure(",
  );
  assert.ok(
    start.indexOf("current_aluno_id") <
      start.indexOf("curso_livre_tentativa_requests request"),
  );
  assert.match(start, /v_context\.matricula_status, ''\)\) <> 'ATIVO'/i);
  assert.match(
    start,
    /row_number\(\) over \(order by[\s\S]*extensions\.digest/i,
  );
  assert.match(start, /where sampled\.ordem <= 10/i);
  assert.match(start, /v_snapshot_count <> 10/i);
  assert.match(attemptSchema, /unique \(tentativa_id, ordem\)/i);
  assert.match(attemptSchema, /unique \(tentativa_id, questao_id\)/i);
  assert.match(
    attemptSchema,
    /curso_livre_tentativas_avaliacao_idx[\s\S]*\(avaliacao_id\)/i,
  );
  assert.match(
    attemptSchema,
    /curso_livre_tentativa_questoes_origem_idx[\s\S]*\(questao_id\)/i,
  );
  assert.match(attemptSchema, /where status = 'EM_ANDAMENTO'/i);
});

Deno.test("retry do mesmo início faz replay antes do estado mutável da matrícula", () => {
  const start = body(
    startSql,
    "create or replace function public.iniciar_tentativa_curso_livre_secure(",
  );
  const identity = start.indexOf("select enrollment.aluno_id");
  const authorization = start.indexOf("current_aluno_id()");
  const hash = start.indexOf("v_hash :=");
  const ledger = start.indexOf("curso_livre_tentativa_requests request");
  const replay = start.indexOf("return jsonb_set(v_stored.response");
  const mutableStatus = start.indexOf(
    "if not found or upper(coalesce(v_context.matricula_status",
  );
  assert.ok(identity >= 0 && identity < authorization && authorization < hash);
  assert.ok(hash < ledger && ledger < replay && replay < mutableStatus);
  assert.doesNotMatch(
    start.slice(0, ledger),
    /matricula_status|avaliacao_status|professor_id/i,
  );
});

Deno.test("entrega faz replay antes de validar o estado mutável", () => {
  const submit = body(
    submitSql,
    "create or replace function public.entregar_tentativa_curso_livre_secure(",
  );
  const auth = submit.indexOf("current_aluno_id()");
  const ledger = submit.indexOf("curso_livre_tentativa_requests request");
  const replay = submit.indexOf("return jsonb_set(v_stored.response");
  const stateLock = submit.indexOf(
    "where attempt.id = p_tentativa_id for update",
  );
  const stateCheck = submit.indexOf("v_attempt.status <> 'EM_ANDAMENTO'");
  assert.ok(
    auth >= 0 && auth < ledger && ledger < replay && replay < stateLock &&
      stateLock < stateCheck,
  );
});

Deno.test("início e entrega compartilham serialização por matrícula", () => {
  const sharedLock = /curso-livre-assessment-matricula:/g;
  assert.equal(lifecycleHardening.match(sharedLock)?.length, 2);
  assert.match(
    lifecycleHardening,
    /iniciar_tentativa_curso_livre_core_20260822[\s\S]*pg_advisory_xact_lock[\s\S]*return public\.iniciar_tentativa_curso_livre_core_20260822/i,
  );
  assert.match(
    lifecycleHardening,
    /select attempt\.matricula_id into v_matricula_id[\s\S]*pg_advisory_xact_lock[\s\S]*return public\.entregar_tentativa_curso_livre_core_20260822/i,
  );
  assert.match(
    lifecycleHardening,
    /revoke all on function public\.entregar_tentativa_curso_livre_core_20260822\(uuid, uuid, jsonb\)[\s\S]*public, anon, authenticated, service_role/i,
  );
});

Deno.test("DTO do aluno nunca inclui gabarito", () => {
  assert.match(
    startSql,
    /public\.obter_avaliacao_curso_livre_aluno_secure\(\s*p_matricula_id uuid\s*\)/i,
  );
  const payload = body(
    startSql,
    "create or replace function internal_academic.curso_livre_student_payload(",
  );
  assert.match(payload, /'questoes', v_questions/i);
  assert.match(payload, /'enunciado', snapshot\.enunciado/i);
  assert.match(payload, /'opcoes', snapshot\.opcoes/i);
  assert.doesNotMatch(payload, /resposta_correta|respostaCorreta/i);
  assert.match(
    attemptSchema,
    /revoke all on table public\.curso_livre_tentativa_questoes[\s\S]*anon, authenticated/i,
  );
});

Deno.test("DTO bloqueia nova tentativa durante intervalo pós-reprovação", () => {
  const payload = body(
    startSql,
    "create or replace function internal_academic.curso_livre_student_payload(",
  );
  assert.match(
    payload,
    /v_attempt\.status = 'REPROVADA'[\s\S]*v_retry_at := v_attempt\.enviada_em/i,
  );
  assert.match(payload, /v_retry_at is null or now\(\) >= v_retry_at/i);
  assert.match(payload, /'INTERVALO_NOVA_TENTATIVA'/i);
  assert.match(payload, /'podeIniciar', v_released/i);
  assert.match(payload, /'novaTentativaEm', v_retry_at/i);
});

Deno.test("entrega corrige no banco e conclui/certifica na mesma transação", () => {
  assert.match(
    submitSql,
    /public\.entregar_tentativa_curso_livre_secure\(\s*p_request_id uuid,\s*p_tentativa_id uuid,\s*p_respostas jsonb\s*\)/i,
  );
  const submit = body(
    submitSql,
    "create or replace function public.entregar_tentativa_curso_livre_secure(",
  );
  assert.ok(
    submit.indexOf("current_aluno_id") <
      submit.indexOf("curso_livre_tentativa_requests request"),
  );
  assert.match(submit, /jsonb_object_keys\(p_respostas\)/i);
  assert.match(submit, /v_answer = v_item\.resposta_correta/i);
  assert.match(submit, /v_score >= v_context\.nota_minima_percentual/i);
  const grade = submit.indexOf("update public.curso_livre_tentativas attempt");
  const conclude = submit.indexOf("update public.matriculas enrollment");
  const certificate = submit.indexOf("finalize_curso_livre_certificate(");
  assert.ok(grade >= 0 && grade < conclude && conclude < certificate);
  assert.match(submitSql, /matrícula Livre só conclui após aprovação/i);
  assert.match(submitSql, /certificado Livre só finaliza após aprovação/i);
});

Deno.test("aprovação sem certificado prévio depende da fila canônica síncrona", () => {
  assert.match(
    certificateBase,
    /create trigger trigger_sincronizar_certificado_matricula[\s\S]*after insert or update of status on public\.matriculas/i,
  );
  const sync = body(
    certificateSync,
    "CREATE OR REPLACE FUNCTION public.sincronizar_certificado_matricula()",
  );
  assert.match(
    sync,
    /v_curso\.modalidade not in \('TECNICO', 'LIVRE', 'EAD', 'ESPECIALIZACAO'\)/i,
  );
  assert.match(sync, /insert into public\.certificados_academicos/i);
  assert.match(sync, /on conflict \(matricula_id\) do update/i);
  const submit = body(
    submitSql,
    "create or replace function public.entregar_tentativa_curso_livre_secure(",
  );
  assert.match(
    submit,
    /update public\.matriculas[\s\S]*set status = 'CONCLUIDO'[\s\S]*finalize_curso_livre_certificate/i,
  );
  assert.doesNotMatch(submit, /insert into public\.certificados_academicos/i);
});

Deno.test("acesso do aluno Livre nega matrícula pendente", () => {
  const access = body(
    schedule,
    "create or replace function public.is_aluno_matriculado_turma(",
  );
  assert.match(access, /'EM_DEPENDENCIA'\s*\)\s*\)\s*\)\s*when 'LIVRE'/i);
  assert.match(
    access,
    /when 'LIVRE' then upper\(coalesce\(enrollment\.status, ''\)\) in \('ATIVO', 'CONCLUIDO'\)/i,
  );
  assert.doesNotMatch(access, /when 'LIVRE'[\s\S]{0,120}'PENDENTE'/i);
});
