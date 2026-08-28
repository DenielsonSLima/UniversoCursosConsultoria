import assert from "node:assert/strict";
import {
  buildBaneseBoletoPayload,
  calculateBaneseNossoNumero,
  createBaneseBoletoCharge,
  validateBanesePixChargeInput,
} from "./adapter.ts";
import { validInput } from "./adapter-test-fixtures.ts";

Deno.test("calcula DV do Nosso Numero Banese com agencia", () => {
  assert.equal(calculateBaneseNossoNumero("033", "00000001"), "000000015");
});

Deno.test("payload boleto preserva campos financeiros validados", () => {
  const payload = buildBaneseBoletoPayload({
    ...validInput,
    receivable: {
      ...validInput.receivable,
      baneseBoletoPayload: {
        NossoNumero: "999999999",
        ValorNominal: 0.01,
        Pagador: { NomeOuRazaoSocial: "INJETADO" },
      },
    },
  });

  assert.equal(payload.NossoNumero, "000000015");
  assert.equal(payload.ValorNominal, 15.9);
  assert.equal(payload.Pagador.NomeOuRazaoSocial, "Aluno Teste");
  assert.equal(payload.IndicadorPagamentoParcial, false);
  assert.equal("QuantidadePagamentoParcial" in payload, false);
  assert.equal(payload.FlAceite, true);
  assert.deepEqual(payload.Desconto, [{
    Data: "2026-08-15",
    Valor: 1.9,
    TipoDesconto: 1,
  }]);
  assert.deepEqual(payload.Juros, {
    Data: "2026-08-16",
    Valor: 5,
    TipoJuroMora: 2,
  });
  assert.deepEqual(payload.Multa, {
    Data: "2026-08-16",
    Valor: 1,
    TipoMulta: 1,
  });
});

Deno.test("boleto de disciplina fixa baixa bancária em 60 dias", () => {
  const payload = buildBaneseBoletoPayload({
    ...validInput,
    receivable: {
      ...validInput.receivable,
      tipo_lancamento: "DEPENDENCIA",
      regra_financeira_dependencia_snapshot: {
        origem: "DEPENDENCIA",
        diasBaixaDevolucao: 60,
      },
      quantidadeDiasBaixaDevolucao: 5,
    },
  });

  assert.equal(payload.QuantidadeDiasBaixaDevolucao, 60);
});

Deno.test("boleto legado de dependência preserva o prazo configurado", () => {
  const payload = buildBaneseBoletoPayload({
    ...validInput,
    receivable: {
      ...validInput.receivable,
      tipo_lancamento: "DEPENDENCIA",
      quantidadeDiasBaixaDevolucao: 5,
    },
  });

  assert.equal(payload.QuantidadeDiasBaixaDevolucao, 5);
});

Deno.test("payload boleto inclui numero e complemento no endereco", () => {
  const payload = buildBaneseBoletoPayload({
    ...validInput,
    payer: {
      ...validInput.payer,
      address: "Rua de Teste",
      number: "100",
      complement: "Sala 2",
    },
  });
  const address = payload.Pagador.Endereco as { DescricaoEndereco: string };
  assert.equal(address.DescricaoEndereco, "Rua de Teste, 100 - Sala 2");
});

Deno.test("bloqueia Pix Banese no sandbox indisponivel", async () => {
  await assert.rejects(
    () =>
      validateBanesePixChargeInput({
        ...validInput,
        paymentMethod: "PIX",
      }),
    /nao esta em funcionamento no sandbox/i,
  );
});

Deno.test("nao bloqueia criacao Banese por regra de ambiente em producao", async () => {
  await assert.rejects(
    () =>
      createBaneseBoletoCharge({ ...validInput, environment: "production" }),
    (error: any) => {
      const message = String(error?.message || error);
      return /convenio/i.test(message) &&
        !/bloqueadas em producao/i.test(message);
    },
  );
});
