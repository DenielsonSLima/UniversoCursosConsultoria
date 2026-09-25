import assert from "node:assert/strict";
import { createReceivableIssuer } from "./receivable-issuance.ts";
import { deterministicReceivableRequestId, IssuanceHttpError } from "./contract.ts";
import type { ManualCycleContext, ManualCycleIssuanceRequest } from "./contract.ts";
import { runManualCycleIssuance } from "./orchestrator.ts";

const RUN = "11111111-1111-4111-8111-111111111111";
const ENROLLMENT = "22222222-2222-4222-8222-222222222222";
const CLASS = "33333333-3333-4333-8333-333333333333";
const POLO = "44444444-4444-4444-8444-444444444444";
const RECEIVABLE = "55555555-5555-4555-8555-555555555501";

const context = (): ManualCycleContext => ({
  requestId: RUN, replayed: false, matriculaId: ENROLLMENT, turmaId: CLASS, poloId: POLO,
  ciclo: {
    numero: 1, cicloNumero: 1, status: "EMISSAO_PARCIAL", quantidadeItens: 12,
    quantidadeBancaria: 12, quantidadeLocal: 0, total: "3358.80",
    emitidosBanese: 0, pendentesEmissao: 12, emRevisao: 0,
    recebiveis: Array.from({ length: 12 }, (_, index) => ({
      id: `55555555-5555-4555-8555-5555555555${String(index + 1).padStart(2, "0")}`,
      chave: `ciclo-1-parc-${index + 1}`, tipo: "PARCELA", numero: index + 1,
      descricao: `Mensalidade ${index + 1}`, valor: "279.90", vencimento: "2026-10-15",
      status: "PENDENTE", emissaoBanese: "PENDENTE", destinoCobranca: "BANESE",
    })),
  },
  cicloManual: {},
});

const fixture = () => {
  let denyClaim = true;
  let updates = 0;
  let termChecks = 0;
  const authorizations: string[] = [];
  let row: Record<string, unknown> = {
    id: RECEIVABLE, matricula_id: ENROLLMENT, turma_id: CLASS, polo_id: POLO,
    cliente_id: POLO, status: "PENDENTE", gateway_provider: "banese_card",
    valor: 279.9, data_vencimento: "2026-10-15", tipo_lancamento: "PARCELA",
    regra_financeira_tecnica_snapshot: {
      versao: 2, origem: "TURMA", identidade: { turmaRevisao: 3 },
      tipoLancamento: "MENSALIDADE", valorBase: 279.9,
      descontoPontualidade: 19.9, jurosAtrasoPercentual: 2,
      multaAtrasoPercentual: 2, multaAtrasoValor: 5.6,
      aplicarDesconto: true, aplicarMultaJuros: true,
      cicloManual: {
        requestId: RUN, cicloNumero: 1, regraFingerprint: "a".repeat(64),
        politicaFingerprint: "b".repeat(64), cronogramaFingerprint: "c".repeat(64),
      },
    },
  };
  const admin = {
    from(table: string) {
      let patch: Record<string, unknown> | undefined;
      const response = () => {
        if (table === "payment_gateway_transactions") return { data: [], error: null };
        if (table === "parceiros") return { data: { id: POLO, nome: "Fixture", uf: "SE" }, error: null };
        assert.equal(table, "contas_receber");
        if (patch) {
          updates += 1;
          if (denyClaim) return {
            data: null,
            error: { code: "42501", message: "permission denied for function local_manual_reversal_authorized" },
          };
          row = { ...row, ...patch };
        }
        return { data: { ...row }, error: null };
      };
      const query = {
        select: () => query, eq: () => query, in: () => query, or: () => query, is: () => query,
        update(value: Record<string, unknown>) { patch = value; return query; },
        maybeSingle: () => Promise.resolve(response()),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(response()).then(resolve),
      };
      return query;
    },
    rpc(name: string) {
      if (name === "technical_manual_banese_expected_terms_service") {
        termChecks += 1;
        return Promise.resolve({ data: null, error: { message: "STOP_BEFORE_BANK" } });
      }
      assert.equal(name, "mark_technical_manual_cycle_banese_failure");
      return Promise.resolve({ data: {}, error: null });
    },
  };
  const userClient = {
    rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "authorize_technical_manual_receivable_issuance_secure");
      authorizations.push(String(args.p_request_id));
      return Promise.resolve({ data: { authorized: true }, error: null });
    },
  };
  return {
    issue: createReceivableIssuer({
      admin: admin as never, userClient: userClient as never, supabaseUrl: "https://example.invalid",
      getScope: () => ({ matriculaId: ENROLLMENT, turmaId: CLASS, alunoId: POLO,
        poloId: POLO, issuerPoloId: POLO, credentialId: POLO }),
    }),
    releaseClaim: () => { denyClaim = false; },
    row: () => row, updates: () => updates, termChecks: () => termChecks, authorizations,
  };
};

Deno.test("gerar encadeia claim; falha ACL preserva ciclo e retomar reutiliza operação", async () => {
  const test = fixture();
  const originalFetch = globalThis.fetch;
  let prepares = 0;
  let resumes = 0;
  const request: ManualCycleIssuanceRequest = {
    action: "generate", matriculaId: ENROLLMENT, cicloNumero: 1, requestId: RUN,
    primeiroVencimento: null, expectedRegraFingerprint: "a".repeat(64),
    expectedPoliticaFingerprint: "b".repeat(64), expectedCronogramaFingerprint: "c".repeat(64),
    revisao: {
      modoMatricula: "OMITIR", emitirMatricula: false,
      itens: context().ciclo.recebiveis.map((item) => ({
        chave: item.chave, valor: item.valor, vencimento: item.vencimento,
        descontoPontualidade: "19.90", jurosAtrasoPercentual: "2", multaAtrasoPercentual: "2",
      })),
    },
  };
  const dependencies = {
    preflight: () => Promise.resolve(),
    prepare: () => { prepares += 1; return Promise.resolve(context()); },
    resume: () => { resumes += 1; return Promise.resolve(context()); },
    reload: () => Promise.resolve(context()),
    issueReceivable: test.issue,
  };
  try {
    globalThis.fetch = (() => { throw new Error("Banco real proibido neste teste"); }) as typeof fetch;
    await assert.rejects(() => runManualCycleIssuance(request, dependencies), (error: unknown) => {
      assert.ok(error instanceof IssuanceHttpError);
      assert.match(error.message, /local_manual_reversal_authorized.*42501/);
      assert.equal(error.progress?.emitidosBanese, 0);
      assert.equal(error.progress?.pendentesEmissao, 12);
      return true;
    });
    assert.equal(test.row().gateway_creation_token, undefined);
    assert.equal(test.termChecks(), 0);
    test.releaseClaim();
    await assert.rejects(() => runManualCycleIssuance({
      ...request, action: "resume", requestId: null, revisao: undefined,
    }, dependencies), /STOP_BEFORE_BANK/);
    const expected = await deterministicReceivableRequestId(RUN, RECEIVABLE);
    assert.deepEqual(test.authorizations, [expected, expected]);
    assert.equal(test.row().gateway_creation_token, expected);
    assert.equal(prepares, 1);
    assert.equal(resumes, 1);
    assert.equal(test.updates(), 2);
    assert.equal(test.termChecks(), 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
