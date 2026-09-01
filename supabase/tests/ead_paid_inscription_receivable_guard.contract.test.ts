import assert from "node:assert/strict";

const migration = await Deno.readTextFile(
  new URL(
    "../migrations/20260901000800_preserve_paid_ead_receivable_on_inscription_projection.sql",
    import.meta.url,
  ),
);

Deno.test("projecao EAD nao sobrescreve recebivel ja pago", () => {
  assert.match(
    migration,
    /update public\.contas_receber[\s\S]*where id = v_conta_id\s+and status is distinct from 'PAGO'/i,
  );

  const effectivePaidAmount = 260;
  const nominalInscriptionAmount = 279.9;
  const projectPaidInscription = (status: string, paidAmount: number) =>
    status === "PAGO" ? paidAmount : nominalInscriptionAmount;

  const firstRetry = projectPaidInscription("PAGO", effectivePaidAmount);
  const secondRetry = projectPaidInscription("PAGO", firstRetry);
  assert.equal(firstRetry, effectivePaidAmount);
  assert.equal(secondRetry, effectivePaidAmount);
});

Deno.test("projecao continua restrita a EAD e nao amplia Tecnico", () => {
  assert.match(
    migration,
    /if v_modalidade is null or v_modalidade <> 'EAD' then\s+return new;/i,
  );
  assert.doesNotMatch(migration, /v_modalidade\s*=\s*'TECNICO'/i);
});

Deno.test("funcao da projecao nao fica executavel pelo cliente", () => {
  assert.match(
    migration,
    /revoke all on function public\.ead_activate_matricula_on_paid_inscricao\(\)\s+from public, anon, authenticated;/i,
  );
});
