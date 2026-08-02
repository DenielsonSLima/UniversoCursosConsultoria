import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const migrationUrl = new URL(
  "../migrations/20260731040037_list_open_diary_dependency_previews.sql",
  import.meta.url,
);
const serviceUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/dependencias-academicas.service.ts",
  import.meta.url,
);
const tableUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/components/DependenciasTable.tsx",
  import.meta.url,
);

Deno.test("diário aberto entra no workspace como resultado provisório", async () => {
  const migration = await Deno.readTextFile(migrationUrl);

  assert.match(
    migration,
    /bloqueio_diario\s+is\s+distinct\s+from\s+'TOTAL'/i,
  );
  assert.match(migration, /'tentativaStatus',\s*'DIARIO_EM_ABERTO'/i);
  assert.match(migration, /'resultadoConsolidado',\s*false/i);
  assert.match(migration, /'acionavel',\s*false/i);
  assert.match(migration, /Diário em aberto — resultado provisório/i);
});

Deno.test("resultado provisório não oferece encaminhamento nem cobrança", async () => {
  const service = await Deno.readTextFile(serviceUrl);
  const table = await Deno.readTextFile(tableUrl);

  assert.match(service, /DIARIO_EM_ABERTO/);
  assert.match(service, /resultadoConsolidado/);
  assert.match(service, /acionavel/);
  assert.match(
    table,
    /!item\.acionavel[\s\S]*!item\.resultadoConsolidado[\s\S]*Aguardar fechamento/,
  );
  assert.match(table, /resultado provisório, sujeito a alteração/i);
});

Deno.test("alterações de frequência e notas publicam evento do polo", async () => {
  const migration = await Deno.readTextFile(migrationUrl);

  assert.match(
    migration,
    /AFTER INSERT OR UPDATE OR DELETE ON public\.diario_frequencia/i,
  );
  assert.match(
    migration,
    /AFTER INSERT OR UPDATE OR DELETE ON public\.diario_notas/i,
  );
  assert.match(
    migration,
    /EXECUTE FUNCTION public\.emit_turma_academic_gestao_realtime_event\(\)/i,
  );
});
