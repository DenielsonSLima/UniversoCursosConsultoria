import { supabase } from '../../../../../lib/supabase';
import type { BanesePaymentRecord } from '../../../../aluno/financeiro/banese/banese-payment.types';

const BANESE_PAYMENT_SELECT = `
  id,
  cliente_id,
  matricula_id,
  turma_id,
  descricao,
  categoria,
  tipo_lancamento,
  parcela_numero,
  valor,
  valor_pago,
  data_vencimento,
  data_pagamento,
  status,
  gateway_provider,
  gateway_environment,
  gateway_payment_method,
  gateway_payment_id,
  gateway_status,
  gateway_bank_slip_url,
  gateway_invoice_url,
  gateway_pix_payload,
  gateway_pix_encoded_image,
  gateway_boleto_linha_digitavel,
  gateway_boleto_codigo_barras,
  gateway_boleto_nosso_numero,
  gateway_boleto_convenio,
  gateway_boleto_agencia,
  gateway_issuer_polo_id,
  parceiros(nome, cpf_cnpj),
  turmas(nome, cursos(nome, modalidade))
`;

const chargeKindLabel = (row: any) => {
  const type = String(row.tipo_lancamento || '').toUpperCase();
  if (type === 'MATRICULA') return 'Cobrança de matrícula';
  if (type === 'REMATRICULA') return 'Cobrança de rematrícula';
  if (type === 'PARCELA') return 'Parcela do curso';
  return 'Cobrança Banese';
};

const mapBanesePaymentRecord = (row: any): BanesePaymentRecord => ({
  id: row.id,
  cliente_id: row.cliente_id,
  matricula_id: row.matricula_id,
  turma_id: row.turma_id,
  descricao: row.descricao,
  categoria: row.categoria,
  tipo_lancamento: row.tipo_lancamento,
  parcela_numero: row.parcela_numero,
  valor: row.valor,
  valor_pago: row.valor_pago,
  data_vencimento: row.data_vencimento,
  data_pagamento: row.data_pagamento,
  status: row.status,
  gateway_provider: row.gateway_provider,
  gateway_environment: row.gateway_environment,
  gateway_payment_method: row.gateway_payment_method,
  gateway_payment_id: row.gateway_payment_id,
  gateway_status: row.gateway_status,
  gateway_bank_slip_url: row.gateway_bank_slip_url,
  gateway_invoice_url: row.gateway_invoice_url,
  gateway_pix_payload: row.gateway_pix_payload,
  gateway_pix_encoded_image: row.gateway_pix_encoded_image,
  gateway_boleto_linha_digitavel: row.gateway_boleto_linha_digitavel,
  gateway_boleto_codigo_barras: row.gateway_boleto_codigo_barras,
  gateway_boleto_nosso_numero: row.gateway_boleto_nosso_numero,
  gateway_boleto_convenio: row.gateway_boleto_convenio,
  gateway_boleto_agencia: row.gateway_boleto_agencia,
  gateway_issuer_polo_id: row.gateway_issuer_polo_id,
  modalidade: row.turmas?.cursos?.modalidade,
  cursoNome: row.turmas?.cursos?.nome,
  turmaNome: row.turmas?.nome,
  chargeKind: chargeKindLabel(row),
  parceiros: row.parceiros,
});

export const gestorBanesePaymentService = {
  async getPaymentDetails(receivableId: string): Promise<BanesePaymentRecord[]> {
    const { data: selected, error: selectedError } = await supabase
      .from('contas_receber')
      .select(BANESE_PAYMENT_SELECT)
      .eq('id', receivableId)
      .eq('gateway_provider', 'banese_card')
      .eq('gateway_payment_method', 'BOLETO')
      .maybeSingle();

    if (selectedError) throw selectedError;
    if (!selected) throw new Error('Cobrança Banese não encontrada ou fora do seu escopo de acesso.');

    if (
      String(selected.tipo_lancamento || '').toUpperCase() !== 'PARCELA'
      || !selected.matricula_id
      || !selected.cliente_id
    ) {
      return [mapBanesePaymentRecord(selected)];
    }

    let groupQuery = supabase
      .from('contas_receber')
      .select(BANESE_PAYMENT_SELECT)
      .eq('cliente_id', selected.cliente_id)
      .eq('matricula_id', selected.matricula_id)
      .eq('gateway_provider', 'banese_card')
      .eq('gateway_payment_method', 'BOLETO')
      .eq('tipo_lancamento', 'PARCELA');

    groupQuery = selected.gateway_environment
      ? groupQuery.eq('gateway_environment', selected.gateway_environment)
      : groupQuery.is('gateway_environment', null);

    const { data: installments, error: installmentsError } = await groupQuery
      .order('parcela_numero', { ascending: true })
      .limit(30);

    if (installmentsError) throw installmentsError;
    return (installments?.length ? installments : [selected]).map(mapBanesePaymentRecord);
  },
};
