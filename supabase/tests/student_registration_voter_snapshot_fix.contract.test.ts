import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260809055000_fix_student_registration_voter_snapshot.sql",
  import.meta.url,
);

Deno.test("emissor canônico congela todos os campos do título eleitoral", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /create or replace function public\.emitir_ficha_validacao_portal\([\s\S]*?p_dados_emissao jsonb default '\{\}'::jsonb[\s\S]*?security definer\s+set search_path = ''/i,
  );

  const selectFields = [
    ["titulo_eleitor", "student_voter_id"],
    ["titulo_eleitor_zona", "student_voter_zone"],
    ["titulo_eleitor_secao", "student_voter_section"],
    ["titulo_eleitor_data_emissao", "student_voter_issue_date"],
    ["titulo_eleitor_uf", "student_voter_state"],
  ] as const;

  for (const [column, alias] of selectFields) {
    assert.match(source, new RegExp(`p\\.${column} as ${alias}`, "i"));
  }

  const snapshotFields = [
    ["studentVoterId", "student_voter_id"],
    ["studentVoterZone", "student_voter_zone"],
    ["studentVoterSection", "student_voter_section"],
    ["studentVoterIssueDate", "student_voter_issue_date"],
    ["studentVoterState", "student_voter_state"],
  ] as const;

  for (const [key, field] of snapshotFields) {
    assert.match(
      source,
      new RegExp(`'${key}', coalesce\\(v_enrollment\\.${field}`, "i"),
    );
  }

  assert.match(source, /for share of m, p, t, c/i);
  assert.match(
    source,
    /public\.can_manage_secretaria_document\(p_documento, v_enrollment\.polo_id\)/i,
  );
  assert.match(source, /from public\.emitir_documento_validacao_portal\(/i);
  assert.match(
    source,
    /if coalesce\(v_issue\.reutilizado, false\) then[\s\S]*?perform 1[\s\S]*?else[\s\S]*?update public\.documentos_validacao as validation/i,
  );
  assert.equal(
    source.match(/update public\.documentos_validacao as validation/gi)?.length,
    1,
    "a migration não pode fazer backfill fora da nova emissão",
  );
  assert.match(
    source,
    /revoke all on function public\.emitir_ficha_validacao_portal\([\s\S]*?from public, anon/i,
  );
  assert.match(
    source,
    /grant execute on function public\.emitir_ficha_validacao_portal\([\s\S]*?to authenticated, service_role/i,
  );
  assert.match(source, /commit;\s*$/i);
});
