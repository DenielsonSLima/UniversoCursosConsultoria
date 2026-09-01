import assert from "node:assert/strict";
import {
  buildConfiguredBaneseFinancialTerms,
  buildDependencyBaneseFinancialTerms,
  buildTechnicalSnapshotBaneseFinancialTerms,
  resolveBaneseReceivableFinancialTerms,
  strictTechnicalManualBaneseFinancialTerms,
} from "./banese-financial-terms.ts";

const receivable = {
  valor: 279.9,
  data_vencimento: "2026-08-10",
  tipo_lancamento: "PARCELA",
};

const turma = {
  desconto_pontualidade: 19.9,
  juros_atraso: 1,
  multa_atraso: 5.6,
  multa_atraso_percentual: 2,
  aplicar_desconto_mensalidade: true,
  aplicar_multa_juros_mensalidade: true,
};

const technicalSnapshot = (
  overrides: Record<string, unknown> = {},
) => ({
  versao: 2,
  origem: "TURMA",
  tipoLancamento: "MENSALIDADE",
  valorBase: 279.9,
  descontoPontualidade: 19.9,
  jurosAtrasoPercentual: 2,
  multaAtrasoPercentual: 2,
  multaAtrasoValor: 5.6,
  aplicarDesconto: true,
  aplicarMultaJuros: true,
  identidade: { turmaRevisao: 3 },
  cicloManual: {
    cicloNumero: 2,
    requestId: "11111111-1111-4111-8111-111111111111",
    regraFingerprint: "a".repeat(64),
    politicaFingerprint: "b".repeat(64),
    cronogramaFingerprint: "c".repeat(64),
  },
  ...overrides,
});

const adminThatMustNotQuery = {
  from(table: string) {
    throw new Error(`consulta viva inesperada: ${table}`);
  },
};

Deno.test("snapshot técnico v2 prevalece sobre regra viva e preserva 2% da mensalidade", async () => {
  const result = await resolveBaneseReceivableFinancialTerms(
    adminThatMustNotQuery,
    {
      ...receivable,
      turma_id: "22222222-2222-4222-8222-222222222222",
      matricula_id: "33333333-3333-4333-8333-333333333333",
      regra_financeira_tecnica_snapshot: technicalSnapshot(),
    },
  );

  assert.deepEqual(result, {
    nominalAmount: 279.9,
    dueDate: "2026-08-10",
    discount: { type: "fixed", value: 19.9 },
    interest: { type: "monthly-percentage", value: 2 },
    penalty: { type: "percentage", value: 2 },
  });
});

Deno.test("snapshot técnico v2 separa rematrícula sem desconto e com juros e multa", () => {
  const result = buildTechnicalSnapshotBaneseFinancialTerms({
    valor: 100,
    data_vencimento: "2026-09-15",
    tipo_lancamento: "REMATRICULA",
    regra_financeira_tecnica_snapshot: technicalSnapshot({
      tipoLancamento: "REMATRICULA",
      valorBase: 100,
      multaAtrasoValor: 2,
      descontoPontualidade: 19.9,
      aplicarDesconto: false,
    }),
  });

  assert.deepEqual(result, {
    nominalAmount: 100,
    dueDate: "2026-09-15",
    discount: null,
    interest: { type: "monthly-percentage", value: 2 },
    penalty: { type: "percentage", value: 2 },
  });
});

Deno.test("snapshot técnico v1 mantém multa monetária fixa sem inferir percentual", () => {
  const result = buildTechnicalSnapshotBaneseFinancialTerms({
    ...receivable,
    regra_financeira_tecnica_snapshot: technicalSnapshot({
      versao: 1,
      multaAtrasoPercentual: undefined,
      multaAtrasoValor: 5.6,
    }),
  });

  assert.deepEqual(result?.penalty, { type: "fixed", value: 5.6 });
});

Deno.test("snapshot técnico v2 falha fechado se o valor derivado da multa divergir", () => {
  assert.throws(
    () =>
      buildTechnicalSnapshotBaneseFinancialTerms({
        ...receivable,
        regra_financeira_tecnica_snapshot: technicalSnapshot({
          multaAtrasoValor: 5.59,
        }),
      }),
    /valor derivado da multa não confere.*Nenhum título Banese foi emitido/i,
  );
});

Deno.test("ciclo técnico manual com snapshot incompleto falha antes de consultar regra viva", async () => {
  await assert.rejects(
    () =>
      resolveBaneseReceivableFinancialTerms(adminThatMustNotQuery, {
        ...receivable,
        turma_id: "22222222-2222-4222-8222-222222222222",
        regra_financeira_tecnica_snapshot: {
          versao: 2,
          cicloManual: { cicloNumero: 2 },
        },
      }),
    /snapshot financeiro técnico inválido/i,
  );
});

