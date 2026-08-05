import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const migration = await Deno.readTextFile(
  new URL(
    "../migrations/20260805175217_fix_public_student_signup_auth_partner_link.sql",
    import.meta.url,
  ),
);
const originalProfileSync = await Deno.readTextFile(
  new URL(
    "../migrations/20260714015500_sync_public_signup_auth_to_partner.sql",
    import.meta.url,
  ),
);
const relationshipConsent = await Deno.readTextFile(
  new URL(
    "../migrations/20260804203000_separate_relationship_birthday_consent.sql",
    import.meta.url,
  ),
);

const extractFunction = (signature: string) => {
  const start = migration.indexOf(signature);
  assert.notEqual(start, -1, `funcao ausente: ${signature}`);
  const end = migration.indexOf("$$;", start);
  assert.notEqual(end, -1, `fim da funcao ausente: ${signature}`);
  return migration.slice(start, end);
};

const cpfGuard = extractFunction(
  "create or replace function public.enforce_public_aluno_cpf_before_auth_write()",
);
const authPartnerLink = extractFunction(
  "create or replace function public.link_public_aluno_auth_partner_after_profile_sync()",
);

Deno.test("UPDATE interno inalterado retorna antes de consultar a duplicidade", () => {
  const unchangedUpdateGuard = cpfGuard.indexOf("if tg_op = 'UPDATE' then");
  const advisoryLock = cpfGuard.indexOf("pg_advisory_xact_lock");
  const availabilityCheck = cpfGuard.indexOf(
    "is_public_aluno_cpf_available(v_cpf, new.id)",
  );

  assert.ok(unchangedUpdateGuard >= 0);
  assert.ok(advisoryLock > unchangedUpdateGuard);
  assert.ok(availabilityCheck > advisoryLock);
  assert.match(
    cpfGuard,
    /v_old_metadata[\s\S]*->> 'cpf'[\s\S]*= v_cpf[\s\S]*->> 'origem'[\s\S]*= v_origin[\s\S]*->> 'tipo'[\s\S]*= v_tipo[\s\S]*return new;/i,
  );
});

Deno.test("INSERT e mudanca real de CPF preservam trava e erro canonico", () => {
  assert.match(
    cpfGuard,
    /pg_catalog\.pg_advisory_xact_lock\([\s\S]*public-aluno-cpf:/i,
  );
  assert.match(
    cpfGuard,
    /not public\.is_public_aluno_cpf_available\(v_cpf, new\.id\)/i,
  );
  assert.match(cpfGuard, /constraint = 'public_aluno_cpf_unique'/i);
  assert.match(
    migration,
    /before insert or update of raw_user_meta_data\s+on auth\.users/i,
  );
});

Deno.test("vinculo executa entre a criacao do perfil e a captura de preferencia", () => {
  const profileTrigger = "trg_sync_public_aluno_auth_profile";
  const linkTrigger = "trg_sync_public_aluno_auth_profile_zz_link";
  const relationshipTrigger =
    "trg_zz_capture_public_signup_relationship_preference";

  assert.ok(originalProfileSync.includes(profileTrigger));
  assert.ok(relationshipConsent.includes(relationshipTrigger));
  assert.ok(profileTrigger < linkTrigger);
  assert.ok(linkTrigger < relationshipTrigger);
  assert.match(
    migration,
    /create trigger trg_sync_public_aluno_auth_profile_zz_link\s+after insert or update of email, raw_user_meta_data\s+on auth\.users/i,
  );
});

Deno.test("parceiro e bloqueado e vinculado ao UUID do proprio Auth", () => {
  const cpfLookup = authPartnerLink.indexOf("parceiro.cpf_cnpj");

  assert.ok(cpfLookup >= 0);
  assert.match(authPartnerLink, /limit 1\s+for update/is);
  assert.match(
    authPartnerLink,
    /parceiro\.cpf_cnpj[\s\S]*= v_cpf[\s\S]*parceiro\.auth_login_email[\s\S]*parceiro\.email[\s\S]*= v_email/i,
  );
  assert.match(
    authPartnerLink,
    /tg_op = 'UPDATE'[\s\S]*parceiro\.auth_user_id = new\.id/i,
  );
  assert.doesNotMatch(
    authPartnerLink,
    /if v_partner_id is null and v_email is not null/i,
  );
  assert.match(
    authPartnerLink,
    /v_partner_auth_user_id is not null[\s\S]*v_partner_auth_user_id <> new\.id[\s\S]*raise exception/i,
  );
  assert.match(authPartnerLink, /auth_user_id = new\.id/i);
  assert.match(authPartnerLink, /auth_login_email = v_email/i);
  assert.match(
    authPartnerLink,
    /parceiro\.auth_user_id is null[\s\S]*parceiro\.auth_user_id = new\.id/i,
  );
  assert.match(
    authPartnerLink,
    /returning parceiro\.id into v_linked_partner_id/i,
  );
});

Deno.test("estado tecnico so nasce ativo com senha e confirmacao do Auth", () => {
  assert.match(
    authPartnerLink,
    /coalesce\(new\.encrypted_password, ''\) <> ''[\s\S]*coalesce\(new\.email_confirmed_at, new\.confirmed_at\) is not null/i,
  );
  assert.match(
    authPartnerLink,
    /acesso_status = case\s*when v_auth_ready then 'ativo'\s*else 'pendente'\s*end/i,
  );
  assert.match(authPartnerLink, /troca_senha_obrigatoria = false/i);
  assert.match(authPartnerLink, /acesso_erro = null/i);
  assert.doesNotMatch(authPartnerLink, /\n\s*status\s*=/i);
});

Deno.test("falha de materializacao recua o Auth em vez de deixar identidade orfa", () => {
  assert.match(
    authPartnerLink,
    /if v_partner_id is null then[\s\S]*raise exception/i,
  );
  assert.match(
    authPartnerLink,
    /if v_linked_partner_id is null then[\s\S]*raise exception/i,
  );
  assert.doesNotMatch(authPartnerLink, /exception\s+when\s+others/i);
});

Deno.test("funcoes privilegiadas permanecem fechadas para clientes", () => {
  for (
    const functionName of [
      "enforce_public_aluno_cpf_before_auth_write",
      "link_public_aluno_auth_partner_after_profile_sync",
    ]
  ) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${functionName}\\(\\)\\s+from public, anon, authenticated`,
        "i",
      ),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(
        `grant execute on function public\\.${functionName}\\(\\)\\s+to (?:anon|authenticated)`,
        "i",
      ),
    );
  }

  assert.match(cpfGuard, /security definer\s+set search_path = ''/i);
  assert.match(authPartnerLink, /security definer\s+set search_path = ''/i);
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from)\s+auth\.users/i,
  );
});

Deno.test("hotfix nao altera consentimento nem preferencias de comunicacao", () => {
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from)\s+public\.comunicacao_preferencias/i,
  );
  assert.doesNotMatch(migration, /relationshipBirthdayConsent/i);
});
