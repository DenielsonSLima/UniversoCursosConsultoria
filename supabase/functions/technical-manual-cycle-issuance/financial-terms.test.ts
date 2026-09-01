import assert from "node:assert/strict";
import { resolveCanonicalManualCycleBaneseTerms } from "./financial-terms.ts";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const FINGERPRINT = "a".repeat(64);
const receivable = (overrides: Record<string, unknown> = {}) => ({
  id: "22222222-2222-4222-8222-222222222222",
  valor: 279.9,
  data_vencimento: "2026-10-15",
  tipo_lancamento: "PARCELA",
  regra_financeira_tecnica_snapshot: {
    versao: 2,
    origem: "TURMA",
    identidade: { turmaRevisao: 3 },
    tipoLancamento: "MENSALIDADE",
    valorBase: 279.9,
    descontoPontualidade: 19.9,
    jurosAtrasoPercentual: 2,
    multaAtrasoPercentual: 2,
    multaAtrasoValor: 5.6,
    aplicarDesconto: true,
    aplicarMultaJuros: true,
    cicloManual: {
      cicloNumero: 2,
      requestId: REQUEST_ID,
      regraFingerprint: FINGERPRINT,
      politicaFingerprint: FINGERPRINT,
      cronogramaFingerprint: FINGERPRINT,
    },
    ...overrides,
  },
});

const canonical = {
  nominalAmount: 279.9,
  dueDate: "2026-10-15",
  discount: { type: "fixed", value: 19.9, validUntil: "2026-10-15" },
  penalty: { type: "percentage", value: 2, startsOn: "2026-10-16" },
  interest: {
    type: "monthly-percentage",
    value: 2,
    startsOn: "2026-10-16",
  },
};

Deno.test("termos canônicos completos são autorizados antes do POST", async () => {
  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "technical_manual_banese_expected_terms_service");
      assert.equal(args.p_receivable_id, receivable().id);
      return Promise.resolve({ data: canonical, error: null });
    },
  };
  assert.deepEqual(
    await resolveCanonicalManualCycleBaneseTerms(admin as never, receivable()),
    canonical,
  );
});

Deno.test("v1 ou identidade incompleta falham sem consultar RPC", async () => {
  let calls = 0;
  const admin = {
    rpc() {
      calls += 1;
      return Promise.resolve({ data: canonical, error: null });
    },
  };
  for (
    const invalid of [
      receivable({ versao: 1 }),
      receivable({ cicloManual: { cicloNumero: 2 } }),
      receivable({ identidade: null }),
    ]
  ) {
    await assert.rejects(
      () => resolveCanonicalManualCycleBaneseTerms(admin as never, invalid),
      /identidade completa do ciclo manual/i,
    );
  }
  assert.equal(calls, 0);
});

Deno.test("drift entre Edge e Postgres falha antes do POST", async () => {
  const admin = {
    rpc() {
      return Promise.resolve({
        data: { ...canonical, penalty: null },
        error: null,
      });
    },
  };
  await assert.rejects(
    () => resolveCanonicalManualCycleBaneseTerms(admin as never, receivable()),
    /divergiram do ciclo canônico.*nenhum título Banese/i,
  );
});
