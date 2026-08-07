import assert from "node:assert/strict";
import {
  buildEadCheckoutContext,
  resolvePaymentGatewayRoute,
} from "./ead-context.ts";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const ALUNO_ID = "22222222-2222-4222-8222-222222222222";
const TURMA_ID = "33333333-3333-4333-8333-333333333333";
const MATRICULA_ID = "44444444-4444-4444-8444-444444444444";

const queryResultFor = (
  table: string,
  turmasOverride?: any[],
  providerCode = "banese_card",
) => {
  if (table === "asaas_config") {
    return { environment: "sandbox" };
  }
  if (table === "payment_gateway_runtime_config") {
    return { enabled: true, active_environment: "sandbox" };
  }
  if (table === "cursos") {
    return {
      id: COURSE_ID,
      nome: "Curso de teste",
      modalidade: "EAD",
      valor: 120,
      publicar_site: true,
      status: "ativo",
      financeiro_config: {
        parcelasPadrao: 1,
        metodosRecebimento: { pix: true, boleto: true, cartao: true },
        cartao: { aceitar: true, maxParcelas: 12 },
      },
    };
  }
  if (table === "payment_gateway_routes") {
    return [{
      provider_code: providerCode,
      credential_id: "55555555-5555-4555-8555-555555555555",
      enabled: true,
      environment: "sandbox",
    }];
  }
  if (table === "usuarios_sistema") return null;
  if (table === "parceiros") {
    return { id: ALUNO_ID, tipo: "Aluno", email: "aluno@example.com" };
  }
  if (table === "turmas") {
    return turmasOverride || [{
      id: TURMA_ID,
      nome: "Turma EAD",
      polo_id: "66666666-6666-4666-8666-666666666666",
      vagas_totais: 30,
      qtd_vagas_minima: 0,
      bloquear_matriculas_apos_completar_vagas: true,
      data_inicio_inscricao: null,
      data_fim_inscricao: null,
      matriculas: [],
    }];
  }
  throw new Error(`Tabela inesperada no teste: ${table}`);
};

const createQuery = (
  table: string,
  turmasOverride?: any[],
  providerCode = "banese_card",
) => {
  const value = queryResultFor(table, turmasOverride, providerCode);
  const response = { data: value, error: null };
  const query: any = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    ilike: () => query,
    limit: () => query,
    order: () => query,
    maybeSingle: async () => response,
    then: (
      resolve: (result: typeof response) => unknown,
      reject: (error: unknown) => unknown,
    ) => Promise.resolve(response).then(resolve, reject),
  };
  return query;
};

const buildRuntime = (
  turmasOverride?: any[],
  providerCode = "banese_card",
  paymentMethod = "BOLETO",
  installments = 1,
) => ({
  admin: {
    from: (table: string) => createQuery(table, turmasOverride, providerCode),
    rpc: async (name: string) => {
      assert.equal(name, "payment_checkout_upsert_matricula");
      return { data: { id: MATRICULA_ID }, error: null };
    },
    auth: {
      getUser: async () => ({
        data: { user: { email: "aluno@example.com" } },
        error: null,
      }),
    },
  },
  req: new Request("https://example.com/checkout", {
    method: "POST",
    headers: { Authorization: "Bearer test-token" },
  }),
  body: {
    courseId: COURSE_ID,
    eadPaymentMethod: paymentMethod,
    eadInstallments: installments,
  },
});

Deno.test("checkout EAD usa a rota Banese de boleto explicitamente", async () => {
  const context = await buildEadCheckoutContext(buildRuntime() as any);

  assert.ok(context);
  assert.equal(context.route.providerCode, "banese_card");
  assert.equal(context.charge.method, "BOLETO");
  assert.equal(context.charge.installmentCount, 1);
  assert.equal(context.charge.value, 120);
  assert.equal(context.charge.feeValue, 0);
  assert.equal(context.charge.netValue, 120);
});

Deno.test("rota Asaas antiga falha fechada para nova cobranca", async () => {
  const runtime = buildRuntime(undefined, "asaas") as any;
  await assert.rejects(
    () => buildEadCheckoutContext(runtime),
    /Asaas foi desativado para novas cobrancas/i,
  );
});

Deno.test("usuario comum nao gera checkout em nome de outro aluno", async () => {
  const runtime = buildRuntime() as any;
  runtime.body.alunoId = "77777777-7777-4777-8777-777777777777";
  await assert.rejects(
    () => buildEadCheckoutContext(runtime),
    /apenas usuario interno ativo/i,
  );
});

Deno.test("rota Mercado Pago antiga e habilitada falha fechada no runtime", async () => {
  const runtime = buildRuntime(
    undefined,
    "mercado_pago",
    "CREDIT_CARD",
    3,
  ) as any;
  await assert.rejects(
    () =>
      resolvePaymentGatewayRoute(
        runtime.admin,
        "EAD",
        "CREDIT_CARD",
        "sandbox",
      ),
    /criacao ambigua de preferencias/i,
  );
});

Deno.test("quantidade minima de vagas nao bloqueia novas matriculas EAD", async () => {
  const context = await buildEadCheckoutContext(buildRuntime([{
    id: TURMA_ID,
    nome: "Turma EAD",
    polo_id: "66666666-6666-4666-8666-666666666666",
    vagas_totais: 30,
    qtd_vagas_minima: 1,
    bloquear_matriculas_apos_completar_vagas: true,
    data_inicio_inscricao: null,
    data_fim_inscricao: null,
    matriculas: [{ status: "ATIVO" }],
  }]) as any);

  assert.ok(context);
  assert.equal(context.turma.id, TURMA_ID);
});

Deno.test("quantidade total de vagas bloqueia novas matriculas EAD", async () => {
  await assert.rejects(
    () =>
      buildEadCheckoutContext(buildRuntime([{
        id: TURMA_ID,
        nome: "Turma EAD",
        polo_id: "66666666-6666-4666-8666-666666666666",
        vagas_totais: 1,
        qtd_vagas_minima: 0,
        bloquear_matriculas_apos_completar_vagas: true,
        data_inicio_inscricao: null,
        data_fim_inscricao: null,
        matriculas: [{ status: "ATIVO" }],
      }]) as any),
    Error,
    "Nao ha turma EAD aberta para este curso no momento.",
  );
});
