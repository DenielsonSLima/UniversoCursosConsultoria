import assert from "node:assert/strict";
import test from "node:test";
import {
  requireCicloFinanceiroTecnicoManualPreview,
} from "./matricula-tecnica-ciclo-manual-preview.parser";

const instruction = "SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 DIAS.";

const canonicalPreview = () => ({
  cicloNumero: 2,
  sourceVencimento: "INDIVIDUAL",
  dataOrigem: "2026-10-15",
  primeiroVencimento: "2026-10-15",
  quantidadeItens: 2,
  total: "379.90",
  itens: [
    {
      chave: "ciclo-1-rematricula",
      tipo: "REMATRICULA",
      numero: 0,
      descricao: "Rematrícula - Ciclo 2 - ENF T-42 INT",
      valor: "100.00",
      vencimento: "2026-10-15",
      detalhesBoleto: {
        valorNominal: "100.00",
        valorEmDia: "100.00",
        desconto: null,
        multa: {
          percentual: "2.000000",
          valor: "2.00",
          iniciaEm: "2026-10-16",
        },
        juros: {
          percentualMes: "2.000000",
          valorDia: "0.07",
          iniciaEm: "2026-10-16",
        },
        instrucaoBoleto: instruction,
        mensagensBoleto: [
          "Rematrícula - Ciclo 2 - ENF T-42 INT",
          "TURMA: ENF-T42-INT-MAT — ENF T-42 INT",
          instruction,
        ],
      },
    },
    {
      chave: "ciclo-2-parc-1",
      tipo: "PARCELA",
      numero: 1,
      descricao: "Mensalidade 1/1 - Ciclo 2 - ENF T-42 INT",
      valor: "279.90",
      vencimento: "2026-11-15",
      detalhesBoleto: {
        valorNominal: "279.90",
        valorEmDia: "260.00",
        desconto: { valor: "19.90", validoAte: "2026-11-15" },
        multa: {
          percentual: "2.000000",
          valor: "5.60",
          iniciaEm: "2026-11-16",
        },
        juros: {
          percentualMes: "2.000000",
          valorDia: "0.19",
          iniciaEm: "2026-11-16",
        },
        instrucaoBoleto: instruction,
        mensagensBoleto: [
          "Mensalidade 1/1 - Ciclo 2 - ENF T-42 INT",
          "TURMA: ENF-T42-INT-MAT — ENF T-42 INT",
          instruction,
        ],
      },
    },
  ],
  termos: {
    descontoPontualidade: "19.90",
    jurosAtrasoPercentual: "2.000000",
    multaAtrasoPercentual: "2.000000",
    instrucaoBoleto: instruction,
    aplicacao: {
      matricula: { desconto: false, multaJuros: false },
      mensalidade: { desconto: true, multaJuros: true },
      rematricula: { desconto: false, multaJuros: true },
    },
  },
  regraEfetivaFingerprint: "rule-fingerprint",
  politicaFingerprint: "policy-fingerprint",
  cronogramaFingerprint: "schedule-fingerprint",
});

const firstDetails = (preview: ReturnType<typeof canonicalPreview>) => (
  preview.itens[0].detalhesBoleto as Record<string, unknown>
);

test("aceita a prévia canônica completa retornada pelo backend", () => {
  const preview = canonicalPreview();
  assert.equal(requireCicloFinanceiroTecnicoManualPreview(preview), preview);
});

test("aceita descrição e instrução brutas equivalentes às linhas normalizadas do boleto", () => {
  const preview = canonicalPreview();
  preview.itens[0].descricao = "  Rematrícula   - Ciclo 2 - ENF\nT-42 INT  ";
  preview.termos.instrucaoBoleto =
    "  SR.(A)   CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 DIAS.\n";
  assert.equal(requireCicloFinanceiroTecnicoManualPreview(preview), preview);
});

test("aceita flags desligadas somente com desconto, multa e juros nulos", () => {
  const preview = canonicalPreview();
  preview.termos.aplicacao.mensalidade = { desconto: false, multaJuros: false };
  preview.termos.aplicacao.rematricula = { desconto: false, multaJuros: false };
  for (const item of preview.itens) {
    item.detalhesBoleto.valorEmDia = item.valor;
    item.detalhesBoleto.desconto = null;
    item.detalhesBoleto.multa = null;
    item.detalhesBoleto.juros = null;
  }
  assert.equal(requireCicloFinanceiroTecnicoManualPreview(preview), preview);
});

test("rejeita detalhes do boleto ausentes", () => {
  const preview = canonicalPreview();
  delete (preview.itens[0] as unknown as Record<string, unknown>)
    .detalhesBoleto;
  assert.throws(
    () => requireCicloFinanceiroTecnicoManualPreview(preview),
    /prévia de ciclo incompleta/i,
  );
});

test("rejeita valor nominal diferente do valor canônico do item", () => {
  const preview = canonicalPreview();
  firstDetails(preview).valorNominal = "101.00";
  assert.throws(
    () => requireCicloFinanceiroTecnicoManualPreview(preview),
    /prévia de ciclo incompleta/i,
  );
});

test("rejeita mensagens do boleto ausentes", () => {
  const preview = canonicalPreview();
  delete firstDetails(preview).mensagensBoleto;
  assert.throws(
    () => requireCicloFinanceiroTecnicoManualPreview(preview),
    /prévia de ciclo incompleta/i,
  );
});

test("rejeita mensagens do boleto malformadas", async (context) => {
  const invalidMessages: unknown[] = [
    ["linha 1", "linha 2"],
    ["linha 1", "", instruction],
    ["linha 1", 42, instruction],
    ["linha 1", "linha 2", instruction, "linha 4"],
  ];
  for (const [index, messages] of invalidMessages.entries()) {
    await context.test(`formato inválido ${index + 1}`, () => {
      const preview = canonicalPreview();
      firstDetails(preview).mensagensBoleto = messages;
      assert.throws(
        () => requireCicloFinanceiroTecnicoManualPreview(preview),
        /prévia de ciclo incompleta/i,
      );
    });
  }
});

test("rejeita primeira ou terceira mensagem inconsistente", async (context) => {
  for (const position of [0, 2]) {
    await context.test(`posição ${position}`, () => {
      const preview = canonicalPreview();
      const messages = [
        ...preview.itens[0].detalhesBoleto.mensagensBoleto,
      ];
      messages[position] = "Mensagem divergente";
      firstDetails(preview).mensagensBoleto = messages;
      assert.throws(
        () => requireCicloFinanceiroTecnicoManualPreview(preview),
        /prévia de ciclo incompleta/i,
      );
    });
  }
});

test("rejeita datas financeiras diferentes do vencimento e do dia seguinte", async (context) => {
  const cases = [
    ["desconto", "validoAte", "2026-11-14"],
    ["multa", "iniciaEm", "2026-11-17"],
    ["juros", "iniciaEm", "2026-11-14"],
  ] as const;
  for (const [group, field, date] of cases) {
    await context.test(`${group}.${field}`, () => {
      const preview = canonicalPreview();
      const details = preview.itens[1].detalhesBoleto as unknown as Record<
        string,
        Record<string, unknown>
      >;
      details[group][field] = date;
      assert.throws(
        () => requireCicloFinanceiroTecnicoManualPreview(preview),
        /prévia de ciclo incompleta/i,
      );
    });
  }
});
