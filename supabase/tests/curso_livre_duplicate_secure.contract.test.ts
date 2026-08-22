import assert from "node:assert/strict";

declare const Deno: {
  readTextFile(path: string | URL): Promise<string>;
  test(name: string, fn: () => void | Promise<void>): void;
};

const migrationName = "20260822160930_duplicate_curso_livre_secure.sql";
const sql = await Deno.readTextFile(
  new URL(`../migrations/${migrationName}`, import.meta.url),
);

function body(name: string): string {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start >= 0, `função ausente: ${name}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(end > start, `fim ausente: ${name}`);
  return sql.slice(start, end + "$function$;".length);
}

Deno.test("migration de duplicação Livre é transacional e limitada", () => {
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
  assert.ok(
    sql.split(/\r?\n/).length <= 500,
    `${migrationName} excede 500 linhas`,
  );
  assert.equal(
    sql.match(/as \$function\$/gi)?.length ?? 0,
    sql.match(/\$function\$;/g)?.length ?? 0,
  );
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});

Deno.test("RPC possui assinatura exata e menor privilégio", () => {
  assert.match(
    sql,
    /public\.duplicar_curso_livre_gestao_secure\(\s*p_request_id uuid,\s*p_curso_id uuid,\s*p_novo_nome text,\s*p_nova_versao text\s*\)/is,
  );
  const duplicate = body("public.duplicar_curso_livre_gestao_secure(");
  assert.match(duplicate, /security definer[\s\S]*set search_path = ''/i);
  assert.match(
    sql,
    /revoke all on table internal_academic\.curso_livre_duplicate_requests[\s\S]*service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.duplicar_curso_livre_gestao_secure[\s\S]*public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.duplicar_curso_livre_gestao_secure[\s\S]*authenticated, service_role/i,
  );
});

Deno.test("duplicação autoriza e valida antes de consultar o ledger", () => {
  const duplicate = body("public.duplicar_curso_livre_gestao_secure(");
  const authorize = duplicate.indexOf("assert_can_manage_curso_livre");
  const validateRequest = duplicate.indexOf("if p_request_id is null");
  const payloadHash = duplicate.indexOf("v_payload_hash :=");
  const requestLock = duplicate.indexOf("curso-livre-duplicate-request:");
  const ledgerRead = duplicate.indexOf(
    "curso_livre_duplicate_requests request",
  );
  const replay = duplicate.indexOf("return pg_catalog.jsonb_set");
  const gradeLock = duplicate.indexOf("curso-livre-grade:'");
  assert.ok(
    authorize >= 0 && authorize < validateRequest &&
      validateRequest < payloadHash &&
      payloadHash < requestLock && requestLock < ledgerRead &&
      ledgerRead < replay &&
      replay < gradeLock,
  );
  assert.match(duplicate, /actor_id is distinct from v_actor_id/i);
  assert.match(duplicate, /source_curso_id is distinct from p_curso_id/i);
  assert.match(duplicate, /payload_hash <> v_payload_hash/i);
  assert.match(
    duplicate,
    /'cursoId', p_curso_id[\s\S]*'novoNome', v_name[\s\S]*'novaVersao', v_version/i,
  );
});

Deno.test("fonte é estabilizada e autorização é refeita após o lock", () => {
  const duplicate = body("public.duplicar_curso_livre_gestao_secure(");
  const gradeLock = duplicate.indexOf("curso-livre-grade:'");
  const courseLock = duplicate.indexOf("from public.cursos source", gradeLock);
  const reauthorize = duplicate.indexOf(
    "assert_can_manage_curso_livre",
    courseLock,
  );
  const mutation = duplicate.indexOf("insert into public.cursos", reauthorize);
  assert.ok(
    gradeLock >= 0 && gradeLock < courseLock && courseLock < reauthorize &&
      reauthorize < mutation,
  );
  assert.match(
    duplicate,
    /from public\.cursos source[\s\S]*modalidade, ''\)\) = 'LIVRE'[\s\S]*for share;/i,
  );
  assert.match(
    duplicate,
    /from public\.modulos module[\s\S]*order by module\.id[\s\S]*for share;/i,
  );
  assert.match(
    duplicate,
    /from public\.disciplinas discipline[\s\S]*for share of discipline;/i,
  );
  assert.match(
    duplicate,
    /from public\.aulas lesson[\s\S]*for share of lesson;/i,
  );
});

Deno.test("curso clonado copia somente configurações permitidas e nasce rascunho", () => {
  const duplicate = body("public.duplicar_curso_livre_gestao_secure(");
  for (
    const field of [
      "carga_horaria",
      "area",
      "descricao",
      "parceiro_instituicao",
      "parceiro_logo_url",
      "imagem_url",
      "duracao_meses",
      "imagem_detalhe_1",
      "imagem_detalhe_2",
      "financeiro_config",
      "vacinas_config",
    ]
  ) assert.match(duplicate, new RegExp(`v_source_course\\.${field}`, "i"));
  assert.match(
    duplicate,
    /insert into public\.cursos\([\s\S]*modalidade,[\s\S]*status,[\s\S]*publicar_site,[\s\S]*valor,[\s\S]*\) values \([\s\S]*'LIVRE',[\s\S]*'ativo',[\s\S]*false,[\s\S]*null,/i,
  );
  assert.doesNotMatch(
    duplicate,
    /v_source_course\.(?:ead_config|asaas_payment_link_id|asaas_payment_link_url|asaas_link_status)/i,
  );
});

Deno.test("grade inteira é clonada com novos IDs gerados no servidor", () => {
  const duplicate = body("public.duplicar_curso_livre_gestao_secure(");
  assert.match(
    duplicate,
    /insert into public\.modulos\(curso_id, nome, descricao, ordem\)[\s\S]*returning id into v_new_module_id/i,
  );
  assert.match(
    duplicate,
    /insert into public\.disciplinas\([\s\S]*carga_horaria_teoria[\s\S]*carga_horaria_pratica[\s\S]*carga_horaria_estagio[\s\S]*returning id into v_new_discipline_id/i,
  );
  assert.match(
    duplicate,
    /insert into public\.aulas\([\s\S]*titulo,[\s\S]*carga_horaria,[\s\S]*descricao,[\s\S]*ordem/i,
  );
  assert.doesNotMatch(
    duplicate,
    /insert into public\.(?:modulos|disciplinas|aulas)\([^)]*\bid\b/i,
  );
  assert.doesNotMatch(
    duplicate,
    /insert into public\.(?:turmas|matriculas|curso_livre_tentativas|contas_receber|turmas_disciplinas)/i,
  );
});

Deno.test("resposta e replay mantêm o mesmo clone e workspace camelCase", () => {
  const duplicate = body("public.duplicar_curso_livre_gestao_secure(");
  const clone = duplicate.indexOf("insert into public.cursos");
  const moduleClone = duplicate.indexOf("insert into public.modulos", clone);
  const lessonClone = duplicate.indexOf(
    "insert into public.aulas",
    moduleClone,
  );
  const response = duplicate.indexOf("v_response :=", lessonClone);
  const ledgerWrite = duplicate.indexOf(
    "insert into internal_academic.curso_livre_duplicate_requests",
    response,
  );
  assert.ok(
    clone >= 0 && clone < moduleClone && moduleClone < lessonClone &&
      lessonClone < response && response < ledgerWrite,
  );
  assert.match(
    duplicate,
    /get_curso_livre_grade_payload\(v_new_course\.id\)/i,
  );
  for (
    const field of [
      "cursoId",
      "curso",
      "fingerprint",
      "modulos",
      "replayed",
      "cargaHoraria",
      "publicarSite",
    ]
  ) assert.match(duplicate, new RegExp(`'${field}'`, "i"));
  assert.match(
    duplicate,
    /jsonb_set\(v_stored\.response, '\{replayed\}', 'true'::jsonb, true\)/i,
  );
});
