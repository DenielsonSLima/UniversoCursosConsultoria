import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const migrationUrl = new URL(
  "../migrations/20260822104530_fix_auth_invite_uuid_fallback.sql",
  import.meta.url,
);
const migration = await Deno.readTextFile(migrationUrl);
const previousMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260821234000_complete_responsavel_first_access.sql",
    import.meta.url,
  ),
);

const functionStart = migration.indexOf(
  "CREATE OR REPLACE FUNCTION public.sync_aluno_password_reset_completion()",
);
const functionEnd = migration.indexOf("$function$;", functionStart);

assert.notEqual(functionStart, -1, "função de sincronização não encontrada");
assert.notEqual(
  functionEnd,
  -1,
  "fim da função de sincronização não encontrado",
);

const sync = migration.slice(functionStart, functionEnd);
const previousFunctionStart = previousMigration.indexOf(
  "CREATE OR REPLACE FUNCTION public.sync_aluno_password_reset_completion()",
);
const previousFunctionEnd = previousMigration.indexOf(
  "$function$;",
  previousFunctionStart,
);
const previousSync = previousMigration.slice(
  previousFunctionStart,
  previousFunctionEnd,
);

Deno.test("fallback do convite seleciona UUID somente quando há um candidato", () => {
  assert.doesNotMatch(migration, /\bmin\s*\(\s*parceiro\.id\s*\)/i);
  assert.match(
    sync,
    /SELECT\s+candidato\.id\s+INTO\s+v_fallback_id\s+FROM\s+\([\s\S]*?pg_catalog\.count\(\*\)\s+OVER\s*\(\)\s+AS quantidade[\s\S]*?\) AS candidato\s+WHERE candidato\.quantidade = 1;/i,
  );
  assert.match(sync, /parceiro\.auth_user_id IS NULL/i);
  assert.match(
    sync,
    /lower\([\s\S]*?nullif\(parceiro\.auth_login_email, ''\)[\s\S]*?nullif\(parceiro\.email, ''\)[\s\S]*?= v_email_normalizado/i,
  );
  assert.match(
    sync,
    /WHERE parceiro\.id = v_fallback_id\s+AND parceiro\.auth_user_id IS NULL/i,
  );
});

Deno.test("correção preserva guards contra vínculo em perfil incorreto", () => {
  assert.match(sync, /coalesce\(NEW\.encrypted_password, ''\) = ''/i);
  assert.match(
    sync,
    /NOT v_password_changed\s+AND NOT v_email_confirmation_changed/i,
  );
  assert.match(sync, /GET DIAGNOSTICS v_updated_count = ROW_COUNT/i);
  assert.match(
    sync,
    /IF v_updated_count > 0\s+OR NEW\.email IS NULL[\s\S]*?FROM public\.responsaveis_legais AS responsavel[\s\S]*?responsavel\.auth_user_id = NEW\.id[\s\S]*?FROM public\.parceiros AS outro_perfil[\s\S]*?outro_perfil\.auth_user_id = NEW\.id[\s\S]*?<> 'ALUNO'[\s\S]*?FROM public\.usuarios_sistema AS usuario_interno[\s\S]*?usuario_interno\.auth_user_id = NEW\.id[\s\S]*?RETURN NEW;/i,
  );
  assert.match(
    sync,
    /upper\(coalesce\(parceiro\.tipo, ''\)\) = 'ALUNO'/i,
  );
  assert.match(
    sync,
    /v_password_updated_at <= parceiro\.senha_temporaria_emitida_em/i,
  );
});

Deno.test("todos os guards e efeitos fora do seletor permanecem idênticos", () => {
  const previousSelectorStart = previousSync.indexOf(
    "  SELECT min(parceiro.id)",
  );
  const currentSelectorStart = sync.indexOf("  SELECT candidato.id");
  const selectorEndMarker = "\n\n  IF v_fallback_id IS NOT NULL THEN";
  const previousSelectorEnd = previousSync.indexOf(
    selectorEndMarker,
    previousSelectorStart,
  );
  const currentSelectorEnd = sync.indexOf(
    selectorEndMarker,
    currentSelectorStart,
  );

  for (
    const offset of [
      previousSelectorStart,
      currentSelectorStart,
      previousSelectorEnd,
      currentSelectorEnd,
    ]
  ) {
    assert.notEqual(offset, -1, "limite do seletor de fallback não encontrado");
  }

  assert.equal(
    sync.slice(0, currentSelectorStart),
    previousSync.slice(0, previousSelectorStart),
  );
  assert.equal(
    sync.slice(currentSelectorEnd),
    previousSync.slice(previousSelectorEnd),
  );
});

Deno.test("função continua atômica, restrita e sem grants de cliente", () => {
  assert.match(migration, /^--[\s\S]*?\nBEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(sync, /SECURITY DEFINER\s+SET search_path = ''/i);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.sync_aluno_password_reset_completion\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/i,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.sync_aluno_password_reset_completion\(\)\s+TO (?:PUBLIC|anon|authenticated)/i,
  );
});
