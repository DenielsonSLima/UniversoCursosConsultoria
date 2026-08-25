// @ts-nocheck -- contrato estatico da RPC de checkout executado pelo Deno.

import assert from "node:assert/strict";

const migration = await Deno.readTextFile(
  new URL(
    "../migrations/20260824113600_allow_professor_student_checkout_identity.sql",
    import.meta.url,
  ),
);

const functionBlock = (sql: string, signature: string) => {
  const start = sql.indexOf(signature);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Funcao ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("checkout cria somente Aluno a partir de fonte com senha liberada", () => {
  const checkout = functionBlock(
    migration,
    "public.portal_garantir_perfil_aluno_checkout(",
  );
  const authorization = checkout.indexOf("v_source_role IS NULL");
  const sourceLookup = checkout.indexOf("FROM public.parceiros AS parceiro");
  const alunoLookup = checkout.indexOf("FROM public.parceiros AS aluno_uid");
  const replay = checkout.indexOf("portal_identidade_obter_replay(");

  assert.match(
    checkout,
    /upper\(parceiro\.tipo\) in \('ALUNO', 'PROFESSOR'\)/i,
  );
  assert.match(
    checkout,
    /upper\(parceiro\.tipo\) = 'ALUNO'[\s\S]*?portal_identidade_institucional_acesso_liberado\([\s\S]*?v_actor,[\s\S]*?'PROFESSOR'/i,
  );
  assert.match(
    checkout,
    /from public\.usuarios_sistema as gestor[\s\S]*?portal_identidade_institucional_acesso_liberado\([\s\S]*?v_actor,[\s\S]*?'GESTOR'/i,
  );
  assert.match(
    checkout,
    /'RESPONSAVEL'::text[\s\S]*?from public\.responsaveis_legais as responsavel[\s\S]*?responsavel\.auth_user_id = v_actor[\s\S]*?responsavel\.status = 'ATIVO'/i,
  );
  assert.match(
    checkout,
    /responsavel\.identidade_verificada_em is not null[\s\S]*?public\.is_valid_cpf\([\s\S]*?responsavel\.cpf_normalizado[\s\S]*?responsavel\.email[\s\S]*?= v_auth_email/i,
  );
  assert.match(
    checkout,
    /responsavel\.senha_atualizada_em is not null[\s\S]*?not coalesce\(responsavel\.troca_senha_obrigatoria, false\)[\s\S]*?responsavel\.senha_temporaria_pendente[\s\S]*?senha_temporaria_emitida_em is null[\s\S]*?senha_atualizada_em <=[\s\S]*?senha_temporaria_emitida_em/i,
  );
  assert.match(
    checkout,
    /from public\.parceiros as aluno_uid[\s\S]*?aluno_uid\.auth_user_id = v_actor[\s\S]*?upper\(aluno_uid\.tipo\) = 'ALUNO'[\s\S]*?for update/i,
  );
  assert.doesNotMatch(checkout, /v_parceiro_vinculado|parceiro_uid/i);
  assert.doesNotMatch(
    checkout,
    /ALUNO_CHECKOUT_ACESSO_JA_VINCULADO_A_PROFESSOR/i,
  );
  assert.ok(sourceLookup < authorization && authorization < alunoLookup);
  assert.ok(alunoLookup < replay);
  assert.match(
    checkout,
    /'portal-auth-identity:' \|\| v_actor::text/i,
  );
  assert.match(
    checkout,
    /aluno_replay\.auth_user_id = v_actor[\s\S]*?upper\(aluno_replay\.tipo\) = 'ALUNO'/i,
  );
  assert.match(checkout, /'ALUNO_CHECKOUT_GARANTIR'/i);
  assert.match(checkout, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  assert.doesNotMatch(
    checkout,
    /p_senha|encrypted_password|update auth\.users/i,
  );
  assert.doesNotMatch(checkout, /aceitou_termos_uso|termos_uso_versao/i);
  assert.match(
    migration,
    /revoke all on function public\.portal_garantir_perfil_aluno_checkout\(uuid, uuid\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.portal_garantir_perfil_aluno_checkout\(uuid, uuid\)[\s\S]*?to authenticated/i,
  );
});

Deno.test("checkout usa try-lock recuperavel antes dos row locks", () => {
  const checkout = functionBlock(
    migration,
    "public.portal_garantir_perfil_aluno_checkout(",
  );
  const sourceRow = checkout.indexOf("FOR UPDATE");
  const target = checkout.indexOf("FROM public.parceiros AS aluno\n");
  const targetRow = checkout.indexOf("FOR UPDATE", target);
  const temporary = checkout.indexOf("pg_try_advisory_xact_lock");
  const identity = checkout.indexOf("'portal-auth-identity:'", temporary);

  assert.ok(sourceRow >= 0 && targetRow > sourceRow);
  assert.ok(temporary >= 0 && temporary < identity && identity < sourceRow);
  assert.equal(
    (checkout.match(/pg_try_advisory_xact_lock/gi) || []).length,
    2,
  );
  assert.equal((checkout.match(/errcode = '40001'/gi) || []).length, 2);
  assert.doesNotMatch(
    checkout,
    /perform\s+pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(\s*'portal-temporary-password-auth/i,
  );
});
