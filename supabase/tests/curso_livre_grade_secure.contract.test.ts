import assert from "node:assert/strict";

declare const Deno: {
  readTextFile(path: string | URL): Promise<string>;
  test(name: string, fn: () => void | Promise<void>): void;
};

const migrationNames = [
  "20260822160900_create_curso_livre_grade_workspace.sql",
  "20260822160910_create_curso_livre_grade_guards.sql",
  "20260822160915_freeze_operational_curso_livre_grade.sql",
  "20260822160920_save_curso_livre_grade_secure.sql",
  "20260822160930_duplicate_curso_livre_secure.sql",
  "20260822162000_enforce_curso_livre_grade_total.sql",
] as const;

const migrations = new Map<string, string>();
for (const name of migrationNames) {
  migrations.set(
    name,
    await Deno.readTextFile(new URL(`../migrations/${name}`, import.meta.url)),
  );
}
const sql = [...migrations.values()].join("\n");
const classContract = await Deno.readTextFile(
  new URL(
    "../migrations/20260822160200_create_curso_livre_class_contract.sql",
    import.meta.url,
  ),
);
const scheduleContract = await Deno.readTextFile(
  new URL(
    "../migrations/20260822160500_enforce_curso_livre_schedule_and_access.sql",
    import.meta.url,
  ),
);
const indirectBindingContract = await Deno.readTextFile(
  new URL(
    "../migrations/20260729204559_release_pending_enrollments_for_class_diaries.sql",
    import.meta.url,
  ),
);

function body(name: string): string {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start >= 0, `função ausente: ${name}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(end > start, `fim ausente: ${name}`);
  return sql.slice(start, end + "$function$;".length);
}

function lastBody(name: string): string {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().lastIndexOf(marker.toLowerCase());
  assert.ok(start >= 0, `função ausente: ${name}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(end > start, `fim ausente: ${name}`);
  return sql.slice(start, end + "$function$;".length);
}

Deno.test("migrations da grade Livre são transacionais e respeitam o teto", () => {
  for (const [name, content] of migrations) {
    assert.match(content, /^begin;/i, `${name} não abre transação`);
    assert.match(content, /commit;\s*$/i, `${name} não fecha transação`);
    assert.ok(
      content.split(/\r?\n/).length <= 500,
      `${name} excede 500 linhas`,
    );
    assert.equal(
      content.match(/as \$function\$/gi)?.length ?? 0,
      content.match(/\$function\$;/g)?.length ?? 0,
      `${name} possui corpo SQL sem fechamento`,
    );
  }
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});

