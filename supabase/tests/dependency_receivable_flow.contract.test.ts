import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const coreMigrationUrl = new URL(
  "../migrations/20260731014803_create_dependency_reoffer_core.sql",
  import.meta.url,
);
const auditMigrationUrl = new URL(
  "../migrations/20260731022629_audit_dependency_state_machine.sql",
  import.meta.url,
);
const mutationsUrl = new URL(
  "../../modules/gestor/secretaria/dependencias-academicas/hooks/useDependenciasAcademicasMutations.ts",
  import.meta.url,
);
const financeServiceUrl = new URL(
  "../../modules/gestor/financeiro/financeiro.service.ts",
  import.meta.url,
);

Deno.test("confirmação cria somente recebível local de dependência", async () => {
  const source = await Deno.readTextFile(coreMigrationUrl);
  const start = source.search(
    /create or replace function public\.confirmar_dependencia_reoferta_secure/i,
  );
  const end = source.indexOf("$$;", start);
  const confirmSource = source.slice(start, end);

  assert.match(confirmSource, /INSERT INTO public\.contas_receber/i);
  assert.match(
    confirmSource,
    /'DEPENDENCIA'[\s\S]*'BOLETO'[\s\S]*'banese_card'[\s\S]*'BOLETO'/i,
  );
  assert.match(confirmSource, /'emissaoBancariaSolicitada',\s*false/i);
  assert.doesNotMatch(confirmSource, /functions\.invoke|fetch\(|http_post/i);
});

Deno.test("recebível fica vinculado à tentativa e não à matrícula inteira", async () => {
  const source = await Deno.readTextFile(coreMigrationUrl);

  assert.match(
    source,
    /INSERT INTO public\.matricula_dependencia_cobrancas[\s\S]*v_attempt\.id[\s\S]*v_charge\.id/i,
  );
  assert.match(
    source,
    /INSERT INTO public\.contas_receber[\s\S]*v_matricula\.aluno_id,[\s\S]*NULL,[\s\S]*p_turma_destino_id/i,
  );
});

Deno.test("replay idempotente valida vencimento e reutiliza o recebível", async () => {
  const source = await Deno.readTextFile(auditMigrationUrl);
  const start = source.search(
    /create or replace function public\.confirmar_dependencia_reoferta_secure/i,
  );
  const end = source.indexOf("$$;", start);
  const confirmSource = source.slice(start, end);

  assert.match(confirmSource, /data_vencimento IS DISTINCT FROM p_data_vencimento/i);
  assert.match(confirmSource, /conta_receber_id IS NULL/i);
  assert.match(confirmSource, /'replayed',\s*true/i);
  assert.match(confirmSource, /FOR UPDATE OF turma, oferta/i);
});

Deno.test("frontend preserva confirmação local se emissão Banese falhar", async () => {
  const mutations = await Deno.readTextFile(mutationsUrl);
  const financeService = await Deno.readTextFile(financeServiceUrl);

  assert.match(
    mutations,
    /const confirmation = await dependenciasAcademicasService\.confirmar\(input\)/,
  );
  assert.match(mutations, /new DependenciaCheckoutError[\s\S]*confirmation/);
  assert.match(financeService, /'REMATRICULA' \| 'DEPENDENCIA'/);
});
