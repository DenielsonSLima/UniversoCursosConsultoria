import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../banese/internal/testing/document-fixture.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import type {
  OtherCreditCarnetRow,
  OtherCreditPlanDocument,
} from "./document-policy.ts";

export const PLAN_ID = "99999999-9999-4999-8999-999999999999";
export const POLO_ID = "44444444-4444-4444-8444-444444444444";
export const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
export const ISSUER_ID = "55555555-5555-4555-8555-555555555555";

export const otherCreditDocumentRowAt = (
  index: number,
  overrides: Partial<OtherCreditCarnetRow> = {},
): OtherCreditCarnetRow => {
  const bank = baneseDocumentFixtureAt(
    index,
    `2026-${String(8 + Math.floor(index / 28)).padStart(2, "0")}-${
      String(1 + index % 28).padStart(2, "0")
    }`,
    300,
  );
  const financialTerms = normalizeBaneseFinancialTerms({
    nominalAmount: bank.amount,
    dueDate: bank.dueDate,
    discount: { type: "fixed", value: 20 },
    interest: { type: "monthly-percentage", value: 2 },
    penalty: { type: "percentage", value: 2 },
  });
  return {
    id: bank.receivableId,
    polo_id: POLO_ID,
    cliente_id: CLIENT_ID,
    matricula_id: null,
    turma_id: null,
    origem_cronograma_id: null,
    categoria: "OUTROS_CREDITOS",
    tipo_lancamento: "OUTRO_CREDITO",
    origem_pagamento: "BANESE",
    descricao: `Aulas de prática - Parcela ${index + 1}`,
    parcela_numero: index + 1,
    valor: bank.amount,
    data_vencimento: bank.dueDate,
    status: "PENDENTE",
    outros_creditos_plano_id: PLAN_ID,
    outros_creditos_papel: "PARCELA",
    regra_financeira_outros_creditos_snapshot: {
      origem: "OUTROS_CREDITOS_PLANO",
      versao: 1,
      planoId: PLAN_ID,
      papel: "PARCELA",
      numero: index + 1,
      quantidadeParcelas: 3,
      financialTerms,
    },
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_status: "REGISTERED",
    gateway_submission_status: "API_REGISTERED",
    gateway_payment_id: bank.ourNumber,
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
    gateway_boleto_issued_at: "2026-07-16T12:00:00Z",
    gateway_boleto_linha_digitavel: bank.digitableLine,
    gateway_boleto_codigo_barras: bank.barcode,
    gateway_boleto_nosso_numero: bank.ourNumber,
    gateway_boleto_convenio: "15528",
    gateway_boleto_agencia: "033",
    gateway_issuer_polo_id: ISSUER_ID,
    gateway_financial_terms: financialTerms,
    gateway_financial_terms_confirmed_at: "2026-07-16T12:05:00Z",
    ...overrides,
  };
};

export const otherCreditDocumentFeeAt = (
  index: number,
  role: "MATRICULA" | "REMATRICULA",
) => {
  const bank = baneseDocumentFixtureAt(index, "2026-07-30", 100);
  const row = otherCreditDocumentRowAt(index);
  const financialTerms = normalizeBaneseFinancialTerms({
    nominalAmount: 100,
    dueDate: bank.dueDate,
    discount: null,
    interest: { type: "monthly-percentage", value: 2 },
    penalty: { type: "percentage", value: 2 },
  });
  return {
    ...row,
    outros_creditos_papel: role,
    descricao: role === "MATRICULA"
      ? "Taxa opcional de matrícula"
      : "Taxa opcional de rematrícula",
    parcela_numero: 0,
    valor: 100,
    data_vencimento: bank.dueDate,
    gateway_boleto_linha_digitavel: bank.digitableLine,
    gateway_boleto_codigo_barras: bank.barcode,
    gateway_financial_terms: financialTerms,
    regra_financeira_outros_creditos_snapshot: {
      ...row.regra_financeira_outros_creditos_snapshot,
      papel: role,
      numero: 0,
      financialTerms,
    },
  };
};

export const planForOtherCreditRows = (
  rows: OtherCreditCarnetRow[],
): OtherCreditPlanDocument => {
  const quantity = Math.max(
    ...rows.filter((row) => row.outros_creditos_papel === "PARCELA").map((
      row,
    ) => row.regra_financeira_outros_creditos_snapshot.numero),
  );
  rows.forEach((row) => {
    row.regra_financeira_outros_creditos_snapshot.quantidadeParcelas = quantity;
  });
  return {
    id: PLAN_ID,
    polo_id: POLO_ID,
    cliente_id: CLIENT_ID,
    preview: {
      versao: 1,
      quantidadeParcelas:
        rows[0].regra_financeira_outros_creditos_snapshot.quantidadeParcelas,
      parcelas: rows.map((row) => ({
        papel: row.outros_creditos_papel,
        numero: row.regra_financeira_outros_creditos_snapshot.numero,
        valor: Number(row.valor),
        dataVencimento: row.data_vencimento!,
        financialTerms: row.regra_financeira_outros_creditos_snapshot
          .financialTerms as typeof BANESE_DOCUMENT_FIXTURE.financialTerms & {},
      })),
    },
  };
};

export const OTHER_CREDIT_DOCUMENT_PAYER = {
  id: CLIENT_ID,
  nome: "ALUNA DE TESTE - AULAS DE PRÁTICA",
  cpf_cnpj: BANESE_DOCUMENT_FIXTURE.payer.document,
  endereco: "RUA DE TESTE",
  numero: "100",
  bairro: "CENTRO",
  cidade: "ARACAJU",
  uf: "SE",
  cep: "49000000",
};
export const OTHER_CREDIT_DOCUMENT_ISSUER = {
  id: ISSUER_ID,
  nome: BANESE_DOCUMENT_FIXTURE.beneficiary.name,
  cnpj: BANESE_DOCUMENT_FIXTURE.beneficiary.document,
  endereco: "RUA DE HOMOLOGAÇÃO",
  numero: "1",
  bairro: "CENTRO",
  cidade: "JAPOATA",
  estado: "SE",
  cep: "49950000",
};
export const OTHER_CREDIT_DOCUMENT_METADATA = {
  baneseBeneficiarioNome: OTHER_CREDIT_DOCUMENT_ISSUER.nome,
  baneseBeneficiarioInscricao: OTHER_CREDIT_DOCUMENT_ISSUER.cnpj,
  baneseConta: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
  baneseCodigoBeneficiario: BANESE_DOCUMENT_FIXTURE.beneficiary.beneficiaryCode,
};