Deno.test("leitura retorna workspace camelCase e fingerprint canônico", () => {
  assert.match(
    sql,
    /alter table public\.modulos[\s\S]*descricao text not null default ''/i,
  );
  assert.match(
    sql,
    /alter table public\.aulas[\s\S]*descricao text[\s\S]*ordem integer/i,
  );
  const payload = body("internal_academic.get_curso_livre_grade_payload(");
  for (
    const field of [
      "cursoId",
      "modulos",
      "fingerprint",
      "disciplinas",
      "cargaHoraria",
      "cargaHorariaTeoria",
      "cargaHorariaPratica",
      "cargaHorariaEstagio",
      "descricao",
      "aulas",
    ]
  ) assert.match(payload, new RegExp(`'${field}'`, "i"));
  assert.doesNotMatch(payload, /estruturaBloqueada|motivoBloqueio/i);
  assert.match(payload, /jsonb_agg[\s\S]*order by coalesce\(module\.ordem/i);
  assert.match(payload, /extensions\.digest[\s\S]*sha256/i);
  assert.match(
    sql,
    /public\.obter_grade_curso_livre_gestao_secure\(\s*p_curso_id uuid/i,
  );
  const workspace = body(
    "internal_academic.get_curso_livre_grade_workspace_payload(",
  );
  const lock = body("internal_academic.get_curso_livre_grade_lock_payload(");
  assert.match(workspace, /get_curso_livre_grade_payload/i);
  assert.match(workspace, /get_curso_livre_grade_lock_payload/i);
  assert.match(lock, /'estruturaBloqueada'/i);
  assert.match(lock, /'motivoBloqueio'/i);
  assert.match(lock, /'TENTATIVA_REGISTRADA'/i);
  assert.match(lock, /'USO_OPERACIONAL'/i);
  assert.match(
    lastBody("public.obter_grade_curso_livre_gestao_secure("),
    /get_curso_livre_grade_workspace_payload\(p_curso_id\)/i,
  );
});

Deno.test("RPCs usam menor privilégio e fecham escrita direta de Livre", () => {
  const read = body("public.obter_grade_curso_livre_gestao_secure(");
  const save = body("public.salvar_grade_curso_livre_gestao_secure(");
  assert.match(read, /security definer[\s\S]*set search_path = ''/i);
  assert.match(save, /security definer[\s\S]*set search_path = ''/i);
  assert.match(read, /assert_can_manage_curso_livre/i);
  assert.match(
    save,
    /assert_can_manage_curso_livre[\s\S]*assert_can_operate_curso_livre_grade/i,
  );
  assert.match(
    sql,
    /revoke all on table internal_academic\.curso_livre_grade_requests[\s\S]*service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.salvar_grade_curso_livre_gestao_secure[\s\S]*public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.salvar_grade_curso_livre_gestao_secure[\s\S]*authenticated, service_role/i,
  );
  assert.match(
    sql,
    /portal_modulos_write_global[\s\S]*modalidade[\s\S]*<> 'LIVRE'/i,
  );
  assert.match(
    sql,
    /portal_disciplinas_write_global[\s\S]*modalidade[\s\S]*<> 'LIVRE'/i,
  );
  assert.match(
    sql,
    /portal_aulas_write_global[\s\S]*modalidade[\s\S]*<> 'LIVRE'/i,
  );
});

Deno.test("save é otimista, idempotente e faz replay antes do estado mutável", () => {
  assert.match(
    sql,
    /public\.salvar_grade_curso_livre_gestao_secure\(\s*p_request_id uuid,\s*p_curso_id uuid,\s*p_expected_fingerprint text,\s*p_modulos jsonb/is,
  );
  const save = body("public.salvar_grade_curso_livre_gestao_secure(");
  const authorize = save.indexOf("assert_can_manage_curso_livre");
  const requestLock = save.indexOf("curso-livre-grade-request:");
  const ledger = save.indexOf("curso_livre_grade_requests request");
  const replay = save.indexOf("return jsonb_set(v_stored.response");
  const courseLock = save.indexOf("curso-livre-grade:'");
  const current = save.indexOf("get_curso_livre_grade_payload");
  assert.ok(authorize >= 0 && authorize < requestLock);
  assert.ok(
    requestLock < ledger && ledger < replay && replay < courseLock &&
      courseLock < current,
  );
  assert.match(save, /actor_id is distinct from v_actor_id/i);
  assert.match(save, /curso_id is distinct from p_curso_id/i);
  assert.match(save, /payload_hash <> v_payload_hash/i);
  assert.match(
    save,
    /fingerprint'[\s\S]*<> p_expected_fingerprint[\s\S]*errcode = '40001'/i,
  );
  assert.match(
    save,
    /insert into internal_academic\.curso_livre_grade_requests/i,
  );
  assert.match(
    save,
    /v_response := internal_academic\.get_curso_livre_grade_workspace_payload\(p_curso_id\)/i,
  );
});

Deno.test("save rejeita grade cuja soma difere da carga horária do curso", () => {
  const save = lastBody("public.salvar_grade_curso_livre_gestao_secure(");
  assert.match(save, /salvar_grade_curso_livre_gestao_core_20260822/i);
  assert.match(save, /if coalesce\(\(v_response ->> 'replayed'\)::boolean, false\)/i);
  assert.match(save, /coalesce\(sum\(discipline\.carga_horaria\), 0\)/i);
  assert.match(save, /v_actual_hours <> v_expected_hours/i);
  assert.match(save, /soma da grade Livre deve corresponder à carga horária do curso/i);
  assert.match(
    sql,
    /revoke all on function public\.salvar_grade_curso_livre_gestao_core_20260822[\s\S]*public, anon, authenticated, service_role/i,
  );
});

Deno.test("locks serializam grade com cronograma, criação de turma e tentativa", () => {
  const save = body("public.salvar_grade_curso_livre_gestao_secure(");
  const classLock = body("internal_academic.lock_curso_livre_grade_on_class(");
  const attemptLock = body(
    "internal_academic.lock_curso_livre_grade_on_attempt(",
  );
  const classSetLock = save.indexOf("curso-livre-class-set:");
  const scheduleLock = save.indexOf("curso-livre-schedule:");
  const gradeLock = save.indexOf("curso-livre-grade:'");
  const reauthorize = save.indexOf(
    "assert_can_operate_curso_livre_grade",
    gradeLock,
  );
  const mutableRead = save.indexOf("get_curso_livre_grade_payload", gradeLock);
  assert.ok(
    classSetLock >= 0 && classSetLock < scheduleLock &&
      scheduleLock < gradeLock,
  );
  assert.ok(gradeLock < reauthorize && reauthorize < mutableRead);
  assert.match(save, /from public\.turmas class[\s\S]*order by class\.id/i);
  assert.match(save, /for share;/i);
  assert.match(
    save,
    /from public\.modulos module[\s\S]*for update;[\s\S]*from public\.disciplinas discipline[\s\S]*for update of discipline;/i,
  );
  assert.match(
    classLock,
    /upper\(coalesce\(course\.modalidade, ''\)\) = 'LIVRE'/i,
  );
  assert.match(classLock, /curso-livre-grade:/i);
  const classSet = classLock.indexOf("curso-livre-class-set:");
  const classSchedule = classLock.indexOf("curso-livre-schedule:");
  const classGrade = classLock.indexOf("curso-livre-grade:");
  assert.ok(
    classSet >= 0 && classSet < classSchedule && classSchedule < classGrade,
  );
  assert.match(classLock, /tg_op = 'DELETE'[\s\S]*old\.curso_id/i);
  assert.match(
    attemptLock,
    /public\.matriculas[\s\S]*public\.turmas[\s\S]*curso-livre-grade:/i,
  );
  assert.match(
    sql,
    /create trigger a_lock_curso_livre_grade_on_class_trigger[\s\S]*before insert or delete or update of[\s\S]*curso_id, polo_id, data_inicio, data_previsao_termino on public\.turmas/i,
  );
  assert.match(
    scheduleContract,
    /create trigger guard_curso_livre_class_dates_trigger[\s\S]*before insert or update of curso_id, data_inicio, data_previsao_termino on public\.turmas/i,
  );
  assert.ok(
    "a_lock_curso_livre_grade_on_class_trigger" <
      "guard_curso_livre_class_dates_trigger",
  );
  assert.match(sql, /before insert on public\.curso_livre_tentativas/i);
});

Deno.test("IDs existentes são preservados e temporários são criados no servidor", () => {
  const save = body("public.salvar_grade_curso_livre_gestao_secure(");
  assert.match(save, /v_module_id = any\(v_keep_modules\)/i);
  assert.match(save, /v_discipline_id = any\(v_keep_disciplines\)/i);
  assert.match(save, /v_lesson_id = any\(v_keep_lessons\)/i);
  assert.match(
    save,
    /v_module_id := v_client_id::uuid[\s\S]*insert into public\.modulos\(curso_id, nome, descricao, ordem\)/i,
  );
  assert.match(
    save,
    /update public\.modulos module[\s\S]*where module\.id = v_module_id/i,
  );
  assert.match(
    save,
    /insert into public\.disciplinas\([\s\S]*returning id into v_discipline_id/i,
  );
  assert.match(
    save,
    /update public\.disciplinas discipline[\s\S]*where discipline\.id = v_discipline_id/i,
  );
  assert.match(
    save,
    /insert into public\.aulas\(disciplina_id, titulo, carga_horaria, descricao, ordem\)[\s\S]*returning id into v_lesson_id/i,
  );
  assert.doesNotMatch(
    save,
    /insert into public\.(?:modulos|disciplinas|aulas)\([^)]*\bid\b/i,
  );
});

Deno.test("referências operacionais impedem mover ou apagar e o rollback é integral", () => {
  const used = body(
    "internal_academic.curso_livre_disciplina_em_uso_operacional(",
  );
  const save = body("public.salvar_grade_curso_livre_gestao_secure(");
  assert.match(used, /pg_catalog\.pg_constraint/i);
  assert.match(
    used,
    /constraint_row\.confrelid = 'public\.disciplinas'::regclass/i,
  );
  assert.match(
    used,
    /'public\.aulas'::regclass[\s\S]*'public\.turmas_disciplinas'::regclass/i,
  );
  assert.match(
    used,
    /constraint_row\.confrelid = 'public\.turmas_disciplinas'::regclass/i,
  );
  assert.match(
    used,
    /string_agg[\s\S]*dependent\.%I = binding\.%I[\s\S]*join %I\.%I dependent on %s/i,
  );
  assert.match(
    indirectBindingContract,
    /foreign key \(turma_id, disciplina_id\)[\s\S]*references public\.turmas_disciplinas\(turma_id, disciplina_id\)[\s\S]*on delete cascade/i,
  );
  assert.match(
    save,
    /disciplina_em_uso_operacional\(v_discipline_id\)[\s\S]*não pode mudar de módulo/i,
  );
  assert.match(
    save,
    /disciplina_em_uso_operacional\(v_delete\.id\)[\s\S]*não pode ser removida/i,
  );
  assert.match(save, /modulo_em_uso_operacional\(v_delete\.id\)/i);
  assert.match(
    save,
    /set_config\('app\.curso_livre_structure_sync', 'on', true\)[\s\S]*delete from public\.turmas_disciplinas/i,
  );
  assert.match(
    save,
    /delete from public\.turmas_disciplinas[\s\S]*delete from public\.disciplinas[\s\S]*delete from public\.modulos/i,
  );
  const bindingLock = save.indexOf("from public.turmas_disciplinas binding");
  const usageCheck = save.indexOf(
    "assert_curso_livre_grade_frozen_structure",
    bindingLock,
  );
  const bindingDelete = save.indexOf(
    "delete from public.turmas_disciplinas binding",
    usageCheck,
  );
  assert.ok(
    bindingLock >= 0 && bindingLock < usageCheck && usageCheck < bindingDelete,
  );
  assert.match(
    save.slice(bindingLock, usageCheck),
    /order by binding\.turma_id, binding\.disciplina_id[\s\S]*for update of binding/i,
  );
  assert.match(
    classContract,
    /create trigger sync_disciplina_to_turmas_livres_trigger\s+after insert on public\.disciplinas/i,
  );
  assert.match(
    classContract,
    /insert into public\.turmas_disciplinas\(turma_id, disciplina_id\)[\s\S]*on conflict \(turma_id, disciplina_id\) do nothing/i,
  );
});

Deno.test("primeira tentativa congela tudo exceto descrições", () => {
  const hasAttempt = body("internal_academic.curso_livre_grade_tem_tentativa(");
  const frozen = body(
    "internal_academic.assert_curso_livre_grade_frozen_structure(",
  );
  const save = body("public.salvar_grade_curso_livre_gestao_secure(");
  assert.match(hasAttempt, /public\.curso_livre_tentativas/i);
  assert.match(frozen, /somente resumos podem ser alterados/i);
  assert.match(frozen, /nomes, ordem e estrutura são imutáveis/i);
  assert.match(frozen, /disciplina e cargas são imutáveis/i);
  assert.match(frozen, /aulas, ordem e cargas são imutáveis/i);
  assert.match(
    save,
    /if v_grade_frozen then\s+update public\.modulos module set descricao = v_description/i,
  );
  assert.match(
    save,
    /if v_grade_frozen then\s+update public\.disciplinas discipline set descricao = v_description/i,
  );
  assert.match(
    save,
    /if v_grade_frozen then\s+update public\.aulas lesson set descricao = v_description/i,
  );
});

Deno.test("qualquer uso operacional congela toda a estrutura do curso", () => {
  const courseUsed = body(
    "internal_academic.curso_livre_curso_em_uso_operacional(",
  );
  const moduleGuard = body(
    "internal_academic.guard_curso_livre_module_operational_use(",
  );
  const disciplineGuard = body(
    "internal_academic.guard_curso_livre_discipline_operational_use(",
  );
  const lessonGuard = body(
    "internal_academic.guard_curso_livre_lesson_operational_use(",
  );
  assert.match(
    courseUsed,
    /from public\.modulos module[\s\S]*curso_livre_modulo_em_uso_operacional/i,
  );
  assert.match(
    courseUsed,
    /from public\.disciplinas discipline[\s\S]*curso_livre_disciplina_em_uso_operacional/i,
  );
  assert.match(courseUsed, /curso_livre_grade_tem_tentativa\(p_curso_id\)/i);
  for (const guard of [moduleGuard, disciplineGuard, lessonGuard]) {
    assert.match(guard, /security definer[\s\S]*set search_path = ''/i);
    assert.match(guard, /curso_livre_curso_em_uso_operacional/i);
    assert.match(guard, /tg_op = 'INSERT'[\s\S]*using errcode = '55000'/i);
    assert.match(guard, /tg_op = 'DELETE'[\s\S]*using errcode = '55000'/i);
    assert.match(
      guard,
      /tg_op = 'UPDATE'[\s\S]*to_jsonb\(new\) - 'descricao'[\s\S]*to_jsonb\(old\) - 'descricao'/i,
    );
  }
  assert.match(
    sql,
    /before insert or update or delete on public\.modulos/i,
  );
  assert.match(
    sql,
    /before insert or update or delete on public\.disciplinas/i,
  );
  assert.match(
    sql,
    /before insert or update or delete on public\.aulas/i,
  );
});
