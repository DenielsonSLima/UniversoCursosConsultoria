import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const pageUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/DependenciasAcademicasPage.tsx",
  import.meta.url,
);
const filtersUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/components/DependenciasFilters.tsx",
  import.meta.url,
);
const tableUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/components/DependenciasTable.tsx",
  import.meta.url,
);
const migrationUrl = new URL(
  "../migrations/20260731041512_expose_dependency_workspace_filter_dimensions.sql",
  import.meta.url,
);

Deno.test("workspace expõe dimensões canônicas para modalidade e turma", async () => {
  const migration = await Deno.readTextFile(migrationUrl);

  assert.match(migration, /'modalidade',[\s\S]*curso\.modalidade/i);
  assert.match(migration, /'turmaOrigemId',[\s\S]*turma\.id::text/i);
  assert.match(
    migration,
    /get_secretaria_dependencias_workspace_secure\(uuid,\s*text\)/i,
  );
});

Deno.test("abas reutilizam a navegação sublinhada do Financeiro", async () => {
  const page = await Deno.readTextFile(pageUrl);

  assert.match(page, /FinancialUnderlineTabs/);
  assert.match(page, /Etapas das dependências acadêmicas/);
  assert.doesNotMatch(page, /rounded-3xl border border-slate-200 bg-white p-2/);
});

Deno.test("filtros encadeiam modalidade, curso e turma", async () => {
  const page = await Deno.readTextFile(pageUrl);
  const filters = await Deno.readTextFile(filtersUrl);

  assert.match(filters, /Filtrar por modalidade/);
  assert.match(filters, /Filtrar por curso/);
  assert.match(filters, /Filtrar por turma/);
  assert.match(page, /setCursoFilter\(''\)[\s\S]*setTurmaFilter\(''\)/);
  assert.match(page, /groupedItems/);
});

Deno.test("visualização alterna explicitamente entre tabela e cards", async () => {
  const filters = await Deno.readTextFile(filtersUrl);
  const table = await Deno.readTextFile(tableUrl);

  assert.match(filters, /Visualizar como tabela/);
  assert.match(filters, /Visualizar como cards/);
  assert.match(table, /viewMode === 'cards'/);
  assert.match(table, /<table/);
});

Deno.test("paginação preserva todas as linhas do mesmo aluno", async () => {
  const page = await Deno.readTextFile(pageUrl);
  const table = await Deno.readTextFile(tableUrl);

  assert.match(page, /STUDENTS_PER_PAGE/);
  assert.match(page, /studentUnits[\s\S]*slice\(/);
  assert.match(page, /Paginação das dependências/);
  assert.match(table, /studentBandByKey/);
  assert.match(table, /data-student-band/);
});
