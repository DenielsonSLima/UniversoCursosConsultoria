import assert from "node:assert/strict";
import { buildBaneseCarnetPdf } from "../banese/internal/carne/carne-pdf.ts";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../banese/internal/testing/document-fixture.ts";
import { buildBaneseCarnetDocumentInputs } from "./document-input.ts";
import {
  type BaneseCarnetReceivableRow,
  isAllowedBaneseLogoUrl,
  isRegisteredBaneseDocumentRow,
  readBaneseCarnetScope,
  selectBaneseCarnetDocumentRows,
  selectBaneseDocumentGroupRows,
  takeRegisteredBaneseCarnetCandidateRows,
} from "./document-policy.ts";

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const ENROLLMENT_ID = "33333333-3333-4333-8333-333333333333";
const POLO_ID = "44444444-4444-4444-8444-444444444444";
const ISSUER_ID = "55555555-5555-4555-8555-555555555555";

const rowAt = (
  index: number,
  overrides: Partial<BaneseCarnetReceivableRow> = {},
): BaneseCarnetReceivableRow => {
  const bank = baneseDocumentFixtureAt(index);
  return {
    id: bank.receivableId,
    cliente_id: CLIENT_ID,
    matricula_id: ENROLLMENT_ID,
    turma_id: null,
    polo_id: POLO_ID,
    descricao: `Parcela ${index + 1}`,
    tipo_lancamento: "PARCELA",
    parcela_numero: index + 1,
    valor: bank.amount,
    data_vencimento: bank.dueDate,
    status: "PENDENTE",
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_status: "2",
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
    gateway_boleto_issued_at: "2026-07-16T12:00:00Z",
    gateway_boleto_linha_digitavel: bank.digitableLine,
    gateway_boleto_codigo_barras: bank.barcode,
    gateway_boleto_nosso_numero: bank.ourNumber,
    gateway_boleto_convenio: "15528",
    gateway_boleto_agencia: "033",
    gateway_issuer_polo_id: ISSUER_ID,
    gateway_financial_terms: bank.financialTerms as Record<string, unknown>,
    gateway_financial_terms_confirmed_at: "2026-07-16T12:05:00Z",
    ...overrides,
  };
};

Deno.test("Radiologia importada mantém carnê íntegro em produção sem Pix ou URL externa", async () => {
  const rows = selectBaneseCarnetDocumentRows(
    rowAt(0, { gateway_environment: "production" }),
    [0, 1, 2].map((index) =>
      rowAt(index, {
        gateway_environment: "production",
        gateway_pix_payload: null,
        gateway_pix_encoded_image: null,
        descricao: `Mensalidade histórica ${index + 1} - Técnico em Radiologia`,
      })
    ),
  );
  const payer = {
    nome: BANESE_DOCUMENT_FIXTURE.payer.name,
    cpf_cnpj: BANESE_DOCUMENT_FIXTURE.payer.document,
    endereco: BANESE_DOCUMENT_FIXTURE.payer.address.street,
    bairro: BANESE_DOCUMENT_FIXTURE.payer.address.district,
    cidade: BANESE_DOCUMENT_FIXTURE.payer.address.city,
    uf: BANESE_DOCUMENT_FIXTURE.payer.address.state,
    cep: BANESE_DOCUMENT_FIXTURE.payer.address.postalCode,
  };
  const issuer = {
    nome: BANESE_DOCUMENT_FIXTURE.beneficiary.name,
    cnpj: BANESE_DOCUMENT_FIXTURE.beneficiary.document,
    endereco: BANESE_DOCUMENT_FIXTURE.beneficiary.address.street,
    bairro: BANESE_DOCUMENT_FIXTURE.beneficiary.address.district,
    cidade: BANESE_DOCUMENT_FIXTURE.beneficiary.address.city,
    estado: BANESE_DOCUMENT_FIXTURE.beneficiary.address.state,
    cep: BANESE_DOCUMENT_FIXTURE.beneficiary.address.postalCode,
  };
  const inputs = buildBaneseCarnetDocumentInputs(rows, payer, issuer, {
    baneseBeneficiarioNome: BANESE_DOCUMENT_FIXTURE.beneficiary.name,
    baneseBeneficiarioInscricao: BANESE_DOCUMENT_FIXTURE.beneficiary.document,
    baneseConta: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
    baneseCodigoBeneficiario:
      BANESE_DOCUMENT_FIXTURE.beneficiary.beneficiaryCode,
    baneseCarteira: BANESE_DOCUMENT_FIXTURE.beneficiary.wallet,
  });

  assert.equal(inputs.length, 3);
  for (const [index, input] of inputs.entries()) {
    assert.equal(input.pix, null);
    assert.equal(input.ourNumber, rows[index].gateway_boleto_nosso_numero);
    assert.equal(input.digitableLine, rows[index].gateway_boleto_linha_digitavel);
    assert.equal(input.barcode, rows[index].gateway_boleto_codigo_barras);
    assert.equal(input.financialTerms?.nominalAmount, Number(rows[index].valor));
    assert.equal(input.financialTerms?.dueDate, rows[index].data_vencimento);
  }

  const pdf = await buildBaneseCarnetPdf(inputs);
  assert.equal(String.fromCharCode(...pdf.slice(0, 4)), "%PDF");
});