Deno.test("snapshot técnico falha fechado em drift de valor, tipo ou versão", () => {
  const invalidSnapshots = [
    technicalSnapshot({ valorBase: 280 }),
    technicalSnapshot({ tipoLancamento: "REMATRICULA" }),
    technicalSnapshot({ versao: 3 }),
  ];
  for (const snapshot of invalidSnapshots) {
    assert.throws(
      () =>
        buildTechnicalSnapshotBaneseFinancialTerms({
          ...receivable,
          regra_financeira_tecnica_snapshot: snapshot,
        }),
      /snapshot financeiro técnico inválido/i,
    );
  }
});

Deno.test("título Banese confirmado reutiliza termos persistidos sem reprecificar", async () => {
  const result = await resolveBaneseReceivableFinancialTerms(
    adminThatMustNotQuery,
    {
      ...receivable,
      regra_financeira_tecnica_snapshot: technicalSnapshot({
        jurosAtrasoPercentual: 99,
      }),
      gateway_financial_terms_confirmed_at: "2026-08-01T12:00:00Z",
      gateway_financial_terms: {
        nominalAmount: 279.9,
        dueDate: "2026-08-10",
        discount: {
          type: "fixed",
          value: 19.9,
          validUntil: "2026-08-10",
        },
        interest: {
          type: "monthly-percentage",
          value: 2,
          startsOn: "2026-08-11",
        },
        penalty: {
          type: "percentage",
          value: 2,
          startsOn: "2026-08-11",
        },
      },
    },
  );

  assert.deepEqual(result, {
    nominalAmount: 279.9,
    dueDate: "2026-08-10",
    discount: {
      type: "fixed",
      value: 19.9,
      validUntil: "2026-08-10",
    },
    interest: {
      type: "monthly-percentage",
      value: 2,
      startsOn: "2026-08-11",
    },
    penalty: {
      type: "percentage",
      value: 2,
      startsOn: "2026-08-11",
    },
  });
});

Deno.test("ciclo manual bloqueia termos confirmados divergentes antes do POST", () => {
  assert.throws(
    () =>
      strictTechnicalManualBaneseFinancialTerms({
        ...receivable,
        regra_financeira_tecnica_snapshot: technicalSnapshot(),
        gateway_financial_terms_confirmed_at: "2026-08-01T12:00:00Z",
        gateway_financial_terms: {
          nominalAmount: 279.9,
          dueDate: "2026-08-10",
          discount: null,
          interest: null,
          penalty: null,
        },
      }),
    /divergem do snapshot técnico.*nenhum novo POST/i,
  );
});

Deno.test("título confirmado inconsistente exige conciliação em vez de regra viva", async () => {
  await assert.rejects(
    () =>
      resolveBaneseReceivableFinancialTerms(adminThatMustNotQuery, {
        ...receivable,
        gateway_financial_terms_confirmed_at: "2026-08-01T12:00:00Z",
        gateway_financial_terms: {
          nominalAmount: 100,
          dueDate: "2026-08-10",
        },
      }),
    /não pode ser reprecificado/i,
  );
});

Deno.test("resolve os termos mensais configurados para o Banese", () => {
  const result = buildConfiguredBaneseFinancialTerms({ receivable, turma });
  assert.deepEqual(result, {
    nominalAmount: 279.9,
    dueDate: "2026-08-10",
    discount: { type: "fixed", value: 19.9 },
    interest: { type: "monthly-percentage", value: 1 },
    penalty: { type: "percentage", value: 2 },
  });
});

Deno.test("override individual zero desativa cada termo", () => {
  const result = buildConfiguredBaneseFinancialTerms({
    receivable,
    turma,
    matricula: {
      desconto_pontualidade_individual: 0,
      juros_atraso_individual: 0,
      multa_atraso_individual: 0,
      multa_atraso_percentual_individual: 0,
    },
  });
  assert.equal(result.discount, null);
  assert.equal(result.interest, null);
  assert.equal(result.penalty, null);
});

Deno.test("mantem compatibilidade com multa fixa quando nao existe percentual", () => {
  const result = buildConfiguredBaneseFinancialTerms({
    receivable,
    turma: {
      ...turma,
      multa_atraso_percentual: null,
    },
  });
  assert.deepEqual(result.penalty, { type: "fixed", value: 5.6 });
});

