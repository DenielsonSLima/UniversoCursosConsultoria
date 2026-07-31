import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260731014803_create_dependency_reoffer_core.sql",
  import.meta.url,
);

Deno.test("pendência nasce somente de reprovação terminal com diário total", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function internal_academic\.get_terminal_dependency_failure/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(functionSource, /bloqueio_diario = 'TOTAL'/i);
  assert.match(
    functionSource,
    /resultado_final in \('REPROVADO_FREQUENCIA', 'REPROVADO'\)/i,
  );
});

Deno.test("confirmação autoriza antes do replay e serializa a oferta exata", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.confirmar_dependencia_reoferta_secure/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  const authorization = functionSource.search(
    /can_manage_dependency_workspace\(v_matricula\.turma_id\)/i,
  );
  const replayLookup = functionSource.search(
    /where mt\.idempotency_key = btrim\(p_idempotency_key\)/i,
  );
  assert.ok(authorization >= 0 && replayLookup > authorization);
  assert.match(functionSource, /for update of t, td/i);
  assert.match(
    functionSource,
    /aula\.data_aula[\s\S]*timezone\('America\/Maceio', now\(\)\)::date/i,
  );
  assert.match(
    functionSource,
    /matricula_duplicada\.aluno_id = v_matricula\.aluno_id/i,
  );
});

Deno.test("valor é calculado no backend e congelado na tentativa", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /round\(v_base \* v_policy\.multiplicador_parcela, 2\)/i,
  );
  assert.match(
    source,
    /valor_parcela_base_snapshot[\s\S]*multiplicador_snapshot[\s\S]*valor_cobrado_snapshot/i,
  );
  assert.match(
    source,
    /'DEPENDENCIA_ATE_40H'[\s\S]*0\.5000/i,
  );
  assert.match(
    source,
    /'DEPENDENCIA_ACIMA_40H'[\s\S]*1\.0000/i,
  );
});

Deno.test("política por disciplina é versionada, idempotente e específica", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.configurar_politica_dependencia_disciplina_secure/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(source, /disciplina_id uuid references public\.disciplinas/i);
  assert.match(
    source,
    /order by[\s\S]*\(p\.disciplina_id is not null\) desc/i,
  );
  assert.match(functionSource, /idempotency_key = btrim\(p_idempotency_key\)/i);
  assert.match(functionSource, /status = 'INATIVA'/i);
  assert.match(functionSource, /'DEPENDENCIA_DISCIPLINA'/i);
  assert.match(
    functionSource,
    /v_multiplier := round\(p_multiplicador_parcela, 4\)/i,
  );
  assert.match(
    functionSource,
    /v_policy\.multiplicador_parcela <> v_multiplier/i,
  );
  assert.match(
    functionSource,
    /p_multiplicador_parcela < 0\.01[\s\S]*p_multiplicador_parcela > 10/i,
  );
});