Deno.test("deriva escopo bancario exclusivamente do titulo selecionado", () => {
  assert.deepEqual(readBaneseCarnetScope(rowAt(0)), {
    clientId: CLIENT_ID,
    enrollmentId: ENROLLMENT_ID,
    poloId: POLO_ID,
    environment: "sandbox",
    issuerId: ISSUER_ID,
    agreement: "15528",
    agency: "033",
  });
});

Deno.test("seleciona ao menos tres parcelas registradas e ordena o carne", () => {
  const selected = rowAt(0);
  const rows = selectBaneseCarnetDocumentRows(selected, [
    rowAt(2),
    selected,
    rowAt(1),
  ]);
  assert.deepEqual(rows.map((row) => row.parcela_numero), [1, 2, 3]);
});

Deno.test("catálogo documental aceita um boleto sem relaxar validação bancária", () => {
  const selected = rowAt(0);
  assert.deepEqual(
    selectBaneseDocumentGroupRows(selected, [selected]).map((row) => row.id),
    [selected.id],
  );
  assert.equal(isRegisteredBaneseDocumentRow(selected), true);
  assert.equal(
    isRegisteredBaneseDocumentRow(
      rowAt(1, { gateway_financial_terms_confirmed_at: null }),
    ),
    false,
  );
  assert.throws(
    () =>
      selectBaneseDocumentGroupRows(
        selected,
        [selected, rowAt(1, { gateway_boleto_codigo_barras: "invalido" })],
      ),
    /código de barras|codigo de barras|boleto/i,
  );
});

Deno.test("exclui encerrados e nunca mistura Asaas ou outro emissor", () => {
  const selected = rowAt(0);
  const rows = selectBaneseCarnetDocumentRows(selected, [
    selected,
    rowAt(1),
    rowAt(2),
    rowAt(3, { status: "CANCELADO" }),
    rowAt(4, { gateway_provider: "asaas" }),
    rowAt(5, {
      gateway_issuer_polo_id: "66666666-6666-4666-8666-666666666666",
    }),
    rowAt(6, { status: "PAGO", gateway_status: "PAID" }),
  ]);
  assert.deepEqual(rows.map((row) => row.id), [
    rowAt(0).id,
    rowAt(1).id,
    rowAt(2).id,
  ]);
});

Deno.test("títulos históricos encerrados não consomem o limite dos títulos atuais", () => {
  const historical = Array.from({ length: 40 }, (_, index) =>
    rowAt(index, {
      status: index % 2 === 0 ? "CANCELADO" : "PAGO",
      gateway_status: index % 2 === 0 ? "CANCELED" : "PAID",
    }));
  const current = [rowAt(40), rowAt(41), rowAt(42), rowAt(43)];
  const candidates = takeRegisteredBaneseCarnetCandidateRows([
    ...historical,
    ...current,
  ]);

  assert.deepEqual(
    candidates.map((row) => row.id),
    current.map((row) => row.id),
  );
  assert.deepEqual(
    selectBaneseCarnetDocumentRows(current[0], candidates).map((row) => row.id),
    current.map((row) => row.id),
  );
});

Deno.test("matricula e cobranca individual nunca originam carne", () => {
  assert.throws(
    () =>
      selectBaneseCarnetDocumentRows(
        rowAt(0, { tipo_lancamento: "MATRICULA" }),
        [rowAt(0), rowAt(1), rowAt(2)],
      ),
    /Somente parcelas mensais/i,
  );
  assert.throws(
    () => selectBaneseCarnetDocumentRows(rowAt(0), [rowAt(0), rowAt(1)]),
    /ao menos 3 parcelas/i,
  );
});