Deno.test("respeita flags por tipo de lancamento", () => {
  const disabled = buildConfiguredBaneseFinancialTerms({
    receivable: { ...receivable, tipo_lancamento: "MATRICULA" },
    turma: {
      ...turma,
      aplicar_desconto_matricula: false,
      aplicar_multa_juros_matricula: false,
    },
  });
  assert.equal(disabled.discount, null);
  assert.equal(disabled.interest, null);
  assert.equal(disabled.penalty, null);
});

Deno.test("prioriza o snapshot do plano único, sem consultar regra viva da turma", () => {
  const result = buildConfiguredBaneseFinancialTerms({
    receivable: {
      ...receivable,
      regra_financeira_plano_unico_snapshot: {
        origem: "PLANO_UNICO",
        descontoPontualidade: 12.5,
        jurosAtrasoPercentual: 2.25,
        multaAtraso: 7.4,
      },
    },
    turma: {
      ...turma,
      desconto_pontualidade: 1,
      juros_atraso: 99,
      multa_atraso: 99,
      aplicar_desconto_mensalidade: false,
      aplicar_multa_juros_mensalidade: false,
    },
    matricula: {
      desconto_pontualidade_individual: 0,
      juros_atraso_individual: 0,
      multa_atraso_individual: 0,
    },
  });

  assert.deepEqual(result, {
    nominalAmount: 279.9,
    dueDate: "2026-08-10",
    discount: { type: "fixed", value: 12.5 },
    interest: { type: "monthly-percentage", value: 2.25 },
    penalty: { type: "fixed", value: 7.4 },
  });
});

Deno.test("ignora JSON não canônico para não reprificar um título de outra modalidade", () => {
  const result = buildConfiguredBaneseFinancialTerms({
    receivable: {
      ...receivable,
      regra_financeira_plano_unico_snapshot: {
        descontoPontualidade: 99,
        jurosAtrasoPercentual: 99,
        multaAtraso: 99,
      },
    },
    turma,
  });

  assert.deepEqual(result, {
    nominalAmount: 279.9,
    dueDate: "2026-08-10",
    discount: { type: "fixed", value: 19.9 },
    interest: { type: "monthly-percentage", value: 1 },
    penalty: { type: "percentage", value: 2 },
  });
});

Deno.test("dependência usa exclusivamente seu snapshot, nunca a turma ou matrícula", () => {
  const dependencyReceivable = {
    valor: 139.95,
    data_vencimento: "2026-08-10",
    tipo_lancamento: "DEPENDENCIA",
    regra_financeira_dependencia_snapshot: {
      origem: "DEPENDENCIA",
      descontoPontualidade: 19.9,
      jurosAtrasoPercentual: 1,
      multaAtrasoPercentual: 2,
      aplicarDesconto: true,
      aplicarMultaJuros: true,
    },
  };
  const result = buildConfiguredBaneseFinancialTerms({
    receivable: dependencyReceivable,
    turma: {
      desconto_pontualidade: 1,
      juros_atraso: 99,
      multa_atraso_percentual: 99,
      aplicar_desconto_mensalidade: false,
      aplicar_multa_juros_mensalidade: false,
    },
    matricula: {
      desconto_pontualidade_individual: 0,
      juros_atraso_individual: 0,
      multa_atraso_percentual_individual: 0,
    },
  });

  assert.deepEqual(result, {
    nominalAmount: 139.95,
    dueDate: "2026-08-10",
    discount: { type: "fixed", value: 19.9 },
    interest: { type: "monthly-percentage", value: 1 },
    penalty: { type: "percentage", value: 2 },
  });
});

Deno.test("dependência sem snapshot não herda a regra da turma", () => {
  assert.throws(
    () =>
      buildDependencyBaneseFinancialTerms({
        valor: 279.9,
        data_vencimento: "2026-08-10",
        tipo_lancamento: "DEPENDENCIA",
      }),
    /snapshot financeiro canônico/,
  );
});

Deno.test("título legado de dependência mantém o contrato financeiro anterior", () => {
  const result = buildConfiguredBaneseFinancialTerms({
    receivable: {
      valor: 279.9,
      data_vencimento: "2026-08-10",
      tipo_lancamento: "DEPENDENCIA",
    },
    turma,
  });

  assert.deepEqual(result, {
    nominalAmount: 279.9,
    dueDate: "2026-08-10",
    discount: { type: "fixed", value: 19.9 },
    interest: { type: "monthly-percentage", value: 1 },
    penalty: { type: "percentage", value: 2 },
  });
});
