import assert from "node:assert/strict";
import {
  assertDependencyReceivableContract,
  buildDependencyCheckoutResponse,
  DependencyCheckoutContractError,
  hasCompleteBaneseBoleto,
  normalizeDependencyCheckoutRequest,
  sanitizeDependencyBaneseResult,
} from "./contract.ts";
import { hasRemoteTitleReference } from "../gateways/checkout/remote-title-guard.ts";

const IDS = {
  receivable: "00000000-0000-4000-8000-000000000001",
  attempt: "00000000-0000-4000-8000-000000000002",
  component: "00000000-0000-4000-8000-000000000003",
  enrollment: "00000000-0000-4000-8000-000000000004",
  payer: "00000000-0000-4000-8000-000000000005",
  class: "00000000-0000-4000-8000-000000000006",
  discipline: "00000000-0000-4000-8000-000000000007",
};

const context = () => ({
  receivable: {
    id: IDS.receivable,
    cliente_id: IDS.payer,
    turma_id: IDS.class,
    matricula_id: null as string | null,
    tipo_lancamento: "DEPENDENCIA",
    status: "PENDENTE",
    forma_pagamento: "BOLETO",
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_method: "BOLETO",
    gateway_installments: 1,
    parcela_numero: null as number | null,
    origem_cronograma_id: `dependencia:${IDS.attempt}`,
    descricao: "Disciplina: Anatomia Humana",
    regra_financeira_dependencia_snapshot: {
      origem: "DEPENDENCIA",
      tentativaId: IDS.attempt,
      disciplinaId: IDS.discipline,
      descricaoCobranca: "Disciplina: Anatomia Humana",
      descontoPontualidade: 19.9,
      jurosAtrasoPercentual: 1,
      multaAtrasoPercentual: 2,
      aplicarDesconto: true,
      aplicarMultaJuros: true,
      diasBaixaDevolucao: 60,
    } as Record<string, unknown>,
    valor: 250,
    data_vencimento: "2027-02-10",
  },
  link: {
    conta_receber_id: IDS.receivable,
    tentativa_id: IDS.attempt,
    principal: true,
  },
  attempt: {
    id: IDS.attempt,
    componente_id: IDS.component,
    turma_id: IDS.class,
    disciplina_id: IDS.discipline,
    status: "AGUARDANDO_PAGAMENTO",
    valor_cobrado_snapshot: 250,
  },
  component: {
    id: IDS.component,
    matricula_id: IDS.enrollment,
    disciplina_id: IDS.discipline,
  },
  enrollment: {
    id: IDS.enrollment,
    aluno_id: IDS.payer,
  },
  payer: {
    id: IDS.payer,
  },
});

Deno.test("normaliza somente receivableId UUID", () => {
  assert.deepEqual(
    normalizeDependencyCheckoutRequest({
      receivableId: IDS.receivable,
      provider: "asaas",
      paymentMethod: "PIX",
    }),
    { receivableId: IDS.receivable },
  );
  assert.throws(
    () => normalizeDependencyCheckoutRequest({ receivableId: "invalido" }),
    DependencyCheckoutContractError,
  );
});

Deno.test("aceita somente cobrança principal e consistente de dependência", () => {
  assert.doesNotThrow(() => assertDependencyReceivableContract(context()));

  const overdue = context();
  overdue.receivable.status = "VENCIDO";
  assert.doesNotThrow(() => assertDependencyReceivableContract(overdue));
});

Deno.test("rejeita matrícula direta, aluno, turma ou disciplina divergentes", () => {
  const directEnrollment = context();
  directEnrollment.receivable.matricula_id = IDS.enrollment;
  assert.throws(
    () => assertDependencyReceivableContract(directEnrollment),
    /não pode gerar parcelas pela matrícula/,
  );

  const anotherPayer = context();
  anotherPayer.receivable.cliente_id = "10000000-0000-4000-8000-000000000005";
  assert.throws(
    () => assertDependencyReceivableContract(anotherPayer),
    /pertence a outro aluno/,
  );

  const anotherClass = context();
  anotherClass.receivable.turma_id = "10000000-0000-4000-8000-000000000006";
  assert.throws(
    () => assertDependencyReceivableContract(anotherClass),
    /outra turma de reoferta/,
  );

  const anotherDiscipline = context();
  anotherDiscipline.attempt.disciplina_id =
    "10000000-0000-4000-8000-000000000007";
  assert.throws(
    () => assertDependencyReceivableContract(anotherDiscipline),
    /diverge do componente curricular/,
  );
});

Deno.test("rejeita cronograma, parcela ou snapshot que descaracterizem a cobrança avulsa", () => {
  const recurring = context();
  recurring.receivable.gateway_installments = 2;
  assert.throws(
    () => assertDependencyReceivableContract(recurring),
    /exatamente uma parcela/,
  );

  const scheduled = context();
  scheduled.receivable.parcela_numero = 1;
  assert.throws(
    () => assertDependencyReceivableContract(scheduled),
    /cronograma de parcelas/,
  );

  const inconsistentSnapshot = context();
  inconsistentSnapshot.receivable.regra_financeira_dependencia_snapshot = {
    ...inconsistentSnapshot.receivable.regra_financeira_dependencia_snapshot,
    descricaoCobranca: "Dependência - Anatomia Humana",
  };
  assert.throws(
    () => assertDependencyReceivableContract(inconsistentSnapshot),
    /snapshot.*inconsistente/,
  );

  const invalidTerms = context();
  invalidTerms.receivable.regra_financeira_dependencia_snapshot = {
    ...invalidTerms.receivable.regra_financeira_dependencia_snapshot,
    multaAtrasoPercentual: 100,
  };
  assert.throws(
    () => assertDependencyReceivableContract(invalidTerms),
    /encargos.*inválidos/,
  );
});

