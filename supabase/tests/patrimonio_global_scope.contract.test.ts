import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationPath = new URL(
  "../migrations/20260810145500_fix_gestor_global_allowed_polos.sql",
  import.meta.url,
);
const migration = await Deno.readTextFile(migrationPath);

Deno.test("gestor global materializa somente polos ativos na lista canônica", () => {
  assert.match(
    migration,
    /WHEN public\.gestor_has_all_polos\(\) THEN \([\s\S]*array_agg\(polo\.id ORDER BY polo\.created_at, polo\.id\)[\s\S]*lower\(coalesce\(polo\.status, 'ativo'\)\) = 'ativo'/,
  );
});

Deno.test("escopo local e janela de acesso permanecem preservados", () => {
  assert.match(
    migration,
    /WHEN NOT public\.gestor_schedule_allows_access\(\) THEN ARRAY\[\]::uuid\[\]/,
  );
  assert.match(
    migration,
    /cardinality\(coalesce\(usuario\.polo_ids, ARRAY\[\]::uuid\[\]\)\) > 0[\s\S]*THEN usuario\.polo_ids/,
  );
  assert.match(
    migration,
    /usuario\.context ~\* '\^\[0-9a-f\]\{8\}-[\s\S]*THEN ARRAY\[usuario\.context::uuid\]/,
  );
});

Deno.test("helper compartilhado mantém search_path vazio e documentação explícita", () => {
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/);
  assert.match(
    migration,
    /COMMENT ON FUNCTION public\.gestor_allowed_polo_ids\(\)/,
  );
});
