// @ts-nocheck -- suporte do contrato estático executado pelo Deno.

import assert from "node:assert/strict";

export const migration = await Deno.readTextFile(
  new URL(
    "../migrations/20260821234000_complete_responsavel_first_access.sql",
    import.meta.url,
  ),
);
export const studentMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260821230000_harden_student_temporary_password_first_access.sql",
    import.meta.url,
  ),
);

export const compactSql = migration.replace(/\s+/g, " ").trim();

export const functionBlockFrom = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  const end = source.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return source.slice(start, end + "$function$;".length);
};
export const functionBlock = (signature: string) =>
  functionBlockFrom(migration, signature);

type FirstAccessState = {
  passwordUpdatedAt: number | null;
  temporaryPasswordIssuedAt: number | null;
  temporaryPasswordPending: boolean;
  requiresPasswordReset: boolean;
  termsAcceptedForCurrentVersion: boolean;
};

// Espelha a expressão canônica publicada por preparar/perfis/dependentes.
export const firstAccess = (state: FirstAccessState) => {
  const requiresPasswordChange = state.passwordUpdatedAt === null ||
    state.requiresPasswordReset ||
    (state.temporaryPasswordPending &&
      (state.temporaryPasswordIssuedAt === null ||
        state.passwordUpdatedAt <= state.temporaryPasswordIssuedAt));

  return {
    requiresPasswordChange,
    firstAccessPending: requiresPasswordChange ||
      !state.termsAcceptedForCurrentVersion,
  };
};