Deno.test("falha fechada se qualquer parcela nao tiver snapshot confirmado", () => {
  assert.throws(
    () =>
      selectBaneseCarnetDocumentRows(rowAt(0), [
        rowAt(0),
        rowAt(1, { gateway_financial_terms_confirmed_at: null }),
        rowAt(2),
      ]),
    /condições financeiras/i,
  );
  assert.throws(
    () =>
      selectBaneseCarnetDocumentRows(rowAt(0), [
        rowAt(0),
        rowAt(1, { gateway_financial_terms: null }),
        rowAt(2),
      ]),
    /snapshot financeiro/i,
  );
});

Deno.test("exige desconto ate o vencimento, multa e juros em cada parcela", () => {
  const cases = [
    { discount: null },
    { penalty: null },
    { interest: null },
  ];
  for (const financialTerms of cases) {
    assert.throws(
      () =>
        selectBaneseCarnetDocumentRows(rowAt(0), [
          rowAt(0),
          rowAt(1, {
            gateway_financial_terms: {
              ...rowAt(1).gateway_financial_terms,
              ...financialTerms,
            },
          }),
          rowAt(2),
        ]),
      /desconto até o vencimento, multa e juros/i,
    );
  }
});

Deno.test("parcela paga nao pode ser reaberta como carne pagavel", () => {
  assert.throws(
    () =>
      selectBaneseCarnetDocumentRows(
        rowAt(0, { status: "PAGO", gateway_status: "PAID" }),
        [rowAt(0), rowAt(1), rowAt(2)],
      ),
    /encerrada ou indisponível/i,
  );
});

Deno.test("rejeita duplicidade de titulo bancario no mesmo carne", () => {
  const selected = rowAt(0);
  assert.throws(
    () =>
      selectBaneseCarnetDocumentRows(selected, [
        selected,
        rowAt(1),
        rowAt(2, {
          gateway_boleto_nosso_numero: selected.gateway_boleto_nosso_numero,
          gateway_boleto_linha_digitavel:
            selected.gateway_boleto_linha_digitavel,
          gateway_boleto_codigo_barras: selected.gateway_boleto_codigo_barras,
        }),
      ]),
    /títulos bancários exclusivos/i,
  );
});

Deno.test("rejeita divergencia entre valor local e boleto registrado", () => {
  assert.throws(
    () =>
      selectBaneseCarnetDocumentRows(rowAt(0), [
        rowAt(0),
        rowAt(1, { valor: 123.45 }),
        rowAt(2),
      ]),
    /valor de uma parcela diverge/i,
  );
});

Deno.test("rejeita data impossivel mesmo quando Date.parse a normaliza", () => {
  assert.throws(
    () =>
      selectBaneseCarnetDocumentRows(rowAt(0), [
        rowAt(0),
        rowAt(1, {
          data_vencimento: "2026-02-31",
          gateway_boleto_issued_at: "2026-02-31T12:00:00Z",
        }),
        rowAt(2),
      ]),
    /data de vencimento/i,
  );
});

Deno.test("logos remotas ficam limitadas ao storage e diretorio publico seguro", () => {
  const host = "projeto.supabase.co";
  assert.equal(
    isAllowedBaneseLogoUrl(
      `https://${host}/storage/v1/object/public/logos/universo.png`,
      host,
    ),
    true,
  );
  assert.equal(
    isAllowedBaneseLogoUrl(
      "https://universocc.com.br/logos/payment-gateways/banese.png",
      host,
    ),
    true,
  );
  assert.equal(
    isAllowedBaneseLogoUrl("https://universocc.com.br/LogoUniverso.png", host),
    false,
  );
  assert.equal(
    isAllowedBaneseLogoUrl(`https://${host}/functions/v1/segredo`, host),
    false,
  );
  assert.equal(
    isAllowedBaneseLogoUrl(
      `https://${host}:444/storage/v1/object/public/logo.png`,
      host,
    ),
    false,
  );
  assert.equal(
    isAllowedBaneseLogoUrl(
      "https://universocc.com.br.evil.test/logos/banese.png",
      host,
    ),
    false,
  );
});
