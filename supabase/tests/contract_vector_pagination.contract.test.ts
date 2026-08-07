// @ts-nocheck -- contrato estático executado pelo Deno, fora do bundle web.

const migrationUrl = new URL(
  "../migrations/20260807053500_fix_contract_vector_pagination_split.sql",
  import.meta.url,
);

const migration = await Deno.readTextFile(migrationUrl);
const executableMigration = migration.replace(/^--.*$/gm, '');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("paginação de contrato é canônica e limitada para A4 vetorial", () => {
  assert(
    /p_max_caracteres integer default 1800/i.test(migration),
    "a paginação deve usar limite físico conservador para a prévia e o PDF",
  );
  assert(
    /v_limit integer := greatest\(900, least\(coalesce\(p_max_caracteres, 1800\), 2200\)\)/i.test(migration),
    "o limite não pode ser aberto pelo navegador",
  );
  assert(
    /v_break := char_length\(regexp_replace\(v_prefix, E'\\s\+\\S\*\$', ''\)\)/i.test(migration),
    "o corte deve procurar separador válido no Postgres",
  );
  assert(
    !/strrpos\s*\(/i.test(executableMigration),
    "a versão final não pode usar função inexistente no Postgres",
  );
  assert(
    /jsonb_set\([\s\S]*coalesce\(to_jsonb\(p_footer\), 'null'::jsonb\)/i.test(migration),
    "rodapé nulo deve continuar JSON válido na última página",
  );
});
