export type BaneseEnvironment = 'sandbox' | 'production';

export type BanesePartner = {
  nome?: string | null;
  cpf_cnpj?: string | null;
  documentMasked?: string | null;
};

export type BaneseFinancialTerms = {
  confirmed: boolean;
  discount: {
    type: 'fixed' | 'percentage';
    value: number;
    validUntil: string;
    amountUntilDue: number;
  } | null;
  penalty: {
    type: 'fixed' | 'percentage';
    value: number;
    startsOn: string;
  } | null;
  interest: {
    type: 'daily-fixed' | 'monthly-percentage';
    value: number;
    startsOn: string;
  } | null;
};

export type BanesePaymentRecord = {
  id: string;
  cliente_id?: string | null;
  matricula_id?: string | null;
  turma_id?: string | null;
  descricao?: string | null;
  categoria?: string | null;
  tipo_lancamento?: string | null;
  parcela_numero?: number | string | null;
  valor?: number | string | null;
  valor_pago?: number | string | null;
  data_vencimento?: string | null;
  data_pagamento?: string | null;
  status?: string | null;
  gateway_provider?: string | null;
  gateway_environment?: string | null;
  gateway_payment_method?: string | null;
  gateway_payment_id?: string | null;
  gateway_status?: string | null;
  gateway_bank_slip_url?: string | null;
  gateway_invoice_url?: string | null;
  gateway_pix_payload?: string | null;
  gateway_pix_encoded_image?: string | null;
  gateway_boleto_linha_digitavel?: string | null;
  gateway_boleto_codigo_barras?: string | null;
  gateway_boleto_nosso_numero?: string | null;
  gateway_boleto_convenio?: string | null;
  gateway_boleto_agencia?: string | null;
  gateway_issuer_polo_id?: string | null;
  gateway_financial_terms?: BaneseFinancialTerms | null;
  gateway_group_marker?: string | null;
  gateway_group_kind?: 'single' | 'carnet' | null;
  modalidade?: string | null;
  cursoNome?: string | null;
  turmaNome?: string | null;
  chargeKind?: string | null;
  isOverdue?: boolean;
  parceiros?: BanesePartner | BanesePartner[] | null;
};

export type BanesePixPresentation = {
  state: 'available' | 'sandbox-unavailable' | 'pending';
  payload: string | null;
  imageSource: string | null;
  title: string;
  message: string;
};

export type BaneseStatusPresentation = {
  label: string;
  detail: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
};
