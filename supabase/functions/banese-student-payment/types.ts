export type BaneseEnvironment = "sandbox" | "production";

export type BaneseStudentPaymentRow = {
  id: string;
  cliente_id: string | null;
  matricula_id: string | null;
  turma_id: string | null;
  descricao: string | null;
  categoria: string | null;
  tipo_lancamento: string | null;
  parcela_numero: number | string | null;
  valor: number | string | null;
  valor_pago: number | string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string | null;
  gateway_provider: string | null;
  gateway_environment: string | null;
  gateway_payment_method: string | null;
  gateway_status: string | null;
  gateway_pix_payload: string | null;
  gateway_pix_encoded_image: string | null;
  gateway_boleto_linha_digitavel: string | null;
  gateway_boleto_codigo_barras: string | null;
  gateway_boleto_nosso_numero: string | null;
  gateway_boleto_convenio: string | null;
  gateway_boleto_agencia: string | null;
  gateway_issuer_polo_id: string | null;
  gateway_financial_terms: Record<string, unknown> | null;
  gateway_financial_terms_confirmed_at: string | null;
  regra_financeira_dependencia_snapshot: Record<string, unknown> | null;
  turmas?:
    | {
      nome?: string | null;
      cursos?:
        | { nome?: string | null; modalidade?: string | null }
        | Array<{ nome?: string | null; modalidade?: string | null }>
        | null;
    }
    | Array<{
      nome?: string | null;
      cursos?:
        | { nome?: string | null; modalidade?: string | null }
        | Array<{ nome?: string | null; modalidade?: string | null }>
        | null;
    }>
    | null;
};

export type BaneseStudentPixDto = {
  state: "available" | "sandbox-unavailable" | "pending";
  copyAndPaste: string | null;
  qrCodeImage: string | null;
};

export type BaneseStudentFinancialTermsDto = {
  confirmed: boolean;
  discount: {
    type: "fixed" | "percentage";
    value: number;
    validUntil: string;
    amountUntilDue: number;
  } | null;
  penalty: {
    type: "fixed" | "percentage";
    value: number;
    startsOn: string;
  } | null;
  interest: {
    type: "daily-fixed" | "monthly-percentage";
    value: number;
    startsOn: string;
  } | null;
};

export type BaneseStudentChargeDto = {
  id: string;
  groupMarker: string;
  description: string;
  category: string | null;
  chargeType: string | null;
  installmentNumber: number | null;
  amount: number;
  amountPaid: number | null;
  dueDate: string | null;
  paymentDate: string | null;
  status: string;
  bankStatus: string;
  environment: BaneseEnvironment;
  courseName: string | null;
  courseModality: string | null;
  className: string | null;
  boleto: {
    digitableLine: string;
    barcode: string;
  };
  financialTerms: BaneseStudentFinancialTermsDto;
  pix: BaneseStudentPixDto;
};

export type BaneseStudentPaymentDto = {
  payment: BaneseStudentChargeDto;
  installments: BaneseStudentChargeDto[];
  group: {
    marker: string;
    kind: "single" | "carnet";
    installmentCount: number;
  };
  payer: {
    name: string;
    documentMasked: string;
  };
};