Deno.test("mantém título legado operável sem aplicar apresentação nova", () => {
  const legacy = context();
  delete (legacy.receivable as Record<string, unknown>)
    .regra_financeira_dependencia_snapshot;
  legacy.receivable.descricao =
    "Dependência - Anatomia Humana - ENF-T40-INT-MAT";

  assert.doesNotThrow(() => assertDependencyReceivableContract(legacy));
});

Deno.test("rejeita provedor, Pix, cobrança secundária e status não pagável", () => {
  const asaas = context();
  asaas.receivable.gateway_provider = "asaas";
  assert.throws(
    () => assertDependencyReceivableContract(asaas),
    /exclusivamente o Banese/,
  );

  const pix = context();
  pix.receivable.gateway_payment_method = "PIX";
  pix.receivable.forma_pagamento = "PIX";
  assert.throws(
    () => assertDependencyReceivableContract(pix),
    /somente boleto Banese/,
  );

  const secondary = context();
  secondary.link.principal = false;
  assert.throws(
    () => assertDependencyReceivableContract(secondary),
    /não é a cobrança principal/,
  );

  const paid = context();
  paid.receivable.status = "PAGO";
  assert.throws(
    () => assertDependencyReceivableContract(paid),
    /não está pendente para emissão/,
  );

  const releasedAttempt = context();
  releasedAttempt.attempt.status = "LIBERADA";
  assert.throws(
    () => assertDependencyReceivableContract(releasedAttempt),
    /não está aguardando pagamento/,
  );

  const changedAmount = context();
  changedAmount.receivable.valor = 251;
  assert.throws(
    () => assertDependencyReceivableContract(changedAmount),
    /diverge do snapshot/,
  );
});

Deno.test("reconhece boleto Banese somente com os três identificadores", () => {
  const complete = {
    gateway_boleto_linha_digitavel: "1".repeat(47),
    gateway_boleto_codigo_barras: "2".repeat(44),
    gateway_boleto_nosso_numero: "123456789",
  };
  assert.equal(hasCompleteBaneseBoleto(complete), true);
  assert.equal(
    hasCompleteBaneseBoleto({
      ...complete,
      gateway_boleto_linha_digitavel: "1".repeat(46),
    }),
    false,
  );
  assert.equal(
    hasCompleteBaneseBoleto({
      ...complete,
      gateway_boleto_nosso_numero: null,
    }),
    false,
  );
});

Deno.test("qualquer identidade parcial do boleto bloqueia um novo POST remoto", () => {
  for (
    const partialIdentity of [
      { gateway_boleto_nosso_numero: "123456789" },
      { gateway_boleto_linha_digitavel: "1".repeat(47) },
      { gateway_boleto_codigo_barras: "2".repeat(44) },
    ]
  ) {
    assert.equal(
      hasRemoteTitleReference({
        gateway_payment_id: null,
        gateway_payment_link_id: null,
        ...partialIdentity,
      }),
      true,
    );
  }
});

Deno.test("suprime Pix, QR e URLs públicas antes da persistência", () => {
  const result = sanitizeDependencyBaneseResult({
    remotePaymentId: "titulo-1",
    invoiceUrl: "https://bank.example/invoice",
    bankSlipUrl: "https://bank.example/document.pdf",
    pixPayload: "000201BR.GOV.BCB.PIX6304ABCD",
    pixEncodedImage: "base64-pix",
    rawPayload: {
      tx: "titulo-1",
      QrCode: "imagem",
      nested: {
        pixCopiaECola: "000201BR.GOV.BCB.PIX6304ABCD",
        encodedImage: "data:image/png;base64,segredo",
        imagemQr: "qr-em-base64",
        safe: "preservado",
      },
    },
  });

  assert.equal(result.invoiceUrl, null);
  assert.equal(result.bankSlipUrl, null);
  assert.equal(result.pixPayload, null);
  assert.equal(result.pixEncodedImage, null);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /bank\.example|BR\.GOV\.BCB\.PIX|base64-pix|qr-em-base64|data:image/,
  );
  assert.match(serialized, /SUPPRESSED_BY_DEPENDENCY_POLICY/);
  assert.match(serialized, /preservado/);
});

Deno.test("DTO público contém boleto, mas nunca Pix ou URL de PDF", () => {
  const response = buildDependencyCheckoutResponse({
    id: IDS.receivable,
    status: "PENDENTE",
    valor: 250,
    data_vencimento: "2027-02-10",
    gateway_status: "REGISTERED",
    gateway_submission_status: "API_REGISTERED",
    gateway_boleto_linha_digitavel: "1".repeat(47),
    gateway_boleto_codigo_barras: "2".repeat(44),
    gateway_boleto_nosso_numero: "123456789",
    gateway_pix_payload: "segredo-pix",
    gateway_bank_slip_url: "https://bank.example/document.pdf",
  }, false);

  assert.equal(response.boleto.digitableLine, "1".repeat(47));
  assert.equal(response.pix.available, false);
  const serialized = JSON.stringify(response);
  assert.doesNotMatch(serialized, /segredo-pix|bank\.example|document\.pdf/);
});
