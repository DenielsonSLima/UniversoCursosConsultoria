import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260809054000_fix_plano_curso_professor_list_identity.sql",
  import.meta.url,
);

Deno.test("lista do Professor devolve a identidade documental nullable exigida pelo parser", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /create or replace function public\.listar_planos_curso_professor_secure\(p_polo_id uuid\)/i,
  );
  assert.match(source, /security definer\s+set search_path = ''/i);
  assert.match(source, /'templateRevision', plan\.template_revision/i);
  assert.match(source, /'documentoFingerprint', plan\.documento_fingerprint/i);
  assert.match(source, /left join public\.planos_curso plan[\s\S]*plan\.professor_id = v_professor_id/i);
  assert.match(source, /where assignment\.professor_id = v_professor_id/i);
  assert.match(
    source,
    /revoke all on function public\.listar_planos_curso_professor_secure\(uuid\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    source,
    /grant execute on function public\.listar_planos_curso_professor_secure\(uuid\)[\s\S]*to authenticated/i,
  );
  assert.doesNotMatch(source, /grant execute[\s\S]*to anon/i);
  assert.match(source, /commit;\s*$/i);
});
